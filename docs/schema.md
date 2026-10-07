# Foundation schema v1

Storage belongs to the installation owner. Players access records only through authenticated domain endpoints. No raw Sheet/Drive link is returned to a player. Apps Script editors are trusted administrators.

## Physical storage

The first milestone uses six managed Sheet tabs, each with the following physical columns. Domain fields remain typed, validated JSON data; they are not separate independently editable Sheet formulas. This adjusts the brief's proposed column layout to support consistent atomic writes and portable tests. Later schema changes must migrate these records deliberately rather than infer a new layout.

| Column | Type | Meaning |
| --- | --- | --- |
| `RecordKey` | Text, unique | Stable dictionary key; never a name or translated label. |
| `CreatedAt` | UTC ISO text | Creation time (audit event time for immutable audit rows). |
| `UpdatedAt` | UTC ISO text | Last update (creation time for immutable retry receipts). |
| `Version` | Positive integer stored as text | Optimistic record version, or 1 for immutable receipts. |
| `DataJSON` | Text | Complete domain record. |

All cell writes use Sheets `userEnteredValue.stringValue`, so user data is never interpreted as a formula. Record JSON is limited to 40,000 characters, below the storage format's cell limit; input fields have smaller explicit domain limits. Unknown headers/duplicate keys fail closed. Extra owner-managed tabs are preserved. Initialization creates missing tables and never resets existing records.

## Logical records

| Table | Key and fields |
| --- | --- |
| `Users` | `google:<sub>`; `id`, `googleSubjectId`, verified `email`, `emailVerified`, `displayName`, `preferredLanguage`, `createdAt`, `updatedAt`, `lastLoginAt`, `version`. |
| `Campaigns` | `id`; `ownerUserId`, `name`, `description`, `defaultLanguage`, `setting`, private `notes`, `status`, timestamps, `version`. |
| `CampaignMembers` | `<campaignId>:<userId>`; immutable record `id`, `campaignId`, `userId`, `role`, `status`, `createdAt`, `joinedAt`, `invitedBy`, `updatedAt`, `version`. |
| `CampaignInvites` | `id`; `campaignId`, verified-target `email`, `role`, `status`, `invitedBy`, `createdAt`, `updatedAt`, `expiresAt`, optional `acceptedBy`, `acceptedAt`, `version`. |
| `MutationRequests` | `<userId>:<requestId>`; `id`, `userId`, `requestId`, canonical request `fingerprint`, `operation`, `campaignId`, result, `createdAt`. Immutable successful retry receipt. |
| `AuditLog` | `id`; `actor`, `operation`, `target`, `campaignId`, `requestId`, UTC `at`. Immutable event; no tokens, email addresses, or private note bodies. |

Role: `GM`, `CO_GM`, `PLAYER`. Campaign status: `ACTIVE` in this milestone. Member status: `ACTIVE`, `REMOVED`. Invitation status: `PENDING`, `ACCEPTED`, `DECLINED`, `REVOKED`; expired pending invitations project as `EXPIRED`. No synthetic users are created for pending invitations. Identity remains immutable when Google email changes.

## Integrity and access

Every mutation acquires a ScriptLock, reloads the authoritative records, validates identity/current membership/role/object/version, computes the result, then writes all changed tables in **one atomic Sheets API batch**. It commits the domain change, audit event, and retry receipt together. A failed API batch leaves all three unchanged, so the same request ID can be retried. A committed request with an uncertain network response returns its stored result on replay; changed permissions are checked again first. Reusing an ID for a different canonical payload fails.

The database is managed by the app; direct owner edits are outside its lock/invariant system. Use owner backups and app domain actions. The API does not expose raw mutation/audit tables. A Player campaign projection omits `notes` entirely, while GM/Co-GM receive them. Other member profiles expose only stable ID and display name; their Google email is private. Only the owner can appoint/remove elevated roles; the owner remains GM.

Small private-installation tradeoff: the adapter reads complete tables and rewrites each changed table. This supports atomic cross-table mutations without a partially applied multi-sheet workflow, but is not yet suited to large datasets. Pagination, row indexing, quota measurements, retention, and non-destructive migrations are future work.

## Private authentication storage

OAuth state, temporary one-time authorization codes/tickets, ready markers, and hashed app sessions use owner-only Script Properties under `private:` keys, not Sheets. Entries expire; cleanup runs on new login. No Google access/refresh/ID token is persisted. App sessions store only a SHA-256 token digest, user ID, and expiry. The browser holds its own PKCE verifier and app session. Local development represents these private records in mode-0600 `.local/private-auth.json`, and the schema dictionaries in `.local/database.json`. Local persistence supports one process only and is never a production database substitute.

## API envelope

Requests: `{operation,payload,sessionToken?,requestId?,expectedVersion?}`. Transport validates the session and removes only `sessionToken` before domain validation; unsupported identity/role/owner fields are rejected. Mutations require `requestId`. Edits require the current `expectedVersion`.

Responses: `{ok:true,requestId,data}` or `{ok:false,requestId,error:{code,message}}`. `AUTH_REQUIRED` clears client data and requests sign-in; `CONFLICT` requires refresh; `IDEMPOTENCY_CONFLICT` rejects altered retries. Missing and unauthorized invitation IDs share the same denial to avoid disclosing existence.
