// WhatsApp provider: parse the Cloud API webhook shape and send text replies.
export function match(reqBody) {
  return reqBody?.object === 'whatsapp_business_account';
}

export function parseInbound(reqBody) {
  const out = [];
  for (const e of reqBody?.entry ?? []) {
    for (const change of e.changes ?? []) {
      if (change.field !== 'messages') continue;
      for (const m of change.value?.messages ?? []) {
        if (m.type !== 'text') continue;
        const text = typeof m.text === 'string' ? m.text : m.text?.body;
        if (!text) continue;
        out.push({ from: m.from, text });
      }
    }
  }
  return out;
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
