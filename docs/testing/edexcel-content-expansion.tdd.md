# Edexcel A-level Content Expansion — TDD evidence

## Contract

- Edexcel A-level has one original question for every topic in biology, chemistry, mathematics and physics.
- The bank adds 55 checked questions with stable seed ids and Edexcel-specific topic/spec-point ids.
- Every question has a full mark scheme, model answer, learning claim and assessment-objective metadata.
- The set includes MCQ, calculation, structured and extended-response practice.

## RED checkpoint

- Commit: `505ce76 test(revise): define Edexcel content expansion`
- Command: `npm.cmd test -- --run tests/edexcel-content-expansion.test.ts`
- Result: failed because `edexcelExpansionQuestions` was not exported or registered in the seed bank.

## GREEN checkpoint

- Commit: `f2f7fff feat(revise): add Edexcel A-level content`
- Command: `npm.cmd test -- --run tests/edexcel-content-expansion.test.ts`
- Result: 3/3 tests passed.
- The feature adds 55 authored questions, registers them in `src/content/index.ts` and preserves the existing offline question pipeline.

## Publication and verification

- `tests/edexcel-content-expansion.test.ts` covers four Edexcel subjects, topic coverage, provenance, markability, spec-point anchors and format variety.
- `npm.cmd run type-check` passed.
- `npm.cmd run lint:check` passed with 0 errors and the repository’s existing 40 warnings.
- `node scripts/validate-curriculum.mjs` passed: 440 topics and 412 authored question templates.
