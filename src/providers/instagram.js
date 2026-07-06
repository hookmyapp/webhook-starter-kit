// Instagram provider: parse the Messenger-style webhook shape and send text replies.
export function match(reqBody) {
  return reqBody?.object === 'instagram';
}

export function parseInbound(reqBody) {
  const out = [];
  for (const e of reqBody?.entry ?? []) {
    for (const ev of e.messaging ?? []) {
      const m = ev.message;
      if (!m || m.is_echo || m.is_deleted || m.is_unsupported) continue;
      if (m.text) out.push({ from: ev.sender?.id, text: m.text });
      // Attachments arrive as a directly-loadable, Meta-signed lookaside URL —
      // no gateway/token resolution needed (unlike WhatsApp media ids). Emit
      // one entry per attachment so each renders as its own bubble in /chat.
      for (const att of m.attachments ?? []) {
        const url = att?.payload?.url;
        if (!url) continue;
        const kind = att.type === 'video' ? 'video' : att.type === 'audio' ? 'audio' : 'image';
        out.push({ from: ev.sender?.id, text: null, media: { kind, url } });
      }
    }
  }
  return out;
}

// Bridge current and legacy env-key shapes. New output uses
// INSTAGRAM_ACCOUNT_ID; older connected-channel env files may still have
// INSTAGRAM_USER_ID. The kit reads either.
export async function send(to, text) {
  const base = process.env.INSTAGRAM_API_URL ?? process.env.INSTAGRAM_GRAPH_API_URL;
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID ?? process.env.INSTAGRAM_USER_ID;
  const url = `${base}/${accountId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.INSTAGRAM_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient: { id: to }, message: { text } }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Instagram API error ${res.status}: ${JSON.stringify(err)}`);
  }
  return res.json();
}

// Resolve an IG-scoped sender id to their @username for nicer /chat labels.
// Same HTTP + auth shape as send(): GET {base}/{igUserId}?fields=username with
// the IG bearer token. Reads the bridged env keys, so it works against the
// sandbox (INSTAGRAM_API_URL) and a real channel (INSTAGRAM_GRAPH_API_URL)
// with no code change. Switching env (token + base url) is the only change.
export async function getUsername(igUserId) {
  if (!igUserId) return null;
  const base = process.env.INSTAGRAM_API_URL ?? process.env.INSTAGRAM_GRAPH_API_URL;
  const url = `${base}/${igUserId}?fields=username`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.INSTAGRAM_ACCESS_TOKEN}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Instagram username lookup error ${res.status}: ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  return typeof data.username === 'string' ? data.username : null;
}

export const selfId = () => process.env.INSTAGRAM_ACCOUNT_ID || process.env.INSTAGRAM_USER_ID || null;
