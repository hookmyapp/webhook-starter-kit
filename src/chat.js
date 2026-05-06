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

const HTML_PAGE =
  '<!DOCTYPE html>\n' +
  '<html lang="en">\n' +
  '<head>\n' +
  '<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '<title>HookMyApp Chat</title>\n' +
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap">\n' +
  '<style>\n' +
  ':root { --canvas: #08090a; --panel: #0f1011; --surface: #191a1b; --surface-2: #28282c; --border-subtle: rgba(255,255,255,0.05); --border-translucent: rgba(255,255,255,0.08); --text-primary: #f7f8f8; --text-secondary: #d0d6e0; --text-tertiary: #8a8f98; --indigo-primary: #5e6ad2; --indigo-accent: #7170ff; --green: #27a644; --font-sans: \'Inter Variable\',\'Inter\',-apple-system,BlinkMacSystemFont,system-ui,sans-serif; }\n' +
  '* { box-sizing: border-box; }\n' +
  'html, body { height: 100%; margin: 0; }\n' +
  'body { background: var(--canvas); color: var(--text-primary); font-family: var(--font-sans); -webkit-font-smoothing: antialiased; }\n' +
  'header.bar { display: flex; align-items: center; height: 52px; padding: 0 20px; background: var(--panel); border-bottom: 1px solid var(--border-subtle); }\n' +
  '.brand { font-size: 16px; font-weight: 510; }\n' +
  '.brand .sub { color: var(--text-tertiary); font-size: 12px; margin-left: 8px; }\n' +
  '.layout { display: grid; grid-template-columns: 240px 1fr; height: calc(100vh - 52px); }\n' +
  'aside.sidebar { background: var(--panel); border-right: 1px solid var(--border-subtle); overflow-y: auto; }\n' +
  '.phone-row { padding: 12px 16px; cursor: pointer; border-bottom: 1px solid var(--border-subtle); font-size: 13px; }\n' +
  '.phone-row:hover { background: rgba(255,255,255,0.04); }\n' +
  '.phone-row.active { background: var(--surface); color: var(--text-primary); }\n' +
  '.phone-row .num { font-weight: 510; }\n' +
  '.phone-row .ts { color: var(--text-tertiary); font-size: 11px; margin-top: 2px; }\n' +
  'main.panel { display: flex; flex-direction: column; height: 100%; min-width: 0; }\n' +
  '#thread { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 8px; }\n' +
  '.msg { max-width: 70%; padding: 8px 12px; border-radius: 12px; font-size: 14px; line-height: 1.4; word-wrap: break-word; }\n' +
  '.msg.in { align-self: flex-start; background: var(--surface); color: var(--text-primary); }\n' +
  '.msg.out { align-self: flex-end; background: var(--indigo-primary); color: #fff; }\n' +
  '.msg .ts { font-size: 11px; color: rgba(255,255,255,0.55); margin-top: 4px; }\n' +
  '.msg.in .ts { color: var(--text-tertiary); }\n' +
  'form#send { display: flex; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--border-subtle); background: var(--panel); }\n' +
  'form#send input { flex: 1; background: var(--surface); border: 1px solid var(--border-translucent); border-radius: 8px; color: var(--text-primary); padding: 8px 12px; font-size: 14px; font-family: inherit; }\n' +
  'form#send input:focus { outline: none; border-color: var(--indigo-accent); }\n' +
  'form#send button { background: var(--indigo-primary); color: #fff; border: 0; border-radius: 8px; padding: 8px 16px; font-size: 14px; font-weight: 510; cursor: pointer; }\n' +
  'form#send button:disabled { opacity: 0.5; cursor: not-allowed; }\n' +
  '.empty { color: var(--text-tertiary); font-size: 14px; padding: 20px; text-align: center; }\n' +
  '</style>\n' +
  '</head>\n' +
  '<body>\n' +
  '<header class="bar"><span class="brand">HookMyApp<span class="sub">Chat</span></span></header>\n' +
  '<div class="layout">\n' +
  '<aside class="sidebar" id="sidebar"><div class="empty" id="sidebar-empty">Waiting for messages.</div></aside>\n' +
  '<main class="panel">\n' +
  '<div id="thread"><div class="empty">Select a number to view conversation.</div></div>\n' +
  '<form id="send"><input id="send-input" placeholder="Reply from /chat" autocomplete="off" disabled><button type="submit" disabled>Send</button></form>\n' +
  '</main>\n' +
  '</div>\n' +
  '<script>\n' +
  '(function () {\n' +
  '  var byPhone = Object.create(null);\n' +
  '  var phones = [];\n' +
  '  var selected = null;\n' +
  '  var sidebar = document.getElementById("sidebar");\n' +
  '  var sidebarEmpty = document.getElementById("sidebar-empty");\n' +
  '  var thread = document.getElementById("thread");\n' +
  '  var input = document.getElementById("send-input");\n' +
  '  var btn = document.querySelector("#send button");\n' +
  '  var form = document.getElementById("send");\n' +
  '\n' +
  '  function fmtTs(iso) { try { var d = new Date(iso); return d.toLocaleTimeString(); } catch (e) { return ""; } }\n' +
  '  function fmtPhone(p) { return p && p.charAt(0) === "+" ? p : "+" + p; }\n' +
  '\n' +
  '  function renderSidebar() {\n' +
  '    sidebar.textContent = "";\n' +
  '    if (phones.length === 0) { sidebar.appendChild(sidebarEmpty); return; }\n' +
  '    for (var i = 0; i < phones.length; i++) {\n' +
  '      var p = phones[i];\n' +
  '      var entries = byPhone[p] || [];\n' +
  '      var last = entries[entries.length - 1];\n' +
  '      var row = document.createElement("div");\n' +
  '      row.className = "phone-row" + (p === selected ? " active" : "");\n' +
  '      var num = document.createElement("div"); num.className = "num"; num.textContent = fmtPhone(p);\n' +
  '      var ts = document.createElement("div"); ts.className = "ts"; ts.textContent = last ? fmtTs(last.ts) : "";\n' +
  '      row.appendChild(num); row.appendChild(ts);\n' +
  '      row.addEventListener("click", (function (ph) { return function () { selected = ph; renderSidebar(); renderThread(); input.disabled = false; btn.disabled = false; input.focus(); }; })(p));\n' +
  '      sidebar.appendChild(row);\n' +
  '    }\n' +
  '  }\n' +
  '\n' +
  '  function renderThread() {\n' +
  '    thread.textContent = "";\n' +
  '    if (!selected) { var e = document.createElement("div"); e.className = "empty"; e.textContent = "Select a number to view conversation."; thread.appendChild(e); return; }\n' +
  '    var entries = byPhone[selected] || [];\n' +
  '    for (var i = 0; i < entries.length; i++) appendMsg(entries[i]);\n' +
  '    thread.scrollTop = thread.scrollHeight;\n' +
  '  }\n' +
  '\n' +
  '  function appendMsg(entry) {\n' +
  '    var div = document.createElement("div");\n' +
  '    div.className = "msg " + (entry.direction === "out" ? "out" : "in");\n' +
  '    var body = document.createElement("div"); body.textContent = entry.text == null ? "" : String(entry.text);\n' +
  '    div.appendChild(body);\n' +
  '    var ts = document.createElement("div"); ts.className = "ts"; ts.textContent = fmtTs(entry.ts);\n' +
  '    div.appendChild(ts);\n' +
  '    thread.appendChild(div);\n' +
  '  }\n' +
  '\n' +
  '  function recordEntry(entry) {\n' +
  '    var phone = entry.direction === "out" ? entry.to : entry.from;\n' +
  '    if (!phone) return;\n' +
  '    if (!byPhone[phone]) { byPhone[phone] = []; phones.push(phone); }\n' +
  '    byPhone[phone].push(entry);\n' +
  '  }\n' +
  '\n' +
  '  var es = new EventSource("/chat/stream");\n' +
  '  es.addEventListener("bootstrap", function (ev) {\n' +
  '    try {\n' +
  '      var payload = JSON.parse(ev.data) || {};\n' +
  '      phones = (payload.phones || []).slice();\n' +
  '      byPhone = Object.create(null);\n' +
  '      var ebp = payload.entriesByPhone || {};\n' +
  '      for (var i = 0; i < phones.length; i++) byPhone[phones[i]] = (ebp[phones[i]] || []).slice();\n' +
  '      renderSidebar(); renderThread();\n' +
  '    } catch (e) { /* ignore malformed bootstrap */ }\n' +
  '  });\n' +
  '  es.addEventListener("entry", function (ev) {\n' +
  '    try {\n' +
  '      var entry = JSON.parse(ev.data);\n' +
  '      recordEntry(entry);\n' +
  '      renderSidebar();\n' +
  '      var phone = entry.direction === "out" ? entry.to : entry.from;\n' +
  '      if (phone === selected) { appendMsg(entry); thread.scrollTop = thread.scrollHeight; }\n' +
  '    } catch (e) { /* ignore */ }\n' +
  '  });\n' +
  '\n' +
  '  form.addEventListener("submit", function (e) {\n' +
  '    e.preventDefault();\n' +
  '    if (!selected) return;\n' +
  '    var text = input.value.trim();\n' +
  '    if (!text) return;\n' +
  '    btn.disabled = true;\n' +
  '    fetch("/chat/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: selected, text: text }) })\n' +
  '      .then(function (r) { return r.json().catch(function () { return {}; }); })\n' +
  '      .catch(function (err) { console.error("send failed", err); })\n' +
  '      .finally(function () { input.value = ""; btn.disabled = false; input.focus(); });\n' +
  '  });\n' +
  '})();\n' +
  '</script>\n' +
  '</body>\n' +
  '</html>\n';

export function mountChat(app, buffer, deps = {}) {
  const sendMessage = deps.sendMessage;

  app.get('/chat', (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.send(HTML_PAGE);
  });

  app.get('/chat/stream', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    res.write('retry: 2000\n\n');

    const phones = buffer.phones();
    const entriesByPhone = {};
    for (const p of phones) entriesByPhone[p] = buffer.entriesByPhone(p);
    res.write('event: bootstrap\n');
    res.write('data: ' + JSON.stringify({ phones, entriesByPhone }) + '\n\n');

    const unsubscribe = buffer.subscribe((entry) => {
      try {
        res.write('event: entry\n');
        res.write('data: ' + JSON.stringify(entry) + '\n\n');
      } catch {
        // connection broken; close handler cleans up
      }
    });

    req.on('close', () => {
      unsubscribe();
      try { res.end(); } catch { /* ignore */ }
    });
  });

  app.post('/chat/send', async (req, res) => {
    const body = req.body ?? {};
    const to = typeof body.to === 'string' ? body.to : null;
    const text = typeof body.text === 'string' ? body.text : null;
    if (!to || !text) {
      res.status(400).json({ status: 'error', error: 'to and text are required' });
      return;
    }
    if (!sendMessage) {
      res.status(500).json({ status: 'error', error: 'sendMessage not wired' });
      return;
    }
    try {
      await sendMessage(to, text);
      buffer.push({
        direction: 'out',
        from: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
        to,
        text,
        ts: new Date().toISOString(),
      });
      res.json({ status: 'ok' });
    } catch (err) {
      res.status(502).json({ status: 'error', error: err.message });
    }
  });
}
