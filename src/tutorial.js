// Per-phone tutorial state machine. Four steps. Persisted to disk so
// edit + Node --watch restart cycles don't replay step 1.
//
// Shape on disk:
//   { "<phone>": { "completedStep": <0..5>, "lastSeenAt": "<ISO>" } }
//
// In memory: Map<phone, { completedStep, lastSeenAt }>.

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';

export const TOTAL_STEPS = 4;

const STEP_TEMPLATES = {
  1: '✅ Connected. Your kit received this WhatsApp message. Open `http://localhost:${port}/chat` to watch the conversation in your dev console. Reply anything from your phone or from /chat to continue.',
  2: 'Every webhook Meta sends lands at `http://localhost:${port}/logs` with the full payload. Click a row to expand the JSON. Reply anything to continue.',
  3: 'When you want to use your own WhatsApp number instead of the sandbox, run `hookmyapp signup` then `hookmyapp env <waba-id> --write .env` in your terminal, restart the kit, and message it from your real number. For now, reply anything to continue.',
  4: 'Last step. Tell your AI coding agent (or open the file yourself) to change the auto-reply at `// CUSTOMIZE` in `src/index.js`. Save and reply anything. What comes back next is your code, not me.',
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
