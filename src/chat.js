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
  '<title>HookMyApp Starter Kit · Chat</title>\n' +
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap">\n' +
  '<style>\n' +
  ':root {\n' +
  '  --canvas: #08090a;\n' +
  '  --panel: #0f1011;\n' +
  '  --surface: #191a1b;\n' +
  '  --surface-2: #28282c;\n' +
  '  --border-subtle: rgba(255,255,255,0.05);\n' +
  '  --border-translucent: rgba(255,255,255,0.08);\n' +
  '  --text-primary: #f7f8f8;\n' +
  '  --text-secondary: #d0d6e0;\n' +
  '  --text-tertiary: #8a8f98;\n' +
  '  --indigo-primary: #5e6ad2;\n' +
  '  --indigo-accent: #7170ff;\n' +
  '  --green: #27a644;\n' +
  '  --amber: #f5a524;\n' +
  '  --font-sans: \'Inter Variable\',\'Inter\',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;\n' +
  '}\n' +
  '* { box-sizing: border-box; }\n' +
  'html, body { height: 100%; margin: 0; }\n' +
  'body { background: var(--canvas); color: var(--text-primary); font-family: var(--font-sans); -webkit-font-smoothing: antialiased; font-feature-settings: "ss01","ss02"; }\n' +
  '\n' +
  '/* Header */\n' +
  'header.bar { display: flex; align-items: center; gap: 24px; height: 56px; padding: 0 20px; background: var(--panel); border-bottom: 1px solid var(--border-subtle); }\n' +
  '.brand { display: flex; align-items: baseline; gap: 8px; }\n' +
  '.brand .wordmark { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }\n' +
  '.brand .sub { font-size: 12px; color: var(--text-tertiary); font-weight: 400; }\n' +
  'nav.tabs { display: flex; gap: 2px; padding: 3px; background: var(--surface); border-radius: 8px; }\n' +
  'nav.tabs a { padding: 6px 12px; font-size: 13px; font-weight: 500; color: var(--text-tertiary); text-decoration: none; border-radius: 6px; transition: color 120ms, background 120ms; }\n' +
  'nav.tabs a:hover { color: var(--text-primary); }\n' +
  'nav.tabs a.active { color: var(--text-primary); background: var(--surface-2); }\n' +
  '.right-controls { margin-left: auto; display: flex; align-items: center; gap: 12px; }\n' +
  '.conn { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-tertiary); }\n' +
  '.conn .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-tertiary); }\n' +
  '.conn.live .dot { background: var(--green); box-shadow: 0 0 0 3px rgba(39,166,68,0.15); }\n' +
  '.conn.reconnecting .dot { background: var(--amber); animation: pulse 1.4s ease-in-out infinite; }\n' +
  '@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }\n' +
  '\n' +
  '/* Layout */\n' +
  '.layout { display: grid; grid-template-columns: 280px 1fr; height: calc(100vh - 56px); }\n' +
  'aside.sidebar { background: var(--panel); border-right: 1px solid var(--border-subtle); overflow-y: auto; }\n' +
  '.sidebar-head { padding: 14px 16px 10px; font-size: 11px; font-weight: 500; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid var(--border-subtle); }\n' +
  '.phone-row { padding: 12px 16px; cursor: pointer; border-bottom: 1px solid var(--border-subtle); transition: background 80ms; }\n' +
  '.phone-row:hover { background: rgba(255,255,255,0.03); }\n' +
  '.phone-row.active { background: rgba(94,106,210,0.10); border-left: 2px solid var(--indigo-primary); padding-left: 14px; }\n' +
  '.phone-row .top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }\n' +
  '.phone-row .num { font-size: 13.5px; font-weight: 510; color: var(--text-primary); }\n' +
  '.phone-row .when { font-size: 11px; color: var(--text-tertiary); white-space: nowrap; }\n' +
  '.phone-row .preview { font-size: 12.5px; color: var(--text-tertiary); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n' +
  '.phone-row .preview .arrow { color: var(--text-tertiary); margin-right: 4px; }\n' +
  '\n' +
  '/* Main panel */\n' +
  'main.panel { display: flex; flex-direction: column; height: 100%; min-width: 0; }\n' +
  '.thread-head { padding: 14px 22px; border-bottom: 1px solid var(--border-subtle); background: var(--panel); display: flex; align-items: center; gap: 12px; }\n' +
  '.thread-head .who { font-size: 14.5px; font-weight: 510; }\n' +
  '.thread-head .meta { font-size: 12px; color: var(--text-tertiary); }\n' +
  '#thread { flex: 1; overflow-y: auto; padding: 18px 22px 8px; display: flex; flex-direction: column; gap: 6px; scroll-behavior: smooth; }\n' +
  '.day-divider { align-self: center; font-size: 11px; color: var(--text-tertiary); padding: 8px 0 4px; }\n' +
  '\n' +
  '.row { display: flex; flex-direction: column; gap: 2px; max-width: 70%; }\n' +
  '.row.in { align-self: flex-start; }\n' +
  '.row.out { align-self: flex-end; align-items: flex-end; }\n' +
  '.row.grouped .bubble { border-top-left-radius: 6px; }\n' +
  '.row.out.grouped .bubble { border-top-right-radius: 6px; border-top-left-radius: 14px; }\n' +
  '\n' +
  '.bubble { padding: 9px 13px; border-radius: 14px; font-size: 14px; line-height: 1.45; word-wrap: break-word; white-space: pre-wrap; animation: fadeUp 180ms ease-out; }\n' +
  '.row.in .bubble { background: var(--surface); color: var(--text-primary); border-bottom-left-radius: 4px; }\n' +
  '.row.out .bubble { background: var(--indigo-primary); color: #fff; border-bottom-right-radius: 4px; }\n' +
  '.row .ts { font-size: 10.5px; color: var(--text-tertiary); padding: 2px 4px 0; }\n' +
  '@keyframes fadeUp { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }\n' +
  '\n' +
  '/* Send form */\n' +
  'form#send { display: flex; gap: 8px; padding: 12px 22px 16px; border-top: 1px solid var(--border-subtle); background: var(--panel); }\n' +
  'form#send input { flex: 1; background: var(--surface); border: 1px solid var(--border-translucent); border-radius: 10px; color: var(--text-primary); padding: 10px 14px; font-size: 14px; font-family: inherit; transition: border-color 120ms; }\n' +
  'form#send input:focus { outline: none; border-color: var(--indigo-accent); }\n' +
  'form#send input:disabled { background: rgba(25,26,27,0.5); color: var(--text-tertiary); cursor: not-allowed; }\n' +
  'form#send button { position: relative; min-width: 76px; background: var(--indigo-primary); color: #fff; border: 0; border-radius: 10px; padding: 0 18px; font-size: 13.5px; font-weight: 510; cursor: pointer; transition: background 120ms; }\n' +
  'form#send button:hover:not(:disabled) { background: var(--indigo-accent); }\n' +
  'form#send button:disabled { opacity: 0.5; cursor: not-allowed; }\n' +
  'form#send button.pending .label { visibility: hidden; }\n' +
  'form#send button.pending::after { content: ""; position: absolute; left: 50%; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.45); border-top-color: #fff; animation: spin 700ms linear infinite; }\n' +
  '@keyframes spin { to { transform: rotate(360deg); } }\n' +
  '\n' +
  '/* Empty states */\n' +
  '.empty { color: var(--text-tertiary); font-size: 13.5px; padding: 28px 20px; text-align: center; line-height: 1.55; }\n' +
  '.empty.hero { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 60px 20px; }\n' +
  '.empty .icon { width: 32px; height: 32px; opacity: 0.4; }\n' +
  '.empty .hint { font-size: 12px; color: var(--text-tertiary); }\n' +
  '.empty kbd { font-family: inherit; font-size: 11px; padding: 1px 6px; border: 1px solid var(--border-translucent); border-radius: 4px; background: var(--surface); color: var(--text-secondary); }\n' +
  '\n' +
  '@media (max-width: 720px) {\n' +
  '  .layout { grid-template-columns: 200px 1fr; }\n' +
  '  .row { max-width: 85%; }\n' +
  '  .thread-head { padding: 12px 16px; }\n' +
  '  #thread { padding: 14px 16px 6px; }\n' +
  '  form#send { padding: 10px 16px 14px; }\n' +
  '}\n' +
  '</style>\n' +
  '</head>\n' +
  '<body>\n' +
  '<header class="bar">\n' +
  '  <div class="brand"><span class="wordmark">HookMyApp Starter Kit</span><span class="sub">Chat</span></div>\n' +
  '  <nav class="tabs" aria-label="Sections">\n' +
  '    <a href="/chat" class="active" aria-current="page">Chat</a>\n' +
  '    <a href="/logs">Logs</a>\n' +
  '  </nav>\n' +
  '  <div class="right-controls">\n' +
  '    <span class="conn" id="conn" title="SSE connection state"><span class="dot"></span><span id="conn-label">connecting</span></span>\n' +
  '  </div>\n' +
  '</header>\n' +
  '<div class="layout">\n' +
  '  <aside class="sidebar">\n' +
  '    <div class="sidebar-head">Conversations</div>\n' +
  '    <div id="phone-list"></div>\n' +
  '    <div class="empty" id="sidebar-empty">Waiting for messages.<div class="hint">Send a WhatsApp text to your sandbox number to see it appear here.</div></div>\n' +
  '  </aside>\n' +
  '  <main class="panel">\n' +
  '    <div class="thread-head" id="thread-head" hidden><div><div class="who" id="thread-who"></div><div class="meta" id="thread-meta"></div></div></div>\n' +
  '    <div id="thread"><div class="empty hero"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg><div>Pick a number on the left.</div><div class="hint">Or send a WhatsApp text from your phone to start one.</div></div></div>\n' +
  '    <form id="send" autocomplete="off"><input id="send-input" placeholder="Reply from /chat" disabled><button type="submit" disabled><span class="label">Send</span></button></form>\n' +
  '  </main>\n' +
  '</div>\n' +
  '<script>\n' +
  '(function () {\n' +
  '  var byPhone = Object.create(null);\n' +
  '  var phones = [];\n' +
  '  var selected = null;\n' +
  '  var phoneList = document.getElementById("phone-list");\n' +
  '  var sidebarEmpty = document.getElementById("sidebar-empty");\n' +
  '  var thread = document.getElementById("thread");\n' +
  '  var threadHead = document.getElementById("thread-head");\n' +
  '  var threadWho = document.getElementById("thread-who");\n' +
  '  var threadMeta = document.getElementById("thread-meta");\n' +
  '  var input = document.getElementById("send-input");\n' +
  '  var btn = document.querySelector("#send button");\n' +
  '  var form = document.getElementById("send");\n' +
  '  var conn = document.getElementById("conn");\n' +
  '  var connLabel = document.getElementById("conn-label");\n' +
  '\n' +
  '  function setConn(state) {\n' +
  '    conn.className = "conn " + state;\n' +
  '    connLabel.textContent = state === "live" ? "live" : state === "reconnecting" ? "reconnecting" : "connecting";\n' +
  '  }\n' +
  '\n' +
  '  function fmtAbsTime(iso) { try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }\n' +
  '  function fmtRel(iso) {\n' +
  '    try {\n' +
  '      var ms = Date.now() - new Date(iso).getTime();\n' +
  '      if (ms < 60000) return "now";\n' +
  '      if (ms < 3600000) return Math.floor(ms / 60000) + "m";\n' +
  '      if (ms < 86400000) return Math.floor(ms / 3600000) + "h";\n' +
  '      return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });\n' +
  '    } catch (e) { return ""; }\n' +
  '  }\n' +
  '\n' +
  '  /* Pretty-print a phone in E.164 (digits only) as +<cc> <area>-<rest>. */\n' +
  '  function fmtPhone(p) {\n' +
  '    if (!p) return "";\n' +
  '    var raw = p.charAt(0) === "+" ? p.slice(1) : p;\n' +
  '    if (!/^\\d{8,15}$/.test(raw)) return "+" + raw;\n' +
  '    var cc, rest;\n' +
  '    if (raw.length === 11 && raw.charAt(0) === "1") {\n' +
  '      cc = "1"; rest = raw.slice(1);\n' +
  '      return "+" + cc + " " + rest.slice(0, 3) + "-" + rest.slice(3, 6) + "-" + rest.slice(6);\n' +
  '    }\n' +
  '    if (raw.length === 12 && raw.slice(0, 2) === "44") {\n' +
  '      cc = "44"; rest = raw.slice(2);\n' +
  '      return "+" + cc + " " + rest.slice(0, 4) + " " + rest.slice(4);\n' +
  '    }\n' +
  '    /* Generic: first 1-3 digits as cc heuristically (1-digit if starts with 1 or 7, else 2-3). */\n' +
  '    if (raw.charAt(0) === "1" || raw.charAt(0) === "7") { cc = raw.slice(0, 1); rest = raw.slice(1); }\n' +
  '    else if (raw.length > 10) { cc = raw.slice(0, 3); rest = raw.slice(3); }\n' +
  '    else { cc = raw.slice(0, 2); rest = raw.slice(2); }\n' +
  '    return "+" + cc + " " + rest.slice(0, 3) + " " + rest.slice(3, 6) + (rest.length > 6 ? " " + rest.slice(6) : "");\n' +
  '  }\n' +
  '\n' +
  '  function renderSidebar() {\n' +
  '    phoneList.textContent = "";\n' +
  '    if (phones.length === 0) {\n' +
  '      sidebarEmpty.style.display = "";\n' +
  '      return;\n' +
  '    }\n' +
  '    sidebarEmpty.style.display = "none";\n' +
  '    /* Sort phones by latest activity, newest first. */\n' +
  '    var ordered = phones.slice().sort(function (a, b) {\n' +
  '      var la = (byPhone[a] || []).slice(-1)[0];\n' +
  '      var lb = (byPhone[b] || []).slice(-1)[0];\n' +
  '      return new Date(lb ? lb.ts : 0) - new Date(la ? la.ts : 0);\n' +
  '    });\n' +
  '    for (var i = 0; i < ordered.length; i++) {\n' +
  '      var p = ordered[i];\n' +
  '      var entries = byPhone[p] || [];\n' +
  '      var last = entries[entries.length - 1];\n' +
  '      var row = document.createElement("div");\n' +
  '      row.className = "phone-row" + (p === selected ? " active" : "");\n' +
  '      var top = document.createElement("div"); top.className = "top";\n' +
  '      var num = document.createElement("div"); num.className = "num"; num.textContent = fmtPhone(p);\n' +
  '      var when = document.createElement("div"); when.className = "when"; when.textContent = last ? fmtRel(last.ts) : "";\n' +
  '      top.appendChild(num); top.appendChild(when);\n' +
  '      row.appendChild(top);\n' +
  '      if (last) {\n' +
  '        var prev = document.createElement("div"); prev.className = "preview";\n' +
  '        var arrow = document.createElement("span"); arrow.className = "arrow";\n' +
  '        arrow.textContent = last.direction === "out" ? "↑" : "↓";\n' +
  '        prev.appendChild(arrow);\n' +
  '        var text = document.createTextNode(last.text == null ? "" : String(last.text));\n' +
  '        prev.appendChild(text);\n' +
  '        row.appendChild(prev);\n' +
  '      }\n' +
  '      row.addEventListener("click", (function (ph) { return function () { selectPhone(ph); }; })(p));\n' +
  '      phoneList.appendChild(row);\n' +
  '    }\n' +
  '  }\n' +
  '\n' +
  '  function selectPhone(p) {\n' +
  '    selected = p;\n' +
  '    renderSidebar();\n' +
  '    renderThread();\n' +
  '    input.disabled = false;\n' +
  '    btn.disabled = false;\n' +
  '    input.focus();\n' +
  '  }\n' +
  '\n' +
  '  function renderThread() {\n' +
  '    thread.textContent = "";\n' +
  '    if (!selected) {\n' +
  '      threadHead.hidden = true;\n' +
  '      var hero = document.createElement("div"); hero.className = "empty hero";\n' +
  '      hero.innerHTML = \'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>\';\n' +
  '      var line1 = document.createElement("div"); line1.textContent = "Pick a number on the left.";\n' +
  '      var line2 = document.createElement("div"); line2.className = "hint"; line2.textContent = "Or send a WhatsApp text from your phone to start one.";\n' +
  '      hero.appendChild(line1); hero.appendChild(line2);\n' +
  '      thread.appendChild(hero);\n' +
  '      return;\n' +
  '    }\n' +
  '    threadHead.hidden = false;\n' +
  '    threadWho.textContent = fmtPhone(selected);\n' +
  '    var entries = byPhone[selected] || [];\n' +
  '    threadMeta.textContent = entries.length + " message" + (entries.length === 1 ? "" : "s");\n' +
  '    var prevDir = null;\n' +
  '    for (var i = 0; i < entries.length; i++) {\n' +
  '      var grouped = prevDir === entries[i].direction;\n' +
  '      appendMsg(entries[i], grouped);\n' +
  '      prevDir = entries[i].direction;\n' +
  '    }\n' +
  '    requestAnimationFrame(function () { thread.scrollTop = thread.scrollHeight; });\n' +
  '  }\n' +
  '\n' +
  '  function appendMsg(entry, grouped) {\n' +
  '    var row = document.createElement("div");\n' +
  '    row.className = "row " + (entry.direction === "out" ? "out" : "in") + (grouped ? " grouped" : "");\n' +
  '    var bubble = document.createElement("div"); bubble.className = "bubble";\n' +
  '    bubble.textContent = entry.text == null ? "" : String(entry.text);\n' +
  '    row.appendChild(bubble);\n' +
  '    if (!grouped) {\n' +
  '      var ts = document.createElement("div"); ts.className = "ts"; ts.textContent = fmtAbsTime(entry.ts);\n' +
  '      row.appendChild(ts);\n' +
  '    }\n' +
  '    thread.appendChild(row);\n' +
  '  }\n' +
  '\n' +
  '  function recordEntry(entry) {\n' +
  '    var phone = entry.direction === "out" ? entry.to : entry.from;\n' +
  '    if (!phone) return;\n' +
  '    if (!byPhone[phone]) { byPhone[phone] = []; phones.push(phone); }\n' +
  '    byPhone[phone].push(entry);\n' +
  '  }\n' +
  '\n' +
  '  setConn("connecting");\n' +
  '  var es = new EventSource("/chat/stream");\n' +
  '  es.addEventListener("open", function () { setConn("live"); });\n' +
  '  es.addEventListener("error", function () { setConn("reconnecting"); });\n' +
  '  es.addEventListener("bootstrap", function (ev) {\n' +
  '    setConn("live");\n' +
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
  '      if (phone === selected) {\n' +
  '        var prev = (byPhone[selected] || []).slice(-2)[0];\n' +
  '        appendMsg(entry, prev && prev.direction === entry.direction);\n' +
  '        threadMeta.textContent = (byPhone[selected] || []).length + " messages";\n' +
  '        requestAnimationFrame(function () { thread.scrollTop = thread.scrollHeight; });\n' +
  '      }\n' +
  '    } catch (e) { /* ignore */ }\n' +
  '  });\n' +
  '\n' +
  '  form.addEventListener("submit", function (e) {\n' +
  '    e.preventDefault();\n' +
  '    if (!selected) return;\n' +
  '    var text = input.value.trim();\n' +
  '    if (!text) return;\n' +
  '    btn.disabled = true; btn.classList.add("pending");\n' +
  '    fetch("/chat/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: selected, text: text }) })\n' +
  '      .then(function (r) { return r.json().catch(function () { return {}; }); })\n' +
  '      .catch(function (err) { console.error("send failed", err); })\n' +
  '      .finally(function () { input.value = ""; btn.classList.remove("pending"); btn.disabled = false; input.focus(); });\n' +
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
