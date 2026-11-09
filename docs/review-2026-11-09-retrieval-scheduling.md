# Revise review: retrieval scheduling handoff

9 November 2026. Focused review of the Revisit path and its handoff into delayed proof. Checkout remains on `fix/onboarding-recovery-and-check-consistency`; existing edits and review notes were preserved.

## Source checked

- `src/data/card-review.ts:20-41` reads the current card in an IndexedDB read/write transaction, uses the desired retention supplied by the caller, then persists the updated card and review log together.
- `src/domain/scheduling.ts:158-198` normalizes the target before scheduling and records non-default targets in the grade event for deterministic sync replay.
- `src/app/review/page.tsx:406` previews intervals at the same account setting used by the grade action.
- `src/domain/proof-of-improvement.ts:169-181` treats review logs as topic exposure in the delayed-proof clock.

## Finding

No new reproducible defect found in this slice. Preview and saved scheduling share the target; the card and review log are written together; the delayed proof ledger sees retrieval reviews. This is a source consistency check, not browser or runtime evidence. No source change was justified.

## Loop status and limits

Diagnose and Learn/Repair remain partial because reviewed questions and independently reviewed teaching are missing. Practise is implemented as code. Prove remains partial pending genuine reviewed content and learner outcomes. Revisit scheduling is implemented; retention benefit is not measured. No new mocked feature was identified.

No tests, lint, type-check, build, browser journey, account, staging, reviewed corpus, or learner outcome was run or checked. Existing edits remain uncommitted and untouched. No Notion entry was added because this pass produced no useful new finding or change.
