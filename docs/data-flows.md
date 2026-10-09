# Data flows, sink by sink

A reference for **where learner data goes**, what gates it, what the default
state is, and — just as important — what the code does *not* yet prove.

Scope: this document describes the code in this repository as it stands. Every
"proven" claim below names the file or the test that establishes it. Everything
under [What is NOT proven](#what-is-not-proven) is a real gap: it is not
mitigated, not worked around, and must not be described to anyone as though it
were.

The companion document is [`docs/dpia-draft.md`](dpia-draft.md), which maps the
same flows onto the ICO Children's code.

---

## Verdict: the four claims the product wants to make

| # | Claim | Today | Why |
|---|---|---|---|
| a | No AI-provider request without explicit opt-in | ✅ **Yes** | `UserSettings.aiEnabled` defaults to `false`; only an explicit opt-in at the current consent wording counts (`src/domain/ai-consent.ts`). The browser gate (`src/ai/transport.ts`) and the server (`src/app/api/ai/route.ts`, reading `public.ai_consent` on every request) both refuse without it. Executed at runtime in `tests/api-routes-behaviour.test.ts`. |
| b | No Pulse request without explicit opt-in | ✅ **Yes** | `UserSettings.pulseEnabled` defaults to `false` and is enforced server-side on every request. Executed at runtime in `tests/api-routes-behaviour.test.ts`. |
| c | No learner free text in server logs | ✅ **Yes** | The only server-side `console.*` carrying anything derived from a learner request logs the task name and a slice of the *provider's response*. `tests/api-ai-failure.test.ts` proves the 500 body carries none of it. |
| d | Account deletion removes server-side rows | ✅ **Yes**, once the migration and `SUPABASE_SERVICE_ROLE_KEY` are deployed | `POST /api/account/delete` verifies the session, purges non-cascading rows, deletes the auth user (cascading every user table), then verifies nothing is left (`account_residual_rows`). "Erase local data" remains device-only and says so. Route behaviour in `tests/account-deletion.test.ts`; SQL cascade and residue checks executed in PGlite in `tests/privacy-sql.test.ts`. |

Claims (a) and (d) became true with the privacy / AI trust change set, **on a
deployment that has applied `supabase/migrations/20261007000100_privacy_ai_trust.sql`
and set `SUPABASE_SERVICE_ROLE_KEY`**. Without the migration the AI route fails
closed (503: consent cannot be read); without the key account deletion fails
closed (503) and deletes nothing. Neither claim should be repeated externally
until the staging suite has passed against a migrated database.

---

## The sink table

| Sink | What leaves the device | Trigger | Gate | Default state | Learner free text? | Where it is tested |
|---|---|---|---|---|---|---|
| **IndexedDB** (15 stores, `src/data/db.ts`) | Nothing, by itself. It is the primary durable store; egress only happens through the writers below. | Any repository write in `src/data/repository.ts` | `bindDatabaseProfile` pins one profile per application boundary. `clearAll()` and `deleteLocalDatabase()` are the only wipe paths. | Signed-out local profile named `revise`, profile id `local`. No network dependency. | **Yes** — answers, card text, `Mistake.description`, settings, E2EE key material. Plaintext at rest. | `tests/repository.test.ts`, `tests/content-id-migration.test.ts`, `tests/ai-resilience.test.ts` |
| **Supabase sync** (`src/data/sync.ts`, `src/data/sync-contract.ts`, `src/data/sync-deletions.ts`) | Whole domain rows for the 8 collection stores plus settings, streak, lesson progress, learner records and tombstones. Columns: `user_id`, `subject_id`, `topic_id`, `due`, `date`, `data` (JSONB), `updated_at`. | `sync()` — debounced auto-sync timer, manual sync, and the background drain pass | `enqueue()` returns immediately when Supabase is unconfigured. `authIdentity()` must return `"ok"` and is re-checked before and after every batch. `userId !== "local"`. Row-level security scopes every table to `auth.uid()`. | **Off** for a signed-out learner. On for a signed-in learner with a working network. E2EE is **off** by default. | **Yes**, unless E2EE is switched on, in which case `data` is an AES-GCM blob. `user_id` and `updated_at` stay plaintext by design; `due`/`date` are nulled when E2EE is on. | `tests/sync-resilience.test.ts`, `tests/sync-pagination.test.ts`, `tests/sync-schema-parity.test.ts`, `tests/supabase-staging.test.ts`, `tests/compliance.test.ts`, `tests/learner-continuity.test.ts`, `tests/continuity-pull.test.ts` |
| **AI provider** (`src/app/api/ai/route.ts`, `src/ai/transport.ts`, `src/ai/egress.ts`, `src/ai/client.ts`, `src/ai/provider.ts`, `src/ai/marking-resilience.ts`, `src/ai/mark-dlq.ts`) | A task name plus the output of the egress policy (`src/ai/egress.ts`): for `mark` a minimised question (no model answer, provenance or reviewer data) and PII-masked answers; for `diagnose` category plus masked description per mistake; for `cards-from-notes`, `extract-questions`, `explain`, `socratic`, `diagnose-error` and `route-spec` masked text; for `ocr` a JPEG/PNG with EXIF/GPS/text metadata stripped (the handwriting itself cannot be masked). Downstream: Anthropic or any OpenAI-compatible endpoint, plus classifier.dev on `diagnose-error`. | A learner action — submit an answer, ask for an explanation, photograph work, paste notes. Also the DLQ drain pass, through the **same transport** as the live request. | Browser: the learner's consent, read from IndexedDB on every call, then the egress policy, in `sendAiTask` — the only code that POSTs to `/api/ai`. Server: `getUser()` (401); fail-closed 503 in production when provider credentials exist but auth is not configured; **consent from `public.ai_consent` on every request (403 absent/disabled/revoked, 503 unreadable), before parsing**; zod `payloadSchemas` (bounded mark-question and mistake shapes); body-size caps; the egress policy re-applied; per-user quota via `consume_ai_quota`. | **Off.** `aiEnabled` defaults to `false`; legacy stored `true` without a recorded consent wording reads as off. | **Masked everywhere text can be masked**, by the same idempotent policy in the browser and on the server. OCR images are metadata-stripped and sent only with consent. | `tests/api-routes-behaviour.test.ts`, `tests/ai-consent.test.ts`, `tests/ai-egress.test.ts`, `tests/ai-task-policy.test.ts`, `tests/api-ai-failure.test.ts`, `tests/security.test.ts`, `tests/compliance.test.ts`, `tests/ai-resilience.test.ts` |
| **Pulse** (`src/app/api/pulse/history/route.ts`, `src/data/pulse-consent.ts`) | A paginated view of the caller's own review logs and attempts: record id, card/topic/subject id, grade, confidence, elapsed time, awarded/max, mode, markedBy, timestamps. | An authenticated `GET` to the history endpoint. | `pulseHistoryAllowed()` reads the synced `user_settings.data` on **every** request, including every page of a pagination run. Missing row, missing flag, or anything other than boolean `true` withholds. | `UserSettings.pulseEnabled` defaults to `false` (`src/data/repository.ts`). There is a toggle in Settings. | **No.** The response shape has no free-text field; answers and feedback are not part of it. | `tests/api-routes-behaviour.test.ts` — executes the route and proves 403 when consent is absent, disabled, or revoked mid-pagination. Also `tests/pulse-history-pagination.test.ts`, `tests/api-boundary.test.ts`. `tests/pulse-consent.test.ts` covers the predicate only. |
| **Telemetry** (`src/lib/observability.ts`) | `{ event, at, app: "revise", fields }` where `fields` is built key-by-key from a closed allowlist. | Sync completed/failed, migration failure, AI degraded, storage quota. | `safeTelemetryFields()` rebuilds the object from the 5 allowed event names and 15 allowed field names, clamping numbers and sanitising labels. Out-of-contract keys are dropped, not passed through. | **Nothing leaves the device** unless `NEXT_PUBLIC_OBSERVABILITY_ENDPOINT` is set. With it unset, `captureTelemetry` returns before any network call; events are still dispatched as an in-page `revise:telemetry` DOM event. | **No.** The allowlist cannot express it. | `tests/storage-quota.test.ts` — passes an out-of-contract `answer` and `userId` through a cast and proves both are dropped at runtime. |
| **Funnel / product outcomes** (`src/domain/funnel.ts`, `src/domain/product-outcomes.ts`) | Nothing. Written to the `meta` store under the key `revise.funnelEvents.v1` only. | `recordFunnel()` on app open, recommendation display/accept, feedback read, diagnostic events. | None needed — there is no egress. The log is capped at the most recent 2000 entries with per-type dedupe windows. | Always local. | **No** — event type, a task id or attempt id, and a timestamp. | `tests/funnel.test.ts`, `tests/product-outcomes.test.ts`, `tests/recommendation-audit.test.ts` |
| **Pilot export** (`src/domain/pilot-export.ts`) | Nothing automatically. The Settings button builds a JSON object in memory and saves it to the learner's own device as a download. | The learner clicks "Export pilot evidence" in Settings. | A mandatory agreement checkbox ("I agree to export my pilot evidence") gates the button; it is disabled until ticked. | Nothing exported. | **No** — the export is the redacted shape (below). | `tests/pilot-claim-quality.test.ts` — asserts the serialised payload contains none of the planted answer, feedback, mistake description, or either account id. |
| **Pilot telemetry** (`src/lib/pilot-telemetry.ts`, `src/app/api/pilot/events/route.ts`, `product_events` table) | One row per outcome event: rotating device pseudonym, closed event name, subject id, integer counts. Coarse UTC day stamped by the server. | Queued on diagnostic completion, recommendation start, proven recovery and supply-blocked proof; flushed when online and signed in. | Settings → Data toggle, default off; revoking stops the next send and discards the queue. Server: session auth (401), zod shape, per-user rate limit, RLS insert-only with `user_id = auth.uid()`. No select policy — clients cannot read rows back. | **Off.** Nothing queued, nothing sent. | **No.** Closed allowlist; free text, answers and marks detail cannot be expressed. | New in this pass; route behaviour unexecuted here — see `docs/audit-2026-10.md`. |
| **Shared marking disputes** (`src/components/FlagThisMark.tsx`, `src/app/api/marking-disputes/route.ts`, `marking_disputes` table) | One row per explicitly shared dispute: rotating pseudonym, attempt/question/part/subject ids, reason, capped learner note, awarded/max, marker source. | The learner taps "Share with the Revise team" on one flagged mark. | Per-dispute opt-in (no blanket toggle); server session auth, zod shape, per-user rate limit, RLS insert-only. Local flags stay on device regardless. | **Off.** Flags stay local until shared one by one. | **Only the learner's own capped note** (≤500 chars) — the one free-text field, typed for this purpose. | New in this pass; route behaviour unexecuted here — see `docs/audit-2026-10.md`. |
| **Server logs** | One structured line per genuine AI task failure, plus allowlisted telemetry lines and one configuration warning. | An unhandled throw inside the AI task layer. | The 500 response body is a fixed string; the thrown error is never serialised into it. | No logs in normal operation. | **No.** | `tests/api-ai-failure.test.ts` proves the 500 body does not contain the thrown message. Nothing asserts the *log* itself is clean — see gap 7. |

---

## Sink detail

### IndexedDB — the primary store, not a cache

`src/data/db.ts` defines fifteen object stores in one schema:

- Eight collection stores, ordered for sync replay: `questions`, `cards`,
  `reviewLogs`, `attempts`, `mistakes`, `papers`, `plannedSessions`,
  `examDates`.
- Seven more: `settings`, `streak`, `lessonProgress`, `outbox`, `meta`,
  `aiCache`, `aiDlq`.

The last two are device-local by design and never synced. `aiCache` holds
previously AI-graded answers plus the embedding used to find them; `aiDlq`
holds marks awaiting an AI re-grade. Both hold learner answers in plaintext on
the device. `clearAll()` wipes all fifteen.

Database names are profile-scoped: `revise` for the signed-out local profile,
`revise:account:<userId>` for a signed-in one (`profileDatabaseName`).

A signed-out learner is fully functional with no account at all. That is the
single most protective fact in this document, and it is also the reason the
"no data leaves the device" claims below are checkable by reading code rather
than by trusting a deployment.

### Supabase sync

`src/data/sync-contract.ts` is the entity-to-table map. `src/data/sync.ts`
drains the `outbox` store and then pulls, using `(updated_at, id)` keyset
cursors per entity. Upserts drain through the `sync_push_batch` RPC
(`supabase/migrations/20261007000300_sync_push_batch.sql`): up to 200 rows across
all entities per request, one transaction, SECURITY INVOKER so each table's owner
RLS and clock/stale-write triggers still apply; servers without the RPC get the
older per-table upserts. `src/data/sync-deletions.ts` handles per-row deletion:
delete the local row, write a tombstone into `meta`, drop any pending stale
upsert, queue a delete intent, and call the `delete_replica_row` RPC.

Egress is entirely opt-in by signed-in status, not by consent:

- `enqueue()` is a no-op when `isSupabaseConfigured` is false.
- `sync()` returns `skipped: "unconfigured"`, `"offline"`, `"signed-out"` or
  `"account-mismatch"` and does nothing.
- `authIdentity()` is re-checked before and after each batch, so a session that
  changes mid-drain stops the drain.

End-to-end encryption (`src/data/e2ee.ts`) encrypts the `data` column only,
with AES-GCM 256 and a fresh 12-byte IV per row, when `UserSettings.e2eeEnabled`
is true. It is **off by default** and there is a Settings toggle for it. The key
is generated on the device and stored in the local `meta` store under
`revise.e2ee.key.v1`; it is never transmitted, except through the explicit
"reveal key" backup flow the learner initiates.

### Reviewer portal (teachers only)

Teachers, not learners. `public.reviewer_roles` holds the reviewer's auth user
id, a pseudonymous reviewer label, role and stated qualification; it cascades
with the account. Each decision in `public.review_audit_events` carries the
label, role, qualification, date, six checks and comment, plus the reviewer's
auth user id (`reviewer_user_id`, no foreign key) so RLS can bind a decision to
its author. Audit rows are append-only and are kept after the reviewer's account
is deleted, because they are the attestation trail behind trusted content; the
user id is never served to students. `/api/review-ledger` publishes only the
fields the committed ledger already publishes (label, role, qualification,
date, checks), never comments, account ids or rejected decisions.

### The AI provider

`src/app/api/ai/route.ts` is the single server entry point. Provider
credentials are read only in `src/ai/provider.ts`, which is `import
"server-only"`; no provider SDK reaches the browser and no key is ever
serialised into a response. There are twelve tasks; each has a deterministic
offline fallback, so losing the network mid-session degrades to the same result
as having no provider configured.

Four tiers decide who grades an answer (`src/ai/marking-resilience.ts`):
device-local semantic cache → on-device model (`localAiMarking`, off by
default) → cloud AI → deterministic rubric fallback. When the rubric fallback
answers, the attempt is queued in `aiDlq` and retried later.

What the tiers mean for data:

- Cache, local-model and rubric tiers make **no network call**. Nothing leaves.
- The cloud tier sends the question plus `maskPii`-masked answers.
  `aiMark` sets the "details withheld" disclosure only for this tier, which is
  an honest signal.
- The disclosure is derived from `maskSummaryMany()` over what `maskPii`
  actually matched. `src/ai/pii.ts` covers emails, UK phone numbers, UK
  postcodes, school-style institution names, street addresses, and person names
  introduced by a phrase or a title. It is a regex guard, not a named-entity
  recogniser, and it is documented as such in the source.
- A second server-side recipient exists: classifier.dev, reached from the
  `diagnose-error` task via `src/ai/error-classifier.ts`. It receives the
  question prompt, the mark-scheme point and the student answer (each truncated
  to 500/300/800 characters). Those arrive already masked, because
  `aiDiagnoseError` masks before posting to the AI route. `CLASSIFIER_DISABLED=1`
  forces the deterministic local classifier instead.

### Pulse

`src/app/api/pulse/history/route.ts` is the only route that exposes stored study
history to a third party, and it does so deliberately:

1. No Supabase configuration → 503.
2. No authenticated user → 401.
3. `pulseHistoryAllowed(settingsData)` false → 403. This runs **before** any
   table is read, on **every** request including every subsequent page of a
   paginated run.
4. Only then does it query `review_logs` and `attempts`, both scoped with
   `.eq("user_id", auth.user.id)`.

`pulseHistoryAllowed` is a strict identity check against boolean `true`
(`src/data/pulse-consent.ts`): a missing row, a missing flag, a string `"true"`,
or `1` all withhold.

Because the gate re-reads the flag on every request, revoking consent stops the
next page immediately. `tests/api-routes-behaviour.test.ts` proves exactly this
by flipping `pulseEnabled` to false between page one and page two and asserting
403 on page two. Cite that test — not `tests/pulse-consent.test.ts`, which only
exercises the predicate in isolation and does not execute the route.

### Telemetry

`src/lib/observability.ts` has a closed allowlist in both directions:

- **5 event names**: `sync.failure`, `sync.completed`, `migration.failure`,
  `ai.degraded`, `storage.quota`.
- **15 scalar fields**: `status`, `errorClass`, `entity`, `task`, `provider`,
  `schemaVersion`, `durationMs`, `pushed`, `pulled`, `failed`, `queueDepth`,
  `attempts`, `usageBytes`, `quotaBytes`, `percent`.

`safeTelemetryFields()` does not filter — it **rebuilds**. It evaluates each of
the fifteen known fields, clamps numbers into range, rounds them, reduces error
strings to a first token (`safeErrorClass` — a label, never an exception
message), strips labels to an alphanumeric charset and a length cap, and
returns a new object literal containing only those keys. An extra property on
the caller's object cannot survive, because nothing spreads `fields` through.
`tests/storage-quota.test.ts` proves this at runtime by passing `answer` and
`userId` through a cast and asserting neither appears in the output.

With `NEXT_PUBLIC_OBSERVABILITY_ENDPOINT` unset — the default — nothing is
transmitted at all. `captureTelemetry` still dispatches an in-page
`revise:telemetry` CustomEvent for devtools and tests, then returns.

### Funnel and product outcomes — local only

`recordFunnel()` in `src/state/experiments.ts` reads the existing array from the
`meta` store under `revise.funnelEvents.v1`, appends, applies a per-type
dedupe window, truncates to the most recent 2000 entries, and writes back.

It does not call `enqueue()`, does not touch the `outbox` store, and is not
reachable from any table in `SYNC_TABLES`. **Funnel events are never enqueued,
never synced, and never sent.**

`src/domain/funnel.ts` and `src/domain/product-outcomes.ts` are pure analysis
over data already on the device. `aggregateOutcomes()` throws below five
distinct learners and returns `null` rather than a percentage on a thin
denominator.

The one way funnel events leave the device is if the learner exports pilot
evidence — and that path is covered in the next section — or switches on
pilot telemetry, which sends only the closed outcome-event allowlist above
(rotating pseudonym, no free text, no answers).

### The pilot export

`src/domain/pilot-export.ts` produces `{ formatVersion: 1, learners: [...] }`
and strips:

- `Attempt.answers` → `{}`
- `Attempt.marked` → `[]`
- `Attempt.feedback` → `""`
- `Mistake.description` → `""`
- `userId` → a random `anonId` (persisted under `revise.pilotParticipantId.v1`
  so the same learner keeps the same alias across exports)
- Events and rows belonging to any other account are filtered out.

It is reached only through the Settings data panel, behind an unchecked-by-
default agreement checkbox that keeps the export button disabled. The file is
produced with a Blob and an `<a download>`; it is never uploaded.
`tests/pilot-claim-quality.test.ts` plants a private answer, a private feedback
string and a private mistake description and asserts none of them, nor either
account id, appears anywhere in the serialised payload.

### Server logs

Server-side `console.*` calls, exhaustively:

| Location | Carries |
|---|---|
| `src/app/api/ai/route.ts` | `` console.error(`[ai] ${task} failed`, { errorClass }) `` — the task name and the error's class name only. |
| `src/app/api/account/delete/route.ts` | The names of tables with residual rows after a deletion, or an error class. No row data, no user id. |
| `src/app/api/maintenance/retention/route.ts` | An error class when the purge throws. |
| `src/ai/provider.ts:167` | A configuration warning naming the configured model when it is absent from the allowlist. Deployment config, not learner data. |
| `src/lib/rate-limit-supabase.ts:148` | A fixed warning string about the rate-limit backend. No data. |
| `src/lib/observability.ts:129` | `[revise.telemetry]` plus a JSON payload built through the same allowlist as above. |

The provider error object built in `src/ai/provider.ts` quotes a slice of the
provider's response body, which some providers echo back from the request. It
is therefore no longer logged: the route logs only `errorClass(error)`.

`tests/api-ai-failure.test.ts` proves the 500 response body is the fixed string
`"The AI service failed unexpectedly."` and does not contain the thrown
message. The browser-side `console.warn` in `src/state/sync-engine.ts` and
`console.error` in `src/state/store.tsx` run in the client, not on a server.

**Limit of this claim:** it is established by reading every `console.*` call in
`src/`. No test asserts it. See gap 7.

---

## What is NOT proven

Gaps 1–8 from the previous revision of this document were closed by the
privacy / AI trust change set. What closed each, and what is still open:

1. **Per-learner AI opt-in — closed.** `aiEnabled` is off by default, has a
   real Settings control, and is enforced server-side from `public.ai_consent`
   on every `/api/ai` request (`src/domain/ai-consent.ts`,
   `src/app/api/ai/route.ts`). Revoking stops the next request on this device
   immediately and, once the change reaches the server, on every device; a
   revocation made offline is pushed on the next sync and always wins over an
   older opt-in (`ai_consent_order` trigger). **Residual:** while a device is
   offline its revocation cannot reach the server, so *other* devices of the
   same account can still use AI until it reconnects. Local mode (no Supabase
   identity, non-production only) relies on a versioned header the browser
   sends from the learner's local choice; it is not identity-backed.
2. **Account deletion — closed** on deployments with the migration and the
   service-role key. `POST /api/account/delete`; local erasure is labelled as
   device-only everywhere. **Residual:** no re-authentication step is required
   beyond a valid session plus a typed confirmation; a learner's exported
   files and the Pulse controller's copies are outside Revise's reach.
3. **`ai_rate_quota` foreign key — closed.** `user_id uuid not null
   references auth.users on delete cascade`, derived from the key by trigger;
   existing orphans are deleted by the migration; idle rows are purged after
   2 days by `/api/maintenance/retention` (Vercel cron + `CRON_SECRET`).
4. **DLQ egress — closed.** `drainDeadMarks` goes through `sendAiTask`
   (consent → egress policy → request), enqueues nothing without consent, and
   clears the queue when consent is withdrawn.
5. **Unmasked tasks — closed** for text (`diagnose`, `extract-questions`,
   `cards-from-notes` now masked and minimised). **Residual:** an OCR
   photograph of handwriting cannot be masked; it is sent only with consent,
   with metadata stripped, and the Settings copy says so.
6. **RLS test — closed.** `tests/security.test.ts` derives RLS and policies per
   table from the SQL and requires an explicit decision for every table,
   including `lesson_progress`, `learner_records`, `sync_tombstones`,
   `ai_rate_quota` and `ai_consent`. `scripts/staging-contract.mjs` adds a
   deployed-catalog check for the consent and quota tables, and
   `tests/privacy-sql.test.ts` executes the policies in PGlite. **Residual:** the
   live staging suite has not been run against a migrated staging project.
7. **Server log assertion — closed** for the AI route: it now logs a task name
   and an error *class* only, and `tests/security.test.ts` asserts no logging
   call in the route references the body, payload or raw error.
8. **Device-local AI caches — closed.** `tests/ai-task-policy.test.ts` asserts
   `aiCache`/`aiDlq` are neither collection stores nor sync tables and are
   never enqueued.

Still open and outside this change set: the controller identity, privacy
notice, sub-processor register and transfer mechanism (DPIA section 7, items
4–5, 7); Pulse consent is read from the synced `user_settings.data`, which is
unreadable server-side when sync encryption is on (Pulse then withholds —
fail-safe, but the toggle silently stops working for E2EE users); card image
attachments are synced with whatever metadata the original file carried.

## Test evidence index

| Claim | Test that establishes it |
|---|---|
| Pulse returns 403 when consent is absent, disabled, or revoked mid-pagination | `tests/api-routes-behaviour.test.ts` |
| Telemetry drops out-of-contract fields at runtime | `tests/storage-quota.test.ts` |
| The AI 500 body carries none of the thrown error | `tests/api-ai-failure.test.ts` |
| PII masking runs before outbound AI calls; E2EE is on the sync write path | `tests/compliance.test.ts` |
| Sync round-trips, pagination, schema parity, staging policies | `tests/sync-resilience.test.ts`, `tests/sync-pagination.test.ts`, `tests/sync-schema-parity.test.ts`, `tests/supabase-staging.test.ts` |
| The pilot export is redacted and account-scoped | `tests/pilot-claim-quality.test.ts` |
| AI route auth, payload validation, body caps, rate limiting | `tests/api-routes-behaviour.test.ts`, `tests/security.test.ts` |
| Marking tiers and DLQ behaviour | `tests/ai-resilience.test.ts` |
| The in-app privacy disclosure text | `tests/phase6-platform.test.ts` |
| AI consent is off by default, strict, enforced per request, revocable | `tests/ai-consent.test.ts`, `tests/api-routes-behaviour.test.ts` |
| Every AI task's payload goes through one masking/minimisation policy, browser and server; retries use the same transport | `tests/ai-egress.test.ts`, `tests/ai-task-policy.test.ts` |
| Account deletion: session-scoped, service role server-only, cascade, residue check | `tests/account-deletion.test.ts`, `tests/privacy-sql.test.ts` |
| Retention policy names only enforcing code; quota purge runs daily and is secret-gated | `tests/retention-policy.test.ts`, `tests/privacy-sql.test.ts` |
| Per-table RLS decision for every table | `tests/security.test.ts`, `tests/privacy-sql.test.ts` |