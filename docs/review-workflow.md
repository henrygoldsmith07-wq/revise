# Trusted-question review workflow

Revise proves an improvement only on questions that a qualified human has
reviewed, and only when those questions are genuinely different from ones the
learner has already answered. This document is the contract for getting a
flagship question from authored to trusted. Nothing here approves content
automatically; the tools validate, order and record human decisions.

## States

```
unverified ──approve──▶ checked ──approve (different reviewer)──▶ verified (trusted)
     ▲                      │
     └── reject / revise ───┘   (any reject/revise resets approvals on that content)
```

- **unverified** – no valid approval for the question's current content.
- **checked** – one qualified reviewer approved all six checks (question,
  marking, worked solution, capability mapping, specification mapping, exam
  realism). Not trusted yet.
- **verified** – a second, different reviewer approved the same content. Only
  now does `promote` write a ledger entry, which is the only thing that makes
  the question trusted at runtime (`trustedAssessmentContent`).

`REQUIRED_INDEPENDENT_APPROVALS` (in `src/domain/review-workflow.ts`) is the single
policy constant. Changing a question's text, mark scheme, worked answer, marks,
specification links or provenance changes its content fingerprint
(`wjec-review-v3:sha256`), which drops it back to *needs re-review*; old
approvals stay in the log as history and never apply to the new content.

## Files

| File | Purpose |
|---|---|
| `src/content/reviews/wjec-review-audit-log.json` | Append-only, hash-chained log of every decision (reviewer, role, qualification, date, six checks, comments, classification). Editing or deleting history breaks the chain and fails `wjec:review:gates`. |
| `src/content/reviews/wjec-human-verification.json` | The ledger the runtime reads. Written only by `wjec:review:promote` from a verified chain. |

## Loop

1. `npm run wjec:review:priorities` – ranked by product capability unlocked
   (below), per topic and overall. It says which authored question to review
   next, what that unlocks, and where a genuinely new or revised question is
   needed instead.
2. `npm run wjec:review:queue -- <maths|biology|chemistry|physics> <new-dir> --limit=10`
   writes `pack.md` (question and mark scheme side by side, specification
   points, provenance, authored transfer/data classification, reskin warnings,
   gate warnings), `review-return.json` (blank template with exact
   fingerprints) and `queue.json`.
3. Reviewers fill `review-return.json`: `decision` (`approve`, `reject`,
   `revise`), `reviewerId`, `reviewerRole`, `reviewerQualification`,
   `reviewedAt` (ISO instant), the six `checks`, `comments` (required for
   reject/revise) and `classification` (`transferConfirmed`,
   `dataAnalysisConfirmed`, only valid when the question really has a transfer
   link or authored data). Rows left without a reviewer are skipped.
4. `npm run wjec:review:import -- <file> [--dry-run]` validates and appends
   atomically: any invalid row rejects the whole file.
5. `npm run wjec:review:promote [-- --dry-run]` writes ledger entries for
   verified chains.
6. `npm run wjec:review:gates` is the release gate and runs in `npm run verify`.

The older packet route (`npm run wjec:review:apply`) feeds the same audit log,
so there is only one path to trust.

## Prioritisation

`src/domain/review-priority.ts` runs a greedy marginal simulation over the
supply audit's clusters (reskins merged), scoring each candidate by the
capabilities it newly unlocks for its topic, divided by the approvals it still
needs, times exam-weight (and exam-proximity when a date is supplied):

| Unlock | Points |
|---|---|
| Helps the cold-start diagnostic (5 topics with a trusted question short enough to ask) | 100 |
| Second distinct trusted question | 80 (+30 Exam Mission proof) |
| First trusted transfer question | 60 |
| First trusted data / practical question (where the topic needs one) | 50 |
| First trusted question; delayed-proof supply (third distinct) | 40 |
| Replaces reskinned trusted supply | 10 |

Target per topic: at least 2 genuinely distinct trusted questions, at least 1
trusted transfer question, a data/practical question where the topic needs
one; a third distinct question makes delayed-proof sessions possible.
Questions that fail a blocking content gate, or that a reviewer sent back for
revision, are not proposed until their content changes.

## Content gates

`src/domain/review-gates.ts`, applied before review and again at release:
missing mark scheme or worked answer, parts not adding up to the total,
multiple-choice key out of range, no specification link, unknown specification
point or topic, stale specification version, transfer label without a baseline
link that differs from the transfer setup, data-analysis label without a table
or data values, unaccepted provenance (unreviewed, imported or AI origin;
generated content is allowed only with a reviewer warning). Duplicate and
reskin detection is `src/domain/reskin.ts`; it is also enforced in proof
(`mark-recovery.ts`) and in "unseen" supply (`learning-evidence.ts`), so a
number swap, noun swap or same-reasoning reskin never counts as independent
evidence.

## What this does not do

No automated check is a human review. Authoring new questions where the
priorities report says "needs new or revised" is still manual work.
