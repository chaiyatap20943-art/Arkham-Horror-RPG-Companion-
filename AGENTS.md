# Project guidance

Use `docs/master-brief-th.txt` as the product requirements, `docs/requirements-review.md` for implementation decisions, and `docs/roadmap.md` for phase gates. User instructions take precedence. Explain deliveries in Thai where practical, keeping familiar technical terms in English.

- Preserve HTML/CSS/vanilla JavaScript + Google Apps Script + Sheets + Drive; Gemini is a later integration. Node is for local development/tests, not the production runtime.
- Keep delivery staged and report implemented, locally tested, and Google-deployment-tested behavior separately. The foundation's live two-personal-account Google gate is currently pending. Do not claim a playable MVP or production readiness from the foundation alone.
- Use the existing checkout. Cloud tasks are already isolated; create no worktree unless requested. Check status/current files and preserve user changes.
- Identity comes from the server's verified Google exchange and immutable subject. Recheck campaign membership/role/object permissions for every request, including replay. Never accept browser identity/role/owner assertions.
- Keep GM data out of player payloads, search, translations, files, AI context, and caches. Keep database/storage private to the owner.
- Use stable IDs, optimistic versions, audited actions, and actor-scoped retry keys. Sheets commits use one atomic API batch; locks alone are not transactions.
- Treat the brief's game-rule candidates as unverified until checked against the Corebook. Use `docs/rules-verification.md` and explicit source citations/versions. Verified facts there are currently not implemented mechanics.
- Never add the full PDF, extracted full-book text, secret values, tokens, or credential files to Git. Keep setup outputs/caches in ignored paths. `.env` and clasp credentials remain local; production secrets belong in Script Properties.
- Do not commit, push, upload, deploy, publish, or add paid services without an explicit user instruction. Keep a reviewable result and accurate setup/validation documentation.
- Run `npm run check` for relevant server/client changes. Browser checks use `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser` when system Chromium exists; their isolated fixture server requires port 3000 free. Stop/restart only services you started. Do not describe fixtures as real Google verification.

See `docs/validation.md` for current outcomes and the optional clasp dependency advisory. Do not disable TLS/integrity checks or apply a breaking dependency downgrade to conceal it.
