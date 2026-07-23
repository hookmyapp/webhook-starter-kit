import express from 'express';
import 'dotenv/config';
import { createHmac } from 'node:crypto';
import { createLogBuffer, mountLogs } from './logs.js';
import { createChatBuffer, mountChat } from './chat.js';
import { createCommentBuffer, mountComments } from './comments.js';
import { mountPublish } from './publish.js';
import { mountInsights } from './insights.js';
import * as whatsapp from './providers/whatsapp.js';
import * as instagram from './providers/instagram.js';

const PROVIDERS = { whatsapp, instagram };

// Normalized inbound handler. ctx carries injectable side-effects so it is
// unit-testable and so WhatsApp/Instagram share one inbound flow.
//
// Out of the box this kit only RECORDS inbound messages — they show up at
// /chat and /logs, and nothing is sent back. To make it reply, uncomment and
// edit the CUSTOMIZE block below (`send` and `selfId` come from ctx).
export async function handleInbound(message, ctx) {
  const { send, chatPush, selfId } = ctx;
  const { from, text, media, provider, username } = message;
  if (chatPush) chatPush({ provider, direction: 'in', from, to: selfId ?? null, text, media: media ?? null, ts: new Date().toISOString(), username: username ?? null });

  // CUSTOMIZE: reply to the sender. Uncomment and edit:
  //
  //   const reply = `You said: ${text}`;
  //   await send(from, reply);
  //   if (chatPush) chatPush({ provider, direction: 'out', from: selfId ?? null, to: from, text: reply, ts: new Date().toISOString(), username: username ?? null });
  void send; // kept in scope for the CUSTOMIZE block above
}

export function createApp(opts = {}) {
  // Use hasOwn, not ??, so an explicit `verifyToken: null` forces an empty
  // verify-GET echo (the tests rely on this) instead of falling back to
  // process.env. VERIFY_TOKEN is ONLY the verify-GET handshake body.
  const verifyToken = Object.hasOwn(opts, 'verifyToken') ? opts.verifyToken : (process.env.VERIFY_TOKEN || null);
  // Signing key for X-HookMyApp-Signature-256. v3 (breaking): no VERIFY_TOKEN
  // fallback — the CLI exports the signing secret as WEBHOOK_HMAC_SECRET from
  // both `hookmyapp sandbox env` and `hookmyapp channels env`.
  const hmacSecret = Object.hasOwn(opts, 'hmacSecret')
    ? opts.hmacSecret
    : (process.env.WEBHOOK_HMAC_SECRET || null);
  const senders = opts.senders ?? { whatsapp: whatsapp.send, instagram: instagram.send };

  const app = express();
  app.use(express.json());
  app.locals.boundPort = opts.port ?? (Number(process.env.PORT) || 3000); // updated after listen()

  const logBuffer = createLogBuffer({ cap: 100 });
  mountLogs(app, logBuffer);
  const chatBuffer = createChatBuffer({ capPerPhone: 100 });
  mountChat(app, chatBuffer, { senders });
  const commentBuffer = createCommentBuffer();
  mountComments(app, commentBuffer, { reply: instagram.replyToComment });
  mountPublish(app, { publish: instagram.publishPhoto });
  mountInsights(app, { insights: instagram.getInsights });

  // Best-effort IG username resolution for /chat labels. Cached per-app so we
  // do not re-fetch on every inbound from the same sender. Non-fatal: a failed
  // lookup just leaves the raw IGSID label.
  const usernameCache = new Map();
  async function resolveUsername(providerName, provider, id) {
    if (providerName !== 'instagram' || typeof provider.getUsername !== 'function' || !id) return null;
    if (usernameCache.has(id)) return usernameCache.get(id);
    let username = null;
    try { username = await provider.getUsername(id); }
    catch (err) { process.stderr.write(`username lookup failed (non-fatal): ${err.message}\n`); }
    usernameCache.set(id, username);
    return username;
  }

  function verifyOk(req) {
    const signature = req.get('X-HookMyApp-Signature-256');
    if (!hmacSecret || !signature) return true; // skip when unset (spec D2 + verified auth model)
    if (req.body === undefined || req.body === null) return false; // cannot verify a missing body when a secret is required
    const expected = 'sha256=' + createHmac('sha256', hmacSecret).update(JSON.stringify(req.body)).digest('hex');
    return signature === expected;
  }

  function mountWebhookRoute(routePath, providerName) {
    const provider = PROVIDERS[providerName];
    const send = senders[providerName];
    app.get(routePath, (req, res) => res.send(verifyToken || ''));
    app.post(routePath, async (req, res) => {
      // true = signature present and verified; undefined = nothing to verify
      // (no secret configured or unsigned request) → /logs renders "Unsigned".
      // Failed verification never reaches the log — it 401s right here.
      const signatureValid = (hmacSecret && req.get('X-HookMyApp-Signature-256')) ? true : undefined;
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
          signatureValid,
        });
      } catch (err) { process.stderr.write(`logs buffer push failed (non-fatal): ${err.message}\n`); }
      for (const { from, text, media } of provider.parseInbound(req.body)) {
        const username = await resolveUsername(providerName, provider, from);
        await handleInbound(
          { from, text, media, provider: providerName, username },
          { send, chatPush: (e) => chatBuffer.push(e), selfId: provider.selfId() },
        );
      }
      // Instagram comments arrive separately from the messaging events above —
      // as entry[].changes[] (field 'comments') or a flat entry[].field/value.
      // Record each for the /comments inbox.
      if (typeof provider.parseComments === 'function') {
        for (const c of provider.parseComments(req.body)) {
          commentBuffer.push({ direction: 'in', ...c, ts: new Date().toISOString() });
        }
      }
      res.json({ status: 'ok' });
    });
  }
  mountWebhookRoute('/webhook/whatsapp', 'whatsapp');
  mountWebhookRoute('/webhook/instagram', 'instagram');

  // Media proxy: WhatsApp media arrives as an id that needs token-authed
  // resolution + download through the gateway, so the browser can't load it
  // directly. /chat points <img>/<video> at this route, which resolves the
  // gateway-signed URL and streams the bytes back. (Instagram media is a
  // directly-loadable lookaside URL, so it needs no proxy.)
  app.get('/media/whatsapp/:id', async (req, res) => {
    try {
      const { buffer, mime } = await whatsapp.fetchMedia(req.params.id);
      res.set('Content-Type', mime);
      res.set('Cache-Control', 'private, max-age=86400');
      res.send(buffer);
    } catch (err) {
      process.stderr.write(`media proxy failed (non-fatal): ${err.message}\n`);
      res.sendStatus(502);
    }
  });

  return app;
}

// Boot warning replaces the old process.exit(1) startup guard (relaxed per spec D2).
if (!process.env.WEBHOOK_HMAC_SECRET) {
  console.warn('WEBHOOK_HMAC_SECRET not set. Signature verification is DISABLED (local dev only). v3 no longer falls back to VERIFY_TOKEN. Run: hookmyapp sandbox env --write .env (or channels env for your own number)');
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
