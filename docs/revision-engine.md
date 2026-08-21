# The revision engine

Every number this app shows a student is produced by one of six algorithms.
This is what they do and why they are built that way.

## 1. Scheduling (FSRS)

`src/domain/scheduling.ts`

FSRS is the empirically-fit successor to SM-2 and is what current Anki ships. It
tracks memory **stability** (how long a memory lasts) and **difficulty** (how
hard this item is for this person) separately, rather than folding both into one
"ease" multiplier, and schedules the next review for the day predicted recall
decays to the target retention — 90% here.

Two configuration choices worth stating:

- **Fuzz on.** Reviews scheduled for the same day get spread, so a student does
  not meet one brutal session three weeks after a heavy day.
- **Short-term steps off.** FSRS's minute-scale learning steps are switched off
  because the session queue handles that better: a card graded *Again* is
  reinserted four positions later in the same session (`reinsert`). Tomorrow is
  too late to repair a card you have just proved you cannot recall.

The forgetting curve, `R = (1 + (19/81)·t/S)^-0.5`, is used directly for the
"retention" figure in mastery, so the number shown is a real predicted recall
probability rather than a proxy.

Session queues put the most overdue cards first and interleave new cards rather
than front-loading them, so a session never opens with a wall of unseen
material.

## 2. Mastery

`src/domain/mastery.ts`

Mastery is the number every other engine reads, so it has to be honest about
uncertainty. A topic with two easy cards answered once is not mastered — it is
unmeasured.

```
evidence   = cards + 2 × attempts
weight     = min(1, evidence / 8)
raw        = weighted blend of (stability·0.6 + retention·0.4) and question accuracy,
             with question accuracy weighted 1.5× because it is closest to the real exam
mastery    = evidence == 0 ? 0
                           : prior·(1 − weight) + raw·weight
mastery   ×= max(0.6, 1 − 0.06 × open mistakes)
mastery   ×= 1 − 0.02 × (intrinsicDifficulty − 3)
```

The `evidence == 0 → 0` case matters more than it looks. Returning the prior
there would mean a student who had never opened a topic saw 40% mastery on it,
and every predicted grade would be inflated before they did any work. A unit
test pins this.

**Weak ≠ unmeasured.** A topic is weak only if it is below 0.55 *and* has some
evidence behind it. Topics with no evidence are routed to a first-pass "learn"
activity instead of remediation, which is a different thing to do.

### Recall mastery

`src/domain/recall-mastery.ts`

Recall mastery is the recall-only companion to topic mastery. It deliberately
ignores exam-question attempts and reports each topic's card strength as:

```
recall mastery = stability score · 0.6 + current FSRS retrievability · 0.4
```

The same row also reports observed true retention (`again` vs every other
grade), due cards, review count and evidence level (`unmeasured`, `emerging`,
`reliable` at 20 reviews). `/progress` shows the weighted overall score and
the topics that need retrieval, while keeping modelled mastery separate from
observed recall.

### Application mastery

`src/domain/application-mastery.ts`

Application mastery is the question-performance companion to recall mastery.
It uses eligible marked practice and paper attempts only:

- active-recall attempts are excluded because they measure retrieval, not
  application;
- attempts with a pending low-confidence mark escalation are excluded until
  the mark is resolved;
- a multi-topic question splits its awarded and available marks evenly across
  the mapped topics.

The score is mark-weighted application accuracy. Each row also exposes recent
accuracy over the last five topic attempts, average question difficulty,
question/attempt counts and an evidence level (`unmeasured`, `emerging`,
`reliable` at ten eligible attempts). `/progress` uses the score to rank topics
for more exam-question practice without allowing recall or provisional marks to
inflate the result.

### Mastery uncertainty

`src/domain/mastery-uncertainty.ts`

Mastery uncertainty makes the confidence of the point estimate visible. For
each topic it applies a conservative Wilson 95% interval to a pseudo-trial
count derived from the same evidence model:

```
evidence  = cards + 2 × attempts
successes = round(mastery × evidence)
```

The interval uses at least one denominator for a stable small-sample estimate,
then widens when card retrievability conflicts with the mastery point estimate.
Evidence below eight weighted trials is marked `needsMoreEvidence`; interval
width is labelled `low` below 0.20, `medium` below 0.50 and `high` otherwise.
`masteryIntervals` sorts topics by widest interval first. `/progress` shows the
six widest bands, their evidence state and a direct practice action, so a high
mastery score is not mistaken for a measured one.

## 3. Recommendation

`src/domain/recommender.ts` — technical documentation for the recommendation engine.

### Inputs & outputs

`RecommendInput` takes the homework the engine needs — `topics`, `mastery`,
`cards`, `mistakes`, `exams`, `plan`, `sessionLengthMinutes`, `subjectIds`,
plus optional `marksPerHour` (expected exam marks per hour per topic), an
`outcomeHistory` of `(predicted, actual)` pairs, and
`adaptiveDifficultyOffset` per topic. It returns `Recommendation[]` sorted
descending by `score`, with a first-class `RecommendationExplanation` so the
UI never invents a number the engine didn't compute (`recoverableMarks`,
`marksPerHour`, `lastEvidencePercent`, `daysSinceRetrieval`, `daysToExam`,
`paperLabel`, and the five factor values).

### Score

Every candidate is scored on one scale so they can be compared directly:

```
score = (examGain / minutes) × urgency × weakness × forgetting × uncertainty
        × examProximity × adaptiveDifficulty  × displayScale
```

`examGain` is *expected exam marks* the activity recovers or protects (not raw
cards/topics), so the score reads as weighted marks per minute.

| Candidate | examGain | Rationale |
|-----------|----------|-----------|
| Due flashcards | `count × (0.28 + (1 − retention)×0.35)` | Decayed memory is the cheapest thing to fix; value rises as retention falls. |
| Mistake repair (≥3 open) | `marksLost × 0.7` | Marks the student has already proved they can lose. |
| Weak-topic practice | `marksPerHour × block/60` or `(1 − mastery)×8` | Where revision converts into marks fastest. |
| First-pass learn | `2.2 + (6 − difficulty)×0.25` | Coverage matters, but not more than repairing what is broken. |
| Timed paper | `(1 − avgMastery)×9 + nearExamBonus` | Only once broadly solid or exam ≤ 21 days. |
| Today's plan | additive +12 to a match | The student's own commitment breaks ties. |

`scoreFromGain` does `marksPerMinute(gain, minutes) × factors × 60` so a
5-mark gain in 18 min reads ~0.28 and is comparable across candidates.

### The five bounded factors (each 0.7–2.0)

- **urgency** `examUrgency(days)` — `1 + min(1, 30/(days+15))`, 1.0 far out → 2.0 on exam day.
- **weakness** `weaknessFactor(mastery)` — `1 + (1 − mastery)×0.8`, 1.0→1.8.
- **forgetting** `forgettingFactor(retention, daysSince)` — `1 + (1 − retention)×0.6` or days-based.
- **uncertainty** `uncertaintyFactor(cards, attempts)` — thin evidence boosts exploration 1.4→1.0.
- **examProximity / adaptiveDifficulty** are *additional* bounded multipliers:
  - `examProximityMultiplier(days, mpm)` 1.0–1.45: inside 21 days efficiency dominates; the final week scales to 1.45.
  - `adaptiveDifficultyFactor(topic, row, offset)` 0.85–1.15: high rolling accuracy nudges harder stretch, low accuracy drops a level.

No single factor can dominate: all are bounded and multiplied, and every
monotone property is pinned by `recommender.benchmark.test.ts` (urgency,
weakness, forgetting, uncertainty) and `recommender.factors.test.ts`.

### Optimises marks per minute and exam proximity

`marksPerMinute(marks, minutes)` is the first-class optimiser — the engine
ranks by *what earns a grade fastest*, not by volume. `examProximityMultiplier`
ensures breadth matters far from the exam and efficiency dominates near it.

### Adaptive difficulty

`adaptiveDifficultyFactor` uses rolling `accuracy` (and an optional external
offset) to drift the score ±10% toward the right stretch. It never overrides
weakness/urgency/forgetting.

### Validated against learning outcomes — synthetic now, real later

- `syntheticOutcomePairs(seed, n, subjectId, topicIds)` — deterministic
  synthetic `(predicted, actual)` history so CI can run without real papers.
- `benchmarkRecommendationQuality(pairs)` — reports `{ n, mae, bias,
  correlation, hitRate }` against those later timed-paper outcomes; `hitRate`
is the share within ±5 marks. The real integration replaces synthetic pairs
  with observed `(simulatePaper.predictedMarks, laterPaper.actualMarks)`.
- The 400-scenario benchmark harness (`recommender.benchmark.test.ts`) asserts
  total ordering, no duplicate keys, explanation present, and monotonicity of
every factor across a seeded synthetic population.

### Recommendation-quality benchmark (synthetic)

Run via `recommender.benchmark.test.ts` (400 deterministic learner states) or
`tests/recommender.benchmark.test.ts`'s outcome checks; the next step is wiring
`outcomeHistory` from `simulatePaper` → later paper actuals.

## 4. Planning

`src/domain/planner.ts`

The plan is derived state, not a document. Regenerating is always safe and
cheap, which is what keeps the timetable honest instead of letting it drift into
fiction.

- Days come from stated availability; a day under 10 minutes is skipped.
- Blocks are split between subjects by `(0.15 + (1 − avg mastery)) × urgency`,
  allocated by **largest remainder** so nothing rounds away to nothing and the
  totals always add back up.
- Every study day opens with due-card review.
- Within a subject, topics are picked by projected deficit with a spacing
  penalty — revisiting a topic the very next day wastes the spacing effect.
- Mastery is "spent" as the plan is built, so a topic scheduled on Monday looks
  less urgent by Wednesday.
- Inside the last fortnight, every third block becomes a timed paper.

**Missed sessions.** Anything still pending on a past day is marked `missed` and
its work is re-queued onto the next day with room, oldest first. Nothing
silently disappears, and the plan is never a list of things the student has
already failed to do. This runs automatically at startup as well as on demand.

## 5. Marking

`src/domain/marking.ts`

The offline marker is the floor the product stands on. It is keyword and lemma
overlap against the mark scheme — generous about wording, strict about content:

- Stop words removed, a cheap stemmer so *oxidised* / *oxidation* agree.
- A scheme point is credited at ≥50% content-word coverage, or on a numeric
  match against a value in the scheme.
- Marks are awarded proportionally: a 3-mark part with 4 scheme points still
  awards out of 3.
- An answer under three words is capped at one mark however many keywords it
  happens to contain — otherwise "concentration decreases" scores full marks on
  a 3-mark explain question.

It cannot judge reasoning, which is exactly why AI marking exists and why every
rubric-marked answer is labelled as rubric-marked in the UI.

## 6. Grade prediction & confidence calibration

`src/domain/grades.ts`

```
trust    = min(1, attempts / 10)
blended  = measured accuracy · trust + topic coverage · (1 − trust)
percent  = blended · 92 + 4
range    = ± (6 + 12 · (1 − trust)) percentage points
confidence = trust·0.75·horizonPenalty + min(1, topics/12)·0.25
```

Mastery is not a mark — a student at 100% topic mastery does not score 100% —
so the value is compressed into a realistic attainment range before banding.
The output is always a band with an explicit confidence, because a single
predicted letter carries far more certainty than the data supports.

**Headroom** is the actionable output: how many percentage points the whole
subject would gain if this one topic were taken to full mastery. That answers
"what do I do next", which a predicted grade on its own never does.

### Confidence calibration — honest curves, not raw confidence

- `calibrationReport(pairs)` — Brier score (mean squared error), ECE
  (expected calibration error, weighted bucket gap), per-bucket
  `meanPredicted` vs `meanActual`, and `bias`. Well-calibrated is ECE < 0.08.
- `confidenceCalibration({ subject, mastery, attempts, exams, today, laterOutcomes })`
  — thin wrapper that treats each later timed paper's predicted/actual as a
  probability for the bucket check.
- `syntheticCalibrationOutcomes(seed, n)` — deterministic synthetic outcomes
  for benchmarking without real papers; replace with real
  `(predictGrade.percent/100, laterPaperPercent/100)` once live.
- Validated in `tests/grade-calibration.test.ts` (synthetic longitudinal
histories; `simulatePaper` + `calibrateFromHistory` composizione; confidence
  grows and band narrows as evidence accumulates).

## Mistake loop

`src/domain/mistakes.ts`

The loop that closes everything else:

```
dropped mark → classified mistake → flashcard (front: the question, back: the model answer)
            → returns in reviews → recalled reliably twice → mistake resolved
```

Classification (arithmetic, method, interpretation, communication, recall) comes
from the question's command words and the missed scheme points, and the patterns
are surfaced in analytics — "marks are going on units and significant figures,
not on understanding" is a more useful thing to tell a student than a list of
twelve individual mistakes.

A mistake resolves only when its card has `reps ≥ 2`, `stability ≥ 7 days` and
zero lapses. Resolving on a single correct answer would close mistakes that the
student got right by luck.

## Exam technique vs knowledge separation

`src/domain/retention-analytics.ts`, `src/domain/assessment.ts` and
`src/components/AssessmentPanels.tsx`

`techniqueVsKnowledge(mistakes)` estimates whether dropped marks are primarily
an understanding problem or an exam-performance problem. AO1 and recall losses
are treated as knowledge evidence; rushing, slow timing, communication,
interpretation, arithmetic and explicit command-word slips are treated as
technique evidence; method losses remain a mixed signal. The result is attached
to `AssessmentInsight`, including mark totals, shares, reliability and driver
tags, so every consumer uses the same diagnosis.

`/progress` renders the split as a small stacked bar with the narrative and a
next action. The split is labelled preliminary until there are at least eight
mistakes and ten lost marks; it is a prioritisation signal, not a claim that a
single mistake has one perfectly observable cause.

## Gamification

`src/domain/gamification.ts`

Rewards behaviour that raises grades — showing up, clearing due cards, repairing
mistakes — and never volume for its own sake. No leaderboards.

The streak has a **one-day grace**: a gap of two days holds the streak without
incrementing it. Losing a month's streak to one missed evening is how students
quit, and the streak is meant to support the habit rather than punish a life
event.
