# Revise deep review: practice draft lifecycle and support evidence

9 November 2026, scheduled 16:50 UK run. Branch
`fix/onboarding-recovery-and-check-consistency`, baseline `3b0b880`, expected
Revise origin verified. Existing onboarding, diagnostic, lesson and proof fixes,
five modified test files and all six earlier review records were preserved.
No tests were added, changed or run in this pass.

## Investigated workflow

Practice entry and question selection -> answer/hint -> question navigation or
filter change -> local draft persistence -> reload -> submission -> persisted
attempt and repair/mastery consumers -> next action. Also inspected the shared
paper runner, account switching and both local erasure paths. This investigation
concerns assistance integrity and answer continuity, not another proof-clock fix.

## Ranked confirmed findings and coherent changes

| Impact | Source-level trigger and root cause | Change | Confidence / effort |
|---|---|---|---|
| High | Reveal a hint, type an answer, switch questions and return, or reload practice before submitting. Previously `QuestionDraft` held only answers/choice; hint use lived only in the mounted hook. The resumed response could lose its support flag and receive independent evidence weight. The same in-session navigation defect affected papers. | Extend the shared draft with strongest hint tier and repair-teaching exposure. Emit drafts from the execution hook for answer, choice and support changes, including support before typing; restore support independently of the currently allowed hint budget. | High / low |
| High | The ordinary practice page rendered all topic key points under “Read these after you have answered”, before any answer was submitted, without recording support use. | Remove that duplicate automatic reminder block. The explicit hint ladder still supplies topic help and records its tier. | High / low |
| High | Save an unsubmitted practice answer, choose Settings -> Erase local data, complete setup and reopen the question. The IndexedDB-only wipe left the account-keyed localStorage draft available. Database recovery reset had the same omission. | Share the existing draft key in a small data helper; clear only the active profile's practice drafts after either local wipe/reset succeeds. Account deletion already uses the same wipe. No erasure action was executed. | High / low |
| Medium | Change subject/topic or enter/leave the wrong-answer filter with unsubmitted answers elsewhere in the queue. `resetSession` cleared every question draft, discarding unrelated answers and their support history. | Reset session results and counters while retaining unsubmitted drafts. Successful question submission still removes its own draft. | High / low |

Additional consistency changes: the runner labels supported responses and suppresses
the unaided/proof promise when restored support exists. It does not reveal historical
help in a no-hint mode. New hints cannot be revealed while marking is in progress.
The reader validates support tiers and retains hint-only drafts; the writer omits
empty drafts so merely visiting questions does not consume the 20-draft allowance.
MCQ draft choices now require a nonnegative integer. Existing question and marking
trust gates were not relaxed.

## File evidence and downstream consumers

- `src/state/question-execution.ts:96`: additive draft support fields;
  `:153`, `:210`: restored teaching and strongest-tier evidence;
  `:219`: stable callback reference and support-aware draft emission;
  `:383`: support attached to the attempt; `:417` onward: saved-result next action.
- `src/components/QuestionRunner.tsx:101`, `:123`: evidence-sensitive claims;
  `:249`: hint reveal disabled during marking. The former answer-only event
  callbacks were removed so they cannot overwrite support metadata.
- `src/app/practice/page.tsx:178`: per-account draft buckets;
  `:416`: filter reset retains drafts; `:946`: runner handoff;
  `:948`: successful submission removes only its own draft;
  `:1008`, `:1037`: validated localStorage read/write.
- `src/app/papers/page.tsx:837`, `:1001`: the second draft consumer preserves
  the extended shape in memory. Paper drafts still do not survive a full reload.
- `src/data/practice-draft-storage.ts:2`: shared account-specific key;
  `src/data/db.ts:321`, `:563`: database reset and store wipe remove this key.
  `src/app/settings/page.tsx:807`, `:1207`: account deletion and local erase callers.
- `src/state/account.tsx:31-49`: account changes hide the old tree and reload;
  the database profile stays pinned. Other accounts' draft keys are not cleared.
- `src/state/store.tsx:822-855` and `src/data/repository.ts:493`: saved attempt
  reaches repair evaluation and the atomic local answer/mistake/card transaction.
- `src/domain/learning-evidence.ts:47`: support bars independence;
  `src/domain/mastery.ts:121`, `src/domain/application-mastery.ts:73`: hint-weighted
  scores; `src/domain/repair-evidence.ts:71-84`: guided versus fresh independent
  repair; `src/domain/specification-evidence.ts:200`,
  `src/domain/mastery-stage.ts:135`, `src/domain/delayed-far-transfer.ts:218`:
  status and transfer consumers use the independent-attempt contract.

These are source-derived reproductions and consistency traces, not executed
browser scenarios. Existing navigation, hint-ladder, practice-step and
practice-session-reliability tests were inspected for intended contracts and
source-string expectations; none covers the full persisted support lifecycle.

## Capability status and remaining limits

- Practise marking and mistake/card persistence: **implemented** in code.
- Interrupted practice: **partial**. Support now travels with a retained draft;
  existing storage limits remain: 20 drafts, 8,000 characters per saved part and
  100,000 characters per serialized map. Quota/security errors are swallowed by
  the existing writer, so persistence is best effort. The UI does not report
  which drafts failed to save. Drafts also lack a question-content fingerprint.
- Papers: **partial** interruption recovery; only in-memory drafts preserve
  support during navigation. Full reload retains submitted attempts, not drafts.
- Local erase/reset: **implemented** cleanup for these drafts. Live cross-tab
  resurrection, storage-denial behavior and server deletion assurance remain
  unverified. This is not an audit of every other localStorage key.
- Diagnose, reviewed teaching and Prove remain **partial** under the documented
  external evidence gaps. Revisit scheduling exists; no retention or learner
  benefit was measured. No mocked capability was newly established.

Legacy drafts cannot recover hints that were never recorded. Other routes that
do not supply a draft callback, unrecorded lesson/preview exposure, interrupted
network marking, multi-tab draft writes and partial outbox failures are outside
this correction. The result view and existing trust contracts still need runtime
verification. Changes remain local and uncommitted; no GitHub write or deployment.

Next unreviewed area: local profile erasure and cross-tab/account isolation across
all non-IndexedDB storage, including learner telemetry and proof notifications.
For draft durability, a future change should use account-scoped IndexedDB metadata
with explicit save failure status and a guarded one-time migration; copying
answer-only legacy drafts must never invent past support history.

## Verification

Final static/build results will be appended below. No tests or learner journeys
were run; static checks do not establish runtime behavior or learning benefit.

Final results:

- Full `lint:check` passed before the final reminder removal and erasure-helper
  edits. Final targeted ESLint passed on all five changed/new source files with
  zero warnings. An intermediate lint check caught the now-unused `getSubject`
  import after reminder removal; it was removed and the check passed.
- Standard `type-check` and configured `type-check:strict` passed. Strict covers
  its configured subset, not every component. The final production build also
  completed TypeScript checking and generated all 41 static pages.
- Production build passed. A first build was superseded by a second build after
  the final draft-erasure edits; no two builds ran concurrently.
- `perf:budget` passed on the final build: initial assets 555,782 bytes raw /
  170,910 gzip; `/` route assets 2,324,731 raw / 672,042 gzip.
- `docs:integrity` passed. Full tracked whitespace check passed with
  `core.whitespace=cr-at-eol`, retaining the earlier quick-diagnostic CRLF edits.
- Reviewed the resulting tracked diff and both new files. The original modified
  files remain present. Only four previously clean tracked source files plus
  the new helper/report were edited in this pass. Tests were neither edited nor
  executed. No real learner data was erased or submitted.
- Local `.next`, TypeScript incremental files and bundled/copied public assets
  were regenerated for verification. No additional tracked build artifacts
  appeared. Browser, screen reader, mobile, multi-tab, storage-failure and staging
  behavior and real learner outcomes remain unverified.

Appended this run's findings and checks to
[Software Projects & Product Portfolio](https://www.notion.so/3fb14ee42773819db9a3dcabe8772331)
using a targeted end-of-page insertion; existing content was preserved.
