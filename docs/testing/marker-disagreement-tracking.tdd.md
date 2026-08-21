# Marker Disagreement Tracking — TDD evidence

## Contract

- Compare `human`, `rubric` and `ai` award arrays per question part.
- Report row-level and aggregate pair metrics for `human-vs-rubric`, `human-vs-ai` and `rubric-vs-ai`.
- Track compared rows/parts, total agreement, part agreement, disagreement count, mean absolute difference, signed bias (`right − left`) and the maximum absolute difference.
- Keep unavailable marker pairs explicitly unmeasured (`null` metrics), never as zero awards.
- Preserve corpus id/version when scoring a versioned human-marking corpus.

## RED checkpoint

- Commit: `a23c0d0 test(revise): define marker disagreement tracking`
- Command: `npm.cmd test -- --run tests/marker-disagreement.test.ts --testTimeout=15000`
- Result: failed during collection because `@/domain/marker-disagreement` did not exist.

## GREEN checkpoint

- Commit: `50a7f61 feat(revise): track marker disagreement`
- Command: `npm.cmd test -- --run tests/marker-disagreement.test.ts --testTimeout=15000`
- Result: 3 tests passed.
- The corpus adapter reports 12 labelled rows and 18 compared parts for the available human ↔ rubric pair; pooled MAE is `0.333` and total agreement is `7/12`.

## Publication and verification

- `/benchmarks` renders pairwise rows/parts, agreement, MAE, bias and AI coverage.
- `tests/phase8-public.test.ts` pins the public wiring and `tests/marker-disagreement.test.ts` covers the domain contract.
- `npm.cmd run type-check` passed.
- `npm.cmd run lint:check` passed with 0 errors and the repository’s existing 40 warnings.
- `npm.cmd run build` passed; only existing Turbopack-root and custom cache-control warnings were emitted.
- `npm.cmd test -- --run tests/perf.test.ts --testTimeout=15000` passed in isolation (6/6).
- Full suite with default parallel workers: 484/485 passed; the only failure was the existing curriculum timing budget under contention (`3938ms < 1500ms`).
- Full suite with `--maxWorkers=1 --minWorkers=1`: 485/485 tests passed across 39 files.
