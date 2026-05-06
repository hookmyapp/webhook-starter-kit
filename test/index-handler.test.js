import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
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
  const reads = [];
  const fakeSendMessage = async (to, text) => sent.push({ to, text });
  const fakeMarkAsRead = async (id) => reads.push(id);
  const { handleInbound } = await import('../src/index.js');

  await handleInbound(
    { from: '15551234567', type: 'text', text: 'hi', id: 'wamid.1' },
    {
      sendMessage: fakeSendMessage,
      markAsRead: fakeMarkAsRead,
      port: 4001,
      chatPush: () => {},
    },
  );

  assert.equal(reads[0], 'wamid.1');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, '15551234567');
  assert.match(sent[0].text, /Connected/);
  assert.match(sent[0].text, /http:\/\/localhost:4001\/chat/);
});

test('handleInbound on 5th reply sends step 5, then stops sending tutorial', async () => {
  const sent = [];
  const fakeSendMessage = async (to, text) => sent.push({ to, text });
  const fakeMarkAsRead = async () => {};
  const { handleInbound } = await import('../src/index.js');
  const phone = '15559999999';
  const ctx = {
    sendMessage: fakeSendMessage,
    markAsRead: fakeMarkAsRead,
    port: 4001,
    chatPush: () => {},
  };

  for (let i = 0; i < 5; i++) {
    await handleInbound(
      { from: phone, type: 'text', text: `r${i}`, id: `wamid.${i}` },
      ctx,
    );
  }
  assert.equal(sent.length, 5);
  assert.match(sent[0].text, /Connected/);
  assert.match(sent[4].text, /CUSTOMIZE/);

  // 6th inbound — tutorial done; falls through to custom auto-reply path
  // (which is the existing sendMessage from index.js's webhook handler).
  // handleInbound itself returns { tutorialActive: false } so the caller
  // can choose to fire the custom reply.
  const result = await handleInbound(
    { from: phone, type: 'text', text: 'r5', id: 'wamid.5' },
    ctx,
  );
  assert.equal(result.tutorialActive, false);
});

test('handleInbound calls markAsRead even when tutorial is over', async () => {
  const reads = [];
  const fakeSendMessage = async () => {};
  const fakeMarkAsRead = async (id) => reads.push(id);
  const { handleInbound } = await import('../src/index.js');
  const phone = '15558888888';
  const ctx = {
    sendMessage: fakeSendMessage,
    markAsRead: fakeMarkAsRead,
    port: 4001,
    chatPush: () => {},
  };
  for (let i = 0; i < 6; i++) {
    await handleInbound(
      { from: phone, type: 'text', text: 't', id: `wamid.${i}` },
      ctx,
    );
  }
  assert.equal(reads.length, 6);
});
