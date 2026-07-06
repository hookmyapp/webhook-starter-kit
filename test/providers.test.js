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

test('instagram.send uses INSTAGRAM_GRAPH_API_URL + INSTAGRAM_ACCOUNT_ID when sandbox URL is unset', async () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  delete process.env.INSTAGRAM_API_URL;
  process.env.INSTAGRAM_GRAPH_API_URL = 'https://graph.facebook.com/v24.0';
  process.env.INSTAGRAM_ACCOUNT_ID = '17841400000000000';
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

test('instagram.selfId reads INSTAGRAM_ACCOUNT_ID', () => {
  const saved = { ...process.env };
  process.env.INSTAGRAM_ACCOUNT_ID = '17841400000000000';
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

// --- media ---------------------------------------------------------------

test('whatsapp.parseInbound extracts image/video media (id + caption), skips media with no id', () => {
  const body = { object: 'whatsapp_business_account', entry: [
    { changes: [
      { field: 'messages', value: { messages: [
        { from: '15551230000', type: 'image', image: { id: 'IMG1', mime_type: 'image/jpeg', caption: 'look' } },
        { from: '15551230000', type: 'video', video: { id: 'VID1', mime_type: 'video/mp4' } },
        { from: '15551230000', type: 'image' }, // no payload/id → skipped
      ] } },
    ] },
  ] };
  assert.deepEqual(wa.parseInbound(body), [
    { from: '15551230000', text: 'look', media: { kind: 'image', id: 'IMG1', mime: 'image/jpeg' } },
    { from: '15551230000', text: null, media: { kind: 'video', id: 'VID1', mime: 'video/mp4' } },
  ]);
});

test('whatsapp.getMediaUrl resolves the gateway-signed url + mime with the access token', async () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  process.env.WHATSAPP_API_URL = 'https://gw.test/meta';
  process.env.WHATSAPP_ACCESS_TOKEN = 'hmat_test';
  let calledUrl = null; let auth = null;
  globalThis.fetch = async (url, init) => {
    calledUrl = url; auth = init?.headers?.Authorization ?? null;
    return { ok: true, json: async () => ({ url: 'https://gw.test/media?token=zzz', mime_type: 'image/png' }) };
  };
  try {
    const meta = await wa.getMediaUrl('MID123');
    assert.equal(calledUrl, 'https://gw.test/meta/MID123');
    assert.equal(auth, 'Bearer hmat_test');
    assert.equal(meta.mime_type, 'image/png');
  } finally {
    globalThis.fetch = realFetch;
    process.env = saved;
  }
});

test('whatsapp.fetchMedia resolves then downloads the bytes (second hop unauthenticated)', async () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  process.env.WHATSAPP_API_URL = 'https://gw.test/meta';
  process.env.WHATSAPP_ACCESS_TOKEN = 'hmat_test';
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  globalThis.fetch = async (url) => {
    if (url === 'https://gw.test/meta/MID123') return { ok: true, json: async () => ({ url: 'https://gw.test/media?token=zzz', mime_type: 'image/png' }) };
    if (url === 'https://gw.test/media?token=zzz') return { ok: true, headers: { get: () => 'image/png' }, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    throw new Error(`unexpected url ${url}`);
  };
  try {
    const { buffer, mime } = await wa.fetchMedia('MID123');
    assert.equal(mime, 'image/png');
    assert.deepEqual(buffer, bytes);
  } finally {
    globalThis.fetch = realFetch;
    process.env = saved;
  }
});

test('instagram.parseInbound extracts attachments (lookaside url) and text+attachment combos', () => {
  const body = { object: 'instagram', entry: [{ messaging: [
    { sender: { id: 'IGSID1' }, message: { mid: 'm1', attachments: [{ type: 'image', payload: { url: 'https://lookaside/img.jpg' } }] } },
    { sender: { id: 'IGSID2' }, message: { mid: 'm2', attachments: [{ type: 'video', payload: { url: 'https://lookaside/vid.mp4' } }] } },
    { sender: { id: 'IGSID3' }, message: { mid: 'm3', text: 'caption', attachments: [{ type: 'image', payload: { url: 'https://lookaside/c.jpg' } }] } },
    { sender: { id: 'IGSID4' }, message: { mid: 'm4', attachments: [{ type: 'image', payload: {} }] } }, // no url → skipped
  ] }] };
  assert.deepEqual(ig.parseInbound(body), [
    { from: 'IGSID1', text: null, media: { kind: 'image', url: 'https://lookaside/img.jpg' } },
    { from: 'IGSID2', text: null, media: { kind: 'video', url: 'https://lookaside/vid.mp4' } },
    { from: 'IGSID3', text: 'caption' },
    { from: 'IGSID3', text: null, media: { kind: 'image', url: 'https://lookaside/c.jpg' } },
  ]);
});
