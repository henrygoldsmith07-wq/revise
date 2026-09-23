# Physics depth expansion checked against current main

Base: `0f2ee1b7f65f79df34b6bd428168ad288749a1e0` (`Complete potential-divider skill node coverage`), checked on 13 September 2026.

This change expands the WJEC A-level Physics authoring queue with explicit, reviewable question parts rather than bulk-generated number variants. Current main already contains the explicit potential-divider skill-node pack; five additional topic-split packs add 20 statement-level depth sets across mechanics, energy, materials, waves, quantum physics, fields and AC. Each part records one demand, family, context, reasoning move, specification point and smallest mapped capability. The seven-demand audit requires two distinct families, contexts and reasoning paths per demand; the completed statement cells pass that check.

The combined Physics audit reports:

- 1,335 Physics questions across the current seed bank;
- 108 grouped specification statements;
- 87 statements with complete and distinct recall, explanation, application, misconception, calculation/data, transfer and synoptic coverage (80.6%);
- 1,335 questions still unreviewed, because the new material is intentionally generated draft content;
- zero non-`unreviewed` quality issues across the Physics bank;
- zero deterministic model-answer marking disagreements;
- zero redundant prerequisite edges and zero overbroad capability findings in the audit output;
- zero hard bank-consistency errors; the deterministic bank audit reports 22 review warnings, 10 difficulty-calibration warnings, no duplicate-reasoning pairs and no transfer-novelty warnings after the current similarity gate (1,412 precomputed profiles, 933 within-capability comparisons, under 0.4 seconds in the export).

The authoring metadata is a hard quality signal: value-stripped prompt signatures, reasoning-move overlap and solution-path similarity are checked before a demand is counted as distinct. The audit still leaves a draft in the review queue; it does not silently promote it to trusted evidence. A question must receive current six-check human approval before it can establish trusted mastery, transfer, retention or intervention-calibration evidence. Its fingerprint is carried by the existing review workflow, so changing the content requires a new approval.

Two physical-model inconsistencies in the existing depth pack were corrected while adding the coverage: the rocket-staging item now states a consistent isolated 900 kg stack and momentum calculation, and the household ring item now describes equal parallel 20 m paths with a consistent equivalent resistance and current. The model-answer/mark-scheme audit was also repaired for the existing reasoning-depth items, including Faraday/Lenz, Hall effect, microscopic magnetic force, SHM, collision energy, nuclear density, kinetic theory, centre of mass, transformer loading and the newly added calculation packs. Every authored part now has an equal mark count and mark-scheme point count in the automatic consistency check.

The bank audit is intentionally conservative. It catches explicit in-item conflicts in supplied constants, sign conventions, notation, definitions, assumptions and physical models; compares mark-scheme and reasoning signatures within a capability; and flags difficulty or transfer anomalies for editorial review. It does not infer a contradiction from ordinary equations or from a valid explanation of a neglected mechanism.

The evidence validator remains deliberately non-release-ready: there are no approved questions, no independently double-marked student responses, no trusted past-paper manifests and no calibrated intervention chains. It reports seven blockers and an enrolling experiment state. Those missing external data are not fabricated by this change.

## Verification

- Physics/content focused suite (including bank audit, quality, marking, coverage and worked solutions): 20 files, 168 tests passed.
- Bank and worked-solution smoke tests: 2 files, 11 tests passed.
- Full non-adversarial unit suite (serial worker): 185 files passed, one skipped; 1,538 tests passed, two skipped. All assertions completed; the default Windows Vitest worker then exited with its known `onTaskUpdate` heartbeat timeout after the long run.
- Adversarial marking assertions: all 11 assertions passed in CI mode with a clean exit.
- TypeScript, strict TypeScript, lint with zero warnings, curriculum validation and freshness checks: passed (32 specifications, zero stale records).
- Production Webpack build: passed.
- Client performance budget: passed (initial 539,048 raw / 165,120 gzip; transformers 389,307 / 107,830; WebLLM 6,041,335 / 2,141,278; ONNX 512,655 / 147,319; KaTeX 263,937 / 76,353).
- Physics bank benchmark: 1,335 questions / 1,412 profiles; profile indexing 144 ms, full audit 269 ms, fresh ranking 36 ms and a 2,000-attempt history 153 ms; serialized question payload 2.77 MB. The benchmark is repeatable with `npm run perf:physics-bank` and uses the same precomputed profile index as the export.
- Chromium production browser checks: 4 of 4 passed for adaptive session, AI marking fallback, Physics persistence/reload and offline/PWA flow.

The next evidence milestone is qualified review of the expanded Physics packs followed by real anonymised responses, independent double marking and adjudication. Until then the drafts remain useful practice material but cannot produce trusted validation evidence.
