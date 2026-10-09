# Full application delivery and acceptance

The user explicitly selected **all systems in the Master Brief**, including investigators, play and GM tools, and requested full source usable in Google Apps Script. The implementation therefore extends beyond the original Foundation milestone. This is an implementation scope decision, not acceptance of unrun Google deployment gates.

| Area | Source implemented | Remaining acceptance |
| --- | --- | --- |
| Identity/campaigns | Verified Google exchange, PKCE, sessions, campaign membership/invitations, role/version/retry/audit checks | Real `/exec` login and A/B/C tests |
| Corebook | Frozen verified player/GM facts and source citations, persistent campaign catalogs, structured import/checkpoint/review | Owner source review; full PDF ingestion is not a one-click automatic verified import |
| Investigators | Six-step wizard, drafts, validation, submit/approve/reject/retire, equipment and source-backed advancement/XP reversal | Live Sheets persistence and representative builds |
| Play | Server Dynamic Pool System, horror, selected personality effects, injury/trauma outcomes, audited GM rule effects | Full platform scenarios; narrative/ability effects documented for GM adjudication |
| Sessions/history | Attendance, start/pause/resume/end, scenes, continuing state, atomic immutable fragments and history pagination | Actual Google failed-batch recovery and load |
| GM story | Scenes, NPC/enemy/location records, clues/handouts, selected reveal, private journal, scoped file links | A/B/C spoiler tests through real Drive/search/AI/history |
| Rules/AI | English/Thai search/glossary, permission-filtered retrieval, citation checks, typed answers, rate limits/fallback/history | Real Gemini configuration, model availability/quota and answer review |
| Scanner/narration | Private image upload, OCR draft/review, dynamic translations/narration, permission-checked images | Real camera/file browser, Drive/Gemini and owner review |
| Recovery | Campaign export/merge restore, safe foreign keys/source trust/file bindings/current permissions, immutable history protection | Tested private Sheet/Drive recovery procedure |
| Release | Responsive UI, source/package checks and automated acceptance flows | Actual Safari/macOS, Google runtime/scopes and measured quotas/performance |

`docs/full-build-validation.md` maps the delivered behavior to acceptance cases and records checks actually run. The previous 57-test Foundation record remains in `docs/validation.md` as historical evidence.

Verified catalog facts do not make every ability automatic. Full multiclassing, conditional timing/reactions, equipment-specific adjudication, Heavy Blow/limb actions and real-time fictional deadlines require explicit GM decisions rather than invented engine defaults. Unsupported official automations must remain labeled and source-linked.

Use `google-apps-script/README_TH.md` to install the six-file package. Source delivery and cloud draft updates do not deploy into a Google account, publish the cloud environment, or prove restoration in a fresh task.
