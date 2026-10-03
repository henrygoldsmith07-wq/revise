# Question supply audit

Revise can only prove an improvement on questions the learner has not seen, and
only reviewed questions count (`src/domain/supply.ts`). This audit measures, per
topic of the four WJEC flagship subjects, whether that supply exists.

## What it measures

Per topic (`src/domain/supply-audit.ts`): authored and specification-linked
questions; trusted questions (the repo's `trustedAssessmentContent`, flagship
subjects only); trusted transfer and data-analysis questions; distinct trusted
families; **provableDistinct**; delayed-proof-eligible questions; shallow groups.

- **Shallow variation** collapses to one question: *number swaps* (same text
  once numbers and units are masked), *noun swaps* (same wording with a few
  content words changed, or `NEAR_DUPLICATE` value-stripped overlap as in
  `trusted-coverage.ts`) and *same-signature* reskins (near-duplicate reasoning
  profile and prompt structure). Questions sharing an authored family also
  count once. The same detector (`src/domain/reskin.ts`) stops a reskin counting
  as unseen supply or as independent proof.
- **Verdict**: `enough-for-proof` needs `MIN_PROVABLE_QUESTIONS` (2) distinct
  trusted questions; one is `thin`; none is `insufficient`.
- **Delayed-proof eligible**: trusted questions with no shallow partner among
  other trusted questions (deliberately strict).
- Unverified and reference-tier content never counts. The audit lists
  `authoredDistinct` and `reviewableDistinct` so authoring needs say whether
  review of existing items could close a gap (`review-existing`) or new
  questions are needed (`author-new`). It never marks anything reviewed.

`src/domain/trust-label.ts` maps the same predicates to four learner-facing
tiers (trusted, reference, unverified, insufficient) with one-sentence notes
that are `null` when trust does not change the learner's decision.

## From audit to action

The audit decides what counts; [`review-workflow.md`](review-workflow.md) turns
it into work. `npm run wjec:review:priorities` ranks the next questions to
review by product capability unlocked (cold-start diagnostic, second distinct
question, first transfer, first data question, delayed proof, Exam Mission
proof) and says where a genuinely new question must be authored.
`npm run wjec:quality:report` is the internal dashboard (trusted coverage,
distinct families, transfer, data, delayed-proof readiness, shallow duplicate
groups, questions awaiting review, topics blocked from proof, cold-start and
mission-proof readiness). Learners never see these counts.

## Running it

```
npm run wjec:supply:audit              # table + largest gaps (--needs=N, --json)
npm run wjec:supply:check              # integrity only
```

`--check` fails only for integrity problems: a proof-eligible question that is
not trusted, shallow duplicates or same-family questions both counted as
distinct, inconsistent verdicts, or counts exceeding `supply.ts`. Thin supply
never fails it.

## Current result (2026-10-03)

| Subject | Topics | Questions | Trusted | Distinct trusted | Distinct authored | Shallow groups | Enough / thin / none |
|---|---|---|---|---|---|---|---|
| Mathematics | 23 | 202 | 0 | 0 | 144 | 27 | 0 / 0 / 23 |
| Biology | 25 | 205 | 0 | 0 | 149 | 27 | 0 / 0 / 25 |
| Chemistry | 23 | 202 | 0 | 0 | 142 | 23 | 0 / 0 / 23 |
| Physics | 19 | 1630 | 0 | 0 | 1556 | 35 | 0 / 0 / 19 |

Question counts are per topic, so a question tagged to two topics counts twice.

No flagship question has a valid human review yet, so every topic is
`insufficient` and Revise cannot currently prove improvement in any flagship
topic; unreviewed questions remain available for practice. About a quarter of
the Mathematics, Biology and Chemistry bank is shallow variation (noun swaps of
the same template), so reviewing the existing bank yields fewer independent
questions than its raw size suggests. Every topic has enough distinct authored
questions that review could close the two-question gap, but trusted transfer
and data-analysis questions are also zero. The audit does not fabricate review.
