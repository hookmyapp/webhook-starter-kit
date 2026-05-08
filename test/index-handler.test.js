import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kit-'));
  process.env.NODE_ENV = 'test';
  process.env.VERIFY_TOKEN = 'tk';
  process.env.WHATSAPP_API_URL = 'https://example.test/v24.0';
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'PHN_TEST';
  process.env.WHATSAPP_ACCESS_TOKEN = 'TOK_TEST';
  process.env.TUTORIAL_STATE_PATH = join(dir, '.tutorial-state.json');
});

test('handleInbound on first text fires step 1, advances state', async () => {
  const sent = [];
  const fakeSendMessage = async (to, text) => sent.push({ to, text });
  const { handleInbound } = await import('../src/index.js');

  await handleInbound(
    { from: '15551234567', type: 'text', text: 'hi', id: 'wamid.1' },
    {
      sendMessage: fakeSendMessage,
      port: 4001,
      chatPush: () => {},
    },
  );

  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, '15551234567');
  assert.match(sent[0].text, /Connected/);
  assert.match(sent[0].text, /http:\/\/localhost:4001\/chat/);
});

test('handleInbound on 4th reply sends step 4, then stops sending tutorial', async () => {
  const sent = [];
  const fakeSendMessage = async (to, text) => sent.push({ to, text });
  const { handleInbound } = await import('../src/index.js');
  const phone = '15559999999';
  const ctx = {
    sendMessage: fakeSendMessage,
    port: 4001,
    chatPush: () => {},
  };

  for (let i = 0; i < 4; i++) {
    await handleInbound(
      { from: phone, type: 'text', text: `r${i}`, id: `wamid.${i}` },
      ctx,
    );
  }
  assert.equal(sent.length, 4);
  assert.match(sent[0].text, /Connected/);
  assert.match(sent[3].text, /CUSTOMIZE/);

  // 5th inbound — tutorial done; falls through to custom auto-reply path.
  const result = await handleInbound(
    { from: phone, type: 'text', text: 'r4', id: 'wamid.4' },
    ctx,
  );
  assert.equal(result.tutorialActive, false);
});

test('handleInbound extracts text.body from real Meta payload shape', async () => {
  const pushed = [];
  const fakeSendMessage = async () => {};
  const { handleInbound } = await import('../src/index.js');
  await handleInbound(
    { from: '15557777777', type: 'text', text: { body: 'hi from meta' }, id: 'wamid.meta' },
    {
      sendMessage: fakeSendMessage,
      port: 4001,
      chatPush: (e) => pushed.push(e),
    },
  );
  // Two pushes: inbound (the message) + outbound (tutorial step 1 reply).
  const inbound = pushed.find((p) => p.direction === 'in');
  assert.ok(inbound, 'expected an inbound push');
  assert.equal(inbound.text, 'hi from meta');
  assert.notEqual(inbound.text, '[object Object]');
});
