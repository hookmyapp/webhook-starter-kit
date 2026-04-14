/**
 * Phase 108-02 — README smoke (RED until Plan 108-04 rewrites README).
 *
 * Wave-0 contract:
 *   - The published CLI is @gethookmyapp/cli — NOT the old `hookmyapp` name
 *     (the public npm package `hookmyapp` is squatted by someone else).
 *   - The CLI exposes `hookmyapp sandbox listen` + `hookmyapp sandbox env`
 *     as the canonical developer flow — README MUST mention both.
 *   - ngrok is gone from the starter kit (Phase 107 migrated to Cloudflare
 *     Tunnel which the CLI orchestrates). README MUST NOT reference ngrok
 *     or the removed `npm run tunnel` script.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const README = fs.readFileSync(
  path.join(__dirname, '..', 'README.md'),
  'utf-8',
);

test('README mentions the correct CLI package name @gethookmyapp/cli', () => {
  assert.ok(
    README.includes('@gethookmyapp/cli'),
    'README must reference the scoped package name `@gethookmyapp/cli`.',
  );
});

test('README mentions `hookmyapp sandbox listen`', () => {
  assert.ok(
    README.includes('hookmyapp sandbox listen'),
    'README must document the canonical `hookmyapp sandbox listen` flow.',
  );
});

test('README mentions `hookmyapp sandbox env`', () => {
  assert.ok(
    README.includes('hookmyapp sandbox env'),
    'README must document `hookmyapp sandbox env` as the source of truth for .env values.',
  );
});

test('README does not advertise the old bare `npm install -g hookmyapp`', () => {
  // Allow `@gethookmyapp/cli` and variants like `hookmyapp-cli`. Reject the
  // bare squatted name `hookmyapp`.
  assert.doesNotMatch(
    README,
    /npm install -g hookmyapp(?![/-])/,
    'README must not advertise the squatted bare `hookmyapp` npm name.',
  );
});

test('README has no ngrok references', () => {
  assert.doesNotMatch(
    README,
    /ngrok/i,
    'README must not reference ngrok — tunneling moved to CF Tunnel in Phase 107.',
  );
});

test('README does not reference `npm run tunnel`', () => {
  assert.doesNotMatch(
    README,
    /npm run tunnel/,
    'README must not reference `npm run tunnel` — the script is removed in Plan 108-04.',
  );
});
