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
   verify that `/practice`, `/review` and `/cards` still work offline.
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
