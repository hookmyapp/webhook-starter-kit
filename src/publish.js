// /publish — compose a photo post and publish it to the connected Instagram
// account via the Content Publishing API. The image is supplied as a public
// HTTPS URL that Meta can fetch (Meta downloads it server-side).

const HTML_PAGE =
  '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
  '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '<title>HookMyApp Starter Kit · Publish</title>\n' +
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap">\n' +
  '<style>\n' +
  ':root {\n' +
  '  --canvas: #08090a; --panel: #0f1011; --surface: #191a1b; --surface-2: #28282c;\n' +
  '  --border-subtle: rgba(255,255,255,0.05); --border-translucent: rgba(255,255,255,0.08);\n' +
  '  --text-primary: #f7f8f8; --text-secondary: #d0d6e0; --text-tertiary: #8a8f98;\n' +
  '  --indigo-primary: #5e6ad2; --indigo-accent: #7170ff; --green: #27a644;\n' +
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
  '.wrap { max-width: 480px; margin: 0 auto; padding: 30px 20px 60px; }\n' +
  '.card { background: var(--panel); border: 1px solid var(--border-subtle); border-radius: 16px; padding: 18px; }\n' +
  '.preview { width: 100%; aspect-ratio: 1/1; border-radius: 12px; object-fit: cover; display: none; background: var(--surface); }\n' +
  '.preview.show { display: block; }\n' +
  'label { display: block; font-size: 12px; color: var(--text-tertiary); margin: 16px 2px 6px; }\n' +
  'label:first-child { margin-top: 0; }\n' +
  'input[type=url] { width: 100%; background: var(--surface); border: 1px solid var(--border-translucent); border-radius: 10px; color: var(--text-primary); padding: 10px 13px; font-size: 14px; font-family: inherit; }\n' +
  'input[type=url]:focus { outline: none; border-color: var(--indigo-accent); }\n' +
  'textarea { width: 100%; min-height: 70px; resize: vertical; background: var(--surface); border: 1px solid var(--border-translucent); border-radius: 10px; color: var(--text-primary); padding: 10px 13px; font-size: 14px; font-family: inherit; }\n' +
  'textarea:focus { outline: none; border-color: var(--indigo-accent); }\n' +
  'button { width: 100%; margin-top: 16px; background: var(--indigo-primary); color: #fff; border: 0; border-radius: 10px; padding: 12px; font-size: 14px; font-weight: 510; cursor: pointer; transition: background 120ms; }\n' +
  'button:hover:not(:disabled) { background: var(--indigo-accent); }\n' +
  'button:disabled { opacity: 0.55; cursor: not-allowed; }\n' +
  '.result { margin-top: 16px; padding: 12px 14px; border-radius: 10px; font-size: 13.5px; line-height: 1.5; display: none; }\n' +
  '.result.ok { display: block; background: rgba(39,166,68,0.10); border: 1px solid rgba(39,166,68,0.25); color: #b8f5c8; }\n' +
  '.result.err { display: block; background: rgba(229,57,53,0.10); border: 1px solid rgba(229,57,53,0.25); color: #f5b8b8; }\n' +
  '.result a { color: var(--indigo-accent); }\n' +
  '</style>\n</head>\n<body>\n' +
  '<header class="bar">\n' +
  '  <div class="brand"><span class="wordmark">HookMyApp Starter Kit</span></div>\n' +
  '  <nav class="tabs" aria-label="Sections">\n' +
  '    <a href="/chat">Chat</a>\n' +
  '    <a href="/comments">Comments</a>\n' +
  '    <a href="/publish" class="active" aria-current="page">Publish</a>\n' +
  '    <a href="/insights">Insights</a>\n' +
  '    <a href="/logs">Logs</a>\n' +
  '  </nav>\n' +
  '</header>\n' +
  '<div class="wrap">\n' +
  '  <div class="card">\n' +
  '    <img class="preview" id="preview" alt="Post preview">\n' +
  '    <form id="pub" autocomplete="off">\n' +
  '      <label for="imageUrl">Image URL (public HTTPS — Meta fetches it)</label>\n' +
  '      <input type="url" id="imageUrl" placeholder="https://example.com/photo.jpg" required>\n' +
  '      <label for="caption">Caption</label>\n' +
  '      <textarea id="caption" placeholder="Write a caption">Posted from HookMyApp via the Instagram API.</textarea>\n' +
  '      <button type="submit" id="btn">Publish to Instagram</button>\n' +
  '    </form>\n' +
  '    <div class="result" id="result"></div>\n' +
  '  </div>\n' +
  '</div>\n' +
  '<script>\n' +
  '(function () {\n' +
  '  var form = document.getElementById("pub");\n' +
  '  var btn = document.getElementById("btn");\n' +
  '  var imageUrl = document.getElementById("imageUrl");\n' +
  '  var caption = document.getElementById("caption");\n' +
  '  var preview = document.getElementById("preview");\n' +
  '  var result = document.getElementById("result");\n' +
  '  imageUrl.addEventListener("change", function () {\n' +
  '    if (imageUrl.value) { preview.src = imageUrl.value; preview.className = "preview show"; }\n' +
  '    else { preview.className = "preview"; }\n' +
  '  });\n' +
  '  preview.addEventListener("error", function () { preview.className = "preview"; });\n' +
  '  form.addEventListener("submit", function (e) {\n' +
  '    e.preventDefault();\n' +
  '    btn.disabled = true; btn.textContent = "Publishing\\u2026"; result.className = "result";\n' +
  '    fetch("/publish/post", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: imageUrl.value, caption: caption.value }) })\n' +
  '      .then(function (r) { return r.json().catch(function () { return {}; }); })\n' +
  '      .then(function (j) {\n' +
  '        if (j && j.status === "ok") {\n' +
  '          result.className = "result ok"; result.textContent = "";\n' +
  '          /* Provider data goes through createElement/textContent — never innerHTML. */\n' +
  '          if (j.permalink) {\n' +
  '            result.appendChild(document.createTextNode("Published \\u2713 "));\n' +
  '            var a = document.createElement("a"); a.href = j.permalink; a.target = "_blank"; a.rel = "noopener"; a.textContent = "View on Instagram";\n' +
  '            result.appendChild(a);\n' +
  '          } else {\n' +
  '            result.textContent = "Published \\u2713 (media id " + (j.id || "") + ")";\n' +
  '          }\n' +
  '        } else {\n' +
  '          result.className = "result err"; result.textContent = "Failed: " + ((j && j.error) || "unknown error");\n' +
  '        }\n' +
  '      })\n' +
  '      .catch(function (err) { result.className = "result err"; result.textContent = "Failed: " + err.message; })\n' +
  '      .finally(function () { btn.disabled = false; btn.textContent = "Publish to Instagram"; });\n' +
  '  });\n' +
  '})();\n' +
  '</script>\n</body>\n</html>\n';

// Meta fetches the image server-side, so the URL must be genuinely public:
// https, a real hostname, and not a loopback/private-range literal (those
// would silently fail inside Meta anyway — reject them up front).
function isPublicHttpsUrl(value) {
  let u;
  try { u = new URL(value); } catch { return false; }
  if (u.protocol !== 'https:' || !u.hostname) return false;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h === '[::1]' || h.endsWith('.local')) return false;
  if (/^(127|10)\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h)) return false;
  return true;
}

export function mountPublish(app, deps = {}) {
  const publish = deps.publish;

  app.get('/publish', (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.send(HTML_PAGE);
  });

  app.post('/publish/post', async (req, res) => {
    const caption = typeof req.body?.caption === 'string' ? req.body.caption : '';
    const imageUrl = typeof req.body?.imageUrl === 'string' ? req.body.imageUrl.trim() : '';
    if (typeof publish !== 'function') return res.status(400).json({ status: 'error', error: 'publish not configured' });
    if (!isPublicHttpsUrl(imageUrl)) return res.status(400).json({ status: 'error', error: 'imageUrl must be a public https:// URL Meta can fetch' });
    try {
      const out = await publish(imageUrl, caption);
      res.json({ status: 'ok', id: out.id, permalink: out.permalink });
    } catch (err) {
      // err.message is provider-sanitized (Meta message + code only) — safe to expose.
      res.status(502).json({ status: 'error', error: err.message });
    }
  });
}
