# Improvement state — 30 September 2026

This pass started from main commit `2ccfed76000517f88700d9cab68b69c37537713c`,
confirmed against GitHub's main ref. It changes account correctness, delivery,
subscriptions, authoring sources and navigation without adding a learning model.

## Problems discovered

- Supabase authentication never supplied the store's user id: signed-in students
  still used `local`, causing the sync identity guard to reject their queue.
- Seed card primary keys and global metadata shared one database across profiles.
- Namespaced content ids were written into PostgreSQL UUID columns. The first
  keyset request also compared a UUID column to a non-UUID sentinel; singleton
  queries ordered their nullable `id` instead of their `user_id` primary key.
- Every React view subscribed to a changing whole-store context. Many learning
  reports also recomputed after unrelated settings or management writes.
- The shell could appear before the onboarding lookup completed, then disappear
  under onboarding. Slow-start browser runs made this race reproducible.
- Staging checked cards only, used a shared fixed fixture id, and lacked deployed
  catalog inspection or clear infrastructure diagnostics.
- Physics authoring still used large TypeScript arrays. Mobile offered six
  apparently equivalent entry points despite Today's adaptive session.

## Decisions and changed modules

- `src/state/account.tsx` resolves local vs authenticated identity before any
  study store mounts. `src/data/account-profile.ts` implements explicit local
  adoption, mixed-owner rejection, one-account source claims and concurrent-tab
  idempotence. `src/data/db.ts` pins storage to one profile per document. Auth
  changes hide the old tree and reload; durable account queues remain available
  at the next sign-in. Settings uses this canonical account context. User-keyed
  maps require explicitly owned records; an answer key named `local` stays exact.
- `src/data/sync-contract.ts` preserves educational ids inside payloads while
  deriving stable per-account UUID wire ids for non-UUID keys.
  `src/data/sync.ts` uses valid first-pull and singleton keysets, translates
  deletes consistently, checks header and payload owners, and respects the
  server's clamped update timestamps. `src/state/sync-engine.ts` keeps local mode
  local and surfaces ownership skips. Teacher workspace and custom-review
  browser storage also carry profile boundaries.
- `src/state/subscriptions.ts` and `src/state/store-context.tsx` provide a stable
  committed-state channel with typed field selectors and equality caching.
  Store composition and all application consumers use explicit selections.
  Evidence-only calculations have a separate stable input boundary. Boot waits
  for onboarding and initial plan repair before exposing the shell.
- `scripts/staging-contract.mjs`, `scripts/run-staging-tests.mjs`,
  `.github/workflows/revise-staging.yml` and `supabase/schema.sql` add required
  catalog verification, failure categories, diagnostic artifacts and keyset
  indexes. PostgreSQL's `pg` client is a development-only tooling dependency.
  The seven required secrets and fixture-account contract are documented in
  `docs/operations-runbook.md`.
- `src/content/sources/physics-depth50-mechanics` holds seven structured groups
  covering 92 questions. `src/content/structured-physics.ts` validates source,
  schema, provenance and actual specification mappings.
  `scripts/generate-structured-physics.mjs` emits a deterministic adapter;
  `src/content/questions/physics-depth-50-mechanics.ts` retains its public export.
  The exact pre-migration fingerprints are pinned in a test fixture. Neither
  generation nor release membership grants human trust.
- `src/components/AppShell.tsx` and Today prioritize Today → Session → feedback.
  Mobile retains all manual and management routes in Tools; desktop retains
  direct grouped links. README, architecture, operations and roadmap documents
  describe the resulting product and remaining limitations.

## Regression coverage

- `tests/account-profile.test.ts`: eight tests covering fresh local identity,
  explicit adoption, metadata and offline queues, concurrent-tab adoption,
  existing-account protection, unknown/mixed owners, pinned async storage,
  device A push/device B pull, sign-out and different/same-account sign-in.
- `tests/store-subscriptions.test.ts`: stable selections and listener lifecycle.
- `tests/staging-contract.test.ts`: seven required secrets, independent users,
  deployed schema/RLS/trigger/index drift and fail-closed workflow structure.
- `tests/structured-physics.test.ts`: all 92 exact ids/fingerprints, invalid
  authoring rejection, real specification mappings and artifact determinism.
- `e2e/account-profile.spec.ts`: actual browser account boundary with simulated
  Supabase transport, covering adoption, refresh, cached auth, sign-out,
  separate profiles and switching. It does not claim live Supabase auth passed.
- `e2e/store-subscriptions.spec.ts`: mounted React render counts remain unchanged
  for unrelated sync, grading, settings and outcome writes.
- Mobile navigation tests retain access to every manual route. The live staging
  suite has 25 tests spanning all sync tables, independent identities, denied
  reads/inserts/updates/deletes/ownership changes, stale/equal writes, INSERT and
  UPDATE clock clamps, keyset pages and the actual sync implementation.

## Remaining limits

Live staging needs provisioned credentials and deployed schema/indexes before
rollout. Browser account tests simulate the auth transport; they do not replace
that live check. Outcomes, experiments and checkpoints remain device-local
metadata unless already represented in existing sync entities. E2EE keys need
explicit transfer to another device. Account transitions reset transient UI
state, while preserving committed data. The original local adoption source
stays intact and later local work is independent. Local storage is not an
OS-level privacy boundary or encrypted vault. Remote deletion tombstones and
transactional mutation ledgers remain deferred, as do the remaining authored
banks and finer derived-model subscription boundaries. Human verification and
real learner outcomes still require independent evidence.

## Verification

The complete Chromium journey suite passed: **32 passed, 1 skipped** in 7.1
minutes. The skipped visual comparison has no baseline in this checkout; its
existing skip policy was preserved. Today's layout was separately inspected
with a browser screenshot. The two account-boundary browser tests were then
rerun after the final educational-dictionary preservation correction: **2 passed**.
Browser checks used the installed Chromium and FFmpeg because Playwright's
browser CDN was unavailable in this managed environment. Recording and screenshot
checks stayed enabled; CI's default pinned browser configuration is unchanged.

`npm run test:staging` returned **exit 1**, categorized as **infrastructure**,
because the seven staging credentials were unavailable. The mandatory runner
did not skip or claim success. Its contract and workflow unit tests passed;
the 25 live tests remain unverified until the credentialed workflow runs.

`npm run verify` completed with **exit 0** after the final source correction:

- ESLint passed with **zero warnings**; regular and strict TypeScript passed.
- Curriculum validation passed; freshness checked **32 specifications, 0 stale**.
- Capacitor and structured Physics source/artifact checks passed, including
  the exact 92-question migration fingerprint regression in the test suite.
- Documentation integrity passed for **31 files, 15 routes, 39 npm scripts**.
- WJEC authoring and trust checks passed with no ledger/release-set configuration
  blockers. Existing human-review requirements and blocked unapproved releases
  remain intact; this pass creates no attestations or efficacy evidence.
- Vitest: **238 test files passed, 1 live-staging file skipped**;
  **2,048 tests passed, 25 live-staging tests skipped** (2,073 total).
- Next.js **16.3.6 production build passed**.
- Client budget passed: initial route assets **552,708 bytes raw / 169,817 gzip**.

Documentation integrity was rerun after recording these results; `git diff
--check` passed. No remote schema or deployment was applied as part of validation.
