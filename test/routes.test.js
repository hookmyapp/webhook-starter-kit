import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
// Set NODE_ENV BEFORE index.js evaluates, then import dynamically. A static
// `import` is hoisted and evaluated before this module's body runs, so it would
// let index.js auto-listen before the assignment takes effect.
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/index.js');

// Keep route tests fully offline. The inbound IG path calls
// provider.getUsername(), which fetches `<base>/<igUserId>?fields=username`.
// Intercept ONLY that lookup (URL carries `fields=username`) and return a
// deterministic username; delegate every other request (the tests' own
// POSTs/GETs to the local server) to the real fetch so the server still works.
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  if (url.includes('fields=username')) {
    return Promise.resolve(
      new Response(JSON.stringify({ username: 'ig_tester' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }
  return realFetch(input, init);
};

const fakeSenders = (calls) => ({
  whatsapp: async (to, text) => { calls.push(['whatsapp', to, text]); },
  instagram: async (to, text) => { calls.push(['instagram', to, text]); },
});
const listen = (app) => { const s = app.listen(0); return { s, base: `http://localhost:${s.address().port}` }; };
const IG_BODY = { object: 'instagram', entry: [{ messaging: [{ sender: { id: 'IGSID9' }, message: { mid: 'm', text: 'hi ig' } }] }] };
const WA_BODY = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { messages: [{ from: '15551230000', type: 'text', text: { body: 'hi wa' } }] } }] }] };
const post = (base, route, body, headers = {}) =>
  fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('GET /webhook/whatsapp echoes empty token when unset', async () => {
  const app = createApp({ verifyToken: null, senders: fakeSenders([]) });
  const { s, base } = listen(app);
  const res = await fetch(`${base}/webhook/whatsapp`);
  s.close();
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '');
});

test('POST /webhook/instagram accepts an IG webhook and does not auto-reply', async () => {
  const calls = [];
  const app = createApp({ verifyToken: null, senders: fakeSenders(calls) });
  const { s, base } = listen(app);
  const res = await post(base, '/webhook/instagram', IG_BODY);
  s.close();
  assert.equal(res.status, 200);
  assert.equal(calls.length, 0);
});

test('POST /webhook/whatsapp accepts a WA webhook and does not auto-reply', async () => {
  const calls = [];
  const app = createApp({ verifyToken: null, senders: fakeSenders(calls) });
  const { s, base } = listen(app);
  const res = await post(base, '/webhook/whatsapp', WA_BODY);
  s.close();
  assert.equal(res.status, 200);
  assert.equal(calls.length, 0);
});

test('POST is accepted unsigned when verifyToken is unset (skip path)', async () => {
  const app = createApp({ verifyToken: null, senders: fakeSenders([]) });
  const { s, base } = listen(app);
  const res = await post(base, '/webhook/instagram', IG_BODY);
  s.close();
  assert.equal(res.status, 200);
});

test('POST is 401 on signature mismatch when verifyToken is set', async () => {
  const app = createApp({ verifyToken: 'secret', senders: fakeSenders([]) });
  const { s, base } = listen(app);
  const res = await post(base, '/webhook/instagram', IG_BODY, { 'X-HookMyApp-Signature-256': 'sha256=deadbeef' });
  s.close();
  assert.equal(res.status, 401);
});

test('POST accepts a correct signature when verifyToken is set', async () => {
  const app = createApp({ verifyToken: 'secret', senders: fakeSenders([]) });
  const { s, base } = listen(app);
  const sig = 'sha256=' + createHmac('sha256', 'secret').update(JSON.stringify(IG_BODY)).digest('hex');
  const res = await post(base, '/webhook/instagram', IG_BODY, { 'X-HookMyApp-Signature-256': sig });
  s.close();
  assert.equal(res.status, 200);
});

test('POST is 401 (not 500) on a non-JSON body when verifyToken is set', async () => {
  const app = createApp({ verifyToken: 'secret', senders: fakeSenders([]) });
  const { s, base } = listen(app);
  const res = await fetch(`${base}/webhook/whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'X-HookMyApp-Signature-256': 'sha256=abc' },
    body: 'not json',
  });
  s.close();
  assert.equal(res.status, 401);
});
