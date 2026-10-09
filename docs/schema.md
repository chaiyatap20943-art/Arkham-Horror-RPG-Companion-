# Companion schema v1

The installation owner holds the private Sheet and Drive folder. App members use authenticated domain endpoints; they receive no raw database or full-book link. Apps Script editors are trusted administrators.

## Physical layout and migration

There are22 managed Sheet tabs. Each uses `RecordKey`, `CreatedAt`, `UpdatedAt`, `Version`, `DataJSON`. Records retain typed fields inside JSON, an execution-driven adjustment to the brief's suggested physical columns. All writes use `userEnteredValue.stringValue`, preventing formula interpretation. Record JSON is bounded at40,000 characters; invalid headers, duplicate/unsafe keys and oversized records fail closed.

`initializeDatabase_` adds missing tabs and source catalog records without deleting existing data, resetting versions or touching owner-managed extra tabs. Existing six-tab Foundation installations therefore receive an additive migration. Source updates do not silently overwrite edited canonical rows; mechanics/search reconstruct trusted canonical facts from the compiled source catalog.

| Dictionary / tab | Purpose |
| --- | --- |
| users / Users | Immutable Google subject ID, verified email/display name, language and profile version |
| campaigns / Campaigns | Owner, names/settings, private GM notes and version |
| members / CampaignMembers | Campaign-user membership, current role/status |
| invites / CampaignInvites | Verified-email-bound invitation, expiry and response |
| mutations / MutationRequests | Actor+request ID, canonical fingerprint, successful result/compact receipt |
| audit / AuditLog | Actor, action, campaign, request ID and time; no credentials or private bodies |
| characters / Characters | Creation build/approval plus persistent skills, pool, horror, Insight, XP, items/effects/resources |
| sessions / Sessions | Campaign chapters, statuses, dates, current scene and summary |
| attendance / SessionPlayers | Session/user/investigator attendance independent of long-term membership |
| snapshots / SessionSnapshots | Immutable manifest and bounded SNAPSHOT_FRAGMENT records |
| scenes / Scenes | Narrative/structured scenes, player description, visibility and GM notes |
| assets / StoryAssets | NPCs, enemies, locations, clues, handouts, selected reveals and optional material references |
| events / JournalEvents | Scoped journal, acquisition/play/correction events and visibility |
| rolls / DiceRolls | Server faces, normal/horror/external labels, source versions, pool before/after and adjudication |
| xpLedger / XPLedger | Starting/earned/spent/reversed XP, source, actor, request and character version |
| books / Books | Source title/checksum/edition/import metadata; private optional file binding |
| entities / GameEntities | Campaign-scoped canonical catalog references and reviewable structured imports |
| translations / Translations | Source/version/language/mode key, reviewed/fallback text, model/prompt metadata |
| materials / Materials | Private original image reference, OCR draft, corrected text and visibility |
| aiHistory / AIHistory | Actor/question/typed answer, permitted context citations, model and scope |
| backups / Backups | Reserved normalized registry; downloadable exports are not written as a giant single-cell archive |
| imports / ImportCheckpoints | Book/version, completed batch checkpoint and status |

English IDs and source versions are canonical; changing display language does not mutate investigator mechanics or roll results. Currency is stored in integer cents. Starting skills, packages, budgets, archetype limits, tier costs and prerequisites come from the frozen verified catalog. Unknown/unpriced purchases require a different explicit GM acquisition path; browser prices are rejected.

Dice state uses `poolMaximum`, `poolLimit`, `normalDice`, `horrorDice`, `horrorLimit`, `insightCurrent` and `insightLimit`. There is no independent HP field. Current dice may exceed maximum through documented bonus actions. Injuries/traumas/effects preserve event history while marking healing/resolution/expiry; they are not deleted by a session reset.

## Transactions, retries and external services

Mutations take a ScriptLock, reload state, recheck current user/membership/role/object/version, and commit changed records, audit and receipt in one atomic Sheets batch. A failed batch changes none of them. Replaying a committed request rechecks current permissions and returns a safe projection; changed payload/fingerprint under the same actor request ID is rejected.

AI/Drive preparation runs before the mutation lock against an authorized snapshot; permission, source version/text digest and rate limit are checked again before commit. Newly uploaded private files are marked pending and compensated if the database commit fails. `cleanupOrphanFiles_` checks committed file references before recovering aged markers. This covers storage consistency; provider latency, quotas and simultaneous in-flight billing are separate platform behaviors.

End-session snapshots contain individually bounded immutable fragments instead of one huge JSON cell. Completion, XP award, expiry, snapshot manifest/fragments and compact retry receipt commit together. History projections enforce current visibility and omit GM fields/private character backgrounds; old snapshots are never silently rewritten.

Small-installation tradeoff: the adapter reads complete tables and rewrites changed tables atomically. Search/history paginate responses, but full physical row indexing, retention and measured Google scaling remain acceptance work.

## Permissions and recovery

Roles: GM, CO_GM, PLAYER; campaign owner has extra role governance. Visibility: GM_ONLY, CO_GM, CAMPAIGN_PLAYERS, SELECTED_PLAYERS and OWNER_ONLY for private sources/journals. Public unauthenticated content is disabled. A removed member loses access on their next request, including replay. Selected-reveal revocation filters future API/search/AI/file/history access; it cannot retract information already read or downloaded.

Campaign export is owner-only and contains scoped records/minimal referenced profiles, not OAuth sessions or credentials. Restore checks schema/checksum/IDs/foreign keys and keeps current ownership, role/status/invitation decisions, reveal restrictions, newer unique rows and immutable history. Existing immutable IDs must match exactly. Unknown imported mutation receipts are skipped; unknown memberships remain pending until a fresh verified invitation. Unmatched VERIFIED source claims are demoted. Drive bindings must already belong to the same campaign record; otherwise re-upload/re-register privately. Restore is a checked merge/recovery, not destructive replacement of the installation. Close old tabs and sign in again to create fresh requests afterward.

## Authentication and API

Temporary OAuth state/tickets/ready markers and hashed app sessions live under private Script Properties, not Sheets. Google access/refresh/ID tokens are never persisted or returned. App sessions hold only SHA-256 token digest, user ID and expiry; the browser retains its own PKCE verifier/session. Local development uses ignored mode0600 JSON files and supports one process.

Requests: `{operation,payload,sessionToken?,requestId?,expectedVersion?}`. Responses: `{ok:true,requestId,data}` or `{ok:false,requestId,error:{code,message}}`. Identity/role/owner/table overrides are rejected; mutations require actor-scoped retry IDs and edits require versions.

Normal requests are capped at30,000 characters; bounded exception envelopes allow image upload1,100,000, structured import600,000 and restore4,000,000. Image raw bytes are at most750KiB; UI JSON limits are500KiB for a structured batch and3MiB for restore. Source import batches contain at most100 entities. These are application guards, not claims about Google runtime quotas.
