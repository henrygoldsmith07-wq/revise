# Marks value and proof of improvement

The question Revise exists to answer is: *what is the highest-value thing to
revise right now, and can it prove that doing it improved exam performance?*
An audit found the optimiser could not answer either half honestly. This change
fixes the evidence underneath it, ranks by what the exam is worth, and measures
improvement only where it can be trusted.

## What the audit found

| Finding | Effect |
|---------|--------|
| `examWeighting` was the constant `1` in the adaptive optimiser, the planner and the recommender | A topic carrying 3% of the specification ranked like one carrying 12% |
| Mastery counted every repeat of a question at full weight | One question answered correctly six times scored 1.00; six different questions at 50% scored 0.50. Failing a question then memorising it read 0.80 |
| "Why this session?" was one generic sentence | The student could not see what the choice rested on |
| Nothing measured durable improvement | Same-session marks were the only outcome on screen |
| The optimiser ignored the countdown phases | "No new first passes in the final days" existed only in the legacy planner |
| All four WJEC A-level subjects have 0 of 2,238 human-reviewed questions | Under the existing trust gate no answer there counts as evidence, and the app said nothing about it |

## What changed

**Honest evidence** (`evidence-weights.ts`, `mastery.ts`, `application-mastery.ts`).
The first exposure of a question counts in full, and repeats count 0.35, 0.15,
then 0.05. Exposure is ordered over the learner's full history, so a repeat is
recognised even when the first attempt was provisional.

**Marks value** (`topic-weight.ts`, `marks-value.ts`, `adaptive-scoring.ts`).
- Topic weight is the share of a subject's specification statements the topic
  covers. Boards publish weightings per paper and objective, not per topic, so
  this is a proxy; a subject without statement data falls back to equal weights.
- Performance on unseen questions is a Beta posterior over *different*
  questions with an 80% interval. Evidence is "none", "thin", "building" or
  "solid" by interval width, not by a count threshold. Hinted answers and
  recall practice are discounted or excluded.
- Marks at stake are `100 × share × (1 − performance)` as a range per 100 marks
  of the subject. "Recoverable" multiplies that by how much of a gap a revision
  cycle closes: the learner's own observed rate once they have proven topics,
  otherwise a labelled default of 40%.
- The optimiser multiplies its score by a gentle weight factor (square root of
  relative weight, clamped to 0.75–1.35), a supply factor (0.85 when every
  question on the topic has been seen) and a phase factor (0.35 for an untouched
  topic in the final three days). A topic that is "doing well" on fewer than
  three different unaided questions gets a transfer need, so a new question is
  asked before it is called secure.
- `examWeighting` now carries the real relative weight (1 for an average topic,
  so topics in subjects without statement data behave as before).

**Proof of improvement** (`proof-of-improvement.ts`). A gain is proven only on
different questions (first exposure), answered unaided (no hint, no worked
solution, no copied answer), at least three days after the baseline and after
the last study of the topic. The baseline is the first three such answers; the
follow-up is the latest five that qualify. A gain needs the follow-up's 80%
lower bound to clear the baseline, so two lucky answers do not count. Statuses
are proven, held, no clear change, slipped, awaiting proof and not tested. The
ledger also flags topics that "look learned": strong on questions already seen,
weak on new ones. A topic whose delayed test is due, or that looks learned,
gets a transfer need in the optimiser, so the plan asks for the proof.

**Explanation** (`session-explanation.ts`). Every line is read from the evidence
the optimiser scored: weight, performance with its range, repeats, due
retrievals, open mistakes, the exam phase, evidence gaps and proof state. A
marks claim appears only when the evidence level can carry it. A brand-new
student sees "Not enough evidence yet. This session measures where you are."

**Surfaces.**
- Today: the stakes line under the topic, "Why this session?" as an evidence
  list, and one proof line when there is something true to say. The marks-at-risk
  card was removed from Today's overview because the hero now does that job.
- Readiness: a proof panel first (proven, awaiting, slipped, looks learned, each
  with before → after on different questions) and the evidence gaps below it.
- Session debrief: no longer says "The gain is now tested". It says where the
  topic stands on proof and when new questions would count.
- Marks at risk: recurring patterns are ranked first when they have cost marks
  on two or more separate papers.

## Evidence gaps are explicit

For review-gated WJEC subjects the gap reads "awaiting human review; answers are
practice only and are not counted as proof yet". Other gaps are "no question",
"no unseen question left" and "nearly out of unseen questions". The trust gate
itself is unchanged.

## Known limits

- **Constants are product defaults, not fitted:** the repeat weights, the
  0.4 conversion prior, the factor clamps, the 0.35 final-days factor, the 3-day
  delay, the 0.15 meaningful change and the interval-width cut-offs. The
  conversion rate becomes the learner's own as proven topics accumulate.
- **Topic weight is a proxy** (specification statements), not published marks.
- **Proof is per topic**, not per specification statement or paper. There is no
  paper → unit readiness view because the curriculum data has no paper level.
- **Review-gated subjects show no proof** until their questions are reviewed.
- **Existing numbers will move:** topics practised mainly by repeating questions
  now read lower mastery, which also lowers anything derived from it.
- **Not done:** long-form and multi-step answer diagnosis, and question-demand
  coverage per statement (only four review-gated subjects carry that metadata).
