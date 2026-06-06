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

test('GET /media/whatsapp/:id proxies bytes via the gateway resolve + download', async () => {
  const savedFetch = globalThis.fetch;
  const savedBase = process.env.WHATSAPP_API_URL;
  const savedTok = process.env.WHATSAPP_ACCESS_TOKEN;
  process.env.WHATSAPP_API_URL = 'https://gw.test/meta';
  process.env.WHATSAPP_ACCESS_TOKEN = 'hmat_test';
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url === 'https://gw.test/meta/MID123') {
      return Promise.resolve(new Response(JSON.stringify({ url: 'https://gw.test/media?token=zzz', mime_type: 'image/png' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    if (url === 'https://gw.test/media?token=zzz') {
      return Promise.resolve(new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } }));
    }
    return savedFetch(input, init); // local server request → real fetch
  };
  try {
    const app = createApp({ verifyToken: null, senders: fakeSenders([]) });
    const { s, base } = listen(app);
    const res = await fetch(`${base}/media/whatsapp/MID123`);
    const buf = Buffer.from(await res.arrayBuffer());
    s.close();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.deepEqual(buf, PNG);
  } finally {
    globalThis.fetch = savedFetch;
    if (savedBase === undefined) delete process.env.WHATSAPP_API_URL; else process.env.WHATSAPP_API_URL = savedBase;
    if (savedTok === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN; else process.env.WHATSAPP_ACCESS_TOKEN = savedTok;
  }
});

test('GET /media/whatsapp/:id returns 502 when the gateway lookup fails', async () => {
  const savedFetch = globalThis.fetch;
  const savedBase = process.env.WHATSAPP_API_URL;
  process.env.WHATSAPP_API_URL = 'https://gw.test/meta';
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.startsWith('https://gw.test/meta/')) {
      return Promise.resolve(new Response(JSON.stringify({ error: { message: 'gone' } }), { status: 404, headers: { 'content-type': 'application/json' } }));
    }
    return savedFetch(input, init);
  };
  try {
    const app = createApp({ verifyToken: null, senders: fakeSenders([]) });
    const { s, base } = listen(app);
    const res = await fetch(`${base}/media/whatsapp/NOPE`);
    s.close();
    assert.equal(res.status, 502);
  } finally {
    globalThis.fetch = savedFetch;
    if (savedBase === undefined) delete process.env.WHATSAPP_API_URL; else process.env.WHATSAPP_API_URL = savedBase;
  }
});
