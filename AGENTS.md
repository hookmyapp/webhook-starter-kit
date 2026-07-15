# AGENTS.md — AI Coding Agent Guide

You are an AI coding agent (Claude Code, Cursor, Codex, Gemini CLI, GitHub Copilot, etc.) helping a human wire this kit up. This file is the **single source of truth** for that work — it is self-contained and you do **not** need to fetch any external repo, skill, or docs site to follow it.

This kit is an **Express webhook receiver wired to `@gethookmyapp/cli`**. The CLI owns the sandbox session lifecycle, env values, and message sending; your code just receives the webhook and responds. Read this file end-to-end before suggesting any HookMyApp / WhatsApp Cloud API code, then drive the human through the quickstart.

## The 60-second mental model

- **What this kit is:** an Express server (`src/index.js`, `"type": "module"`, Node >= 20) on `PORT` (default `3000`) exposing per-channel routes `GET|POST /webhook/whatsapp` and `GET|POST /webhook/instagram` (Meta-style verify challenge on GET, signed inbound receiver on POST). Inbound messages are recorded to the `/chat` and `/logs` views; the kit does not reply on its own — reply logic goes in the `// CUSTOMIZE` block of `handleInbound`.
- **What the CLI is:** `@gethookmyapp/cli` (npm, global install). It owns sandbox session lifecycle, env-key issuance, the inbound tunnel, and outbound message sending. Your code never calls the HookMyApp API directly.
- **What env is:** the server reads six keys from `.env`, written by both `hookmyapp sandbox env --write .env` and `hookmyapp channels env`:
  - `VERIFY_TOKEN` — the verify-challenge response body: the value your server echoes on the one-time verification GET. Nothing more. Written by both `sandbox env` and `channels env`; `sandbox webhook set` / `channels webhook set` run that GET against your URL.
  - `WEBHOOK_HMAC_SECRET` — the HMAC-SHA256 key for `X-HookMyApp-Signature-256`. Written by both `sandbox env` and `channels env`. As of v3 there is NO `VERIFY_TOKEN` fallback.
  - `PORT` — port the Express server listens on (defaults to `3000` if absent).
  - `META_GRAPH_API_URL` — Meta Graph API base URL. Sandbox: `https://sandbox.hookmyapp.com/v22.0`. Production: `https://graph.facebook.com/v24.0` (or whatever Graph version your channel is pinned to). Renamed from `WHATSAPP_API_URL` in v2.0.0 — the name now reflects that the Graph API is Meta-level, not WhatsApp-specific.
  - `WHATSAPP_ACCESS_TOKEN` — sandbox activation code (CLI-issued) or production Meta access token.
  - `WHATSAPP_PHONE_NUMBER_ID` — sandbox session phone or production Meta phone number ID.
- **Sandbox vs production:** sandbox is a shared HookMyApp WABA with no Meta paperwork; recipient is pinned server-side to the session phone and templates are blocked. Production is the user's own WABA via Meta embedded signup; templates work and any opted-in recipient is reachable. The env keys above stay the same — only their values change.

## Sandbox quickstart

Walk the human through these six steps in order. Surface every `> **HUMAN ACTION REQUIRED:**` block to them — those steps cannot be automated.

### 1. Install the CLI

```bash
npm install -g @gethookmyapp/cli
```

What this does: installs the `hookmyapp` binary globally so the rest of the steps work in any directory.

### 2. Log in

```bash
hookmyapp login
```

> **HUMAN ACTION REQUIRED:** A browser tab opens for HookMyApp sign-in. CLI polls for the callback and stores credentials locally (exact path is an implementation detail; don't script against it). Hand the terminal back to the human until they confirm sign-in completed.

**Alternative — zero-browser (for AI-paste / CI):**

```bash
hookmyapp login --code <bootstrap>
```

If the human already minted a bootstrap code from the HookMyApp dashboard (Settings → CLI → "Mint bootstrap code"), they can paste it into this flag and skip the browser tab entirely. The code is single-use and expires quickly; surface a `> **HUMAN ACTION REQUIRED:**` only to paste the code value.

### 3. Install kit dependencies

```bash
npm install
```

What this does: installs `express` and `dotenv` (declared in `package.json`).

### 4. Pull sandbox env values into `.env`

```bash
hookmyapp sandbox env --write .env
```

What this does: writes the six sandbox keys (`WEBHOOK_HMAC_SECRET`, `VERIFY_TOKEN`, `PORT`, `WHATSAPP_API_URL`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) into `.env` — the same keys listed in `.env.example`. The CLI is the source of truth; do not hand-edit values it produces.

### 5. Start the server

```bash
npm start
```

What this does: runs `node src/index.js`. The server listens on `localhost:3000` and serves `/webhook/whatsapp` and `/webhook/instagram` (or the `PORT` you set).

### 6. Open the sandbox tunnel (second terminal)

```bash
hookmyapp sandbox listen --phone +<E164>
```

What this does: opens a Cloudflare tunnel from a HookMyApp-managed public hostname to your local server. This kit serves per-channel routes, so select the one you are testing with `--path`: `--port 3000 --path /webhook/whatsapp` for WhatsApp or `--port 3000 --path /webhook/instagram` for Instagram. (The CLI's `--path` default is `/webhook`, which this kit does not serve, so the flag is required.)

### Optional: smoke a send

```bash
hookmyapp sandbox send --message "hello"
```

The sandbox pins the recipient to the session phone server-side — there is **no `--to` flag** and the sandbox proxy rejects any other destination. To verify inbound, send a WhatsApp message from the session phone to the sandbox business number; you should see the payload in the `npm start` terminal and the message at `/chat`. The kit does not reply on its own.

## Production setup

Follow these steps when the user is moving off sandbox onto a real WABA. Most steps are CLI; two require the human in a browser.

### 1. Pick or create a workspace

```bash
hookmyapp workspace list
hookmyapp workspace use <workspace-id>
# or:
hookmyapp workspace new "Acme Production"
```

### 2. Connect a WABA via Meta embedded signup

```bash
hookmyapp channels connect
```

> **HUMAN ACTION REQUIRED:** Meta's embedded-signup popup opens at `app.hookmyapp.com`. The human signs in to Facebook Business, picks (or creates) a WABA, picks a phone number, and grants the HookMyApp app access. If the popup is blocked, the CLI prints a URL to open manually.

### 3. Find the channel ID

```bash
hookmyapp channels list
```

Note the `channel_id` (e.g. `ch_xxxxxxxx`) — you will pass it to the next three commands. The CLI also accepts the channel's display phone number or name as the `<channel>` positional.

### 4. Pull production env values

```bash
hookmyapp channels env <channel> --write .env     # writes the channel's hmat_live_... gateway access token
```

`hookmyapp channels env <channel>` emits the keys needed (`WHATSAPP_*` + `HOOKMYAPP_CHANNEL_ID` + `VERIFY_TOKEN` + `WEBHOOK_HMAC_SECRET`). Credentials in your .env use the WHATSAPP_ prefix everywhere (kit, CLI, frontend download, docs). The kit code in `src/index.js` does NOT change between sandbox and production. Only these values flip.

**Gateway (recommended production path):** the kit is transport-agnostic — it only swaps the base URL plus the Bearer token, so the same code runs unchanged against the sandbox, the HookMyApp gateway, or direct Meta. Every channel gets its gateway access token automatically at connect; read it with `hookmyapp channels token <channel>` (rotate with `--rotate`) and set the base to the gateway:

- `META_GRAPH_API_URL=https://gateway.hookmyapp.com/meta/v22.0` — the gateway base; the kit appends `/{phone-number-id}/messages` verbatim. `channels env --write` writes this for you.
- `WHATSAPP_ACCESS_TOKEN=hmat_live_...` — the channel's gateway access token, sent as the Bearer token.
- `WHATSAPP_PHONE_NUMBER_ID` — the channel's phone number ID.

access tokens are **per-channel** (and scoped to that channel's phone number at the gateway): a WhatsApp channel's access token does not authorize an Instagram connection. For Instagram production, use the Instagram channel's own token and set `INSTAGRAM_GRAPH_API_URL=https://gateway.hookmyapp.com/meta/v25.0` with its own `hmat_live_...` token.

**Choose exactly one transport per channel.** The kit resolves the base as `*_API_URL ?? *_GRAPH_API_URL`, so a sandbox `WHATSAPP_API_URL` / `INSTAGRAM_API_URL` WINS over the gateway `*_GRAPH_API_URL` when both are set — the kit would silently keep hitting the sandbox with the minted `hmat_` access token, which the sandbox rejects. When moving to the gateway, comment out or remove the sandbox `*_API_URL` lines. See `.env.example` for the annotated block.

**Direct Meta** is also supported: point the base at `https://graph.facebook.com/v24.0` (or your channel's pinned Graph version) with a Meta access token. The receivers, signature verification, and `send` helpers are identical to the gateway path.

### 5. Configure the production webhook URL

```bash
hookmyapp channels webhook set <channel> \
  --url https://your-public-host.example.com/webhook/whatsapp \
  --verify-token <your-chosen-token>
```

Pick a strong random verify token (32+ chars) and pass it via `--verify-token`. This is only the handshake value your server echoes on the verification GET — the HMAC key for `X-HookMyApp-Signature-256` is the separate `WEBHOOK_HMAC_SECRET` that `hookmyapp channels env` writes (see Signature verification below). Omitting `--verify-token` leaves the prior token in place, which is desirable for URL-only rotation when you already have one.

> **HUMAN ACTION REQUIRED:** Confirm the URL with the human BEFORE running this. A typo silently drops inbound customer messages — the human's call, not yours.

### 6. Verify health

```bash
hookmyapp channels health <channel>
```

Phone numbers should be `VERIFIED`, webhook `verified: true`, quality `GREEN`.

## When to prompt the human

These operations cannot be automated. Stop and ask the human to do them:

- `hookmyapp login` — opens a browser sign-in tab.
- `hookmyapp channels connect` — Meta's embedded-signup popup.
- Confirming the URL before any `hookmyapp channels webhook set ...` call.
- Rotating a leaked `WHATSAPP_ACCESS_TOKEN` — happens in the Meta App Dashboard, not via CLI.

## Safety rules

- **Never** paste output of `hookmyapp channels env <channel>` or `hookmyapp channels token <channel>` into chat, tickets, logs, commit messages, or PR descriptions. Redirect the human to a `.env` file or secret manager they control.
- **Never** run `hookmyapp workspace use` without confirming the target workspace ID with the human — wrong workspace means mutating the wrong WABA.
- **Never** run `hookmyapp channels webhook set ...` without explicit human URL confirmation. A typo silently drops inbound customer messages.
- **Never** generate sandbox template-message examples — the sandbox proxy rejects templates and only `type: "text"` works in sandbox. Templates are production-only.
- **Never** hand-edit `.env` to bypass `hookmyapp sandbox env --write`. The CLI is the source of truth; manual values drift the moment the sandbox session rotates.

## /chat (local conversation viewer)

While the server is running, visit `http://localhost:3000/chat` (or whatever `PORT` you configured, noting port-fallback if 3000 is taken) in your browser. You will see a per-phone threaded view of inbound and outbound messages. The view is in-memory only and clears on restart.

Type into the bottom input and press Enter to send a message. This posts to `POST /chat/send`, which calls `sendMessage` with your credentials. The view mirrors the styling and server-sent events (SSE) retry behavior of the `/logs` surface.

## Signature verification

Every inbound `POST /webhook/whatsapp` or `POST /webhook/instagram` from HookMyApp, in both sandbox and production, carries an `X-HookMyApp-Signature-256` header set to `sha256=<hex>` where the HMAC key is your `WEBHOOK_HMAC_SECRET`. As of v3 there is no `VERIFY_TOKEN` fallback. HookMyApp's forwarder signs every outbound request this way; the customer-facing contract is a single shape, not two.

This kit's `src/index.js` uses the parsed-then-restringified body shape because the kit ships with `express.json()` middleware. The forwarder signs `JSON.stringify(parsedBody)` on its side, and V8's `JSON.stringify` is deterministic, so parsed+restringified on your side is byte-equivalent to raw.

```js
import { createHmac } from 'node:crypto';

// hmacSecret = process.env.WEBHOOK_HMAC_SECRET
function verifySignature(body, signature, hmacSecret) {
  const expected =
    'sha256=' +
    createHmac('sha256', hmacSecret).update(JSON.stringify(body)).digest('hex');
  return signature === expected;
}
```

If you extend the kit and swap `express.json()` for `express.raw({ type: 'application/json' })`, update `.update(JSON.stringify(body))` to `.update(rawBody)` — the signature still matches because the forwarder sent the same bytes. What you must NOT do is mix the two (e.g., keep `express.json()` but hash the stringified representation of a manually re-encoded object with different whitespace) — that will break verification.

> **Note:** Earlier versions of this guide and the HookMyApp skill mentioned a separate `X-Hub-Signature-256` path keyed on Meta's `APP_SECRET` for production. That path does **not** exist on the customer-facing interface — the forwarder verifies Meta's signature internally and re-signs with your `WEBHOOK_HMAC_SECRET` before forwarding. Do not wire an `APP_SECRET` verification branch on your server.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Server warns `WEBHOOK_HMAC_SECRET not set` at boot (signature verification disabled) | Run `hookmyapp sandbox env --write .env` (or `hookmyapp channels env <channel> --write .env`), then restart `npm start`. A `.env` from before v3 that only carries `VERIFY_TOKEN` no longer feeds signature verification — re-pull env with the CLI. The server keeps running without a secret — that mode is local-dev only. |
| Webhook GET returns `404` | Ensure the server is running on `PORT` and the CLI's `--path` matches a served route (`/webhook/whatsapp` or `/webhook/instagram`). |
| `Invalid signature — rejecting webhook` 401s in logs | `.env` is stale — sandbox session rotated. Re-run `hookmyapp sandbox env --write .env` and restart `npm start`. |
| `sandbox send` rejects recipient | Sandbox pins recipient to the session phone; no `--to` flag exists. Move to production for multi-recipient. |
| `channels connect` popup blocked | Allow popups from `app.hookmyapp.com`, or open the URL the CLI prints manually. |
| `401 invalid_token` from Meta in production | Re-run `hookmyapp channels token <channel>`; if it still fails, `hookmyapp channels connect` to re-mint. |
| Server logs show inbound webhooks but no request bodies | Re-run `hookmyapp sandbox listen --verbose` to stream full request/response bodies in the CLI terminal. |
| `sandbox listen: tunnel closed` / cloudflared errors | Re-run with `hookmyapp sandbox listen --reinstall-tunnel-binary` to force-redownload the cloudflared binary. Then check outbound 443 to `*.trycloudflare.com` isn't firewalled. |

## Going further

- `hookmyapp <command> --help` — print full flags for any command.
- `hookmyapp --help` — full command surface (login, logout, workspace, channels, sandbox, billing, config). Channel-scoped operations live under `hookmyapp channels` (`env`, `token`, `health`, `webhook set`).
- Global flags worth knowing: `--json` (machine-readable output), `--workspace <name|slug|id>`, `--debug`.
- npm package: <https://www.npmjs.com/package/@gethookmyapp/cli>.
