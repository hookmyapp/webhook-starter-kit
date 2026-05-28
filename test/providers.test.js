import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as wa from '../src/providers/whatsapp.js';

test('whatsapp.parseInbound extracts text messages, ignores status-only changes', () => {
  const body = { object: 'whatsapp_business_account', entry: [
    { changes: [
      { field: 'messages', value: { messages: [ { from: '15551230000', type: 'text', text: { body: 'hi' } } ] } },
      { field: 'messages', value: { statuses: [ { status: 'delivered' } ] } },
    ] },
  ] };
  assert.deepEqual(wa.parseInbound(body), [{ from: '15551230000', text: 'hi' }]);
});

test('whatsapp.parseInbound returns [] for non-text', () => {
  const body = { entry: [ { changes: [ { field: 'messages', value: { messages: [ { from: '1', type: 'image' } ] } } ] } ] };
  assert.deepEqual(wa.parseInbound(body), []);
});
