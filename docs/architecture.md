# Architecture

## The shape of the thing

```
                    ┌──────────────────────────────────────────┐
   browser          │  src/app  (Next.js App Router, client)   │
                    └───────────────┬──────────────────────────┘
                                    │ useStore()
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
- `recall-mastery.ts` keeps a recall-only score separate from exam performance,
  combining card stability and current FSRS retrievability, while exposing
  observed review outcomes and due-card pressure for `/progress`.
- `application-mastery.ts` keeps marked-question application accuracy separate
  from recall, excluding active-recall and pending provisional attempts and
  allocating multi-topic marks fairly for `/progress`.
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
- `src/app/benchmarks` + `src/app/case-study` — live ledger and case-study routes that compute from the same harnesses as CI (Phase 8).

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

**Conflict rule: last write wins per row, on `updated_at`.** Revision data is
append-mostly and single-author, so a CRDT would be a great deal of machinery
for a case that barely arises. The one genuinely mergeable thing — FSRS card
state — resolves to the row with the later review, which is also the row with
more information in it.

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

Rate limiting is a per-process token bucket. Behind multiple instances this
wants a shared limiter; the interface is deliberately the same shape so that
swap is local.

### `src/state` — one store

Revision data is small (thousands of rows), so the whole snapshot is held in
memory and every derived value — mastery, recommendations, predictions, due
counts — is recomputed with `useMemo` on change. That makes them consistent by
construction instead of by cache invalidation, which is the class of bug that
would otherwise show a stale predicted grade next to fresh marks.

### `src/components` and `src/app`

`playwright.config.ts` + `e2e/offline.spec.ts` + `e2e/visual.spec.ts` form the offline-first E2E harness: build → start → Chromium by default (Firefox/WebKit via `PLAYWRIGHT_ALL_BROWSERS=1`), visual snapshots at `e2e/__screenshots__/` (see `e2e/README.md` for the process contract). CI runs it only when `@playwright/test` is installed, otherwise the node smoke in `tests/sync.test.ts` is the gate (`.github/workflows/revise.yml`).

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

## Public benchmarks & case study (Phase 8)

The harnesses above are also published live so the numbers cannot drift from the code:

- **Benchmarks page** (`src/app/benchmarks/page.tsx`, route `/benchmarks`) — live ledger that recomputes `benchmarkRecommendationQuality` + `calibrationReport` in the browser from the same deterministic synthetic harnesses CI runs (`syntheticOutcomePairs`, `syntheticCalibrationOutcomes`). Seed/n controls, provenance row, and the 40-row outcome table; real `(predicted, actual)` pairs drop in with no page change once provider-marked gold exists.
- **Case study** (`src/app/case-study/page.tsx`, route `/case-study`) — the 6-engine narrative (scoring, FSRS, mastery, marking, mistake loop, grades) with a reproduce block; links back to `/benchmarks` and `docs/benchmark.md`.
- **Navigation + data controls** — `AppShell` exposes `/benchmarks` + `/case-study` with `BenchmarkIcon`/`CaseStudyIcon`; `Settings → Data` wires `buildPortabilitySnapshot` / `deletionPreview` / `privacyDisclosure` for GDPR Art. 20/17 portability and local-only privacy. Pinned in `tests/phase8-public.test.ts` (8 tests).

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

- Rate limiting is per-process (see above).
- Past-paper extraction requires a model; the paper is stored either way and can
  be extracted later.
- Topic mapping for extracted questions is term-overlap, not semantic. It is
  deterministic and offline, and a student can always practise a question from
  the topic they expect to find it under.
- Grade boundaries are approximate and labelled as such.
