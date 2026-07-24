// /comments — incoming Instagram comments on the connected account's media,
// with an inline reply per comment. Mirrors chat.js (buffer + SSE + reply
// endpoint); reply routes to POST {comment-id}/replies via deps.reply.

export function createCommentBuffer({ cap = 200 } = {}) {
  const items = []; // newest at the end
  const subscribers = new Set();

  function push(entry) {
    items.push(entry);
    if (items.length > cap) items.splice(0, items.length - cap);
    for (const fn of subscribers) {
      try { fn(entry); } catch (err) {
        process.stderr.write(`comment subscriber failed (non-fatal): ${err.message}\n`);
      }
    }
    return entry;
  }
  function entries() { return items.slice(); }
  function subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); }

  return { push, entries, subscribe, get size() { return items.length; } };
}

const HTML_PAGE =
  '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
  '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '<title>HookMyApp Starter Kit · Comments</title>\n' +
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap">\n' +
  '<style>\n' +
  ':root {\n' +
  '  --canvas: #08090a; --panel: #0f1011; --surface: #191a1b; --surface-2: #28282c;\n' +
  '  --border-subtle: rgba(255,255,255,0.05); --border-translucent: rgba(255,255,255,0.08);\n' +
  '  --text-primary: #f7f8f8; --text-secondary: #d0d6e0; --text-tertiary: #8a8f98;\n' +
  '  --indigo-primary: #5e6ad2; --indigo-accent: #7170ff; --green: #27a644; --amber: #f5a524;\n' +
  '  --font-sans: \'Inter Variable\',\'Inter\',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;\n' +
  '}\n' +
  '* { box-sizing: border-box; }\n' +
  'html, body { height: 100%; margin: 0; }\n' +
  'body { background: var(--canvas); color: var(--text-primary); font-family: var(--font-sans); -webkit-font-smoothing: antialiased; font-feature-settings: "ss01","ss02"; }\n' +
  'header.bar { display: flex; align-items: center; gap: 16px; height: 56px; padding: 0 20px; background: var(--panel); border-bottom: 1px solid var(--border-subtle); }\n' +
  '.brand .wordmark { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }\n' +
  'nav.tabs { display: flex; gap: 2px; padding: 3px; background: var(--surface); border-radius: 8px; }\n' +
  'nav.tabs a { padding: 6px 12px; font-size: 13px; font-weight: 500; color: var(--text-tertiary); text-decoration: none; border-radius: 6px; transition: color 120ms, background 120ms; }\n' +
  'nav.tabs a:hover { color: var(--text-primary); }\n' +
  'nav.tabs a.active { color: var(--text-primary); background: var(--surface-2); }\n' +
  '@media (max-width: 640px) { header.bar { flex-wrap: wrap; height: auto; padding: 8px 12px; } nav.tabs { overflow-x: auto; max-width: 100%; } }\n' +
  '.right-controls { margin-left: auto; display: flex; align-items: center; gap: 12px; }\n' +
  '.conn { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-tertiary); }\n' +
  '.conn .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-tertiary); }\n' +
  '.conn.live .dot { background: var(--green); box-shadow: 0 0 0 3px rgba(39,166,68,0.15); }\n' +
  '.conn.reconnecting .dot { background: var(--amber); }\n' +
  '\n' +
  '.wrap { max-width: 680px; margin: 0 auto; padding: 22px 20px 60px; }\n' +
  '.col-head { font-size: 11px; font-weight: 500; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.06em; margin: 4px 2px 14px; }\n' +
  '.card { background: var(--panel); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 14px 16px; margin-bottom: 12px; animation: fadeUp 180ms ease-out; }\n' +
  '@keyframes fadeUp { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }\n' +
  '.c-top { display: flex; align-items: baseline; gap: 8px; }\n' +
  '.c-user { font-size: 13.5px; font-weight: 600; color: var(--text-primary); }\n' +
  '.c-when { font-size: 11px; color: var(--text-tertiary); margin-left: auto; }\n' +
  '.c-text { font-size: 14px; line-height: 1.45; color: var(--text-secondary); margin: 6px 0 0; white-space: pre-wrap; word-wrap: break-word; }\n' +
  '.reply-row { display: flex; gap: 8px; margin-top: 12px; }\n' +
  '.reply-row input { flex: 1; background: var(--surface); border: 1px solid var(--border-translucent); border-radius: 10px; color: var(--text-primary); padding: 9px 13px; font-size: 13.5px; font-family: inherit; }\n' +
  '.reply-row input:focus { outline: none; border-color: var(--indigo-accent); }\n' +
  '.reply-row button { min-width: 66px; background: var(--indigo-primary); color: #fff; border: 0; border-radius: 10px; padding: 0 16px; font-size: 13px; font-weight: 510; cursor: pointer; transition: background 120ms; }\n' +
  '.reply-row button:hover:not(:disabled) { background: var(--indigo-accent); }\n' +
  '.reply-row button:disabled { opacity: 0.5; cursor: not-allowed; }\n' +
  '.reply-err { color: #f5b8b8; font-size: 12.5px; margin-top: 6px; }\n' +
  '.sent { margin-top: 11px; padding: 9px 12px; background: rgba(94,106,210,0.10); border-left: 2px solid var(--indigo-primary); border-radius: 0 8px 8px 0; font-size: 13.5px; color: var(--text-secondary); }\n' +
  '.sent .you { color: var(--text-tertiary); font-weight: 600; margin-right: 4px; }\n' +
  '.empty { color: var(--text-tertiary); font-size: 13.5px; padding: 48px 20px; text-align: center; line-height: 1.55; }\n' +
  '.empty .hint { font-size: 12px; margin-top: 6px; }\n' +
  '</style>\n</head>\n<body>\n' +
  '<header class="bar">\n' +
  '  <div class="brand"><span class="wordmark">HookMyApp Starter Kit</span></div>\n' +
  '  <nav class="tabs" aria-label="Sections">\n' +
  '    <a href="/chat">Chat</a>\n' +
  '    <a href="/comments" class="active" aria-current="page">Comments</a>\n' +
  '    <a href="/publish">Publish</a>\n' +
  '    <a href="/insights">Insights</a>\n' +
  '    <a href="/logs">Logs</a>\n' +
  '  </nav>\n' +
  '  <div class="right-controls">\n' +
  '    <span class="conn" id="conn" title="SSE connection state"><span class="dot"></span><span id="conn-label">connecting</span></span>\n' +
  '  </div>\n' +
  '</header>\n' +
  '<div class="wrap">\n' +
  '  <div class="col-head">Comments on your posts</div>\n' +
  '  <div id="list"></div>\n' +
  '  <div class="empty" id="empty">Waiting for comments.<div class="hint">Comment on one of the connected account\'s posts to see it here.</div></div>\n' +
  '</div>\n' +
  '<script>\n' +
  '(function () {\n' +
  '  var byId = Object.create(null);   /* commentId -> { comment, replies:[] } */\n' +
  '  var order = [];                   /* commentIds, newest last */\n' +
  '  var list = document.getElementById("list");\n' +
  '  var empty = document.getElementById("empty");\n' +
  '  var conn = document.getElementById("conn");\n' +
  '  var connLabel = document.getElementById("conn-label");\n' +
  '\n' +
  '  function setConn(s) { conn.className = "conn " + s; connLabel.textContent = s === "live" ? "live" : s === "reconnecting" ? "reconnecting" : "connecting"; }\n' +
  '  function fmtTime(iso) { try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }\n' +
  '\n' +
  '  function record(entry) {\n' +
  '    var id = entry.commentId; if (!id) return;\n' +
  '    if (!byId[id]) { byId[id] = { comment: null, replies: [] }; order.push(id); }\n' +
  '    if (entry.direction === "out") byId[id].replies.push(entry); else byId[id].comment = entry;\n' +
  '  }\n' +
  '\n' +
  '  function render() {\n' +
  '    list.textContent = "";\n' +
  '    if (order.length === 0) { empty.style.display = ""; return; }\n' +
  '    empty.style.display = "none";\n' +
  '    for (var i = order.length - 1; i >= 0; i--) {\n' +
  '      var node = byId[order[i]]; var c = node.comment; if (!c) continue;\n' +
  '      var card = document.createElement("div"); card.className = "card";\n' +
  '      var top = document.createElement("div"); top.className = "c-top";\n' +
  '      var u = document.createElement("span"); u.className = "c-user"; u.textContent = c.username ? "@" + c.username : (c.from || "Someone");\n' +
  '      var w = document.createElement("span"); w.className = "c-when"; w.textContent = fmtTime(c.ts);\n' +
  '      top.appendChild(u); top.appendChild(w); card.appendChild(top);\n' +
  '      var t = document.createElement("div"); t.className = "c-text"; t.textContent = c.text || ""; card.appendChild(t);\n' +
  '      for (var j = 0; j < node.replies.length; j++) {\n' +
  '        var s = document.createElement("div"); s.className = "sent";\n' +
  '        var you = document.createElement("span"); you.className = "you"; you.textContent = "You replied:";\n' +
  '        s.appendChild(you); s.appendChild(document.createTextNode(" " + (node.replies[j].text || ""))); card.appendChild(s);\n' +
  '      }\n' +
  '      card.appendChild(replyRow(c.commentId));\n' +
  '      list.appendChild(card);\n' +
  '    }\n' +
  '  }\n' +
  '\n' +
  '  function replyRow(commentId) {\n' +
  '    var wrap = document.createElement("div");\n' +
  '    var form = document.createElement("form"); form.className = "reply-row"; form.autocomplete = "off";\n' +
  '    var input = document.createElement("input"); input.placeholder = "Reply to this comment";\n' +
  '    var btn = document.createElement("button"); btn.type = "submit"; btn.textContent = "Reply";\n' +
  '    var errBox = document.createElement("div"); errBox.className = "reply-err";\n' +
  '    form.appendChild(input); form.appendChild(btn);\n' +
  '    wrap.appendChild(form); wrap.appendChild(errBox);\n' +
  '    form.addEventListener("submit", function (e) {\n' +
  '      e.preventDefault();\n' +
  '      var text = input.value.trim(); if (!text) return;\n' +
  '      btn.disabled = true; errBox.textContent = "";\n' +
  '      fetch("/comments/reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commentId: commentId, text: text }) })\n' +
  '        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, body: j }; }); })\n' +
  '        .then(function (res) {\n' +
  '          /* Only a confirmed success clears the input; failures keep the draft and show why. */\n' +
  '          if (res.ok && res.body && res.body.status === "ok") { input.value = ""; }\n' +
  '          else { errBox.textContent = "Reply failed: " + ((res.body && res.body.error) || "unknown error"); }\n' +
  '        })\n' +
  '        .catch(function (err) { errBox.textContent = "Reply failed: " + err.message; })\n' +
  '        .finally(function () { btn.disabled = false; });\n' +
  '    });\n' +
  '    return wrap;\n' +
  '  }\n' +
  '\n' +
  '  setConn("connecting");\n' +
  '  var es = new EventSource("/comments/stream");\n' +
  '  es.addEventListener("open", function () { setConn("live"); });\n' +
  '  es.addEventListener("error", function () { setConn("reconnecting"); });\n' +
  '  es.addEventListener("bootstrap", function (ev) {\n' +
  '    setConn("live");\n' +
  '    try { var rows = JSON.parse(ev.data) || []; byId = Object.create(null); order = []; for (var i = 0; i < rows.length; i++) record(rows[i]); render(); } catch (e) {}\n' +
  '  });\n' +
  '  es.addEventListener("entry", function (ev) {\n' +
  '    try { record(JSON.parse(ev.data)); render(); } catch (e) {}\n' +
  '  });\n' +
  '})();\n' +
  '</script>\n</body>\n</html>\n';

export function mountComments(app, buffer, deps = {}) {
  const reply = deps.reply;

  app.get('/comments', (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.send(HTML_PAGE);
  });

  app.get('/comments/stream', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    res.write('retry: 2000\n\n');
    res.write('event: bootstrap\n');
    res.write('data: ' + JSON.stringify(buffer.entries()) + '\n\n');

    const unsubscribe = buffer.subscribe((entry) => {
      try {
        res.write('event: entry\n');
        res.write('data: ' + JSON.stringify(entry) + '\n\n');
      } catch { /* connection broken; close handler cleans up */ }
    });
    req.on('close', () => { unsubscribe(); try { res.end(); } catch { /* ignore */ } });
  });

  app.post('/comments/reply', async (req, res) => {
    const body = req.body ?? {};
    const commentId = typeof body.commentId === 'string' ? body.commentId : null;
    // Trim server-side too — the page trims, but the endpoint is callable directly.
    const text = typeof body.text === 'string' ? body.text.trim() : null;
    if (!commentId || !text) return res.status(400).json({ status: 'error', error: 'commentId and non-empty text are required' });
    if (typeof reply !== 'function') return res.status(400).json({ status: 'error', error: 'comment reply not configured' });
    try {
      await reply(commentId, text);
      buffer.push({ direction: 'out', commentId, text, ts: new Date().toISOString() });
      res.json({ status: 'ok' });
    } catch (err) {
      // err.message is provider-sanitized (Meta message + code only) — safe to expose.
      res.status(502).json({ status: 'error', error: err.message });
    }
  });
}
