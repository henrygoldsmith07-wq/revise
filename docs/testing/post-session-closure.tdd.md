# Post-session closure TDD record

## Contract

Review, question-practice and timed-paper sessions must end with a useful,
explicit close rather than dropping the student onto an unrelated screen.

`buildPostSessionClosure` keeps the rules pure and shared. It reports:

- attempted work against the session total;
- score and dropped marks when marks exist;
- elapsed time with a one-minute floor;
- a repair action for dropped marks or review retries; and
- a continuation action for strong work or a safe return for an unstarted
  session.

The UI presents those metrics in one live status region, explains what to do
next, and provides explicit routes to mistakes, further practice or today.
Planned practice sessions are completed when the student closes the session,
not after the first answer. Paper scores use the full paper denominator and
re-answering a question replaces its previous score instead of double-counting.

## RED

Commit `fffc476` added `tests/post-session-closure.test.ts` before the domain
module existed. The focused command failed because
`@/domain/post-session-closure` could not be resolved.

## GREEN

The implementation adds the pure closure decision layer, the shared
`PostSessionClosure` component and wiring for review, practice and papers.
The focused contract now passes:

```text
npm.cmd test -- --run tests/post-session-closure.test.ts
6 passed (6)
```

The same test checks the live-region accessibility contract and the three app
surfaces, including the delayed planned-session completion rule.

## Verification

Run from `apps/revise`:

```text
npm.cmd run type-check
npm.cmd run lint:check -- --no-warn-ignored
npm.cmd test -- --run
npm.cmd run build
```

Lint currently reports only the repository's existing warnings; the closure
changes add no errors.
