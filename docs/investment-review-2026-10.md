# Investment review — 20 October 2026

Reviewed as if Revise were a £1M acquisition or raise. Source, docs and the
local gates were read and run; the live product, a staging deployment and real
learners were not. Every claim below is either measured here or cites the file
it comes from.

## Verdict

The engineering is above what £1M usually buys. The asset value is near zero
until the evidence gaps close: today the code is worth roughly its rebuild cost,
and the moat Revise describes (reviewed WJEC content, validated marking,
observed learner benefit) does not exist yet.

## Measured on 2026-10-20

- `npm run lint:check`, `type-check`, `type-check:strict`: clean.
- Vitest: 3,835 passed, 29 skipped, 0 failed (418 files, about 6.6 minutes).
- Row-level security is enabled on all 26 tables in `supabase/schema.sql` and
  its migrations (14 directly, 12 through the owner-policy loop).
- About 230k lines: `src/domain` 79k (321 files in one flat directory),
  `src/content` 43k, `tests` 58k. 279 commits, all dated within 17 days, many
  agent-authored.

## What a buyer would pay for

- Local-first reliability: IndexedDB as source of truth, a classified outbox
  retry policy, a cross-tab sync lock, server-side clock clamping, additive
  migrations.
- Security and privacy discipline: per-request nonce CSP, server-side AI
  consent on every request, egress masking, account deletion with residual
  checks.
- Honesty built into the product: trust gates that only tighten, a
  hash-chained review log re-validated in SQL, no "proven" claim without
  evidence.

## What blocks the valuation, in order

1. **No reviewed supply.** All four flagships have 0 human-reviewed questions;
   `src/content/reviews/wjec-review-audit-log.json` has 0 events. Physics meets
   the core bar on 14 of 108 statements. Proof cannot fire anywhere.
2. **Marking is unvalidated.** The offline marker is keyword/lemma overlap and
   still under-marks 687 of the bank's own model answers
   (`tests/marking-self-consistency.test.ts`). No double-marked student corpus
   exists.
3. **No market evidence.** The landing page prices Revise at £0, there is no
   revenue model, and no pilot, retention or efficacy data. The flagship market
   (WJEC A-level) is Wales-scale; competitors already own breadth and teacher
   trust (`docs/competitive-research-2026-10.md`).
4. **Breadth before depth.** 35 subjects, 28 of them cloned reference outlines,
   against the roadmap's own rule that breadth waits until the flagships prove
   improvement.
5. **Maintainability and key-person risk.** A large, mostly agent-written
   codebase with one human owner, a flat 321-file domain directory, several
   1,000+ line modules (`src/state/store.tsx`, `src/app/settings/page.tsx`) and
   a 25–30 minute verify.

## Fixed alongside this review

- **Anthropic provider never worked on its default model.** It sent
  `temperature`, which current Claude models reject with a 400, so every
  Anthropic task fell back to offline output silently. The request now sends no
  sampling parameters, defaults to `claude-sonnet-5-5` at low effort, and
  `tests/anthropic-provider-request.test.ts` pins it. Not yet exercised against
  the live API.
- **classifier.dev is opt-in.** It was on unless disabled, sending masked
  student writing to a keyless free-tier third party with no recorded
  processing agreement. It now needs `CLASSIFIER_ENABLED=1`.
- **Next.js 16.3.6 → 16.3.8** and `npm audit fix`. Production dependencies
  now report one low-severity katex advisory, which needs a breaking major
  upgrade. The remaining critical/high advisories are dev-only (the vitest
  toolchain) and need a vitest major upgrade.

## What would make it worth £1M

1. Stop feature work. Pay two or three WJEC Physics teachers to review one
   usable pack: the diagnostic plus genuinely different transfer questions for
   about ten topics.
2. Collect the 250-answer double-marked corpus and publish the marker's
   agreement rate. That number is the moat.
3. Run one consented school pilot measuring lost mark → repair → delayed proof
   on unseen questions.
4. Choose a revenue model (most plausibly a school licence) and only then
   extend to Eduqas, WJEC's England brand.
5. Freeze or hide the reference-tier subjects, and split `src/domain` into
   modules before outside technical diligence.
