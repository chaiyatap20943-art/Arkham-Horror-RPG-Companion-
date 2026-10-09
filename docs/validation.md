> Historical Foundation validation. For the expanded full-code build, use [full-build-validation.md](full-build-validation.md). The results below record the earlier milestone.

# Validation record — 2026-10-07

Current delivery: Foundation implementation and preparatory campaign permission workflows. The full MVP and the Google deployment gates remain incomplete.

## Executed in this cloud machine

Node **24.19.0**, npm **11.9.0**, clasp **3.4.1**, Playwright **1.63.0**, system Chromium. No Google credentials were present and no live Google project was supplied.

| Check | Actual outcome | What it establishes |
| --- | --- | --- |
| `npm ci --ignore-scripts` | Passed, frozen lockfile installation repeated successfully | Reproducible local development dependencies; npm integrity verification preserved. |
| `npm run build` | Passed | All shared server/client JavaScript parses; Apps Script and local web outputs generated. |
| `npm test` | **57 passed, 0 failed, 0 skipped** | Authentication (28), domain/permissions (17), local runtime integration (2), Sheets/RPC adapter checks (7), offline export/storage checks (3). |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser` | **5 passed, 0 failed** | Actual browser + Node server + persistent store workflows with isolated test accounts. |
| `npm audit --omit=dev --audit-level=high` | Passed, 0 findings | No production npm dependency advisories; production GAS build does not bundle npm libraries. |
| `npm audit --audit-level=high` | **Failed: 3 high findings in one dev-tool dependency chain** | Current pinned clasp → micromatch → braces has a stack-exhaustion advisory. See below. |
| `git diff --check` | Passed | No whitespace errors. The initial repository was empty/unborn; the user subsequently authorized committing and pushing the Foundation source to `main` for download. |

Authentication tests replace Google transport with explicit provider fixtures. They validate PKCE/state/ticket binding, immutable-subject identity, provider failure rejection, expiry/revocation, and session hashing; **they do not prove a real Google login**. Storage tests emulate the Sheets API while running the actual Apps Script adapter and verify single-batch behavior and formula-safe string cells; **they do not prove Google account scopes or actual spreadsheet access**.

Browser tests start a separate server with a temporary database and explicit test-only hashed sessions. There is no product endpoint, query flag, or mock login that accepts these fixtures. The checks cover:

1. Missing Google configuration keeps the real login disabled and private requests denied.
2. The separately labeled design preview remains read only, switches English/Thai, and fits a 390px mobile screen.
3. Real campaign API writes survive reload; dropping a committed response and resubmitting the same intent creates only one campaign.
4. Invitation UI admits the intended player; unrelated accounts are denied; player responses omit GM notes; removal immediately revokes existing-session access.
5. Logout clears browser state and revokes the persistent session.

Backend checks additionally cover A/B/C role isolation, spoofed fields, expired/duplicate invitations, owner-only elevation, stale writes, denied retry after revocation, canonical retry fingerprints, failed-write rollback, non-destructive initialization, mismatched schema rejection, and safe error correlation.

## Development-tool advisory

The latest clasp version available during setup was 3.4.1. Its transitive `braces` dependency is affected by [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): deeply nested glob patterns can exhaust the parser stack. npm reports the same chain as three high findings. No compatible patched release was offered; `npm audit fix --force` proposes a breaking downgrade to clasp 2.5.0 and was not applied.

This dependency is used only by the developer's optional upload CLI. It is absent from the browser and Apps Script runtime. The repository's clasp ignore patterns are fixed, simple developer-controlled strings; the app does not forward campaign input into the tool. Use the Google editor upload option to avoid the CLI, and revisit the pinned tool when a compatible upstream fix is available. This is a recorded unresolved dev-tool limitation, not a clean all-dependencies audit result.

## Not run — required external prerequisites

The [setup guide](setup.md) lists the exact project creation steps and Script Properties. The following cannot be accepted until the owner configures and tests the actual `/exec` deployment:

- Google consent/authorization-code callback and verifier-bound polling inside HTML Service.
- Two separate personal Google accounts with stable, distinct identities.
- Owner execution, real Sheets API/scopes, private database access, and real persistence.
- A/B/C campaign/invitation/revocation tests on that deployment.
- Google quota, load/performance, origin, popup/storage, and Workspace-policy behavior.

No Google application upload/deployment or environment publication was performed. The GitHub `main` source delivery is user-authorized and is separate from deploying the application. Source rules are recorded as verified facts with citations and explicitly **not implemented**. Investigator creation, sessions/attendance/snapshots, dice, advancement, rule search/AI, files, and scanning have not been run or claimed complete.

## Download and Mac follow-up

The user reported that Save As failed with an Artifact download error for the chat's workspace links. The ZIP CRC checks passed; this was a delivery problem before local installation. After explicit authorization, source delivery uses the GitHub repository rather than relying on those chat download links.

A self-contained `preview/arkham-preview.html` is included in the source. It starts in Thai, uses fictional sample data, and independently blocks network requests with CSP; login and mutations remain disabled. Storage getters and methods are accessed inside error handling, so file-browser storage restrictions do not abort startup. The dedicated export never reads a real stored application session.

Three new Node tests validate deterministic export, syntax, separation from normal application startup, and denied storage. Chromium rendering checks with storage deliberately denied verify initial Thai, language switching, campaign navigation, disabled writes, and zero network requests. This cloud browser's administrator policy blocks `file://` navigation, so the HTML was loaded into a blank browser page for those behavior checks. Actual macOS/Safari testing remains unrun. The regular five browser workflows were rerun and passed after the storage changes.

## Cloud configuration

Reusable installation and startup instructions are saved in the environment draft after execution. The draft also adds `developers.google.com` to the custom network destinations while preserving the existing package-manager presets. Saving the draft does not execute those fields, activate network changes, publish a snapshot, or prove restoration in a fresh task. The current machine's local workflow is tested; review/save and publish through environment settings when you intend to retain it.
