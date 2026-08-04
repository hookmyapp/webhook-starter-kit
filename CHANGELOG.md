# Changelog

## 3.0.2 — 2026-08-04

### Fixed

- `WHATSAPP_ACCESS_TOKEN` / `INSTAGRAM_ACCESS_TOKEN` were documented as "a Meta
  access token in production". They never are on the CLI path: `channels env`
  writes a HookMyApp channel token (`hmat_`) in production exactly as
  `sandbox env` does, and the endpoint never returns a Meta token. Both rows now
  describe the credential per transport, including the direct-Meta path where it
  genuinely is your own Meta token.

### Changed

- "activation code" is the pre-rename name for the sandbox channel token, and it
  named the wrong object — the code you send to the sandbox number is the *bind*
  code. Corrected in README, AGENTS.md and `.env.example`.
- Replaced the internal service name "forwarder" with HookMyApp throughout,
  including the README diagram, and dropped token-custody framing.
- `copy-guard.yml` fails CI on the retired terms.

## 3.0.1 — 2026-07-31

### Added

- Instagram `/comments`, `/publish`, and `/insights` pages with authenticated
  management routes, comment replies, photo publishing, and account insights.
- Instagram webhook handling and tests for the new publishing, comments, and
  insights flows.

### Changed

- Docs only: `hookmyapp sandbox env` now writes `VERIFY_TOKEN` (CLI + backend AIT-179), and `sandbox webhook set` runs the verify-GET handshake against it — the "sandbox never issues that GET / does not write VERIFY_TOKEN" claims in README, AGENTS.md, and `.env.example` are corrected. No kit code changes; the GET handler already echoed `VERIFY_TOKEN`.
- Customer guidance now describes reconnecting as a product action without
  exposing Meta permission mechanics.

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
