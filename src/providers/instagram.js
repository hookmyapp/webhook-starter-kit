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

// Comments arrive separately from the messaging events above, and Meta's
// current examples emit TWO payload shapes: entry[].changes[] (self-comment
// example) and a flat entry[].field/value (ordinary-comment example, which may
// omit from.id). Normalize both, and treat from.id / parent_id as optional.
// We drop the account's own replies so outbound replies don't echo back into
// the inbox: match by selfId AND by INSTAGRAM_USERNAME — comment webhooks can
// report the account under a different id than the token's account id, so
// id-matching alone misses our own echoes.
export function parseComments(reqBody) {
  const out = [];
  const self = selfId();
  const selfUser = (process.env.INSTAGRAM_USERNAME || '').toLowerCase();
  for (const e of reqBody?.entry ?? []) {
    const events = [...(e.changes ?? [])];
    if (e.field && e.value) events.push({ field: e.field, value: e.value });
    for (const ch of events) {
      if (ch.field !== 'comments') continue;
      const v = ch.value ?? {};
      if (!v.id) continue;
      if (self && v.from?.id && String(v.from.id) === String(self)) continue;
      if (selfUser && (v.from?.username || '').toLowerCase() === selfUser) continue;
      out.push({
        commentId: v.id,
        text: v.text ?? '',
        from: v.from?.id ?? null,
        username: v.from?.username ?? null,
        mediaId: v.media?.id ?? null,
        parentId: v.parent_id ?? null,
      });
    }
  }
  return out;
}

// Meta error payloads can carry raw debug blobs (trace ids, subcodes, request
// echoes). Thrown messages surface ONLY Meta's error.message + error.code —
// the page routes expose err.message to the browser, so the raw upstream
// response must never end up in a thrown message.
function metaErrorText(body) {
  const e = body?.error ?? {};
  const msg = typeof e.message === 'string' && e.message ? e.message : 'unknown error';
  return e.code != null ? `${msg} (code ${e.code})` : msg;
}

// Reply to a comment: POST {base}/{comment-id}/replies. Same auth shape as
// send(); the reply posts as a threaded reply under the original comment.
export async function replyToComment(commentId, text) {
  // Defense in depth with the route check: never let a non-numeric id reach
  // the authenticated Graph URL (it could rewrite the path/query).
  if (!/^\d+$/.test(String(commentId))) {
    throw new Error('commentId must be a numeric Meta id');
  }
  const base = process.env.INSTAGRAM_API_URL ?? process.env.INSTAGRAM_GRAPH_API_URL;
  const res = await fetch(`${base}/${commentId}/replies`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.INSTAGRAM_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Instagram comment reply error ${res.status}: ${metaErrorText(err)}`);
  }
  return res.json();
}

// Publish a photo to the connected account: container create -> status poll ->
// publish (the Instagram Content Publishing flow). image_url must be a public
// HTTPS url Meta can fetch. Every call — GETs included — sends the bearer
// header: the gateway rejects access_token query params.
export async function publishPhoto(imageUrl, caption) {
  const base = process.env.INSTAGRAM_API_URL ?? process.env.INSTAGRAM_GRAPH_API_URL;
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
  const auth = { Authorization: `Bearer ${process.env.INSTAGRAM_ACCESS_TOKEN}` };
  const headers = { ...auth, 'Content-Type': 'application/json' };

  const cRes = await fetch(`${base}/${accountId}/media`, {
    method: 'POST', headers,
    body: JSON.stringify({ image_url: imageUrl, caption: caption ?? '' }),
  });
  const cJson = await cRes.json().catch(() => ({}));
  if (!cRes.ok || !cJson.id) throw new Error(`media container create error ${cRes.status}: ${metaErrorText(cJson)}`);

  // The container is processed async — publishing before it reaches FINISHED
  // fails with 9007 "Media ID is not available". Poll status_code first. A
  // non-2xx poll response is a hard failure (bad auth, container gone) — fail
  // immediately instead of burning the retry budget.
  for (let i = 0; i < 15; i++) {
    const sRes = await fetch(`${base}/${cJson.id}?fields=status_code`, { headers: auth });
    if (!sRes.ok) {
      const sErr = await sRes.json().catch(() => ({}));
      throw new Error(`container ${cJson.id} status check error ${sRes.status}: ${metaErrorText(sErr)}`);
    }
    const s = await sRes.json().catch(() => ({}));
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR') throw new Error(`media container ${cJson.id} processing failed`);
    if (i === 14) throw new Error(`media container ${cJson.id} not FINISHED after 30s — retry media_publish with creation_id ${cJson.id} once it finishes`);
    await new Promise((r) => setTimeout(r, 2000));
  }

  const pRes = await fetch(`${base}/${accountId}/media_publish`, {
    method: 'POST', headers,
    body: JSON.stringify({ creation_id: cJson.id }),
  });
  const pJson = await pRes.json().catch(() => ({}));
  if (!pRes.ok || !pJson.id) throw new Error(`media publish error ${pRes.status}: ${metaErrorText(pJson)}`);

  // Best-effort permalink for the published post (nicer success state).
  let permalink = null;
  try {
    const mRes = await fetch(`${base}/${pJson.id}?fields=permalink`, { headers: auth });
    if (mRes.ok) {
      const m = await mRes.json();
      if (m?.permalink) permalink = m.permalink;
    }
  } catch { /* non-fatal */ }
  return { id: pJson.id, permalink };
}

// Read account analytics for the connected account. The profile request is the
// auth/config canary — if it fails, throw (a bad token must not render as an
// empty panel). Day-level metrics are fetched one at a time so a metric that is
// genuinely unavailable on this account (new account, code 10) is skipped
// without failing the whole panel.
export async function getInsights() {
  const base = process.env.INSTAGRAM_API_URL ?? process.env.INSTAGRAM_GRAPH_API_URL;
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
  const auth = { Authorization: `Bearer ${process.env.INSTAGRAM_ACCESS_TOKEN}` };

  const pRes = await fetch(`${base}/${accountId}?fields=followers_count,media_count`, { headers: auth });
  if (!pRes.ok) {
    const pErr = await pRes.json().catch(() => ({}));
    throw new Error(`Instagram insights profile error ${pRes.status}: ${metaErrorText(pErr)}`);
  }
  const profile = await pRes.json().catch(() => ({}));

  const metrics = [];
  for (const m of ['reach', 'views', 'total_interactions', 'accounts_engaged']) {
    const r = await fetch(`${base}/${accountId}/insights?metric=${m}&period=day&metric_type=total_value`, { headers: auth });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      // Meta code 10 = metric genuinely unavailable on this account (privacy
      // floor / new account) — skip it, keep the rest. Every OTHER failure
      // (auth, rate limit, outage) must surface, not masquerade as "no data".
      if (err?.error?.code === 10) continue;
      throw new Error(`Instagram insights metric error ${r.status}: ${metaErrorText(err)}`);
    }
    const j = await r.json().catch(() => null);
    const d = j?.data?.[0];
    if (d) metrics.push({ name: m, value: d?.total_value?.value ?? 0 });
  }

  return {
    followers: profile.followers_count ?? null,
    posts: profile.media_count ?? null,
    metrics,
  };
}

export async function send(to, text) {
  const base = process.env.INSTAGRAM_API_URL ?? process.env.INSTAGRAM_GRAPH_API_URL;
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
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

export const selfId = () => process.env.INSTAGRAM_ACCOUNT_ID || null;
