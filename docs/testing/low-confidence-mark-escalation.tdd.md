# Low-confidence Mark Escalation — TDD evidence

## Contract

- AI mark responses may carry a validated confidence score in `[0,1]`; absence is preserved for escalation.
- Confidence below `0.60` creates a durable `human-review` escalation on the `Attempt`.
- Missing AI confidence is treated as urgent; it is never silently treated as a confident mark.
- Rubric and offline fallback marks do not escalate because they are deterministic.
- `/progress` reports pending queue size, AI-mark coverage, escalation rate and queued questions.

## RED checkpoint

- Commit: `dbabbea test(revise): define low-confidence mark escalation`
- Command: `npm.cmd test -- --run tests/low-confidence-mark-escalation.test.ts --testTimeout=15000`
- Result: failed during collection because `@/domain/mark-escalation` did not exist.

## GREEN checkpoint

- Commit: `c1f7e64 feat(revise): escalate low-confidence marks`
- Command: `npm.cmd test -- --run tests/low-confidence-mark-escalation.test.ts --testTimeout=15000`
- Result: 5 domain/schema/UI-wiring tests passed.
- The feature now adds `markConfidence` and `markEscalation` to persisted attempts, prompts providers for confidence, and surfaces the pending review banner after marking.

## Publication and verification

- `tests/low-confidence-mark-escalation.test.ts` covers threshold, missing confidence, priority, report aggregation, provider defaults and Progress wiring.
- `npm.cmd test -- --run tests/low-confidence-mark-escalation.test.ts tests/marker-disagreement.test.ts tests/phase8-public.test.ts --testTimeout=15000` passed (16/16).
- `npm.cmd run type-check` passed.
- `npm.cmd run lint:check` passed with 0 errors and the repository’s existing 40 warnings.
- `npm.cmd run build` passed; only existing Turbopack-root and custom cache-control warnings were emitted.
- Full Vitest suite with default workers: 489/490 passed; the only failure was the existing curriculum timing budget under worker contention (`3789ms < 1500ms`).
- Full Vitest suite with `--maxWorkers=1 --minWorkers=1`: 490/490 tests passed across 40 files.
