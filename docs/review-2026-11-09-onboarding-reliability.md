# Revise review: onboarding reliability and evidence boundaries

9 November 2026. Source review of clean `main` at `3b0b880`, followed by local
fixes on `fix/onboarding-recovery-and-check-consistency`. This review focuses
on the recent onboarding changes and their handoff into the learner loop.

## Findings and fixes

| Priority | Finding and trigger | Fix | Confidence / effort |
|---|---|---|---|
| High | A rejected settings, exam-date or plan write escaped `finish`, leaving the final button busy indefinitely. A rejected completion-marker write was swallowed and navigation continued. | Catch failures across the full save, show an accessible error, preserve choices and enable retry. Navigate only after the durable completion marker succeeds. Prevent overlapping submissions; reuse account-scoped exam IDs on identical retries, including after reload. | High / low |
| High | `resumeQuickDiagnostic` checked question IDs but did not recheck current trust. A formerly reviewed question could therefore resume under a reviewed label after its review became invalid. | Validate saved item structure, subject/topic membership, unique question and attempt IDs, and current eligibility for the saved evidence tier. Invalid runs are replaced; their saved answers remain. | High / low |
| Medium | Today required three useful questions and three flagship topics; the diagnostic screen accepted a single reviewed question instead of falling back to practice. | Share `selectQuickCheck` between both entry points. Use reviewed supply when sufficient, otherwise a labelled authored practice set, otherwise an explicit empty state. Preserve the reviewed-supply gap report. | High / low |
| Medium | An empty diagnostic produced a report and emitted completion analytics without an answer. Onboarding also recorded diagnostic start before saving and navigation succeeded. | Require a nonempty selection before reporting completion. Record start in the diagnostic itself and final onboarding-step completion after the completion marker succeeds. | High / low |
| Medium | Optional-date validation compared strings only. A malformed date or a restored final-step draft with an expired date could reach saving. | Reuse real calendar-date validation, block invalid later steps, and recheck dates against the current local day at submission. Dates can still be cleared. | High / low |

Evidence in the resulting source:

- `src/components/Onboarding.tsx:378`: save lifecycle and failure recovery;
  `:457`: repeatable exam IDs; `:743`: accessible error.
- `src/domain/quick-diagnostic.ts:177`: shared selection rule;
  `:303`: saved-run validation.
- `src/components/QuickDiagnostic.tsx:62`: shared selector;
  `:93`: nonempty report guard.
- `src/domain/onboarding.ts:16`: real optional-date validation.

## Learner loop: source status

| Stage | Status | Evidence and limit |
|---|---|---|
| Diagnose | Partial | `src/domain/cold-start.ts:64` and `src/components/QuickDiagnostic.tsx:21` implement selection and the answer flow. The committed flagship banks still lack human-reviewed supply; practice cannot establish proof. |
| Learn / Repair | Partial | `src/components/LessonMode.tsx:325` distinguishes outline lessons and unreviewed teaching. `src/domain/mission-session.ts:287` constructs repair and later stages. Authored teaching still needs external review. |
| Practise | Implemented | `src/domain/mission-session.ts:63` selects candidates and reserves reviewed supply for later proof. This is implementation evidence, not evidence that learners benefit. |
| Prove | Partial | `src/domain/mark-recovery.ts:169` requires eligible content; `:190` checks independence; `:200` establishes the delay. `src/domain/proof-of-improvement.ts:36` requires at least three days. Reviewed supply and real outcome evidence remain missing. |
| Revisit | Implemented | `src/data/card-review.ts:39` persists FSRS grading with the retention target. `src/domain/mark-recovery.ts:224` detects later regression. Real retention outcomes were not measured. |

No mocked capability was established in this focused review. The README's main
external evidence gaps remain accurate: independent content reviews, a genuine
double-marked answer corpus, a consented learner pilot and configured staging
verification (`README.md:25`). These are the highest-priority remaining work.

## Verification and limits

Lint, standard and strict TypeScript checks, the production build, client asset
budgets and documentation integrity passed locally. Whitespace checks passed.
Existing expectations in the four previously failing suites were updated for
the intentional practice-tier behavior; the resume fixture now supplies real
question and attempt fields instead of incomplete casts.

No test cases were added and no tests were run under the reviewer's standing
limit. The revised expectations and failure-recovery behavior therefore remain
unverified by tests. No live account, browser journey, staging service, teacher
review or learner outcome was checked. No commit, push, PR or deployment was
made. Build outputs were regenerated locally.
