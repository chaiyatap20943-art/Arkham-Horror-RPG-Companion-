# Full-code build validation — 2026-10-09

Version **0.2.0** delivers application source for the systems requested in the
Master Brief and a six-file, paste-ready Google Apps Script package. The user
expanded the scope beyond the original Foundation milestone. This record
describes implemented workflows and executed checks; **live Google deployment
acceptance is still pending**.

Use [the Thai installation guide](../google-apps-script/README_TH.md). No Node,
clasp, or desktop `.gs` file association is needed for manual installation.
`google-apps-script/INSTALL.html` contains `Code.gs`, `Index.html`,
`Styles.html`, `Client.html`, `Features.html`, and `appsscript.json`. It helps
copy the files; the application runs after configuring and deploying them in
Apps Script. The separate offline preview is read only.

## Executed checks

Toolchain: Node **24.19.0**, npm **11.9.0**, Playwright **1.63.0**, system
Chromium, optional clasp **3.4.1**. Dependency versions are pinned in the
lockfile. Frozen-lockfile installation was verified during environment setup.

| Check | Actual outcome | Evidence and limits |
| --- | --- | --- |
| `npm run check` | **183 passed, 0 failed, 0 skipped** | Builds ignored deployment/web output, parses JavaScript and runs domain, permission, storage, adapter, catalog and release tests. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser` | **10 passed, 0 failed** | Actual Chromium UI against an isolated local server, temporary persistence and explicit test sessions. Includes desktop and 390px mobile checks. |
| `npm run release` | Passed | Regenerates combined Apps Script code, four HTML files, manifest and installer from canonical source. |
| `npm run preview` | Passed | Regenerates the fictional, read-only offline example. |
| Development startup and HTTP smoke checks | Passed | Health reports `full-companion`; the complete interface has no unresolved includes; public config exposes status/settings names; unauthenticated bootstrap returns `AUTH_REQUIRED` with no data. |
| Offline installer inspection | Passed | All six embedded file contents match the release files byte-for-byte; installer JavaScript parses and includes manual copy fallback. This does not establish Safari behavior. |
| `npm audit --omit=dev --audit-level=high` | Passed, **0 findings** | No production npm dependencies are bundled into Apps Script/browser output. |
| `npm audit --audit-level=high` | **3 high findings in one development-tool chain** | Optional clasp → micromatch → braces advisory remains unresolved; see [historical validation](validation.md#development-tool-advisory). No forced breaking downgrade was applied. |

The 183 tests cover authentication (28), campaign domain (17), Sheets storage
(12), local runtime (2), offline export (3), player catalog (10), GM catalog
(7), investigators (15), play (25), full-service permissions/retries (11),
library and Google adapters (31), sessions/story/recovery (20), and the
combined Apps Script release (2).

Release tests execute the checked-in `Code.gs` in a JavaScript VM with the
actual Apps Script adapter, an emulated advanced Sheets service and test-only
private properties. They cover all **22 tables**, installation diagnostics,
investigator approval, attendance/start, dice, atomic end-session failure/retry,
snapshots, XP and GM/player catalog isolation. They do not establish real
Google scopes, consent, runtime availability or spreadsheet access.

## Requested systems and acceptance

| System | Delivered and locally validated | Remaining acceptance or explicit boundary |
| --- | --- | --- |
| Identity/campaigns | Google authorization-code exchange, S256 PKCE, verified subject, private hashed sessions, email-bound invitations, roles, versions, revocation and audited retries | Actual account A/B/C login, callback/popup/storage and campaign isolation on `/exec` |
| Investigators | Six-step saved wizard; source-backed skills, personality/archetype, starting knack/package/equipment; validation, submit/approve/reject/retire and digital sheets | Real Sheets persistence; specific relic/tome approvals; full multiclass advancement is not automated |
| XP/equipment | Integer-cent budgeting, advancement constraints, ledger, most-recent mechanical reversal, equipment history and audited GM corrections | GM confirms narrative eligibility and nonstandard item decisions |
| Play | Server d6, natural 1/6, advantage/disadvantage discards, pool spending/refill/damage/healing, horror, pending trauma/strain injury, injury modifiers, death avoidance and selected personality effects | Automatic mechanics versus GM adjudication below; actual Google gameplay scenarios |
| Sessions/history | Attendance separate from membership, one active/paused session, start/pause/resume/end, narrative/structured scenes, continuing state, atomic immutable snapshot fragments and end-session XP | Real failed-batch recovery, load, quotas and retention |
| GM story/spoilers | Scenes, NPC/enemy/location records, clues/handouts, private notes/journals, selected-player reveal/revoke and authorized file links | Live spoiler checks through Sheets, Drive, search, translation and AI |
| Rulebook/sources | Bilingual glossary/search, page citations, campaign catalogs, structured import checkpoints and review | Human review required; no one-click full PDF ingestion or automatic trust promotion |
| Assistant/translation/narration | Permission-filtered retrieval before provider calls, citation checks, rule/explanation/suggestion separation, rate limits, history and unconfigured fallback | Real Gemini model/quota, Thai quality and answer review |
| Scanner/storage | Bounded image upload, MIME/magic validation, private app-created Drive files, OCR draft separate from corrected/reviewed text, authorized reads, compensation/orphan recovery | Real camera/upload, Drive permissions and Gemini OCR; no full-PDF upload endpoint |
| Recovery | Owner-only export and checked merge restore preserving current permissions/revocations, immutable history and private file bindings | JSON includes private campaign data but excludes credentials, auth sessions and image bytes. Keep separate private Sheet/Drive backups and test Google recovery. |

The ten browser checks cover unconfigured login denial; read-only bilingual
preview; campaign persistence/uncertain-response retry; invitations/revocation;
logout; investigator creation through approval, dice, snapshot/XP and
next-session continuity; selected clue reveal/hide; cited search/assistant
fallback; owner export/merge recovery; and source import/review with honest
unconfigured image storage. Test fixtures cannot authenticate through the
production application.

## Verified references and automation

There are **466 source-linked records**: **297** player references and **169**
GM-only entries. The player catalog contains 10 skills, 11 personalities,
8 archetypes, 117 knacks, 120 equipment entries, 11 injury outcomes, 6 trauma
ranges and 14 rule summaries. The GM catalog contains 16 NPCs, 19 creatures,
15 Ancient Ones and 119 locations, including 35 skill/pool profiles and
38 attack profiles where provided. GM entries are excluded from player
bootstrap/search/AI context.

Source version: `corebook-2024-7901c7c8cf06`; SHA-256:
`7901c7c8cf0657d6cc2f65104ad6c7b46077cc489f653c6310897d5f2cd86d7a`.
In this exact PDF, printed pages equal zero-based PDF indices; one-based PDF
pages are printed page + 1. No full PDF, full-book text or artwork is
distributed. See [source verification](rules-verification.md).

**Verified references do not mean every ability resolves automatically.**
Core pool/dice, consequence and advancement handlers have separate tests.
Selected personality support includes Analytical horror removal, Ambitious
extra successes and Imaginative advantage/horror restrictions. Other
conditional knack/personality/equipment effects use explicit
`GM_ADJUDICATED` actions with canonical sources, bounded modifiers, durations
and a private reason. The server validates ownership/source and records the
decision; the GM decides legal costs, targets, timing and interpretation.

Heavy Blow timing, limb-dependent action complexity, Dire fictional deadlines,
full multiclassing, many reactions and narrative prerequisites remain GM
decisions or future automation work. Ancient Ones without published combat
profiles retain `NOT_PROVIDED`; statistics are not invented.

## Platform limits

- Sheets reads/atomic commits use full table snapshots, favoring small private
  campaigns. Search/history pagination exists; production indexing, retention,
  load and quota measurement remain open.
- Record cells have a 40,000-character limit. Snapshots use bounded fragments.
  Images are limited to 750 KiB. Structured imports allow at most 100 entities
  per batch and a 500 KiB UI file; restore allows a 3 MiB UI file. Separate
  server request caps are recorded in [the schema](schema.md).
- AI/Drive preparation runs outside the mutation lock, with fresh permission
  and source checks before committing. Committed retries avoid provider calls;
  unused uploads are compensated. Identical simultaneous in-flight requests
  can call a provider twice before the first receipt commits. Database changes
  remain once-only; provider billing is not guaranteed once-only.
- Restore is a checked merge. Current roles, reveal restrictions, owner and
  immutable history take precedence. Unknown members need fresh invitations;
  unknown files require re-upload/registration. Untrusted restored source
  claims cannot alter frozen official mechanics.
- `drive.file` covers app-created/authorized files. Moving an existing PDF
  into a folder does not guarantee access. The compiled catalog and structured
  imports work without a PDF file ID.

## Google and macOS checks not run

No Google project, OAuth client or production credentials were supplied. No
Google upload/deployment was performed. The owner must create a private Sheet
and Apps Script project, enable Sheets v4/Drive v3, set the four required
Script Properties, initialize the database/private folder and deploy. Gemini
properties are optional. Follow the Thai guide; secrets stay in Script
Properties.

Test A as owner, B as invited player and unrelated C on the real deployment.
Confirm reload persistence, revocation, GM/search/AI/file isolation, snapshots,
advancement and recovery. Check quotas, model availability and browser or
Workspace policies. These are pending release acceptance prerequisites.

Actual Safari/macOS and direct local-file navigation remain untested. The
cloud browser blocks `file://`; offline behavior was checked by loading the
document into Chromium. Copy/select fallbacks handle clipboard restrictions.
Use GitHub **Code → Download ZIP** because chat Artifact downloads failed for
the user.

Cloud install/start instructions are saved separately in the environment
draft. Saving does not publish the environment or establish restoration in a
new task. GitHub source delivery does not deploy the Google application.
