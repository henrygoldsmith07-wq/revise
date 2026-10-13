# AGENTS.md

Notes for agents working in this repository. Everything here was checked against
the code on 2026-10-04; if a command below stops existing, update this file in the
same commit.

## The one command that matters

```bash
npm run verify
```

It runs, in order: `lint:check`, `type-check`, `type-check:strict`,
`validate-curriculum`, `curriculum:freshness`, `content:check`, `docs:integrity`,
`wjec:authoring:check`, `wjec:trust:check`, `wjec:supply:check`,
`wjec:review:gates`, the full test suite, `build`, `perf:budget`.

It takes roughly 25–30 minutes; the vitest suite alone is about 20. Run it in the
background and do other work while it runs. On Windows, invoke npm through
`cmd /c` rather than `npm.ps1`, which PowerShell refuses to load.

## Non-negotiables

- **Never fabricate a human approval.** Do not hand-edit
  `src/content/reviews/wjec-review-audit-log.json` or `wjec-human-verification.json`,
  never set `verification: "verified"` in question source, never fill a
  `humanMark1` / `humanMark2` / `adjudicatedMark` / `collection` attestation with
  anything a person did not actually do.
- **Never loosen a trust gate.** Gate thresholds in `config/judge-gates.json` may
  only tighten. `allPass=false` and `INSUFFICIENT DATA` are honest outputs.
- **`src/domain` stays pure.** No IndexedDB, no network, no React. If a domain
  module needs to know about the clock or randomness, take it as an argument.
- **IndexedDB is the source of truth** for learner data. The UI never awaits
  the network. Every write lands in IndexedDB first and drains to Supabase
  through the outbox. Current authored questions are the exception: they are
  read from the bundle, not from a stored copy (`src/data/authored-questions.ts`),
  so a content fix reaches every device. Never write them back into the
  `questions` store.
- **Schema changes are additive and ordered.** Bump
  `PERSISTED_SCHEMA_VERSION` in `src/data/persistence-schema.ts`, add a named
  entry to `PERSISTED_MIGRATIONS`, add the store to `PERSISTED_STORES`, and guard
  `createObjectStore` with `objectStoreNames.contains(...)` in `src/data/db.ts`.
  Rename nothing and drop nothing — a downgrade must still read old rows. Any
  store that reaches the server needs a migration before a client ships.
- **Treat a brief's claims as hypotheses.** Check the code first; if a claim is
  wrong, say so and skip it rather than implementing to the brief.

## Things that will bite you

- **The engine under-produces if you under-supply it.** `rankRevisionActions`
  takes seven required fields plus optional `untouched`, `topicWeight`,
  `supplyByTopic` and `availableMinutes`. Omitting `untouched`/`topicWeight`
  makes it look like a dead end when it is not. `src/components/recovery-evidence.ts` is the reference call.
- **`unseenQuestion` is O(questions × topics).** Never call it over the whole
  bank in a React hook; it caused real render timeouts.
- **The authored question bank is a lazy chunk** (seventeenth pass). Nothing
  reachable by a static import from `src/app/layout.tsx` or `src/app/page.tsx`
  may import `@/content` (`tests/shell-content-boundary.test.ts` walks the real
  graph and prints the chain). The shell reads questions through
  `loadAuthoredQuestions()` in `src/data/authored-questions.ts`, misconceptions
  from `@/content/misconceptions` and seed cards from `@/content/seed-cards`.
  Resolve the bank *before* opening an IndexedDB transaction: awaiting the
  import inside one lets it auto-commit. A route that still imports
  `@/content` itself builds the bank again on the main thread when it loads
  (the worker's copy is not shared); prefer `loadAuthoredQuestions()`.
- **The whole authored bank is still built before Today; for a fresh profile
  in a worker** (nineteenth pass). Once onboarding has painted, the store calls
  `startAuthoredQuestionsInWorker()`, which builds it in
  `src/worker/content-bank.worker.ts` (Turbopack bundles it from
  `new Worker(new URL(...))`; the worker gets its own hashed copy of the bank
  chunks, not the page's) and receives the plain-data questions by structured
  clone; if the worker cannot start, errors or stays silent for 30s it imports
  the bank on the main thread instead. A returning visit calls
  `loadAuthoredQuestions()` alone and imports on the main thread: measured,
  that reached Today sooner (the worker's copy gets no V8 code cache). If that
  import fails (offline on a profile onboarded via the worker, so only the
  worker's copy is cached) it tries the worker before showing "needs a
  connection" (`e2e/offline.spec.ts` caught this). `<html data-question-bank>` says which path
  ran (`e2e/content-bank-worker.spec.ts`). Two consequences: question objects must stay
  structured-cloneable plain data (no functions, class instances or getters;
  `tests/content-bank-worker.test.ts` round-trips the bank), and nothing the
  "/" route can reach, statically or lazily, may import `@/content` besides the
  loader, or the bank is built a second time on the main thread
  (`tests/shell-content-boundary.test.ts`; import misconceptions from
  `@/content/misconceptions`). Every authoring helper that runs while the bank
  is built (`defineQuestion`, `qualityItem`, `capabilityEvidenceFor`,
  `provenanceFor`, the subject audits) still delays when Today can render.
  Per-phrase `new RegExp(...)` and backtracking global patterns there cost
  seconds on a phone; the fourteenth pass cut the build from ~2.6s to ~0.8s
  (Node) without changing its output. Check `tests/content-boot-cost.test.ts`
  and measure before adding work there. Only the seed cards (~4.3k rows) are
  installed into IndexedDB; `putMissing` writes them in chunks of 500 with the
  main thread handed back between chunks, and wire-tombstone ids (a SHA-256
  each) are only computed when the store has a wire tombstone at all
  (`wireTombstoneCheck`).
- **`perf:budget` has a route budget for `/`** (`routes` in
  `scripts/client-performance-budget.json`): root files plus the route's
  layout and page entry chunks. The bank left it in the seventeenth pass
  (5.13 MB → 2.97 MB raw); the curriculum topic tree (~0.85 MB) is the
  largest piece left. Lower it as more leaves; never raise it to fit a
  regression.
- **Equivalent wording in the offline marker is a curated list**
  (`PHRASE_EQUIVALENTS` in `src/domain/marking-language.ts`, sixteenth pass).
  It rewrites both the scheme point and the answer, for keyword coverage only.
  Add a group only when every alternative means the same thing, direction
  included, in every A-level context; never merge opposites, ambiguous words
  ("fall", "left", "leaves", "double") or a mark-earning term into a vaguer
  one ("diffuses into" is not "moves into"). The opposite-wording veto
  (`canonicalDirectionConflict`) applies only to very short or labelled
  answers: in longer answers it took marks from correct ones. Measure with
  `tests/marking-paraphrases.test.ts` (design, held-out and wrong sets) and
  `tests/marking-contradictions.test.ts`; neither may get worse.
- **Watch for TDZ and memo ordering** when adding a `useMemo` that reads another
  one. Declare dependencies first, and gate an expensive memo on a cheap
  condition (`plan.top === null`) when the answer is only needed in the empty case.
- **Source-string tests constrain UI edits.** Several suites assert on literal
  strings in component source (`tests/today-screen.test.ts`,
  `tests/recovery-ui.test.ts`, `tests/proof-ui.test.ts`,
  `tests/onboarding-first-screen.test.ts`, `tests/perf.test.ts`). Read them before
  changing copy or adding a route.
- **A new route under `src/app` must be added to `APP_SHELL` in `public/sw.js`**,
  or `tests/perf.test.ts` fails.
- **Two pre-existing flake classes**, both evidenced on a clean baseline and both
  left documented rather than hidden: Vitest worker RPC timeouts on a loaded
  machine (`vitest.config.mts`), and wall-clock compile assertions
  (`tests/perf.test.ts`).

- **The reviewer portal is not inside the student shell** (eighteenth pass).
  `src/components/RouteShell.tsx` renders `/reviewer/**` without
  `AccountBoundary`/`StoreProvider`/`AppShell`; anything a portal page needs
  from the root must work without the store (only `ShortcutProvider` is
  there). `ReviewerSessionKeeper` keeps the session cookie fresh. Use
  `isReviewerPath` (exact segment; `/review` is the student flashcard route).

## Review workflow

The **reviewer portal** (`src/app/(reviewer)`, `/reviewer`) is the canonical
path for humans. It appends to the same hash-chained audit log: runtime events
live in Supabase `public.review_audit_events` as the continuation of
`src/content/reviews/wjec-review-audit-log.json`, and every rule runs through
`src/domain/review-workflow.ts`. Its "Ready for you" order comes from
`src/lib/reviewer/priority.ts` (the domain `buildReviewPriorities` plan,
memoised per subject on the chain tail); it orders only and must never hide a
question or change a rule. Never add a parallel review store, and never
record via the CLI against a live portal without `npm run wjec:review:pull`
first (it would fork the chain).

Developer/seeding CLI routes (not for reviewers; keep them out of user-facing
docs and onboarding):

```bash
npm run wjec:review:pull      # runtime portal events -> committed audit log (service role)
npm run wjec:review:queue     # -> review-return.json
npm run wjec:review:import    # applies it
npm run wjec:review:batch     # -> content-review.json
npm run wjec:review:apply     # applies it
npm run wjec:review:pack      # offline HTML pack (developer fallback)
npm run wjec:review:pairs     # owner status of the transfer-pair batch (read-only)
npm run wjec:reviewer:grant   # maintainer: invite + grant/revoke a teacher (service role)
```

The transfer-pair batch (`/reviewer/pairs`, `src/lib/reviewer/batches.ts`)
is ordering and context only, like the priority plan: never use it to skip a
check or count a pair as proven before both halves are verified.

`docs/review-workflow.md` covers all of it.

## Current honest position

All four WJEC A-level flagships have **0 human-reviewed questions**. Counting
only questions a reviewer could actually approve (no blocking review gate),
no flagship is close to fully authored: Physics meets the core bar on 14 of 108
statements, because none of its 234 original "transfer"-labelled questions has
a baseline link; the fourteen that do meet it (alternating currents sp-01, sp-03;
capacitance sp-01..03; circular motion/SHM sp-01..06; electric circuits sp-02,
sp-04; electromagnetic induction sp-01) rest on new transfer
items in `src/content/questions/physics-transfer-linked.ts`, each linked to an
existing baseline part, passing the Physics novelty check and the
baseline integrity check (`validateBaselineIntegrity` with its Physics working
recognisers, `physicsWorkingNodes`), and still unreviewed. Those linked items
also go through the transfer block of `auditFlagshipSubject`. For Physics,
transfer novelty is decided by `comparePhysicsTransfer`
(`src/domain/physics-transfer-novelty.ts`): the physical relations each
worked solution uses, the unknowns each prompt asks for, and the context; it
fails closed when it recognises no relation or unknown. The word-based
reasoning graphs (`deriveVerifiedGraph`) are nearly empty for Physics and are
no longer used for its novelty verdict; every other subject still uses them.
Until the seventh pass five circular motion/SHM items passed only as inverse
problems on the baseline's own relations (`rearrangementOnly`); each now
continues into a relation its baseline never uses (a test asserts none of the
fourteen is `rearrangementOnly`). Do not reword an item to pass the check. Mathematics, Biology and Chemistry still
have 71, 103 and 91 statements to write
(`src/content/reviews/wjec-authoring-backlog.json`).
Earlier notes saying Physics was "authored to all 108" counted gate-blocked
questions. Do not invent baseline links to close that: author real transfer
families (that file is the pattern), or label a part by its true demand.
Reference-tier subjects pass the permissive `trustedAssessmentContent`; use
`learnerEvidenceTrusted` wherever a claim says proven or proof-capable, and
keep their grade/readiness output labelled as a practice estimate (they are
never "ready"). The same holds for mastery wording: a reference topic tops out
at "Secure in practice" (`stageLabel`, `specStatusLabel`), never "Proven". Practising
works. Proving an improvement does not yet, and the app says so rather than
implying otherwise. Do not let a change quietly close that gap.

There is an account-deletion path in code (`src/app/api/account/delete/route.ts`
with rules in `src/domain/account-deletion.ts`, cascade coverage in
`supabase/schema.sql`): "Erase local data" stays device-local while "Delete
account" requests server-side deletion with residual verification. There is a
per-learner AI opt-in: `UserSettings.aiEnabled` defaults to `false`
(`src/data/repository.ts`), enforced server-side (`src/domain/ai-consent.ts`,
`src/ai/transport.ts`) with a Settings toggle (`AiConsentSection` in
`src/app/settings/page.tsx`). Deployment assurance (RLS, cascade behaviour,
consent revocation timing) still requires a configured staging run; code
existing is not proof it works in production. `docs/data-flows.md` and
`docs/dpia-draft.md` record what remains open.

## Tests that auto-skip

Real-Postgres suites skip unless `TEST_DATABASE_URL` and `DATABASE_URL` are set. A
green run with those suites skipped is not evidence about them.