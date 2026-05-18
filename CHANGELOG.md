# Changelog

## 2.0.0 — 2026-05-18

### Breaking

- Renamed `WHATSAPP_API_URL` env var to `META_GRAPH_API_URL` to reflect that the Graph API is Meta-level (not WhatsApp-specific). The .env shape emitted by `hookmyapp channels env --write .env` and the dashboard's Copy/Download Credentials buttons now uses the new name. Update any deployed kits by renaming the var in your `.env` file.

## 1.1.0 — 2026-05-17

### Changed

- README + AGENTS.md examples updated to use Channel ID (`ch_xxxxxxxx`) syntax. The CLI `<waba-id>` positional has been renamed to `<channel>` upstream — see https://github.com/hookmyapp/cli CHANGELOG for details. No source code changes; the kit still reads `process.env.VERIFY_TOKEN`.
