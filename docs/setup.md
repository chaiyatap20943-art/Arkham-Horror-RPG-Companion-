# Development and Google installation

For installation without Node on Mac, use the complete [Thai Google Apps Script guide](../google-apps-script/README_TH.md) and `google-apps-script/INSTALL.html`. It names the six required files, private Google resources, OAuth redirect, Script Properties, scopes, initialization and live acceptance procedure.

The current source includes all companion system workflows. The user's explicit full-code request superseded the previous Foundation-only development gate. Google runtime acceptance remains pending; see [current validation](full-build-validation.md).

## Local development

From the existing checkout with Node 24:

```bash
npm ci --ignore-scripts
npm run check
npm run dev
```

Dependencies are pinned; `.npmrc` keeps npm cache inside ignored `.cache/npm/`. `build` writes ignored `dist/` only. Do not create a second checkout/worktree for routine cloud startup. Preserve existing user changes.

The real signed-out screen appears without Google credentials. The separate preview is explicitly sample/read-only. No product endpoint fabricates a user. Optional genuine local login uses a separate development OAuth Web client and ignored `.env`; register the exact `APP_URL`, normally `http://localhost:3000/oauth/callback`. A Codespaces browser needs its forwarded HTTPS callback URL. Local persistence supports one Node process; Google-specific AI/file adapters are production Apps Script helpers.

## Generate the paste-ready package

During an authorized source change:

```bash
npm run release
npm run preview
```

The first command combines server modules into `google-apps-script/Code.gs`, copies the four HTML files and manifest, and creates the offline copy-button installer. Code in `src/` remains canonical. Do not upload both combined Code.gs and separate server modules into the same Google project.

## Optional clasp upload

Manual editor installation requires no CLI. For developers who choose clasp, build the separate module output under `dist/apps-script/`, create the Google project, and enable the [Apps Script API](https://script.google.com/home/usersettings) for its owner:

```bash
npm run clasp -- login --no-localhost
npm run configure -- YOUR_APPS_SCRIPT_PROJECT_ID
npm run build
npm run clasp -- show-file-status
npm run clasp -- push
```

These are user/developer actions, not commands performed during this delivery. Confirm the target before upload. `.clasp.json` is ignored and the helper refuses to overwrite an existing target. Keep developer credentials outside Git and separate from the players' OAuth Web client. The pinned optional clasp has a recorded development dependency advisory; the Google editor path avoids it.

## Production properties and scopes

Required: `DATABASE_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL`. Optional: `GEMINI_API_KEY`, `GEMINI_MODEL`. `initializePrivateStorage_` creates `PRIVATE_FOLDER_ID` for app-created private images. No secret values belong in files, chat or browser responses.

The supplied manifest uses Sheets v4, Drive v3, V8 and Asia/Bangkok; scopes are spreadsheets, `drive.file` and external HTTP. Login separately requests OpenID/email/profile and establishes identity from server-verified Google UserInfo. The Drive scope covers app-created/authorized files, not every manually uploaded file in the owner's Drive. A full PDF ID is optional source metadata and does not grant player access.

Deploy **Execute as Me**, with transport access permitting intended accounts and OAuth callbacks, register the exact stable `/exec` URL, then run `initializeDatabase_`, `initializePrivateStorage_`, `checkInstallation_` as the owner. The HTMLService outputs set the viewport through `addMetaTag`; login polling does not depend on iframe-to-popup messaging. Source save alone does not update the deployed version.

## Required live acceptance

Use real accounts A/B/C in separate browser profiles. Verify login identity/expiry, forged-session denial, campaign isolation, email-bound invitations, owner-only role elevation, immediate membership revocation, investigator ownership/approval, persistent dice/XP actions, selected reveal across API/search/AI/files/history, bilingual state independence, failed/retried writes and immutable continuing sessions. Exercise actual Sheets/Drive permissions and Gemini failure handling. Record quotas/performance from representative campaigns.

Before changing an installation, export owner campaign JSON and copy the private database Sheet. Keep Drive images separately. Restore preserves current permission decisions and existing file bindings; it refuses edited existing immutable history and ignores untrusted unknown retry receipts. Close old tabs and sign in again after restoration. Revert a bad code update using the previous Apps Script deployment version and a tested private database backup.

## Platform references

- [Apps Script web apps](https://developers.google.com/apps-script/guides/web)
- [HTML Service restrictions](https://developers.google.com/apps-script/guides/html/restrictions)
- [HtmlOutput metadata](https://developers.google.com/apps-script/reference/html/html-output)
- [Sheets atomic batches](https://developers.google.com/workspace/sheets/api/guides/batchupdate)
- [Google Web OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Drive file scope](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)

Current official web-app/HtmlOutput references were reachable and checked in this implementation. Historical blocked-network observations in earlier validation describe that earlier machine state.
