// /insights — read-only account analytics for the connected Instagram account
// via the Insights API. Profile counters plus day-level reach/engagement tiles.

const HTML_PAGE =
  '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
  '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '<title>HookMyApp Starter Kit · Insights</title>\n' +
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap">\n' +
  '<style>\n' +
  ':root {\n' +
  '  --canvas: #08090a; --panel: #0f1011; --surface: #191a1b; --surface-2: #28282c;\n' +
  '  --border-subtle: rgba(255,255,255,0.05); --border-translucent: rgba(255,255,255,0.08);\n' +
  '  --text-primary: #f7f8f8; --text-secondary: #d0d6e0; --text-tertiary: #8a8f98;\n' +
  '  --indigo-primary: #5e6ad2; --indigo-accent: #7170ff;\n' +
  '  --font-sans: \'Inter Variable\',\'Inter\',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;\n' +
  '}\n' +
  '* { box-sizing: border-box; }\n' +
  'html, body { height: 100%; margin: 0; }\n' +
  'body { background: var(--canvas); color: var(--text-primary); font-family: var(--font-sans); -webkit-font-smoothing: antialiased; font-feature-settings: "ss01","ss02"; }\n' +
  'header.bar { display: flex; align-items: center; gap: 16px; height: 56px; padding: 0 20px; background: var(--panel); border-bottom: 1px solid var(--border-subtle); }\n' +
  '.brand .wordmark { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }\n' +
  'nav.tabs { display: flex; gap: 2px; padding: 3px; background: var(--surface); border-radius: 8px; }\n' +
  'nav.tabs a { padding: 6px 12px; font-size: 13px; font-weight: 500; color: var(--text-tertiary); text-decoration: none; border-radius: 6px; }\n' +
  'nav.tabs a:hover { color: var(--text-primary); }\n' +
  'nav.tabs a.active { color: var(--text-primary); background: var(--surface-2); }\n' +
  '@media (max-width: 640px) { header.bar { flex-wrap: wrap; height: auto; padding: 8px 12px; } nav.tabs { overflow-x: auto; max-width: 100%; } }\n' +
  '.wrap { max-width: 680px; margin: 0 auto; padding: 26px 20px 60px; }\n' +
  '.head-row { display: flex; align-items: baseline; gap: 12px; margin: 2px 2px 16px; }\n' +
  '.col-head { font-size: 11px; font-weight: 500; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.06em; }\n' +
  'button.refresh { margin-left: auto; background: var(--surface); color: var(--text-secondary); border: 1px solid var(--border-translucent); border-radius: 8px; padding: 6px 12px; font-size: 12.5px; font-family: inherit; cursor: pointer; }\n' +
  'button.refresh:hover { color: var(--text-primary); border-color: var(--text-tertiary); }\n' +
  '.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }\n' +
  '.tile { background: var(--panel); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 16px 16px 18px; }\n' +
  '.tile .label { font-size: 12px; color: var(--text-tertiary); }\n' +
  '.tile .value { font-size: 30px; font-weight: 700; letter-spacing: -0.02em; margin-top: 8px; font-variant-numeric: tabular-nums; }\n' +
  '.note { color: var(--text-tertiary); font-size: 12.5px; margin-top: 16px; }\n' +
  '@media (max-width: 640px) { .grid { grid-template-columns: repeat(2, 1fr); } }\n' +
  '</style>\n</head>\n<body>\n' +
  '<header class="bar">\n' +
  '  <div class="brand"><span class="wordmark">HookMyApp Starter Kit</span></div>\n' +
  '  <nav class="tabs" aria-label="Sections">\n' +
  '    <a href="/chat">Chat</a>\n' +
  '    <a href="/comments">Comments</a>\n' +
  '    <a href="/publish">Publish</a>\n' +
  '    <a href="/insights" class="active" aria-current="page">Insights</a>\n' +
  '    <a href="/logs">Logs</a>\n' +
  '  </nav>\n' +
  '</header>\n' +
  '<div class="wrap">\n' +
  '  <div class="head-row"><span class="col-head">Account insights</span><button class="refresh" id="refresh">Refresh</button></div>\n' +
  '  <div class="grid" id="grid"></div>\n' +
  '  <div class="note" id="note"></div>\n' +
  '</div>\n' +
  '<script>\n' +
  '(function () {\n' +
  '  var grid = document.getElementById("grid");\n' +
  '  var note = document.getElementById("note");\n' +
  '  var refresh = document.getElementById("refresh");\n' +
  '  var LABELS = { followers: "Followers", posts: "Posts", reach: "Reach (24h)", views: "Views (24h)", total_interactions: "Interactions (24h)", accounts_engaged: "Accounts engaged (24h)" };\n' +
  '  function tile(label, value) {\n' +
  '    var t = document.createElement("div"); t.className = "tile";\n' +
  '    var l = document.createElement("div"); l.className = "label"; l.textContent = label;\n' +
  '    var v = document.createElement("div"); v.className = "value"; v.textContent = (value == null ? "\\u2014" : String(value));\n' +
  '    t.appendChild(l); t.appendChild(v); return t;\n' +
  '  }\n' +
  '  function load() {\n' +
  '    note.textContent = "Loading\\u2026"; grid.textContent = "";\n' +
  '    fetch("/insights/data").then(function (r) { return r.json(); }).then(function (j) {\n' +
  '      if (!j || j.status !== "ok") { note.textContent = "Failed: " + ((j && j.error) || "unknown"); return; }\n' +
  '      var d = j.data || {};\n' +
  '      grid.appendChild(tile(LABELS.followers, d.followers));\n' +
  '      grid.appendChild(tile(LABELS.posts, d.posts));\n' +
  '      (d.metrics || []).forEach(function (m) { grid.appendChild(tile(LABELS[m.name] || m.name, m.value)); });\n' +
  '      note.textContent = "Pulled live from the Instagram Insights API.";\n' +
  '    }).catch(function (e) { note.textContent = "Failed: " + e.message; });\n' +
  '  }\n' +
  '  refresh.addEventListener("click", load);\n' +
  '  load();\n' +
  '})();\n' +
  '</script>\n</body>\n</html>\n';

export function mountInsights(app, deps = {}) {
  const insights = deps.insights;

  app.get('/insights', (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.send(HTML_PAGE);
  });

  app.get('/insights/data', async (req, res) => {
    if (typeof insights !== 'function') return res.status(400).json({ status: 'error', error: 'insights not configured' });
    try {
      const data = await insights();
      res.json({ status: 'ok', data });
    } catch (err) {
      // err.message is provider-sanitized (Meta message + code only) — safe to expose.
      res.status(502).json({ status: 'error', error: err.message });
    }
  });
}
