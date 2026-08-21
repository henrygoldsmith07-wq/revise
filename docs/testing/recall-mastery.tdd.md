# Recall Mastery — TDD evidence

## Contract

- Recall Mastery is a separate per-topic signal and never includes exam-question marks.
- The score combines card stability (60%) with current FSRS retrievability (40%).
- Each row reports observed true retention, reviews, recalled reviews, due cards, last retrieval and evidence level.
- Evidence is `unmeasured` without review logs, `emerging` below 20 reviews and `reliable` at 20 reviews.
- `/progress` reports weighted overall recall mastery and links the weakest studied topics directly to card review.

## RED checkpoint

- Commit: `1043a04 test(revise): define recall mastery`
- Command: `npm.cmd test -- --run tests/recall-mastery.test.ts`
- Result: failed during collection because `@/domain/recall-mastery` did not exist.

## GREEN checkpoint

- Commit: `67ad13e feat(revise): add recall mastery`
- Command: `npm.cmd test -- --run tests/recall-mastery.test.ts`
- Result: 3/3 tests passed.
- The feature adds the recall-only domain calculation, store projection and accessible `/progress` card with observed recall and due-card actions.

## Publication and verification

- `tests/recall-mastery.test.ts` covers recall-only separation, strong/unmeasured topics, observed lapses, due pressure, evidence thresholds and UI/store wiring.
- `npm.cmd run type-check` passed.
- `npm.cmd run lint:check` passed with 0 errors and the repository’s existing 40 warnings.
- `npm.cmd test -- --run --maxWorkers=1 --minWorkers=1 --testTimeout=15000` passed: 500/500 tests across 43 files.
- `npm.cmd run build` passed; only the existing Turbopack workspace-root and custom cache-control warnings were emitted.
