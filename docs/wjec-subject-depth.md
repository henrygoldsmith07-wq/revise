# WJEC Maths, Biology and Chemistry depth

This change extends Physics's existing evidence rules and content-review workflow to WJEC A-level Maths, Biology and Chemistry. It adds 84 original AI-authored drafts, with two deeply covered internal capabilities per subject. It does **not** establish whole-specification depth, human-reviewed content, marking validity or improved exam performance.

## Content added

| Subject | New questions | Focus | Internal statements with draft alternatives | Capability nodes across the subject |
| --- | ---: | --- | ---: | ---: |
| Maths | 28 | Calculus applications; conditional probability | 2 of 87 | 90 |
| Biology | 28 | Enzyme-rate reasoning; osmosis and water potential | 2 of 114 | 117 |
| Chemistry | 28 | Titration analysis; equilibrium calculations | 2 of 108 | 111 |

Each focus has two question families across recall, explanation, application, misconception, calculation/data, transfer and synoptic demands. Every new part has a rubric, a worked solution, one internal specification mapping, one capability mapping and a stated reasoning operation. The authoring helper only formats content; it does not generate variants. Mathematical modelling, controlled experiments, practical uncertainty and unfamiliar supplied relationships are included where appropriate.

Calculus questions require domain and endpoint checks, interpret rates and units, and distinguish tangent and normal gradients. Conditional-probability questions change the information structure: subgroups, sampling without replacement, reporting protocols, hidden sources and pooled versus conditional rates. Biology questions distinguish saturation from substrate depletion, assay duration from an intrinsic optimum, and water-potential gradients from solute concentration alone. Chemistry questions include aliquot scaling, two endpoints, hydration, residual reagent, pressure constraints and unphysical equilibrium roots.

The full bank currently contains 162 Maths, 169 Biology and 162 Chemistry questions. These totals include older items that still need repair. The initial complete-bank model-answer self-check found 65, 105 and 86 disagreements respectively. The new 84 model answers are all reachable by the marker; that is a software consistency check, not independent marking validation. The existing Physics marking defects and general free-text marking limitations are not solved by adding content.

## Board crosswalk and scope

The current curriculum uses internal grouped statements. Their IDs and counts do not establish one-to-one official coverage. Several historical displayed board references need editorial correction; review the official sources below rather than assuming an internal `sp-03` means an official part (c).

- [WJEC Mathematics specification](https://www.wjec.co.uk/media/lm3fegtu/wjec-gce-maths-spec-from-2017-e.pdf): differentiation in 2.1.7 and 2.3.6, conditional probability in 2.4.1. The new material draws on these areas; some harder tasks combine modelling and other supporting skills.
- [WJEC Biology specification](https://www.wjec.co.uk/media/gcgjtvqj/wjec-gce-biology-spec-from-2015.pdf): cell membranes and transport in Unit 1 section 3, enzyme activity in Unit 1 section 4, particularly 1.4(g), with related specified practical work. Pressure-balance and unfamiliar assay questions need reviewer judgement about demand and supplied information.
- [WJEC Chemistry specification](https://www.wjec.co.uk/media/akbbkvwh/wjec-gce-chemistry-spec-from-2015.pdf): titration in 1.7(f), including back/double titration practicals; equilibrium concentrations in 1.7(c), with Kc/Kp calculations and changing temperature in 3.8. Calculation conventions and assumptions are stated explicitly in the new items.

These are AI source checks, not examiner or teacher approval. Reviewers must independently solve each exact item and assess correctness, assumptions, command words, scheme, solution, mappings, demand and exam realism. New questions are not claimed to be past-paper questions or reviewed held-out assessments.

## Capability and evidence changes

Every internal statement in the three subjects now has a stable capability node, in addition to the original fine-grained nodes. Existing IDs are preserved; the legacy stationary-point node is corrected to the classification statement rather than the broader applications statement. Grouped nodes remain coarser than a fully reviewed diagnostic graph.

Eighteen proposed conceptual dependencies connect the necessary ideas, including concentration to equilibrium expressions, membrane transport to chemiosmosis and differentiation to kinematics. They have explicit rationales and no human approval. Missing edges mean an unresolved graph-authoring gap, not a claim that no prerequisites exist. Trusted diagnosis and the student-facing topic projection require current edge fingerprints and reviewer attestations.

All four WJEC flagships now use the existing six-check question approval and fingerprint contract. Draft answers can support practice but cannot establish trusted mastery, transfer, delayed repair or intervention calibration. The same restriction follows evidence into readiness, paper outcomes and experiment calculations. Paper-mode flags alone do not authenticate performance. Historical unknown-question evidence is treated conservatively rather than silently grandfathered into trusted results.

This may reduce previously displayed evidence, mastery or readiness for these subjects. That reflects the removal of unsupported trust, not loss of the learner's stored attempts. No review approval is fabricated, and no learner history is deleted. No new mastery model, store, dashboard or student navigation was added.

## Review collection

From the repository:

```text
node scripts/wjec-content-review.mjs export <new-directory>
node scripts/wjec-content-review.mjs check <returned-directory>
```

Export refuses an existing directory. Each subject folder contains a student booklet, a separate marking booklet for the 28 new drafts, an exact-fingerprint draft packet, the full content and prerequisite packets, a quality audit, authoring briefs and model-answer self-checks. A reviewer should solve the student version before opening the marking version.

Review returned rows in `new-draft-review.json`, then merge them into the matching rows in `content-review.json`. The check command requires qualified reviewer details for approval, detects edits, rejects mismatched subjects and produces proposed checked records. It does not alter the application or publish approvals. Source changes require a fresh export and a new review of the changed fingerprint.

The underlying Physics-named APIs and `physics-review-v2` fingerprint prefix remain for backward compatibility. A subject parameter selects the Maths, Biology or Chemistry packet. This reuses the existing contract instead of creating a parallel trust system. Physics's separate marking-corpus, paper-source acquisition and experiment intake files remain Physics-specific; they are not evidence for these three subjects.

## Remaining validation work

All new questions are unreviewed. Existing content, mappings and family assignments also need subject review; an automated duplicate check cannot establish genuinely different reasoning. Distinct contexts are not automatically transfer, and no new draft has been designated as a trusted delayed-retention form.

No real student responses, independent marker judgements, adjudications, authenticated new subject papers or learner efficacy results were obtained. The next work is to review the first two capability packs per subject, repair flagged items, then collect complete response distributions and independent marking. Keep intervention priors conservative until real baseline, observed time, independent transfer and delayed retention are available. The four-arm efficacy comparison cannot be claimed from these software checks.

## Software checks

Strict TypeScript and zero-warning lint checks passed. The complete regression run passed 1,505 tests, skipped two, and failed one wall-clock marking performance check (336 ms/case against 250 ms/case). An isolated rerun passed all 32 assertions in the marking and subject-expansion suites, including the unchanged performance limit, but exited unsuccessfully with a Vitest worker communication timeout; it was not a clean passing run. The subject-expansion suite had also passed separately without runner errors. These timing results do not establish learner efficacy or human marking agreement. The review-pack import reported no errors and zero human approvals for all three subjects.

Recheck on 2026-09-11: strict TypeScript and zero-warning lint passed again; current-fingerprint review imports still have no errors and no approvals. The targeted JSON report records all 32 assertions passing (including the original marking speed budget), but the process returned exit code 1. Following the previously observed worker timeout, the runner exit remains unresolved; the successful assertion counts must not be reported as a clean test run. No timeout or performance limit was relaxed.

## Local main integration

The subject upgrade was isolated from the separate uncommitted Physics work before integration. Its staged snapshot passed strict TypeScript and all 164 targeted tests across content, subject quality, the durable learning loop, prerequisite diagnosis, paper selection and grade calibration. The broader benchmark figures above describe the earlier combined working tree, not this isolated snapshot.
