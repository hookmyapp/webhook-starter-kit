import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as wa from '../src/providers/whatsapp.js';
import * as ig from '../src/providers/instagram.js';

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

test('instagram.parseInbound extracts text, skips echo/deleted/unsupported/no-text', () => {
  const body = { object: 'instagram', entry: [ { messaging: [
    { sender: { id: 'IGSID1' }, message: { mid: 'm1', text: 'yo' } },
    { sender: { id: 'IGSID2' }, message: { mid: 'm2', text: 'echo', is_echo: true } },
    { sender: { id: 'IGSID3' }, message: { mid: 'm3', is_deleted: true } },
    { sender: { id: 'IGSID4' }, message: { mid: 'm4' } },
  ] } ] };
  assert.deepEqual(ig.parseInbound(body), [{ from: 'IGSID1', text: 'yo' }]);
});

test('instagram.match keys on object === instagram', () => {
  assert.equal(ig.match({ object: 'instagram' }), true);
  assert.equal(ig.match({ object: 'whatsapp_business_account' }), false);
});
