# Arkham Horror RPG Companion

Private English/Thai companion built with HTML, CSS, vanilla JavaScript, Google Apps Script, Sheets and private Drive storage. Gemini powers optional assistant, translation and OCR features. Version **0.2.0** supplies the full application source and a paste-ready Apps Script package.

**ติดตั้งบน Google Apps Script ได้โดยไม่ต้องติดตั้ง Node บน Mac:** ดาวน์โหลด repository ZIP → เปิด `google-apps-script/INSTALL.html` ด้วย Safari → คัดลอก Code/HTML ไป Apps Script → ทำตาม [คู่มือติดตั้งภาษาไทย](google-apps-script/README_TH.md).

## Application systems

- Verified Google login, campaigns, email-bound invitations, owner/GM/Co-GM/Player permissions.
- Six-step investigator creation, saved drafts, server validation, GM approval, digital sheets, equipment, XP awards/purchases/reversals and audited corrections.
- Sessions and attendance, narrative scenes and structured play, server dice and resource actions, immutable snapshots and continuing investigator state.
- GM scenes, NPCs, enemies, locations, clues, handouts, selected-player reveal and journals.
- Source-linked Corebook catalog, bilingual search, structured import/review, grounded Gemini answers and translation/narration.
- Private image scanner, separate OCR draft and reviewed text, authorized image retrieval, owner campaign export/restore.

Catalog verification and ability automation are different. The tested Dynamic Pool System handles core dice, pool, horror, trauma/injury results, advancement and selected personality effects. Other ability effects use explicit **GM_ADJUDICATED** actions with sources and reasons. Heavy Blow timing, limb-dependent actions, Dire deadlines and narrative decisions require GM judgment. See [the build and validation record](docs/full-build-validation.md).

**Live Google acceptance is pending.** Local and browser tests use isolated provider/storage/session fixtures; they do not establish real Google consent, Apps Script deployment, Sheets/Drive access, Gemini availability or quotas. The application has not been uploaded or deployed into the user's Google account.

## Install the real application

Use [google-apps-script/README_TH.md](google-apps-script/README_TH.md). The package contains `Code.gs`, HTML `Index`, `Styles`, `Client`, `Features`, and `appsscript.json`. `INSTALL.html` contains all six files with copy/select buttons; it is an installation aid, not the hosted application.

You need a private Sheet, an Apps Script project and a Google OAuth Web client. Secrets belong only in Script Properties. Enable Sheets v4 and Drive v3; run the owner initialization/diagnostics helpers and deploy a web app executing as the owner. Gemini configuration is optional.

Opening `preview/arkham-preview.html` displays fictional, read-only sample campaigns without Node or Google setup. It cannot log in, save data or exercise the real application. The [Mac guide](docs/macos-quickstart-th.md) distinguishes this preview from installation.

## Develop and verify

Use Node 24 (supported Node 22–24):

```bash
npm ci --ignore-scripts
npm run check
npm run dev
```

`build` generates ignored `dist/` only. Local development stores private data in ignored `.local/`; production uses Sheets. Real local login uses a separate OAuth Web client in ignored `.env`. Google-specific file and AI adapters run on Apps Script; local development reports the optional integrations unavailable unless tests explicitly supply adapters.

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser
# During an authorized release change:
npm run release
npm run preview
```

Browser tests require port 3000 free and start their own isolated fixture server. `release` regenerates the tracked paste-ready package from `src/`; `preview` regenerates the offline example. Never hand-edit generated code. For the optional clasp upload path, see [setup](docs/setup.md).

## Data and recovery

There are 22 managed Sheets tabs using typed JSON records and formula-safe text cells. Mutations commit domain state, audit and retry receipt in one atomic Sheets batch. Versions detect stale updates; current membership/object permissions are rechecked on every request and replay. AI/Drive prepare work runs outside the mutation lock, with source/permission freshness checks before committing. Scanner uploads have compensation and private orphan recovery.

Backups are owner-only, campaign-scoped JSON. They contain private campaign data and preserve identifiers/history, while restoration preserves current permissions and checks existing private file bindings. Unknown imported request receipts are ignored. Drive image bytes, credentials and authentication sessions are excluded; keep private Sheets/Drive backups separately. See [schema](docs/schema.md) and [recovery instructions](google-apps-script/README_TH.md).

No full Corebook PDF, extracted full-book text, artwork or secret values are distributed. Catalog entries contain verified facts, short original summaries and page citations. Structured imports and scans remain reviewable sources; they cannot alter the frozen official mechanics.

Full-table Sheets reads/writes favor small private campaigns. History/search pagination is implemented; indexing, retention and Google quota/load measurement remain release acceptance work. There are explicit bounded image/import/restore sizes. The recorded optional clasp development advisory is described in the [historical validation record](docs/validation.md).
