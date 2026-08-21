# Revise

A revision-first study platform. Not a note-taking app: every screen exists to
raise a grade, and the product's core claim is that it always knows the single
highest-value thing you should do next.

Open the app → get a recommended task → complete it → get marked instantly →
progress updates → next task.

Ships with **32 subjects across WJEC / AQA / Edexcel / OCR × A-level / GCSE** —
**440 topics, 374 seed questions**, every topic with `specPoints` and provenance —
as real, authored revision content. The architecture is board-agnostic: adding
a new board or qualification means adding one curriculum module and changing
nothing else.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 466 tests (36 files) — see docs/benchmark.md and /benchmarks for outcome benchmarks
npm run build        # production build
```

No configuration is required. With no environment variables at all the app runs
as a single local profile against IndexedDB, with every feature working — cards,
marking, planning, analytics, search — and only cross-device sync and
model-written prose unavailable. See [`.env.example`](.env.example) for the
optional Supabase and AI provider settings.

## Pulse connection

Revise can share its study history with Pulse, the personal evidence engine in
this ecosystem. Sharing is **opt-in** and controlled here, where the data
originates: Settings → Pulse has a "Share study history with Pulse" switch.
The choice is stored in the synced `user_settings` row (`pulseEnabled`, off by
default), and the `/api/pulse/history` endpoint checks it server-side on every
request — a missing row, a missing flag, or a revoked flag all refuse the
history with `403`. Pulse therefore only ever reads this account's reviews
and attempts while the switch is on; turning it off stops the flow at the
source immediately.

## What it does

| Area | Behaviour |
|------|-----------|
| **Recommendation** | Scores every candidate activity on one scale — due reviews, mistake repair, weak-topic practice, first-pass learning, timed papers — and shows the winner with a plain-English reason. |
| **Spaced repetition** | FSRS scheduling with per-grade interval previews, confidence captured *before* reveal, and failed cards reinserted within the same session. |
| **Exam practice** | Structured questions marked point-by-point against the mark scheme, with examiner-style feedback, model answers, safe draft-preserving navigation and five- or ten-minute question sprints. |
| **Mistake tracking** | Every dropped mark becomes a classified mistake *and* a flashcard automatically, and closes only once the card is recalled reliably. |
| **Past papers** | Upload or photograph a paper and mark scheme, extract questions, map them to topics, navigate by question, practise them question-by-question or sit them in full exam conditions with a fixed clock, no in-paper aids, auto-submit and marking after the paper, then close with full-denominator scoring and a repair route. |
| **Planning** | An adaptive timetable from exam dates, availability, mastery and mistakes. Missed blocks roll forward on their own. |
| **Analytics** | Mastery per topic, measured Retention Mastery from 1/7/30-day recall, predicted grades with honest confidence bands, review forecast, mistake patterns, marks-available-per-topic headroom. |
| **Mistake diagnosis** | Ranks likely root causes from missed points, answer/working evidence, timing, command words and the authored misconception library; one-off evidence stays an early signal. |
| **Marking evidence** | Double-marked answer corpus with independent-marker agreement, disagreement review, adjudication and versioned JSON import/export. |
| **Study modes** | Learn (recognition → typed production), Test (a fixed paper marked at the end), Match (timed pairing), Diagram labelling, hands-free Listen, and Explanation mastery — teach a topic from memory and see which authored key points made it into the explanation. |
| **From notes** | One click: drop a PDF, paste notes or photograph a page, and get flashcards back, previewed before they join the deck. |
| **Onboarding** | Four questions that each change what the app does, ending with a built plan rather than an empty state. |
| **Sharing** | A link that carries the deck in its fragment (never sent to a server), or a file via the native share sheet. |
| **Card browser** | Anki-flavoured query language (`tag:paper-1 is:leech prop:lapses>3`), saved searches, tag chips, multi-select and bulk edit. |
| **Card maintenance** | Suspend indefinitely or bury for a day, rich editor (LaTeX, images, audio, tables), and per-card statistics — ease, lapses, interval, true retention, full review history. |
| **Custom study** | Build a session by filter, pool, order and size. Studying ahead runs as a preview and leaves scheduling untouched. |
| **Decks** | Export as a backup (scheduling intact) or to share (scheduling stripped); import Revise JSON or any Anki/Quizlet CSV/TSV. |
| **Keyboard** | Shortcuts throughout, with a `?` sheet generated from the live bindings. |
| **Input** | Typing, voice dictation, or a photo of handwritten working (OCR). LaTeX throughout. |
| **Offline** | IndexedDB-first with a durable outbox. Installable PWA. Everything works on a train. |

## Architecture

```
src/domain/      Pure revision engine — no React, no I/O, fully unit-tested
  types.ts         The board-agnostic domain model
  curriculum/      Registry + 32 WJEC/AQA/Edexcel/OCR × A-level/GCSE subjects (440 topics)
  scheduling.ts    FSRS wrapper: grading, queues, forgetting curve
  mastery.ts       Topic mastery with explicit evidence weighting
  recommender.ts   "What should I do right now?" (+ recommender-enhancements: cold-start, ties, exploration, gain)
  planner.ts       Adaptive timetable + missed-session recovery (realism + diminishing returns)
  marking.ts       Offline rubric marking against mark schemes + evidence-based per-point explanations
  post-session-closure.ts  Shared session-end metrics and next-action rules
  mistakes.ts      Dropped mark → classified mistake → flashcard
  mistake-root-cause.ts  Ranked, answer-aware diagnosis with confidence thresholds
  exam-conditions.ts  Deterministic paper timer, warning state, answer completeness and progress rules
  quick-session.ts  Fixed five- and ten-minute question selection and priority rules
  grades.ts        Grade prediction with confidence bands + calibration
  retention-analytics.ts  Retention 1/7/30d, marks/hour, technique-vs-knowledge, paper analytics
  fsrs-tuning.ts / mastery-uncertainty.ts / knowledge-tracing.ts  Learning-science hardening + empirical difficulty calibration
  working-analysis.ts  Student working diagnosis + authored worked-solution validation
  moderation.ts / sync-conflicts.ts / portability.ts  Platform: review, sync, GDPR portability
  retention-mastery.ts  Evidence-gated retention status, trend and next action
  moderation.ts / question-validation.ts / sync-conflicts.ts / portability.ts  Platform: review, question quality, sync, GDPR portability
  i18n.ts / onboarding.ts  Localisation scaffolding + funnel measurement
  gamification.ts  Streaks, XP, achievements
  search.ts        Local search across topics, cards and questions
  browser.ts       The card browser's query language and sorting
  card-stats.ts    Per-card and per-deck statistics, incl. true retention
  custom-study.ts  Hand-built sessions, with preview-only cramming
  deck-io.ts       Deck export/import, validation and materialisation
  study-modes.ts   Learn, Test, Match and Explanation mastery entry rules
  explanation-mastery.ts  Offline key-point coverage for learner explanations
  diagrams.ts      Diagram cards, hotspots and the labelling round
  sharing.ts       Link encoding for deck sharing
  shuffle.ts       One deterministic shuffle, shared by every mode

src/content/     Authored revision content (cards from spec, question bank, misconception library)
src/data/        IndexedDB primary store, repository, outbox sync to Supabase
src/ai/          Provider abstraction, prompts, schemas, offline fallbacks
src/state/       One store; all derived numbers recomputed, never cached
src/components/  Le Studio UI primitives, question runner, answer input
src/app/         Next.js App Router pages (incl. /benchmarks, /answer-corpus live evidence ledger + /case-study)
supabase/        Postgres schema with row-level security
docs/            Architecture, revision engine, benchmarks
```

Three decisions shape everything else:

**The domain layer is pure.** No React, no fetch, no IndexedDB. That is why the
engine has real tests rather than snapshot tests, and why the same marking code
runs on the server and in the browser.

**IndexedDB is the source of truth, not a cache.** Writes land locally and are
durable before the UI updates; Supabase is a replica the outbox drains into.
Nothing in the UI ever awaits the network.

**AI is an enhancement, never a dependency.** Every AI task has a deterministic
offline fallback built from the authored curriculum: marking falls back to the
mark scheme, explanations to the spec content, generation to the question bank.
Responses are labelled with which one answered — the UI never implies a model
wrote something a rubric did.

## Content pipeline — the competitive moat

Every topic and exam question carries provenance so Revise can answer "how do
you know this is right?" without hand-waving. That is the moat: competitors
can generate plausible content, but proving coverage and verification is the
hard part and this repo enforces it.

| Field | Where | Values |
|-------|-------|--------|
| **Board / spec** | `Subject.spec` + `SPEC_MANIFEST` | `wjec` · `A200QS` · version `2024-1.0` · `lastChecked` |
| **Qualification** | `Subject.qualificationId` | `A Level` / `GCSE` / … |
| **Unit / paper** | `Unit.id` + `Subject.papers` + `SPEC_MANIFEST.paperBreakdown?` | weight, duration, calculator flag, marks |
| **Spec point** | `Topic.specPoints[]` (stable id) | board ref + learning claim + AO + source/verification/reviewer/lastChecked/specVersion |
| **AO mapping** | `Topic.aos` / `QuestionPart.aos` | `AO1` `AO2` `AO3` |
| **Source** | `Topic.source` / `Question.source` | `authored` / `licensed` / `generated` / … |
| **Verification** | `Topic.verification` / `Question.verification` / `SpecPoint.verification` | `unverified` → `checked` → `verified` (statement-level) |
| **Last checked** | `Topic.lastChecked` / `SpecPoint.lastChecked` / `Question.lastChecked` | ISO date |
| **Reviewer** | `Topic.reviewer` / `SpecPoint.reviewer` / `Question.reviewer` | identity of checker |
| **Spec version** | `Topic.specVersion` / `Question.specVersion` | `2024-1.0` |
| **Coverage** | `src/domain/coverage.ts` | topics · spec points · retrieval items · exam questions, auto-measured |

```ts
// Progress → Specification coverage (live, statement-level):
//  WJEC A-level Physics: 76 statements · 76 with cards · 9 parts mapped · Last checked: 2026-08-01
//  Chemistry: 76 statements  ·  Biology: 70  ·  Maths: 55 — each specPoint = one stable id + ref + AO + provenance.
```

`specPoints[]` is the competitive moat: each entry has a **stable id** (e.g.
`wjec-alevel-physics.quantum.sp-01`), an **exact spec ref** (`Unit 1.1(a)`),
a **learning claim** (paraphrased — never verbatim unless licensed), an **AO**,
a **source** / **verification** / **reviewer** / **lastChecked** / **specVersion**,
and measurable links from **cards** (`Card.specPointIds`) and **question parts**
(`QuestionPart.specPointIds` + `learningClaims` aligned to the mark scheme).
`src/domain/coverage.ts` reports it all: `specPointsTotal` /
`specPointsVerified` / `specPointsLearnable` / `specPointsAssessable` /
`statementCoverage` — statement by statement. `buildUnits()` auto-assigns stable
ids when omitted and threads per-statement provenance from the topic. Cards
auto-link to the nearest statement(s); all four subjects now have specPoints on
every topic (Physics 76, Chemistry 76, Biology 70, Maths 55) with `paperBreakdown`
for unit·duration·marks·weighting on every paper. Every seed question maps to
statements with `learningClaims` (1:1 with markScheme), including the new OCR
A-Level and extended-response question sets — the `no-spec-points`
gaps in Progress now only fire on regressions. Run `node scripts/validate-curriculum.mjs`
in CI — it now enforces that every subject has specPoints on every topic and that any `specPointIds` are paired with `learningClaims`. See
`src/content/questions/physics.ts` for the first mapped questions and
`tests/coverage.test.ts` for the statement-level contract (stable ids, AO,
verification, card/question mapping).

Questions also carry a separate validation lifecycle in
`src/domain/question-validation.ts`: `draft → in_review → validated`, with
`needs_changes` and `rejected` resubmission paths. Deterministic structural,
mapping and provenance checks gate submission; a later audit demotes a validated
question when specification drift or stale provenance appears, and validated
content can be explicitly retired. This quality gate is persisted on the
question itself and remains separate from generic moderation/publishing status.

## Misconception library

Alongside the question bank sits a hand-authored **misconception library**
(`src/content/misconceptions/`): each entry names a common wrong belief, why
it is wrong, the symptom an examiner sees every year, and what to write
instead — linked to the topics where it costs marks and tagged with the same
`MisconceptionTag` the analytics use. Entries are rendered in the Library
topic view, so a student reads the correct conception — not just that they
were wrong — before the mistake is made. Ids are deterministic
(`seed-misconception:<slug>`) so re-seeding is idempotent, and the lookups
(`misconceptionsForSubject` / `misconceptionsForTopic` / `misconceptionById`)
mirror the question bank's, so future remediation and tutor wiring can share
one source of truth.

## Adding a new exam board or subject

One file. Create `src/domain/curriculum/<board>-<subject>.ts`:

```ts
const { units, topics } = buildUnits(SUBJECT_ID, [
  { slug: "unit-1", title: "…", topics: [{ slug, title, difficulty, summary, keyPoints, commonErrors, aos: ["AO1", "AO2"], source: "authored", verification: "checked", lastChecked: "2026-08-01", specVersion: "2024-1.0" }] },
]);

export const mySubject = registerSubject({
  subject: { id: SUBJECT_ID, qualificationId: "…", name: "…", specCode: "…", spec: { version: "2024-1.0", releaseDate: "2024-09-01", lastChecked: "2026-08-01", url: "https://…" }, papers: [...], gradeBoundaries: [...] },
  units,
  topics,
});
```

Import it in `src/domain/curriculum/index.ts` and it is live: flashcards are
derived from the key points automatically, the planner and recommender pick it
up, mastery and grade prediction work, coverage appears on Progress, and it is
searchable. No other file changes. Add the subject to `src/domain/spec.ts:SPEC_MANIFEST` so the headline totals stay true.

## Docs

- [`docs/architecture.md`](docs/architecture.md) — data flow, sync, AI layer, quality gates
- [`docs/revision-engine.md`](docs/revision-engine.md) — the algorithms and the evidence behind them
- [`docs/benchmark.md`](docs/benchmark.md) — harnesses + the live ledger at [benchmarks](src/app/benchmarks) + [case study](src/app/case-study)
- [`docs/roadmap.md`](docs/roadmap.md) — competitor-gap backlog and the path to "what should I revise next?" intelligence

## Content accuracy — statement-level provenance

Every examinable statement is modelled explicitly: one `specPoint` per claim the
spec makes, with a stable id, an exact board ref (`Unit 1.1(a)`, `Pure 1.2(c)`),
a learning claim (paraphrased — never verbatim unless licensed), an AO, and a
provenance record (`source` / `verification` / `reviewer` / `lastChecked` /
`specVersion`). Coverage on Progress is measured **per statement**: how many have
retrieval cards, how many have an exam question (*which* parts test *which*
statements), which are verified, and — per `SPEC_MANIFEST` — which unit/paper
(duration, marks, weighting) each belongs to. The statement model now covers all **32 subjects (WJEC/AQA/Edexcel/OCR × A-level/GCSE): 440 topics,
374 seed questions**, every topic with `specPoints` and every seed question part
mapped with `specPointIds + learningClaims` aligned 1:1 with mark-scheme points.
Topic lists and grade boundaries remain approximate and labelled as such; always
check the current board specification for exact assessment objectives and
weightings.

## Specification Coverage Audit

The Progress screen also runs `specificationCoverageAudit()` over the authored
curriculum, seed cards and seed questions. It compares each subject's authored
`specPoint` inventory with `SPEC_MANIFEST.statementsTotal`, then checks stable
IDs and refs, provenance, spec versions, freshness, verification, card links,
question links and question-to-topic consistency. Missing cards or questions
are review findings; dangling references, duplicate IDs, invalid metadata and
cross-topic mappings fail the audit. This keeps intentional curriculum-first
subjects visible without treating them as broken.

The audit is pure and deterministic when `today` is supplied, so the same
report can be rendered in the browser and asserted in tests:

```ts
const audit = specificationCoverageAudit({
  subjects: allSubjects(),
  topics: allTopics(),
  questions: seedQuestions,
  cards: seedCards(allTopics(), "audit"),
  today: "2026-08-18",
});
```

## Worked Solution Validation

The Progress screen also runs `validateWorkedSolutions()` over authored model
answers. Each answer is checked against every mark-scheme point using the same
deterministic coverage and numerical-equivalence primitives as offline
marking. Missing answer keys and contradictory numerical results fail; points
that are not represented clearly are review warnings. The aggregate report
retains question and part IDs so findings can be traced back to the answer key
that needs editing.

## Evidence-Based Mark Explanations

Every marked part can now carry a deterministic `evidence` array. Each entry
states whether the point was awarded, missed or left unreported, gives a
strong/partial/none evidence strength, and quotes the shortest useful excerpt
from the submitted answer. The explanation uses the same keyword, numerical
and symbolic matching primitives as offline marking, so it never invents a
reason for a mark. AI marking results are enriched locally before they reach
the attempt record or the result screen; MCQs cite the selected option.

Recovery note: the deleted `apps/wjec-study-app` had **no** per-topic
validation, provenance or coverage tooling — only bare topic titles — so
nothing of competitive value was lost in that deletion. The previous repo's
only reusable asset was the FSRS + study-plan scheduling math, which Revise
already supersedes.
