import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createChatBuffer, mountChat } from '../src/chat.js';

async function bootApp(buffer, sendMessage) {
  const app = express();
  app.use(express.json());
  mountChat(app, buffer, { sendMessage });
  return new Promise((resolveBoot) => {
    const srv = app.listen(0, () => resolveBoot({ srv, port: srv.address().port }));
  });
}

test('push records an entry, size grows', () => {
  const buf = createChatBuffer({ capPerPhone: 100 });
  buf.push({ direction: 'in', from: '15551111', to: 'PHN', text: 'hi', ts: 'T1' });
  assert.equal(buf.size, 1);
  assert.deepEqual(buf.phones(), ['15551111']);
});

test('per-phone cap evicts oldest of that phone, leaves other phones alone', () => {
  const buf = createChatBuffer({ capPerPhone: 3 });
  for (let i = 0; i < 5; i++) {
    buf.push({ direction: 'in', from: 'A', to: 'PHN', text: `a${i}`, ts: `T${i}` });
  }
  for (let i = 0; i < 2; i++) {
    buf.push({ direction: 'in', from: 'B', to: 'PHN', text: `b${i}`, ts: `T${i}` });
  }
  const a = buf.entriesByPhone('A');
  assert.equal(a.length, 3);
  assert.deepEqual(a.map((e) => e.text), ['a2', 'a3', 'a4']);
  const b = buf.entriesByPhone('B');
  assert.equal(b.length, 2);
});

test('subscribe receives every push', () => {
  const buf = createChatBuffer({ capPerPhone: 100 });
  const seen = [];
  buf.subscribe((entry) => seen.push(entry));
  buf.push({ direction: 'in', from: 'X', to: 'PHN', text: '1', ts: 'T' });
  buf.push({ direction: 'out', from: 'PHN', to: 'X', text: '2', ts: 'T' });
  assert.equal(seen.length, 2);
  assert.equal(seen[0].text, '1');
  assert.equal(seen[1].direction, 'out');
});

test('one broken subscriber does not break others', () => {
  const buf = createChatBuffer({ capPerPhone: 100 });
  const seen = [];
  buf.subscribe(() => { throw new Error('boom'); });
  buf.subscribe((entry) => seen.push(entry));
  buf.push({ direction: 'in', from: 'X', to: 'PHN', text: 'k', ts: 'T' });
  assert.equal(seen.length, 1);
});

test('entries() returns a flat snapshot across phones', () => {
  const buf = createChatBuffer({ capPerPhone: 100 });
  buf.push({ direction: 'in', from: 'A', to: 'PHN', text: 'a', ts: 'T1' });
  buf.push({ direction: 'in', from: 'B', to: 'PHN', text: 'b', ts: 'T2' });
  assert.equal(buf.entries().length, 2);
});

test('POST /chat/send calls sendMessage and pushes outbound entry', async () => {
  const buf = createChatBuffer({ capPerPhone: 100 });
  const sent = [];
  const fakeSend = async (to, text) => { sent.push({ to, text }); };
  const { srv, port } = await bootApp(buf, fakeSend);
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'PHN_TEST';
  try {
    const res = await fetch(`http://localhost:${port}/chat/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: '15551234567', text: 'hello' }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.status, 'ok');
    assert.deepEqual(sent, [{ to: '15551234567', text: 'hello' }]);
    const out = buf.entriesByPhone('15551234567');
    assert.equal(out.length, 1);
    assert.equal(out[0].direction, 'out');
    assert.equal(out[0].text, 'hello');
    assert.equal(out[0].from, 'PHN_TEST');
  } finally {
    srv.close();
  }
});

test('POST /chat/send returns 400 when to or text missing', async () => {
  const buf = createChatBuffer({ capPerPhone: 100 });
  const { srv, port } = await bootApp(buf, async () => {});
  try {
    const res = await fetch(`http://localhost:${port}/chat/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: '15551234567' }),
    });
    assert.equal(res.status, 400);
  } finally {
    srv.close();
  }
});

test('POST /chat/send returns 502 when sendMessage throws', async () => {
  const buf = createChatBuffer({ capPerPhone: 100 });
  const { srv, port } = await bootApp(buf, async () => { throw new Error('upstream'); });
  try {
    const res = await fetch(`http://localhost:${port}/chat/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: '15551234567', text: 'k' }),
    });
    assert.equal(res.status, 502);
  } finally {
    srv.close();
  }
});
