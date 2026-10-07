# Setup: Foundation milestone

เอกสารนี้แยกการทดสอบใน Codespaces/Codex ออกจาก Google runtime จริง ต้องทดสอบด้วย Google Account สองบัญชีก่อนยอมรับ Phase 1. ไม่มีการ deploy อัตโนมัติ

## 1. Local/Codespaces setup

From the existing repository checkout:

```bash
npm ci
npm run check
npm run dev
```

Dependencies are pinned in `package-lock.json`; use Node 24. `.devcontainer/devcontainer.json` supplies the Node 24 development image and runs installation/checks. In environments that restrict the default home directory, `.npmrc` keeps npm's cache in the ignored `.cache/npm/` directory inside the checkout.

Expected result: the real signed-out landing screen, with Google login requiring configuration. The separate design preview has sample data and is read only. No account, database, or session is fabricated by `npm run dev`.

Optional real local login: copy `.env.example` to `.env`, fill a **separate development web OAuth client** ID/secret, and register `APP_URL` exactly. For a locally opened browser use `http://localhost:3000/oauth/callback`. Codespaces requires the actual forwarded HTTPS `/oauth/callback` URL; Google redirects the browser, not the remote machine's loopback. The server accepts that configured origin/host. Keep the port private and the secrets untracked. `.local/` stores private local development records; it is never uploaded to Google.

## 2. Create the production Google resources

1. As the installation owner, create a private Google Sheet and a standalone Apps Script project. Do not share the Sheet or a parent folder with campaign players. Copy the spreadsheet ID from its URL and the script ID from Project Settings; these IDs are configuration, not credentials.
2. In Apps Script **Services**, enable the **Google Sheets API v4** advanced service. It is also declared in the supplied manifest. If using a standard Google Cloud project, enable the Google Sheets API there too. The Sheets adapter uses one `spreadsheets.batchUpdate` call to commit business records, audit, and retry receipt together.
3. Create a Google Cloud project and configure **Google Auth Platform** branding/audience/contact details. Use an external audience for personal Google accounts; add the two test accounts while the app is in testing mode. Create an OAuth client of type **Web application** for the companion's login. This client is separate from any desktop client used by clasp.
4. Build and inspect the generated Apps Script files with `npm run build`.
5. Choose either upload method below. The CLI instructions are user actions; this build has not run login, upload, or deployment commands.

### Upload option A: Google editor

Create matching script files for the `.gs` files in `dist/apps-script/`, and matching HTML files `Index`, `Styles`, `Client`. Enable viewing the manifest in Project Settings, then use `dist/apps-script/appsscript.json`. Do not copy `scripts/`, tests, the PDF, or any `.env` file into Apps Script.

### Upload option B: clasp

Enable the [Apps Script API](https://script.google.com/home/usersettings) for the installation owner. The pinned clasp 3.4.1 CLI is installed locally.

```bash
npm run clasp -- login --no-localhost
npm run configure -- YOUR_APPS_SCRIPT_PROJECT_ID
npm run build
# Review the target and generated files before uploading:
npm run clasp -- show-file-status
# Upload only when you intend to change that Apps Script project:
npm run clasp -- push
```

If your account requires custom clasp credentials, use the current clasp documentation's desktop-client procedure. Keep downloaded credential JSON outside the repository. Clasp authentication is a developer credential and is unrelated to the web OAuth client used by players. Do not paste credentials, authorization codes, or token output into chat. Revoke developer access from your Google Account's third-party connection settings when no longer needed.

The configuration helper writes an ignored `.clasp.json` with `rootDir: dist/apps-script`; it refuses to overwrite an existing target. It does not upload anything. Confirm the actual project ID before using `push`.

## 3. Deploy and add private configuration

1. Deploy as a web app, **execute as the installation owner**, with access permitting the intended test accounts. For personal accounts this may require **Anyone** at the web-app transport layer; domain data remains protected by the companion's Google login and membership checks. Workspace policy may forbid this access setting, which is a deployment blocker to resolve with the owner rather than weakening identity checks.
2. Copy the published web-app URL ending in `/exec`; use a stable deployment, not the editor `/dev` test URL.
3. In the Google web OAuth client's Authorized redirect URIs, register that **exact `/exec` URL**. The web app's `doGet` handles the callback. Origin/redirect restrictions and actual HTML Service behavior must be validated at this URL.
4. Enter these Script Properties in Apps Script Project Settings:

| Name | Meaning |
| --- | --- |
| `DATABASE_ID` | Private database spreadsheet ID. |
| `GOOGLE_CLIENT_ID` | Production web OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | Production web OAuth client secret; enter it securely here only. |
| `APP_URL` | Exact `/exec` URL registered as the OAuth redirect. |

5. From the Apps Script editor, run `initializeDatabase_` as the owner and approve the manifest's Sheets and external-request scopes. It creates missing tables; a second run leaves existing records alone. It rejects an incompatible named table instead of silently migrating it. No Drive/Gemini credentials are needed at this stage.
6. Open the deployed app, choose Google login, and complete consent in the popup. The original tab polls a verifier-bound state; it does not depend on cross-origin popup messages. If necessary use the one-time ticket fallback. Then perform the checklist below.

## 4. Live acceptance gate — not executed yet

Use accounts A, B, and an unrelated C in separate browser profiles:

1. A/B sign in: distinct stable identities and verified email. Refresh and sign in again: the same user IDs remain.
2. Signed-out and forged/expired sessions cannot read campaigns. Logout invalidates that session.
3. A creates a campaign and becomes owner/GM. A invites B's verified email. B sees/accepts; C cannot redeem B's invite or access the campaign by ID.
4. Player B cannot alter owner/role/private notes. Player responses do not contain the notes, including nested payloads. An owner can appoint Co-GM; Co-GM cannot promote themself.
5. Remove B and retry with B's existing session: access is immediately denied.
6. Change the same campaign from two tabs: a stale version fails visibly. Retry the same request ID: only one campaign/invitation is created.
7. Switch English/Thai and reload: campaign IDs and content remain unchanged.
8. Verify writes in the private Sheet and confirm test players have no direct database access. Test consent cancellation, popup blocking, lost network, callback reload, and timeout.

Record these results before accepting the foundation phase. Google setup values or a successful local test alone do not establish live readiness.

## Recovery and rollback

Back up the private database using the owner's Google Sheets copy/export tools before changing code. Keep access private; copies contain user data and GM secrets. The schema currently uses six managed tabs with JSON records. Do not edit their record keys or cells directly while the app is running. No destructive migration is implemented. If an update fails, stop writes, restore the previous Apps Script deployment version, and use a private database backup whose IDs and membership records are intact; re-test the A/B/C permission gate.

The app's own export/restore interface is a later roadmap feature, so this manual recovery procedure is not acceptance of AT-20. To revoke all existing app sessions administratively, delete only Script Properties named `private:auth:session:*`; retain configuration properties. Changing a player's membership should use the app so the audit record is preserved.

## References and current verification limits

The pinned clasp package's README and CLI help, Google-maintained OAuth client source, and Apps Script OAuth2 examples were checked during implementation. Direct `developers.google.com` requests were blocked by this environment's egress policy. Its domain addition is saved in the environment draft, preserving existing network presets; review/save and publish that configuration to make it available to future tasks. The links below remain authoritative for live platform setup:

- [Apps Script web apps](https://developers.google.com/apps-script/guides/web)
- [Sheets atomic batch updates](https://developers.google.com/workspace/sheets/api/guides/batchupdate)
- [Google web OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [clasp 3.4.1](https://www.npmjs.com/package/@google/clasp/v/3.4.1)
- [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)

No quota/performance numbers are guaranteed. Validate current Google console settings and quotas in your own account before inviting players.
