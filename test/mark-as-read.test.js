import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

beforeEach(() => {
  process.env.WHATSAPP_API_URL = 'https://example.test/v24.0';
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'PHN_TEST';
  process.env.WHATSAPP_ACCESS_TOKEN = 'TOK_TEST';
  process.env.VERIFY_TOKEN = 'tk';
  process.env.NODE_ENV = 'test';
});

test('markAsRead POSTs the WhatsApp read-receipt body to the right URL', async () => {
  const captured = {};
  globalThis.fetch = async (url, init) => {
    captured.url = url;
    captured.init = init;
    return { ok: true, json: async () => ({}) };
  };
  const { markAsRead } = await import('../src/index.js');
  await markAsRead('wamid.ABC123');
  assert.equal(captured.url, 'https://example.test/v24.0/PHN_TEST/messages');
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.headers['Content-Type'], 'application/json');
  assert.equal(captured.init.headers.Authorization, 'Bearer TOK_TEST');
  assert.deepEqual(JSON.parse(captured.init.body), {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: 'wamid.ABC123',
  });
});
