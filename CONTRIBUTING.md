# Contributing

## Mental model

Revise is one loop: **Diagnose → Learn/Repair → Practise → Prove → Revisit**.
Today chooses the step (`src/domain/revision-engine.ts`); every other route is
a manual way into the same loop. New features should strengthen a stage of the
loop, not add a parallel mode, score or recommender. Show learners plain
language and one of the six states (Not checked, Needs work, Improving,
Awaiting proof, Proven, Regressed); keep statistics behind "Why?"/"Evidence".

## Before you push

```bash
npm run verify      # lint, types (normal + strict), curriculum, content, docs, review gates, tests, build, perf budget
npm run test:e2e    # Playwright (builds and serves the app; set PLAYWRIGHT_CHROMIUM_EXECUTABLE if needed)
```

## Content

- Flagship (WJEC Maths, Biology, Chemistry, Physics) content is trusted only
  through the review workflow in [`docs/review-workflow.md`](docs/review-workflow.md).
  Never hand-edit the ledger or audit log, never set `verification: "verified"`
  or `humanVerification` in question source, and never mark an AI or automated
  check as a human review. `npm run wjec:review:gates` fails if you do.
- Editing a reviewed question invalidates its review on purpose; plan for
  re-review.
- To close a supply gap: `npm run wjec:review:priorities` (what to review or
  author next) and `npm run wjec:quality:report` (internal dashboard).
- New questions need distinct reasoning, not a number or noun swap; see
  `docs/question-supply-audit.md`.

## Tests

Domain tests live in `tests/`; browser journeys in `e2e/`. Product-level
journeys (`tests/product-journey.test.ts`, `e2e/wjec-trusted-journey.spec.ts`)
grant trust to fixtures through the real review workflow in the test itself.
Never add test-only trust to production code paths.
