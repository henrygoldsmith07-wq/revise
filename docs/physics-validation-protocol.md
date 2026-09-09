# Physics content and efficacy validation

Status: implementation and AI draft content only. No human verification or student trial has been completed by this change.

## Editorial release

The 1,512 generic Physics template questions have been removed from the live bank. Existing stored rows remain recoverable on disk, but are excluded from the loaded question inventory. Replacement questions have new IDs. Old attempts are never rewritten as attempts on the new content.

Run `node scripts/export-physics-review.mjs <output-directory>` from the repository to produce a question-by-question review packet for the entire live Physics bank. The packet contains prompts, solutions, mark points, capability IDs, internal specification IDs, fingerprints, automated marking disagreements and six unchecked review fields. Automated agreement between a model solution and its own rubric is only a consistency check.

A Physics subject expert must solve each item, check physical assumptions and data, check each independently awardable mark, write acceptable alternatives and misconception counterexamples, verify every mapping against the current WJEC specification, and judge the intended demand and exam realism. The internal 108-claim outline is not proof of complete official specification coverage. Record reviewer identity, timestamp and the exact content fingerprint in the review decision. No generated reviewer identity is acceptable.

Approve all six checks only after this work. Approvals become stale on question, solution, scheme, family, or mapping changes. Marking should additionally be checked on anonymised real responses independently labelled by two qualified markers, with disagreements adjudicated. Include incorrect methods leading to coincidentally correct answers, equivalent algebra, significant figures, contradictory working and valid error carried forward. Unrecognised handwritten or algebraic working needs marker review.

Do not release Physics as deeply validated while approved per-capability demand coverage remains incomplete. Draft questions may support practice; they cannot establish trusted transfer or resolve a delayed repair.

## Prospective four-arm comparison

Use the existing experiment assignment and analysis implementation, with consented participants and a preregistered protocol. Do not enrol or contact students without explicit authorization. Retain anonymous participant IDs, minimise collected personal data, and agree storage, access and withdrawal arrangements with the participating school.

Compare the production adaptive policy, weakest-topic-first, due-review-first and student-selected revision. Give every arm the same reviewed content, total time allowance, assessment access and marking procedure. Freeze a content/version manifest before assignment. Record the actual policy shown and followed, support, intervention type, prior independent evidence, immediate response and all active time spent on teaching, retrieval, feedback and practice. Preserve failures and incomplete follow-ups.

Use a reviewed baseline before assignment, a matched unseen post-test and an unseen delayed test at least seven days after the last relevant practice. Match assessment blueprints and maximum marks across arms, but use different question families. Keep these families inaccessible during practice. Record exposure outside Revise where feasible. Mark blind to allocation and adjudicate disagreements. Agree the primary endpoint, sample-size calculation and missing-data analysis before recruitment; the software's minimum row counts are not a power calculation.

Primary outcome: (delayed unseen marks minus matched baseline marks) divided by observed revision hours. Use a fixed common mark scale. Report immediate gain and transfer separately, uncertainty intervals, arm sizes, missing follow-ups, adherence and contamination. Include negative gains. Analyse participants as assigned; add a clearly labelled adherence sensitivity analysis. Compare Revise separately with all three alternatives and account for multiple comparisons.

For Physics final assessment records, require matching subject/version/maximum marks, held-out-family confirmation, human marking, delayedDays and revisionMinutes including non-question work. A boolean claim that forms match is insufficient. Do not claim effectiveness from practice throughput, self-marked cards, repeated questions or tests using simulated students.

## Intervention calibration

Only version-2 chains with a measured independent baseline, measured time, distinct question families, approved independent transfer and delayed retention enter empirical calibration. Failed outcomes remain eligible. Replayed rows and duplicate chains cannot inflate samples. Delayed checks must follow an unpractised week; later teaching/retrieval observations and question attempts restart the delay. Conservative policy priors remain active below twenty complete chains across five learners. This threshold is an operational guard, not evidence of causal superiority.

Follow-up checking time is included. Other learning activities must have observed time before they can support a complete time denominator. Local records alone do not establish a population effect. Pool data only under the study's consent and data-governance arrangements. Real outcome collection and human adjudication remain external work.

## Authentic papers

Use authenticated WJEC past-paper questions with reviewed marking and capability mappings. Preserve the original paper identity and sitting ID, first exposure, support, elapsed time and pre-sitting prediction. The `paper` mode tag does not establish provenance. Repeated, supported, self-marked, unresolved or unreviewed Physics paper attempts are excluded from prediction calibration. Whole-sitting scores must not be inferred from a selectively trusted subset.

Part-level capability weaknesses can feed the existing repair loop. A multi-capability part establishes a diagnostic hypothesis, not a verdict against every skill. Grade predictions remain provisional until validated against independent whole-paper outcomes.
