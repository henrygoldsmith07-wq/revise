# Revise review: lesson self-marking cues

9 November 2026. Reviewed the Learn / Repair lesson application reveal after the onboarding and proof-delay passes.

## Finding and change

- **Medium impact / high confidence / low effort:** `src/components/LessonMode.tsx:543-548` displayed a green check beside every success criterion before the learner had compared their own answer. The model answer is shown at the same time, but the check icon falsely communicated that the criterion was already satisfied and looked like recorded marking. Reworded the heading to “Compare your answer against each point” and changed the fixed green checks to neutral bullets. The criteria remain authored guidance; no learner result is recorded or inferred.
- **Loop status:** Learn / Repair lesson teaching remains partial and explicitly not teacher-reviewed; this change clarifies self-comparison but does not validate the teaching or demonstrate learning benefit. See `docs/review-2026-11-09-onboarding-reliability.md` for the wider flow status.

## Verification limits

- Targeted ESLint passed. Changed-file whitespace check passed with `core.whitespace=cr-at-eol`; the default whole-diff check flags pre-existing CRLF additions in preserved `quick-diagnostic.ts`.
- No tests were added or run. Browser/screen-reader behavior, teaching accuracy, and learner outcomes were not checked.
- Existing onboarding and proof-delay changes were preserved. Changes remain local and uncommitted; no remote action was taken.
