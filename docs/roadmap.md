# Revise — Roadmap

> Compared with Save My Exams, Seneca, Quizlet and Anki, Revise's adaptive
> engine is strong, but the established competitors have much greater content
> volume, editorial trust and user scale.

**Goal: match competitors on content quality, then beat them with
"what should I revise next?" intelligence.**

This is a living backlog of the gaps that matter most, grouped by theme. Items
marked *(extend)* already have a working baseline in the engine and need depth
rather than a new subsystem. Nothing here is sequenced — the order within each
group is not priority order.

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
- Video/visual explanations.

## 4. Input & accessibility

- Handwriting input *(extend — OCR exists; make it first-class for working-out)*.
- Better OCR (maths notation, poor photos, small handwriting).
- Mathematical expression input.
- Better equation equivalence (two algebraically-equal answers should be marked
  equal, not string-compared).

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
- Cloze cards.
- More flexible notes.

## 10. Planning & prediction

- Real exam countdown planning *(extend — planner exists; add a live countdown
  that drives daily priority)*.
- Automatic revision-plan rebuilding (re-plan when a session is missed, a grade
  target changes, or an exam date moves) *(shipped — `src/domain/replan.ts`)*.
- Better predicted grades.
- Confidence ranges around predicted grades *(extend — bands exist; tighten them
  as data grows)*.
- Actual grade-vs-prediction tracking (close the loop: did the prediction hold?).

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
