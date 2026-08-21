# Delayed Far-Transfer Retesting — TDD evidence

## Contract

- A marked answer must reach at least 80% and must not have a pending marker escalation before it can seed a retest.
- The retest is scheduled seven days after the source attempt and is stored as a link on the durable source attempt.
- Candidate selection excludes the source prompt, already-attempted questions and questions from another subject; mapped spec points and learning claims outrank topic-only matches, with lexical/context novelty breaking ties.
- The retest has its own attempt and outcome. A score of 60% passes, while 80% is reported as secure; it never overwrites the source score.
- `/progress` reports due, upcoming, completed and pass-rate evidence. `/practice?retest=…` opens the candidate with the transfer framing and records completion against the source.

## RED checkpoint

- Commit: `e72b212 test(revise): define delayed far-transfer retesting`
- Command: `npm.cmd test -- --run tests/delayed-far-transfer.test.ts`
- Result: failed during collection because `@/domain/delayed-far-transfer` did not exist.

## GREEN checkpoint

- Commit: `a785e35 feat(revise): add delayed far-transfer retesting`
- Command: `npm.cmd test -- --run tests/delayed-far-transfer.test.ts`
- Result: 5 domain and UI-wiring tests passed.
- The feature adds `farTransfer` metadata to persisted attempts, deterministic candidate selection, delayed eligibility/status derivation, independent transfer scoring, the Progress queue and the Practice retest route.

## Publication and verification

- `tests/delayed-far-transfer.test.ts` covers source threshold, provisional-mark exclusion, novel-question selection, prior-attempt exclusion, scheduled/due/completed transitions, independent scoring and UI wiring.
- `npm.cmd run type-check` passed.
- `npm.cmd run lint:check` passed with 0 errors and the repository’s existing 40 warnings.
- `npm.cmd test -- --run --maxWorkers=1 --minWorkers=1 --testTimeout=15000` passed: 495/495 tests across 41 files.
- `npm.cmd run build` passed; only the existing Turbopack workspace-root and custom cache-control warnings were emitted.
