# GCSE Question Expansion — TDD evidence

## Contract

- The authored bank contains one original question for every GCSE topic.
- Coverage spans all 16 supported GCSE board/subject combinations: WJEC, AQA, Edexcel and OCR across maths, biology, chemistry and physics.
- The 55 shared templates materialise into 220 board-specific questions with stable seed ids and board-specific topic/spec-point ids.
- Every question is checked, authored, markable, model-answered and linked to a curriculum spec point.
- The set includes MCQ, calculation, structured and extended-response practice.

## RED checkpoint

- Commit: `f004cca test(revise): define GCSE question expansion`
- Command: `npm.cmd test -- --run tests/gcse-question-expansion.test.ts`
- Result: failed because `gcseExpansionQuestions` was not exported or registered in the seed bank.

## GREEN checkpoint

- Commit: `fce7909 feat(revise): expand GCSE question bank`
- Command: `npm.cmd test -- --run tests/gcse-question-expansion.test.ts`
- Result: 3/3 tests passed.
- The feature adds the shared authored templates, expands them for all four boards and exports them through `src/content/index.ts`.

## Publication and verification

- `tests/gcse-question-expansion.test.ts` covers 220-topic coverage, provenance, markability, curriculum anchors and format variety.
- `npm.cmd run type-check` passed.
- `npm.cmd run lint:check` passed with 0 errors and the repository’s existing 40 warnings.
- `node scripts/validate-curriculum.mjs` passed: 440 topics and 357 authored question templates.
