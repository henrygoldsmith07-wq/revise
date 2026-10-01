# Revise operations runbook

This runbook assumes IndexedDB is the source of truth and Supabase is a
replica. Never ask a student to clear site data before they have downloaded a
recovery copy.

## Supabase outage or RLS regression

1. Check the `sync.failure` and `sync.completed` events in the production log
   drain. They contain status, entity, queue depth and error class only — never
   answer text or question content.
2. Confirm the staging workflow (`Revise staging sync and RLS`) and the
   `revise-staging-sync` test before changing a policy.
3. Keep the app serving in offline mode. Local writes remain durable in the
   outbox; do not purge or replay the queue manually.
4. If a policy or migration was deployed incorrectly, roll back that SQL
   migration, run the staging RLS test, then let the next foreground sync drain
   in bounded batches.
5. If a user's session changed during a drain, the client reports
   `account-mismatch`/`signed-out` and keeps the entries. Have the user sign in
   to the original account before retrying.

## AI provider outage or degradation

1. Check `ai.degraded` events grouped by provider and task. The event is
   deliberately content-free.
2. Keep the provider enabled if the fallback is correct; Revise labels every
   fallback result and continues with authored marking/spec content.
3. If latency or error rates are high, disable the provider at the edge and
   verify that `/practice`, `/review` and `/library` still work offline.
4. Re-enable only after a structured-output smoke test passes. Never replay a
   student's answer into logs while diagnosing a provider incident.

## Broken release rollback

1. Stop promotion and record the build SHA and failing required check.
2. Use the hosting provider's immutable previous deployment (or the last known
   good commit) to roll back. Do not rewrite `main` or delete the deployment.
3. Run `npm run verify`, `npm run test:e2e:ci`, `npm run perf:budget` and
   the staging RLS workflow against the candidate commit.
4. If the failure is a client migration, ship a forward-compatible migration
   fix. The recovery screen can export/repair/reset local data, but a rollback
   must never assume every browser has already upgraded.
5. Announce resolution with the SHA, affected routes, and whether any queued
   sync rows were retained. No answer content belongs in the incident report.

## IndexedDB corruption, quota or interrupted migration

1. Ask the student to choose **Download recovery copy** on the recovery screen.
2. Try **Repair damaged rows**; it removes only rows that fail the persisted
   schema validators and keeps valid history/outbox entries.
3. For quota pressure, export first, remove large media attachments, and retry.
4. Use **Reset this device** only after the recovery copy is confirmed. A
   reset is local and irreversible; the Supabase replica is not a substitute
   for an export because it may be behind the outbox.

## Release evidence

- The `Playwright E2E (Chromium, hard fail)` step in
  `.github/workflows/revise.yml` is an unconditional release check.
- `revise-staging-sync` is scheduled weekly and manually runnable with two
  isolated staging users.
- `revise-curriculum-freshness` writes a machine-readable report weekly and
  fails when any specification is older than the configured freshness window.

## Required staging verification

The `Revise staging sync and RLS` workflow always fails when infrastructure is
missing; regular local Vitest runs may leave the live suite skipped. Required
GitHub repository secrets are exactly:

- `REVISE_STAGING_SUPABASE_URL`: HTTPS URL of a dedicated staging project.
- `REVISE_STAGING_SUPABASE_ANON_KEY`: that project's public anonymous key.
- `REVISE_STAGING_USER_A_EMAIL` and `REVISE_STAGING_USER_A_PASSWORD`.
- `REVISE_STAGING_USER_B_EMAIL` and `REVISE_STAGING_USER_B_PASSWORD`.
- `REVISE_STAGING_DATABASE_URL`: TLS PostgreSQL connection string for a
  read-only catalog inspection identity. It must be reachable from the GitHub
  runner, e.g. the project's session pooler with `sslmode=verify-full` and a
  trusted certificate. Never disable certificate verification.

Provision two distinct confirmed password users dedicated to the suite, with
empty settings/streak/lesson-progress rows. The suite removes active study fixtures; permanent deletion markers and deleted
history envelopes intentionally remain in those dedicated accounts. A failed
active-fixture cleanup must be repaired before the next run. Apply
`supabase/schema.sql`, including the continuity tables, ordering/deletion triggers and indexes, to staging first. Do not use
production users or a production database. No service-role key is needed.
The database connection only reads catalogs; all fixture writes use the anon
key and the two users' JWTs, so they exercise RLS.

`npm run test:staging` checks all required secrets, deployed tables, column types,
primary keys, owner policies, RLS flags, enabled insert/update triggers and
keyset/change-sequence indexes, terminal-history permissions and continuity
function definitions. Live tests independently authenticate A, B and a duplicate A
client; test all sync tables for cross-account read/insert/update/delete and
ownership rewrite denial; reject stale and equal writes; clamp future timestamps;
page equal-timestamp rows; and run the actual app sync across independent
IndexedDB devices with namespaced curriculum ids. A mismatch cannot drain a
queue. Failure labels distinguish infrastructure, authentication, schema-drift,
RLS, sync-algorithm, timestamp-ordering, ownership and deletion-tombstone. Always-uploaded staging JSON artifacts preserve
schema and test diagnostics. Credentials never appear in those artifacts.

A local missing-credential check is evidence that the runner fails closed, not
proof that deployed staging RLS works. Live staging must pass before rollout.

## Account recovery

Sign-out opens the separate local profile and preserves the account database.
Sign back into the same account to recover its queue and study history. Other
accounts see separate seeded cards, metadata and settings. The profile choice
copies local revision once, with explicit student consent, and leaves its local
source available. Existing account databases are never overwritten by adoption.
Mixed-owner local data needs an ownership-aware export/recovery before copying;
choosing a separate profile remains available. A browser reset affects only the
active profile database; account databases are not a remote backup of unsynced
metadata. Export before clearing data.


## Continuity rollout and pre-release gate

1. Apply the additive `supabase/schema.sql` migration to staging. Existing study
   rows retain their schemas; pre-migration hard deletions cannot be reconstructed.
2. Run **Revise pre-release** at the exact candidate ref. It requires `verify`,
   Chromium journeys and the reusable `revise-staging-sync` job, with all seven
   secrets. Failures stop the workflow; missing secrets are failures. Configure
   release protection to require its checks before production promotion. Adding
   a workflow file does not configure GitHub branch protection automatically.
3. Apply the verified migration to the production database before deploying the
   v2 client. Without new tables/RPCs, sync fails visibly and retains offline work.
4. Keep tombstones permanently while stale clients may exist. Never clear them
   to repair a stuck queue: export diagnostics, resolve malformed/mixed-owner rows
   and retry. A restored/imported deleted record needs a new ID.

`tests/continuity-sql.test.ts` executes the real migration twice in PGlite and
checks RLS, terminal intent, frozen prediction fields and the deployed-catalog
checker. It is local SQL evidence, not a substitute for concurrent live Supabase
transactions, PostgREST behaviour or runner network readiness. New continuity
cursors use server commit-order sequence numbers; old study tables retain their
existing timestamp bounds. Server deadlock/transport errors retain mutations
for retry.

History corruption now uses the existing recovery screen instead of feeding
calibration or hanging boot. Download the raw recovery copy before repair.
History load errors never manufacture a replacement result or attestation.

## Private-question and restore repairs

The October reliability fixes require no additional SQL migration. Private
question saves/adoption/restores now queue explicit owners. Old ownerless
question queues repair automatically only inside their pinned account with a
matching private question. An unknown owner on another entity still requires
ownership-aware recovery; never assign the current account indiscriminately.

Same-account restores retain all IDs. Cross-account UUID copies receive stable
new private keys with their references updated, leaving existing remote keys
and shared content intact. For a cross-account restore performed by an older
client that already produced UUID conflicts, preserve the current recovery
export and original source archive before restoring into a clean destination
profile with the fixed client. Frozen prediction conflicts are still rejected;
the client does not guess provenance or rewrite those observations.

A failed continuity page can have committed valid rows before the failure. The
client now refreshes those changes and retains the cursor and pending work for
replay. A visible retry error does not imply that every row was rolled back.
