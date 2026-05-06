import express from 'express';
import 'dotenv/config';
import { createHmac } from 'node:crypto';
import { createLogBuffer, mountLogs } from './logs.js';
import { createChatBuffer, mountChat } from './chat.js';
import {
  loadState,
  saveState,
  getStep,
  advance,
  getStepMessage,
  TOTAL_STEPS,
} from './tutorial.js';

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

const TUTORIAL_STATE_PATH =
  process.env.TUTORIAL_STATE_PATH ||
  new URL('../.tutorial-state.json', import.meta.url).pathname;
const tutorialState = loadState(TUTORIAL_STATE_PATH);

// Reassigned in /chat wire-up (Task 15).
let chatBuffer = null;

// Wire up chat buffer (Task 15).
chatBuffer = createChatBuffer({ capPerPhone: 100 });
mountChat(app, chatBuffer, { sendMessage });

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

// Mark an inbound message as read. Drives the blue ✓✓ ticks tutorial
// step 3 calls out. Same auth / endpoint shape as sendMessage.
export async function markAsRead(messageId) {
  const url = `${process.env.WHATSAPP_API_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`WhatsApp API error ${res.status}: ${JSON.stringify(err)}`);
  }
  return res.json();
}

// Pure inbound-text handler. Takes the WhatsApp message + a context with
// injectable side-effects so it's unit-testable without booting Express.
// Returns { tutorialActive: boolean } so the caller decides whether to
// also fire the user's customized auto-reply.
export async function handleInbound(message, ctx) {
  const { sendMessage, markAsRead, port, chatPush } = ctx;
  const from = message.from;
  // Mark every inbound as read regardless of state.
  if (message.id) {
    try { await markAsRead(message.id); } catch (err) {
      process.stderr.write(`markAsRead failed (non-fatal): ${err.message}\n`);
    }
  }
  if (message.type === 'text' && chatPush) {
    // Meta's payload shape is `text: { body: '...' }` — extract the body
    // so /chat renders the string, not [object Object].
    const textBody = typeof message.text === 'string'
      ? message.text
      : (message.text?.body ?? '');
    chatPush({
      direction: 'in',
      from,
      to: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
      text: textBody,
      ts: new Date().toISOString(),
    });
  }
  if (message.type !== 'text') return { tutorialActive: false };
  const current = getStep(tutorialState, from);
  if (current < TOTAL_STEPS) {
    const next = advance(tutorialState, from);
    const body = getStepMessage(next, port);
    if (body) {
      try {
        await sendMessage(from, body);
        if (chatPush) {
          chatPush({
            direction: 'out',
            from: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
            to: from,
            text: body,
            ts: new Date().toISOString(),
          });
        }
      } catch (err) {
        process.stderr.write(`tutorial send failed (non-fatal): ${err.message}\n`);
      }
      try { saveState(TUTORIAL_STATE_PATH, tutorialState); } catch (err) {
        process.stderr.write(`tutorial save failed (non-fatal): ${err.message}\n`);
      }
    }
    return { tutorialActive: true };
  }
  return { tutorialActive: false };
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

          if (type === 'text') {
            const { tutorialActive } = await handleInbound(message, {
              sendMessage,
              markAsRead,
              port: boundPort ?? (Number(PORT) || 3000),
              chatPush: chatBuffer ? (e) => chatBuffer.push(e) : null,
            });
            if (!tutorialActive) {
              try {
                // CUSTOMIZE: change this auto-reply text to whatever you want
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
        }
      } else {
        console.log(`  Data: ${JSON.stringify(change.value, null, 2)}`);
      }
    }
  }

  res.json({ status: 'ok' });
});

export function listenWithFallback(targetApp, startPort) {
  const start = Number(startPort) || 3000;
  const max = start + 9;
  return new Promise((resolveBind, rejectBind) => {
    function attempt(port) {
      if (port > max) {
        rejectBind(
          new Error(
            `ports ${start}-${max} all in use; set PORT=<free-port> in .env`,
          ),
        );
        return;
      }
      const server = targetApp.listen(port, () => resolveBind(port));
      server.on('error', (err) => {
        if (err && err.code === 'EADDRINUSE') {
          try { server.close(); } catch { /* noop */ }
          attempt(port + 1);
          return;
        }
        rejectBind(err);
      });
    }
    attempt(start);
  });
}

// Bind the server. Templated into tutorial messages so the dev sees the
// real localhost URL, even when PORT was already taken.
export let boundPort = null;
if (process.env.NODE_ENV !== 'test') {
  listenWithFallback(app, Number(PORT) || 3000)
    .then((port) => {
      boundPort = port;
      console.log(`Webhook server listening on port ${port}`);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
