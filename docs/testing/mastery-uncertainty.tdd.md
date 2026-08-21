# Mastery Uncertainty — TDD evidence

## Contract

- Mastery uncertainty is a per-topic interval around the existing mastery point estimate.
- Evidence is weighted as `cards + 2 × attempts`; fewer than eight weighted trials sets `needsMoreEvidence`.
- The domain reports a conservative Wilson 95% lower/upper band, a width and `low`/`medium`/`high` uncertainty label.
- Conflicting card retrievability widens the interval rather than silently increasing confidence.
- `/progress` sorts by widest interval, shows the six widest bands and links directly to practice for more evidence.

## RED checkpoint

- Commit: `c31e7bb test(revise): define mastery uncertainty`
- Command: `npm.cmd test -- --run tests/mastery-uncertainty.test.ts`
- Result: the domain interval test passed, while the UI/store wiring assertion failed because `MasteryUncertaintyCard` had not yet been exposed.

## GREEN checkpoint

- Commit: `599e0da feat(revise): surface mastery uncertainty`
- Command: `npm.cmd test -- --run tests/mastery-uncertainty.test.ts`
- Result: 2/2 tests passed.
- The feature projects per-topic intervals through the store and renders the evidence summary and interval bands in `/progress`.

## Publication and verification

- `tests/mastery-uncertainty.test.ts` covers thin-vs-measured evidence and UI/store wiring.
- `npm.cmd run type-check` passed.
- `npm.cmd run lint:check` passed with 0 errors and the repository’s existing 40 warnings.
- `npm.cmd test -- --run --maxWorkers=1 --minWorkers=1 --testTimeout=15000` passed: 505/505 tests across 45 files.
- `npm.cmd run build` passed; only the existing Turbopack workspace-root and custom cache-control warnings were emitted.
