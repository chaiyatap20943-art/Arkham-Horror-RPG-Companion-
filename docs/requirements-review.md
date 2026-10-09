> Scope update,2026-10-09: The user explicitly selected every system in the Master Brief and requested full paste-ready Apps Script code. That instruction supersedes the earlier Foundation-only development gate below. Current implementation/acceptance status is in [full-build-validation.md](full-build-validation.md) and [roadmap.md](roadmap.md). The original review is retained as architecture history; live Google acceptance remains pending.

# Requirements review

Reviewed: 2026-10-07. Requirements source: the user-provided Thai master brief, version 1.0. The accompanying Arkham Horror RPG Corebook is the required evidence for a separate rule-verification process. This document summarizes product requirements; it does not reproduce either attachment.

The requested product is a private Arkham Horror RPG campaign companion (ผู้ช่วยแคมเปญ), with a campaign as the persistent home, sessions as chapters, and investigators (นักสืบ) continuing between sessions. It is separate from the Arkham Horror card game and board game.

## Initial implementation boundary

The initial implementation milestone is **Foundation + Campaigns**: a bilingual application shell, a real Google identity integration path, persistent campaign and membership services, email-bound invitations, and server authorization. This is a milestone within the requested MVP. It is not the complete MVP and does not establish production readiness.

Actual Google identity verification, storage access, and multi-account behavior must be exercised in a configured Apps Script deployment before the authentication milestone can pass its deployment gate. A local preview or simulated runtime establishes neither Google authentication nor Google service access.

The user subsequently asked to follow the brief closely while permitting execution-driven adjustments. The staged gates are retained: this delivery prepares the foundation and the small campaign workflows needed to exercise its permissions; it does not accept Phase 3 or start game mechanics before the real Google authentication gate passes. The atomic JSON-record Sheets layout and verifier-bound login polling are documented implementation adjustments.

## Architecture and defaults

| Area | Initial decision | Reason |
| --- | --- | --- |
| Presentation | HTML, CSS, vanilla JavaScript | Preserve the requested stack; serve an accessible mobile and desktop interface. |
| Runtime | Google Apps Script | Production application services remain on the requested platform. |
| Persistence | Google Sheets | A persistent source of truth, with validation and foreign-key checks in server code. |
| Files | Private Google Drive storage | Campaign assets require the same authorization as their records. |
| AI | Optional Gemini integration | Application basics must continue when the model is unavailable. |
| Development | Node-based local checks and preview; Codespaces configuration | These tools do not replace the actual Apps Script runtime. |
| Storage owner | Central installation owner | Members access the app; they do not receive raw database or parent-folder access. |
| Identity | Verified immutable Google subject | A display name or submitted email cannot establish identity. |
| Language | English canonical data with Thai translation layer | Changing language must not alter identifiers, XP, dice, or campaign state. |
| Invitations | In-app, verified-email-bound | Email notifications remain an optional separate integration. |
| Roles | GM, Co-GM, Player, plus owner governance | Permissions are scoped to a campaign and refreshed for each request. |
| Visibility | Private by default; explicit GM, GM + Co-GM, campaign, or selected-player access | Secrets must be absent from unauthorized payloads, including nested data. |
| Session concurrency | One active or paused session per campaign | Prevent conflicting live state; historical sessions remain distinct. |

Default choices are implementation assumptions, not verified game rules. Unsupported official rules must fail safely rather than acquire invented values.

## Required domain contracts

- Investigators belong to campaigns, not sessions. Attendance links a user and investigator to a particular session.
- IDs are stable across renames and translations. Every campaign object and foreign key is checked against its campaign.
- Client requests cannot choose arbitrary Sheets tables, set their identity, elevate their role, move records across campaigns, or set approval and XP fields without an authorized domain action.
- Every mutable record needs consistent timestamps and a version. Reject stale writes; do not silently overwrite them.
- Repeat mutation requests must return their original result without applying the effect again. Scope request keys to the actor and operation and detect a changed request body.
- Use a lock around critical reads and writes. Multiple Sheets writes still need a recovery plan; a lock alone is not a transaction.
- End-session history is an immutable snapshot with schema and rule versions. Preserve persistent investigator state and record corrections as amendments.
- Treat user-provided strings as data when writing to Sheets; prevent formula interpretation.
- Permission checks cover files, translations, rule search, AI context/history, exports, and caches as well as visible screens.

Supporting persistence includes users, campaigns, memberships, invitations, mutation requests, audit entries, schema migrations, and later snapshots, advancement ledgers, and selected-player object access. Table details should follow the implemented schema and evolve through non-destructive migrations.

## Risks and unresolved validation

| Risk | Required response |
| --- | --- |
| Apps Script identity with personal Google accounts | Do not rely on `Session.getActiveUser().getEmail()` alone. Verify Google identity server-side and test two separate accounts at the real deployment URL. |
| HTML Service iframe, origins, and redirects | Validate the selected sign-in flow on a deployed app. Local preview cannot prove browser or OAuth consent behavior. |
| Browser-submitted claims or decoded JWTs | Reject unverified identity. JWT decoding alone is insufficient; the chosen flow must validate identity through Google's supported verification mechanism. |
| Credentials and deployment | Google runtime configuration and usable authentication credentials were not supplied with the requirements. Setup instructions must name settings without printing or storing secret values in source. |
| Sheets concurrency and partial writes | Version checks, idempotency, and explicit recovery states are required for roll, XP, reveal, and end-session operations. |
| Rule accuracy | All master-brief `RULE-CANDIDATE` values require Corebook verification before use in mechanics. Distinguish printed page from PDF page index. |
| Spoiler and copyright leakage | Keep the full PDF and extracted full-book text out of the repository. A player citation must not grant unrestricted access to a book or GM material. |
| Model responses | Filter source permissions before retrieval, validate citations, label suggestions, and never grant the model authority to mutate game state. |
| Quotas and performance | Measure actual platform behavior and use pagination, batching, polling control, and progress states. Brief performance targets are goals, not established guarantees. |

## Verification priorities

For the first milestone, test unauthenticated denial (AT-01), campaign isolation (AT-02), invitation identity (AT-03), spoofed identity/role rejection, membership revocation (AT-16), stale-write conflict (AT-13), and safe duplicate retries (AT-12 where applicable). Verify Sheets persistence through actual runtime integration separately from local unit tests.

The complete MVP additionally needs investigator ownership and validation, approval, bilingual state independence, continuing sessions, verified dice examples, hidden and selected-player content filtering, grounded AI, and recoverable snapshots. Relevant acceptance cases are recorded in [the roadmap](roadmap.md).

No Google deployment, live multi-account authentication gate, complete MVP, or production readiness is claimed by this requirements review.
