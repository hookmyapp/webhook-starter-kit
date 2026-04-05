# HookMyApp Webhook Starter Kit

Receive WhatsApp Business API webhooks via [HookMyApp](https://hookmyapp.com) in minutes. This starter kit gives you a ready-to-run Express server that receives webhook payloads forwarded by HookMyApp, verifies their signatures, and logs incoming WhatsApp messages. Fork it, configure your verify token, and start building.

## Quick Start

1. **Create your repo** -- click **"Use this template"** on GitHub, or clone directly:
   ```bash
   git clone https://github.com/hookmyapp/webhook-starter-kit.git
   cd webhook-starter-kit
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set `VERIFY_TOKEN` to the same token you configured in your HookMyApp webhook settings.

4. **Start the server:**
   ```bash
   npm start
   ```
   Or use `npm run dev` for auto-reload during development.

Your webhook server is now running on `http://localhost:3000`.

## How It Works

HookMyApp's forwarder service proxies Meta WhatsApp Cloud API webhooks to your configured URL. When a WhatsApp message arrives, Meta sends it to HookMyApp, and HookMyApp forwards the payload to your server as a POST request.

The payload arrives in the original Meta format -- HookMyApp does not modify the webhook body. Each request includes an `X-HookMyApp-Signature-256` header containing an HMAC-SHA256 signature of the request body, computed using your verify token as the secret key. This lets you confirm the webhook genuinely came from HookMyApp.

There is no verification challenge (GET request) needed on your end -- HookMyApp handles Meta's subscription verification for you.

## Webhook Payload Format

Webhooks arrive as POST requests with the original Meta WhatsApp Cloud API format. Here is an example payload for a text message:

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "WABA_ID",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "1234567890",
              "phone_number_id": "PHONE_ID"
            },
            "messages": [
              {
                "from": "SENDER_PHONE",
                "id": "MSG_ID",
                "timestamp": "1234567890",
                "type": "text",
                "text": {
                  "body": "Hello!"
                }
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

## Signature Verification

Every webhook forwarded by HookMyApp includes an `X-HookMyApp-Signature-256` header. The value is `sha256=<hex-digest>`, where the digest is an HMAC-SHA256 hash of the JSON request body using your verify token as the key.

The starter kit verifies this signature automatically. If the signature does not match, the server responds with `401 Unauthorized`. This is optional but recommended for production use -- it ensures that only HookMyApp can send webhooks to your endpoint.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `VERIFY_TOKEN` | `hookmyapp-verify` | Your HookMyApp verify token. Must match the token set in your HookMyApp webhook configuration. |
| `PORT` | `3000` | Port the webhook server listens on. |

## Next Steps

- **Add your business logic** -- edit `src/index.js` to process incoming messages, send replies, or trigger workflows.
- **Get your credentials** -- run `hookmyapp env <waba-id>` to output your WABA_ID, ACCESS_TOKEN, and PHONE_NUMBER_ID.
- **Deploy** -- host this server on any platform (Railway, Render, Fly.io, AWS, etc.) and update your webhook URL in HookMyApp.
- **Read the docs** -- visit [hookmyapp.com](https://hookmyapp.com) for full documentation.

## Links

- [HookMyApp](https://hookmyapp.com) -- WhatsApp Business API integration platform
- [HookMyApp Agent Skills](https://github.com/hookmyapp/agent-skills) -- AI agent integration skill
- [HookMyApp CLI](https://www.npmjs.com/package/hookmyapp) -- Command-line tool for managing your HookMyApp workspace

## License

MIT
