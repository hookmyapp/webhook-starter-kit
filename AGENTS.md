# AGENTS.md — AI Coding Agent Guide

You are an AI coding agent (Claude Code, Cursor, Codex, Gemini CLI, GitHub Copilot, etc.) helping a human wire this kit up. This file is the **single source of truth** for that work — it is self-contained and you do **not** need to fetch any external repo, skill, or docs site to follow it.

This kit is an **Express webhook receiver wired to `@gethookmyapp/cli`**. The CLI owns the sandbox session lifecycle, env values, and message sending; your code just receives the webhook and responds. Read this file end-to-end before suggesting any HookMyApp / WhatsApp Cloud API code, then drive the human through the quickstart.

## The 60-second mental model

- **What this kit is:** an Express server (`src/index.js`, `"type": "module"`, Node >= 18) on `PORT` (default `3000`) exposing `GET /webhook` (Meta-style verify challenge) and `POST /webhook` (signed inbound webhook receiver with an echo-back auto-reply).
- **What the CLI is:** `@gethookmyapp/cli` (npm, global install). It owns sandbox session lifecycle, env-key issuance, the inbound tunnel, and outbound message sending. Your code never calls the HookMyApp API directly.
- **What env is:** the server reads exactly five keys from `.env`. These are also what `hookmyapp sandbox env --write .env` writes:
  - `VERIFY_TOKEN` — per-session HMAC-SHA256 secret. Used both as the verify-challenge response body and as the HMAC key for `X-HookMyApp-Signature-256`.
  - `PORT` — port the Express server listens on (defaults to `3000` if absent).
  - `WHATSAPP_API_URL` — sandbox: `https://sandbox.hookmyapp.com/v22.0`. Production: `https://graph.facebook.com/v22.0`.
  - `WHATSAPP_ACCESS_TOKEN` — sandbox activation code (CLI-issued) or production Meta access token.
  - `WHATSAPP_PHONE_NUMBER_ID` — sandbox session phone or production Meta phone number ID.
- **Sandbox vs production:** sandbox is a shared HookMyApp WABA with no Meta paperwork; recipient is pinned server-side to the session phone and templates are blocked. Production is the user's own WABA via Meta embedded signup; templates work and any opted-in recipient is reachable. The five env keys above stay the same — only their values change.

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

> **HUMAN ACTION REQUIRED:** A browser tab opens for HookMyApp sign-in. The CLI polls for the callback and stores credentials in `~/.hookmyapp/`. Hand the terminal back to the human until they confirm sign-in completed.

### 3. Install kit dependencies

```bash
npm install
```

What this does: installs `express` and `dotenv` (declared in `package.json`).

### 4. Pull sandbox env values into `.env`

```bash
hookmyapp sandbox env --write .env
```

What this does: writes the five sandbox keys (`VERIFY_TOKEN`, `PORT`, `WHATSAPP_API_URL`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) into `.env` — the same keys listed in `.env.example`. The CLI is the source of truth; do not hand-edit values it produces.

### 5. Start the server

```bash
npm start
```

What this does: runs `node src/index.js`. The server listens on `localhost:3000/webhook` (or the `PORT` you set).

### 6. Open the sandbox tunnel (second terminal)

```bash
hookmyapp sandbox listen --phone +<E164>
```

What this does: opens a Cloudflare tunnel from a HookMyApp-managed public hostname to your local server. The CLI's defaults (`--port 3000 --path /webhook`) already match this kit out of the box, so no flags are needed for the common case.

### Optional: smoke a send

```bash
hookmyapp sandbox send --message "hello"
```

The sandbox pins the recipient to the session phone server-side — there is **no `--to` flag** and the sandbox proxy rejects any other destination. To verify inbound, send a WhatsApp message from the session phone to the sandbox business number; you should see the payload in the `npm start` terminal and an auto-reply on your phone.

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

### 3. Find the WABA ID

```bash
hookmyapp channels list
```

Note the `waba_id` — you will pass it to the next three commands.

### 4. Pull production env values

```bash
hookmyapp env <waba-id>
```

The output includes the production credentials. Map them into THIS kit's three runtime variables:

```bash
WHATSAPP_API_URL=https://graph.facebook.com/v22.0
WHATSAPP_ACCESS_TOKEN=<ACCESS_TOKEN from `hookmyapp env <waba-id>`>
WHATSAPP_PHONE_NUMBER_ID=<PHONE_NUMBER_ID from `hookmyapp env <waba-id>`>
```

`VERIFY_TOKEN` and `PORT` stay as configured. The kit code does not change between sandbox and production — only these three values flip.

### 5. Configure the production webhook URL

```bash
hookmyapp webhook set <waba-id> --url https://your-public-host.example.com/webhook --env production
```

> **HUMAN ACTION REQUIRED:** Confirm the URL with the human BEFORE running this. A typo silently drops inbound customer messages — the human's call, not yours.

### 6. Verify health

```bash
hookmyapp health <waba-id>
```

Phone numbers should be `VERIFIED`, webhook `verified: true`, quality `GREEN`.

## When to prompt the human

These operations cannot be automated. Stop and ask the human to do them:

- `hookmyapp login` — opens a browser sign-in tab.
- `hookmyapp channels connect` — Meta's embedded-signup popup.
- Confirming the URL before any `hookmyapp webhook set ... --env production` call.
- Rotating a leaked `WHATSAPP_ACCESS_TOKEN` — happens in the Meta App Dashboard, not via CLI.

## Safety rules

- **Never** paste output of `hookmyapp env <waba-id>` or `hookmyapp token <waba-id>` into chat, tickets, logs, commit messages, or PR descriptions. Redirect the human to a `.env` file or secret manager they control.
- **Never** run `hookmyapp workspace use` without confirming the target workspace ID with the human — wrong workspace means mutating the wrong WABA.
- **Never** run `hookmyapp webhook set ... --env production` without explicit human URL confirmation. A typo silently drops inbound customer messages.
- **Never** generate sandbox template-message examples — the sandbox proxy rejects templates and only `type: "text"` works in sandbox. Templates are production-only.
- **Never** hand-edit `.env` to bypass `hookmyapp sandbox env --write`. The CLI is the source of truth; manual values drift the moment the sandbox session rotates.

## Signature verification

Every inbound `POST /webhook` carries an `X-HookMyApp-Signature-256` header set to `sha256=<hex>` where the HMAC key is `VERIFY_TOKEN`. This kit's `src/index.js` uses the parsed-then-restringified body shape (because the kit ships with `express.json()` middleware). **Match this shape exactly when extending the kit — do not switch to a raw-body variant.**

```js
import { createHmac } from 'node:crypto';

function verifySignature(body, signature, verifyToken) {
  const expected =
    'sha256=' +
    createHmac('sha256', verifyToken).update(JSON.stringify(body)).digest('hex');
  return signature === expected;
}
```

Note: production deployments that point Meta's webhook at this kit will receive `X-Hub-Signature-256` keyed on Meta's `APP_SECRET` instead. This kit ships sandbox-shaped verification because that is what `hookmyapp sandbox listen` forwards. If you extend the kit for production, mirror the shape used by `src/index.js` (parsed body + `JSON.stringify`) for sandbox traffic and add a parallel `X-Hub-Signature-256` path keyed on `APP_SECRET` for direct Meta traffic.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Server logs `VERIFY_TOKEN not set` and exits | Run `hookmyapp sandbox env --write .env`, then `npm start`. |
| Webhook GET returns `404` | Ensure the server is running on `PORT` and the CLI is using `--path /webhook` (the default). |
| `Invalid signature — rejecting webhook` 401s in logs | `.env` is stale — sandbox session rotated. Re-run `hookmyapp sandbox env --write .env` and restart `npm start`. |
| `sandbox send` rejects recipient | Sandbox pins recipient to the session phone; no `--to` flag exists. Move to production for multi-recipient. |
| `channels connect` popup blocked | Allow popups from `app.hookmyapp.com`, or open the URL the CLI prints manually. |
| `401 invalid_token` from Meta in production | Re-run `hookmyapp token <waba-id>`; if it still fails, `hookmyapp channels connect` to re-mint. |

## Going further

- `hookmyapp <command> --help` — print full flags for any command.
- `hookmyapp --help` — full command surface (auth, workspace, channels, sandbox, webhook, env, token, health).
- Global flags worth knowing: `--json` (machine-readable output), `--workspace <id>`, `--env staging|production`, `--debug`.
- npm package: <https://www.npmjs.com/package/@gethookmyapp/cli>.
