# Exam Technique vs Knowledge Separation — TDD evidence

## Contract

- `AssessmentInsight.techniqueVsKnowledge` is the single shared diagnosis for lost marks.
- AO1 and recall evidence is attributed to knowledge; timing, communication, interpretation, arithmetic and explicit command-word slips are attributed to exam technique; method losses remain mixed.
- The result includes lost-mark totals, 0–1 shares, driver tags, a narrative and a reliability flag.
- The diagnosis is preliminary until there are at least eight mistakes and ten lost marks.
- `/progress` renders the split with an accessible stacked bar, reliability cue and an action link to timed papers or mistake review.

## RED checkpoint

- Commit: `0ad6b14 test(revise): define exam technique knowledge separation`
- Command: `npm.cmd test -- --run tests/exam-technique-knowledge.test.ts`
- Result: 1 domain assertion and 1 UI-wiring assertion failed before the assessment field and Progress card existed.

## GREEN checkpoint

- Commit: `83286f3 feat(revise): surface exam technique knowledge separation`
- Command: `npm.cmd test -- --run tests/exam-technique-knowledge.test.ts`
- Result: 2/2 tests passed.
- The existing classifier is now part of the central assessment snapshot, and `/progress` exposes it as an actionable card.

## Publication and verification

- `tests/exam-technique-knowledge.test.ts` covers central snapshot wiring, a reliable technique-heavy split and Progress UI wiring.
- `npm.cmd run type-check` passed.
- `npm.cmd run lint:check` passed with 0 errors and the repository’s existing 40 warnings.
- `npm.cmd test -- --run --maxWorkers=1 --minWorkers=1 --testTimeout=15000` passed: 497/497 tests across 42 files.
- `npm.cmd run build` passed; only the existing Turbopack workspace-root and custom cache-control warnings were emitted.
