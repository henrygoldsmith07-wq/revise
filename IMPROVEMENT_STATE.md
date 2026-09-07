# Improvement state: one adaptive learning session

## Goal and observable outcome

Today should choose one best, bounded learning sequence for the next 20 minutes. The choice must be a single optimisation across FSRS pressure, topic mastery, open mistakes, exam proximity, evidence uncertainty, and capability gaps. The home screen should lead with one calm action: “Best use of the next 20 minutes”, a subject/topic, and “Start”. Starting the sequence must preserve progress and end with a delayed-retrieval action.

Success signals:

- every enrolled topic is scored by the same deterministic optimiser;
- the selected plan is always at most 20 minutes (and normally exactly 20);
- evidence-rich weak topics produce retrieval → misconception repair → explanation → supported practice → independent application → transfer → delayed retrieval when the data supports each block;
- an interrupted adaptive plan can be resumed from its saved step;
- the adaptive domain builder has pure tests for ranking, step order, budget, and sparse/empty evidence;
- existing review, practice, roadmap, and persistence tests remain green.

## Baseline evidence

- `src/app/page.tsx` currently branches on `dueCards.length`: due cards render `TodayReviewSession`, while no-due states render `NextBestAction` from `recommendations[0]`.
- `src/domain/recommender.ts` already computes useful factor evidence, but emits separate activity recommendations (flashcards, mistakes, practice, learn, paper).
- `src/domain/orchestrator.ts` already contains a capability-aware tutor loop, but it is not used by Today and does not select a topic against FSRS/mistakes/exam evidence.
- `src/components/DailySessionCard.tsx` and `src/domain/daily-session.ts` expose multiple links/phases rather than one adaptive entry point.
- Review and practice routes already persist FSRS grades, attempts, mistakes, and checkpoints; those contracts can be reused rather than duplicating storage.

## Diagnosis

The product has the evidence and learning primitives, but the home decision is made before the evidence is combined: a due-card branch short-circuits mastery/mistake/exam trade-offs, and the recommender's activity rows are not assembled into a single tutor sequence. The missing layer is a pure topic optimiser plus a resumable sequence runner.

## Opportunity set and ranking

1. **Unified topic scoring** — highest leverage; combine FSRS, mastery, mistakes, exam proximity, forgetting, uncertainty, and capability gap into one auditable score.
2. **Adaptive sequence builder** — turn the winning topic's evidence into a 20-minute progression with support fading and delayed retrieval.
3. **Single Today hero** — remove the due/no-due fork from the student-facing decision and show one Start action.
4. **Resumable adaptive route** — let the student move through the sequence without losing the current step.
5. **Real activity destinations** — route retrieval, lesson, and question blocks to existing tested flows.
6. **Delayed retrieval scheduling** — use the existing bury/sync path for a durable next-day retrieval marker.
7. **Active-recall explanation block** — keep explanation written and gated by a before-reading recall prompt; no video dependency.
8. **Question selection by evidence** — choose supported, independent, and transfer questions using difficulty, exposure, and topic links.
9. **Explainable plan metadata** — preserve factor values and plain-language reasons for diagnostics and future analytics.
10. **Adaptive checkpoint compatibility** — extend the existing local-route validator and resume card without breaking old checkpoints.
11. **Focused tests and browser smoke coverage** — pin ranking/order/budget and verify Today → Start → adaptive route.
12. **Keep secondary roadmap/forecast lazy and below the hero** — protect the existing home performance and navigation context.

## Decisions

- The adaptive builder is pure and deterministic; no model/network call is needed to choose the next session.
- The plan defaults to 20 minutes, with a bounded 12–25 minute input for direct domain callers/tests.
- Due cards are evidence, not a separate queue: they raise a topic's FSRS factor and become the first step when present.
- Unknown capability evidence triggers diagnosis/explanation before transfer; transfer is included only when a distinct question exists.
- The runner deep-links into the existing review/practice/lesson surfaces and keeps its own step checkpoint; this avoids cloning marking and FSRS logic.

## Status

- [x] baseline mapped and workflow selected
- [x] implement unified adaptive domain builder
- [x] expose the plan through the store and Today hero
- [x] add resumable adaptive route and delayed scheduling
- [x] add focused tests and run verification

## Verification log

2026-09-05: `npm run verify` passed: lint, regular and strict TypeScript, curriculum validation/freshness (32 specs, 0 stale), 166 test files / 1,342 passing tests (2 staging tests skipped), production build, and client performance budget. Focused adaptive/checkpoint/today tests also passed (19 tests), and the service-worker shell now includes `/adaptive-session`.

2026-09-05: Browser smoke passed on the local dev server: onboarding → Today rendered the single “Best use of the next 20 minutes” hero; Start opened the adaptive runner; Pause returned a resumable adaptive checkpoint; Resume restored the same step; explanation enforced before-reading active recall; no Next.js overlay or browser error was observed. `npx playwright test e2e/adaptive-session.spec.ts --reporter=list` also passed (1/1).

2026-09-05: Final adjustment passed regular TypeScript, lint, five adaptive focused tests (including cross-factor ranking), production build, and client performance budget.

## Open questions / next actions

- Whether the next iteration should embed the question/lesson blocks in one route instead of returning to the existing activity surfaces.
- After implementation, inspect the rendered Today hero and confirm the roadmap remains secondary rather than competing with Start.

## Improvement state: high-quality guided lessons

### Goal and observable outcome

Every guided lesson should take a learner from a clear target to usable exam
performance, not just recognition of a definition. A complete lesson should
make the success criteria visible, explain the authored idea in order, require
active recall, provide an answer-hidden application, teach the relevant exam
move, and end with feedback that can be acted on.

### Baseline evidence

- 440 authored topics produced 440 lessons, averaging 8.2 steps (`npm test -- --run tests/lesson-coverage.test.ts`).
- Core steps had ordered explanations and checks, but the generated lesson
  contract had no explicit learning objectives, no application/model-answer
  block, and no exam-command guidance.
- Roadmap checkpoint explanations joined spec points to key points by array
  index, which could silently attach an unrelated supporting fact when the two
  authored lists differed in granularity.

### Diagnosis

The content source is strong enough to teach from, but the delivery layer
stopped at explanation plus recognition. The main quality risks were unclear
success criteria, passive transfer from explanation to exam answer, and an
unsafe positional link between specification requirements and supporting facts.

### Decisions

- Add optional lesson metadata so older persisted or test-created lesson
  objects remain compatible.
- Derive objectives, applications, model answers and checklists only from the
  existing authored topic/spec text; do not invent unsupported facts or add a
  network dependency.
- Keep application answers hidden until the learner chooses to reveal them,
  after the active-recall gate.
- Match supporting key points by meaningful vocabulary with a confidence
  threshold; when evidence is weak, teach the checkpoint itself rather than
  presenting a false connection.
- Keep the client lightweight: no question-bank import or media player is added
  to the lesson route. Lessons are written, interactive and available offline.

### Status

- [x] add explicit objectives and bounded lesson estimates
- [x] add step-level objectives and command-word exam guidance
- [x] add answer-hidden application, model response and self-marking checklist
- [x] prevent unsafe positional spec-point/key-point joins
- [x] add curriculum-wide regression coverage for the new lesson contract
- [x] run full lint, type, test, build and browser verification

### Verification log

2026-09-06: `npm run verify` passed — lint, regular and strict TypeScript,
curriculum validation/freshness (32 specs, 0 stale), 166 test files / 1,346
passing tests (2 staging tests skipped), production build, and client
performance budget. The focused lesson contract suite passed (18 tests).

2026-09-06: `npx playwright test e2e/learning-roadmap.spec.ts --reporter=list`
passed (1/1). Browser coverage included onboarding, roadmap outline, active
recall gating, step advance, application prompt, model-answer reveal and
self-marking checklist.

2026-09-06: After the final checkpoint-answer refinement, focused lesson tests
(14 tests), strict TypeScript, lint, production build and `npm run perf:budget`
passed again. The final build reports 569,219 raw / 171,515 gzip bytes for the
initial route assets and remains within the configured budget.

### Delegation ledger

- No subagents used; edits and verification were performed serially because the
  shared lesson generator and component are tightly coupled.

## Improvement state: complete written curriculum lessons

### Goal and observable outcome

Every authored topic must appear in the learning roadmap as a real written
lesson. The lesson should teach the source material in order, require retrieval
and application, and never depend on a video player or a separate media cache.

### Baseline evidence

- The roadmap already generated a lesson for the current 440-topic curriculum,
  but `buildLesson` returned `null` whenever a future topic had no `keyPoints`.
- The lesson hub still mounted a commute pack, a video player and a video AI
  task/cache alongside the written lesson.
- Completion could be granted by a `video:<topicId>` key, which made progress
  diverge from the written checkpoint path.

### Decisions

- Use dedicated key points first, specification statements second, and a topic
  summary as a final authored fallback so no populated topic disappears.
- Keep the full written sequence as the only lesson experience: objectives,
  explanation, active recall, application, exam technique and checks.
- Remove the video player, commute pack, storyboard cache, video AI task and
  stale completion path rather than leaving an unreachable feature contract.
- Make curriculum tests assert one lesson per current topic and one roadmap
  entry per topic when no specification sub-points exist.

### Status

- [x] add durable authored-source fallbacks for specification-only topics
- [x] require every current topic to produce a lesson in regression tests
- [x] remove video UI, cache, offline pack and AI contracts
- [x] update roadmap, Today and study-plan copy to describe written learning
- [x] run final lint, type, test, build and browser verification

### Verification log

2026-09-06: `npm run verify` passed — lint, regular and strict TypeScript,
curriculum validation/freshness (32 specs, 0 stale), 164 test files / 1,323
passing tests (2 staging tests skipped), production build and client performance
budget. Focused lesson coverage/roadmap/teaching tests passed (18 tests),
including a specification-only topic fallback.

2026-09-06: `npx playwright test e2e/learning-roadmap.spec.ts --reporter=list`
passed (1/1). Browser coverage included the written roadmap, active recall,
application/model-answer reveal and an assertion that the lesson hub exposes no
video or commute-pack UI. The final lesson generator build and performance
budget were rerun after adding the specification-only fallback assertion.

## Improvement state: WJEC A-level flagship expansion

### Goal and observable outcome

Biology, Chemistry, Physics and Mathematics should expose the full high-value
WJEC A-level scope as written lessons, not only as broad topic labels. Each
new area needs authored key ideas, common traps, specification-linked
statements, active-recall checks and an exam-style application.

### Baseline evidence

- Before this pass the flagship packs contained 15 Maths topics, 14 Biology
  topics, 15 Chemistry topics and 11 Physics topics.
- The largest omissions were Biology reproduction/microbiology/options,
  Chemistry thermodynamics/p-block/proteins/practical analysis, Physics
  capacitance/options/practical analysis, and Maths Poisson/inference/model
  selection detail.
- The existing lesson generator could already turn authored `keyPoints`,
  `commonErrors` and `specPoints` into written lessons and cards; the missing
  work was curriculum scope and linked exam practice.

### Decisions

- Keep the existing core curriculum modules stable and append reviewed WJEC
  extension units with deterministic topic/order IDs.
- Author the extension in `src/domain/curriculum/wjec-alevel-expansions.ts`
  with a shared provenance tag (`authored/WJEC-2024-v1-expansion`) so every
  claim inherits the same checked metadata and spec version.
- Add one structured four-part exam question per new topic in
  `src/content/questions/wjec-alevel-expansion.ts`; each part maps directly to
  one new `specPoint` and carries a learning claim.
- Keep lessons written and active-recall driven. No videos or heavyweight
  media are reintroduced.

### Delivered scope

- Biology: 23 topics total, including nutrition, microbiology, nervous
  coordination, human and plant reproduction, genetic technologies, immunity,
  musculoskeletal anatomy, and neurobiology/behaviour.
- Chemistry: 21 topics total, including entropy/feasibility, p-block trends,
  stereoisomerism, amino acids/proteins, organic synthesis and practical
  analysis.
- Physics: 17 topics total, including capacitance, alternating currents,
  medical physics, sports physics, energy/environment and practical
  investigations.
- Mathematics: 21 topics total, including Poisson/discrete uniform models,
  inference errors, continuous distributions, correlation/Normal-mean tests,
  modelling assumptions and moments/statics.
- The expansion adds 27 topics, 108 specification-linked statements, 27
  structured questions and a corresponding set of authored retrieval cards
  and written lesson checkpoints.

### Status

- [x] add missing WJEC scope as authored topic specs
- [x] link every new statement to an exam-style question part
- [x] verify each new topic builds a written lesson with ordered explanations,
  active recall and answer-hidden application
- [x] add regression tests for topic counts, provenance, statement coverage
  and lesson readiness
- [x] complete the full repository verification/build pass after the content
  expansion

### Verification log

2026-09-06: Focused WJEC expansion, coverage, content-schema and lesson suites
passed: 7 files, 70 tests. TypeScript and lint also passed. The audit now
reports 21 Maths topics/79 statements, 23 Biology topics/106 statements, 21
Chemistry topics/100 statements and 17 Physics topics/100 statements; Physics
zero-question statements remained at the pre-pack ceiling of 26 because every
new Physics statement is mapped to a new question part.

2026-09-06: `npm run verify` passed: lint, regular and strict TypeScript,
curriculum validation/freshness, 165 test files passed (1 skipped), 1,327
tests passed (2 skipped), production build and client performance-budget
checks.

## Improvement state: WJEC second-pass explicit coverage

### Goal and diagnosis

The first WJEC expansion added breadth, but several high-value requirements
were still only implied inside broad lessons. This pass makes the practical,
mechanistic and modelling-heavy areas explicit so students can learn and test
them as standalone lessons.

### Delivered scope

- Biology: human impact/conservation and biological practical skills.
- Chemistry: organic mechanisms and electrochemical cells.
- Physics: orbits/wider-universe evidence and electromagnetic induction.
- Mathematics: conditional probability and differential equations in context.
- Added 8 authored topics, 32 specification-linked statements and 8
  structured four-part exam questions. The curriculum now generates 475
  lessons, with data/source/transfer coverage extended to every topic.

### Status

- [x] add explicit second-pass topics with checked provenance
- [x] link every new statement to an exam question part and coverage-family
  questions
- [x] verify lesson generation, active recall and answer-hidden applications
- [x] complete the full repository verification/build pass after this pass

### Verification log

2026-09-06: TypeScript passed; focused WJEC, coverage-family, schema and
lesson suites passed: 7 files, 27 tests. Curriculum validation passed with
475 total topics and freshness passed for 32 specs with 0 stale records.

2026-09-06: `npm run verify` passed: lint, regular and strict TypeScript,
curriculum validation/freshness, 165 test files passed (1 skipped), 1,327
tests passed (2 skipped), production build and client performance-budget
checks.

## Improvement state: adaptive-tutor evidence hardening + mobile nav

### Goal and observable outcome

Wire the existing adaptive-tutor domain primitives into the live
review/practice surfaces so every answer replans honestly: hints cost
evidence (independent 1 / assisted 0.5 / viewed 0.15), repair never
closes on view, and the adaptive ladder's evidence rungs run unaided.
Separately, keep all six primary mobile nav items on one row.

### Decisions

- `Attempt.hintTier` (optional `"cue" | "prompt" | "scaffold" |
  "worked-solution"`) carries the highest hint tier used before submit.
  `QuestionRunner` enforces it per rung via `hintBudget` (default: full
  ladder; independent/transfer rungs pass 0).
- `computeApplicationMastery` multiplies awarded marks by
  `hintEvidenceMultiplier(attempt.hintTier ?? null)`; denominators stay
  whole so hint-gaming cannot inflate mastery.
- Hint-tier types/weights live in `src/domain/hint-tiers.ts` (no imports)
  so strict-checked modules need not transitively import
  `capability-mastery.ts`, whose indexed-access paths already fail
  `noUncheckedIndexedAccess` (pre-existing, out of scope). The weights
  mirror `EVIDENCE_WEIGHT` 1:1; parity is pinned by
  `tests/adaptive-tutor.test.ts`.
- `review/page.tsx` renders `buildRepairPlan` + `repairProgress` state
  alongside (not instead of) `classifyMistake`; the never-closes-on-view
  gate is unchanged.
- Mobile nav: `AppShell.tsx` `grid-cols-5` → `grid-cols-6` for the six
  primary items; pinned by a source-contract test and an e2e single-row
  bounding-box assertion.

### Status

- [x] hint ladder UI + `hintTier` on submitted attempts
- [x] hint-weighted application mastery + new test
- [x] adaptive-step hint budgets (`?adaptiveStep=` → `hintBudget`)
- [x] repair-plan/progress rendered on the review mistakes surface
- [x] mobile nav one-row fix + unit + e2e regression tests

### Verification log

2026-09-07: `npm run verify` passed: lint, regular and strict
TypeScript, curriculum validation/freshness, full vitest suite,
production build, and client performance-budget checks.
