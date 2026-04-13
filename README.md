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

```
WhatsApp user           Meta            HookMyApp           Your server
sends message  ──────>  Cloud API  ──>  Forwarder  ──────>  POST /webhook
                        webhook         signs with          verifies
                                        HMAC-SHA256         signature
```

1. A WhatsApp user sends a message to your business phone number.
2. Meta's Cloud API delivers the webhook event to HookMyApp's forwarder service.
3. HookMyApp signs the payload with your verify token (HMAC-SHA256) and forwards it to your configured webhook URL as a POST request.
4. Your server verifies the signature to confirm it came from HookMyApp, then processes the message.

The payload arrives in the **original Meta format** -- HookMyApp does not modify the webhook body. You can use Meta's official documentation for the full payload schema.

### Verification Challenge

When you configure your webhook URL in HookMyApp (via the dashboard or CLI), HookMyApp sends a **GET request** to your URL to verify you own it. Your server must respond with the **verify token as the entire response body**. If the token doesn't match, the webhook URL won't be saved.

```
HookMyApp                          Your server
GET /webhook  ──────────────────>  respond with verify token as body
              <──────────────────  "your-secret-token"
                                   ✓ URL verified, config saved
```

This starter kit handles the verification challenge automatically -- see the `GET /webhook` handler in `src/index.js`.

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

Every webhook forwarded by HookMyApp includes an `X-HookMyApp-Signature-256` header so you can verify the request genuinely came from HookMyApp and was not tampered with in transit. **Always verify signatures in production** -- without verification, anyone who discovers your webhook URL could send fake payloads to your server.

### How it works

1. When HookMyApp forwards a webhook to your endpoint, it computes an HMAC-SHA256 hash of the JSON request body using your **verify token** as the secret key.
2. The resulting signature is sent in the `X-HookMyApp-Signature-256` header, prefixed with `sha256=`.
3. Your server computes the same hash and compares it to the header value. If they match, the request is authentic.

The verify token is the shared secret between your server and HookMyApp -- it's the same value you set in your HookMyApp webhook configuration and in your server's `VERIFY_TOKEN` environment variable. Keep it secret.

### Verification example

This starter kit verifies signatures automatically in `src/index.js`. Here's the core logic if you're integrating into your own server:

**Node.js:**
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

// In your route handler:
const signature = req.get('X-HookMyApp-Signature-256');
if (!verifySignature(req.body, signature, process.env.VERIFY_TOKEN)) {
  return res.sendStatus(401); // Reject — not from HookMyApp
}
```

**Python:**
```python
import hmac
import hashlib
import json

def verify_signature(body: dict, signature: str, verify_token: str) -> bool:
    expected = 'sha256=' + hmac.new(
        verify_token.encode(),
        json.dumps(body, separators=(',', ':')).encode(),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
```

### What happens without verification

If you skip signature verification, your webhook endpoint is open to:

- **Spoofed webhooks** -- anyone can POST fake payloads to your URL, triggering unintended actions in your application.
- **Replay attacks** -- captured webhook payloads could be re-sent to your endpoint.

The starter kit rejects requests with invalid signatures by responding with `401 Unauthorized`.

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
