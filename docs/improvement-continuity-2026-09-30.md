# Architecture and continuity improvement pass — 30 September 2026

## Problems and decisions

The account-isolation pass left several high-responsibility modules, direct
qualification coupling in adaptive composition, large TypeScript content banks,
array-based local outcome histories and hard deletes without durable intent.
The store's field subscriptions protected consumers, but recall/application and
assessment calculations still depended on broader inputs than their evidence.
A runtime dependency audit also found two existing cycles through trust audits
and through planner/recommender/fatigue.

This pass separates responsibilities while retaining public APIs and existing
learning policies. Domain code remains pure; persistence remains in data/state.
Today → Start → answer → feedback → next action remains the product hierarchy.

## Modules changed

- Adaptive contracts, topic selection, step assembly and replanning now have
  separate modules. The public façade resolves an editorial subject capability
  registry and injects nodes into the generic implementation. Unregistered
  subjects retain topic-level fallback without invented capability coverage.
- Question execution owns drafts, hints, grading, evidence persistence and
  regrading. QuestionRunner and QuestionMarkedResult own presentation and reuse
  remediation. The existing lesson state machine is preserved; optional roadmap
  practice links move into outlines. Completion wording no longer promises
  durable retention merely because immediate checks passed.
- Subject correctness separates Maths/Biology/Chemistry validators and shared
  substantive gates. Semantic language helpers, lexical marking, numeric
  matching and recommendation overlays have explicit ownership.
- Content trust is a primitive independent of audits/learner graphs. Fatigue
  owns its effective-minutes curve. A bundled dependency regression rejects
  runtime cycles through these domain entry points.
- Learner mastery and assessment models use stable evidence fields. Recall
  depends on cards/reviews, application on questions/attempts; prediction and
  timing/calibration inputs exclude unrelated theme and plan writes.

## Structured content

Physics reasoning depth moves 48 specification groups and 540 questions from
hand-authored TypeScript into structured JSON. The ordered manifest and strict
source validator produce a deterministic import adapter using the original
runtime transformation. All 540 exact IDs and original content/trust fingerprints
are pinned. The previous 92-question migration remains intact. Capability/spec
mapping, provenance, demand metadata, verification and release membership retain
their existing semantics. Generation cannot manufacture human review.

## Behaviour and continuity

Grade forecasts, actual results, paper outcomes and intervention histories now
sync as owner-scoped row records. Projection, logical clock and queue update
atomically. Legacy arrays migrate before remote merge, so local frozen forecasts
are not overwritten before being captured. Independent offline forecasts use
unique observation IDs within their weekly grouping. Missing or malformed trust,
time or transfer evidence cannot become positive calibration evidence.

Grade forecasts and paper sit-time predictions are frozen. Terminal history
markers win over every later Lamport/device stamp. History reads and action
state updates suppress deleted results reintroduced into a legacy array by an
older tab. Study-row deletions atomically
retain local suppression and remote intent. The SQL migration also retains direct
deletes by legacy clients, including opaque encrypted payloads, and rejects their
later stale writes. Authenticated clients cannot erase terminal records/markers.

Recommendation experiment consent/randomisation, revision/adaptive checkpoints,
drafts, AI caches/DLQ and encryption keys remain device-local deliberately.
Calibration is derived locally from synced evidence. No transient UI is synced.

Portable v2 exports add optional paper histories and terminal metadata. Existing
v2 exports remain compatible; restore rejects stale deleted IDs and frozen
prediction rewrites without partial writes. Owner remapping preserves educational
IDs; wire-only deletion hashes stay bound to their source account. Adoption
queues offline-created outcome records and exact-ID deletions.

## Migration and compatibility

Apply the additive `supabase/schema.sql` migration before deploying the v2 client.
It creates `learner_records`, `sync_tombstones`, owner policies, server sequence
indexes, ordering/deletion triggers and the authenticated deletion RPC. Existing
study-table conflict rules remain in place. An account transaction advisory lock
makes committed continuity sequence order independent of device clocks.

An older schema causes sync failure without draining offline work. Pre-migration
hard deletions cannot be reconstructed. Tombstones must remain while stale
clients can exist; intentional restoration uses a new ID. There is no destructive
remote migration or automatic application to a live project in this pass.

## Verification

The complete `npm run verify` gate passed: lint with zero warnings, regular and
strict TypeScript, curriculum validation, freshness (32 specifications, none
stale), deterministic content checks, documentation integrity, WJEC authoring
and trust gates, full Vitest, production build and client budgets. Following
the final deletion safeguards, lint and both TypeScript checks passed again,
and focused outcome/continuity checks. The final full Vitest rerun passed
2,075 tests across 244 files; 27 credentialed staging tests were skipped.

Fresh production Playwright passed 33 journeys with one visual-baseline test
skipped. After the final action-state safeguard, the Physics persistence/offline
journey and derived-model browser regression passed again on a fresh build.
The complete suite includes mobile navigation/orientation, offline PWA reload,
account boundaries, persistence, core revision journeys and the new measured
derived-model regression. Unrelated theme/plan writes cause zero recalculations;
answer and recall updates invalidate only their evidence-dependent models.
A separate Chromium screenshot check rendered onboarding with no browser errors.
The rebuilt initial route is 552,708 bytes raw / 169,817 bytes gzip and passes
the client budget, unchanged from this pass's baseline.

Local SQL integration executes the real migration twice in PostgreSQL/PGlite,
checks RLS, frozen predictions, legacy/encrypted deletion and causal ordering,
account erasure cascading, and runs the same catalog validator used by staging.
All six SQL integration tests passed. Focused regressions cover
account adoption/switching, clocks, continuity, portability, capability fallback,
content equivalence, marking and dependency cycles.

The pre-release workflow resolves one candidate SHA, then requires complete
local verification, Chromium journeys and the reusable credentialed staging
workflow at that SHA. Staging distinguishes infrastructure/configuration,
schema drift, RLS, sync algorithm, timestamp ordering, ownership and deletion
failures. Missing credentials fail the required runner.

Live staging has not been executed in this environment; credentials are absent.
Local SQL and simulated transport tests do not prove live concurrent Supabase
transactions or deployed RLS. Permanent deleted staging fixtures remain in the
dedicated accounts; active fixture cleanup still must succeed.

## Remaining limitations and next improvement

Further large banks and some recommendation inputs remain broader than ideal.
The provider still composes a substantial learner model. Local browser data is
not an encrypted vault. A real authenticated Supabase browser journey, concurrent
live protocol tests and production schema rollout remain external operations.
Branch protection must explicitly require pre-release checks; adding workflows
does not configure repository policy. Human verification and learner efficacy
remain measured external evidence requirements.

The next highest-value step is credentialed staging validation of v2 continuity,
including true concurrent account transactions and a real signed-in browser
journey, followed by verified schema rollout. Extend structured authoring only
in bounded slices with pinned semantics and human trust unchanged.
