import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatBuffer } from '../src/chat.js';

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
