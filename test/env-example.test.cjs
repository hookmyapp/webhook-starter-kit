/**
 * Phase 108-02 — .env.example contract (RED until Plan 108-04 rewrite).
 *
 * Invariants this kit must uphold post-Phase 107 (Cloudflare Tunnel) +
 * Phase 108 (CLI hardening):
 *   - No legacy NGROK_* keys (tunnel lifecycle lives in the CLI now).
 *   - VERIFY_TOKEN is the per-session hmacSecret — a comment MUST direct
 *     users to `hookmyapp sandbox env` to avoid drift.
 *   - Key-set aligns with the CLI's `hookmyapp sandbox env` canonical output.
 *   - src/tunnel.js is deleted (ngrok-only legacy) and `npm run tunnel` is
 *     removed from package.json (scopes addressed in Plan 108-04).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env.example');

function readEnv() {
  return fs.readFileSync(ENV_PATH, 'utf-8');
}

test('.env.example contains no NGROK_ keys', () => {
  const env = readEnv();
  assert.doesNotMatch(env, /^NGROK_/m);
});

test('.env.example declares VERIFY_TOKEN', () => {
  const env = readEnv();
  assert.match(env, /^VERIFY_TOKEN=/m);
});

test('.env.example comment nudges users at `hookmyapp sandbox env`', () => {
  const env = readEnv();
  assert.ok(
    env.includes('hookmyapp sandbox env'),
    '.env.example MUST reference `hookmyapp sandbox env` in a comment so ' +
      'users do not hand-copy secrets and drift out of sync with rotations.',
  );
});

test('.env.example key-set matches the CLI canonical set', () => {
  const env = readEnv();
  const keys = env
    .split('\n')
    .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
    .map((l) => l.split('=')[0])
    .sort();
  assert.deepEqual(keys, [
    'PORT',
    'VERIFY_TOKEN',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_API_URL',
    'WHATSAPP_PHONE_NUMBER_ID',
  ]);
});

test('.env.example VERIFY_TOKEN is not hardcoded to the old `hookmyapp-verify` default', () => {
  // Post-Phase 107 the forwarder signs with session.hmacSecret, so the old
  // static default is guaranteed to mismatch on first webhook. The placeholder
  // MUST NOT be a working-looking string that invites cargo-cult reuse.
  const env = readEnv();
  assert.doesNotMatch(env, /^VERIFY_TOKEN=hookmyapp-verify\s*$/m);
});

test('src/tunnel.js is deleted', () => {
  assert.ok(
    !fs.existsSync(path.join(ROOT, 'src', 'tunnel.js')),
    'src/tunnel.js MUST be deleted — ngrok tunneling is now a CLI concern.',
  );
});

test('package.json has no tunnel script', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'),
  );
  assert.ok(
    !pkg.scripts || !pkg.scripts.tunnel,
    'package.json scripts.tunnel MUST be removed — `hookmyapp sandbox listen` replaces it.',
  );
});
