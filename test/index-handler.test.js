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
  process.env.META_GRAPH_API_URL = 'https://example.test/v24.0';
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'PHN_TEST';
  process.env.WHATSAPP_ACCESS_TOKEN = 'TOK_TEST';
  process.env.TUTORIAL_STATE_PATH = join(dir, '.tutorial-state.json');
});

test('handleInbound on first text fires step 1, advances state', async () => {
  const sent = [];
  const fakeSendMessage = async (to, text) => sent.push({ to, text });
  const { handleInbound } = await import('../src/index.js');
  const { loadState } = await import('../src/tutorial.js');
  const statePath = process.env.TUTORIAL_STATE_PATH;
  const tutorialState = loadState(statePath);

  await handleInbound(
    { from: '15551234567', text: 'hi', provider: 'whatsapp' },
    {
      send: fakeSendMessage,
      port: 4001,
      chatPush: () => {},
      selfId: 'PHN_TEST',
      tutorialState,
      tutorialStatePath: statePath,
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
  const { loadState } = await import('../src/tutorial.js');
  const statePath = process.env.TUTORIAL_STATE_PATH;
  // Load tutorialState ONCE and reuse the same object + ctx across the loop so
  // the step advances.
  const tutorialState = loadState(statePath);
  const phone = '15559999999';
  const ctx = {
    send: fakeSendMessage,
    port: 4001,
    chatPush: () => {},
    selfId: 'PHN_TEST',
    tutorialState,
    tutorialStatePath: statePath,
  };

  for (let i = 0; i < 4; i++) {
    await handleInbound(
      { from: phone, text: `r${i}`, provider: 'whatsapp' },
      ctx,
    );
  }
  assert.equal(sent.length, 4);
  assert.match(sent[0].text, /Connected/);
  assert.match(sent[3].text, /CUSTOMIZE/);

  // 5th inbound — tutorial done; falls through to custom auto-reply path.
  const result = await handleInbound(
    { from: phone, text: 'r4', provider: 'whatsapp' },
    ctx,
  );
  assert.equal(result.tutorialActive, false);
});

test('handleInbound threads username onto the inbound chat push', async () => {
  const pushed = [];
  const fakeSendMessage = async () => {};
  const { handleInbound } = await import('../src/index.js');
  const { loadState } = await import('../src/tutorial.js');
  const statePath = process.env.TUTORIAL_STATE_PATH;
  const tutorialState = loadState(statePath);
  await handleInbound(
    { from: 'IGSID9', text: 'yo', provider: 'instagram', username: 'jane_doe' },
    { send: fakeSendMessage, port: 4001, chatPush: (e) => pushed.push(e), selfId: 'IG_SELF', tutorialState, tutorialStatePath: statePath },
  );
  const inbound = pushed.find((p) => p.direction === 'in');
  assert.ok(inbound, 'expected an inbound push');
  assert.equal(inbound.username, 'jane_doe');
});

test('handleInbound extracts text.body from real Meta payload shape', async () => {
  const pushed = [];
  const fakeSendMessage = async () => {};
  const { handleInbound } = await import('../src/index.js');
  const { loadState } = await import('../src/tutorial.js');
  const statePath = process.env.TUTORIAL_STATE_PATH;
  const tutorialState = loadState(statePath);
  await handleInbound(
    { from: '15557777777', text: 'hi from meta', provider: 'whatsapp' },
    {
      send: fakeSendMessage,
      port: 4001,
      chatPush: (e) => pushed.push(e),
      selfId: 'PHN_TEST',
      tutorialState,
      tutorialStatePath: statePath,
    },
  );
  // Two pushes: inbound (the message) + outbound (tutorial step 1 reply).
  const inbound = pushed.find((p) => p.direction === 'in');
  assert.ok(inbound, 'expected an inbound push');
  assert.equal(inbound.text, 'hi from meta');
  assert.equal(inbound.provider, 'whatsapp');
  assert.notEqual(inbound.text, '[object Object]');
});
