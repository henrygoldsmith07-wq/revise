# Benchmarks — recommendation quality, marking and grades

Revise owns its claims with numbers. This doc records the harnesses, the invariants and the honest limits.

> **Live ledger:** the same harnesses run in the browser at [/benchmarks](/benchmarks) —
> `syntheticOutcomePairs` → `benchmarkRecommendationQuality` and
> `syntheticCalibrationOutcomes` → `calibrationReport`, with seed/n controls,
> so the page can never drift from the code. The [/case-study](/case-study) narrates
> the 6-engine design and links back here. See `src/app/benchmarks/page.tsx`.


## Recommendation quality (synthetic → real)

*Source:* `src/domain/recommender.ts` — `syntheticOutcomePairs`, `benchmarkRecommendationQuality`; `tests/recommender.benchmark.test.ts`.

- 400 deterministic synthetic learner states covering the product of urgency × weakness × forgetting × uncertainty × exam proximity × adaptive difficulty.
- Invariants pinned: urgency monotone in days-to-exam, weakness monotone in mastery, forgetting monotone in retention/days, uncertainty monotone in evidence, no duplicate keys, explanation present, total ordering.
- Outcome harness: `benchmarkRecommendationQuality(pairs)` reports `mae | bias | correlation | hitRate (±5 marks)` over `(predicted, actual)` pairs.
- Synthetic now via `syntheticOutcomePairs(seed, n, subjectId, topicIds)`; production replaces them with `(simulatePaper.predictedMarks, laterTimedPaper.actualMarks)`.
- Philosophy: rank by **marks per minute**, not popularity. Every candidate is scored as expected exam marks per minute; proximity and adaptive-difficulty are bounded multipliers (1.0–1.45 and 0.85–1.15) so no single factor dominates.

## Marking — rubric floor + AI vs human

*Source:* `src/domain/marking.ts`, `src/domain/maths-equivalence.ts`, `src/domain/working-analysis.ts`, `src/domain/remediation.ts`, `src/domain/human-marking-corpus.ts`, `src/domain/marker-disagreement.ts`, `src/domain/mark-escalation.ts`, `tests/marking.test.ts`, `tests/marking.benchmark.test.ts`, `tests/marker-disagreement.test.ts`, `tests/low-confidence-mark-escalation.test.ts`.

- Rubric: keyword + lemma overlap ≥50% per mark-scheme point or numeric match; 3-word cap, proportional award, strict about content, generous about wording.
- Symbolic layer (`maths-equivalence.ts`): when both the scheme point and the student's *final* expression parse as single-variable polynomials, equivalent forms credit (`(x+2)(x-3)` ↔ `x^2 - x - 6`) and a wrong pure expression is rejected even when it shares digits with the scheme. Unparseable or prose-embedded points fall through to the rubric unchanged.
- Working analysis (`working-analysis.ts`): splits the response into steps and reports the first step that diverges from the model working — an examiner's marginal note, available offline.
- Remediation (`remediation.ts`): matches missed points + first incorrect step against the topic's authored `commonErrors` and produces a targeted action (restudy the named key point, fix the specific slip, retry).
- Human marking corpus: version `2026.08.v1`, 12 teacher/examiner-labelled regression rows across chemistry and maths. `validateHumanMarkingCorpus` checks row IDs, part alignment and award ranges; no learner-identifying data is included.
- Benchmark harness: `scoreHumanMarkingCorpus` reports `exact-match accuracy`, `per-part MAE` and total MAE, with floors of exact-match ≥ 0.5 and MAE ≤ 0.8. The same rows will carry `aiAward` columns once provider marking exists.
- Marker disagreement tracking: `scoreMarkerDisagreement(corpus, { rubric, ai })` and the generic `trackMarkerDisagreement(samples)` compare marker award arrays per question part. Every pair (`human ↔ rubric`, `human ↔ ai`, `rubric ↔ ai`) reports compared rows/parts, total agreement, part agreement, MAE, disagreement count and signed bias (`right − left`). Missing marker arrays are `null`/unmeasured, never silently treated as zero.
- Low-confidence mark escalation: AI mark responses carry a validated `confidence` in `[0,1]`; below `0.60` the attempt stores a pending `human-review` escalation, with missing confidence treated as urgent. Rubric and offline fallback marks remain deterministic and are not escalated. `/progress` shows the durable pending queue and its AI-mark escalation rate.
- Delayed far-transfer retesting: `delayed-far-transfer.ts` only schedules a seven-day novel-context check after a non-provisional source mark reaches `0.80`; candidate selection prefers shared spec points/learning claims and excludes the original or already-attempted question. The retest has independent outcome evidence (`0.60` pass, `0.80` secure), persisted on the attempt link and surfaced in `/progress`.
- Exam technique vs knowledge separation: `techniqueVsKnowledge(mistakes)` reports the estimated lost-mark split, driver tags and a reliability flag (`≥8` mistakes and `≥10` lost marks). `/progress` turns it into a repair choice between timed paper practice and knowledge-gap review.
- Recall mastery: `computeRecallMastery` keeps card stability/current retrievability separate from exam marks, and reports observed recall, due pressure and evidence level per topic. `/progress` surfaces the overall recall score and weakest retrieval topics.
- Application mastery: `computeApplicationMastery` reports mark-weighted question performance while excluding active-recall and pending provisional attempts; ten eligible attempts make a topic reliable and `/progress` surfaces the weakest application topics.
- Mastery uncertainty: `masteryIntervals` reports a conservative Wilson 95% band from cards and weighted attempts, flags topics below eight weighted trials and widens conflicting card/mastery signals; `/progress` surfaces the six widest intervals.
- GCSE question expansion: `gcseExpansionQuestions` materialises 55 original checked templates into 220 board-specific questions, one for every GCSE topic across WJEC, AQA, Edexcel and OCR, with full mark schemes, model answers and spec-point anchors.
- Edexcel A-level content expansion: `edexcelExpansionQuestions` adds 55 original checked questions, one for every Edexcel A-level topic across biology, chemistry, mathematics and physics, with Edexcel topic/spec-point anchors.
- Data-question expansion: `dataExpansionQuestions` materialises 55 checked dataset-driven templates into 440 questions across all 32 board/qualification subjects, covering table reading, calculations, trends and experimental interpretation.
- Unfamiliar-context expansion: `unfamiliarContextQuestions` materialises 55 checked transfer templates into 440 questions across all 32 board/qualification subjects, covering novel biological, chemical, mathematical and physical scenarios.
- Authentic source-material expansion: `authenticSourceQuestions` materialises 55 checked original field-note, report, archive and technical-brief extracts into 440 questions across all 32 board/qualification subjects.
- `/benchmarks` renders the live corpus version, row-level human vs rubric totals and the same floor status used by CI.
- `/benchmarks` also renders the current pairwise disagreement matrix keyed by `questionId`; the internal corpus currently measures human ↔ rubric and leaves AI coverage explicitly unmeasured until provider-marked gold exists.
- UI labels every answer `rubric` vs `ai` so the student is never misled.

## Double-marked answer corpus

*Source:* `src/domain/double-marked-corpus.ts`, `src/components/DoubleMarkedCorpus.tsx`,
`src/app/answer-corpus/page.tsx`.

- `DoubleMarkedAnswer` stores the prompt, answer, maximum marks, two independent
  marker scores, provenance and an optional adjudicated score.
- `buildDoubleMarkedCorpusReport` reports exact agreement, within-one-mark
  agreement, mean absolute gap, normalised gap, marker bias and the pending
  adjudication count. Adjudication never overwrites the original pair.
- `/answer-corpus` accepts version-1 JSON exports, keeps invalid rows visible as
  import warnings, exposes a disagreement queue, and exports decisions again.
- The built-in rows are explicitly synthetic demonstrations. They are a UI and
  metric fixture, not teacher evidence; imported rows carry `provenance: imported`.

## Grade prediction & confidence calibration

*Source:* `src/domain/grades.ts`, `tests/grade-calibration.test.ts`.

- `predictGrade` blends measured accuracy and coverage; band + confidence, never a single letter.
- `calibrationReport(pairs)` computes Brier score, ECE, per-bucket `meanPredicted vs meanActual`, bias; well-calibrated is ECE < 0.08.
- `syntheticCalibrationOutcomes(seed, n)` benchmarks without real papers; production uses `(predictGrade.percent/100, laterPaperPercent/100)`.
- `calibrateFromHistory({ subjectId, pairs })` fits `slope/bias/mae` over ≥3 timed papers; thin-sample path returns identity.

## Curriculum regression

*Source:* `scripts/validate-curriculum.mjs`, `src/domain/content-review.ts`, `src/domain/curriculum-diff.ts`, `tests/coverage.test.ts`.

- Every topic has `specPoints` on every unit; every `specPointIds` is paired with `learningClaims`; stale topics (>365d) and unverified statements are surfaced by `regressionReport`.
- Spec-change diff tooling (`curriculum-diff.ts`): diff two snapshots of a subject's topics (old spec version vs new) and get added/removed/reworded spec points, key-point and common-error changes, plus the questions pinned to affected points — so a board revision is triaged instead of re-read. `recordedSpecVersionChanges` lists subjects whose manifest history spans multiple spec versions.
- CI gate: `node scripts/validate-curriculum.mjs` — 440 topics / 577 authored question templates today; the runtime bank materialises 1,595 GCSE, Edexcel A-level, data-question, unfamiliar-context and authentic-source expansion entries (8 boards×levels, tree-shakable modules).
- Visual regression: `e2e/visual.spec.ts` guards the Today shell (2% tolerance, `e2e/__screenshots__/`); update with `--update-snapshots`.


## Offline & sync invariants

*Source:* `src/data/sync.ts`, `tests/sync.test.ts`, `e2e/offline.spec.ts`.

- IndexedDB is the source of truth; Supabase is a replica drained via an outbox.
- Outbox batches per entity; last-write-wins per row on `updatedAt`; FSRS state resolves to the later review row.
- E2E smoke in `tests/sync.test.ts` covers onboarding → seed → due queue → grade → mistake loop without a browser; full Playwright offline harness in `e2e/offline.spec.ts` covers the same walk with a browser plus offline banner + keyboard (skip-link) + search overlay. CI runs it conditionally (see `.github/workflows/revise.yml`); the node smoke remains the gate when Playwright is not installed.

## Public ledger & portability

*Source:* `src/app/benchmarks/page.tsx` (`/benchmarks`), `src/app/case-study/page.tsx` (`/case-study`), `src/components/AppShell.tsx`, `src/domain/portability.ts`, `tests/phase8-public.test.ts`.

- `/benchmarks` recomputes the recommendation-quality + calibration reports live from CI's deterministic harnesses; real `(predicted, actual)` replaces synthetic with no page change.
- `/case-study` is a static narrative (scoring, FSRS, mastery, marking, mistake loop, grades) with the reproduce block so a reader can verify locally.
- `Settings → Data` offers `buildPortabilitySnapshot` (GDPR Art. 20, single JSON, scheduling intact) and `deletionPreview` + `privacyDisclosure` (Art. 17, local-only privacy). Pinned by 8 tests.

## Performance & security floors

*Source:* `tests/perf.test.ts`, `tests/security.test.ts`, `next.config.ts`, `public/sw.js`.

- Perf budgets: curriculum modules (≤100k) and domain files (≤120k) are size-capped; curriculum validation < 1.5s; build artifact < 80MB.
- Lighthouse/PWA fences: `next.config.ts` pins `/_next/static` immutable, `/api/*` no-store, `/sw.js` no-cache; `public/sw.js` precaches the app shell and never caches `/api/*`.
- Security: RLS enabled on every user-owned table (`with check user_id = auth.uid()`), plus `updated_at` trigger and hostile-import clamping (`deck-io`).

## Case studies (synthetic now, real cohorts later)

The product ships with synthetic longitudinal histories *and* a live ledger that makes them checkable at `/benchmarks`. Once timetabled-paper → later-paper outcomes exist, this section (and that page) will carry:

- Cohort: n, weeks, board, grade movement, MAE/bias/correlation before and after each engine change.
- The method will be the same harnesses above; numbers will be from observed `(predicted, actual)` rather than synthetic — same functions, real pairs.
