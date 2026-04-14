# HookMyApp Webhook Starter Kit

A minimal Express.js starter for receiving WhatsApp webhooks via [HookMyApp](https://hookmyapp.com). This kit ships a verified-signature receiver, an auto-reply example, and a `sendMessage` helper that works identically against the free sandbox and the production Meta API.

## Quick start (CLI-first, ~2 minutes)

The HookMyApp CLI owns your sandbox session lifecycle — starting the tunnel, issuing env values, and sending test messages. You should not need to hand-copy secrets; the CLI is the single source of truth.

1. Install the HookMyApp CLI:

   ```
   npm install -g @gethookmyapp/cli
   ```

2. Log in and start a sandbox session (wizard auto-picks sandbox):

   ```
   hookmyapp login
   ```

   The wizard picks a workspace, prompts for a phone, and auto-chains into `hookmyapp sandbox listen`. Leave that terminal running — it forwards live webhooks through a Cloudflare tunnel to your local server.

3. Clone this repo and install:

   ```
   git clone https://github.com/hookmyapp/webhook-starter-kit.git
   cd webhook-starter-kit
   npm install
   ```

4. Pull your env values from the CLI:

   ```
   hookmyapp sandbox env --write .env
   ```

   (The CLI writes `VERIFY_TOKEN`, `PORT`, `WHATSAPP_API_URL`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` into `.env` — exactly the five keys in `.env.example`.)

5. Start the server:

   ```
   npm start
   ```

6. Test a message (optional):

   ```
   hookmyapp sandbox send --to +<your-other-phone> --message "hello"
   ```

   You should see the payload logged in the terminal running `npm start`, and receive an auto-reply back on WhatsApp confirming the webhook is wired up.

## Environment

The `.env.example` file lists the five keys the server expects — but you should not need to copy them manually. The CLI is the source of truth: run `hookmyapp sandbox env --write` after each new sandbox session and your `.env` stays in sync with the session's current secrets.

| Variable | Description |
|----------|-------------|
| `VERIFY_TOKEN` | Per-session HMAC secret. Used both as the webhook-verification response body and as the HMAC-SHA256 key for verifying incoming `X-HookMyApp-Signature-256` headers. The CLI pulls this from your active sandbox session. |
| `PORT` | Port the webhook server listens on. Default `3000`. |
| `WHATSAPP_API_URL` | API base URL. Sandbox: `https://sandbox.hookmyapp.com/v22.0`. Production: `https://graph.facebook.com/v22.0`. |
| `WHATSAPP_ACCESS_TOKEN` | Sandbox activation code (CLI-provided) or Meta access token in production. |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID from your sandbox session or Meta app. |

## How it works

```
WhatsApp user           Meta            HookMyApp           Your server
sends message  ──────>  Cloud API  ──>  Forwarder  ──────>  POST /
                        webhook         signs with          verifies
                                        HMAC-SHA256         signature
```

1. A WhatsApp user sends a message to your sandbox business number.
2. Meta's Cloud API delivers the webhook to HookMyApp's forwarder.
3. HookMyApp signs the payload with your session `VERIFY_TOKEN` (HMAC-SHA256) and forwards it through a Cloudflare tunnel to your local server.
4. Your server verifies the signature and processes the message.

The payload arrives in the **original Meta format** — HookMyApp does not transform the body. Use Meta's official WhatsApp Cloud API docs for the full payload schema.

### Verification challenge

When you first configure your webhook URL with HookMyApp (the CLI does this for you during `sandbox listen`), HookMyApp sends a `GET /` to your endpoint. Your server must respond with `VERIFY_TOKEN` as the entire response body. This kit handles that automatically in `src/index.js`.

### Signature verification

Every forwarded webhook includes an `X-HookMyApp-Signature-256` header set to `sha256={hex}` where the HMAC key is your `VERIFY_TOKEN`. This kit verifies the signature on every inbound POST and rejects mismatches with `401 Unauthorized`. Always verify signatures in production — without verification, anyone who discovers your webhook URL could POST fake payloads.

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

The `sendMessage` helper in `src/index.js` works identically against the sandbox and production Meta API — only the three `WHATSAPP_*` env values change.

```js
import { sendMessage } from './src/index.js';

await sendMessage('1234567890', 'Hello from my app!');
```

The echo-back example in `src/index.js` is enabled by default so you can verify the round-trip on your first inbound message. Delete or customise it once you start building your own logic.

## Going to production

When you're ready to move off the sandbox and onto a real WABA, swap the three `WHATSAPP_*` values to your production credentials and point `WHATSAPP_API_URL` at `https://graph.facebook.com/v22.0`. The webhook receiver, signature verification, and `sendMessage` helper all stay the same.

## Next steps

- **Add your business logic** — edit `src/index.js` to process incoming messages, send replies, or trigger workflows.
- **Deploy** — host this server on any platform (Railway, Render, Fly.io, AWS, etc.). Update your webhook URL via `hookmyapp webhook set` once deployed.
- **Read the docs** — visit [hookmyapp.com](https://hookmyapp.com) for full documentation.

## Links

- [HookMyApp](https://hookmyapp.com) — WhatsApp Business API integration platform
- [HookMyApp CLI](https://www.npmjs.com/package/@gethookmyapp/cli) — command-line tool for sandbox sessions, env values, and message sending

## License

MIT
