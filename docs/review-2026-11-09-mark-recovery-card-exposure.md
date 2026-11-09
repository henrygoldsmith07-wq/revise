# Revise review: card retrieval and mark-recovery proof delay

9 November 2026. Follow-up to the onboarding, delayed-proof and mark-recovery
reviews. Checkout remains on `fix/onboarding-recovery-and-check-consistency`;
all existing edits were preserved.

## Finding and change

- **High impact / high confidence / low effort:** `src/domain/mark-recovery.ts`
  previously restarted its delayed proof interval after recorded question
  attempts, but did not receive card-review logs. A learner could retrieve the
  same topic on a flashcard between two otherwise eligible unseen answers, yet
  the later answer could still satisfy the delay from the earlier answer. This
  disagreed with the proof ledger, which already treats card reviews as topic
  exposure (`src/domain/proof-of-improvement.ts`).
- **Focused fix:** mark recovery now accepts optional `ReviewLog` evidence and
  checks same-learner, same-topic reviews when deciding whether a full delay
  elapsed (`src/domain/mark-recovery.ts`, delayed-check predicate). The shared
  recovery hook supplies the current review logs and includes them in its memo
  dependencies (`src/components/recovery-evidence.ts`). Reviews reset timing
  only; their grades never score or satisfy mark proof. Existing callers without
  review history retain their prior behavior.
- **Loop status:** Diagnose and Learn/Repair remain partial because genuine
  reviewed question supply and independently reviewed teaching are missing.
  Practise and Revisit are implemented as code. Prove remains partial pending
  trusted content and real learner outcomes. This closes a code-path exposure
  omission; it is not evidence of improved learning.

## Verification and limits

- Targeted ESLint with zero warnings, standard TypeScript check, and changed-file
  `git diff --check` passed.
- No tests were added or run. No browser journey, screen-reader behavior,
  account, staging service, human review corpus or learner outcomes were checked.
- Existing uncommitted work remains untouched. Changes are local and
  uncommitted; no remote action was taken.
