# Physics changes checked against main

Base: GitHub `origin/main` at `b1c17bc6c1c0500541144ab6d146c989e2616af4`, verified using `git ls-remote` on 13 September 2026. The branch includes this main commit.
Worktree branch: `codex/physics-completion`.

## Changes beyond that base

- 28 original motion-graph drafts: 14 assess gradient interpretation and 14 assess signed-area reasoning. Each skill has two questions for each of recall, explanation, application, misconception, calculation/data, transfer and synoptic demand.
- Two specific capability nodes distinguish gradient/sign interpretation from integration/initial conditions. Existing stable capability IDs remain available for historical records. No unreviewed prerequisite becomes an established diagnosis.
- Freshness uses family, context and authored reasoning moves. Changing a question-level context cannot hide a part's previous context. Exposure includes supported and draft attempts, and specification overlap preserves exposure across capability splits.
- Transfer and retention chains check their stored question identities even with partial attempt history. Rehearsal cannot become transfer through a fallback. Uncertain or draft practice restarts the retention interval without advancing repair.
- Paper exposure accounts for previously practised families outside that paper's sitting history.
- Numeric accuracy rules keep unsupported intermediate algebra provisional; a correct final number cannot override an explicitly incorrect evaluated expression.
- Physics no longer loses a mark just because a correct answer uses the rubric's vocabulary. Recorded support still determines independence. Explicitly reversed negation is checked separately. The simple-unit result guard does not mistake speed or area units for length.
- Repaired 22 model-answer disagreements in main's new reasoning-depth pack, including incorrect physical assumptions and results. The pack is explicitly labelled generated/unverified with no reviewer or approval.
- Audited main's magnetic-flux and induced-emf additions with the same deterministic probes; no model-answer disagreement was reported.

Main already contained the zero-exponent parser repair, scientific notation support, chained-working parsing, reasoning-signature selection, curated Physics mappings and removal of three redundant prerequisite edges. Those changes were retained. Main's new Physics depth additions, including its projectile, energy, orbital and medical-physics coverage, are included in the combined audit, not counted as questions added by this change.

## Marking failure audit

These are synthetic regression probes, not independently human-marked responses.

| Probe | Required result | Repair |
|---|---:|---|
| Capacitor bank selection using required voltage instead of maximum energy | 3/3 | Accept the valid alternative decision argument; retain the exact selected-bank identity. |
| Voltage inferred with U/Q instead of 2U/Q | 1/3 | Shared input numbers cannot earn the voltage accuracy mark; retain the explicitly allowed capacitance follow-through. |
| Zero net charge incorrectly claimed to imply zero stored energy | 0/3 | Zero cannot match a small non-zero energy through shared vocabulary. |
| Correct final number after unsupported algebra | Provisional | Do not confidently infer the validity of an unrecognised intermediate expression. |
| Equivalent standard-form statements | No invented contradiction | Preserve exponent notation when analysing working. |
| Cable diameter from the area ratio, without calculating absolute area | 3/3 | State that the original cable is at breaking stress; accept the square-root diameter ratio. |
| Rope extension incorrectly reported as 1.14 m | Withhold result point | The ideal energy equation gives 1.242 m; 1.2 m is accepted at two significant figures. |

The 22 disagreements were inspected individually. Common defects were more awardable scheme entries than available marks, redundant points, missing worked steps and inaccurate prose. Corrections cover drag, material properties and elastic work, interference, radians, decay, precision, forces, circular motion, magnetic motion, latent heat, capacitor geometry/series circuits, X-rays, CT and MRI timing. The cable question lacked its starting-stress assumption; the rope answer used the wrong quadratic root value. The trampoline item was rewritten around explicit loading/unloading data because its original height-to-energy argument was incorrect. Two nearby decay-solution defects were also corrected: e^-1 leaves approximately 37%, and activity is measured in Bq.

These repairs improve internal consistency; they do not establish the correctness of every draft. In particular, a model-answer equality shortcut is a software contract, not independent validation. The generic fallback marker still has limitations with unfamiliar prose, compound units and unstructured working; it cannot substitute for the requested human marking corpus.

The capacitor-reactance item's structured rules assigned an accuracy rule to a method point and a unit rule to a numerical-result point. That inconsistent rule set was removed. Its existing written rubric remains a practice fallback; a reviewed method rubric and independent answers are still required before claiming marking validity.

## Content evidence and remaining work

The refreshed audit against current main reports 621 Physics questions, 108 internal grouped specification statements, 31 statements meeting the audit's demand-coverage criterion, 87 outstanding capability authoring briefs and 719 queue items. All 621 questions remain unreviewed. The queue includes review work, so adding drafts can increase its size. Correcting an item's demand or reasoning description can also reveal a previously hidden gap.

Model-answer marking disagreements: zero. Redundant prerequisite edges: zero. Neither result establishes agreement with qualified examiners, correct prerequisite rationales or complete official specification coverage.

Running `node scripts/validate-physics-evidence.mjs outputs/physics-b1c17bc-audit` produces a non-release-ready report with seven blockers: all 621 questions await approval; 89 prerequisite edges remain hypotheses; demand/family coverage is incomplete; the external double-marked corpus, trusted WJEC paper manifests, measured transfer/retention chains and four-arm efficacy evidence are absent. The report is written to `outputs/physics-b1c17bc-audit/physics-evidence-report.json` and preserves those gates rather than manufacturing evidence.

The graph drafts use the [WJEC A200QS specification, version 3](https://www.wjec.co.uk/media/gxbjl243/wjec-gce-physics-spec-from-2015-e-22-09-22.pdf), Unit 1.2 Motion, as their subject reference. The repository's `kinematics-dynamics.sp-02` is an internal grouped identifier, not a claim about the exact official subparagraph numbering.

Medical-physics explanations were cross-checked against primary educational references: [AAPM/RSNA on X-ray production](https://pubmed.ncbi.nlm.nih.gov/9225393/), [NIBIB on CT reconstruction](https://www.nibib.nih.gov/science-education/science-topics/computed-tomography-ct), and [NIBIB on MRI and motion](https://www.nibib.nih.gov/science-education/science-topics/magnetic-resonance-imaging-mri). This is an automated source check, not qualified human approval.

No human approvals, student answers, examiner judgements or efficacy outcomes were fabricated. The complete-Physics milestone remains open.

## Verification

Verification results are recorded after checking the combined main-plus-changes tree. The normal Turbopack build cannot use this worktree's dependency junction because its target is outside the inferred root; production browser checks use Next's Webpack build with the same application source.

- Unit suite excluding the separately run adversarial benchmark on b1c17bc: 184 test files passed, one skipped; 1,535 tests passed, two external staging tests skipped; clean exit. One worker and a 60-second per-test timeout accommodate the property tests on this machine. Assertions and performance limits were not relaxed.
- The nine functional adversarial marking assertions (including nonsense, off-topic fluency, keyword stuffing, retractions, partial reasoning, equivalent notation and mutation fences) passed on b1c17bc. The two expensive deterministic/performance cases remain separately timed because the benchmark constructs a 21-category sample at module load.
- Full-project TypeScript, the repository's additional strict TypeScript configuration, lint with zero warnings, curriculum validation and freshness checks: passed. Freshness checked 32 specifications with zero stale records.
- Audit output: `outputs/physics-b1c17bc-audit` in the parent task workspace. It contains current question fingerprints, review packets, prerequisite review rows and the capability authoring queue; it creates no approvals.
- Production Webpack build: passed. Client performance budget: passed (initial route 539,056 raw / 165,191 gzip; optional transformer 389,306 / 107,827; WebLLM 6,041,335 / 2,141,278; ONNX 512,654 / 147,311; KaTeX 263,937 / 76,353).
- Chromium browser suite against the rebuilt production server: 28 passed, one visual test skipped because no baseline snapshot exists. This includes the Physics persistence test, AI failure fallback, adaptive session, mobile/PWA and offline flows. Firefox/WebKit were attempted but the installed runner could not create browser contexts on this Windows host (`browserContext.newPage`); that is an environment limitation, not a product pass claim.
- After b1c17bc, a rebuilt-production targeted Chromium run passed adaptive session, AI fallback/escalation and Physics answer persistence through reload and offline PWA (4/4).
- The adversarial benchmark's default local performance assertion is sensitive to this shared Windows host: clean runs measured 251.9–331.4 ms per generated case against the 250 ms nominal limit. The existing CI contention allowance is 400 ms, and the current CI-mode performance assertion passed. Its harness timeout is now 120 seconds so the assertion can report on a loaded worker rather than failing first; this does not change the performance limit. Local performance remains a follow-up investigation rather than evidence of a marking-quality failure.
