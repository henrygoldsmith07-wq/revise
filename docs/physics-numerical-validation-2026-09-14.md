# Physics coverage and deterministic validation

Checked against the current `main` seed bank on 14 September 2026.

The Physics bank now has **108/108 specification statements** meeting the depth audit. It contains 1,629 Physics questions and 1,706 mapped parts. The completion packs cover the remaining statement cells with explicit recall, explanation, application, misconception, calculation/data, transfer and synoptic parts. Families carry their own context and reasoning move, so the authoring audit can reject repeated solution paths. This is authored draft content: all 1,629 questions remain unreviewed and cannot create trusted mastery, transfer, retention or intervention evidence.

The bank audit now reports separate confidence for structural, numerical and dimensional checks. On the current bank:

- 1,706/1,706 parts are structurally indexed; there are 0 hard audit errors.
- The quality queue contains 1,637 actionable review/authoring items after the final distinctness pass; the duplicate-neutrino explanation was replaced with a genuinely different endpoint-energy interpretation.
- 630 equation chains are recomputed and 630 pass the deterministic arithmetic check.
- 20 dimensional chains are checked and 20 pass; incompatible unit dimensions are hard errors.
- 308 common Physics-rule cues are detected for review coverage (mechanics, circuits, waves, fields, capacitance, decay, thermal and quantum relations).
- 621 parts contain numbers without a safe equation parse and are explicitly marked for manual numerical review.
- 0 direct scheme↔worked-answer quantity comparisons are available in the current bank; the adversarial suite proves that mismatched values or units are caught when both are stated as direct assignments.
- The resulting confidence is structural `checked`, numerical `partial` and dimensional `verified`. “Zero structural errors” is not presented as proof that the Physics is correct.

The deterministic parser handles signed arithmetic, scientific notation, powers of ten, standard form, percentages, ratios, gradients, graph-area expressions, half-life powers, SI prefixes, compound units, reciprocal units and ordinary rounded final answers. It keeps symbolic products such as `½ kA²` out of the numeric path, treats ambiguous working as unresolved, and compares scheme values with worked answers only when a direct assignment is unambiguous. Unit dimensions include denominator inversion (`m/s`, `N/C`) and reciprocal wavelength-style quantities. The audit does not promote a passing parse to human approval.

The Physics content corrections included in this milestone are:

- the ticker-tape item now states ten timer intervals per strip, giving 0.20 s per strip and 1.60 s for eight strips; its acceleration is 0.25 m s⁻²;
- the acceleration–time triangle uses its correct area of −2.0 m s⁻¹ and final speed of 12 m s⁻¹;
- the galvanometer calculation reports 4.2×10⁻² A (42 mA), matching its torque data;
- the ideal-gas amount calculation reports 97.9 mol for the stated 12 L, 2.0×10⁷ Pa and 295 K data;
- the RMS generator answer reports 2.36 A consistently with the scheme;
- stationary-wave content requires equal-amplitude coherent counter-propagating waves and states that ideal nodes have zero displacement.

The review export writes the per-part deterministic result, fingerprint, mapping and six human-review checkboxes into the Physics packet. Any content edit changes the fingerprint and therefore requires a fresh subject review. The evidence gate remains intentionally closed until qualified reviewers, authentic WJEC provenance, double-marked learner responses and delayed intervention outcomes exist.

## Verification

- `tests/physics-bank-audit.test.ts`: 5 tests passed, including adversarial wrong arithmetic, powers of ten, gradients, percentage, half-life, standard form and unit/scheme mismatches.
- `tests/worked-solution-validation.test.ts`: 8 tests passed after aligning all newly completed worked answers with their mark-scheme values.
- Physics, marking and worked-solution focus suite: 19 tests passed.
- Full serial Vitest suite: 186 files passed, 1 skipped; 1,551 tests passed, 2 skipped.
- `npm run build -- --webpack`: passed; `npm run perf:budget -- --require-build`: passed.
- `npm run perf:physics-bank`: passed at 1,629 questions/1,706 parts, 438 ms bank audit and 148 ms long-history ranking.
- Chromium persistence/offline/PWA regression (`e2e/physics-persistence.spec.ts` and `e2e/offline.spec.ts`): 5 tests passed.
- `npm run type-check`: passed.
- `npm run type-check:strict`: passed.
- `npm run lint:check --silent`: passed with zero warnings.
- `node scripts/validate-curriculum.mjs`: passed.
- `npm run curriculum:freshness -- --fail-on-stale`: passed, 32 specifications and 0 stale records.

The remaining manual-review and real-learner evidence work is deliberately visible in the export rather than being inferred from deterministic checks.
