# WJEC flagship depth milestone

The next content cycle is balanced across WJEC A-level Maths, Biology and Chemistry. Physics remains frozen at its existing 108/108 depth coverage; this change adds no Physics questions.

The new pack is deliberately draft material. Every question is labelled `source: generated` and `verification: unverified`, so it can appear in practice while remaining excluded from trusted mastery, transfer, delayed-retention and calibration evidence. A reviewer must solve the exact fingerprint and approve all six existing checks before any item can become trusted.

## Current inventory

The pack contains two route questions per statement. The routes carry separate family, context and authored reasoning metadata and exercise all seven demand cells: recall, explanation, application, misconception, calculation/data, transfer and synoptic. Every part now carries an explicit `learning.quality` state. Only `substantive` parts can contribute to deep completion; a missing or `scaffold` value is an authoring gap even when the structural seven-demand cells are present. The strict audit also rejects placeholder phrases, missing data, method-only solutions and demand-inappropriate evidence before counting a cell. The existing route audit rejects a pair when its family, context, authored operation or solution path is not distinct.

| Subject | New draft questions | New statements | Combined deep statements | Curriculum statements | New parts |
| --- | ---: | ---: | ---: | ---: | ---: |
| Maths | 40 | 20 | 22 | 87 | 280 |
| Biology | 36 | 18 | 20 | 114 | 252 |
| Chemistry | 40 | 20 | 22 | 108 | 280 |

The combined counts include the earlier quality packs for each subject. They are a substantive authoring measure, not a claim that the unreviewed drafts are exam-valid. `auditFlagshipSubject` returns `repairQueue` entries for every rejected part and every incomplete capability/demand cell, with the exact reason and severity so authors can repair the bank instead of inflating the headline count.

## Shared audit

`src/domain/subject-assessment-audit.ts` runs the existing seven-demand assessment audit for any WJEC flagship and adds a shared substantive gate plus conservative subject checks:

- Shared gate: explicit substantive metadata, standalone prompts, supplied data/context, a subject command, concrete mark points, worked intermediate/result evidence and demand-specific proof. Placeholder/meta wording (for example “appropriate method”, “stated value”, “trace … to the target” and uninstantiated invariants) is surfaced as a repair issue and excluded from non-Physics depth.

- Maths: algebraic identities, roots, graph transformations, vectors, probability, SUVAT and inline means are recomputed where the notation is unambiguous; domain restrictions, exact-form requests and missing symbolic calculus results remain review warnings when they cannot be proved automatically.
- Biology: unqualified increase/decrease contradictions are errors; causal chains, practical controls, variables, uncertainty and data comparisons are surfaced as review warnings.
- Chemistry: parseable equations are atom/charge-balanced with the existing deterministic balancer; stoichiometric/titration amounts, oxidation states, pH, units, precision and equilibrium expressions are checked conservatively.

`buildFlagshipDepthDashboard` is an internal authoring report. It shows statements, deep-complete statements, demand completion, draft/trusted counts, structural issues, subject correctness issues and marking-disagreement counts for each supplied curriculum. It does not add a student-facing dashboard or a new mastery model.

The dashboard must be read with the trust state and repair queue. A row can be substantively complete while still having unresolved subject warnings and zero approved questions. Draft rows can support practice, but no unreviewed question can establish trusted mastery, transfer, delayed retention or calibration evidence. `repairQueue` is intentionally visible only to authoring/reporting code; the student surface remains the single next action.

## Review path

Use the existing WJEC review packet workflow for the generated questions. It already preserves the content fingerprint, reviewer qualification, six checks and edit invalidation for all four WJEC flagships:

```text
node scripts/wjec-content-review.mjs export <directory>
node scripts/wjec-content-review.mjs check <directory>
```

Review the student booklet before opening the marking booklet. Repair any subject-audit issue, re-export the changed fingerprint and keep the item untrusted until a qualified reviewer signs the new version. No approval, real student response, human marking comparison or intervention outcome is fabricated by this milestone.

## Verification commands

The focused regression suite is:

```text
npm test -- --run tests/subject-assessment-audit.test.ts tests/wjec-subject-quality.test.ts
npm run type-check
npm run type-check:strict
```

The focused tests assert at least twenty deep statements for every non-Physics flagship, preserve draft-only trust, and seed adversarial Maths, Biology and Chemistry defects that the subject checks must catch. Full production QA remains the release gate.
