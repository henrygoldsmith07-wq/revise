# Physics evidence intake runbook

Revise now has a repeatable hand-off for the work that cannot be simulated in code: subject review, independent marking, paper authentication and learner outcomes. The hand-off is intentionally file based so a school or examiner can work offline and return an auditable export.

## Start a review drop

From the repository root:

```text
node scripts/create-physics-evidence-intake.mjs work/physics-evidence
```

The command creates a new folder and refuses to overwrite an existing one. It writes the full review and prerequisite queues, capability authoring briefs, empty marking/outcome/experiment files, and pending manifests for the two acquired official papers. The review packet includes current prompts, mark schemes, worked solutions, mappings and fingerprints. Nothing is approved by exporting it.

Start with `student-capacitor-energy.md`, `reviewer-capacitor-energy.md` and `pilot-review-packet.json`: fourteen original questions for the capacitor-energy capability, covering two alternatives per demand. This is a first content/marking trial, not a complete Physics bank or a validated efficacy assessment. Human reviewers must decide whether the families are meaningfully different; automated metadata counts cannot establish this.

Merge completed pilot review rows into the matching rows of `physics-review-packet.json` before running the validator. The validator returns an offline report; accepted reviews still need to be incorporated into the bank using the existing content-review workflow. It does not change the live student app.

### Question review

For every question, a qualified WJEC A-level Physics reviewer should:

1. solve the exact current prompt before reading the model answer;
2. check the physical assumptions, data and command word;
3. check each independently awardable mark and acceptable alternatives;
4. check the worked solution and misconception counterexamples;
5. verify each WJEC specification and smallest capability mapping;
6. judge whether the demand and context are exam realistic.

Fill `review.status`, all six `review.checks`, `reviewerId`, `reviewerRole`, `reviewerQualification` and `reviewedAt`. Keep the fingerprint unchanged. If the question changes, regenerate the packet and review the new fingerprint. `changes-requested` is preserved as a queue item; only a complete approved row can become trusted evidence.

### Prerequisite review

Review each row in `physics-prerequisite-review.json` as a conceptual dependency, not as a curriculum-order shortcut. Approve only when the rationale describes a real blocking relationship. The edge fingerprint covers both capabilities and the rationale, so editing either one invalidates the approval.

Record `reviewerRole` and `reviewerQualification` alongside the named reviewer/date. If a rationale is wrong, correct the graph and regenerate its packet before signing. Unreviewed edges remain hypotheses.

### Human marking corpus

Add anonymised student responses to `physics-answer-corpus.json`. The row must preserve the exact prompt, ordered mark points, maximum marks and specification version used by the current bank. Two qualified WJEC markers mark independently before seeing the other score; an adjudicator records the final decision without overwriting the two first-pass marks. Tag the required edge cases explicitly: method marks, equivalent algebra, significant figures, units, error carried forward, contradictory working, first incorrect step and borderline explanations. Internal or synthetic rows remain useful regression fixtures but cannot satisfy the calibration gate.

### Authenticated papers

Add one manifest per WJEC sitting to `physics-paper-manifests.json`. Record the official source URL, immutable source digest, paper and sitting IDs, series/year, specification version and the reviewer who checked the source and mark scheme. A verified manifest is required before extracted questions can contribute trusted paper evidence. The question importer can turn a verified manifest into per-question provenance with `paperProvenanceFromManifest`.

The first source acquisition is recorded in `docs/physics-paper-sources.json`: Summer 2024 Unit 3 (6 June, 135 minutes) and Unit 4 (13 June, 120 minutes), their mark schemes and data booklets. Source URLs came from the official WJEC catalogue; SHA-256 digests were computed from downloaded files. All manifests remain pending human review. Unit 4 totals 100 marks by combining the 80-mark core with **one** 20-mark option. Record the learner's prior exposure, actual active time, option and per-part marks; never infer first exposure from an empty local history alone.

Internal claim IDs are not official specification references. For this first authoring batch the board crosswalk is WJEC v3 October 2023, 4.1(b), (c), (g); synoptic discharge work also uses 4.1(j). The current 108 internal statements do not prove full official specification coverage.

### Learner outcomes

Append every observed intervention row to `physics-intervention-outcomes.json`, including measured minutes and support used. Keep failures, missing transfer and missing delayed retention. A row only calibrates durable gain after independent transfer in a different family and a delayed retention check at least seven days later.

`physics-experiment.json` is the prospective four-arm export. Use the same reviewed held-out assessment forms and human marking for adaptive Revise, weakest-topic-first, due-review-first and student-selected revision. The primary endpoint is delayed unseen marks gained per observed revision hour.

## Check the drop

```text
node scripts/validate-physics-evidence.mjs work/physics-evidence
```

The command writes `physics-evidence-report.json` with row-level errors, missing review work, quality queue counts, marking agreement, paper manifests, complete/incomplete intervention chains, experiment readiness and release blockers. Add `--strict` in CI when a non-ready drop should fail the job:

```text
node scripts/validate-physics-evidence.mjs work/physics-evidence --strict
```

The validator never mutates the source bank, manufactures human decisions or silently removes incomplete learner evidence. Keep the raw exports and reviewer consent/provenance with the report.

## First human collection session

1. A qualified Physics teacher solves the fourteen drafts, returns corrections and completes the six checks. Keep their actual identity and qualification in the review record; no AI-generated reviewer identity is acceptable.
2. After corrections are re-reviewed, invite consenting learners to attempt selected questions with their ordinary working. Retain anonymous participant codes, blank answers and incorrect attempts. Keep the identifying key with the school, outside the exported data.
3. Give the same responses and frozen rubrics to two qualified markers separately. Neither marker sees the other's score or Revise's score before completing their first pass. Record scores, rationale, first error and credit for subsequent correct method. Preserve crossed-out/contradictory working in the response transcription or accompanying scan.
4. An adjudicator resolves disagreements without replacing either original mark. Assemble the records in the existing answer-corpus format; tag only edge cases actually present. Check Revise-vs-human absolute error alongside human-vs-human disagreement. A small, narrow trial cannot validate the whole Physics marker.
5. Run the four-arm study only once reviewed baseline/training/held-out forms exist across distinct families and participants can be followed through the delayed assessment. Preregister assignment, assessment forms, observed-time measurement and dropout handling using `physics-validation-protocol.md`. The fourteen-question collection booklet is not itself a set of held-out study forms.

There are currently no supplied student responses, qualified human approvals or real trial outcomes. File validation checks shape and existing evidence rules; it cannot authenticate a person's identity, prove independent marking, or verify a declared baseline from a boolean alone. The study operator must preserve the source records supporting those declarations.
