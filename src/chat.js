// /chat — per-phone message buffer + SSE stream + send endpoint.
// Mirrors logs.js: subscriber Set with try/catch fanout, native EventSource
// on the client, retry: 2000.

export function createChatBuffer({ capPerPhone = 100 } = {}) {
  // Map<phone, entry[]> — newest at the end of each phone's array.
  const byPhone = new Map();
  const subscribers = new Set();

  function keyOf(entry) {
    if (entry.direction === 'in') return entry.from;
    if (entry.direction === 'out') return entry.to;
    return entry.from || entry.to || 'unknown';
  }

  function push(entry) {
    const phone = keyOf(entry);
    let arr = byPhone.get(phone);
    if (!arr) { arr = []; byPhone.set(phone, arr); }
    arr.push(entry);
    if (arr.length > capPerPhone) arr.splice(0, arr.length - capPerPhone);
    for (const fn of subscribers) {
      try { fn(entry); } catch (err) {
        process.stderr.write(`chat subscriber failed (non-fatal): ${err.message}\n`);
      }
    }
    return entry;
  }

  function entries() {
    const out = [];
    for (const arr of byPhone.values()) out.push(...arr);
    return out;
  }

  function entriesByPhone(phone) {
    return (byPhone.get(phone) || []).slice();
  }

  function phones() {
    return Array.from(byPhone.keys());
  }

  function subscribe(fn) {
    subscribers.add(fn);
    return function unsubscribe() { subscribers.delete(fn); };
  }

  return {
    push,
    entries,
    entriesByPhone,
    phones,
    subscribe,
    get size() {
      let n = 0;
      for (const arr of byPhone.values()) n += arr.length;
      return n;
    },
  };
}
