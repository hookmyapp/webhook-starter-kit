// Per-phone tutorial state machine. Five steps. Persisted to disk so
// edit + Node --watch restart cycles don't replay step 1.
//
// Shape on disk:
//   { "<phone>": { "completedStep": <0..5>, "lastSeenAt": "<ISO>" } }
//
// In memory: Map<phone, { completedStep, lastSeenAt }>.

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';

export const TOTAL_STEPS = 5;

const STEP_TEMPLATES = {
  1: '✅ Connected. Open `http://localhost:${port}/chat`, your dev console. Text-only by design (no media, buttons, or stickers). Reply to continue.',
  2: 'Now try replying *from* /chat instead of your phone.',
  3: 'See the ✓✓ blue ticks? I\'m marking your messages as read. Raw webhooks at `http://localhost:${port}/logs`.',
  4: '🎉 You\'re shipping. When you\'re ready to swap from sandbox to your own number, run these in your terminal: `hookmyapp signup`, then `hookmyapp env <waba-id> --write .env`. Restart the kit and message me from your real number.',
  5: 'Last step. Tell your AI coding agent (or open the file yourself): change the auto-reply in `src/index.js` (search for `// CUSTOMIZE`). Save. Whatever I say next is *your* code talking, not mine.',
};

export function loadState(path) {
  if (!existsSync(path)) return new Map();
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return new Map();
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Map();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return new Map();
  }
  const map = new Map();
  for (const [phone, value] of Object.entries(parsed)) {
    if (
      value &&
      typeof value === 'object' &&
      typeof value.completedStep === 'number'
    ) {
      map.set(phone, {
        completedStep: value.completedStep,
        lastSeenAt: typeof value.lastSeenAt === 'string'
          ? value.lastSeenAt
          : new Date().toISOString(),
      });
    }
  }
  return map;
}

export function saveState(path, map) {
  const obj = {};
  for (const [phone, value] of map) obj[phone] = value;
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  renameSync(tmp, path);
}

export function getStep(map, phone) {
  const entry = map.get(phone);
  return entry ? entry.completedStep : 0;
}

export function advance(map, phone) {
  const current = getStep(map, phone);
  if (current >= TOTAL_STEPS) return null;
  const next = current + 1;
  map.set(phone, { completedStep: next, lastSeenAt: new Date().toISOString() });
  return next;
}

export function getStepMessage(step, port) {
  const tpl = STEP_TEMPLATES[step];
  if (!tpl) return null;
  return tpl.replace(/\$\{port\}/g, String(port));
}
