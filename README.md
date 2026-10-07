# Arkham Horror RPG Campaign Companion

Private campaign companion built with **HTML/CSS/vanilla JavaScript + Google Apps Script + Google Sheets**. English/Thai UI uses the same canonical data. No corebook PDF, extracted full-book text, or credentials are included.

**สถานะ: Foundation milestone — ยังไม่ใช่ MVP ที่เล่นเกมได้ครบ และยังไม่ผ่านการทดสอบ Google deployment จริง**

This first build implements the foundation and a campaign workflow for testing its permission infrastructure: Google authorization-code/PKCE authentication, hashed application sessions, campaigns, in-app email-bound invitations, owner/GM/Co-GM/Player permissions, language preferences, audit records, optimistic versions, and atomic retry-safe writes. Campaign code is preparatory work; later roadmap gates have not been accepted. Character creation, sessions, dice, injuries, equipment, advancement, rule search, Gemini, and scanning remain on the [roadmap](docs/roadmap.md).

The original [Thai master brief](docs/master-brief-th.txt) is retained for future development. The [requirements review](docs/requirements-review.md) documents the architecture and decisions. The [corebook verification register](docs/rules-verification.md) records source pages and exceptions; those verified mechanics are **not implemented** in this foundation.

## Open the interface without installation

Extract the project ZIP and open `preview/arkham-preview.html` in Safari or Chrome. This self-contained file starts in Thai and displays fictional sample campaigns with an explicit offline/read-only notice. It requires no Node, Google configuration, or internet connection. Login, mutations, and network requests are disabled. Storage restrictions do not prevent it from opening. See [the Mac guide](docs/macos-quickstart-th.md).

The shared client source remains canonical. Refresh the included standalone example after client changes with `npm run preview`.

## Develop and validate

Use Node 24 (the current cloud machine has 24.19.0). Open the existing checkout; cloud tasks are already isolated, so no additional worktree is needed.

```bash
npm ci
npm run check
npm run dev
```

`dev` builds and starts the local development server on port 3000. Without Google configuration it shows the actual signed-out/setup state. **Explore the interface** opens a clearly labeled, read-only design preview with sample data. It never authenticates a sample user or writes sample campaigns to the database.

Local development uses an ignored, private `.local/` JSON store. Production uses the Sheets adapter. An optional local Google client can be configured from `.env.example`; see [authentication](docs/authentication.md). For Codespaces, use the forwarded HTTPS callback URL as `APP_URL` and register that exact callback in a separate development OAuth client. Never treat the Node adapter as the Apps Script hosting environment.

```bash
# Browser checks: install Chromium using Playwright, or use an existing browser.
npx playwright install chromium
npm run test:browser
# This cloud machine already has Chromium:
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser
```

Browser tests use isolated test accounts and private session fixtures, not real Google login. Backend tests replace Google transport and the Sheets network service with test doubles. See [validation](docs/validation.md) for the distinction and actual results.

## Configure Google

Follow [the setup guide](docs/setup.md). You need an Apps Script project, a private Sheets database, and a Google web OAuth client. Enter its secret **only** in Script Properties. Source delivery now uses the user-authorized GitHub `main` branch. No Google application upload or deployment has been performed.

Build output is ignored under `dist/apps-script/`; upload it only after reviewing the source and configuring the intended target. The current build requests Sheets and external-HTTP scopes only. Drive file features and Gemini integration have not been added, so their permissions and API keys are unnecessary for this milestone.

## Project files

| Path | Purpose |
| --- | --- |
| `src/client/` | Bilingual, responsive interface and Google/Node RPC adapter. |
| `src/server/auth.js` | Real Google code exchange, UserInfo verification, PKCE polling, sessions. |
| `src/server/domain.js` | Campaign, invitation, authorization, version, audit, and retry rules. |
| `src/server/store.js` | Portable record representation and safe Sheets string cells. |
| `src/server/apps-script.js` | Web app entry points and atomic Sheets/private-vault adapters. |
| `src/appsscript.json` | Explicit runtime and permissions. |
| `scripts/` | Build, development server, local persistence, and target configuration. |
| `tests/` | Security/domain/storage/integration and browser acceptance checks. |
| `docs/` | Review, rule sources, setup, schema, validation, and staged roadmap. |
| `.devcontainer/` | Codespaces configuration; installs frozen dependencies and runs checks. |

## Known limits

Real Google consent, `/exec` callbacks, personal-account access, Apps Script scopes, and Sheets writes require a live deployment test. The first phase is not accepted until two separate Google accounts pass that gate. The app currently uses full-table reads and bounded record sizes; it is intended for a small private installation and needs pagination, quota measurements, and retention controls before larger datasets. Local JSON storage supports one Node server process only. External AI/file features are unavailable and do not affect this foundation.
