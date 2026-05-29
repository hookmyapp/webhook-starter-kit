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

test('instagram.send bridges INSTAGRAM_GRAPH_API_URL + INSTAGRAM_USER_ID when sandbox keys are unset', async () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  delete process.env.INSTAGRAM_API_URL;
  delete process.env.INSTAGRAM_ACCOUNT_ID;
  process.env.INSTAGRAM_GRAPH_API_URL = 'https://graph.facebook.com/v24.0';
  process.env.INSTAGRAM_USER_ID = '17841400000000000';
  process.env.INSTAGRAM_ACCESS_TOKEN = 'TOK';
  let calledUrl = null;
  globalThis.fetch = async (url) => { calledUrl = url; return { ok: true, json: async () => ({}) }; };
  try {
    await ig.send('IGSID9', 'hi');
    assert.equal(calledUrl, 'https://graph.facebook.com/v24.0/17841400000000000/messages');
  } finally {
    globalThis.fetch = realFetch;
    process.env = saved;
  }
});

test('instagram.selfId bridges INSTAGRAM_USER_ID when INSTAGRAM_ACCOUNT_ID is unset', () => {
  const saved = { ...process.env };
  delete process.env.INSTAGRAM_ACCOUNT_ID;
  process.env.INSTAGRAM_USER_ID = '17841400000000000';
  try {
    assert.equal(ig.selfId(), '17841400000000000');
  } finally {
    process.env = saved;
  }
});

test('instagram.send prefers INSTAGRAM_API_URL + INSTAGRAM_ACCOUNT_ID (sandbox shape) when set', async () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  process.env.INSTAGRAM_API_URL = 'https://sandbox.hookmyapp.com/v25.0';
  process.env.INSTAGRAM_ACCOUNT_ID = 'SBX_IG';
  process.env.INSTAGRAM_GRAPH_API_URL = 'https://graph.facebook.com/v24.0';
  process.env.INSTAGRAM_USER_ID = 'REAL_IG';
  process.env.INSTAGRAM_ACCESS_TOKEN = 'TOK';
  let calledUrl = null;
  globalThis.fetch = async (url) => { calledUrl = url; return { ok: true, json: async () => ({}) }; };
  try {
    await ig.send('IGSID9', 'hi');
    assert.equal(calledUrl, 'https://sandbox.hookmyapp.com/v25.0/SBX_IG/messages');
  } finally {
    globalThis.fetch = realFetch;
    process.env = saved;
  }
});

test('instagram.getUsername resolves the username field and bridges the env keys', async () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  delete process.env.INSTAGRAM_API_URL;
  delete process.env.INSTAGRAM_ACCOUNT_ID;
  process.env.INSTAGRAM_GRAPH_API_URL = 'https://graph.facebook.com/v24.0';
  process.env.INSTAGRAM_ACCESS_TOKEN = 'TOK';
  let calledUrl = null;
  globalThis.fetch = async (url) => { calledUrl = url; return { ok: true, json: async () => ({ username: 'jane_doe' }) }; };
  try {
    const u = await ig.getUsername('IGSID9');
    assert.equal(u, 'jane_doe');
    assert.equal(calledUrl, 'https://graph.facebook.com/v24.0/IGSID9?fields=username');
  } finally {
    globalThis.fetch = realFetch;
    process.env = saved;
  }
});

test('instagram.getUsername returns null for a falsy id without hitting the network', async () => {
  const realFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; return { ok: true, json: async () => ({}) }; };
  try {
    assert.equal(await ig.getUsername(''), null);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('instagram.getUsername throws on a non-ok response (caller treats as non-fatal)', async () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  process.env.INSTAGRAM_API_URL = 'https://sandbox.hookmyapp.com/v25.0';
  process.env.INSTAGRAM_ACCESS_TOKEN = 'TOK';
  globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'bad' } }) });
  try {
    await assert.rejects(() => ig.getUsername('IGSID9'), /Instagram username lookup error 400/);
  } finally {
    globalThis.fetch = realFetch;
    process.env = saved;
  }
});
