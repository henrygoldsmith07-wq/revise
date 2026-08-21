# Unfamiliar-context expansion TDD record

## Contract

`unfamiliarContextQuestions` provides one original, checked transfer question
for every topic in biology, chemistry, mathematics and physics. The 55
templates are materialised across the eight board/qualification variants for
each discipline, producing 440 questions across all 32 subjects.

Every question must:

- begin with an explicit `Unfamiliar context:` scenario that requires a known
  method to be applied in a new setting;
- carry authored provenance, checked verification, reviewer identity and the
  current specification version;
- include a full mark scheme, model answer, learning claim and spec-point
  anchor for every part; and
- include varied formats, including MCQ, calculation, extended response and a
  multi-part transfer question.

## RED

Commit `7a8cb0b` added `tests/unfamiliar-context-expansion.test.ts`. Before the
implementation was registered, the focused command failed because
`unfamiliarContextQuestions` was not exported or seeded:

```text
3 failed — unfamiliarContextQuestions was undefined/not iterable
```

## GREEN

Commit `d951c8b` added the 55 authored templates, subject materialisation and
seed/index exports. The focused command now passes:

```text
npm.cmd test -- --run tests/unfamiliar-context-expansion.test.ts
3 passed (3)
```

## Verification

Run from `apps/revise`:

```text
npm.cmd run type-check                         pass
npm.cmd run lint:check                         0 errors, 40 existing warnings
node scripts/validate-curriculum.mjs           440 topics, 522 seed questions
npm.cmd test -- --run --maxWorkers=1 ...       517 passed across 49 files
npm.cmd run build                              pass
git diff --check                               pass
```

The production build retains the repository's existing Turbopack lockfile
root and custom static-cache warnings; neither is caused by this expansion.
