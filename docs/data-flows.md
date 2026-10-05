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
| a | No AI-provider request without explicit opt-in | ❌ **No** | There is no per-learner AI opt-in. The only gate on a provider call is deployment configuration. See gap 1. |
| b | No Pulse request without explicit opt-in | ✅ **Yes** | `UserSettings.pulseEnabled` defaults to `false` and is enforced server-side on every request. Executed at runtime in `tests/api-routes-behaviour.test.ts`. |
| c | No learner free text in server logs | ✅ **Yes** | The only server-side `console.*` carrying anything derived from a learner request logs the task name and a slice of the *provider's response*. `tests/api-ai-failure.test.ts` proves the 500 body carries none of it. |
| d | Account deletion removes server-side rows | ❌ **No** | No account-deletion path exists. "Erase local data" wipes IndexedDB on that device only. See gap 2. |

Claims (a) and (d) are **false as written today**. Do not repeat them in
marketing, sales material, school conversations, or the in-app privacy text
until the corresponding gap is closed and covered by a test.

---

## The sink table

| Sink | What leaves the device | Trigger | Gate | Default state | Learner free text? | Where it is tested |
|---|---|---|---|---|---|---|
| **IndexedDB** (15 stores, `src/data/db.ts`) | Nothing, by itself. It is the primary durable store; egress only happens through the writers below. | Any repository write in `src/data/repository.ts` | `bindDatabaseProfile` pins one profile per application boundary. `clearAll()` and `deleteLocalDatabase()` are the only wipe paths. | Signed-out local profile named `revise`, profile id `local`. No network dependency. | **Yes** — answers, card text, `Mistake.description`, settings, E2EE key material. Plaintext at rest. | `tests/repository.test.ts`, `tests/content-id-migration.test.ts`, `tests/ai-resilience.test.ts` |
| **Supabase sync** (`src/data/sync.ts`, `src/data/sync-contract.ts`, `src/data/sync-deletions.ts`) | Whole domain rows for the 8 collection stores plus settings, streak, lesson progress, learner records and tombstones. Columns: `user_id`, `subject_id`, `topic_id`, `due`, `date`, `data` (JSONB), `updated_at`. | `sync()` — debounced auto-sync timer, manual sync, and the background drain pass | `enqueue()` returns immediately when Supabase is unconfigured. `authIdentity()` must return `"ok"` and is re-checked before and after every batch. `userId !== "local"`. Row-level security scopes every table to `auth.uid()`. | **Off** for a signed-out learner. On for a signed-in learner with a working network. E2EE is **off** by default. | **Yes**, unless E2EE is switched on, in which case `data` is an AES-GCM blob. `user_id` and `updated_at` stay plaintext by design; `due`/`date` are nulled when E2EE is on. | `tests/sync-resilience.test.ts`, `tests/sync-pagination.test.ts`, `tests/sync-schema-parity.test.ts`, `tests/supabase-staging.test.ts`, `tests/compliance.test.ts`, `tests/learner-continuity.test.ts`, `tests/continuity-pull.test.ts` |
| **AI provider** (`src/app/api/ai/route.ts`, `src/ai/client.ts`, `src/ai/provider.ts`, `src/ai/marking-resilience.ts`, `src/ai/mark-dlq.ts`) | A task name plus a payload. For `mark`: the question object and PII-masked answers. For `ocr`: a base64 image. For `cards-from-notes` and `extract-questions`: raw learner text. For `diagnose`: the mistake objects. Downstream: Anthropic or any OpenAI-compatible endpoint, plus classifier.dev on `diagnose-error`. | A learner action — submit an answer, ask for an explanation, photograph work, paste notes. Also the DLQ drain pass, without a learner present. | Server: `getUser()` (401) when Supabase is configured; fail-closed 503 in production when provider credentials exist but auth is not configured; zod `payloadSchemas`; body-size caps; per-user quota via the `consume_ai_quota` RPC. **No learner consent check of any kind.** | Depends entirely on deployment. A deployment with `ANTHROPIC_API_KEY` or `AI_PROVIDER` set will call a model on the first AI action by any signed-in user. Local development with no provider configured returns the deterministic offline fallback. | **Yes, and only partly masked.** `aiMark` applies `maskPii` per answer part; `aiExplain`, `aiSocratic`, `aiDiagnoseError` and `aiRouteSpec` apply `maskStudentText`. `aiDiagnose`, `aiExtractQuestions`, `aiCardsFromNotes` and `aiOcr` apply **no masking at all**. | `tests/api-routes-behaviour.test.ts`, `tests/api-ai-failure.test.ts`, `tests/security.test.ts`, `tests/compliance.test.ts`, `tests/ai-resilience.test.ts` |
| **Pulse** (`src/app/api/pulse/history/route.ts`, `src/data/pulse-consent.ts`) | A paginated view of the caller's own review logs and attempts: record id, card/topic/subject id, grade, confidence, elapsed time, awarded/max, mode, markedBy, timestamps. | An authenticated `GET` to the history endpoint. | `pulseHistoryAllowed()` reads the synced `user_settings.data` on **every** request, including every page of a pagination run. Missing row, missing flag, or anything other than boolean `true` withholds. | `UserSettings.pulseEnabled` defaults to `false` (`src/data/repository.ts`). There is a toggle in Settings. | **No.** The response shape has no free-text field; answers and feedback are not part of it. | `tests/api-routes-behaviour.test.ts` — executes the route and proves 403 when consent is absent, disabled, or revoked mid-pagination. Also `tests/pulse-history-pagination.test.ts`, `tests/api-boundary.test.ts`. `tests/pulse-consent.test.ts` covers the predicate only. |
| **Telemetry** (`src/lib/observability.ts`) | `{ event, at, app: "revise", fields }` where `fields` is built key-by-key from a closed allowlist. | Sync completed/failed, migration failure, AI degraded, storage quota. | `safeTelemetryFields()` rebuilds the object from the 5 allowed event names and 15 allowed field names, clamping numbers and sanitising labels. Out-of-contract keys are dropped, not passed through. | **Nothing leaves the device** unless `NEXT_PUBLIC_OBSERVABILITY_ENDPOINT` is set. With it unset, `captureTelemetry` returns before any network call; events are still dispatched as an in-page `revise:telemetry` DOM event. | **No.** The allowlist cannot express it. | `tests/storage-quota.test.ts` — passes an out-of-contract `answer` and `userId` through a cast and proves both are dropped at runtime. |
| **Funnel / product outcomes** (`src/domain/funnel.ts`, `src/domain/product-outcomes.ts`) | Nothing. Written to the `meta` store under the key `revise.funnelEvents.v1` only. | `recordFunnel()` on app open, recommendation display/accept, feedback read, diagnostic events. | None needed — there is no egress. The log is capped at the most recent 2000 entries with per-type dedupe windows. | Always local. | **No** — event type, a task id or attempt id, and a timestamp. | `tests/funnel.test.ts`, `tests/product-outcomes.test.ts`, `tests/recommendation-audit.test.ts` |
| **Pilot export** (`src/domain/pilot-export.ts`) | Nothing automatically. The Settings button builds a JSON object in memory and saves it to the learner's own device as a download. | The learner clicks "Export pilot evidence" in Settings. | A mandatory agreement checkbox ("I agree to export my pilot evidence") gates the button; it is disabled until ticked. | Nothing exported. | **No** — the export is the redacted shape (below). | `tests/pilot-claim-quality.test.ts` — asserts the serialised payload contains none of the planted answer, feedback, mistake description, or either account id. |
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
cursors per entity. `src/data/sync-deletions.ts` handles per-row deletion:
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

The one way these events leave the device is if the learner exports pilot
evidence — and that path is covered in the next section.

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
| `src/app/api/ai/route.ts:186` | `` `console.error(`[ai] ${task} failed`, error)` `` — the task name and the thrown error object. |
| `src/ai/provider.ts:167` | A configuration warning naming the configured model when it is absent from the allowlist. Deployment config, not learner data. |
| `src/lib/rate-limit-supabase.ts:148` | A fixed warning string about the rate-limit backend. No data. |
| `src/lib/observability.ts:129` | `[revise.telemetry]` plus a JSON payload built through the same allowlist as above. |

The AI-route error object is built in `src/ai/provider.ts` as
`` `anthropic ${res.status}: ${(await res.text()).slice(0, 200)}` `` and the
equivalent for the OpenAI-compatible path. That is a slice of the **provider's
response body** — the upstream service's reply to our request. It is never the
request body. The request body is not reachable from that expression.

`tests/api-ai-failure.test.ts` proves the 500 response body is the fixed string
`"The AI service failed unexpectedly."` and does not contain the thrown
message. The browser-side `console.warn` in `src/state/sync-engine.ts` and
`console.error` in `src/state/store.tsx` run in the client, not on a server.

**Limit of this claim:** it is established by reading every `console.*` call in
`src/`. No test asserts it. See gap 7.

---

## What is NOT proven

These are real gaps in the current code. None of them is mitigated, and none
should be described as solved.

1. **There is no per-learner AI opt-in.** `UserSettings.aiEnabled` is declared
   in `src/domain/types-planning.ts` and defaults to `true` in
   `src/data/repository.ts`, but a repository-wide search finds exactly two
   occurrences of the identifier — the type and the default. It is never read
   by any code path and has no toggle in Settings; the AI panel shows a status
   pill and an explanation, not a control. The only gate on a provider call is
   deployment environment: if `ANTHROPIC_API_KEY` is set, or `AI_PROVIDER` is
   set to something other than `none`, or a compatible base URL and model are
   set, the next AI action by any signed-in user goes to that provider. The
   product claim "no AI request without explicit opt-in" is **false today**.

2. **There is no account-deletion path.** No `deleteAccount` function, route or
   control exists anywhere in `src/`. The Settings button reads "Erase local
   data" and calls `clearAll()` in `src/data/db.ts`, which clears the fifteen
   IndexedDB stores on that browser profile only. It enqueues nothing and tells
   the server nothing; the replica rows remain in Supabase. A cascade does exist
   in `supabase/schema.sql` — every user-owned table declares
   `references auth.users (id) on delete cascade` — but it only fires when the
   auth user is deleted, and nothing in the app deletes the auth user. A learner
   who believes they have "deleted their account" has not.

3. **`public.ai_rate_quota` has no foreign key to `auth.users`.** The table at
   `supabase/schema.sql:226` is keyed by `key text primary key`, and the key is
   the string `user:<uuid>` built from the caller's auth id. Nothing constrains
   it to a real user and nothing cascades on account deletion, so a
   user-identifying uuid string survives indefinitely. RLS is enabled with no
   policies and the only writer is the `consume_ai_quota` security-definer
   function, which does check `p_key` against `auth.uid()` — but "who may read
   it" and "when does it go away" are separate questions, and the second one has
   no answer.

4. **`drainDeadMarks` is a second, unmasked egress path.** `src/ai/mark-dlq.ts`
   re-POSTs queued marks to the AI route as
   `JSON.stringify({ task: "mark", payload: { question: item.question, answers: item.answers } })`
   with the raw answers straight out of the `aiDlq` store. `maskPii` is not
   applied. Every other cloud mark path masks first; this one does not, and it
   fires on a background timer with no learner present and no disclosure shown.

5. **Four AI tasks send learner content with no masking.**
   `aiDiagnose` posts the `mistakes` array, including `Mistake.description`, to
   the `diagnose` task. `aiExtractQuestions` and `aiCardsFromNotes` post learner
   prose as `text`. `aiOcr` posts a base64 photograph of the learner's written
   work. None of the four passes through `maskPii`, `maskStudentText` or
   `maskChatHistory`.

6. **`tests/security.test.ts` does not actually check RLS per table.** The test
   loops over ten table names and, inside the loop, asserts only that the whole
   schema text contains the string `enable row level security` — a property of
   the file, not of the table named by the loop variable. Dropping RLS from any
   single table would not fail this test. The list is also incomplete: it omits
   `lesson_progress`, `learner_records`, `sync_tombstones` and `ai_rate_quota`.

7. **Nothing asserts that the server never logs a request body.** There is no
   test over the logging statements themselves. `tests/api-ai-failure.test.ts`
   covers the HTTP response body only. The claim in this document rests on a
   human having read every `console.*` call in `src/`.

8. **Nothing asserts that `aiCache` and `aiDlq` are device-local and never
   synced.** `tests/ai-resilience.test.ts` checks the two store names exist in
   the schema. It does not check that they are absent from `SYNC_TABLES`, absent
   from the outbox, or absent from `clearAll()`'s inverse. Today they are
   correctly device-local — they are not in `COLLECTION_STORES` and not in
   `SYNC_TABLES` — but that is an observation, not an enforced invariant, and a
   future change could break it silently.

---

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
| Retention settings and the in-app privacy disclosure text | `tests/phase6-platform.test.ts` |