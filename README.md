# Revise

A revision-first study platform. Revise decides the one most useful thing to do
next, makes it easy to start, and only claims an improvement when it has been
proven on questions the learner has not seen.

## Current evidence status

### Shipped

Local-first revision, adaptive ranking, FSRS, resumable Exam Missions, conservative
evidence states and the two-independent-reviewer content pipeline are implemented.
Internal operations now include cross-subject reviewer campaigns, deterministic
flagship readiness, blind human marking intake and learner-level pilot reports.
Implementation and synthetic tests demonstrate behaviour, not learner benefit.

### Blocked by external evidence

The flagship banks still require genuine qualified human reviews. Authored volume
does not establish trusted supply. Marking validation requires at least 250 genuine
anonymised independently double-marked student answers, then 1,000+. A consented
real learner cohort and configured staging verification are also required. Revise
does not yet have evidence for a product-wide claim that it improves learning.

### Current priorities

1. Obtain independent reviews from the highest-leverage campaign.
2. Reach a usable reviewed diagnostic and complete delayed-proof loop per flagship.
3. Collect and adjudicate the Phase 1 student-answer marking corpus.
4. Run a consented learner pilot through repair, proof and mature return windows.
5. Verify configured staging account isolation, continuity and failure recovery.

### Future

Broader subject coverage and non-critical enhancements remain secondary to these
evidence gaps. Historical implementation detail is preserved below; its shipped
mechanisms must not be read as external validation.

```bash
npm run wjec:campaign -- --limit=25
npm run wjec:campaign -- private-review-pack --limit=25 --minutes=240
npm run wjec:readiness
npm run product:quality
npm run product:quality -- --json --pilot=private-pilot.json --corpus=private-corpus.json
```

See [evidence operations](docs/evidence-operations.md) for the reviewer, pilot,
marking and release contracts. All large reporting logic stays CLI-only.

## The product loop

**Diagnose → Learn/Repair → Practise → Prove → Revisit.**

Today selects the best next step through that loop and shows one Start button:

| Stage | What happens | Where it lives |
|---|---|---|
| **Diagnose** | A new learner takes a short, skippable quick check of reviewed, unseen questions across several topics. Answers are normal attempts; lost marks appear immediately. | `quick-diagnostic.ts`, `cold-start.ts` |
| **Learn / Repair** | A lost mark becomes a repair mission: understand the cause, then re-sit with help. Help never counts as proof. | `exam-mission.ts`, `mission-session.ts` |
| **Practise** | Different questions on the same skill, then an unfamiliar context. | `mission-session.ts`, `learning-action.ts` |
| **Prove** | A delayed, unaided answer to a new, reviewed question. Reskins of an earlier question never count. | `mark-recovery.ts`, `supply.ts` |
| **Revisit** | FSRS keeps what is proven fresh; a later failure marks it Regressed and sends the learner back to repair. | `scheduling.ts`, `revision-engine.ts` |

Every topic reads as one of six states: **Not checked, Needs work, Improving,
Awaiting proof, Proven, Regressed**. Statistics, confidence intervals and trust
counts stay behind a "Why?" or "Evidence" disclosure; Revise only mentions trust
when it changes what it can claim ("You improved here, but Revise does not yet
have enough reviewed new questions to prove it.").

Manual modes (Review, Study, Lessons, Practice, Past papers, Session) stay in
Tools. The main navigation is **Today, Subjects, Progress, Tools**.

Ships with **32 subjects across WJEC / AQA / Edexcel / OCR × A-level / GCSE**.
Four WJEC A-level flagships — Mathematics, Biology, Chemistry, Physics — are
authored against the specification. The other 28 are **reference-tier**: a
cloned outline for navigation, labelled unverified, with GCSE paper structures
taken from the spec manifest rather than the A-level clone. Adding a board
still means one curriculum module and nothing else changing.

New students start on the four flagships. Settings and onboarding group subjects
as Flagship vs Reference so cloned boards cannot look spec-checked, and
reference-tier subjects sit behind an explicit **"Unverified preview"** choice in
onboarding rather than appearing in the list next to a disclaimer. Only WJEC
A-level Physics is fully authored (108 of 108 specification statements); Maths,
Biology and Chemistry still have 78, 102 and 95 statements to write.

**Nothing is trusted yet.** All four flagships have **0 human-reviewed
questions**, so Revise can practise with a student but cannot yet prove an
improvement. That is a content-supply state, not a product limitation, and the
app says so on screen instead of implying a plan exists.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # unit + domain suite (tests/) — see docs/benchmark.md for outcome benchmarks
npm run build        # production build
```

No environment variables are required for a local IndexedDB profile and the core
revision flow. Cross-device sync requires Supabase settings; provider-backed AI
marking requires AI provider settings. See [.env.example](.env.example) for
the optional Supabase and AI provider configuration.

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

The app is one loop — **Diagnose → Learn/Repair → Practise → Prove → Revisit** — chosen for you on Today. The first screen locks in the board, subject and exam date; every other destination is a manual way into the same loop.

| Area | Behaviour |
|------|-----------|
| **Onboarding** | First screen only: board → subjects → required exam dates. Nothing renders until it is complete. |
| **Topic status** | Every topic reads in plain language — covered, shaky, untouched — with a what-to-do-next sentence, never a raw score pretending to be a grade. |
| **Lessons** | Every authored topic follows a written, step-by-step lesson: clear objectives, process explanations, active recall, worked application, exam technique and check questions; a lesson streak rewards finishing. |
| **Spaced repetition** | FSRS scheduling with per-grade interval previews, confidence captured *before* reveal, failed cards reinserted within the same session, and real cloze cards built from a complete sentence + hidden answer. Today sizes one bounded review session (15–25 minutes) and stops — the loop, not a dashboard. |
| **Study modes** | The same card pool worked five ways — including Learn (recognition → typed production), Match (timed pairing), hands-free Listen and Diagram labelling. |
| **Exam questions after cards** | Right after each reviewed card, an official-style exam question on that same spec point appears when one exists — revision turns into exam practice in place. |
| **Exam practice** | Structured questions marked point-by-point against the mark scheme, with examiner-style feedback, model answers, safe draft-preserving navigation, contextual maths-symbol entry, five- to sixty-minute sprints built to a mark budget, a guided rewrite ("Improve my answer") and a weak-topic exam built from the last seven days of misses. |
| **Mistake tracking** | Every dropped mark becomes a classified mistake that is retested until it closes; unresolved recent mistakes surface for the student to fix. Marks at risk breaks the open losses down by topic, skill, error type, paper and recurring pattern, and one button builds a recovery set from them. |
| **Past papers** | Upload or photograph a paper and mark scheme, extract questions, map them to topics, practise them question-by-question or sit them in full exam conditions with a fixed clock, no in-paper aids, auto-submit and marking after the paper, then close with full-denominator scoring, a paper autopsy (where the marks went, a repair plan and an equivalent retest) and a repair route. |
| **Marks value and proof** | Today ranks revision by how much of the exam a topic carries and how well it is proven on questions you have not seen, explains the choice from that same evidence, and Readiness shows which gains are proven on new questions, answered unaided, days later. Repeats of a question count for little, and topics that only look learned on familiar questions are flagged. |
| **Honest pace forecast** | At this pace, N topics stay untouched before the exam date — a real projection from the last seven days of reviews, never a fake pass percentage. |
| **Prediction reality check** | Weekly grade forecasts are frozen before the outcome, then dated mocks, timed papers and final results are joined only to forecasts that already existed. Readiness shows error, bias and interval coverage instead of letting later predictions rewrite history. |
| **Keyboard** | Shortcuts throughout, with a `?` sheet generated from the live bindings. |
| **Offline** | IndexedDB-first with a durable outbox; installable PWA; the complete written lesson, recall and practice loop works without a connection. |

## Trusted content: the real bottleneck

Revise can only prove an improvement on questions a qualified person has
reviewed. The four WJEC A-level flagships (Mathematics, Biology, Chemistry,
Physics) have large authored banks but **no human-reviewed questions yet**, so
proof, the cold-start diagnostic and Exam Mission proof are blocked there until
review happens. The repository therefore ships a review workflow rather than
pretending the review has been done.

**Teachers review in the browser** at `/reviewer` (the `(reviewer)` route
group): a server-rendered queue, one dense screen per question (stem, mark
scheme, specification points, provenance) and keyboard decisions (`A` approve,
`R` request changes). Decisions extend the same hash-chained audit log, and a
question becomes trusted for students once two different reviewers approve the
same content. Access is granted by the maintainer; see
[`docs/review-workflow.md`](docs/review-workflow.md) for the design, how to
grant a teacher, and the developer-only CLI (`npm run wjec:review:priorities`,
`npm run wjec:review:pull`, `npm run wjec:review:promote`,
`npm run wjec:review:gates`). Nothing in the tooling approves a question;
approvals come only from named reviewers.

## Depth first: flagship subject combinations

Breadth is paused. Four WJEC A-level flagships - Mathematics, Biology,
Chemistry, Physics - are being built to per-statement depth: for every
specification point, retrieval cards plus simple, application,
unfamiliar-context, misconception and harder/synoptic questions, each with
a worked solution and verified provenance. The headline the depth ledger
makes computable is not "475 topics" but:

> N% of WJEC A-level Physics specification statements have at least four
> independently reviewed exam questions covering recall, application and
> transfer.

Everything outside the flagships remains reference-tier: usable, searchable,
and honestly labelled, but not where authoring effort goes.

## Architecture

```
src/domain/      Pure revision engine — no React, no I/O, fully unit-tested
  types.ts         The board-agnostic domain model
  curriculum/      Registry + 32 WJEC/AQA/Edexcel/OCR × A-level/GCSE subjects (475 topics)
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
src/app/         Next.js App Router pages — the loop: today, review, study, lessons, practice, past papers, library
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
statements with `learningClaims` (one claim may earn several marks; per-mark
allocation is explicit via `claimMap`), including the new OCR
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
- [`docs/benchmark.md`](docs/benchmark.md) — harnesses and outcome benchmarks
- [`docs/roadmap.md`](docs/roadmap.md) — priorities (trusted content first) and the longer backlog
- [`docs/review-workflow.md`](docs/review-workflow.md) — unverified → checked → verified, review queues, prioritisation and audit log
- [`docs/question-supply-audit.md`](docs/question-supply-audit.md) — what counts as trusted, distinct supply per topic
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to author, review and verify changes
- [`docs/error-diagnosis.md`](docs/error-diagnosis.md) — post-marking error diagnosis (classifier.dev): versioned taxonomy, interventions, routing and evaluation

## Content accuracy — statement-level provenance

Every examinable statement is modelled explicitly: one `specPoint` per claim the
spec makes, with a stable id, an exact board ref (`Unit 1.1(a)`, `Pure 1.2(c)`),
a learning claim (paraphrased — never verbatim unless licensed), an AO, and a
provenance record (`source` / `verification` / `reviewer` / `lastChecked` /
`specVersion`). Coverage on Progress is measured **per statement**: how many have
retrieval cards, how many have an exam question (*which* parts test *which*
statements), which are verified, and — per `SPEC_MANIFEST` — which unit/paper
(duration, marks, weighting) each belongs to. The statement model now covers all
**32 subjects (WJEC/AQA/Edexcel/OCR × A-level/GCSE)**.

Runtime inventory: **475 topics, 3923 materialised seed questions, 2238 WJEC flagship questions**.
The static source audit currently sees 869 authoring/catalogue records before
runtime expansion; CI treats the materialised bank above as the authoritative
question inventory. Every topic carries `specPoints` and every seed question part
mapped with `specPointIds + learningClaims` (explicit per-mark allocation via
`claimMap` where needed).
Topic lists and grade boundaries remain approximate and labelled as such; always
check the current board specification for exact assessment objectives and
weightings.

WJEC flagship human review is deliberately separate from authored volume.
`npm run wjec:review:batch -- <subject> <new-directory> --limit=10` exports a
small prioritized reviewer packet. Exact approvals use canonical SHA-256
fingerprints and persist to a separate attestation ledger; the source-controlled
release set identifies candidate assessment content but does not itself confer
trust. `npm run wjec:trust:report` shows trusted depth, release depth, stale
attestations and remaining statement-level review workload.

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

## WJEC part-level trust update (2026-09-26)

WJEC flagship trust and authored depth are credited per mapped question part rather than by assigning one depth label to an entire structured question. A question can therefore contribute recall, application and transfer evidence through different parts, but still counts as only one independent question toward the four-question threshold for a specification statement.

Human review attestations require a full timezone-bearing ISO instant and reject date-only, impossible-calendar and materially future-dated review times. The same strict contract is used by question review, WJEC paper provenance, paper marking/outcomes and prerequisite decisions. Verified WJEC paper provenance must use an official HTTPS WJEC origin and a SHA-256 source digest. WJEC paper marking/outcomes and prerequisite edges require exact canonical SHA-256 fingerprints; legacy 32-bit fingerprints are historical only and do not confer current trust. The exact authored-content ceiling is tracked in `src/content/reviews/wjec-authoring-backlog.json`; `npm run wjec:authoring:gaps` reports the gaps, `npm run wjec:authoring:plan -- <subject> --limit=12` turns them into prioritized new-family authoring briefs, and `npm run wjec:authoring:check` verifies that the source-controlled backlog matches the live bank.

Prerequisite edges remain hypotheses until separately reviewed. `npm run wjec:prerequisite:batch -- <subject> <new-directory> --limit=20` exports a focused packet; `npm run wjec:prerequisite:apply -- <returned-directory> --dry-run` validates qualified approved/rejected decisions before the same command without `--dry-run` atomically records them in the source-controlled prerequisite ledger. No command creates an approval automatically.

Focused review batches emit `release-set-proposal.json`. `npm run wjec:release:check -- <proposal>` validates a proposal without writing; `npm run wjec:release:apply -- <proposal>` atomically updates only the editorial release-candidate manifest. Proposals must carry the generated `resultingQuestionIds` snapshot so stale proposals fail closed. Release selection never creates or changes human approvals.

### Account profiles and simpler navigation

The account boundary mounts the store with the authenticated Supabase UUID,
using a separate IndexedDB database for each account. Signed-out revision keeps
its original local-only database. The first account visit offers an explicit
local-data copy or a separate profile; it never automatically merges accounts.
Sign-out preserves account progress and offline queues for the next sign-in.
See `docs/architecture.md` for adoption, ownership and cross-device continuity
semantics, and `docs/operations-runbook.md` for the seven required staging secrets.

Today and Session form the mobile primary loop. The Tools menu retains every
manual study route and management surface, with direct desktop links and search.
Structured JSON sources cover 92 Physics depth-50 mechanics questions and 540
reasoning-depth questions (55 source groups). Regenerate with `npm run
content:physics` and `npm run content:reasoning`; `npm run content:check` validates
sources, mappings and deterministic adapters without manufacturing human trust.

Grade forecasts, actual results, paper outcomes and intervention evidence now
sync as owner-scoped row records. Terminal tombstones protect deleted study rows
against offline replay, including legacy clients. Apply the additive continuity
migration in `supabase/schema.sql` before rollout; an older schema leaves queues
intact and sync failed. Experiments and active session checkpoints stay local.

See [the current architecture and continuity pass](docs/improvement-continuity-2026-09-30.md) for
the implementation decisions, regression coverage, verification and rollout limits.

The [October reliability follow-up](docs/reliability-fixes-2026-10-01.md) fixes
private-question ownership and restore replication, cross-account UUID copies,
grading-retry identity and refreshes after partially failed continuity pulls.
