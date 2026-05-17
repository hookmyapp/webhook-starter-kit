# Changelog

## 1.1.0 — 2026-05-17

### Changed

- README + AGENTS.md examples updated to use Channel ID (`ch_xxxxxxxx`) syntax. The CLI `<waba-id>` positional has been renamed to `<channel>` upstream — see https://github.com/hookmyapp/cli CHANGELOG for details. No source code changes; the kit still reads `process.env.VERIFY_TOKEN`.
