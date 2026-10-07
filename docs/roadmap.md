# Delivery roadmap

The master brief requests a complete private campaign platform. The first build milestone is **Foundation + Campaigns**. Its implementation and local checks are distinct from its real Google deployment gate.

## Current milestone: Foundation + Campaigns

Deliverables:

- Repeatable development setup, local preview, test commands, and Apps Script deployment documentation.
- Responsive English/Thai application shell with loading, empty, failure, and expired-login states.
- Google identity integration with stable user identity, explicit expiry/logout behavior, and server validation.
- Persistent users, campaigns, memberships, email-bound invitations, and schema initialization.
- My Campaigns (แคมเปญของฉัน), campaign creation, invitations, join/decline, campaign roles, and owner governance.
- Server permission enforcement, validation, version handling, and mutation retry protection.
- A reviewable configuration inventory with secret names only; no production publication implied.

Review gate:

1. Run repository checks from a clean development setup.
2. Configure the real Google project, Apps Script deployment, and storage using the installation guide.
3. Accounts A and B sign in and retain separate stable identities across repeated logins.
4. Forged, expired, or mismatched identity requests are rejected.
5. A creates Campaign X and is its owner/GM; B accepts an invitation intended for B; C cannot accept B's invitation.
6. A's role in X does not grant access to Campaign Y; removing B blocks B's next request.
7. Reloading the app reads committed campaign data from persistent storage.
8. Repeated or conflicting mutations neither duplicate membership nor silently overwrite data.

The real Google gate is pending until a configured deployment has been tested. A browser preview, passing local tests, and implementation of an OAuth path do not by themselves complete it.

## Remaining stages

| Stage | Deliverables | Gate before claiming completion |
| --- | --- | --- |
| 2. Verified Corebook database | Book provenance, checksum, printed/PDF page mapping, structured entities, resumable import, rule verification register, translation metadata | Sample citations point to the correct source; GM content is classified; every rule needed by the next mechanic is verified. |
| 3. Campaign (preparatory code present; gate pending) | My Campaigns, create/invite/join, campaign roles and dashboards; multi-campaign review, owner controls, invitation expiration/revocation | A/B/C cross-campaign and invitation tests pass on the actual Google deployment, including immediate revocation (AT-02, AT-03, AT-16). |
| 4. Investigator creation (สร้างนักสืบ) | Background, personality, archetype, skills, equipment, verified starting packages, save/resume, submit, GM approval | Valid and invalid builds, budgets, ownership, permission exceptions, and approval pass (AT-05, AT-06, AT-07). |
| 5. Investigator sheet | Persistent resources, verified injury/trauma/effect tracking, equipment, XP ledger, authorized corrections | Language switching and reload preserve state; player payloads cannot bypass ownership or XP rules (AT-05, AT-08). |
| 6. Sessions and continuity | Attendance, start/pause/resume/end, immutable snapshots, timeline, recoverable completion | Session 2 continues Session 1's investigators; prior history stays unchanged; absent members keep membership (AT-09, AT-10, AT-18). |
| 7. Play and dice | Verified pool engine, server-generated dice, roll history, polling, conflicts and retry handling | Source-based scenarios match the Corebook; duplicates and concurrency do not double-spend resources (AT-11, AT-12, AT-13). |
| 8. Rules and AI | Bilingual search, permitted excerpts, permission-filtered retrieval, grounded answers, model failure handling | Known-answer, missing-source, spoiler, prompt-injection, citation, and cache-isolation tests pass (AT-04, AT-14, AT-17, AT-19). |
| 9. GM story tools | Scenes, basic NPC/location information, clues, private notes, handouts, selected-player reveal | Hidden and selected content is filtered consistently in API, search, AI, translation, exports, and files (AT-04, AT-15). |
| 10. Optional scanner and narration | Private upload, OCR, extraction review, translations, player-safe narration | Original/corrected text remain traceable, permission scopes persist, and uploaded text cannot become trusted rules automatically. |
| 11. Journal and recovery | Expanded timeline, XP/character history, exports, backup/restore, migration procedures | Restored data preserves stable IDs, foreign keys, permissions, canonical language, and history (AT-20). |
| 12. Release validation | Mobile/tablet review, keyboard and contrast checks, measured performance, quota behavior, regression and recovery review | All applicable MVP acceptance tests pass on the intended Google deployment with representative users and data. |

Events, audit entries, and snapshots must be introduced when their features first produce history; stage 11 is an expanded user experience, not permission to discard earlier history.

## Full MVP boundary

The MVP includes Google login; campaigns and invitations; GM/Co-GM/Player permissions; sessions and attendance; investigator creation and approval; the digital sheet; verified Corebook data; English/Thai; rules search and grounded AI; dice and roll history; injury/trauma tracking; equipment and advancement; basic GM scenes, clues and handouts; session snapshots and timeline.

Scanner/OCR, richer NPC/enemy/location management, narration, expanded import review, and richer journal/export interfaces are extensions. They can follow the working MVP without weakening privacy, persistence, or rule verification.

## Configuration and source prerequisites

Google project/deployment identifiers, required OAuth configuration, a usable Sheets database and Drive location, and any runtime secret bindings must be configured in the appropriate environment. Gemini configuration is required only for AI capabilities. Do not paste secret values into chat, Git files, test fixtures, or logs.

The provided PDF is a source for verification, not a repository artifact. Mechanics cannot use unverified brief values as defaults. Missing rule evidence blocks the dependent mechanic while unrelated implementation work can continue.

Open product decisions may use clearly documented defaults: central owner storage, in-app invitations, private notes, one active/paused session per campaign, and polling. Real Google authentication, game-rule provenance, credentials, and permission tests remain prerequisites rather than assumptions.

## Reporting each delivery

Record the scope, changed files, schema/configuration changes, tests actually run, checks that still require Google runtime access, known limitations, and recovery instructions. Keep implemented, locally verified, and deployment-verified behavior distinct. Do not call a partial campaign build "MVP complete" or "production-ready."
