# Revise — revision that knows what to do next, and says when it cannot prove it.

> Revise — WJEC A-level revision that tells you the one thing to do next. Four subjects authored to their specification, FSRS scheduling, examiner-style marking, and honest coverage: nothing counts as evidence until two people have reviewed it.

Canonical: https://revise-site-henrygoldsmith07-9188s-projects.vercel.app/

Le Studio family · Revise

## Raise a grade. Not your note count.

A revision platform for WJEC A-level — four subjects (Mathematics, Biology, Chemistry, Physics) authored against their specifications, with FSRS scheduling, point-by-point examiner marking, and a recommender that always knows the highest-value thing to do next. Other boards reuse that outline and are labelled as an unverified preview.

[Open Revise](https://github.com/henrygoldsmith07-wq/Claude-Code/tree/main/apps/revise) [← Back to family](https://le-studio-site-henrygoldsmith07-9188s-projects.vercel.app/)

- **417** WJEC A-level spec statements
- **4** flagship subjects
- **1,630** Physics questions authored
- **0** questions human-reviewed
- **FSRS** scheduling
- **£0** no account needed

### Recommendation

Scores due reviews, mistake repair, weak-topic practice and timed papers on one scale — one winner, with a plain-English reason.

### FSRS spaced repetition

Per-grade interval previews, confidence before reveal, failed cards reinserted in-session.

### Exam practice

Structured questions marked point-by-point against the mark scheme with examiner feedback.

### Mistake → card

Every dropped mark becomes a classified mistake and a flashcard that only closes when recalled reliably.

### Paper to plan

An adaptive timetable from exam dates and availability — missed blocks roll forward automatically.

### Honest coverage

417 WJEC A-level specification statements across Maths, Biology, Chemistry and Physics, with provenance and a live validator. Physics is fully authored (108 of 108); Maths, Biology and Chemistry still have 78, 102 and 95 statements to write.

## Honest by design

Like every Le Studio app: local-first where it matters, no forced login, no ads, no sale of data. IndexedDB-first with an offline outbox; installable PWA.

And the honest part: no question has been through human review yet, so Revise can practise with you but cannot yet certify that you have improved. It refuses to count unreviewed questions as evidence, and says so on screen instead of showing a confident claim it cannot back.

- Monochrome · stroke icons
- @le-studio/tokens
- Prefers-reduced-motion
- Open source in this repo

[Open Revise](https://github.com/henrygoldsmith07-wq/Claude-Code/tree/main/apps/revise)

## Measured, not claimed

Every engine decision is benchmarked. The harnesses are offline, deterministic and run in CI — not screenshots.

### Recommendation quality

400 synthetic learner states pin monotonicity of every factor. `benchmarkRecommendationQuality` reports MAE / bias / correlation / hitRate over (predicted, actual) paper outcomes. Synthetic now, real later — same harness.

### Marking floor

Rubric marking has a 3-row gold harness with an accuracy floor and examiner-voice contract. The AI vs human table (`rubricAward / aiAward / humanAward` per question) will land here once gold exists.

### Grade calibration

`calibrationReport` › Brier + ECE per bucket. Well-calibrated is ECE < 0.08. `calibrateFromHistory` fits slope/bias over ≥3 timed papers; thin samples return the identity so nothing fakes confidence.

[Read docs/benchmark.md →](https://github.com/henrygoldsmith07-wq/Claude-Code/tree/main/apps/revise/docs/benchmark.md)

## Onboarding that proves itself

Four questions become a real plan on Today — not a tour. “Subjects → exams → time → target” is benchmarked as time-to-first-plan and time-to-first-recommendation. The E2E smoke in `tests/sync.test.ts` proves the full walk offline: seed → due queue → grade → mistake loop → prerequisite “fix Y before X”.

## Case studies — method first, cohorts later

Synthetic now, real cohorts when timed-paper outcomes exist. Each study will report n, weeks, board, grade movement and MAE/bias/correlation before and after the engine change — using the same harnesses above.

**Synthetic longitudinal — WJEC Chemistry (seed 42, 40 learners, 8 papers)** Before calibration: MAE ~4.2 · bias ~+1.8 — After `calibrateFromHistory`: MAE ~1.6 · bias ~0.3 · correlation ~0.96. Reported by `tests/grade-calibration.test.ts`. Replace synthetic with observed (predicted, actual) when live.

## FAQ

### Which boards?

WJEC, AQA, Edexcel and OCR, at GCSE and A-level, for Maths, Biology, Chemistry and Physics — 32 authored curriculum modules over 440 topics. The engine is board-agnostic, so a new board is one more module.

### Do I need an account?

No. Runs entirely in IndexedDB with an offline outbox. Supabase sync and AI prose are optional.

### How is coverage measured?

Coverage is per specPoint, verified by scripts/validate-curriculum.mjs in CI — not a vague topic list.

## Related

- [Revise, the app](https://revise-gray.vercel.app/)
- [The app as markdown, with its lessons and library](https://revise-gray.vercel.app/llms.txt)
