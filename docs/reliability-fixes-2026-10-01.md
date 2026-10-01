# Reliability fixes — 1 October 2026

The project review reproduced five defects in `14168e4`. This follow-up fixes
the affected behavior and adds regressions for the complete paths.

- Private-question saves pass an explicit profile owner. A pinned account may
  repair its own legacy ownerless question queue when the corresponding private
  question exists. Other unknown owners and foreign payloads stay blocked.
- Adoption and portable restore queue private questions alongside their papers
  and attempts; public curriculum remains local. Extra owner headers on pulled
  questions are validated and remapped during cross-account restore.
- Cross-account restore assigns stable non-UUID local keys to private UUID study
  copies and updates identity references. The existing wire scheme then scopes
  those keys by destination account. Same-account and shared curriculum IDs,
  question parts, answer strings and prose retain their semantics. Wire-only
  deletion hashes remain source-bound and terminal intent remains enforced.
- Open feedback accepts a background grading event only when both its event
  attempt ID and upgraded row ID match the displayed attempt. An old event
  cannot consume the current attempt's update.
- Continuity errors carry committed row counts; history consumers receive a
  notification even if a later row fails. Sync refreshes the committed changes
  while retaining the failed page cursor and pending mutations for replay.

`question-replication.test.ts` exercises upload → sync → independent device,
legacy ownership repair, adoption and restore. Portable tests check linked UUID
copies and unchanged content; the actual migrated PostgreSQL/PGlite schema proves
two owners can insert the copies without a collision or cross-account write.
Continuity tests check partial deletion notification, counts, pending work and
cursor replay. `question-regrading.spec.ts` uses the real React hook in Chromium
to reject old/mismatched retries and accept the current attempt's upgrade.

No new SQL migration is needed for these fixes. The September continuity schema
is still required. Existing remote wire IDs are not renamed. A previous
cross-account copy that already used conflicting UUIDs requires an export-aware
recovery into a clean destination; the client does not rewrite frozen history
or infer ownership from an arbitrary failed mutation.

`npm run verify` passed: 2,085 tests across 246 passing test files, lint with zero
warnings, both TypeScript checks, curriculum freshness, content and documentation
integrity, WJEC authoring and trust checks, the production build and performance
budgets. The initial route remains 552,708 bytes raw / 169,817 bytes gzip. The
suite skipped 27 tests that require external services or credentials.

The complete Chromium suite passed 34 browser journeys, including the new
grading-retry regression; the visual-baseline test was skipped. Live
credentialed staging remains unverified: `npm run test:staging` stopped at its
infrastructure check because the seven required secrets are unavailable. Local
transport and SQL tests do not establish deployed RLS success.
