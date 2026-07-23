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

// --- replyToComment ------------------------------------------------------

test('replyToComment posts {message} to {base}/{commentId}/replies with the bearer token', async () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  process.env.INSTAGRAM_API_URL = 'https://sandbox.hookmyapp.com/v25.0';
  process.env.INSTAGRAM_ACCESS_TOKEN = 'TOK';
  let calledUrl = null; let init = null;
  globalThis.fetch = async (url, i) => { calledUrl = url; init = i; return { ok: true, json: async () => ({ id: 'r-1' }) }; };
  try {
    const out = await ig.replyToComment('c-9', 'thanks!');
    assert.equal(calledUrl, 'https://sandbox.hookmyapp.com/v25.0/c-9/replies');
    assert.equal(init.headers.Authorization, 'Bearer TOK');
    assert.deepEqual(JSON.parse(init.body), { message: 'thanks!' });
    assert.deepEqual(out, { id: 'r-1' });
  } finally { globalThis.fetch = realFetch; process.env = saved; }
});

test('replyToComment throws on a non-ok response', async () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  process.env.INSTAGRAM_API_URL = 'https://sandbox.hookmyapp.com/v25.0';
  process.env.INSTAGRAM_ACCESS_TOKEN = 'TOK';
  globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'nope', code: 10, error_subcode: 12345, fbtrace_id: 'RAW-TRACE' } }) });
  try {
    await assert.rejects(() => ig.replyToComment('c-9', 'x'), (err) => {
      // Sanitized contract: Meta's error.message + code only — no raw response JSON.
      assert.match(err.message, /Instagram comment reply error 403: nope \(code 10\)/);
      assert.ok(!err.message.includes('RAW-TRACE'));
      return true;
    });
  } finally { globalThis.fetch = realFetch; process.env = saved; }
});

// --- publishPhoto --------------------------------------------------------

function publishEnv() {
  process.env.INSTAGRAM_API_URL = 'https://sandbox.hookmyapp.com/v25.0';
  process.env.INSTAGRAM_ACCOUNT_ID = 'ACCT';
  process.env.INSTAGRAM_ACCESS_TOKEN = 'TOK';
  delete process.env.INSTAGRAM_GRAPH_API_URL;
}
const B = 'https://sandbox.hookmyapp.com/v25.0';

test('publishPhoto: container -> FINISHED -> publish -> permalink, bearer auth on every call (uses INSTAGRAM_ACCOUNT_ID)', async () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  publishEnv();
  const bodies = {};
  const auths = [];
  globalThis.fetch = async (url, init) => {
    auths.push(init?.headers?.Authorization);
    if (url === `${B}/ACCT/media`) { bodies.container = JSON.parse(init.body); return { ok: true, json: async () => ({ id: 'CONT1' }) }; }
    if (url === `${B}/CONT1?fields=status_code`) return { ok: true, json: async () => ({ status_code: 'FINISHED' }) };
    if (url === `${B}/ACCT/media_publish`) { bodies.publish = JSON.parse(init.body); return { ok: true, json: async () => ({ id: 'MEDIA1' }) }; }
    if (url === `${B}/MEDIA1?fields=permalink`) return { ok: true, json: async () => ({ permalink: 'https://www.instagram.com/p/xyz/' }) };
    throw new Error(`unexpected url ${url}`);
  };
  try {
    const out = await ig.publishPhoto('https://img.test/a.jpg', 'hello world');
    assert.deepEqual(bodies.container, { image_url: 'https://img.test/a.jpg', caption: 'hello world' });
    assert.deepEqual(bodies.publish, { creation_id: 'CONT1' });
    assert.deepEqual(out, { id: 'MEDIA1', permalink: 'https://www.instagram.com/p/xyz/' });
    // The gateway requires Authorization: Bearer on EVERY request, GETs included.
    assert.equal(auths.length, 4);
    assert.ok(auths.every((a) => a === 'Bearer TOK'));
  } finally { globalThis.fetch = realFetch; process.env = saved; }
});

test('publishPhoto: rejects when the container reports ERROR (message names the container id)', async () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  publishEnv();
  globalThis.fetch = async (url) => {
    if (url === `${B}/ACCT/media`) return { ok: true, json: async () => ({ id: 'CONT1' }) };
    if (url.includes('fields=status_code')) return { ok: true, json: async () => ({ status_code: 'ERROR' }) };
    throw new Error(`unexpected url ${url}`);
  };
  try {
    await assert.rejects(() => ig.publishPhoto('https://img.test/a.jpg', ''), /media container CONT1 processing failed/);
  } finally { globalThis.fetch = realFetch; process.env = saved; }
});

test('publishPhoto: fails immediately when the status poll returns non-2xx', async () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  publishEnv();
  let polls = 0;
  globalThis.fetch = async (url) => {
    if (url === `${B}/ACCT/media`) return { ok: true, json: async () => ({ id: 'CONT1' }) };
    if (url === `${B}/CONT1?fields=status_code`) { polls++; return { ok: false, status: 400, json: async () => ({ error: { message: 'container gone', code: 100 } }) }; }
    throw new Error(`unexpected url ${url}`);
  };
  try {
    await assert.rejects(() => ig.publishPhoto('https://img.test/a.jpg', ''), /container CONT1 status check error 400: container gone \(code 100\)/);
    assert.equal(polls, 1); // no retry loop on a hard HTTP failure
  } finally { globalThis.fetch = realFetch; process.env = saved; }
});

test('publishPhoto: rejects after 15 polls when the container never reaches FINISHED', async (t) => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  publishEnv();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let polls = 0;
  globalThis.fetch = async (url) => {
    if (url === `${B}/ACCT/media`) return { ok: true, json: async () => ({ id: 'CONT1' }) };
    if (url.includes('fields=status_code')) { polls++; return { ok: true, json: async () => ({ status_code: 'IN_PROGRESS' }) }; }
    throw new Error(`unexpected url ${url}`);
  };
  try {
    const outcome = ig.publishPhoto('https://img.test/a.jpg', '').then(
      () => { throw new Error('should have rejected'); },
      (err) => err.message,
    );
    // Drain microtasks (setImmediate is NOT mocked) then advance the mocked
    // 2s sleep, repeatedly, until the 15-poll cap trips.
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setImmediate(r));
      t.mock.timers.tick(2000);
    }
    assert.match(await outcome, /media container CONT1 not FINISHED/);
    assert.equal(polls, 15);
  } finally { globalThis.fetch = realFetch; process.env = saved; }
});

// --- getInsights ---------------------------------------------------------

test('getInsights fetches profile + the four metrics with the bearer token on every call', async () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  publishEnv();
  const auths = [];
  globalThis.fetch = async (url, init) => {
    auths.push(init?.headers?.Authorization);
    if (url === `${B}/ACCT?fields=followers_count,media_count`) return { ok: true, json: async () => ({ followers_count: 12, media_count: 3 }) };
    const m = /\/ACCT\/insights\?metric=([a-z_]+)&period=day&metric_type=total_value$/.exec(url);
    if (m) return { ok: true, json: async () => ({ data: [{ total_value: { value: 7 } }] }) };
    throw new Error(`unexpected url ${url}`);
  };
  try {
    const out = await ig.getInsights();
    assert.deepEqual(out, {
      followers: 12,
      posts: 3,
      metrics: [
        { name: 'reach', value: 7 },
        { name: 'views', value: 7 },
        { name: 'total_interactions', value: 7 },
        { name: 'accounts_engaged', value: 7 },
      ],
    });
    assert.equal(auths.length, 5);
    assert.ok(auths.every((a) => a === 'Bearer TOK'));
  } finally { globalThis.fetch = realFetch; process.env = saved; }
});

test('getInsights throws when the profile request fails (auth/config errors are not swallowed)', async () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  publishEnv();
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'bad token', code: 190 } }) });
  try {
    await assert.rejects(() => ig.getInsights(), /Instagram insights profile error 401: bad token \(code 190\)/);
  } finally { globalThis.fetch = realFetch; process.env = saved; }
});

test('getInsights skips a genuinely unavailable metric but keeps the rest', async () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  publishEnv();
  globalThis.fetch = async (url) => {
    if (url === `${B}/ACCT?fields=followers_count,media_count`) return { ok: true, json: async () => ({ followers_count: 1, media_count: 0 }) };
    if (url.includes('metric=views')) return { ok: false, status: 400, json: async () => ({ error: { message: 'unsupported metric', code: 100 } }) };
    if (url.includes('/ACCT/insights?metric=')) return { ok: true, json: async () => ({ data: [{ total_value: { value: 2 } }] }) };
    throw new Error(`unexpected url ${url}`);
  };
  try {
    const out = await ig.getInsights();
    assert.deepEqual(out.metrics.map((m) => m.name), ['reach', 'total_interactions', 'accounts_engaged']);
  } finally { globalThis.fetch = realFetch; process.env = saved; }
});

// --- /comments module ----------------------------------------------------
// import declarations are hoisted, so appending them mid-file is fine.
import { createCommentBuffer, mountComments } from '../src/comments.js';

test('createCommentBuffer caps entries and notifies subscribers', () => {
  const buf = createCommentBuffer({ cap: 2 });
  const seen = [];
  buf.subscribe((e) => seen.push(e.commentId));
  buf.push({ commentId: 'a' });
  buf.push({ commentId: 'b' });
  buf.push({ commentId: 'c' });
  assert.deepEqual(buf.entries().map((e) => e.commentId), ['b', 'c']);
  assert.deepEqual(seen, ['a', 'b', 'c']);
});

test('POST /comments/reply trims text server-side and 400s when empty after trim', async () => {
  const appx = express();
  appx.use(express.json());
  const calls = [];
  const buf = createCommentBuffer();
  mountComments(appx, buf, { reply: async (id, text) => { calls.push([id, text]); } });
  const { s, base } = listen(appx);
  const blank = await post(base, '/comments/reply', { commentId: 'c-1', text: '   ' });
  const ok = await post(base, '/comments/reply', { commentId: 'c-1', text: '  hi  ' });
  s.close();
  assert.equal(blank.status, 400);
  assert.equal(ok.status, 200);
  assert.deepEqual(calls, [['c-1', 'hi']]);
  assert.deepEqual(buf.entries().map((e) => [e.direction, e.text]), [['out', 'hi']]);
});

test('POST /comments/reply surfaces provider failures as 502 with the sanitized message', async () => {
  const appx = express();
  appx.use(express.json());
  mountComments(appx, createCommentBuffer(), { reply: async () => { throw new Error('Instagram comment reply error 403: nope (code 10)'); } });
  const { s, base } = listen(appx);
  const res = await post(base, '/comments/reply', { commentId: 'c-1', text: 'x' });
  const j = await res.json();
  s.close();
  assert.equal(res.status, 502);
  assert.deepEqual(j, { status: 'error', error: 'Instagram comment reply error 403: nope (code 10)' });
});

// --- /publish module -----------------------------------------------------
import { mountPublish } from '../src/publish.js';

test('POST /publish/post validates imageUrl (https only) and returns id + permalink', async () => {
  const appx = express();
  appx.use(express.json());
  const calls = [];
  mountPublish(appx, { publish: async (url, caption) => { calls.push([url, caption]); return { id: 'M1', permalink: 'https://www.instagram.com/p/x/' }; } });
  const { s, base } = listen(appx);
  const missing = await post(base, '/publish/post', { caption: 'no url' });
  const notHttps = await post(base, '/publish/post', { imageUrl: 'ftp://x/a.jpg', caption: '' });
  const ok = await post(base, '/publish/post', { imageUrl: 'https://img.test/a.jpg', caption: 'hello' });
  const j = await ok.json();
  s.close();
  assert.equal(missing.status, 400);
  assert.equal(notHttps.status, 400);
  assert.equal(ok.status, 200);
  assert.deepEqual(j, { status: 'ok', id: 'M1', permalink: 'https://www.instagram.com/p/x/' });
  assert.deepEqual(calls, [['https://img.test/a.jpg', 'hello']]);
});

test('POST /publish/post returns 502 when the provider publish fails', async () => {
  const appx = express();
  appx.use(express.json());
  mountPublish(appx, { publish: async () => { throw new Error('media container create error 400: bad image (code 100)'); } });
  const { s, base } = listen(appx);
  const res = await post(base, '/publish/post', { imageUrl: 'https://img.test/a.jpg' });
  const j = await res.json();
  s.close();
  assert.equal(res.status, 502);
  assert.equal(j.status, 'error');
  assert.match(j.error, /media container create error 400/);
});

// --- /insights module ----------------------------------------------------
import { mountInsights } from '../src/insights.js';

test('GET /insights serves the page and GET /insights/data returns provider data', async () => {
  const appx = express();
  const data = { followers: 5, posts: 2, metrics: [{ name: 'reach', value: 9 }] };
  mountInsights(appx, { insights: async () => data });
  const { s, base } = listen(appx);
  const page = await fetch(`${base}/insights`);
  const res = await fetch(`${base}/insights/data`);
  const j = await res.json();
  s.close();
  assert.equal(page.status, 200);
  assert.equal(res.status, 200);
  assert.deepEqual(j, { status: 'ok', data });
});

test('GET /insights/data 502s with the sanitized provider message on failure', async () => {
  const appx = express();
  mountInsights(appx, { insights: async () => { throw new Error('Instagram insights profile error 401: bad token (code 190)'); } });
  const { s, base } = listen(appx);
  const res = await fetch(`${base}/insights/data`);
  const j = await res.json();
  s.close();
  assert.equal(res.status, 502);
  assert.deepEqual(j, { status: 'error', error: 'Instagram insights profile error 401: bad token (code 190)' });
});
