# Physics depth expansion checked against current main

Base: `437cc9b3d41f629fb9facb7a446ba1d87a2a984d` (`Complete generator slip-ring and commutator coverage`), checked on 13 September 2026.

This change expands the WJEC A-level Physics authoring queue with explicit, reviewable question parts rather than bulk-generated number variants. The new packs cover 24 specification points across mechanics, circuits and fields, applied physics, and orbits and the universe. Each part records one demand, family, context, reasoning move, specification point and smallest mapped capability. The seven-demand audit requires two distinct families, contexts and reasoning paths per demand; the new packs pass that check.

The combined Physics audit reports:

- 1,088 Physics questions across the current seed bank;
- 108 grouped specification statements;
- 66 statements with complete and distinct recall, explanation, application, misconception, calculation/data, transfer and synoptic coverage (61.1%);
- 1,088 questions still unreviewed, because the new material is intentionally generated draft content;
- zero non-`unreviewed` quality issues for the new `physics-depth50` items;
- zero deterministic model-answer marking disagreements;
- zero redundant prerequisite edges and zero overbroad capability findings in the audit output.

The authoring metadata is a hard quality signal: value-stripped prompt signatures, reasoning-move overlap and solution-path similarity are checked before a demand is counted as distinct. The audit still leaves a draft in the review queue; it does not silently promote it to trusted evidence. A question must receive current six-check human approval before it can establish trusted mastery, transfer, retention or intervention-calibration evidence. Its fingerprint is carried by the existing review workflow, so changing the content requires a new approval.

Two physical-model inconsistencies in the existing depth pack were corrected while adding the coverage: the rocket-staging item now states a consistent isolated 900 kg stack and momentum calculation, and the household ring item now describes equal parallel 20 m paths with a consistent equivalent resistance and current. The model-answer/mark-scheme audit was also repaired for 14 existing reasoning-depth items, including Faraday/Lenz, Hall effect, microscopic magnetic force, SHM, collision energy, nuclear density, kinetic theory, centre of mass and transformer loading.

The evidence validator remains deliberately non-release-ready: there are no approved questions, no independently double-marked student responses, no trusted past-paper manifests and no calibrated intervention chains. It reports seven blockers and an enrolling experiment state. Those missing external data are not fabricated by this change.

## Verification

- Physics/adaptive focused tests: 5 files, 54 tests passed.
- Content, schema, coverage, worked-solution and benchmark tests: 5 files, 66 tests passed.
- Full non-adversarial unit suite (serial worker): 184 files passed, one skipped; 1,535 tests passed, two skipped; clean exit.
- Adversarial marking assertions: all 11 assertions passed in CI mode. The Windows runner then reported its existing Vitest `onTaskUpdate` worker timeout after the long benchmark; the assertions themselves passed.
- TypeScript, strict TypeScript, lint with zero warnings, curriculum validation and freshness checks: passed (32 specifications, zero stale records).
- Production Webpack build: passed.
- Client performance budget: passed (initial 539,048 raw / 165,120 gzip; transformers 389,307 / 107,830; WebLLM 6,041,335 / 2,141,278; ONNX 512,655 / 147,319; KaTeX 263,937 / 76,353).
- Chromium production browser checks: 4 of 4 passed for adaptive session, AI marking fallback, Physics persistence/reload and offline/PWA flow.

The next evidence milestone is qualified review of the expanded Physics packs followed by real anonymised responses, independent double marking and adjudication. Until then the drafts remain useful practice material but cannot produce trusted validation evidence.
