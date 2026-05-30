// Per-phone tutorial state machine. Four steps. Persisted to disk so
// edit + Node --watch restart cycles don't replay step 1.
//
// Shape on disk:
//   { "<phone>": { "completedStep": <0..5>, "lastSeenAt": "<ISO>" } }
//
// In memory: Map<phone, { completedStep, lastSeenAt }>.

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';

export const TOTAL_STEPS = 4;

// Steps 1 and 3 carry channel-specific nouns (${channelName}, ${replyFrom},
// ${channelAccount}, ${providerCmd}, ${realNoun}); steps 2 and 4 are
// channel-neutral. getStepMessage substitutes per provider so an Instagram
// inbound never gets told it "received this WhatsApp message" / to "reply from
// your phone".
const STEP_TEMPLATES = {
  1: '✅ Connected. Your kit received this ${channelName} message. Open `http://localhost:${port}/chat` to watch the conversation in your dev console. Reply anything from ${replyFrom} or from /chat to continue.',
  2: 'Every webhook Meta sends lands at `http://localhost:${port}/logs` with the full payload. Click a row to expand the JSON. Reply anything to continue.',
  3: 'When you want to use your own ${channelAccount} instead of the sandbox, run `hookmyapp channels connect ${providerCmd}` then `hookmyapp channels env <channel> --write .env` in your terminal, restart the kit, and message it from your real ${realNoun}. For now, reply anything to continue.',
  4: 'Last step. Tell your AI coding agent (or open the file yourself) to change the auto-reply at `// CUSTOMIZE` in `src/index.js`. Save and reply anything. What comes back next is your code, not me.',
};

const CHANNEL_COPY = {
  whatsapp: {
    channelName: 'WhatsApp',
    replyFrom: 'your phone',
    channelAccount: 'WhatsApp number',
    providerCmd: 'whatsapp',
    realNoun: 'number',
  },
  instagram: {
    channelName: 'Instagram',
    replyFrom: 'Instagram',
    channelAccount: 'Instagram account',
    providerCmd: 'instagram',
    realNoun: 'account',
  },
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

export function getStepMessage(step, port, provider = 'whatsapp') {
  const tpl = STEP_TEMPLATES[step];
  if (!tpl) return null;
  const copy = CHANNEL_COPY[provider] ?? CHANNEL_COPY.whatsapp;
  return tpl
    .replace(/\$\{port\}/g, String(port))
    .replace(/\$\{channelName\}/g, copy.channelName)
    .replace(/\$\{replyFrom\}/g, copy.replyFrom)
    .replace(/\$\{channelAccount\}/g, copy.channelAccount)
    .replace(/\$\{providerCmd\}/g, copy.providerCmd)
    .replace(/\$\{realNoun\}/g, copy.realNoun);
}
