// WhatsApp provider: parse the Cloud API webhook shape and send text replies.
export function match(reqBody) {
  return reqBody?.object === 'whatsapp_business_account';
}

// Media message types we surface in /chat. Each carries its payload under a
// key matching the type (m.image, m.video, …) with a media `id` that must be
// resolved + downloaded through the gateway (see getMediaUrl / fetchMedia).
const MEDIA_KINDS = ['image', 'video', 'audio', 'document', 'sticker'];

export function parseInbound(reqBody) {
  const out = [];
  for (const e of reqBody?.entry ?? []) {
    for (const change of e.changes ?? []) {
      if (change.field !== 'messages') continue;
      for (const m of change.value?.messages ?? []) {
        if (m.type === 'text') {
          const text = typeof m.text === 'string' ? m.text : m.text?.body;
          if (text) out.push({ from: m.from, text });
          continue;
        }
        if (MEDIA_KINDS.includes(m.type)) {
          const payload = m[m.type]; // m.image / m.video / m.audio / …
          const id = payload?.id;
          if (!id) continue; // no media id → nothing to fetch, skip
          out.push({
            from: m.from,
            text: typeof payload.caption === 'string' ? payload.caption : null,
            media: { kind: m.type, id, mime: payload.mime_type ?? null },
          });
        }
      }
    }
  }
  return out;
}

// Resolve a WhatsApp media id to its (gateway-signed) download URL + metadata.
// GET {base}/{mediaId} with the gateway access token — same base + auth as
// send(). The returned `url` is the self-authenticating gateway media URL.
export async function getMediaUrl(mediaId) {
  const base = process.env.WHATSAPP_API_URL ?? process.env.META_GRAPH_API_URL;
  const res = await fetch(`${base}/${mediaId}`, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`WhatsApp media lookup error ${res.status}: ${JSON.stringify(err)}`);
  }
  return res.json(); // { url, mime_type, file_size, sha256, ... }
}

// Download the raw bytes for a media id: resolve the URL, then fetch it. The
// resolved gateway URL carries a signed token in its query string, so the
// second hop needs no Authorization header. Returns { buffer, mime }.
export async function fetchMedia(mediaId) {
  const meta = await getMediaUrl(mediaId);
  const res = await fetch(meta.url);
  if (!res.ok) throw new Error(`WhatsApp media download error ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mime = meta.mime_type ?? res.headers.get('content-type') ?? 'application/octet-stream';
  return { buffer, mime };
}

export async function send(to, text) {
  const base = process.env.WHATSAPP_API_URL ?? process.env.META_GRAPH_API_URL;
  const url = `${base}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`WhatsApp API error ${res.status}: ${JSON.stringify(err)}`);
  }
  return res.json();
}

export const selfId = () => process.env.WHATSAPP_PHONE_NUMBER_ID || null;
