import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadState,
  saveState,
  getStep,
  advance,
  getStepMessage,
} from '../src/tutorial.js';

let dir;
let path;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tutorial-'));
  path = join(dir, '.tutorial-state.json');
});

test('fresh phone — getStep returns 0', () => {
  const map = new Map();
  assert.equal(getStep(map, '15551234567'), 0);
});

test('advance walks 0 → 1 → 2 → 3 → 4 → 5 then returns null', () => {
  const map = new Map();
  const phone = '15551234567';
  assert.equal(advance(map, phone), 1);
  assert.equal(advance(map, phone), 2);
  assert.equal(advance(map, phone), 3);
  assert.equal(advance(map, phone), 4);
  assert.equal(advance(map, phone), 5);
  assert.equal(advance(map, phone), null);
  assert.equal(getStep(map, phone), 5);
});

test('save + load round-trip preserves per-phone steps', () => {
  const map = new Map();
  advance(map, '15551111111');
  advance(map, '15551111111');
  advance(map, '15552222222');
  saveState(path, map);
  const loaded = loadState(path);
  assert.equal(getStep(loaded, '15551111111'), 2);
  assert.equal(getStep(loaded, '15552222222'), 1);
});

test('getStepMessage substitutes ${port} into steps 1 and 3', () => {
  const m1 = getStepMessage(1, 4001);
  assert.match(m1, /http:\/\/localhost:4001\/chat/);
  assert.doesNotMatch(m1, /\$\{port\}/);
  const m3 = getStepMessage(3, 4001);
  assert.match(m3, /http:\/\/localhost:4001\/logs/);
  assert.doesNotMatch(m3, /\$\{port\}/);
});

test('getStepMessage returns null for completed tour', () => {
  assert.equal(getStepMessage(6, 3000), null);
  assert.equal(getStepMessage(0, 3000), null);
});

test('loadState returns empty Map when file missing', () => {
  const missing = join(dir, 'nope.json');
  const map = loadState(missing);
  assert.ok(map instanceof Map);
  assert.equal(map.size, 0);
});

test('loadState returns empty Map on malformed JSON (no crash)', () => {
  writeFileSync(path, '{ this is not json');
  const map = loadState(path);
  assert.ok(map instanceof Map);
  assert.equal(map.size, 0);
});

test('saveState is atomic — final file appears only after rename', () => {
  const map = new Map();
  advance(map, '15551234567');
  saveState(path, map);
  assert.ok(existsSync(path));
  // implementation detail: assert no .tmp left behind
  assert.equal(existsSync(`${path}.tmp`), false);
});
