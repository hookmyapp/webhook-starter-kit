# Changelog

## 3.0.0 — 2026-07-11

### Breaking

- Signature verification no longer falls back to `VERIFY_TOKEN` when
  `WEBHOOK_HMAC_SECRET` is unset. The compat bridge existed for sandbox
  sessions and pre-split channels that exported the signing secret under
  `VERIFY_TOKEN`; the CLI has exported `WEBHOOK_HMAC_SECRET` from both
  `sandbox env` and `channels env` since @gethookmyapp/cli 0.12.x. If your
  `.env` predates that, re-pull it: `hookmyapp sandbox env --write .env`
  (or `channels env` for your own number). `VERIFY_TOKEN` keeps its one
  remaining role: the body your server echoes on the one-time webhook
  verification `GET`.

### Added

- Instagram threads in `/chat` are now labeled by the sender's `@username` when
  it can be resolved, falling back to the raw Instagram-scoped id.
- `/chat` and `/logs` each gained an All / WhatsApp / Instagram filter to narrow
  the view to a single channel.
- `/logs` now summarizes inbound Instagram webhooks (the Messenger Platform
  `messaging[]` shape) instead of labeling them "unknown", and shows Instagram
  sender ids verbatim instead of prefixing them with a `+`.

### Changed

- Signature verification now keys on `WEBHOOK_HMAC_SECRET`, falling back to
  `VERIFY_TOKEN` when unset (a compat bridge: sandbox sessions and channels
  created before the verify-token/HMAC split export the signing secret under
  `VERIFY_TOKEN`). `VERIFY_TOKEN` itself is only the webhook verify-GET
  handshake response. A missing secret now logs a boot warning instead of
  exiting.
- The Instagram provider reads the sandbox or real-channel base URL with
  `INSTAGRAM_ACCOUNT_ID`, so the kit runs against a connected Instagram channel
  without a code change.

## 2.0.0 — 2026-05-18

### Breaking

- Renamed `WHATSAPP_API_URL` env var to `META_GRAPH_API_URL` to reflect that the Graph API is Meta-level (not WhatsApp-specific). The .env shape emitted by `hookmyapp channels env --write .env` and the dashboard's Copy/Download Credentials buttons now uses the new name. Update any deployed kits by renaming the var in your `.env` file.

## 1.1.0 — 2026-05-17

### Changed

- README + AGENTS.md examples updated to use Channel ID (`ch_xxxxxxxx`) syntax. The CLI `<waba-id>` positional has been renamed to `<channel>` upstream — see https://github.com/hookmyapp/cli CHANGELOG for details. No source code changes; the kit still reads `process.env.VERIFY_TOKEN`.
