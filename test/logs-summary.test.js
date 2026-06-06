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

test('computeSummary labels an Instagram media attachment by type ([image]/[video]), not [ig non-text]', () => {
  const img = { object: 'instagram', entry: [{ messaging: [{ sender: { id: 'IGSID9' }, message: { mid: 'm', attachments: [{ type: 'image', payload: { url: 'https://lookaside/x.jpg' } }] } }] }] };
  const vid = { object: 'instagram', entry: [{ messaging: [{ sender: { id: 'IGSID9' }, message: { mid: 'm', attachments: [{ type: 'video', payload: { url: 'https://lookaside/x.mp4' } }] } }] }] };
  assert.equal(computeSummary(img).text, '[image]');
  assert.equal(computeSummary(vid).text, '[video]');
  // Truly empty IG message still falls back.
  const none = { object: 'instagram', entry: [{ messaging: [{ sender: { id: 'IGSID9' }, message: { mid: 'm' } }] }] };
  assert.equal(computeSummary(none).text, '[ig non-text]');
});

test('computeSummary still parses a WhatsApp text message (changes[] shape)', () => {
  const body = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { messages: [{ from: '15551230000', type: 'text', text: { body: 'hi wa' } }] } }] }] };
  const s = computeSummary(body);
  assert.equal(s.type, 'message');
  assert.equal(s.from, '15551230000');
  assert.equal(s.text, 'hi wa');
});
