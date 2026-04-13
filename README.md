# HookMyApp Webhook Starter Kit

Receive and send WhatsApp messages via [HookMyApp](https://hookmyapp.com) in minutes. This starter kit gives you a ready-to-run Express server that receives webhook payloads, verifies their signatures, and logs incoming WhatsApp messages -- with a built-in `sendMessage` function to reply. Start with the free sandbox (no Meta account needed), then swap three env vars to go to production.

## Quick Start

### 1. Clone the starter kit

```bash
git clone https://github.com/hookmyapp/webhook-starter-kit.git
cd webhook-starter-kit
npm install
cp .env.example .env
```

### 2. Get your sandbox credentials

Pick whichever method you prefer -- both give you the same `.env` values.

<details>
<summary><b>Option A: Dashboard</b> (visual)</summary>

1. Sign up at [hookmyapp.com](https://hookmyapp.com) and go to the **Sandbox** page.
2. Click **Add testing session** and enter your phone number.
3. Send the activation code to the sandbox WhatsApp number (the dashboard gives you a direct link).
4. Once activated, click the **Copy .env** button (clipboard icon) in the Actions column.
5. Paste into your `.env` file, replacing the placeholder values.

</details>

<details open>
<summary><b>Option B: CLI</b> (terminal)</summary>

```bash
npm install -g hookmyapp
hookmyapp login
```

> **Note:** `login` opens a browser window -- sign in or create an account, then return to the terminal.

```bash
hookmyapp sandbox start --phone <your-phone-number>
```

This prints:
1. A WhatsApp link to send the activation code -- **open it and send the message**.
2. Your `.env` values -- copy them into your `.env` file.

</details>

### 3. Start the server and tunnel

Open two terminals:

**Terminal 1** -- start the webhook server:
```bash
npm run dev
```

**Terminal 2** -- start the ngrok tunnel (reads `NGROK_DOMAIN` and `NGROK_AUTHTOKEN` from your `.env`):
```bash
npm run tunnel
```

### 4. Send a message

Send a WhatsApp message to the sandbox number. You should see it logged in Terminal 1, and get an auto-reply confirming your webhook is connected.

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

## Sending Messages

The starter kit includes a `sendMessage` function that works with both the **HookMyApp sandbox** and the **production Meta API**. The sandbox `.env` you copied from the dashboard already has everything configured -- just start sending.

### Usage

```js
import { sendMessage } from './src/index.js';

// Send a text message
await sendMessage('1234567890', 'Hello from my app!');
```

The echo-back example in `src/index.js` is commented out by default. Uncomment it to auto-reply to every incoming text message:

```js
if (type === 'text' && text) {
  await sendMessage(from, `Echo: ${text}`);
}
```

### Moving to production

When you're ready to go live, swap three env vars to point at Meta directly:

```bash
WHATSAPP_API_URL=https://graph.facebook.com/v22.0
WHATSAPP_ACCESS_TOKEN=your-meta-access-token
WHATSAPP_PHONE_NUMBER_ID=your-meta-phone-number-id
```

Get your production credentials with: `hookmyapp env <waba-id>`

Your code stays exactly the same -- only the env vars change.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `VERIFY_TOKEN` | `hookmyapp-verify` | Your HookMyApp verify token. Must match the token set in your HookMyApp webhook configuration. |
| `PORT` | `3000` | Port the webhook server listens on. |
| `WHATSAPP_API_URL` | `https://sandbox.hookmyapp.com/v22.0` | API base URL. Use `https://graph.facebook.com/v22.0` for production. |
| `WHATSAPP_ACCESS_TOKEN` | -- | Your sandbox activation code or Meta access token. |
| `WHATSAPP_PHONE_NUMBER_ID` | -- | Phone number ID from your sandbox session or Meta dashboard. |
| `NGROK_AUTHTOKEN` | -- | Ngrok auth token from your sandbox session. Used by `npm run tunnel`. |
| `NGROK_DOMAIN` | -- | Ngrok domain assigned to your sandbox session (e.g., `sandbox-xxx.ngrok-free.app`). Used by `npm run tunnel`. |

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
