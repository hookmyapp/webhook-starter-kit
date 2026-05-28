import express from 'express';
import 'dotenv/config';
import { createHmac } from 'node:crypto';
import { createLogBuffer, mountLogs } from './logs.js';
import { createChatBuffer, mountChat } from './chat.js';
import { loadState, saveState, getStep, advance, getStepMessage, TOTAL_STEPS } from './tutorial.js';
import * as whatsapp from './providers/whatsapp.js';
import * as instagram from './providers/instagram.js';

const PROVIDERS = { whatsapp, instagram };
// Preserve the existing shipped auto-reply copy verbatim (do not change user-facing text).
const AUTO_REPLY = (text) =>
  `✅ Your webhook is connected! We received your message:\n\n"${text}"\n\nYou're all set to start building with HookMyApp.`;

// Normalized inbound handler. ctx carries injectable side-effects + state so it
// is unit-testable and so WhatsApp/Instagram share one tutorial flow.
export async function handleInbound(message, ctx) {
  const { send, port, chatPush, selfId, tutorialState, tutorialStatePath } = ctx;
  const { from, text, provider } = message;
  if (chatPush) chatPush({ provider, direction: 'in', from, to: selfId ?? null, text, ts: new Date().toISOString() });
  // Key tutorial progress by (provider, from), same as the chat buffer, so a
  // WhatsApp phone and an Instagram IGSID that share a digit-string never collide.
  const tkey = `${provider}:${from}`;
  const current = getStep(tutorialState, tkey);
  if (current < TOTAL_STEPS) {
    const next = advance(tutorialState, tkey);
    const body = getStepMessage(next, port);
    if (body) {
      try {
        await send(from, body);
        if (chatPush) chatPush({ provider, direction: 'out', from: selfId ?? null, to: from, text: body, ts: new Date().toISOString() });
      } catch (err) { process.stderr.write(`tutorial send failed (non-fatal): ${err.message}\n`); }
      try { saveState(tutorialStatePath, tutorialState); } catch (err) { process.stderr.write(`tutorial save failed (non-fatal): ${err.message}\n`); }
    }
    return { tutorialActive: true };
  }
  return { tutorialActive: false };
}

export function createApp(opts = {}) {
  // Use hasOwn, not ??, so an explicit `verifyToken: null` forces skip-mode
  // (the tests rely on this) instead of falling back to process.env.
  const verifyToken = Object.hasOwn(opts, 'verifyToken') ? opts.verifyToken : (process.env.VERIFY_TOKEN || null);
  const senders = opts.senders ?? { whatsapp: whatsapp.send, instagram: instagram.send };
  const tutorialStatePath = opts.tutorialStatePath
    ?? process.env.TUTORIAL_STATE_PATH
    ?? new URL('../.tutorial-state.json', import.meta.url).pathname;
  const tutorialState = loadState(tutorialStatePath);

  const app = express();
  app.use(express.json());
  app.locals.boundPort = opts.port ?? (Number(process.env.PORT) || 3000); // updated after listen()

  const logBuffer = createLogBuffer({ cap: 100 });
  mountLogs(app, logBuffer);
  const chatBuffer = createChatBuffer({ capPerPhone: 100 });
  mountChat(app, chatBuffer, { senders });

  function verifyOk(req) {
    const signature = req.get('X-HookMyApp-Signature-256');
    if (!verifyToken || !signature) return true; // skip when unset (spec D2 + verified auth model)
    if (req.body === undefined || req.body === null) return false; // cannot verify a missing body when a token is required
    const expected = 'sha256=' + createHmac('sha256', verifyToken).update(JSON.stringify(req.body)).digest('hex');
    return signature === expected;
  }

  function mountWebhookRoute(routePath, providerName) {
    const provider = PROVIDERS[providerName];
    const send = senders[providerName];
    app.get(routePath, (req, res) => res.send(verifyToken || ''));
    app.post(routePath, async (req, res) => {
      if (!verifyOk(req)) { console.warn('Invalid signature, rejecting webhook'); return res.sendStatus(401); }
      try {
        logBuffer.push({
          id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          receivedAt: new Date().toISOString(), method: req.method, path: routePath,
          headers: {
            'x-hookmyapp-signature-256': req.get('X-HookMyApp-Signature-256') ?? null,
            'content-type': req.get('Content-Type') ?? null,
            'user-agent': req.get('User-Agent') ?? null,
          },
          byteSize: Buffer.byteLength(JSON.stringify(req.body)), rawBody: req.body,
        });
      } catch (err) { process.stderr.write(`logs buffer push failed (non-fatal): ${err.message}\n`); }
      for (const { from, text } of provider.parseInbound(req.body)) {
        const { tutorialActive } = await handleInbound(
          { from, text, provider: providerName },
          { send, port: app.locals.boundPort, chatPush: (e) => chatBuffer.push(e), selfId: provider.selfId(), tutorialState, tutorialStatePath },
        );
        if (!tutorialActive) {
          const reply = AUTO_REPLY(text);
          try {
            await send(from, reply);
            chatBuffer.push({ provider: providerName, direction: 'out', from: provider.selfId(), to: from, text: reply, ts: new Date().toISOString() });
          } catch (err) { console.error(`Failed to reply: ${err.message}`); }
        }
      }
      res.json({ status: 'ok' });
    });
  }
  mountWebhookRoute('/webhook/whatsapp', 'whatsapp');
  mountWebhookRoute('/webhook/instagram', 'instagram');

  return app;
}

// Boot warning replaces the old process.exit(1) startup guard (relaxed per spec D2).
if (!(process.env.VERIFY_TOKEN || null)) {
  console.warn('VERIFY_TOKEN is not set. Signature verification is DISABLED (local dev only). Run: hookmyapp sandbox env --write .env');
}

export const app = createApp();

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

if (process.env.NODE_ENV !== 'test') {
  listenWithFallback(app, Number(process.env.PORT) || 3000)
    .then((port) => {
      app.locals.boundPort = port;
      const base = `http://localhost:${port}`;
      console.log(`Webhook server listening on ${base}`);
      console.log(`  Chat:  ${base}/chat`);
      console.log(`  Logs:  ${base}/logs`);
    })
    .catch((err) => { console.error(err.message); process.exit(1); });
}
