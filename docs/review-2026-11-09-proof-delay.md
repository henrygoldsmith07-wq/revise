# Revise hourly review: practice exposure and delayed proof

9 November 2026, first hourly run. Local checkout at `3b0b880` on
`fix/onboarding-recovery-and-check-consistency`, with the expected Revise origin.
Read AGENTS.md, README, the onboarding reliability review and the October product
audit. Preserved all eleven previously modified files and the existing review note.

## Finding and focused change

**High impact / high confidence / low effort — proof delay ignored excluded marks.**
`src/domain/proof-of-improvement.ts:158` filters assessment history through trust
gates before constructing the scored observations. Previously, that same filtered
history supplied the study timestamps. An answer excluded because its question was
unreviewed or its marking unreliable therefore did not reset the waiting period.
Flashcard review logs did reset it. The real caller passes complete attempt history
(`src/state/sessions.ts:176`), so this omission was inside the ledger.

Source-derived reproduction: establish three reviewed baseline answers, rehearse
the same topic on an unreviewed question much later, then answer two reviewed new
questions the next day. Previously the ledger could classify their gain as proven
because it measured from the old baseline and ignored the rehearsal. This is a
confirmed source-path defect; the scenario was not executed under the no-tests rule.
It matters when reviewed supply is available; the current lack of genuine flagship
reviews still blocks ordinary flagship proof.

The fix records excluded attempts as study timestamps without reading their scores
(`src/domain/proof-of-improvement.ts:174`). Existing trusted-score and first-exposure
rules are unchanged. Invalid timestamps are ignored. These timestamps now feed both
the earliest proof date and follow-up eligibility (`:204`, `:226`). Study with the
same timestamp as an assessment also blocks that assessment: no elapsed delay can
be established. No trust gate, content attestation or stored learner row was changed.

## Loop status checked in current source

- Diagnose — partial: shared supply selection and explicit practice fallback exist
  (`src/domain/quick-diagnostic.ts:177`); prior onboarding fixes were preserved.
- Learn / Repair — partial: authored and outline lesson warnings remain explicit
  (`src/components/LessonMode.tsx:325`); teaching has no genuine review evidence.
- Practise — implemented: supported mission stages reserve reviewed supply
  (`src/domain/mission-session.ts:252`, `:300`). This is code, not learner benefit.
- Prove — partial: reviewed-score gates and a three-day delay are implemented
  (`src/domain/proof-of-improvement.ts:36`, `:158`, `:221`); this run closes the
  practice-exposure omission. Reviewed content and real outcomes remain external gaps.
- Revisit — implemented: atomic card review records retrieval and defers retention
  checks (`src/data/card-review.ts:39`, `:44`). Retention benefit remains unmeasured.

No mocked capability was established in this focused pass. This is not a full
audit of every proof consumer: mark-recovery and repair-state calculations are
separate code paths and must not be assumed fixed by this ledger change. Lesson
views or preview cramming without persisted exposure remain outside this fix.

## Verification

Checks pending at note creation; append final results below. No tests added or run.
Existing proof tests were read to understand the intended baseline and delay rules.
No commit, push, remote GitHub edit, deployment or new schedule. Changes remain local.

Final results: `lint:check`, `type-check`, `type-check:strict`, production `build`
and `perf:budget` all passed. The strict configuration covers its configured subset;
the standard TypeScript check covers the changed module. The build regenerated local
`.next` and copied/bundled public assets; no additional tracked build changes appeared.
`git diff --check -- src/domain/proof-of-improvement.ts` passed. Default whole-tree
whitespace checking flags existing CRLF additions in `quick-diagnostic.ts`; the
whole-tree check passes with `core.whitespace=cr-at-eol`. Left that existing file
untouched. No browser journey, regression scenario, staging account or learner
outcome was executed or measured. No tests were added, edited or run by this pass.
