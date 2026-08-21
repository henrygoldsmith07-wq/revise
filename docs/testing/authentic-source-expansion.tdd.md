# Authentic source-material expansion TDD record

## Contract

`authenticSourceQuestions` provides one original source-stimulus question for
every topic in biology, chemistry, mathematics and physics. The 55 extracts
are materialised across the eight board/qualification variants for each
discipline, producing 440 questions across all 32 subjects.

The extracts are authored rather than copied or licensed. They use field notes,
research reports, archive records and technical briefings to make the source
material feel authentic while keeping provenance and marking fully controlled.

Every question must:

- include a `Source extract:` stimulus;
- carry authored provenance, checked verification, reviewer identity and the
  current specification version;
- include a full mark scheme, model answer, learning claim and spec-point
  anchor for every part; and
- include varied formats, including MCQ, calculation, extended response and a
  multi-part source interpretation question.

## RED

Commit `648da70` added `tests/authentic-source-expansion.test.ts`. Before the
implementation was registered, the focused command failed because
`authenticSourceQuestions` was not exported or seeded:

```text
3 failed — authenticSourceQuestions was undefined/not iterable
```

## GREEN

Commit `4e0ded8` added the 55 source-stimulus templates, subject materialisation
and seed/index exports. The focused command now passes:

```text
npm.cmd test -- --run tests/authentic-source-expansion.test.ts
3 passed (3)
```

## Verification

Run from `apps/revise`:

```text
npm.cmd run type-check                         pass
npm.cmd run lint:check                         0 errors, 40 existing warnings
node scripts/validate-curriculum.mjs           440 topics, 577 seed questions
npm.cmd test -- --run --maxWorkers=1 ...       520 passed across 50 files
npm.cmd run build                              pass
git diff --check                               pass
```

The production build retains the repository's existing Turbopack lockfile
root and custom static-cache warnings; neither is caused by this expansion.
