# Project guidance

Use `docs/master-brief-th.txt` as the product requirements, `docs/requirements-review.md` for implementation decisions, and `docs/roadmap.md` for phase gates. User instructions take precedence. Explain deliveries in Thai where practical, keeping familiar technical terms in English.

- Preserve HTML/CSS/vanilla JavaScript + Google Apps Script + Sheets + private Drive; Gemini is optional. Node is for local development/tests, not the production runtime.
- The user explicitly expanded the scope to every system in the Master Brief and requested a paste-ready Apps Script release. This supersedes the previous stop-after-Foundation development gate. Report implemented, locally tested, and Google-deployment-tested behavior separately; live Google acceptance remains pending. Read docs/full-build-validation.md for automatic mechanics versus explicit GM adjudication.
- Use the existing checkout. Cloud tasks are already isolated; create no worktree unless requested. Check status/current files and preserve user changes.
- Identity comes from the server's verified Google exchange and immutable subject. Recheck campaign membership/role/object permissions for every request, including replay. Never accept browser identity/role/owner assertions.
- Keep GM data out of player payloads, search, translations, files, AI context, and caches. Keep database/storage private to the owner.
- Use stable IDs, optimistic versions, audited actions, and actor-scoped retry keys. Sheets commits use one atomic API batch; locks alone are not transactions.
- Treat the brief's game-rule candidates as unverified until checked against the Corebook. Use `docs/rules-verification.md` and explicit source citations/versions. A verified catalog entry is not proof of complete automation; each supported mechanic needs its own validation.
- Never add the full PDF, extracted full-book text, secret values, tokens, or credential files to Git. Keep setup outputs/caches in ignored paths. `.env` and clasp credentials remain local; production secrets belong in Script Properties.
- Do not commit, push, upload, deploy, publish, or add paid services without an explicit user instruction. Keep a reviewable result and accurate setup/validation documentation.
- Run `npm run check` for relevant server/client changes. Browser checks use `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser` when system Chromium exists; their isolated fixture server requires port 3000 free. Stop/restart only services you started. Do not describe fixtures as real Google verification.

`npm run build` changes ignored dist/ only. Use `npm run release` to regenerate the tracked google-apps-script/ paste-ready release during an authorized source change; `npm run preview` refreshes the tracked offline example. Never edit generated code directly.

See `docs/full-build-validation.md` for current outcomes and `docs/validation.md` for the earlier Foundation record and optional clasp dependency advisory. Do not disable TLS/integrity checks or apply a breaking dependency downgrade to conceal it.
