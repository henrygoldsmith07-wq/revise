# Architecture

## The shape of the thing

```
                    ┌──────────────────────────────────────────┐
   browser          │  src/app  (Next.js App Router, client)   │
                    └───────────────┬──────────────────────────┘
                                    │ useStoreFields(...)
                    ┌───────────────▼──────────────────────────┐
                    │  src/state/store.tsx                     │
                    │  in-memory snapshot + derived values     │
                    └───────┬──────────────────────┬───────────┘
                            │ writes               │ pure calls
              ┌─────────────▼──────────┐   ┌───────▼─────────────┐
              │ src/data/repository.ts │   │ src/domain/*        │
              │  IndexedDB + outbox    │   │ scheduling, mastery,│
              └──────┬─────────────┬───┘   │ planner, recommender│
                     │             │       │ marking, grades     │
          ┌──────────▼───┐  ┌──────▼─────┐ └─────────────────────┘
          │ IndexedDB    │  │ outbox     │
          │ (truth)      │  └──────┬─────┘
          └──────────────┘         │ when online + signed in
                                   │
   server            ┌─────────────▼───────────┐   ┌──────────────────┐
                     │ Supabase (replica, RLS) │   │ /api/ai          │
                     └─────────────────────────┘   │ provider + keys  │
                                                   └──────────────────┘
```

## Layers

### `src/domain` — the revision engine

Pure functions over plain data. No React, no I/O, no clock it does not accept as
an argument (`now` is injectable everywhere, which is what makes the scheduler
and planner testable). This is where every decision the product makes actually
lives:

- `scheduling.ts` wraps FSRS: grading, interval previews, the forgetting curve,
  session queue construction.
- `mastery.ts` turns raw history into a 0–1 number per topic, damped by how much
  evidence exists. Unmeasured is reported as zero, never as a prior — a topic
  the student has never opened must not inflate a predicted grade.
- `evidence-weights.ts`, `topic-weight.ts`, `marks-value.ts`,
  `proof-of-improvement.ts` and `session-explanation.ts` make the optimiser's
  choice about marks and proof: repeats count for less, topics are weighted by
  how much of the exam they carry, performance on unseen questions is an
  interval, and a gain is "proven" only on different questions, answered
  unaided, after a delay. Each recommendation is explained from the same
  evidence it was scored on (see `docs/marks-value-and-proof-2026-10-01.md`).
- `recall-mastery.ts` keeps a recall-only score separate from exam performance,
  combining card stability and current FSRS retrievability, while exposing
  observed review outcomes and due-card pressure for `/readiness`.
- `application-mastery.ts` keeps marked-question application accuracy separate
  from recall, excluding active-recall and pending provisional attempts and
  allocating multi-topic marks fairly for `/readiness`.
- `recommender.ts` scores every candidate activity on a single scale so they can
  be compared, and attaches a human-readable reason to each.
- `planner.ts` builds the timetable and folds missed sessions forward.
- `marking.ts` marks answers against a mark scheme with no model involved; `mark-escalation.ts` keeps low-confidence AI marks provisional and queues them for human review; `delayed-far-transfer.ts` turns a strong answer into a scheduled, novel-context retest and measures its outcome separately.
- `mistakes.ts` converts dropped marks into classified mistakes and cards.
- `grades.ts` predicts a grade with an explicit confidence and range.
- `browser.ts` parses the card-browser query language and filters on it.
- `card-stats.ts` computes per-card and per-deck statistics, including
  measured true retention.
- `custom-study.ts` assembles a hand-built session from a spec.
- `deck-io.ts` validates and materialises imported decks.
- `i18n.ts` — locale detection, dictionary lookup and `t()` interpolation for the localisation scaffolding (en-GB core, cy/fr ready; no runtime dep).
- `onboarding.ts` — funnel measurement: completion/drop-off, time-to-activation and `isActivated` derived from real review/attempt/session signals (local-only, no PII shipped).
- `retention-analytics.ts`, `fsrs-tuning.ts`, `mastery-uncertainty.ts`, `knowledge-tracing.ts`, `recommender-enhancements.ts`, `sync-conflicts.ts`, `portability.ts`, `moderation.ts` — Phase 3–6 learning-science and platform hardening; `mastery-uncertainty.ts` exposes pure Wilson intervals and empirical difficulty signals (including the shared exam-technique vs knowledge diagnosis; covered in `docs/revision-engine.md`).
- `post-session-closure.ts` — pure session-end metrics and next-action rules shared by review, question practice and timed papers.
- Benchmark harnesses (`src/domain/recommender.ts`, `tests/recommender.benchmark.test.ts`) run in CI with no live page; the app routes are Today, review, practice, readiness and library.

### `src/content` — authored revision material

Flashcards are *derived* from each topic's authored key points and common
errors rather than stored separately, so curriculum and content cannot drift
apart: add a topic and its deck exists immediately, offline, with no AI call.
Card ids are deterministic (`seed:<topicId>:<kind>:<index>`), which makes
re-seeding idempotent — an existing user gains newly added topics and keeps
every card's FSRS history.

The question bank is hand-authored per subject with full mark schemes and model
answers, so exam practice and rubric marking work with no provider configured.
The GCSE expansion adds 55 original templates that materialise into 220
board-specific questions across every GCSE topic in WJEC, AQA, Edexcel and OCR.
The Edexcel A-level expansion adds a further 55 original questions across all
Edexcel biology, chemistry, mathematics and physics topics.
The data expansion adds 55 table, experiment and trend templates that
materialise into 440 dataset-driven questions across all 32 subject variants.
The unfamiliar-context expansion adds a further 55 transfer and application
templates, also materialised into 440 questions across all 32 subject variants.
The authentic-source expansion adds 55 original field-note, report, archive and
technical-brief extracts, materialised into another 440 questions across all
32 subject variants.

The misconception library does the same for common errors: each entry names the
wrong belief, why it is wrong, the examiner-visible symptom, and what to write
instead, linked to topics and tagged for analytics.

### `src/data` — offline-first storage

IndexedDB is the primary store. A write lands there and is durable before the UI
updates; the same change is then queued in an outbox. `sync()` drains the outbox
in batches per entity, then pulls anything newer.

**Conflict rules:** plain entities use last-write-wins on `updated_at`; FSRS
cards union/replay causally stamped review operations, and lesson progress and
streaks merge their grow-only evidence. Server triggers clamp future timestamps
and reject stale/equal writes atomically. Pull uses bounded per-table keysets using `id` for collections and `user_id` for singletons;
cursors only advance after successfully processed pages. These rules preserve
review history across duplicate devices rather than choosing one whole card.

The wire format keeps the whole domain object in a `data` jsonb column and lifts
out only what the server indexes or secures on. A new domain field therefore
needs no migration, which matters when a client can be weeks stale and still
syncing. Delayed far-transfer links use this path: the source and completion
attempts remain ordinary attempt rows, so offline reload and cross-device sync
do not need a second schedule table.

### `src/ai` — provider abstraction

```
UI → src/ai/client.ts → POST /api/ai → src/ai/tasks.ts → src/ai/provider.ts → model
                     ↘ offline fallback              ↘ offline fallback
```

- Provider selection: explicit `AI_PROVIDER`, else the first with credentials
  (Anthropic, then any OpenAI-compatible endpoint), else none. **None is a
  first-class supported mode**, not a degraded one.
- Keys never leave the server. No provider SDK ships to the browser.
- Every response is validated with zod against a schema. A malformed reply is
  treated exactly like a failed request.
- Every task has a deterministic offline fallback, and the same fallback exists
  on both sides of the network — losing connectivity mid-session degrades
  identically to having no key configured.
- Every response carries `source: "ai" | "fallback"`, and the UI renders it. The
  product never implies a model wrote something a rubric did.
- The one exception is OCR: there is no offline handwriting recogniser, so it
  returns empty text with an explanation, and typing and dictation stay open.

AI quotas use the atomic Supabase `consume_ai_quota` function when configured,
with an explicitly controlled development fallback. Production fails closed
when the shared limiter is unavailable.

### Account and state boundaries

`src/state/account.tsx` resolves the canonical profile before mounting any study
state: signed out uses `local`; an authenticated session uses its Supabase UUID.
Cached sessions restore magic-link and offline account identity; sync rechecks
server auth before every push/pull stage. An auth identity change hides the old
study tree and reloads the document. Storage is pinned for a document's lifetime,
so late async callbacks cannot write into a different user's database.

The original `revise` IndexedDB database remains the signed-out local profile.
Each account has a separate `revise:account:<UUID>` database, including public
seed cards, private questions, settings, metadata, outbox, checkpoints,
experiments, outcomes, AI cache and regrading queue. Teacher workspace browser
storage is scoped too; custom review queues carry an owner. Settings apply only
after that profile loads. Sign-out preserves account rows and queued writes;
signing in again resumes them. Device privacy still requires an OS/browser
profile on shared computers: IndexedDB is not an encrypted local vault.

On first use of an account on a device, the boundary offers **Copy local
revision** or **Keep profiles separate** when eligible local data exists. Copy
preserves the original local database, remaps only ownership fields and scoped
metadata keys, and atomically commits account rows plus a complete sync outbox.
It preserves educational ids, histories and trust fingerprints. A durable local
claim limits adoption to one account; retries and concurrent tabs adopting into that account are idempotent.
Existing account databases, unknown-owner queues and mixed-owner local data
cannot be adopted. A copy may combine with the same account's cloud history
under the existing merge rules; the student explicitly chooses that copy. It
never auto-copies account A into account B. Grade forecasts, actual results, paper outcomes and intervention histories sync
as owner-scoped `learner_records`. Adoption queues offline history and deletion
markers as well as study collections. Experiments and transient checkpoints
remain local. E2EE keys remain local and need export
on another device. New local work after adoption remains in local mode.

`src/state/store.tsx` composes revision state with planning, sessions, outcomes,
experiments and sync modules and derives learning reports using domain functions.
`src/state/subscriptions.ts` owns a stable subscription channel;
`src/state/store-context.tsx` owns the React selector boundary. Committed store
values publish from a layout effect; React consumers use `useStoreFields` or
`useStoreSelector` with equality caching via `useSyncExternalStore`. Unchanged
selections retain their identities, so sync status cannot invalidate card views,
marking cannot invalidate experiment-only views, and settings do not invalidate
raw histories. Application consumers select their fields explicitly;
`useStore` remains a compatibility API. `learner-mastery.ts` owns evidence/mastery derivation: recall depends only on
cards/reviews, application only on questions/attempts. `assessment-models.ts`
owns grade predictions, paper calibration and response-time derivation with
explicit field dependencies. Settings/theme and plan edits cannot invalidate
these models. The provider composes them; multi-field orchestration views
intentionally subscribe to their full inputs.

### Structured educational source

The capacitor JSON pipeline continues unchanged. A second representative slice
moves 92 WJEC Physics mechanics/thermal/nuclear questions into seven small
specification-group JSON files under
`src/content/sources/physics-depth50-mechanics`, ordered by a manifest.
`npm run content:physics` runs strict source-schema checks, provenance validation,
actual specification-point checks and runtime question validation, then emits a
deterministic typed adapter using the existing authoring helper. The public
module export remains stable. Pre-migration exact question ids and fingerprints
are pinned in `tests/fixtures/physics-depth50-mechanics-fingerprints.json`.

The path is structured source → schema/provenance/spec mapping → exact-fingerprint
human trust ledger → runtime `Question[]`. Generation cannot approve a question.
Release-set membership and human verification remain separate gates in the bank.
`npm run content:check` blocks CI on malformed sources or generated-artifact drift.
A further 540 reasoning-depth questions now use 48 specification-group sources
under `src/content/sources/physics-reasoning-depth`. `content:reasoning` validates
actual capability IDs as well as specification IDs. The generated import adapter
retains the original authoring transformation; all 540 original fingerprints
are pinned. Other large banks remain candidates for later bounded migrations.

### `src/components` and `src/app`

`playwright.config.ts` + `e2e/offline.spec.ts` + `e2e/visual.spec.ts` form the offline-first E2E harness: build → start → Chromium by default (Firefox/WebKit via `PLAYWRIGHT_ALL_BROWSERS=1`), visual snapshots at `e2e/__screenshots__/` (see `e2e/README.md` for the process contract). CI requires the Playwright dependency and runs Chromium E2E unconditionally (`.github/workflows/revise.yml`).

The Le Studio design system (`src/app/le-studio.css`) carries all colour through
CSS custom properties that flip themselves for dark mode, so components carry no
`dark:` variants. `RichText` renders the small markdown subset the content uses
plus KaTeX maths, escaping input before adding any markup.

Session endings use the shared `PostSessionClosure` surface. It makes completion,
marks, time and the next repair step visible together, while keeping navigation
explicit. Review and question practice preserve their history before closing;
timed papers mark the paper practised only when the student chooses a finish
action.

Question practice and papers use the shared `QuestionNavigator` for numbered
jumps, answered/draft status and keyboard-reachable movement. `QuestionRunner`
reports unfinished answers to the owning session, so leaving a question and
returning to it does not erase work that has not yet been submitted.

## Card maintenance

Three decisions worth recording:

**Suspend and bury are different tools.** Suspend removes a card indefinitely
for material that is off-spec; bury is a one-day snooze that expires on its
own. Both leave FSRS state untouched, so unsuspending resumes exactly where the
card left off rather than restarting it.

**Custom study never corrupts the schedule.** Cramming ahead of an exam is
legitimate, but grading a card that is not due would shorten every future
interval on it. Sessions containing not-yet-due cards therefore run as
*previews*: the UI says so, and no grade is recorded.

**Imported decks are treated as hostile input.** It is the one place the app
ingests a file a stranger wrote, so every field is validated and clamped, media
URLs are restricted to `data:image/*`, `data:audio/*` and `http(s)`, a
malformed row is skipped with a reason rather than failing the file, and the
whole import is previewed before a single card is written. Shared decks drop
scheduling: one student's stability numbers are meaningless to another and
would hand the recipient a deck that claims to be learned when it is not.

## Study modes

Five ways to work the same cards, because they train different things — and
because a student who is bored of one will stop rather than switch.

* **Learn** promotes each card from recognition (multiple choice) to
  production (typed from memory). A card graduates only after it is produced,
  never merely recognised, because recognising an answer among four options is
  a far weaker signal than the exam demands. A wrong answer demotes it.
* **Test** builds a fixed paper and grades it only at the end. The delay is
  the point: knowing you got the last one right changes how you attack the
  next, and a real paper offers no such feedback.
* **Match** is the one mode that is genuinely about speed, drilling the
  front↔back association until recognition is automatic.
* **Diagram labelling** exists because a large share of biology and physics
  marks come from labelling a figure, which prose recall does not train.
  Hotspots are stored as percentages of the image, so a diagram labelled on a
  laptop lines up on a phone.
* **Listen** reads cards aloud through the browser's own speech synthesis —
  no network, no audio files — so the walk to school is revisable time.

Distractors for multiple choice are drawn from the same topic first. A wrong
option from another subject teaches nothing: the student eliminates it on
vibes rather than on knowing the material.

## Sharing without a server

There is no backend to upload to, so a shared deck travels either as a **file**
(native share sheet on a phone, download elsewhere) or as a **link whose
fragment carries the deck itself**. Fragments are never sent to any host, so a
shared link stays between the two people sharing it. Links have a hard size
limit; `buildShareLink` halves the deck until it fits and reports what was
dropped rather than failing.

## Offline behaviour

| Feature | No network | No AI provider |
|---------|-----------|----------------|
| Review, grading, scheduling | ✅ full | ✅ full |
| Exam questions | ✅ authored bank + everything stored | ✅ same |
| Marking | ✅ rubric, labelled as such | ✅ rubric, labelled as such |
| Explanations, summaries | ✅ authored spec content | ✅ authored spec content |
| Tutor | ✅ prompts from key points | ✅ prompts from key points |
| Question generation | ✅ serves the bank | ✅ serves the bank |
| Weakness diagnosis | ✅ local heuristics over mistake patterns | ✅ same |
| Planning, analytics, search | ✅ full | ✅ full |
| OCR / handwriting | ❌ type or dictate | ❌ type or dictate |
| Cross-device sync | ❌ queued in the outbox | n/a |

The service worker precaches the app shell (stale-while-revalidate for
navigations) and never caches `/api/*` — a stale explanation is worse than none.

## Quality gates (Phase 7)

Beyond unit tests, Revise now pins these so regressions are caught before review:

- **E2E offline walk** (`playwright.config.ts`, `e2e/offline.spec.ts`): onboarding → seed → due queue → grade → mistake loop *with a browser*, plus offline banner, skip-link focus and search overlay (button + ⌘K). Mirrors the node smoke in `tests/sync.test.ts` so `verify` stays green browserless.
- **Visual regression** (`e2e/visual.spec.ts`): one deterministic Today-shell snapshot at 2% tolerance, stored at `e2e/__screenshots__/`; update via `--update-snapshots` and review the diff in PR. Contract in `e2e/README.md`.
- **Perf budgets** (`tests/perf.test.ts`, `next.config.ts`, `public/sw.js`): curriculum modules ≤100k / domain ≤120k, validation < 1.5s, build artifact < 80MB, `_next/static` immutable + `/api` no-store + SW app-shell precache.
- **WCAG structural pass**: skip-link, Main/Primary/banner landmarks, offline live region, combobox/listbox/option + `aria-activedescendant`, `AnswerInput` label + live status, `Onboarding` dialog + `aria-pressed`, `.sr-only` helper (`globals.css`), `prefers-reduced-motion` + `.reduce-motion` guard and `:focus-visible` ring (`le-studio.css`). Pinned in `tests/a11y.test.ts` (9 tests).
- **Localisation scaffolding** (`src/domain/i18n.ts`): `detectLocale` + `t()` + per-locale dictionaries (en-GB core, cy/fr ready), key-set parity checked (`missingKeys`/`extraKeys`), date/number formatting via `Intl` with ISO fallback.
- **Onboarding funnel** (`src/domain/onboarding.ts`): `OnboardingProgress` → `completionRate`/`dropOffStep`, `deriveActivation` → `timeToActivationMs` + `isActivated`, aggregate `summariseFunnel`. Wired as local-only domain helpers so the UI can emit real completion/activation data without shipping PII.

## Benchmark harnesses & data controls

The harnesses run in CI so the numbers cannot drift from the code (there is no
live benchmarks or case-study page):

- **Benchmark harnesses** — `benchmarkRecommendationQuality` + `calibrationReport` run from the same deterministic synthetic harnesses CI runs (`syntheticOutcomePairs`, `syntheticCalibrationOutcomes`). Real `(predicted, actual)` pairs drop in with no harness change once provider-marked gold exists. See `docs/benchmark.md`.
- **Data controls** — `Settings → Data` wires `buildPortabilitySnapshot` / `deletionPreview` / `privacyDisclosure` for GDPR Art. 20/17 portability and local-only privacy. Pinned in `tests/phase6-platform.test.ts`.

## Testing

412 unit tests over the engine, in `tests/` (29 files). They target behaviour that would be
a real defect if it broke, not implementation shape:

- **scheduling** — grade ordering, lapse counting, immutability, decay curve
  values, queue ordering and interleaving, suspended-card exclusion.
- **mastery** — the evidence-weighting rules, the mistake penalty, the
  distinction between "unmeasured" and "weak".
- **planner** — availability respected, largest-remainder allocation totals,
  weak subjects weighted higher, completed history preserved, missed-session
  recovery and spillover.
- **recommender** — ranking, exam urgency scaling, plan adherence, dropped
  subjects excluded, deduplication.
- **marking / mistakes** — mark-scheme point crediting, partial marks, the
  short-answer cap, MCQ routing, mistake classification, resolution criteria.
- **browser** — query parsing (fields, negation, `or`, numeric properties),
  filtering, warnings on nonsense, tag counting and sorting stability.
- **deck-io** — backup round-trip with scheduling intact, shared-deck stripping,
  CSV/TSV parsing with quoted fields and tab preference, hostile-input clamping,
  duplicate and unknown-topic handling.
- **study tools** — suspend/bury semantics and their expiry, card and deck
  statistics, true retention, custom-study pools, limits, preview detection and
  deterministic shuffling.
- **study modes** — learn-stage promotion and demotion, distractor selection,
  written-answer leniency, test generation and grading, match pairing, and
  diagram parsing, placement and scoring.
- **sharing** — unicode-safe base64url round-trips, link size trimming, and
  the guarantee that a shared deck never carries scheduling.
- **content** — every seeded topic has usable content, every question is
  internally consistent and points at a topic that exists, ids are unique and
  stable, prediction and gamification invariants.

One of these tests found a real flaw during development: a never-studied topic
was reporting 40% mastery from the neutral prior, which would have inflated
every predicted grade before a student did any work. The engine was fixed, not
the test.

## Known limits

- Rate limiting uses an in-memory fallback by default with a pluggable shared backend (see `src/lib/rate-limit.ts`).
- Past-paper extraction requires a model; the paper is stored either way and can
  be extracted later.
- Topic mapping for extracted questions is term-overlap, not semantic. It is
  deterministic and offline, and a student can always practise a question from
  the topic they expect to find it under.
- Grade boundaries are approximate and labelled as such.


## Failed-sync recovery

Outbox mutations retry automatically up to the shared retry cap. An entry that
exhausts that budget is retained locally rather than silently dropped and no
longer blocks newer mutations. The shell surfaces the failed count separately
from ordinary pending work. Settings → Sync recovery exposes safe metadata only
(entity, operation, attempts, queued time and error), with explicit actions to
retry, export the private recovery record, or discard only the queued server
mutation after confirmation. Payload/answer content is never shown by default.

### Product loop and hierarchy

One loop: **Diagnose → Learn/Repair → Practise → Prove → Revisit**. The Next Best
Action engine (`revision-engine.ts`) ranks every candidate step (quick check,
missions, paper repair, proof checks, reviews, adaptive session) and Today shows
the winner with one Start button, so the learner journey is Today → Start →
Answer → Feedback → Continue. The main navigation is Today, Subjects, Progress
and Tools; Tools holds every manual route (Session, Review, Study, Lessons,
Practice, Past papers, Schedule, Settings). Collapsed plan, pace and outlook
sit below the action. No second recommender, tutor or mastery model exists.

Learner-facing evidence uses six states (Not checked, Needs work, Improving,
Awaiting proof, Proven, Regressed). Intervals, recurrence and trust counts stay
behind "Why?"/"Evidence" disclosures; low-data outcome wording is "Too early to
tell … N later checks completed; M more needed".

### Trusted supply and the review workflow

Proof needs trusted, unseen, genuinely different questions.

- `content-trust.ts` – exact content fingerprint and the single trust predicate.
- `human-verification-ledger.ts` – the committed ledger the runtime applies.
- `review-workflow.ts` – unverified → checked → verified over an append-only,
  hash-chained audit log; promotion to the ledger only from a verified chain.
- `review-gates.ts` – content quality gates (mark scheme, totals, spec links,
  spec version, transfer/data labels, provenance).
- `reskin.ts` – number/noun/same-reasoning reskin detection, used by the supply
  audit, by "unseen" supply and by proof classification.
- `supply-audit.ts` – source of truth for what counts as trusted supply.
- `review-priority.ts` – what to review next, by product capability unlocked.
- `product-outcomes.ts` – core-value outcome measures from funnel events,
  attempts and the recovery ledger.

See [`review-workflow.md`](review-workflow.md) and
[`question-supply-audit.md`](question-supply-audit.md).

### Domain and execution ownership

`adaptive-session.ts` is the public composition API. `adaptive-plan.ts` selects a
topic, `adaptive-sequence.ts` assembles steps and `adaptive-replan.ts` reacts to
submitted evidence. All receive capability nodes as data. Editorial registration
lives in `content/capability-registry.ts`; the generic registry validates subject
identity and duplicates, copies graphs and returns an empty graph for unmapped
subjects. Their existing topic path remains available without claiming detailed
capability evidence.

`question-execution.ts` owns answers, hints, grading and persisted evidence.
`QuestionRunner` owns inputs and `QuestionMarkedResult` renders the stored
remediation calculation. Regrading refreshes that calculation. The existing
lesson runner continues to own recall/check gates; the roadmap puts optional
recall/practice actions inside each outline. Subject correctness lives in
separate Maths/Biology/Chemistry validators with shared substantive gates and
lexical evidence. Marking separates lexical coverage from numeric matching;
recommendation overlays consume a shared contract independently of ranking.

`content-trust.ts` owns exact fingerprints and human attestations. Audits compose
that primitive rather than being imported into it. This removes the former
learning-depth → evidence → review → learning-depth/capability cycle. Fatigue
owns the effective-minutes curve, removing planner → recommender → fatigue →
planner. A bundled runtime dependency-graph regression checks these boundaries.

### Cross-device continuity and terminal intent

| Data | Ownership and continuity |
| --- | --- |
| Grade forecasts and actual results | Row replicas; immutable forecast fields; actual result deletion is terminal |
| Paper outcomes | Row replicas; sit-time prediction stays frozen; later marking closes the record |
| Intervention outcomes | Row replicas; absent trust/transfer/time evidence remains absent |
| Recommendation experiments | Device-local assignment and consent; no cross-device randomisation change |
| Revision/adaptive checkpoints and drafts | Device-local execution state; existing validated resume paths |
| Derived calibration | Recomputed locally from synced evidence; no derived cache replication |
| AI cache, DLQ and E2EE keys | Device-local; keys require explicit transfer |

Row envelopes and deleted IDs live in existing IndexedDB metadata; local
projection + logical clock + outbox commit atomically. Old arrays migrate before
remote merge. Missing/mixed-owner/malformed data fails without draining queues
or entering calibration. Forecast IDs distinguish independent offline devices;
weekly grouping remains a reporting convention, never a sync ordering rule.

`learner_records` uses Lamport/device ordering. Both it and `sync_tombstones`
allocate `change_seq` under an account transaction advisory lock, so committed
feed order does not depend on student wall clocks. Owner-scoped cursors advance
only after a whole validated page. Deleted row IDs remain terminal regardless
of a later timestamp or logical counter. An account may intentionally create a
new ID; ordinary upserts cannot undelete an existing ID.

Legacy collection tables retain their existing bounded timestamp conflict rules
and gain write suppression plus direct-delete retention. Encrypted legacy
payloads produce wire-only markers; clients suppress the matching wire UUID
without decrypting educational IDs. Authenticated clients cannot erase history
or rewrite/delete markers. Account deletion still cascades through owned data.

Portable v2 exports add optional paper histories and deletion metadata; old v2
exports remain readable. Restore preserves existing terminal intent and rejects
stale deleted IDs/frozen forecast rewrites atomically. Wire-only hashes remain
bound to their source account when importing into a different owner. Local
adoption, as before, remaps explicit ownership rather than educational IDs.

Private questions acquire an explicit outbox owner when saved, adopted or
restored. Legacy ownerless question mutations can be repaired only in their
pinned account database when the corresponding private question exists; foreign,
shared-curriculum and other unknown-owner mutations remain blocked.

Cross-account portable copies re-key private UUID study records into stable
`copy:<source-owner>:<uuid>` local IDs and update linked identity fields. Existing
wire keys, same-account restore IDs and shared curriculum IDs remain unchanged.
Question part IDs, answers and authored prose are preserved. Imported custom
questions join the restore queue; public seed questions remain local.

Failed continuity pulls report the count of rows already committed and notify
history consumers in a finalizer. The page cursor remains pinned for replay,
while the sync engine reloads committed deletions even when a later row fails.
Open question feedback accepts a grading retry only for its exact attempt ID.
