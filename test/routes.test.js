import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
// Set NODE_ENV BEFORE index.js evaluates, then import dynamically. A static
// `import` is hoisted and evaluated before this module's body runs, so it would
// let index.js auto-listen before the assignment takes effect.
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/index.js');

const tmpState = () => path.join(os.tmpdir(), `kit-routes-${Math.random().toString(36).slice(2)}.json`);
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
  const app = createApp({ verifyToken: null, senders: fakeSenders([]), tutorialStatePath: tmpState() });
  const { s, base } = listen(app);
  const res = await fetch(`${base}/webhook/whatsapp`);
  s.close();
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '');
});

test('POST /webhook/instagram parses IG and dispatches to the instagram sender only', async () => {
  const calls = [];
  const app = createApp({ verifyToken: null, senders: fakeSenders(calls), tutorialStatePath: tmpState() });
  const { s, base } = listen(app);
  const res = await post(base, '/webhook/instagram', IG_BODY);
  s.close();
  assert.equal(res.status, 200);
  assert.ok(calls.length >= 1);
  assert.ok(calls.every(([p, to]) => p === 'instagram' && to === 'IGSID9'));
});

test('POST /webhook/whatsapp dispatches to the whatsapp sender only', async () => {
  const calls = [];
  const app = createApp({ verifyToken: null, senders: fakeSenders(calls), tutorialStatePath: tmpState() });
  const { s, base } = listen(app);
  await post(base, '/webhook/whatsapp', WA_BODY);
  s.close();
  assert.ok(calls.length >= 1);
  assert.ok(calls.every(([p, to]) => p === 'whatsapp' && to === '15551230000'));
});

test('POST is accepted unsigned when verifyToken is unset (skip path)', async () => {
  const app = createApp({ verifyToken: null, senders: fakeSenders([]), tutorialStatePath: tmpState() });
  const { s, base } = listen(app);
  const res = await post(base, '/webhook/instagram', IG_BODY);
  s.close();
  assert.equal(res.status, 200);
});

test('POST is 401 on signature mismatch when verifyToken is set', async () => {
  const app = createApp({ verifyToken: 'secret', senders: fakeSenders([]), tutorialStatePath: tmpState() });
  const { s, base } = listen(app);
  const res = await post(base, '/webhook/instagram', IG_BODY, { 'X-HookMyApp-Signature-256': 'sha256=deadbeef' });
  s.close();
  assert.equal(res.status, 401);
});

test('POST accepts a correct signature when verifyToken is set', async () => {
  const calls = [];
  const app = createApp({ verifyToken: 'secret', senders: fakeSenders(calls), tutorialStatePath: tmpState() });
  const { s, base } = listen(app);
  const sig = 'sha256=' + createHmac('sha256', 'secret').update(JSON.stringify(IG_BODY)).digest('hex');
  const res = await post(base, '/webhook/instagram', IG_BODY, { 'X-HookMyApp-Signature-256': sig });
  s.close();
  assert.equal(res.status, 200);
  assert.ok(calls.length >= 1);
});

test('POST is 401 (not 500) on a non-JSON body when verifyToken is set', async () => {
  const app = createApp({ verifyToken: 'secret', senders: fakeSenders([]), tutorialStatePath: tmpState() });
  const { s, base } = listen(app);
  const res = await fetch(`${base}/webhook/whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'X-HookMyApp-Signature-256': 'sha256=abc' },
    body: 'not json',
  });
  s.close();
  assert.equal(res.status, 401);
});
