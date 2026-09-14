# Physics coverage and deterministic validation

Checked against the current `main` seed bank on 14 September 2026.

The WJEC A-level Physics bank remains **108/108 specification statements** complete. It contains **1,629 questions and 1,706 mapped parts**. The depth audit still requires distinct recall, explanation, application, misconception, calculation/data, transfer and synoptic demands; question families retain their context and reasoning metadata. The bank is authored draft content: all 1,629 questions remain unreviewed and cannot create trusted mastery, transfer, retention or intervention evidence.

The correctness audit now reports semantic claim roles, checked-subset confidence and bank-wide coverage separately. On the current bank:

- **Structure:** 1,706/1,706 parts are indexed; there are 0 structural consistency errors and 0 total hard audit errors. The quality queue contains 1,637 authoring/review items, with 10 difficulty warnings and no duplicate-reasoning or transfer-novelty warnings.
- **Raw numerical claims:** 11,294 detected, 10,350 parsed, 746 verified, 10,548 unresolved and 0 claim errors (6.6% verified-claim coverage). Each numeric occurrence is retained; one checked equation cannot hide another value in the same part.
- **Derived-result claims:** 8,924 detected, 8,224 parsed, 726 verified, 8,198 unresolved and 0 errors (8.1% derived coverage). This metric excludes supplied data, constants and assumption/reference values so those do not make useful correctness coverage look artificially low. Graph-derived quantities are included with derived results.
- **Arithmetic:** 746/746 explicit equation checks pass. Precision-aware tolerances use requested significant figures, operand precision, exact coefficients and explicit approximation wording; the 2.5% fallback is reserved for genuinely approximate results.
- **Dimensional checks:** 6,523 unit-bearing candidates, 216 checked and verified, 6,307 unresolved, 0 errors (3.3% bank coverage). Symbolic Physics-law dimensions add 49/218 checked and verified, 169 unresolved, 0 errors. `dimensional` confidence describes checked comparisons; `dimensionalCoverage` describes how much of the bank was checked.
- **Scheme ↔ worked answer:** 1,557 union candidates, 247 matched and verified, 830 unmatched scheme quantities, 478 unmatched worked-answer quantities and 2 ambiguous pairings (15.9% pairing coverage, 0 mismatches). The union denominator prevents answer-only values from disappearing behind a maximum-count denominator. Ambiguous identities remain unresolved.
- **Physics-law validation:** 463 law cues, 51/51 numeric checks verified and 412 unresolved. Validators cover mechanics, circuits, power, resistivity, internal resistance, capacitors, waves, fields, decay, thermal physics, gases and quantum relations, including rearranged, chained, prose-embedded, superscript and explicit-multiplication forms. A label or formula regex alone never earns verification.
- **Plausibility:** 2,370 supplied-data/constant/assumption sanity checks produced 109 warning-only findings. These flag impossible scales, signs or dimensions for human review; they are not mathematical errors.
- **Prioritised review queue:** 11,865 items, ordered **derived final (3,430) → derived intermediate (4,768) → Physics law (412) → dimensional uncertainty (796) → supplied-data sanity (2,459)**. 1,015 parts require manual numerical review. The queue preserves individual claim IDs and statuses (`parsed`, `unresolved` or `error`).

Every deterministic comparison carries equation-level provenance: claim role and review priority, source values, parsed equation, recomputed result, authored result, author-facing units and canonical dimension, precision-derived tolerance and status. Scheme↔answer provenance records both quantities and keeps unmatched/ambiguous pairings visible. Symbolic dimensions are checked before numerical substitution where a relation is safely recognised. This is authoring evidence only; it does not replace qualified subject review.

The parser handles signed arithmetic, scientific notation, powers of ten, standard form, percentages, ratios, gradients, graph areas, half-life powers, SI prefixes, compound and reciprocal units, equivalent dimensions and rounded final answers. It keeps symbolic products out of the numeric path, localises safe chained calculations and leaves ambiguous working unresolved rather than guessing.

The review packet writes the per-part deterministic result, fingerprint, specification/capability mapping and six human-review checkboxes. Any content edit changes the fingerprint and requires fresh subject review. The evidence gate remains closed until qualified reviewers, authentic WJEC provenance, double-marked learner responses and delayed intervention outcomes exist.

## Verification

- `tests/physics-bank-audit.test.ts`: 14 tests passed, including semantic roles and derived coverage, provenance units, symmetric scheme↔answer pairing, plausibility warnings, symbolic dimensions, common-law rearrangements, superscript multiplication and adversarial arithmetic, powers of ten, gradients, percentages, half-life, standard form and unit mismatches.
- `tests/worked-solution-validation.test.ts`: 8 tests passed after aligning completed worked answers with their mark-scheme values.
- `npm run perf:physics-bank`: passed at 1,629 questions/1,706 parts; current run measured 1,810 ms bank audit, 36.8 ms short-history ranking and 198.4 ms long-history ranking. The report includes heap delta and serialized-bank size for regression tracking.
- `npm run type-check`, `npm run type-check:strict`, `npm run lint:check --silent`, `node scripts/validate-curriculum.mjs` and `npm run curriculum:freshness -- --fail-on-stale`: passed.
- `npm run build` and `npm run perf:budget -- --require-build`: passed on the current production bundle.
- Chromium persistence/offline/PWA regression: the focused persistence and offline specs pass with the Playwright worker set to 1. Serial browser execution avoids CPU contention during large IndexedDB hydration; Vitest remains parallel.
- The adversarial marking performance fence now retries only a slow first timing sample and keeps the best rate, so transient CPU contention does not look like an algorithmic regression while persistent slowdowns still fail.

The remaining manual-review and real-learner evidence work is deliberately visible in the export rather than being inferred from deterministic checks.
