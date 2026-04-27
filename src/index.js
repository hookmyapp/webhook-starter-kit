import express from 'express';
import 'dotenv/config';
import { createHmac } from 'node:crypto';
import { createLogBuffer, mountLogs } from './logs.js';

const app = express();
app.use(express.json());

const logBuffer = createLogBuffer({ cap: 100 });
mountLogs(app, logBuffer);

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
if (!VERIFY_TOKEN) {
  console.error('VERIFY_TOKEN not set. Run: hookmyapp sandbox env --write .env');
  process.exit(1);
}
const PORT = process.env.PORT || 3000;

// Send a WhatsApp text message via sandbox proxy or production Meta API.
// Works identically with both -- just swap the three WHATSAPP_* env vars.
export async function sendMessage(to, text) {
  const url = `${process.env.WHATSAPP_API_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`WhatsApp API error ${res.status}: ${JSON.stringify(err)}`);
  }
  return res.json();
}

// Verification challenge -- when you configure your webhook URL in
// HookMyApp, it sends a GET request to verify you own the URL.
// Respond with the verify token to prove ownership.
app.get('/webhook', (req, res) => {
  res.send(VERIFY_TOKEN);
});

// Receive webhooks forwarded by HookMyApp
app.post('/webhook', async (req, res) => {
  const signature = req.get('X-HookMyApp-Signature-256');

  // Verify signature if present and VERIFY_TOKEN is configured
  if (VERIFY_TOKEN && signature) {
    const expectedSignature =
      'sha256=' +
      createHmac('sha256', VERIFY_TOKEN)
        .update(JSON.stringify(req.body))
        .digest('hex');

    if (signature !== expectedSignature) {
      console.warn('Invalid signature, rejecting webhook');
      return res.sendStatus(401);
    }
  }

  try {
    logBuffer.push({
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      receivedAt: new Date().toISOString(),
      method: req.method,
      path: '/webhook',
      headers: {
        'x-hookmyapp-signature-256':
          req.get('X-HookMyApp-Signature-256') ?? null,
        'content-type': req.get('Content-Type') ?? null,
        'user-agent': req.get('User-Agent') ?? null,
      },
      signatureValid: signature
        ? signature ===
          'sha256=' +
            createHmac('sha256', VERIFY_TOKEN)
              .update(JSON.stringify(req.body))
              .digest('hex')
        : null,
      byteSize: Buffer.byteLength(JSON.stringify(req.body)),
      rawBody: req.body,
    });
  } catch (err) {
    process.stderr.write(
      `logs buffer push failed (non-fatal): ${err.message}\n`,
    );
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

          // Auto-reply to confirm the connection is working.
          // Remove or customize this once you start building your own logic.
          if (type === 'text') {
            try {
              await sendMessage(
                from,
                `✅ Your webhook is connected! We received your message:\n\n"${text}"\n\nYou're all set to start building with HookMyApp.`,
              );
              console.log(`  Replied to ${from}`);
            } catch (err) {
              console.error(`  Failed to reply: ${err.message}`);
            }
          }
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
