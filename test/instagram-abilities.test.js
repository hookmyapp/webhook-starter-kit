import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import * as ig from '../src/providers/instagram.js';
// Page-module imports (comments/publish/insights) are added in Task 3, in the
// same step that creates each module — so no placeholder module is ever needed.
// Set NODE_ENV BEFORE index.js evaluates, then import dynamically. A static
// `import` is hoisted and evaluated before this module's body runs, so it would
// let index.js auto-listen before the assignment takes effect.
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/index.js');
// Hermetic: importing src/index.js runs dotenv, which loads a developer's real
// .env into process.env. Scrub the auth + Instagram keys AFTER the import so a
// real .env cannot leak into signature checks or self-echo filtering.
delete process.env.WEBHOOK_HMAC_SECRET;
delete process.env.VERIFY_TOKEN;
delete process.env.INSTAGRAM_ACCOUNT_ID;
delete process.env.INSTAGRAM_USERNAME;

const listen = (app) => { const s = app.listen(0); return { s, base: `http://localhost:${s.address().port}` }; };
const post = (base, route, body, headers = {}) =>
  fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const fakeSenders = (calls) => ({
  whatsapp: async (to, text) => { calls.push(['whatsapp', to, text]); },
  instagram: async (to, text) => { calls.push(['instagram', to, text]); },
});

// --- parseComments -------------------------------------------------------

test('parseComments normalizes the entry[].changes[] shape', () => {
  const saved = { ...process.env };
  delete process.env.INSTAGRAM_ACCOUNT_ID;
  delete process.env.INSTAGRAM_USERNAME;
  try {
    const body = { object: 'instagram', entry: [{ id: '17841400000000000', time: 1, changes: [
      { field: 'comments', value: { id: 'c-1', text: 'love it', from: { id: 'F1', username: 'fan_one' }, media: { id: 'm-1' } } },
      { field: 'mentions', value: { id: 'x-1' } }, // non-comment field → skipped
      { field: 'comments', value: {} },            // no id → skipped
    ] }] };
    assert.deepEqual(ig.parseComments(body), [
      { commentId: 'c-1', text: 'love it', from: 'F1', username: 'fan_one', mediaId: 'm-1', parentId: null },
    ]);
  } finally { process.env = saved; }
});

test('parseComments normalizes the flat entry[].field/value shape (from.id optional, parent_id kept)', () => {
  const saved = { ...process.env };
  delete process.env.INSTAGRAM_ACCOUNT_ID;
  delete process.env.INSTAGRAM_USERNAME;
  try {
    const body = { object: 'instagram', entry: [{ id: '17841400000000000', time: 2, field: 'comments',
      value: { id: 'c-2', text: 'reply here', from: { username: 'fan_two' }, media: { id: 'm-2' }, parent_id: 'c-1' } }] };
    assert.deepEqual(ig.parseComments(body), [
      { commentId: 'c-2', text: 'reply here', from: null, username: 'fan_two', mediaId: 'm-2', parentId: 'c-1' },
    ]);
  } finally { process.env = saved; }
});

test('parseComments drops self echoes by selfId AND by INSTAGRAM_USERNAME (both shapes)', () => {
  const saved = { ...process.env };
  process.env.INSTAGRAM_ACCOUNT_ID = 'SELF1';
  process.env.INSTAGRAM_USERNAME = 'MyBrand';
  try {
    const body = { object: 'instagram', entry: [
      { changes: [{ field: 'comments', value: { id: 'c-1', text: 'own reply', from: { id: 'SELF1', username: 'other' } } }] },
      { field: 'comments', value: { id: 'c-2', text: 'own reply 2', from: { id: 'OTHER', username: 'mybrand' } } },
      { changes: [{ field: 'comments', value: { id: 'c-3', text: 'a fan', from: { id: 'F1', username: 'fan' } } }] },
    ] };
    assert.deepEqual(ig.parseComments(body).map((c) => c.commentId), ['c-3']);
  } finally { process.env = saved; }
});

test('parseComments returns [] for messaging-only and empty payloads', () => {
  assert.deepEqual(ig.parseComments({ object: 'instagram', entry: [{ messaging: [{ sender: { id: 'x' }, message: { text: 'hi' } }] }] }), []);
  assert.deepEqual(ig.parseComments({}), []);
  assert.deepEqual(ig.parseComments(undefined), []);
});
