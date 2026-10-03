# Revise — Roadmap

> Compared with Save My Exams, Seneca, Quizlet and Anki, Revise's adaptive
> engine is strong, but the established competitors have much greater content
> volume, editorial trust and user scale.

**Goal: make the strongest adaptive features work end to end on trusted content
for the four WJEC flagships, then beat competitors with "what should I revise
next?" intelligence.**

The backlog below is grouped by theme. Items marked *(extend)* already have a
working baseline in the engine and need depth rather than a new subsystem. The
order within each group is not priority order; use "Priorities now" above.

## Priorities now

The engine is ahead of its content. The bottleneck is trusted question supply
and learner simplicity, not another mode, score or recommender. In order:

1. **Trusted flagship content.** Move authored WJEC Maths, Biology, Chemistry
   and Physics questions through unverified → checked → verified
   ([`docs/review-workflow.md`](docs/review-workflow.md)), in the order
   `npm run wjec:review:priorities` gives. Today no flagship question is
   trusted, so proof is blocked everywhere in the flagships.
2. **Question diversity and transfer supply.** At least 2 genuinely distinct
   trusted questions and 1 trusted transfer question per topic, plus
   data/practical questions where a topic needs them. Where the priorities
   report says "needs new or revised", author or repair rather than review.
3. **Trusted cold-start diagnostic.** Five topics per flagship with a trusted,
   short question unlock the 5–10 minute quick check (`cold-start-diagnostic`
   in the priorities report). The loop is built; it needs reviewed supply.
4. **Real learner validation.** Use the core-value outcomes in
   `src/domain/product-outcomes.ts` (diagnostic completion, recommendation
   start, recovered marks, delayed-proof completion, time from first loss to
   proof, proof blocked by supply) with real learners before tuning the engine.
5. **Mobile learner-flow simplification.** Today → Start → Answer → Feedback →
   Continue; keep removing duplicated recommendations, scores and engine
   vocabulary from the first viewport.
6. **Marking accuracy validation.** Double-marked corpora and human marking
   agreement before trusting automated marks further.
7. **Content breadth.** More subjects and boards, only after the flagships can
   prove improvement.

Everything below this section is the longer backlog and is **not** in priority
order; speculative feature expansion sits below the seven items above.

## Baseline already shipped

These exist today and are the foundation the roadmap builds on:

| Capability | Where |
|------------|-------|
| FSRS scheduling with per-grade previews | `src/domain/scheduling.ts`, `fsrs-tuning.ts` |
| Recommendation ("what next") across five bounded factors | `src/domain/recommender.ts` |
| Adaptive timetable + missed-session recovery | `src/domain/planner.ts` |
| Offline rubric marking vs mark schemes | `src/domain/marking.ts` |
| Grade prediction with confidence bands + calibration | `src/domain/grades.ts` |
| Knowledge tracing | `src/domain/knowledge-tracing.ts` |
| Past-paper upload → extract → map → timed sit | architecture + AI layer |
| Deck import (Revise JSON, Anki/Quizlet CSV/TSV) | `src/domain/deck-io.ts` |
| OCR of handwritten working | answer input + AI layer |
| IndexedDB-first offline + durable outbox, installable PWA | `src/data/`, `public/sw.js` |
| Marks at risk, recovery sets, paper autopsy, equivalent retests, guided answer rewrites, 5–60 minute sprints, specification evidence | `docs/marks-recovery-2026-10-01.md` |

## 1. Content volume & coverage

- Thousands more exam-quality questions.
- Multiple questions per specification statement (one per `specPoint` is the
  floor; several, of varied difficulty, is the target).
- Full past-paper library where licensing permits.
- Real exam diagrams.
- Graph/data interpretation questions.
- Calculation questions with working.
- More GCSE subjects.
- More A-level subjects.

## 2. Past papers

- Past-paper importing *(extend — upload + extraction exists; semantic topic
  mapping is the gap)*.
- Automatic paper segmentation (questions, sub-parts, figures, mark-scheme
  alignment).

## 3. Marking & feedback

- Multi-step marking (partial credit across a chain of working, not just
  per-point rubrics).
- Examiner-reviewed model answers.
- Examiner-reviewed mark schemes.
- Human-labelled marking benchmark (the AI-vs-human rubric floor already in
  `docs/benchmark.md`, grown into a labelled set).
- Teacher-marking comparison (measure the marker against a human teacher, not
  only against the rubric).
- Explanation library for common misconceptions *(shipped — `src/content/misconceptions/`)*.
- Rich written explanations with diagrams, process steps and active-recall checks *(shipped — roadmap lessons)*.

## 4. Input & accessibility

- Handwriting input *(extend — OCR exists; make it first-class for working-out)*.
- Better OCR (maths notation, poor photos, small handwriting).
- Mathematical expression input *(extend — contextual caret-aware maths palette now covers operators, powers, roots, fractions, Greek symbols, inequalities and scientific notation; richer 2D typesetting remains).*
- Better equation equivalence *(extend — deterministic single-variable polynomial equivalence is shipped, including factored/expanded forms, rational coefficients and unicode ×/÷/powers; extend to roots, trig and multivariable expressions).*

## 5. Languages & subjects

- Full English/humanities support (essay subjects, long-form marking, source
  work — not only STEM short-answer).
- More languages.

## 6. Curriculum lifecycle

- Specification-update monitoring (flag when a board releases a new spec so
  `specVersion` / `lastChecked` can be updated before a student is taught from
  stale content).
- Curriculum-version migration (move a student's cards/progress across spec
  versions without losing state).

## 7. Teachers & classroom

- Teacher assignment mode.
- Classroom dashboards.
- Teacher question creation.
- Teacher content review.
- School accounts (eventually).

## 8. Collaboration

- Better collaborative study where useful (shared decks/topics without giving up
  the offline-first, per-student data model).

## 9. Onboarding, flashcards & notes

- Faster onboarding *(extend — four-question funnel exists; keep cutting steps)*.
- Import existing Anki/Quizlet-style decks *(extend — CSV/TSV exists; add the
  richer card types below)*.
- Better flashcard creation.
- Image occlusion.
- Cloze cards *(shipped — complete-sentence authoring, deterministic blank generation, legacy reconstruction, review reveal and deck round-trip validation).*
- More flexible notes.

## 10. Planning & prediction

- Real exam countdown planning *(extend — planner exists; add a live countdown
  that drives daily priority)*.
- Automatic revision-plan rebuilding (re-plan when a session is missed, a grade
  target changes, or an exam date moves) *(shipped — `src/domain/replan.ts`)*.
- Better predicted grades.
- Confidence ranges around predicted grades *(extend — bands exist; tighten them
  as data grows)*.
- Actual grade-vs-prediction tracking *(shipped — weekly forecast snapshots, dated mock/paper/final outcomes, strict as-of pairing, MAE/bias/interval coverage and per-subject history on Readiness).*

## 11. Personalisation

- Better question difficulty calibration.
- Cohort-derived difficulty after sufficient data (start authored, converge on
  real response data once cohorts are large enough).
- More personalised FSRS *(extend — per-user parameter tuning)*.
- Better knowledge tracing.
- Recommendation A/B testing.
- Marks-per-hour optimisation validated on users (currently optimised by design;
  prove it with real usage data).

## 12. Mobile, offline & platform

- Proper native-quality mobile/PWA UX.
- Notifications.
- Sync grade-prediction calibration history across devices *(shipped — forecast, actual, paper and intervention row histories sync; derived calibration is recomputed locally).*
- Full portable-snapshot restore *(shipped — v2 exports preserve stable card ids, validate linked history before mutation, restore one profile transactionally, keep current shipped curriculum authoritative, and refuse unsafe full-history restore from legacy v1 archives).*
- Reliable offline exam packs.

## 13. Evidence & efficacy

- Real student efficacy studies (the benchmark ledger is synthetic-first — the
  endgame is cohorts and outcome data).

## North star

Content is table stakes: reviewers and parents trust Save My Exams and Seneca
because the content is complete and verified. Revise's moat is the question
*after* coverage — the single highest-value thing to do next, scored honestly
and proven against real outcomes. Every item above either removes a content gap
competitors already close, or strengthens the recommendation engine they don't
have.

## Account correctness and maintainability pass — 30 September 2026

Implemented canonical local/authenticated profile resolution, per-account
IndexedDB isolation, explicit one-account local adoption, document-bound account
switching and ownership-safe queue preservation. Sync now encodes non-UUID
curriculum ids into stable per-account UUID wire keys while preserving exact
payload ids, and uses valid first-pull/singleton keysets. All UI consumers select
store fields through a stable subscription channel. Mobile prioritizes Today
and Session, keeping manual and management routes in Tools.

Structured-source migration covers 92 Physics questions in seven groups, with
pre-migration fingerprints pinned and deterministic validation enforced in CI.
Staging now has mandatory catalog checks and live all-table RLS, conflict,
timestamp and independent-device sync tests. Local unit tests do not establish
live staging success; run the required credentialed workflow before rollout.

The continuation pass adds 540 reasoning-depth questions in 48 structured groups,
generic capability registration, separate selection/sequence/replanning,
execution/presentation boundaries, narrower derived models and runtime cycle
regressions. Forecast/actual/paper/intervention row continuity and permanent
legacy-compatible deletion markers are implemented with an additive SQL migration.
The staging workflow is reusable and the pre-release workflow requires local
verification, Chromium and credentialed staging at the same candidate ref.

Remaining: further bounded bank migrations; finer recommendation inputs;
a real configured Supabase browser journey; an encrypted local vault; and
credentialed concurrent staging validation of the continuity rollout. Experiments
and execution checkpoints deliberately stay device-local. Human verification,
real learner outcomes and efficacy validation remain external evidence needs.
