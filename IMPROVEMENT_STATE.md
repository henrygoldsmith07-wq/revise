# Improvement state: one adaptive learning session

## Goal and observable outcome

Today should choose one best, bounded learning sequence for the next 20 minutes. The choice must be a single optimisation across FSRS pressure, topic mastery, open mistakes, exam proximity, evidence uncertainty, and capability gaps. The home screen should lead with one calm action: “Best use of the next 20 minutes”, a subject/topic, and “Start”. Starting the sequence must preserve progress and end with a delayed-retrieval action.

Success signals:

- every enrolled topic is scored by the same deterministic optimiser;
- the selected plan is always at most 20 minutes (and normally exactly 20);
- evidence-rich weak topics produce retrieval → misconception repair → explanation → supported practice → independent application → transfer → delayed retrieval when the data supports each block;
- an interrupted adaptive plan can be resumed from its saved step;
- the adaptive domain builder has pure tests for ranking, step order, budget, and sparse/empty evidence;
- existing review, practice, roadmap, and persistence tests remain green.

## Baseline evidence

- `src/app/page.tsx` currently branches on `dueCards.length`: due cards render `TodayReviewSession`, while no-due states render `NextBestAction` from `recommendations[0]`.
- `src/domain/recommender.ts` already computes useful factor evidence, but emits separate activity recommendations (flashcards, mistakes, practice, learn, paper).
- `src/domain/orchestrator.ts` already contains a capability-aware tutor loop, but it is not used by Today and does not select a topic against FSRS/mistakes/exam evidence.
- `src/components/DailySessionCard.tsx` and `src/domain/daily-session.ts` expose multiple links/phases rather than one adaptive entry point.
- Review and practice routes already persist FSRS grades, attempts, mistakes, and checkpoints; those contracts can be reused rather than duplicating storage.

## Diagnosis

The product has the evidence and learning primitives, but the home decision is made before the evidence is combined: a due-card branch short-circuits mastery/mistake/exam trade-offs, and the recommender's activity rows are not assembled into a single tutor sequence. The missing layer is a pure topic optimiser plus a resumable sequence runner.

## Opportunity set and ranking

1. **Unified topic scoring** — highest leverage; combine FSRS, mastery, mistakes, exam proximity, forgetting, uncertainty, and capability gap into one auditable score.
2. **Adaptive sequence builder** — turn the winning topic's evidence into a 20-minute progression with support fading and delayed retrieval.
3. **Single Today hero** — remove the due/no-due fork from the student-facing decision and show one Start action.
4. **Resumable adaptive route** — let the student move through the sequence without losing the current step.
5. **Real activity destinations** — route retrieval, lesson, and question blocks to existing tested flows.
6. **Delayed retrieval scheduling** — use the existing bury/sync path for a durable next-day retrieval marker.
7. **Active-recall explanation block** — keep explanation written and gated by a before-reading recall prompt; no video dependency.
8. **Question selection by evidence** — choose supported, independent, and transfer questions using difficulty, exposure, and topic links.
9. **Explainable plan metadata** — preserve factor values and plain-language reasons for diagnostics and future analytics.
10. **Adaptive checkpoint compatibility** — extend the existing local-route validator and resume card without breaking old checkpoints.
11. **Focused tests and browser smoke coverage** — pin ranking/order/budget and verify Today → Start → adaptive route.
12. **Keep secondary roadmap/forecast lazy and below the hero** — protect the existing home performance and navigation context.

## Decisions

- The adaptive builder is pure and deterministic; no model/network call is needed to choose the next session.
- The plan defaults to 20 minutes, with a bounded 12–25 minute input for direct domain callers/tests.
- Due cards are evidence, not a separate queue: they raise a topic's FSRS factor and become the first step when present.
- Unknown capability evidence triggers diagnosis/explanation before transfer; transfer is included only when a distinct question exists.
- The runner deep-links into the existing review/practice/lesson surfaces and keeps its own step checkpoint; this avoids cloning marking and FSRS logic.

## Status

- [x] baseline mapped and workflow selected
- [x] implement unified adaptive domain builder
- [x] expose the plan through the store and Today hero
- [x] add resumable adaptive route and delayed scheduling
- [x] add focused tests and run verification

## Verification log

2026-09-05: `npm run verify` passed: lint, regular and strict TypeScript, curriculum validation/freshness (32 specs, 0 stale), 166 test files / 1,342 passing tests (2 staging tests skipped), production build, and client performance budget. Focused adaptive/checkpoint/today tests also passed (19 tests), and the service-worker shell now includes `/adaptive-session`.

2026-09-05: Browser smoke passed on the local dev server: onboarding → Today rendered the single “Best use of the next 20 minutes” hero; Start opened the adaptive runner; Pause returned a resumable adaptive checkpoint; Resume restored the same step; explanation enforced before-reading active recall; no Next.js overlay or browser error was observed. `npx playwright test e2e/adaptive-session.spec.ts --reporter=list` also passed (1/1).

2026-09-05: Final adjustment passed regular TypeScript, lint, five adaptive focused tests (including cross-factor ranking), production build, and client performance budget.

## Open questions / next actions

- Whether the next iteration should embed the question/lesson blocks in one route instead of returning to the existing activity surfaces.
- After implementation, inspect the rendered Today hero and confirm the roadmap remains secondary rather than competing with Start.
