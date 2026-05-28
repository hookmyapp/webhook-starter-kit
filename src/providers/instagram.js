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
      if (!m.text) continue;
      out.push({ from: ev.sender?.id, text: m.text });
    }
  }
  return out;
}

export async function send(to, text) {
  const url = `${process.env.INSTAGRAM_API_URL}/${process.env.INSTAGRAM_ACCOUNT_ID}/messages`;
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

export const selfId = () => process.env.INSTAGRAM_ACCOUNT_ID || null;
