# Data-question expansion TDD record

## Contract

`dataExpansionQuestions` provides one original, checked data-interpretation
question for every topic in biology, chemistry, mathematics and physics. The
55 topic templates are materialised across the eight board/qualification
variants for each discipline, producing 440 questions across all 32 subjects.

Every question must:

- include an explicit `Data:` table, measurement set or experimental result in
  its stem;
- carry authored provenance, checked verification, reviewer identity and the
  current specification version;
- include a full mark scheme, model answer, learning claim and spec-point
  anchor for every part; and
- include varied formats, including MCQ, calculation, extended response and a
  multi-part interpretation question.

## RED

Commit `a494bca` added `tests/data-question-expansion.test.ts`. Before the
implementation was registered, the focused command failed because
`dataExpansionQuestions` was not exported or seeded:

```text
3 failed — dataExpansionQuestions was undefined/not registered
```

## GREEN

Commit `002a157` added the 55 authored templates, subject materialisation and
seed/index exports. The focused command now passes:

```text
npm.cmd test -- --run tests/data-question-expansion.test.ts
3 passed (3)
```

## Verification

Run from `apps/revise`:

```text
npm.cmd run type-check                         pass
npm.cmd run lint:check                         0 errors, 40 existing warnings
node scripts/validate-curriculum.mjs           440 topics, 467 seed questions
npm.cmd test -- --run --maxWorkers=1 ...       514 passed across 48 files
npm.cmd run build                              pass
git diff --check                               pass
```

The production build retains the repository's existing Turbopack lockfile
root and custom static-cache warnings; neither is caused by this expansion.
