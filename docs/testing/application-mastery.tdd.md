# Application Mastery — TDD evidence

## Contract

- Application Mastery is a separate per-topic signal based on marked practice and paper questions.
- Active-recall attempts and attempts with pending low-confidence mark escalations are excluded.
- Awarded and available marks are split evenly when a question maps to multiple topics.
- The score is mark-weighted accuracy, with recent accuracy, average difficulty, attempt counts and evidence level also reported.
- Evidence is `unmeasured` with no eligible attempts, `emerging` below ten and `reliable` at ten eligible attempts.
- `/progress` reports overall application accuracy and links the weakest topics to question practice.

## RED checkpoint

- Commit: `3a8565b test(revise): define application mastery`
- Command: `npm.cmd test -- --run tests/application-mastery.test.ts`
- Result: failed during collection because `@/domain/application-mastery` did not exist.

## GREEN checkpoint

- Commit: `599c444 feat(revise): add application mastery`
- Command: `npm.cmd test -- --run tests/application-mastery.test.ts`
- Result: 3/3 tests passed.
- The feature adds the application-only domain calculation, store projection and accessible `/progress` card with recent and reliable evidence.

## Publication and verification

- `tests/application-mastery.test.ts` covers application-only filtering, provisional-mark exclusion, multi-topic mark allocation, recent accuracy, reliability and UI/store wiring.
- `npm.cmd run type-check` passed.
- `npm.cmd run lint:check` passed with 0 errors and the repository’s existing 40 warnings.
- `npm.cmd test -- --run --maxWorkers=1 --minWorkers=1 --testTimeout=15000` passed: 503/503 tests across 44 files.
- `npm.cmd run build` passed; only the existing Turbopack workspace-root and custom cache-control warnings were emitted.
