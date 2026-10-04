# Evidence operations (internal)

The engine does not need another learning mode. The next bottleneck is obtaining
trusted questions, genuine human marking and real learner outcomes. Nothing in
these tools substitutes generated or static validation for human review.

## Review campaign

`npm run wjec:campaign -- --limit=25` ranks across all four flagships by marginal
capability unlocked per estimated reviewer minute. Minutes estimate independent
solving plus three minutes for checking marking/specification and half a minute
per part. They are planning assumptions, not measured reviewer timings. Earlier
approvals/promotions are prerequisites for the later marginal unlocks. A minute
budget selects a prefix rather than silently claiming unlocks from omitted work.

`npm run wjec:campaign -- <new-directory> --limit=25 --minutes=240` exports:

- `student.md`: solve independently before reading worked answers.
- `pack.md`: marking, worked solution, specification, provenance and warnings.
- `reviewer-1-return.json` and `reviewer-2-return.json`: separate blank decisions.
- `campaign.json` / `queue.json`: unlocks, cost, stage, prior reviewer IDs and gaps.

Use `wjec:review:import -- <return-file> --dry-run`, then import; second reviewers
must be different qualified humans and work independently. `wjec:review:promote`
only promotes matching two-reviewer audit chains. Then run `wjec:readiness`,
`wjec:quality:report` and `wjec:review:gates`. No directory is overwritten.
Reviewing one reskin never approves the other questions in that cluster.

## Flagship readiness

All counts require the existing runtime trust predicate; families and reskins are
collapsed by the existing supply audit. The verdict is deterministic:

| Verdict | Required usable experience |
|---|---|
| NOT READY | No reviewed cold-start diagnostic yet |
| DIAGNOSTIC READY | Five topics (all topics in a smaller curriculum), each with a reviewed question taking at most 180 seconds |
| MISSION READY | Diagnostic ready plus at least one topic with two distinct reviewed questions and transfer supply |
| PROOF READY | Mission ready plus at least one topic with three distinct reviewed questions and transfer supply: loss, independent success, fresh delayed check |
| FLAGSHIP READY | Every topic supports that loop; all required data/practical topics have reviewed supply; the existing full specification/core release bar passes; no duplicate trusted reskin clusters or changed versions awaiting re-review |

Partial verdicts describe a usable pilot path, not whole-subject coverage. The
full gate preserves the existing statement requirement (trusted recall,
application, transfer and four reviewed questions for every statement, and every
release question reviewed). Percentages are descriptive coverage, never release
thresholds. The topic data requirement reuses review-priority's authored data and
practical topic classification; review it against specification before release.
An individual learner may exhaust reviewed questions even in a ready topic.

## Learner pilot

Settings → Data → Pilot evidence export requires an explicit opt-in click. It
saves a local file; it sends nothing. A random account-scoped alias persists
across exports. Answers, feedback, profile and account identity are removed.
Pilot outcome reporting is separate from collecting answers for human marking.
Pulse privacy is unchanged.

Combine the `learners` arrays from consented exports into one private JSON file.
Use only the latest export per alias; duplicate participants are rejected rather
than inflating the denominator. Preserve dates and linkage. For multi-device
collection, the organiser must reconcile aliases to one participant before
aggregation. Files contain sensitive dates/marks; retain them only under the
pilot's agreed privacy protocol. Historical missing events remain unobserved.

`npm run product:quality -- --pilot=private-pilot.json --json` reports operational,
learning, proof and retention outcomes separately. A rate needs at least ten
distinct contributing learners at that specific stage, not ten clicks from one
student. Counts remain visible. This is a minimum reporting guard, not a power
calculation or proof of causality. Recommendation completion requires the saved
session-completion event with the same task ID. A saved answer alone is an attempt,
not a completed session. Legacy routes without completion capture stay unobserved.

The ordered funnel follows one actual mistake chain through repair, independent
practice, transfer and delayed proof. Content-blocked progress is separate from
behavioural drop-off; waiting for the delay and no mistake to repair are separate
states. Unrelated topic successes cannot be spliced into a completed proof loop.
Study minutes sum recorded attempt time, capped at 45 minutes per attempt; idle
time and uncaptured teaching time are not inferred. Proven marks use the existing
recovery gate. Supported practice improvements have their own count.

Day 1 return means an answer in [24h,48h) after the first answer; day 7 means
[7d,8d). Only completely observed windows enter the denominators. Recent exports
cannot be counted as failed retention. Observational usage is not evidence of
causal product efficacy.

## Genuine marking collection

Start with `npm run marking:evidence:init -- <new-corpus.json>`. The empty file
uses the existing version-2 `AnswerCorpusRecord` format from `answer-corpus.ts`.
Populate genuine student answers only after anonymisation/consent. Records keep
question ID/part, exact question and rubric snapshot, subject, specification,
tariff, type tags, answer, quality band, provenance and benchmark version.

Additional collection fields are:

```json
{
  "collection": {
    "genuineStudentAnswer": true,
    "anonymised": true,
    "consented": true,
    "sourceRef": "pseudonymous-stable-response-reference",
    "collectedAt": "ISO timestamp"
  },
  "answerQualityBand": "partial",
  "rubricMark": null,
  "aiMark": null,
  "markingVersion": "version-of-the-evaluation"
}
```

Source references uniquely identify a response to a question part, not personal
identities. Internally authored/AI rows never count even with filled metadata.
Use qualified pseudonymous marker IDs, role, qualification, independentlyMarked
and markedAt. Do not put marker names/emails in metadata.

`marking:evidence:pack -- <corpus.json> <new-directory>` gives each marker only
their blind JSON and blank return. `marking:evidence:import -- <latest-corpus.json>
<return.json> <new-corpus.json>` validates atomically and refuses overwrites,
stale fingerprints, reused marker IDs and missing independence attestations.
Import marker A then B against the new corpus. Export again for a third marker
to adjudicate disagreement. No average of disputed first-pass marks is truth.

`marking:evidence:report -- <corpus.json>` checks the exact current bank snapshot
before running the existing rubric marker; AI marks are supplied externally with
a marking version. It reports examiner/examiner, rubric/examiner and AI/examiner
exact agreement, ±1, MAE, signed bias, Cohen's kappa and linear weighted kappa.
Metrics require 20 pairs per subject/tariff scale. Degenerate kappa is null, not
perfect agreement. System comparisons use a matched examiner baseline, agreed
or independently adjudicated truth. Unresolved disagreements remain visible.

250 genuine independent answers closes the Phase 1 collection target; 1,000+ is
the later target. Neither number alone licenses a marking-quality claim. Review
coverage by subject, tariff, type and quality band; descriptive sample agreement
does not demonstrate statistical equivalence with examiners.

## Claims and external verification

Needs work uses suitable mistake evidence. Improving requires successful
post-repair performance. Proven and headline recovered marks use reviewed,
unaided, unseen/distinct delayed evidence from the existing recovery engine.
Grade forecasts retain their existing coverage, uncertainty and calibration
gates. Product-wide learning improvement requires a preregistered controlled
study, genuine participants meeting its sample target, independent evaluation
and a positive effect lower bound; synthetic or observational data cannot pass.

`product:quality` ranks content, marking, cohort and deployment blockers. Optional
`--reliability=file.json` accepts observed counts for syncFailures,
persistenceFailures, aiFallbacks/aiRequests and
paperImportsNeedingReview/paperImports. Omit this file when evidence is absent;
the report says EXTERNALLY UNVERIFIED instead of reporting invented zeros.

Run `npm run test:staging` with real configured credentials, independent accounts
and the staging suite in `scripts/run-staging-tests.mjs`. Local tests do not verify
deployed Supabase RLS, multi-device conflicts, offline recovery, tombstones,
account switching, quotas or authenticated provider failure behaviour. Keep the
externally unverified state until those journeys are actually observed.
