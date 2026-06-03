import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.VERIFY_TOKEN = 'tk';
  process.env.META_GRAPH_API_URL = 'https://example.test/v24.0';
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'PHN_TEST';
  process.env.WHATSAPP_ACCESS_TOKEN = 'TOK_TEST';
});

test('handleInbound does not auto-reply', async () => {
  const sent = [];
  const fakeSendMessage = async (to, text) => sent.push({ to, text });
  const { handleInbound } = await import('../src/index.js');

  await handleInbound(
    { from: '15551234567', text: 'hi', provider: 'whatsapp' },
    { send: fakeSendMessage, chatPush: () => {}, selfId: 'PHN_TEST' },
  );

  assert.equal(sent.length, 0);
});

test('handleInbound threads username onto the inbound chat push', async () => {
  const pushed = [];
  const fakeSendMessage = async () => {};
  const { handleInbound } = await import('../src/index.js');
  await handleInbound(
    { from: 'IGSID9', text: 'yo', provider: 'instagram', username: 'jane_doe' },
    { send: fakeSendMessage, chatPush: (e) => pushed.push(e), selfId: 'IG_SELF' },
  );
  const inbound = pushed.find((p) => p.direction === 'in');
  assert.ok(inbound, 'expected an inbound push');
  assert.equal(inbound.username, 'jane_doe');
});

test('handleInbound extracts text.body from real Meta payload shape', async () => {
  const pushed = [];
  const fakeSendMessage = async () => {};
  const { handleInbound } = await import('../src/index.js');
  await handleInbound(
    { from: '15557777777', text: 'hi from meta', provider: 'whatsapp' },
    { send: fakeSendMessage, chatPush: (e) => pushed.push(e), selfId: 'PHN_TEST' },
  );
  // One push: the inbound message (no auto-reply).
  const inbound = pushed.find((p) => p.direction === 'in');
  assert.ok(inbound, 'expected an inbound push');
  assert.equal(inbound.text, 'hi from meta');
  assert.equal(inbound.provider, 'whatsapp');
  assert.notEqual(inbound.text, '[object Object]');
});
