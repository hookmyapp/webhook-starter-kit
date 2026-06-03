# HookMyApp Webhook Starter Kit

A minimal Express.js starter for receiving WhatsApp and Instagram webhooks via [HookMyApp](https://hookmyapp.com). This kit ships verified-signature receivers for both channels, a local conversation viewer, and per-channel `send` helpers that work identically against the free sandbox and the production Meta API. Inbound messages are recorded (visible at `/chat` and `/logs`); replying is left to you via the `// CUSTOMIZE` hook in `src/index.js`.

## For AI Agents

If you're using an AI coding agent (Claude Code, Cursor, Codex, Gemini CLI, GitHub Copilot, etc.) to wire this kit up, read [AGENTS.md](./AGENTS.md) first. It is the self-contained guide your agent should follow, covering the sandbox quickstart, production setup, signature verification, the steps that need your manual confirmation, and safety rules around credentials. The tool-specific files (`CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.github/copilot-instructions.md`) are thin redirects that point your agent at AGENTS.md automatically.

## Quick start (CLI-first, ~2 minutes)

The HookMyApp CLI owns your sandbox session lifecycle: starting the tunnel, issuing env values, and sending test messages. You should not need to hand-copy secrets; the CLI is the single source of truth.

1. Install the HookMyApp CLI:

   ```
   npm install -g @gethookmyapp/cli
   ```

2. Log in:

   ```
   hookmyapp login
   ```

   This authenticates you and selects your workspace. It does not start a sandbox session on its own.

3. Bind a sandbox session:

   ```
   hookmyapp sandbox start
   ```

   Pick WhatsApp (or Instagram), then send the printed code to the sandbox number from the phone (or DM the sandbox account) you want to bind. Scan the QR or open the link. Once bound, the session is active and its secrets become available to the next step.

4. Clone this repo and install:

   ```
   git clone https://github.com/hookmyapp/webhook-starter-kit.git
   cd webhook-starter-kit
   npm install
   ```

5. Pull your env values from the CLI:

   ```
   hookmyapp sandbox env --write .env
   ```

   (For a WhatsApp session the CLI writes `VERIFY_TOKEN`, `PORT`, `WHATSAPP_API_URL`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`. For an Instagram session it writes the `INSTAGRAM_*` keys instead. See `.env.example` for both blocks.)

6. Start the server:

   ```
   npm start
   ```

7. Open the tunnel in a second terminal:

   ```
   hookmyapp sandbox listen --port 3000 --path /webhook/whatsapp
   ```

   (Use `--path /webhook/instagram` for an Instagram session. The kit serves one route per channel, so the tunnel must target the matching path.) Leave this running. It forwards live webhooks through a Cloudflare tunnel to your local server.

8. Test a message (optional):

   ```
   hookmyapp sandbox send --message "hello"
   ```

   (Sandbox replies only to the session phone. You'll receive this on the phone you used to start the session. No `--to` flag exists.)

   You should see the payload logged in the terminal running `npm start`, and the message appear at `http://localhost:3000/chat`. The kit does not reply on its own — add your own reply logic at the `// CUSTOMIZE` hook in `src/index.js`.

### Pull credentials for a real channel

After you've connected a WhatsApp number through HookMyApp:

```bash
hookmyapp channels list                                # find your channel ID
hookmyapp channels env ch_xxxxxxxx --write .env        # writes WHATSAPP_* + HOOKMYAPP_CHANNEL_ID + VERIFY_TOKEN
```

The CLI accepts the channel's display phone number or name too:

```bash
hookmyapp channels env "+972 55-727-7945" --write .env
hookmyapp channels env "tomer office" --write .env
```

## Environment

The `.env.example` file lists the keys the server expects, but you should not need to copy them manually. The CLI is the source of truth: run `hookmyapp sandbox env --write` after each new sandbox session and your `.env` stays in sync with the session's current secrets.

| Variable | Description |
|----------|-------------|
| `VERIFY_TOKEN` | Per-session HMAC secret. Used both as the webhook-verification response body and as the HMAC-SHA256 key for verifying incoming `X-HookMyApp-Signature-256` headers. The CLI pulls this from your active sandbox session. |
| `PORT` | Port the webhook server listens on. Default `3000`. |
| `WHATSAPP_API_URL` | WhatsApp Graph API base URL. Sandbox: `https://sandbox.hookmyapp.com/v22.0`. Production `channels env` writes this as `META_GRAPH_API_URL`; the kit reads either. |
| `WHATSAPP_ACCESS_TOKEN` | Sandbox activation code (CLI-provided) or Meta access token in production. |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID from your sandbox session or Meta app. |
| `INSTAGRAM_API_URL` | Instagram Graph API base URL. Sandbox `sandbox env` writes this. A real Instagram channel's `channels env` writes it as `INSTAGRAM_GRAPH_API_URL`; the kit reads either. |
| `INSTAGRAM_ACCESS_TOKEN` | Sandbox activation code (CLI-provided) or Meta access token for Instagram. |
| `INSTAGRAM_ACCOUNT_ID` | Instagram account ID the kit sends from. A real Instagram channel's `channels env` writes this as `INSTAGRAM_USER_ID`; the kit reads either. |

## How it works

```
WhatsApp user           Meta            HookMyApp           Your server
sends message  ──────>  Cloud API  ──>  Forwarder  ──────>  POST /webhook/whatsapp
                        webhook         signs with          verifies
                                        HMAC-SHA256         signature
```

1. A WhatsApp user sends a message to your sandbox business number.
2. Meta's Cloud API delivers the webhook to HookMyApp's forwarder.
3. HookMyApp signs the payload with your session `VERIFY_TOKEN` (HMAC-SHA256) and forwards it through a Cloudflare tunnel to your local server.
4. Your server verifies the signature and processes the message.

Instagram works the same way through `POST /webhook/instagram`. The kit serves both routes at once.

The payload arrives in the **original Meta format**. HookMyApp does not transform the body. Use Meta's official WhatsApp Cloud API docs for the full payload schema.

### Verification challenge

When you register your own public webhook URL with `hookmyapp channels webhook set <channel> --url ...`, HookMyApp sends a one-time `GET /webhook/whatsapp` (or `/webhook/instagram`) to that URL. Your server must respond with `VERIFY_TOKEN` as the entire response body. This kit handles that automatically in `src/index.js`. The sandbox `listen` tunnel does not issue this GET; it only forwards live POSTs from the forwarder to your local routes.

### Signature verification

Every forwarded webhook includes an `X-HookMyApp-Signature-256` header set to `sha256={hex}` where the HMAC key is your `VERIFY_TOKEN`. This kit verifies the signature on every inbound POST and rejects mismatches with `401 Unauthorized`. Always verify signatures in production. Without verification, anyone who discovers your webhook URL could POST fake payloads.

The core verification logic (see `src/index.js`):

```js
import { createHmac } from 'node:crypto';

function verifySignature(body, signature, verifyToken) {
  const expected =
    'sha256=' +
    createHmac('sha256', verifyToken)
      .update(JSON.stringify(body))
      .digest('hex');
  return signature === expected;
}
```

## Sending messages

Each provider module exports a `send(to, text)` helper that works identically against the sandbox and production Meta API. Only the channel's env values change.

```js
import { send as sendWhatsApp } from './src/providers/whatsapp.js';
import { send as sendInstagram } from './src/providers/instagram.js';

await sendWhatsApp('1234567890', 'Hello from my app!');
await sendInstagram('INSTAGRAM_SCOPED_ID', 'Hello from my app!');
```

The kit does not reply to inbound messages by default — it just records them (see `/chat` and `/logs`). To send a reply, fill in the `// CUSTOMIZE` block in `src/index.js`'s `handleInbound` using the `send` helper.

## Going to production

When you're ready to move off the sandbox and onto a real WABA, swap the `WHATSAPP_*` values to your production credentials. The dashboard's Copy/Download Credentials buttons emit the current Graph version URL, so use that value for `WHATSAPP_API_URL`. The webhook receivers, signature verification, and per-channel `send` helpers all stay the same.

## WhatsApp and Instagram

The kit serves two routes, one per channel:

- `POST /webhook/whatsapp`
- `POST /webhook/instagram`

Point each channel at its route. With the CLI tunnel:

    hookmyapp sandbox listen --port 3000 --path /webhook/whatsapp
    hookmyapp sandbox listen --port 3000 --path /webhook/instagram

Or with your own URL:

    hookmyapp channels webhook set <wa-channel> --url https://YOUR_HOST/webhook/whatsapp
    hookmyapp channels webhook set <ig-channel> --url https://YOUR_HOST/webhook/instagram

Signature verification uses `VERIFY_TOKEN`. In production set the same verify token on both channels so both routes verify. To exercise both channels at once against the sandbox, leave `VERIFY_TOKEN` blank so verification is skipped (local dev only): two sandbox sessions have two different secrets and one token cannot verify both.

## Logs UI

While the server is running, visit `http://localhost:3000/logs` (or whatever `PORT` you configured) in your browser to see incoming webhooks live. Toggle between Compact (one row per webhook) and Verbose (full headers and payload) with the header toggle or by pressing `v`. An All / WhatsApp / Instagram filter next to the toggle narrows the stream to one channel. Press `c` to clear the on-screen log. Buffer is in-memory only and capped at the last 100 webhooks.

## /chat (local conversation viewer)

While the server is running, visit `http://localhost:3000/chat` (or whatever `PORT` you configured, noting port-fallback if 3000 is taken) in your browser. You will see a per-conversation threaded view (one thread per channel and participant) of inbound and outbound messages. The view is in-memory only and clears on restart.

An All / WhatsApp / Instagram filter at the top of the sidebar narrows the conversation list to one channel. Instagram threads are labeled by the sender's `@username` when the kit can resolve it (it falls back to the raw Instagram-scoped id otherwise). WhatsApp threads are labeled by the formatted phone number.

Type into the bottom input and press Enter to send a message. This posts to `POST /chat/send`, which dispatches to the selected channel's `send` helper. The view mirrors the styling and server-sent events (SSE) retry behavior of the `/logs` surface.

## Quickstart

1. Install the HookMyApp CLI: `npm install -g @gethookmyapp/cli`
2. Log in and bind a session: `hookmyapp login` then `hookmyapp sandbox start`
3. Pull sandbox env: `hookmyapp sandbox env --write .env`
4. Start the server: `npm run dev`
5. Open the tunnel (second terminal): `hookmyapp sandbox listen --path /webhook/whatsapp`
6. Send "hi" to your sandbox number from your phone, then follow the on-screen prompts.

## Next steps

- **Add your business logic**: edit `src/index.js` to process incoming messages, send replies, or trigger workflows.
- **Deploy**: host this server on any platform (Railway, Render, Fly.io, AWS, etc.). Update your webhook URL via `hookmyapp channels webhook set <channel> --url https://YOUR_HOST/webhook/whatsapp` once deployed.
- **Read the docs**: visit [hookmyapp.com](https://hookmyapp.com) for full documentation.

## Links

- [HookMyApp](https://hookmyapp.com): WhatsApp Business API integration platform
- [HookMyApp CLI](https://www.npmjs.com/package/@gethookmyapp/cli): command-line tool for sandbox sessions, env values, and message sending

## License

MIT
