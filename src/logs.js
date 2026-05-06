// Read-only /logs UI for the webhook-starter-kit.
//
// Two responsibilities:
//   1. createLogBuffer({ cap }): bounded in-memory ring buffer with a
//      pub/sub fanout for SSE clients. Newest entries first.
//   2. mountLogs(app, buffer): wires GET /logs (HTML page) and
//      GET /logs/stream (SSE) onto the existing Express app.
//
// Zero new dependencies. The HTML, CSS, and client-side JS are inlined as
// a single template string so the kit stays "open src/index.js, understand
// it in 30 seconds".

const MAX_TEXT_PREVIEW = 60;

function safeStringifyByteSize(rawBody) {
  try {
    return Buffer.byteLength(JSON.stringify(rawBody) ?? '');
  } catch {
    return 0;
  }
}

// Defensive summarizer mirroring the CLI's
// src/commands/sandbox-listen/summarizer.ts. Never throws.
function computeSummary(rawBody) {
  const fallback = {
    type: 'other',
    from: null,
    text: null,
    status: null,
    label: 'unknown',
  };

  if (!rawBody || typeof rawBody !== 'object') return fallback;

  try {
    const value = rawBody?.entry?.[0]?.changes?.[0]?.value;
    const field = rawBody?.entry?.[0]?.changes?.[0]?.field ?? null;
    if (!value) {
      return { ...fallback, label: field ?? 'unknown' };
    }

    const message = Array.isArray(value.messages) ? value.messages[0] : null;
    if (message && typeof message === 'object') {
      const from = typeof message.from === 'string' ? message.from : null;
      if (message.type === 'text') {
        const body = message?.text?.body;
        return {
          type: 'message',
          from,
          text: typeof body === 'string' ? body : null,
          status: null,
          label: null,
        };
      }
      if (message.type === 'template') {
        const tplName =
          typeof message?.template?.name === 'string'
            ? message.template.name
            : null;
        return {
          type: 'template',
          from,
          text: null,
          status: null,
          label: tplName ?? 'template',
        };
      }
      if (typeof message.type === 'string') {
        return {
          type: 'message',
          from,
          text: `[${message.type}]`,
          status: null,
          label: null,
        };
      }
    }

    const status = Array.isArray(value.statuses) ? value.statuses[0] : null;
    if (status && typeof status === 'object') {
      const recipient =
        typeof status.recipient_id === 'string' ? status.recipient_id : null;
      const statusValue =
        typeof status.status === 'string' ? status.status : null;
      return {
        type: 'status',
        from: recipient,
        text: null,
        status: statusValue,
        label: null,
      };
    }

    return { ...fallback, label: field ?? 'unknown' };
  } catch {
    return fallback;
  }
}

export function createLogBuffer({ cap = 100 } = {}) {
  // Internal storage is newest-first to make entries() and broadcast cheap.
  const items = [];
  const subscribers = new Set();
  let seq = 0;

  function push(entry) {
    const enriched = {
      ...entry,
      summary: entry.summary ?? computeSummary(entry.rawBody),
    };
    items.unshift(enriched);
    if (items.length > cap) {
      items.length = cap;
    }
    for (const fn of subscribers) {
      try {
        fn(enriched);
      } catch (err) {
        // A single broken subscriber must not break the others or the
        // webhook delivery path. Surface to stderr and continue.
        process.stderr.write(
          `logs subscriber failed (non-fatal): ${err.message}\n`,
        );
      }
    }
    seq++;
    return enriched;
  }

  function entries() {
    return items.slice();
  }

  function clear() {
    items.length = 0;
  }

  function subscribe(fn) {
    subscribers.add(fn);
    return function unsubscribe() {
      subscribers.delete(fn);
    };
  }

  return { push, entries, clear, subscribe, get size() { return items.length; }, get seq() { return seq; } };
}

// HTML page is one template string. Single quotes inside; no nested
// backticks. Inter Variable loaded from Google Fonts CDN (one external
// request). System stack fallback covers offline dev.
const HTML_PAGE =
  '<!DOCTYPE html>\n' +
  '<html lang="en">\n' +
  '<head>\n' +
  '<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '<title>HookMyApp Starter Kit · Logs</title>\n' +
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap">\n' +
  '<style>\n' +
  ':root {\n' +
  '  --canvas: #08090a;\n' +
  '  --panel: #0f1011;\n' +
  '  --surface: #191a1b;\n' +
  '  --surface-2: #28282c;\n' +
  '  --border-subtle: rgba(255, 255, 255, 0.05);\n' +
  '  --border-translucent: rgba(255, 255, 255, 0.08);\n' +
  '  --text-primary: #f7f8f8;\n' +
  '  --text-secondary: #d0d6e0;\n' +
  '  --text-tertiary: #8a8f98;\n' +
  '  --text-quaternary: #62666d;\n' +
  '  --indigo-primary: #5e6ad2;\n' +
  '  --indigo-accent: #7170ff;\n' +
  '  --indigo-hover: #828fff;\n' +
  '  --green: #27a644;\n' +
  '  --red: #ef4444;\n' +
  '  --grey-status: #62666d;\n' +
  "  --font-sans: 'Inter Variable', 'Inter', -apple-system, BlinkMacSystemFont,\n" +
  "               'SF Pro Display', system-ui, 'Segoe UI', Roboto, sans-serif;\n" +
  "  --font-mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;\n" +
  "  --font-features: 'cv01', 'ss03';\n" +
  '}\n' +
  '* { box-sizing: border-box; }\n' +
  'html, body { height: 100%; }\n' +
  'body {\n' +
  '  background: var(--canvas);\n' +
  '  color: var(--text-primary);\n' +
  '  font-family: var(--font-sans);\n' +
  '  font-feature-settings: var(--font-features);\n' +
  '  font-weight: 400;\n' +
  '  margin: 0;\n' +
  '  font-variant-numeric: tabular-nums;\n' +
  '  -webkit-font-smoothing: antialiased;\n' +
  '}\n' +
  'header.bar {\n' +
  '  position: sticky;\n' +
  '  top: 0;\n' +
  '  z-index: 10;\n' +
  '  display: flex;\n' +
  '  align-items: center;\n' +
  '  gap: 16px;\n' +
  '  height: 56px;\n' +
  '  padding: 0 20px;\n' +
  '  background: var(--panel);\n' +
  '  border-bottom: 1px solid var(--border-subtle);\n' +
  '}\n' +
  'header.bar .right { margin-left: auto; display: flex; align-items: center; gap: 12px; }\n' +
  'header.bar .toggle { /* keep toggle in flow next to nav, not pushed to the right */ }\n' +
  '.brand { display: flex; align-items: baseline; gap: 8px; }\n' +
  '.brand .wordmark {\n' +
  '  font-size: 15px;\n' +
  '  font-weight: 600;\n' +
  '  color: var(--text-primary);\n' +
  '  letter-spacing: -0.01em;\n' +
  '}\n' +
  '.brand .sub {\n' +
  '  font-size: 12px;\n' +
  '  font-weight: 400;\n' +
  '  color: var(--text-tertiary);\n' +
  '}\n' +
  'nav.tabs { display: flex; gap: 2px; padding: 3px; background: var(--surface); border-radius: 8px; }\n' +
  'nav.tabs a { padding: 6px 12px; font-size: 13px; font-weight: 500; color: var(--text-tertiary); text-decoration: none; border-radius: 6px; transition: color 120ms, background 120ms; }\n' +
  'nav.tabs a:hover { color: var(--text-primary); }\n' +
  'nav.tabs a.active { color: var(--text-primary); background: var(--surface-2); }\n' +
  '.toggle {\n' +
  '  display: inline-flex;\n' +
  '  gap: 2px;\n' +
  '  padding: 2px;\n' +
  '  background: rgba(255, 255, 255, 0.04);\n' +
  '  border: 1px solid var(--border-translucent);\n' +
  '  border-radius: 6px;\n' +
  '}\n' +
  '.toggle button {\n' +
  '  background: transparent;\n' +
  '  border: 0;\n' +
  '  color: var(--text-tertiary);\n' +
  '  font-family: inherit;\n' +
  '  font-size: 12px;\n' +
  '  font-weight: 510;\n' +
  '  padding: 4px 12px;\n' +
  '  border-radius: 4px;\n' +
  '  cursor: pointer;\n' +
  '  letter-spacing: -0.05px;\n' +
  '}\n' +
  '.toggle button[aria-selected="true"] {\n' +
  '  background: var(--surface);\n' +
  '  color: var(--text-primary);\n' +
  '}\n' +
  '.right { display: flex; align-items: center; gap: 12px; }\n' +
  '.count { font-size: 12px; color: var(--text-tertiary); }\n' +
  '.ghost-btn {\n' +
  '  background: transparent;\n' +
  '  border: 1px solid var(--border-translucent);\n' +
  '  color: var(--text-secondary);\n' +
  '  font-family: inherit;\n' +
  '  font-size: 12px;\n' +
  '  font-weight: 510;\n' +
  '  padding: 4px 10px;\n' +
  '  border-radius: 6px;\n' +
  '  cursor: pointer;\n' +
  '}\n' +
  '.ghost-btn:hover { background: rgba(255, 255, 255, 0.04); }\n' +
  'main { padding: 0; }\n' +
  '.empty {\n' +
  '  margin: 80px auto 0;\n' +
  '  max-width: 520px;\n' +
  '  text-align: center;\n' +
  '  font-size: 16px;\n' +
  '  color: var(--text-tertiary);\n' +
  '  font-weight: 400;\n' +
  '}\n' +
  '.empty.hidden { display: none; }\n' +
  'ol.list { list-style: none; margin: 0; padding: 0; }\n' +
  'li.row {\n' +
  '  border-bottom: 1px solid var(--border-subtle);\n' +
  '  padding: 0;\n' +
  '}\n' +
  '.row .head {\n' +
  '  display: flex;\n' +
  '  align-items: center;\n' +
  '  gap: 12px;\n' +
  '  height: 36px;\n' +
  '  padding: 0 20px;\n' +
  '  cursor: pointer;\n' +
  '  white-space: nowrap;\n' +
  '  overflow: hidden;\n' +
  '}\n' +
  '.row .head:hover { background: rgba(255, 255, 255, 0.02); }\n' +
  '.row time {\n' +
  '  font-family: var(--font-mono);\n' +
  '  font-size: 13px;\n' +
  '  font-weight: 400;\n' +
  '  color: var(--text-quaternary);\n' +
  '  width: 14ch;\n' +
  '  display: inline-block;\n' +
  '  flex-shrink: 0;\n' +
  '}\n' +
  '.row .from {\n' +
  '  font-size: 13px;\n' +
  '  font-weight: 510;\n' +
  '  color: var(--text-secondary);\n' +
  '  flex-shrink: 0;\n' +
  '}\n' +
  '.row .preview {\n' +
  '  font-size: 13px;\n' +
  '  color: var(--text-tertiary);\n' +
  '  white-space: nowrap;\n' +
  '  overflow: hidden;\n' +
  '  text-overflow: ellipsis;\n' +
  '  flex: 1 1 auto;\n' +
  '  min-width: 0;\n' +
  '}\n' +
  '.row .preview .label {\n' +
  '  color: var(--text-primary);\n' +
  '  font-weight: 510;\n' +
  '  margin-right: 6px;\n' +
  '}\n' +
  '.card {\n' +
  '  background: rgba(255, 255, 255, 0.02);\n' +
  '  border: 1px solid var(--border-translucent);\n' +
  '  border-radius: 8px;\n' +
  '  margin: 0 20px 16px;\n' +
  '  padding: 16px;\n' +
  '  display: none;\n' +
  '}\n' +
  '.row.expanded .card { display: block; }\n' +
  '.card .top { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }\n' +
  '.pill {\n' +
  '  display: inline-block;\n' +
  '  padding: 0 8px;\n' +
  '  border-radius: 9999px;\n' +
  '  font-size: 11px;\n' +
  '  font-weight: 510;\n' +
  '  background: transparent;\n' +
  '  line-height: 18px;\n' +
  '  height: 18px;\n' +
  '}\n' +
  '.pill.valid { color: var(--green); border: 1px solid rgba(39, 166, 68, 0.5); }\n' +
  '.pill.invalid { color: var(--red); border: 1px solid rgba(239, 68, 68, 0.5); }\n' +
  '.pill.unsigned { color: var(--grey-status); border: 1px solid rgba(98, 102, 109, 0.5); }\n' +
  '.size-badge {\n' +
  '  background: rgba(255, 255, 255, 0.05);\n' +
  '  border-radius: 2px;\n' +
  '  font-size: 11px;\n' +
  '  font-weight: 510;\n' +
  '  padding: 0 6px;\n' +
  '  color: var(--text-quaternary);\n' +
  '  line-height: 18px;\n' +
  '  height: 18px;\n' +
  '}\n' +
  '.headers {\n' +
  '  display: grid;\n' +
  '  grid-template-columns: max-content 1fr;\n' +
  '  gap: 4px 16px;\n' +
  '  font-family: var(--font-mono);\n' +
  '  font-size: 13px;\n' +
  '  margin-bottom: 12px;\n' +
  '}\n' +
  '.headers .k { color: var(--text-tertiary); }\n' +
  '.headers .v { color: var(--text-secondary); word-break: break-all; }\n' +
  'details { margin-top: 8px; }\n' +
  'details summary {\n' +
  '  font-size: 13px;\n' +
  '  font-weight: 510;\n' +
  '  color: var(--text-secondary);\n' +
  '  cursor: pointer;\n' +
  '  padding: 4px 0;\n' +
  '  user-select: none;\n' +
  '}\n' +
  'details summary:hover { color: var(--text-primary); }\n' +
  '.tree {\n' +
  '  list-style: none;\n' +
  '  padding-left: 14px;\n' +
  '  margin: 6px 0 0;\n' +
  '  font-family: var(--font-mono);\n' +
  '  font-size: 12px;\n' +
  '  color: var(--text-secondary);\n' +
  '  line-height: 1.6;\n' +
  '}\n' +
  '.tree .key { color: var(--text-tertiary); }\n' +
  'pre.raw {\n' +
  '  background: var(--surface-2);\n' +
  '  border: 1px solid var(--border-translucent);\n' +
  '  border-radius: 6px;\n' +
  '  padding: 12px;\n' +
  '  margin-top: 6px;\n' +
  '  font-family: var(--font-mono);\n' +
  '  font-size: 12px;\n' +
  '  line-height: 1.5;\n' +
  '  color: var(--text-secondary);\n' +
  '  overflow-x: auto;\n' +
  '  white-space: pre;\n' +
  '}\n' +
  '</style>\n' +
  '</head>\n' +
  '<body>\n' +
  '<header class="bar">\n' +
  '  <div class="brand">\n' +
  '    <span class="wordmark">HookMyApp Starter Kit</span>\n' +
  '  </div>\n' +
  '  <nav class="tabs" aria-label="Sections">\n' +
  '    <a href="/chat">Chat</a>\n' +
  '    <a href="/logs" class="active" aria-current="page">Logs</a>\n' +
  '  </nav>\n' +
  '  <div class="toggle" role="tablist" aria-label="View mode">\n' +
  '    <button id="mode-compact" role="tab" aria-selected="true">Compact</button>\n' +
  '    <button id="mode-verbose" role="tab" aria-selected="false">Verbose</button>\n' +
  '  </div>\n' +
  '  <div class="right">\n' +
  '    <span class="count" id="count">0 entries</span>\n' +
  '    <button class="ghost-btn" id="clear-btn">Clear</button>\n' +
  '  </div>\n' +
  '</header>\n' +
  '<main>\n' +
  '  <p class="empty" id="empty" role="status" aria-live="polite">Waiting for webhooks. Send a test from your phone to see it here.</p>\n' +
  '  <ol class="list" id="list"></ol>\n' +
  '</main>\n' +
  '<script>\n' +
  '(function () {\n' +
  '  var STORAGE_KEY = "hookmyapp.logs.viewMode";\n' +
  '  var entries = [];\n' +
  '  var expanded = new Set();\n' +
  '  var mode = "compact";\n' +
  '  try { mode = localStorage.getItem(STORAGE_KEY) || "compact"; } catch (e) { mode = "compact"; }\n' +
  '  if (mode !== "compact" && mode !== "verbose") mode = "compact";\n' +
  '\n' +
  '  var listEl = document.getElementById("list");\n' +
  '  var emptyEl = document.getElementById("empty");\n' +
  '  var countEl = document.getElementById("count");\n' +
  '  var compactBtn = document.getElementById("mode-compact");\n' +
  '  var verboseBtn = document.getElementById("mode-verbose");\n' +
  '  var clearBtn = document.getElementById("clear-btn");\n' +
  '\n' +
  '  function escapeText(s) { return String(s == null ? "" : s); }\n' +
  '  function pad2(n) { return n < 10 ? "0" + n : "" + n; }\n' +
  '  function pad3(n) { if (n < 10) return "00" + n; if (n < 100) return "0" + n; return "" + n; }\n' +
  '  function formatTime(iso) {\n' +
  '    try {\n' +
  '      var d = new Date(iso);\n' +
  '      return "[" + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds()) + "." + pad3(d.getMilliseconds()) + "]";\n' +
  '    } catch (e) { return "[??:??:??.???]"; }\n' +
  '  }\n' +
  '  function fromLabel(entry) {\n' +
  '    var f = entry && entry.summary && entry.summary.from;\n' +
  '    if (!f) return "system";\n' +
  '    return f.charAt(0) === "+" ? f : "+" + f;\n' +
  '  }\n' +
  '  function previewText(entry) {\n' +
  '    var s = entry && entry.summary;\n' +
  '    if (!s) return { label: "other:", value: "unknown" };\n' +
  '    if (s.type === "message") {\n' +
  '      var t = s.text == null ? "" : String(s.text);\n' +
  '      if (t.length > 60) t = t.slice(0, 60 - 1) + "\\u2026";\n' +
  '      return { label: "msg:", value: \'"\' + t + \'"\' };\n' +
  '    }\n' +
  '    if (s.type === "status") return { label: "status:", value: s.status || "unknown" };\n' +
  '    if (s.type === "template") return { label: "template:", value: s.label || "template" };\n' +
  '    return { label: "other:", value: s.label || "unknown" };\n' +
  '  }\n' +
  '\n' +
  '  function renderTree(value, depth) {\n' +
  '    var ul = document.createElement("ul");\n' +
  '    ul.className = "tree";\n' +
  '    if (value === null || typeof value !== "object") {\n' +
  '      var li = document.createElement("li");\n' +
  '      li.textContent = JSON.stringify(value);\n' +
  '      ul.appendChild(li);\n' +
  '      return ul;\n' +
  '    }\n' +
  '    var keys = Array.isArray(value) ? value.map(function (_, i) { return i; }) : Object.keys(value);\n' +
  '    for (var i = 0; i < keys.length; i++) {\n' +
  '      var k = keys[i];\n' +
  '      var v = value[k];\n' +
  '      var item = document.createElement("li");\n' +
  '      var span = document.createElement("span");\n' +
  '      span.className = "key";\n' +
  '      span.textContent = String(k) + ":";\n' +
  '      item.appendChild(span);\n' +
  '      if (v !== null && typeof v === "object") {\n' +
  '        if (depth < 4) {\n' +
  '          item.appendChild(renderTree(v, depth + 1));\n' +
  '        } else {\n' +
  '          var more = document.createElement("span");\n' +
  '          more.textContent = " " + (Array.isArray(v) ? "[\\u2026]" : "{\\u2026}");\n' +
  '          item.appendChild(more);\n' +
  '        }\n' +
  '      } else {\n' +
  '        var val = document.createElement("span");\n' +
  '        val.textContent = " " + JSON.stringify(v);\n' +
  '        item.appendChild(val);\n' +
  '      }\n' +
  '      ul.appendChild(item);\n' +
  '    }\n' +
  '    return ul;\n' +
  '  }\n' +
  '\n' +
  '  function buildHead(entry) {\n' +
  '    var head = document.createElement("div");\n' +
  '    head.className = "head";\n' +
  '\n' +
  '    var t = document.createElement("time");\n' +
  '    t.textContent = formatTime(entry.receivedAt);\n' +
  '    head.appendChild(t);\n' +
  '\n' +
  '    var fromSpan = document.createElement("span");\n' +
  '    fromSpan.className = "from";\n' +
  '    fromSpan.textContent = fromLabel(entry);\n' +
  '    head.appendChild(fromSpan);\n' +
  '\n' +
  '    var prev = previewText(entry);\n' +
  '    var p = document.createElement("span");\n' +
  '    p.className = "preview";\n' +
  '    var labelSpan = document.createElement("span");\n' +
  '    labelSpan.className = "label";\n' +
  '    labelSpan.textContent = prev.label;\n' +
  '    p.appendChild(labelSpan);\n' +
  '    var valSpan = document.createElement("span");\n' +
  '    valSpan.textContent = prev.value;\n' +
  '    p.appendChild(valSpan);\n' +
  '    head.appendChild(p);\n' +
  '    return head;\n' +
  '  }\n' +
  '\n' +
  '  function buildCard(entry) {\n' +
  '    var card = document.createElement("div");\n' +
  '    card.className = "card";\n' +
  '\n' +
  '    var top = document.createElement("div");\n' +
  '    top.className = "top";\n' +
  '    var pill = document.createElement("span");\n' +
  '    var sigState = entry.signatureValid === true ? "valid" : entry.signatureValid === false ? "invalid" : "unsigned";\n' +
  '    pill.className = "pill " + sigState;\n' +
  '    pill.textContent = sigState === "valid" ? "Valid" : sigState === "invalid" ? "Invalid" : "Unsigned";\n' +
  '    pill.setAttribute("aria-label", sigState === "valid" ? "Signature valid" : sigState === "invalid" ? "Signature invalid" : "Signature absent");\n' +
  '    top.appendChild(pill);\n' +
  '    var size = document.createElement("span");\n' +
  '    size.className = "size-badge";\n' +
  '    size.textContent = (entry.byteSize || 0) + " bytes";\n' +
  '    top.appendChild(size);\n' +
  '    card.appendChild(top);\n' +
  '\n' +
  '    var headers = document.createElement("div");\n' +
  '    headers.className = "headers";\n' +
  '    var h = entry.headers || {};\n' +
  '    var hk = Object.keys(h);\n' +
  '    for (var i = 0; i < hk.length; i++) {\n' +
  '      var key = document.createElement("span");\n' +
  '      key.className = "k";\n' +
  '      key.textContent = hk[i];\n' +
  '      var val = document.createElement("span");\n' +
  '      val.className = "v";\n' +
  '      val.textContent = h[hk[i]] == null ? "(none)" : String(h[hk[i]]);\n' +
  '      headers.appendChild(key);\n' +
  '      headers.appendChild(val);\n' +
  '    }\n' +
  '    card.appendChild(headers);\n' +
  '\n' +
  '    var parsedDetails = document.createElement("details");\n' +
  '    var parsedSum = document.createElement("summary");\n' +
  '    parsedSum.textContent = "Parsed entry / changes / value";\n' +
  '    parsedDetails.appendChild(parsedSum);\n' +
  '    var tree = entry.rawBody && entry.rawBody.entry ? entry.rawBody.entry : entry.rawBody;\n' +
  '    parsedDetails.appendChild(renderTree(tree, 0));\n' +
  '    card.appendChild(parsedDetails);\n' +
  '\n' +
  '    var rawDetails = document.createElement("details");\n' +
  '    var rawSum = document.createElement("summary");\n' +
  '    rawSum.textContent = "Raw payload";\n' +
  '    rawDetails.appendChild(rawSum);\n' +
  '    var pre = document.createElement("pre");\n' +
  '    pre.className = "raw";\n' +
  '    try { pre.textContent = JSON.stringify(entry.rawBody, null, 2); } catch (e) { pre.textContent = "(unserializable)"; }\n' +
  '    rawDetails.appendChild(pre);\n' +
  '    card.appendChild(rawDetails);\n' +
  '\n' +
  '    return card;\n' +
  '  }\n' +
  '\n' +
  '  function renderEntry(entry) {\n' +
  '    var li = document.createElement("li");\n' +
  '    li.className = "row";\n' +
  '    li.dataset.id = entry.id;\n' +
  '    var isExpanded = mode === "verbose" || expanded.has(entry.id);\n' +
  '    if (isExpanded) li.classList.add("expanded");\n' +
  '    var head = buildHead(entry);\n' +
  '    head.addEventListener("click", function () {\n' +
  '      if (mode === "verbose") return;\n' +
  '      if (expanded.has(entry.id)) { expanded.delete(entry.id); li.classList.remove("expanded"); }\n' +
  '      else { expanded.add(entry.id); li.classList.add("expanded"); }\n' +
  '    });\n' +
  '    li.appendChild(head);\n' +
  '    li.appendChild(buildCard(entry));\n' +
  '    return li;\n' +
  '  }\n' +
  '\n' +
  '  function updateCount() {\n' +
  '    countEl.textContent = entries.length + (entries.length === 1 ? " entry" : " entries");\n' +
  '    emptyEl.classList.toggle("hidden", entries.length > 0);\n' +
  '  }\n' +
  '\n' +
  '  function renderAll() {\n' +
  '    listEl.textContent = "";\n' +
  '    for (var i = 0; i < entries.length; i++) {\n' +
  '      listEl.appendChild(renderEntry(entries[i]));\n' +
  '    }\n' +
  '    updateCount();\n' +
  '  }\n' +
  '\n' +
  '  function applyMode(next) {\n' +
  '    mode = next;\n' +
  '    try { localStorage.setItem(STORAGE_KEY, mode); } catch (e) { /* ignore */ }\n' +
  '    compactBtn.setAttribute("aria-selected", mode === "compact" ? "true" : "false");\n' +
  '    verboseBtn.setAttribute("aria-selected", mode === "verbose" ? "true" : "false");\n' +
  '    if (mode === "verbose") expanded.clear();\n' +
  '    renderAll();\n' +
  '  }\n' +
  '\n' +
  '  compactBtn.addEventListener("click", function () { applyMode("compact"); });\n' +
  '  verboseBtn.addEventListener("click", function () { applyMode("verbose"); });\n' +
  '  clearBtn.addEventListener("click", function () { entries = []; expanded.clear(); renderAll(); });\n' +
  '\n' +
  '  document.addEventListener("keydown", function (e) {\n' +
  '    var tag = e.target && e.target.tagName;\n' +
  '    if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;\n' +
  '    if (e.key === "v" || e.key === "V") { applyMode(mode === "compact" ? "verbose" : "compact"); }\n' +
  '    else if (e.key === "c" || e.key === "C") { entries = []; expanded.clear(); renderAll(); }\n' +
  '  });\n' +
  '\n' +
  '  applyMode(mode);\n' +
  '\n' +
  '  var es = new EventSource("/logs/stream");\n' +
  '  es.addEventListener("bootstrap", function (ev) {\n' +
  '    try { entries = JSON.parse(ev.data) || []; } catch (e) { entries = []; }\n' +
  '    renderAll();\n' +
  '  });\n' +
  '  es.addEventListener("entry", function (ev) {\n' +
  '    try {\n' +
  '      var entry = JSON.parse(ev.data);\n' +
  '      entries.unshift(entry);\n' +
  '      if (entries.length > 100) entries.length = 100;\n' +
  '      var node = renderEntry(entry);\n' +
  '      if (listEl.firstChild) listEl.insertBefore(node, listEl.firstChild);\n' +
  '      else listEl.appendChild(node);\n' +
  '      updateCount();\n' +
  '      if (window.scrollY === 0) window.scrollTo(0, 0);\n' +
  '    } catch (e) { /* ignore malformed event */ }\n' +
  '  });\n' +
  '})();\n' +
  '</script>\n' +
  '</body>\n' +
  '</html>\n';

export function mountLogs(app, buffer) {
  app.get('/logs', (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.send(HTML_PAGE);
  });

  app.get('/logs/stream', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    res.write('retry: 2000\n\n');

    // Bootstrap the client with current buffer (newest-first).
    const snapshot = buffer.entries();
    res.write('event: bootstrap\n');
    res.write('data: ' + JSON.stringify(snapshot) + '\n\n');

    const unsubscribe = buffer.subscribe((entry) => {
      try {
        res.write('event: entry\n');
        res.write('data: ' + JSON.stringify(entry) + '\n\n');
      } catch {
        // Connection broken; the close handler below will clean up.
      }
    });

    req.on('close', () => {
      unsubscribe();
      try {
        res.end();
      } catch {
        // ignore
      }
    });
  });
}

// Exported only so that ad-hoc tests / future tooling can reuse the same
// payload-shape inference. Not part of the public mountLogs contract.
export { computeSummary, safeStringifyByteSize };
