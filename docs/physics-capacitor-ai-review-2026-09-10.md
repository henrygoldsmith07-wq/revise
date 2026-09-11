# Capacitor content review — 10 September 2026

**AI authoring and technical checks only. No qualified human review, student responses, independent human marks, adjudication or learner outcomes were obtained.** All questions remain generated/unverified. This document is not an approval packet and cannot establish trusted learning evidence.

The 14-question capacitor-energy pilot remains the first external review task. Four items were repaired in this pass. A further 14 original charging/discharging drafts address the existing `phys.capacitance.sp-04` authoring brief. No student interface or adaptive subsystem changed.

## Specification crosswalk

Source checked: [official WJEC Physics specification, version 3, October 2023](https://www.wjec.co.uk/media/gxbjl243/wjec-gce-physics-spec-from-2015-e-22-09-22.pdf), printed pages 47–48. Capacitance is section 4.1. The curriculum previously displayed section 4.6; this has been corrected while preserving internal statement IDs and recorded attempts. The charge/current summary now distinguishes rising charging voltage from falling charging current.

Internal statements group board requirements; the count of 108 internal statements is not proof of full official coverage. In particular, the existing capacitance summaries do not separately diagnose every plate-geometry or field relation. No extra capability nodes or prerequisite approvals were introduced here.

| Internal statement | Board crosswalk |
| --- | --- |
| capacitance.sp-01 | 4.1(a), (c)–(e): construction, capacitance and geometry/dielectric effects |
| capacitance.sp-02 | 4.1(b), (g): separated charge and stored energy; calculations also use (c) |
| capacitance.sp-03 | 4.1(h): combinations |
| capacitance.sp-04 | 4.1(i)–(j): charging, discharging and RC |

The energy pilot includes geometry, combinations, exponentials and mechanical energy as supporting knowledge. Its single internal mapping identifies the main assessed capability, not every prerequisite. Human review must still judge diagnostic granularity, command words, demand, supporting knowledge and exam realism.

## Energy pilot checks and repairs

Question IDs below have prefix `cnt:question:physics-energy-`. Fingerprints have prefix `physics-review-v2:`. These are the post-repair versions. A reviewer must independently solve the prompt before inspecting the key. The calculations below are AI checks, not an independent human solution.

| ID suffix | Fingerprint | Calculation or physical check | Action / review focus |
| --- | --- | --- | --- |
| charge-energy-definition | ff002de3 | U = QV/2 uses the magnitude on either plate | Retained; distinguish separated charge from total net charge. |
| graph-energy-recall | f89e286a | Area under V against Q has units V C = J | Retained; axes and zero-to-final integration bounds are explicit. |
| why-half-qv | bfd7cd7f | Constant C gives a linear V–Q relation and mean voltage V/2 | Retained; do not extend the argument to arbitrary nonlinear capacitance. |
| energy-when-separated | 5bc6ddc2 | Isolated Q fixed; C halves; Q²/(2C) doubles | Retained; mechanical work supplies extra field energy. |
| choose-pulse-bank | 4eb6001e | A: 0.2816 J maximum; B: 0.45 J. Alternatively required voltages are 19.1 V and 28.3 V | **Repaired:** explicitly accept the required-voltage route as well as maximum-energy comparison. |
| usable-voltage-window | 824ae7d2 | (2/2)(25 − 9) = 16 J; 16/0.50 = 32 s | **Repaired:** accept separate stores and follow-through on time. The ideal converter is essential: this is a constant-power load, not simple resistor discharge. |
| same-energy-half-voltage | 1db1a9c7 | 2(1/2)² = 1/2; require four times C to preserve U | Retained; tests quadratic rather than linear scaling. |
| neutral-does-not-mean-empty | b0480bb5 | (30 × 10^-6)(20)/2 = 3.0 × 10^-4 J | **Repaired:** replace overlapping charge-definition credits with separate field-energy reasoning; prompt now explicitly requests it. |
| infer-capacitance-from-slope | 2e518e6 | Slope = 0.030/300 = 10^-4 J V^-2; C = 2 × slope = 200 μF | Retained; slope is C/2, not C. |
| infer-voltage-from-charge-energy | 943640cc | V = 2U/Q = 60 V; C = Q/V = 10 μF | **Repaired:** allow equivalent rearrangement, direct C = Q²/(2U), and capacitance follow-through from a positive stated voltage. |
| charge-sharing-loss | b549ddde | 48 μC/12 μF = 4 V; energy falls from 288 μJ to 96 μJ | Retained; 192 μJ dissipates through the connecting resistance. Charge conservation does not conserve capacitor energy alone. |
| harvester-plate-cycle | af86e755 | Q = 600 nC; final V = 15 V; energy rises 1.8 → 4.5 μJ | Retained; 2.7 μJ minimum work assumes negligible losses. |
| energy-half-life | c8774a18 | t_U = 4 ln(2) = 2.772589 s; t_V = 8 ln(2) = 5.545177 s | Retained; round from unrounded values: 2.8 s and 5.5 s at two significant figures. |
| capacitor-lift-budget | 344f08d3 | Released 20 J; useful 12 J; h = 12/(0.25 × 9.81) = 4.89 m | Retained; residual electrical energy and conversion losses both matter. |

All four changed fingerprints require fresh review. There were no approvals to carry forward. The previous dated review folder is preserved; it must not be used to approve the changed versions.

## Charging/discharging authoring choices

The new batch contains two different reasoning families for each demand. A metadata audit checks the count and prompt signatures; it cannot establish educational quality. Each draft includes a worked solution, one rubric entry per mark, a capability mapping and a reasoning description. Numeric answers accept stated equivalent methods and follow-through where specified; no unsupported binary calculation shortcuts were attached.

| Demand | First reasoning task | Second reasoning task |
| --- | --- | --- |
| Recall | Define RC using remaining fraction | Interpret current-time area as transferred charge |
| Explanation | Explain falling charging current using resistor voltage | Explain measurement loading as a parallel path |
| Application | Solve a charging trigger threshold | Choose sampling interval and recording duration relative to RC |
| Misconception | Distinguish one time constant from complete discharge | Reject equal absolute losses using successive voltage ratios |
| Calculation/data | Infer C from a dimensionally defined logarithmic slope | Infer both unknown supply voltage and RC from two readings |
| Transfer | Use a supplied relaxation law with a non-zero starting voltage | Infer leakage resistance from a shortened time constant |
| Synoptic | Combine voltage decay with resistor power | Convert charge lost over a late interval into an electron count |

The leakage question retains the meter-loading family; the charge-count question retains the current-area family. Resistor-power decay shares `capacitor-energy:exponential-energy` with the existing energy-half-life question. Reusing these methods does not create a new transfer family. Novelty still depends on actual prior exposure. None is a designated reviewed held-out assessment.

The unknown-supply solution reconstructs both readings (3.0 V at 2.0 s and 4.5 V at 4.0 s) with V_s = 6.0 V and RC = 2.88539 s. Other numerical checks give a 2.41695 s timer delay, 10.34 s sampling time constant, 83.333 μF from the log slope, 0.693147 s for the precharged sensor, 300 kΩ leakage resistance, 4.15888 s power threshold, and 1.45340 × 10^14 transferred electrons. Automated regression checks exercise inverse reconstruction, conservation, parallel resistance and family reuse.

## Marking defects reproduced — unresolved

The five probes below are **synthetic AI diagnostic examples**, not student data or a human gold corpus. The expected marks are this AI review's reading of the rubric. No agreement percentages, validation claim or calibration update should be derived from them. The first three expose existing heuristic-marker limitations; rubric clarification alone did not repair the marker.

| Item | AI-expected score | Revise score | Observation |
| --- | --- | --- | --- |
| choose-pulse-bank | 3/3 | 2/3 | Correct required-voltage method loses the justified selection point. |
| infer-voltage-from-charge-energy | 1/3 | 2/3 | Missing factor two wrongly gains the correct-voltage accuracy point; only the capacitance follow-through should survive. |
| neutral-does-not-mean-empty | 0/3 | 1/3 | Zero-energy misconception wrongly gains the non-zero energy calculation point. |
| log-gradient | 3/3 | 3/3 | Equivalent numerical notation is accepted in this example. |
| infer-leakage | 0/4 | 0/4 | Blank response remains zero. |

Exact submitted strings, in table order:

```text
For A, V = sqrt(2*0.40/0.0022) = 19.1 V, above the 16 V rating. For B, V = sqrt(2*0.40/0.0010) = 28.3 V, below the 35 V rating and 30 V supply maximum. Only B is suitable.

V = U/Q = 0.018/0.000600 = 30 V. C = Q/V = 0.000600/30 = 0.000020 F.

There is no electric field energy because net charge is zero. U = 0 J.

The slope equals -1/(RC), so RC = 12.5 s and C = 12.5/150000 = 0.0000833 F.

[empty string]
```

Reproduce by passing each string and the named question's first part to `markPart` from `src/domain/marking.ts`. The offline marker currently combines keyword coverage and permissive numeric matching; full-credit reproduction of an authored answer has a separate equivalence path. Consequently, model-answer self-consistency cannot demonstrate reliable marking of independent answers, units, contradictions or partial methods. The marker was not retuned to these five examples.

## Evidence status and next external step

The refreshed export contains 224 Physics questions, two structurally complete internal statements, 115 remaining capability authoring briefs and 625 quality/review queue entries. Queue entries increased because the new drafts each still need human review. There are zero human-approved questions and 76 unreviewed prerequisite edges. The full-bank model-answer check reports 78 disagreements, unchanged; the new RC drafts add none. These are internal consistency observations only.

The existing intake workflow was re-exported with current fingerprints. It retains empty real-response, intervention and experiment files, and pending official-paper manifests. No synthetic probe was inserted into those files. Exact agreement, ±1 agreement, MAE, overmarking, undermarking and human-human agreement cannot be reported without actual independent human marks.

The next external action remains independent qualified review of the 14 energy prompts, then repair/re-review, collection of all response types, blinded double marking and adjudication. Paper and prerequisite approvals also remain pending. The offline report deliberately keeps those release gates closed.

Technical verification: all 50 tests in the eight focused Physics test files passed. Standard and strict TypeScript checks, zero-warning ESLint and the curriculum validator passed. The refreshed intake validator ran successfully and correctly reported `releaseReady: false`, seven blockers, zero marking rows, zero trusted papers and zero calibrated chains. No full-suite or browser validation was run for this content-only change.
