# Physics coverage and deterministic validation

Checked against the current `main` seed bank on 14 September 2026.

The Physics bank now has **108/108 specification statements** meeting the depth audit. It contains 1,629 Physics questions and 1,706 mapped parts. The completion packs cover the remaining statement cells with explicit recall, explanation, application, misconception, calculation/data, transfer and synoptic parts. Families carry their own context and reasoning move, so the authoring audit can reject repeated solution paths. This is authored draft content: all 1,629 questions remain unreviewed and cannot create trusted mastery, transfer, retention or intervention evidence.

The bank audit now reports separate claim coverage and checked-subset confidence. On the current bank:

- 1,706/1,706 parts are structurally indexed; there are 0 hard audit errors.
- The quality queue contains 1,637 actionable review/authoring items after the final distinctness pass; the duplicate-neutrino explanation was replaced with a genuinely different endpoint-energy interpretation.
- Numeric claims are counted individually across prompts, mark schemes and worked solutions: **5,155 detected, 1,345 parsed, 746 independently verified, 4,409 unresolved and 0 claim errors** (14.5% verified-claim coverage). A checked equation cannot hide another number in the same part.
- Every recomputed equation records source values, parsed equation, recomputed result, authored result, precision-derived tolerance and status. The report exposes equation coverage separately: **746/746 arithmetic checks pass**.
- Dimensional candidates, dimensional checks, verified checks, unresolved candidates and errors are separate fields: **2,611 dimensional candidates, 218/218 checks verified, 2,393 unresolved, 0 errors** (8.3% bank coverage). `dimensional` confidence describes checked comparisons; `dimensionalCoverage` describes how much of the bank was checked.
- Scheme↔worked-answer comparisons accept semantic prose labels, intermediate values and final quantities where the pairing is unambiguous: **1,226 candidates, 247 comparisons, 247 verified, 831 unresolved, 0 mismatches** (20.1% comparison coverage). Ambiguous pairings remain unresolved and do not establish Physics correctness.
- Physics-law candidates cover mechanics, circuits, waves, fields, capacitance, decay, thermal and quantum relations: **416 cues, 31/31 numeric checks verified, 385 unresolved**. A law cue is only counted as verified after the formula itself and a numeric substitution are independently recomputed with (where available) an expected-unit check; a bare quantity label or regex cue alone is unresolved.
- The export marks **1,013 parts** for manual numerical review; unmatched scheme↔answer quantities now create an explicit unresolved warning instead of disappearing from the queue.
- Tolerances derive from requested significant figures, operand precision, exact coefficients and explicit approximate wording. The old universal percentage is retained only as an explicitly approximate fallback.
- “Zero structural errors” is not presented as proof that the Physics is correct. Unresolved claims and unreviewed content remain manual-review work.

The deterministic parser handles signed arithmetic, scientific notation, powers of ten, standard form, percentages, ratios, gradients, graph-area expressions, half-life powers, SI prefixes, compound units, reciprocal units and ordinary rounded final answers. It keeps symbolic products such as `½ kA²` out of the numeric path, treats ambiguous working as unresolved, and audits every numeric clause independently. Unit dimensions include denominator inversion (`m/s`, `N/C`) and equivalent base-unit forms such as `N C⁻¹` and `V m⁻¹`. The audit does not promote a passing parse to human approval.

The Physics content corrections included in this milestone are:

- the ticker-tape item now states ten timer intervals per strip, giving 0.20 s per strip and 1.60 s for eight strips; its acceleration is 0.25 m s⁻²;
- the acceleration–time triangle uses its correct area of −2.0 m s⁻¹ and final speed of 12 m s⁻¹;
- the galvanometer calculation reports 4.2×10⁻² A (42 mA), matching its torque data;
- the ideal-gas amount calculation reports 97.9 mol for the stated 12 L, 2.0×10⁷ Pa and 295 K data;
- the RMS generator answer reports 2.36 A consistently with the scheme;
- stationary-wave content requires equal-amplitude coherent counter-propagating waves and states that ideal nodes have zero displacement.

The review export writes the per-part deterministic result, fingerprint, mapping and six human-review checkboxes into the Physics packet. Any content edit changes the fingerprint and therefore requires a fresh subject review. The evidence gate remains intentionally closed until qualified reviewers, authentic WJEC provenance, double-marked learner responses and delayed intervention outcomes exist.

## Verification

- `tests/physics-bank-audit.test.ts`: 10 tests passed, covering claim-level provenance, Physics-law recomputation and rearrangements, precision-aware tolerance, prose pairing and adversarial wrong arithmetic, powers of ten, gradients, percentage, half-life, standard form and unit/scheme mismatches.
- `tests/worked-solution-validation.test.ts`: 8 tests passed after aligning all newly completed worked answers with their mark-scheme values.
- Physics numerical focus: 10 bank-audit tests and 8 worked-solution tests passed, including the common-law rearrangement and claim-provenance fixtures.
- Full Vitest run: the repository's 186 passing files and 1 skipped file completed all substantive assertions; a 4-worker run exposed one timing-sensitive adversarial-performance assertion under parallel CPU contention (the isolated 11-test file passed). Vitest also emitted the known Windows worker `onTaskUpdate` timeout after assertions completed.
- `npm run build -- --webpack`: passed; `npm run perf:budget -- --require-build`: passed.
- `npm run perf:physics-bank`: passed at 1,629 questions/1,706 parts, approximately 1,098 ms bank audit and 177 ms long-history ranking on the final run (the 2,000 ms audit guard remains green).
- Chromium persistence/offline/PWA regression (`e2e/physics-persistence.spec.ts` and `e2e/offline.spec.ts`): 5 tests passed against the production server; the offline-banner case also passed when rerun with one worker after a two-worker hydration timeout.
- `npm run type-check`: passed.
- `npm run type-check:strict`: passed.
- `npm run lint:check --silent`: passed with zero warnings.
- `node scripts/validate-curriculum.mjs`: passed.
- `npm run curriculum:freshness -- --fail-on-stale`: passed, 32 specifications and 0 stale records.

The remaining manual-review and real-learner evidence work is deliberately visible in the export rather than being inferred from deterministic checks.
