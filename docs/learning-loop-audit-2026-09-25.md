# Revise learning-loop audit — 25 September 2026

## What was inspected

The production path from `Today` through adaptive topic and capability selection, planner allocation, review/practice/paper closure, capability mastery, knowledge tracing, and grade forecasting. Existing content, provenance, mistake, intervention, paper-outcome, benchmark, and performance tests were also inspected. This is a scoped audit of the core learning loop, not a certification of every feature.

## Highest-impact conflicts found and addressed

1. **Different next-action rankings.** `recommender.ts`, `adaptive-session.ts`, `planner.ts`, and `learning-action.ts` each ordered work on a different scale. They now use `next-best-action.ts` for their final comparison. The policy records bounded factors, evidence confidence, time cost, a relative value, and whether marks/hour comes from a sufficiently sized outcome sample. Existing eligibility rules, such as trusted content, due dates, prerequisite review, paper cadence, and question freshness, remain in force.
2. **Unknown evidence looked weak.** Adaptive topic ranking previously treated missing mastery as a full weakness and an unmeasured capability as a large gap. It now uses a neutral weakness prior and values diagnosis separately. A capability requires four weighted observations before it can be labelled secure; the tutor probes unknown capabilities before assuming transfer readiness.
3. **Session endings used score thresholds for the next button.** Review, practice, and paper completion can now surface the refreshed adaptive plan. Substeps inside an adaptive session return to that runner. Legacy score-based routing remains a fallback for old callers or unavailable plans.
4. **Abrupt knowledge-tracing updates.** BKT used a 60% correct/incorrect cutoff, and item difficulty ignored attempts until a five-attempt threshold. Partial credit and support now affect the update continuously. Subject estimates shrink toward a global prior; topic priors account for authored difficulty; learner observations update the posterior. Item difficulty shrinks gradually toward authored difficulty, and only independent trustworthy attempts can calibrate it.
5. **Grade forecasts overused generic mastery.** The forecast now shrinks mastery-only estimates toward a neutral prior. Timed paper runs, independent marked questions, assisted answers, and repeated question families have different evidence weights. The student view leads with a grade range and exposes the main uncertainty sources. Frozen historical forecast and outcome pairing remain in the existing grade loop.

## Evidence and limits

- Curriculum validation reports 475 topics and 841 seed questions across the registered subjects; 390 questions have a verification tag. A tag is not evidence of full human review.
- The existing misconception integrity test reports 76 entries reaching 60 of 475 topics. This is a visible authoring gap, especially for misconception-targeted repair.
- The WJEC Physics depth audit reports 108 of 108 statements complete under its own depth criteria. This does not establish that all GCSE statements have multiple independent, human-verified assessment opportunities.
- The human-labelled marking benchmark has 12 scripts and reports 7/12 exact match. That corpus is too small to support strong examiner-equivalence claims.
- `next-best-action.ts` is a transparent ranking policy, not a proven causal learning-value model. Outcome effects are used only when enough paired evidence exists. Recommendation effectiveness still needs prospective delayed-retention, transfer, and timed-paper evaluation.

## Next highest-value work

1. Build a WJEC GCSE statement-by-statement assessment matrix: retrieval, application, unfamiliar transfer, misconception, data/graph, calculation, and extended response where appropriate. Track family diversity and human verification separately from generated drafts.
2. Calibrate grade ranges against actual mocks and full timed papers by subject and paper component. Add component/AO weighting and coverage checks before narrowing ranges.
3. Expand independent human marking data, especially partial credit, alternative methods, error carried forward, and explanations. Use it to tune confidence and escalation.
4. Audit past-paper extraction and scheme alignment with a confidence queue for uncertain boundaries, figures, and spec mapping.
5. Run the recommendation experiment on delayed and unseen outcomes before claiming efficacy; keep click and immediate-score metrics diagnostic only.
6. Exercise phone-width answer entry, maths input, resume/offline recovery, and sync conflicts with real-device or browser automation.

## Verification

Focused regression tests cover the shared policy, sparse evidence, capability security, support-weighted tracing, question difficulty, grade evidence quality, paper outcomes, adaptive replanning, and post-session routing. The complete local Vitest run passed: 198 test files and 1,779 tests, with one file and two tests skipped. Both Chromium Today-to-session journeys passed, including a 390px phone viewport. Lint, type checking (including strict), curriculum validation and freshness, the webpack production build, and the bundle budget passed. The temporary dependency junction required webpack for this local build; Vitest needed a D: temporary cache after C: ran out of space.