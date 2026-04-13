import express from 'express';
import 'dotenv/config';
import { createHmac } from 'node:crypto';

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'hookmyapp-verify';
const PORT = process.env.PORT || 3000;

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'running', service: 'webhook-starter-kit' });
});

// Verification challenge -- when you configure your webhook URL in
// HookMyApp, it sends a GET request to this endpoint. Your server must
// respond with the verify token as the body to prove you own this URL.
app.get('/webhook', (req, res) => {
  res.send(VERIFY_TOKEN);
});

// Receive webhooks forwarded by HookMyApp
app.post('/webhook', (req, res) => {
  const signature = req.get('X-HookMyApp-Signature-256');

  // Verify signature if present and VERIFY_TOKEN is configured
  if (VERIFY_TOKEN && signature) {
    const expectedSignature =
      'sha256=' +
      createHmac('sha256', VERIFY_TOKEN)
        .update(JSON.stringify(req.body))
        .digest('hex');

    if (signature !== expectedSignature) {
      console.warn('Invalid signature — rejecting webhook');
      return res.sendStatus(401);
    }
  }

  const { object, entry } = req.body;
  console.log(`\nWebhook received: ${object}`);

  // Process each entry
  for (const e of entry ?? []) {
    for (const change of e.changes ?? []) {
      console.log(`  Field: ${change.field}`);

      // Handle message webhooks specifically
      if (change.field === 'messages' && change.value?.messages) {
        for (const message of change.value.messages) {
          const from = message.from;
          const type = message.type;
          const text = type === 'text' ? message.text?.body : `[${type}]`;
          console.log(`  Message from ${from}: ${text}`);
        }
      } else {
        console.log(`  Data: ${JSON.stringify(change.value, null, 2)}`);
      }
    }
  }

  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Webhook server listening on port ${PORT}`);
});
