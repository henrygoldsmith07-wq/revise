# Question navigation TDD record

## Contract

Question practice and timed papers need more than sequential Previous/Next
buttons. The navigation surface must:

- show the current question and total;
- provide numbered, keyboard-reachable jumps;
- distinguish answered questions from unanswered questions and saved drafts;
- allow a student to skip ahead without losing an unfinished response; and
- keep the existing finish behaviour at the end of the session or paper.

`QuestionRunner` therefore accepts a small draft value and reports changes to
its parent. Practice and paper sessions keep drafts by question id while the
shared `QuestionNavigator` owns the visible movement controls.

## RED

Commit `1a5df4a` added `tests/question-navigation.test.ts` before the navigator
and draft wiring existed. The focused command failed because the component was
missing and `QuestionRunner` had no `QuestionDraft` contract.

## GREEN

The implementation adds numbered navigation, answered/draft status, skip labels
and draft restoration to both question flows. The focused contract now passes:

```text
npm.cmd test -- --run tests/question-navigation.test.ts
2 passed (2)
```

## Verification

Run from `apps/revise`:

```text
npm.cmd run type-check
npm.cmd run lint:check -- --no-warn-ignored
npm.cmd test -- --run --maxWorkers=1
npm.cmd run build
```

Lint should remain at zero errors; the repository currently carries unrelated
existing warnings.
