import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSummary } from '../src/logs.js';

test('computeSummary parses an Instagram text message (messaging[] shape)', () => {
  const body = { object: 'instagram', entry: [{ messaging: [{ sender: { id: 'IGSID9' }, message: { mid: 'm', text: 'hi ig' } }] }] };
  const s = computeSummary(body);
  assert.equal(s.type, 'message');
  assert.equal(s.from, 'IGSID9');
  assert.equal(s.text, 'hi ig');
});

test('computeSummary labels a non-text Instagram event (read/reaction/delivery)', () => {
  const body = { object: 'instagram', entry: [{ messaging: [{ sender: { id: 'IGSID9' }, read: { mid: 'm' } }] }] };
  const s = computeSummary(body);
  assert.equal(s.type, 'other');
  assert.equal(s.from, 'IGSID9');
  assert.equal(s.label, 'ig:read');
});

test('computeSummary still parses a WhatsApp text message (changes[] shape)', () => {
  const body = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { messages: [{ from: '15551230000', type: 'text', text: { body: 'hi wa' } }] } }] }] };
  const s = computeSummary(body);
  assert.equal(s.type, 'message');
  assert.equal(s.from, '15551230000');
  assert.equal(s.text, 'hi wa');
});
