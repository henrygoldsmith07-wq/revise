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
- **IndexedDB is the source of truth.** The UI never awaits the network. Every
  write lands in IndexedDB first and drains to Supabase through the outbox.
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
```

`docs/review-workflow.md` covers all of it.

## Current honest position

All four WJEC A-level flagships have **0 human-reviewed questions**. Counting
only questions a reviewer could actually approve (no blocking review gate),
no flagship is close to fully authored: Physics meets the core bar on 0 of 108
statements, because none of its 234 "transfer"-labelled questions has a
baseline link, and Mathematics, Biology and Chemistry still have 79, 105 and
96 statements to write (`src/content/reviews/wjec-authoring-backlog.json`).
Earlier notes saying Physics was "authored to all 108" counted gate-blocked
questions. Do not invent baseline links to close that: author real transfer
families, or label a part by its true demand. Practising
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