# Changelog

## Practice estimates say so; first linked Physics transfer items; honest AI re-mark notice — 2026-10-10 (third pass)

**Reference-tier subjects no longer read as exam-ready or as an exam
prediction.** Their questions pass the permissive `trustedAssessmentContent`
(no review gate), which is right for practice but was flowing into claims:

- `buildExamReadiness` could mark a reference subject **Ready** (and
  `readinessStopFor` would then cut its practice short). It now caps them at
  `nearly-ready` and sets `referenceTier`; the readiness card says why.
- `outlookRows` could give a reference subject a non-provisional band, so
  Today said "Estimate: you're most likely to score 60–80% in …" with no
  qualifier. Reference rows are now always provisional and flagged
  `referenceTier`; Today, the Progress trajectory heading and the knowledge
  map's exam node call it a **practice estimate, not an exam prediction**.
- `predictGrade` names the weakness in `uncertaintySources` for reference
  subjects (shown under "What makes this estimate uncertain?").
- `isProofCapable` used the permissive predicate; it now uses
  `learnerEvidenceTrusted`, matching `provenanceTier`.
- Left as practice-tier on purpose (labelled already, no proof/readiness
  claim): supply, mock generation, diagnostics, knowledge-graph
  covered/shaky statuses, calculation/response-time calibration.
- Flagship behaviour is unchanged. `tests/reference-tier-claims.test.ts`
  (6 of 7 cases fail on the previous code).

**First Physics transfer items with a real baseline.** Two new transfer
questions for the top-ranked authoring briefs (alternating currents sp-01,
rms from a logged peak voltage and metered energy; sp-03, minimum
transmission voltage and turns ratio from a loss limit), each linked to an
existing application/calculation part of the same capability with recomputed
setup fingerprints. `source: "generated"`, `verification: "unverified"`, no
reviewer. Physics authored ceiling 0/108 → 2/108. A drafted sp-02 item was
withheld because the structural-novelty comparison (not yet applied to
Physics) rated it too close to its baseline. No gate was relaxed and the
234 unlinked items were not touched.

**AI marking failure is explained.** When the AI marker fails and the attempt
is genuinely queued for a re-mark (consent given, cloud tried), the marked
result now says so and that the mark may update; `enqueueDeadMark` resolves
`true` only when the item was written.

## "Proven" means the same thing everywhere — 2026-10-10 (second pass)

**Four places could tell a student something was proven, or provable, when
the proof rules say it was not.** The proof ledger already required
`learnerEvidenceTrusted` (flagship + human review); the layers around it did
not.

- **Reference-tier proof steps.** `mission-session` (apply / transfer /
  delayed-proof picks) and `unseenSupplyByTopic` used the permissive
  `trustedAssessmentContent`, so a reference-tier subject could be served
  "Delayed check — this is what proves the marks are back" from unreviewed
  outline content. Both now use `learnerEvidenceTrusted`. The
  `revision-engine.test.ts` fixtures moved onto the four flagship ids with a
  reviewed bank (same intent) — the blocker recorded by the last two passes.
- **Reference-tier "Proven" marks.** `mark-recovery` reached `proven` on the
  same permissive predicate, feeding "Proven on trusted unseen" (MarksLedger)
  and "Proven improvement" (ExamCommandCentre). The answering question must
  now clear `learnerEvidenceTrusted` (or the separately verified official-paper
  tier); reference-tier marks stay provisional and say why. Proof-lifecycle
  test fixtures use new reviewed-flagship helpers in `tests/helpers-recovery.ts`.
- **"Proof check · passed" after any full-marks answer.** The marked result
  showed "<topic id> is now proven on a new question" for any unaided full
  marks on permissively-trusted content — first answers, no delay, no earlier
  loss. It now shows only when `marksProvenByAttempt` says this attempt was the
  delayed proof of an earlier loss, and uses the topic title.
- **Authored ceiling.** `wjec:authoring:*` counted gate-blocked questions as
  if they could be approved. None of the 234 Physics questions labelled
  "transfer" has a baseline link, so the reviewer portal refuses all of them,
  yet they filled every Physics statement's transfer slot: the backlog said
  108/108. Counting only `approvableByReview` questions it is 0/108 (Maths
  9→8, Biology 12→9, Chemistry 13→12 statements). The backlog
  (`part-level-depth-v2-approvable`) pins gate-blocked counts per subject, and
  `--check` names any rise in a blocking gate. No links were invented and no
  content was relabelled: choosing a baseline is an authoring judgement, and
  relabelling 234 items would rewrite authored design to make a number move.

**Today no longer goes blank while unseen questions remain.** The flaky
property `never headlines an action it cannot perform` (seed 1002749685) was a
real gap: a learner who had started every topic, lost no marks and had
nothing due got an empty Today and a note blaming review supply, with unseen
questions still in the bank. `rankRevisionActions` now falls back to "Keep
practising <topic>" when nothing else ranks and there is no adaptive plan; it
skips topics with unproven losses so practice never spends the questions a
delayed check needs, and it claims no proof.

Nothing loosened: no gate, threshold, review rule or proof predicate was
relaxed; every change above tightens a claim to match the existing rules.

## Reviewer minutes go where students gain most — 2026-10-10

**The biggest bottleneck is human review (0 reviewed flagship questions), and
the portal was spending it in alphabetical order.** "Ready for you" sorted by
question id, so a teacher's first reviews went to whatever id sorted first —
often a reskin of a question already queued, or one of the 234 Physics
questions that fail a blocking content gate. The domain already had a
capability-first plan (`buildReviewPriorities`), but only the CLI used it.

- **Queue and Next/Skip are capability-first.** `src/lib/reviewer/priority.ts`
  runs the plan against the verified combined chain, with trust read exactly
  as a student device reads it (effective ledger →
  `applyHumanVerificationLedger`). `buildReviewQueue` takes the index and
  orders ranked reviews first, then no-gain reviews, then gate-blocked ones.
  Without an index the old order is unchanged. Memoised per subject on the
  chain tail: ~1.2 s cold for Physics, ~0 warm, recomputed after any decision.
- **Reviewers see why.** Each row has a "Why review it" column in the
  domain's own words; the review screen has a "Why this question" note; the
  subject panel shows topics where proof can begin, quick-check readiness, the
  fastest route (approvals and estimated minutes) to the next provable topic,
  and gate-blocked counts by reason. On today's bank that route is 4 approvals
  (two questions × two reviewers) in every flagship.
- **What the plan shows about the bank** (computed, not changed): of 1,629
  Physics questions only 57 reviews are needed to reach every unlock the plan
  values; 234 are gate-blocked, all "labelled transfer but has no baseline
  link". Maths/Biology/Chemistry: 62/64/61 ranked reviews, 8/11/12 blocked.
- **Diagnostic never dead-ends.** With no reviewed questions, "Full" on
  `/diagnostic` said Revise would not run and offered nothing else; the empty
  quick check said "Practice is still available" without a link. Both now
  offer the labelled practice-tier quick check and/or practice for that
  subject. The header no longer says every answer "counts as unaided
  evidence": only answers on teacher-reviewed questions do.

Nothing about trust, proof predicates, review rules or gates changed; this is
ordering and copy. Not attempted again: the supply-layer consistency for
reference subjects (`mission-session` still uses `trustedAssessmentContent`
for `verifiedOnly`); switching it to `learnerEvidenceTrusted` fails
`revision-engine.test.ts > builds a delayed check…` because the fixtures use a
non-flagship subject id, exactly as the earlier attempt recorded.

## Reviewer checks now have evidence on screen — 2026-10-10

**A reviewer could not verify two of the six approvals they were attesting
to.** The review decision requires six checks, including "Worked answer
right" and "Skills mapped right" (`capabilityMapping`). The review screen
showed the mark scheme and spec refs, but the worked answer was collapsed
and the skill mapping — `capabilityIds`, the `learningClaims` behind each
mark, and the `aos` — was never surfaced anywhere. Two of the six
attestations that turn authored content into student-trusted evidence were
therefore signed off against nothing visible: a rubber stamp on the one
promise the product rests on.

`buildReviewScreen` now carries the capability evidence per part (explicit
`capabilityIds`, `learningClaims`, AO codes) and the review page renders it
as a "Skills & capability mapping" block beside the mark scheme; the worked
answer is open by default rather than hidden behind a toggle. Nothing about
the approval *rules* changed — this only makes the existing attestations
verifiable.

- `src/lib/reviewer/view.ts` — `parts` gains `capabilityIds` / `learningClaims` / `aoCodes`.
- `src/app/(reviewer)/reviewer/review/[questionId]/page.tsx` — renders the block; worked answer `open` by default.
- `tests/reviewer-runtime-ledger.test.ts` — behavioural: the screen surfaces (and defaults empty for) the skill-mapping evidence.
- `tests/reviewer-portal-ui.test.ts` — pins that the capability-mapping block and open worked answer are on the page.

Measured and deliberately not wired this pass: the capability-priority
engine (`buildReviewPriorities`, which ranks questions by capability
unlocked so reviewers unblock the most valuable first) is correct but costs
~6.5s on the physics bank — far too slow for a per-request reviewer render,
and its ranking is only reachable via CLI today. Wiring it safely needs a
precompute/cache layer rather than a live call; recorded as the next
reviewer-throughput priority.

## Onboarding honours the quick-check commitment — 2026-10-10

**The final onboarding step now starts the check it promises.** The last
phase's primary button read "Start my quick check" and the copy promised
"Revise will start with a quick check", but `finish()` only marked
onboarding done and dropped the learner on Today — where, for a flagship
subject with no human-reviewed questions yet, `planColdStart` returns null
and the check is not even the lead. The commitment was silently unfulfilled,
leaving the learner to hunt for `/diagnostic` through the Practice nav.

`finish()` now routes straight to `/diagnostic?subject=<first subject>`,
which auto-starts the check for the chosen subject (and, until review lands,
falls back to the labelled "practice, not proof" tier — already built and
honest). A learner who chose to **skip** still lands on Today, whose copy
("a first step waiting on Today") already promised exactly that.

- `src/components/Onboarding.tsx`: `useRouter`; `finish()` navigates to the
  diagnostic only when `diagnosticChoice === "quick"`.
- `tests/onboarding-first-screen.test.ts`: pins that the navigation exists,
  targets `/diagnostic?subject=`, and is gated on the quick choice.

## Proof no longer overclaims on reference material — 2026-10-10

**A trust inversion, found by audit and fixed.** `trustedAssessmentContent`
is deliberately permissive for subjects with no review gate: authoring,
supply and curriculum paths rely on that. But it was also the gate for
*learner evidence*, and every reference-tier subject (a cloned outline the
UI labels "Reference · not spec-checked" and says "cannot prove
improvement") passes it unchecked. So a correct, unaided, delayed answer
on an **unreviewed reference question** produced a learner-visible
**"Proven"** — the one claim this product must never make without a human
in the loop. Worse, it was an inversion: the four WJEC flagships, which
*do* have a review gate, could never prove (0 reviewed questions), while
unreviewed reference content could.

**The fix tightens, and loosens nothing.** Proof now requires flagship
**and** the human review contract, via a new `learnerEvidenceTrusted`
predicate in `src/domain/content-trust.ts`. `buildProofLedger` filters
its evidence through it, so a topic reaches `proven-gain` only on
reviewed flagship questions. `trustedAssessmentContent` itself is
unchanged — the authoring, supply and curriculum paths keep their
existing, tested behaviour. A reference subject still practises exactly
as before; it simply can no longer claim proof. `tests/proof-of-improvement.test.ts`
now models genuinely reviewed flagship content (full six-check
attestation whose fingerprint matches), and gains a regression test
asserting reference-tier material never proves, however well it is
answered.

**Known remaining inconsistency, recorded rather than hidden.** The
*supply* layer (`unseenSupplyByTopic` in `src/domain/supply.ts`,
`topicSupply` in `src/domain/marks-value.ts`) still counts reference
questions as "provable", because the adaptive-planner test suite
(`revision-engine`, `cold-start`, `product-journey`, `today-focus`) is
built on non-flagship synthetic subject ids and would need its fixtures
rebased onto reviewed flagship content — a separate, larger change. In
the shipped product this is benign for the four flagships (gated but
unverified → `provable=0` → proof missions correctly blocked), but a
reference-tier preview subject can still see an unblocked "Delayed
check". Closing it is the next priority.

## The repair path follows the failure mode — 2026-10-10

**Today's mark result prescribes, not just links.** Losing marks now renders
`InterventionPrescriptionPanel`: the unified learner model decides which
capability is actually missing on that topic and prescribes the ordered repair
path that follows. A learner who remembers the definition but loses the
application marks reads "You remember it — now make it score", then quick
recall → understand → worked example → guided try → unaided exam question,
each step labelled "practice, not proof" or "counts as evidence". A recall gap
gets retrieval and explanation instead; a repeated misconception is confronted
before new questions. The engine, the copy and the ordering all come from the
existing `learner-intelligence` + `intervention-engine` domain modules, which
were previously only reachable from the Library topic sheet.

**Two defects found and fixed by running verification.** This pass ran the
static checks and the suite, which had not been executed since the merge:

1. `src/components/AppShell.tsx` carried a stray `];` left over from the
   merge-conflict resolution — a syntax error that broke every build. Fixed.
2. `src/components/PdfPageImage.tsx` used a pdfjs API this version does not
   expose (`PDFDocumentProxy.destroy`, a `render` call missing `canvas`).
   Fixed against the installed types.

**Tests repaired rather than deleted.** Five failures were environmental or
stale, and each is now honest:

- Source-string tests compared multi-line text with `\n` while git checks
  files out with CRLF on Windows (`core.autocrlf=true`). `schema()` and the
  CSS reader now normalise line endings; the assertions are unchanged.
- `tests/ai-structured-output.test.ts` predated the AI consent gate: the
  request never left the browser, so the malformed-response branch could not
  run. It now seeds an explicit opt-in first.
- `tests/onboarding-first-screen.test.ts` pinned the old three-phase
  onboarding to the five-phase funnel that shipped (adding that the
  diagnostic is labelled practice-not-proof).
- `tests/a11y.test.ts` imported `AppShell` into a node test to assert it was
  a function, which pulled the whole app graph in and timed out; it now
  asserts the export in source, which is what actually pins the contract.
- `tests/marking-prompt-injection.test.ts` imported the server-only
  `@/ai/tasks`. It now asserts tariff clamping through the client-safe
  `assessMarkConfidence` instead.
- `tests/security.test.ts` gained an `insert-only` RLS expectation, so
  `product_events` and `marking_disputes` are covered by the schema contract
  (write-only for the learner, readable by nobody but the service role).

**An honesty defect in the previous pass, fixed.** A full-marks answer on an
unreviewed practice question was rendering the "Proven" proof banner. It now
renders "Full marks — practice, not proof" unless the answer can actually count
as evidence: trusted content, answered unaided, outside recall mode. The same
gate protects the ledger: with zero human-reviewed flagship questions, nothing
in the flagships can claim proof.

Also fixed in this pass: the root layout metadata had lost the "four subjects
are authored to their specification; everything else is labelled reference
material" honesty clause (restored, keeping the Physics-first framing), a
setState-in-effect lint error in the practice draft store, impure `Date.now()`
calls inside `useMemo`, and missing memo dependencies.

### Verification actually run in this pass

| Check | Result |
|---|---|
| `lint:check` | passes (0 errors, 0 warnings) |
| `type-check` / `type-check:strict` | pass |
| `docs:integrity` | OK — 44 files, 29 routes, 61 scripts |
| `validate-curriculum`, `curriculum:freshness`, `content:check` | pass |
| `wjec:authoring:check`, `wjec:trust:check`, `wjec:supply:check` | pass |
| `wjec:review:gates` | OK — 0 verified, 0 checked, 0 needing re-review |
| `vitest run` (full suite) | **315/331 files, 2899/2900 tests**. The remaining failure is a wall-clock performance assertion (`marks adversarial cases at interactive speed`, 507ms against a 400ms budget) on a loaded machine — one of the two flake classes AGENTS.md already records as pre-existing, and unrelated to any change here. It is deliberately not loosened. |
| `build` | passes; 29 routes (10 dynamic, 19 static) |
| `perf:budget` | passes — 552,708 B raw / 169,817 B gzip initial route; pdfjs, Transformers.js, WebLLM, onnxruntime and katex are all optional chunks outside the initial route |

The suite count went from **186 failed / 144 passed** files to **1 failed / 315
passed**, largely because two of those 186 were real defects and the rest were
worker-RPC timeouts that disappeared once the build was not broken and the
longest-running file stopped importing the entire app graph into node.

Not verified here: `e2e` (Playwright), staging/Postgres suites, and any
real-learner outcome. Those remain external evidence needs.

## Honest diagnosis, versioned marks, fitter plans, visible supply gaps — 2026-10-09

**Uncertain diagnoses read as uncertain.** The post-marking error diagnosis now
drives the next action only when `isActionable()` holds (gated, confident,
known category). A low-confidence read keeps the generic repair action and is
shown as "Possible cause, not certain" in both the action reason and the
"What this taught us" panel — a local 0.5–0.66 heuristic can no longer present
a guess as a finding.

**Every mark carries its provenance.** Persisted attempts record
`markProvenance` (grading tier, provider/model, `MARK_POLICY_VERSION`, and a
hash of the exact mark scheme graded against), re-stamped when the DLQ
upgrades a fallback grade to an AI grade. The semantic cache reuses a grade
only under an identical scheme hash and policy version — an edited scheme or
policy regrades, and pre-versioning entries never hit. This is what lets a
future human-marked comparison join on exact versions instead of assuming them.

**Today fits the session length.** `rankRevisionActions` accepts the
learner's `availableMinutes`: steps that do not fit defer with their reason
and the best fitting step leads, while at least one action always survives.
Ranking is otherwise unchanged.

**Supply gaps name the missing capability.** The supply audit reports
data-analysis and delayed-proof needs alongside distinct/transfer gaps, and
the Proof panel lists per-topic needs ("What each topic still needs") with a
practice alternative — reskins still never read as supply, and editorial
metrics stay out of the learner view.

**Practice keeps drafts and repair context.** Unsubmitted practice answers
persist per account on the device across refreshes (never synced, dropped on
submit), and re-attempted questions feed the session closure's repair rule.

**Practice keeps drafts and repair context.** Unsubmitted practice answers
persist per account on the device across refreshes (never synced, dropped on
submit), and re-attempted questions feed the session closure's repair rule.

## Teachers review in the browser — 2026-10-07

**Reviewer portal.** A `(reviewer)` route group at `/reviewer` replaces the CLI and
HTML pack as the way teachers review flagship questions: a server-rendered queue per
subject, one dense screen per question (stem, each part beside its mark scheme and
worked answer, specification points, provenance, gate and reskin warnings, history,
fingerprint) and keyboard decisions (`1`–`6` checks, `A` approve, `R` request
changes, `J` skip). Access comes only from `public.reviewer_roles`, granted by the
service role; RLS and a definer `is_active_reviewer()` enforce it in the database as
well as on every page and route.

**Same audit log, at runtime.** Decisions are built by `appendReviewDecisions` and
stored in `public.review_audit_events` as the continuation of the committed hash
chain, verified end to end with `auditLogIssues` on every read. The table is
insert-only (update/delete rejected for every role) and the insert trigger refuses
forks and decisions recorded under someone else's grant. `/api/review-ledger`
serves the effective ledger; student devices cache it and apply it with
`applyHumanVerificationLedger`, so a question two teachers verify joins the
provable pool without a rebuild. `npm run wjec:review:pull` brings runtime events
back into the committed log for `wjec:review:promote` and `wjec:review:gates`.

**One request per mock paper.** The outbox drains upserts through
`sync_push_batch`, one transaction for up to 200 rows across all entities, with the
same owner checks, deterministic wire ids, causal order and outbox durability, and
`sync_writes` keys committed in the same transaction. Older servers fall back to
per-table upserts.

**CLI review tools are developer-only.** The npm scripts stay for seeding and CI;
user-facing docs and the trusted-coverage page now point to the portal.

## One product loop: what to do, why, what changed, what Revise now knows — 2026-10-07

**Today leads with the highest-value session.** Both Today heroes open with "Your
highest-value session", the greeting carries the nearest exam in days (never an
invented number), and the adaptive hero names how Revise will run the session and
what happens after it. Manual study is one tap away as "Choose how to study".

**The engine chooses the method.** `src/domain/study-pathway.ts` names the sequence
the adaptive planner already chose (for example "Fix the mistake → Exam-style question
on your own → Check again in a few days"). The session intro shows it instead of a
"ladder" preview; the `/study` route is now "Choose how to study" and leads with the
recommended session. No mode was removed.

**Every session ends with "What changed".** `src/domain/what-changed.ts` builds
Before / This session / Next proof and the problem → intervention → straight after →
new context → after a delay → outcome chain from the run's own step records and the
proof ledger. Same-session success is never called proof; only the ledger can say
"proven". The old debrief list stays one tap away, so there is one summary, not two.

**One learner model, one owner per metric.** `src/domain/learner-model.ts` projects
recall, application, technique, mistakes, retention, transfer, confidence,
intervention history and outcomes from their existing owners;
`docs/learner-model.md` and `LEARNER_MODEL_OWNERS` record who owns what.

**Progress is an Exam Command Centre.** One card per subject: exam date, risk (from
readiness), the outlook band or an honest "no number yet", where the evidence points,
what is driving it and the subject's best next step. Proven improvement and
"what Revise has learned about how you learn" (intervention memory) follow. Every
specialist panel is kept, in the same order, under "Detailed readiness and evidence".

**Personal intervention memory now reaches the ranking of the adaptive session**, not
only mission stages, through the existing `estimateEffectiveness` (neutral until a
kind of session has enough durable chains).

**Navigation is Today, Learn, Practice, Progress, Library**, with Review, Past papers,
Choose how to study, Tutor and Schedule under More, and Settings separate. No route was
removed or renamed.

**Trust at the moment it matters.** Every practice question has an "About this
question" disclosure (specification match, check status, source, last review) built
from the existing trust predicates; unverified and reference content cannot read as
checked.

**Plain English.** Passport, Digital Twin, FSRS, rung and retrieval vocabulary removed
from learner-facing copy; it remains in specialist and reviewer surfaces.

## Letting a student say "this mark is wrong" — 2026-10-04

**A marked answer had no way to be contested.** A student who believes a mark is
wrong had nowhere to say so inside the product, so the dispute left as a support
email with no attempt, no mark-scheme point and no way to find the row afterwards.
There is now a **Flag this mark** control on every marked part.

**It is local-first and it says so.** Each flag is one IndexedDB row in a new
`markingFlags` store, carrying the ids, the learner's own answer as submitted, the
award and the rubric feedback as shown, an optional reason and an optional note.
The control states plainly that it is stored on this device, that nothing has been
sent to anyone, and that a flag never changes a mark — only a person can do that.
No learner free text is required: reason and note are both optional, and a note
is clamped rather than stored unbounded.

**A flag is an assertion, not evidence.** Nothing in the flag path is read by the
marking engine or by any trust gate, `resolution` is null until a human fills it
in, and re-flagging a part replaces rather than duplicates. A property test drives
arbitrary answers, reasons and awards through the export and asserts the round trip
never manufactures a human judgement.

**The export targets the reviewer tooling that already exists.** The brief asked for
an export importable by `marking:evidence:*`, and that namespace is not a new one:
`scripts/marking-evidence.mjs` (`npm run marking:evidence:init`) already reads an
answer-corpus v2 file and `pack` turns it into blind double-marking sheets. A
dispute is therefore exported **as an answer-corpus v2 file**. The one rule that
governs it: a disputed mark is not a human mark, so `humanMark1`, `humanMark2`,
`adjudicatedMark` and `humanFeedback` are all `null`, the record is `unreviewed` /
`needs_review`, and the app's own award goes in the corpus's `aiMark` field — never
in a field a human attestation flows through. Dispute specifics travel in a
sidecar `disputes` array that the corpus reader ignores. The importer re-validates
through the corpus parser itself, so a dispute file the reviewer tooling would
reject cannot be accepted here either.

**Sync stays off.** `markingFlags` is device-local. It has no server table, no RLS
policy and no opt-in, and it carries the learner's answer text — routing it into the
outbox would be a schema change needing its own migration and a per-learner opt-in.
It is adopted into a new account so a learner keeps their disputes when they sign
up, but is explicitly never queued, and it is covered by the device erase path.
Adding it to sync is recorded as deliberate future work, not an oversight.

Schema change is additive: `PERSISTED_SCHEMA_VERSION` 6 → 7, migration
`marking-flags`, a new store created only when absent. No store renamed or dropped,
and a downgrade reads old rows and ignores stores it does not know.

## What a visitor without JavaScript actually sees — 2026-10-04

**The app could never be read without JavaScript, and nothing admitted it.** `AccountBoundary` resolves
its profile in a client effect, so on the server every route — `/` included — rendered one line,
"Opening your revision profile…". A `<noscript>` in `page.tsx` would never have been seen, because
`page.tsx` never renders server-side either. The fallback now lives in the root layout, outside that
boundary, and says what Revise is, why the app cannot start without scripting, and where to go next.

**`/welcome` is a real static page.** It is a route handler, so it is served outside the app layout and
none of the client providers apply: no scripts, no hydration, no per-user data. It states the flagship
position plainly — four WJEC A-level subjects authored to their specifications, none of their questions
signed off by two independent human reviewers, so Revise can practise but cannot yet prove an
improvement. It is the only route declared indexable, because it is the only one that works without
JavaScript. `/welcome` is added to the precached app shell, which `tests/perf.test.ts` requires of any
new route; `start_url`, `scope`, `CACHE_VERSION` and the fetch logic are untouched.

**Reference-tier subjects moved behind an explicit choice.** 28 of the 32 registered subjects reuse a
WJEC A-level outline without being checked against their own board's specification. They were listed
in the ordinary subject picker next to a disclaimer, which is how a guess ends up looking like a
guarantee. They are now behind a "Show N more subjects — unverified preview" disclosure in onboarding,
rendered in a separately-named group once chosen. Nothing was dropped; only the order changed. WJEC
A-level Physics is the only subject authored to all 108 of its statements, and the README now says so
alongside the fact that all four flagships have zero reviewed questions.

**The marketing site stopped overclaiming.** It advertised "2,216 spec statements across WJEC, AQA,
Edexcel and OCR". The four flagships hold 417 WJEC A-level specification statements, of which 275 are
still to be authored in Maths, Biology and Chemistry. The stat row, the title, the meta and OG tags and
the structured data now carry the flagship scope, the real figures and the zero-reviewed-questions
position.

**A second load-dependent flake, made explicit.** `tests/perf.test.ts` asserted that compiling the
curriculum module takes under 5s while its own comment deferred the real budget to
`npm run perf:budget` — a shipped-artifact gate that is unaffected by scheduling and passes at 17% of
the raw and 18% of the gzip allowance. On a loaded box a cold transform cache took 8.4s. The wall-clock
duplicate now has room not to flake; the artifact budget is unchanged.

## Proving the loop works when there are no reviewed questions — 2026-10-04

**Every flagship subject has 0 verified questions.** The learner-facing consequences of that were
untested, so they are now properties rather than assumptions. `tests/supply-journey.property.test.ts`
drives a simulated learner through at least three cycles of the loop with 0–3 trusted questions per
topic, and holds the engine to four invariants: Today never headlines an action it cannot perform
(blocked work is always deferred with a reason), proof supply only ever counts questions the learner
has not seen and answering one can never increase it, exhaustion is stated in plain words, and a
blocked proof attempt is recorded as review demand. Trust in the fixtures comes from the real
two-reviewer audit-log path, never from a fixture flag.

**Two real defects fell out.** `RevisionPlan.authoringNeeds` measured `marksAtStake` as
`recovery.byTopic(topic).open` — which is zero for exactly the topics where a learner is blocked
awaiting proof, so the review-demand signal reported no demand for the questions that review would
most obviously unlock. It now counts every mark in the topic that is not yet proven, matching the
definition `exam-mission` already used. And an empty Today said nothing about *why*: a learner whose
subject is authored but unreviewed saw "Browse a topic that interests you", which reads as an
unfinished setup rather than an evidence gap. `reviewedSupplyNote()` now names the actual reason —
no reviewed questions, too few, or too few spread across too few topics — from counts in the bank,
and stays silent when there is no shortfall to explain.

**Blocked proof now shows up where reviewers look.** `npm run wjec:quality:report` ranks the topics
where review effort would unlock the most proof, distinguishing work that is already queued, work
that is authored but never reviewed, and topics with nothing in the bank. It is built from the bank
alone: a learner's blocked proof is a local-only funnel event and never leaves the device.

**The exhaustion policy is written down.** `docs/revision-engine.md` documents what counts as supply,
the two-question proof floor, the three-day delayed check, why blocked work is deferred rather than
shown, and what the design deliberately refuses to do — it does not relax what counts as verified or
unseen, and it does not invent supply to fill a slot. New `e2e/narrow-360.spec.ts` runs the loop at
360×800, narrower than any existing device profile.

**One reachability gap is recorded, not hidden.** A learner who has started every topic with no
mistakes to repair and no cards due reaches `plan.top === null` and gets the generic first-run
screen. Supply is not the cause, so the new note correctly stays silent. Closing it needs a new
action rather than new wording, so it is written up in `docs/revision-engine.md` and the property
test pins the boundary — an empty Today is permitted only in that state or when the reviewed supply
is genuinely too small, so the gap cannot quietly widen.

**A pre-existing flake, made explicit.** `tests/repository.test.ts`, `a11y.test.ts`,
`learner-continuity.test.ts` and `question-replication.test.ts` drive IndexedDB through
fake-indexeddb and sit at 3–4s against a 5s default timeout, so the suite failed intermittently
before this branch existed — confirmed by two consecutive baseline runs with no changes present, one
passing and one timing out. `vitest.config.mts` now budgets 30s. This changes only how long a
slow-but-correct test may run: no assertion, guard or gate is weakened, and a real hang still fails.

## A reviewer pack a teacher can use without a terminal — 2026-10-04

**Review stops requiring a terminal.** `npm run wjec:review:pack` renders the selection
`wjec:review:queue` already chose into one self-contained HTML file: each question with its
mark scheme, worked answer, specification statements, provenance, content-gate warnings, reskin
cluster and exact content fingerprint. It works from `file://`, loads nothing and cannot open a
network connection. The reviewer signs in once, works through the pack and exports a return file
that `wjec:review:import` accepts unchanged; `wjec:review:pack:import` performs that translation
and validates it exactly as the importer does, writing nothing.

**The pack cannot approve anything.** It collects only what the importer requires — named
reviewer, role, qualification, a timezone-bearing ISO instant, all six checks, approve / needs
changes / reject and a comment whenever the decision is not an approval — and refuses to export
an incomplete or partial attestation. An untouched question is omitted rather than guessed at,
two reviewers work the same pack independently, and trust still requires two different reviewers
approving the same fingerprint. Two route notes are now explicit: `wjec:review:queue` feeds
`wjec:review:import`, while `wjec:review:batch` feeds `wjec:review:apply`.

## Trusted-content workflow, review priorities and reskin-proof evidence — 2026-10-03

**Review is now a workflow, not a gap.** Questions move unverified → checked → verified through an append-only, hash-chained audit log (reviewer, role, qualification, date, six checks, comments). A question becomes trusted only after two different reviewers approve its exact content; any edit sends it back for re-review. `npm run wjec:review:priorities`, `:queue`, `:import`, `:promote` and `:gates` cover ranking, reviewer packs, external return files, promotion and the release gate. No flagship question is trusted yet: no review has been performed.

**Reskins never count as proof.** Number swaps, noun swaps and same-reasoning rewordings are now excluded from unseen supply and from independent/delayed proof, not only from the audit.

**Cold start and simpler wording.** The quick check needs several topics on flagship subjects and never reuses a seen question family; low-data outcome text reads "Too early to tell … 1 later check completed; 4 more needed"; trust is mentioned only when it limits a claim; recovery details sit behind "Evidence"/"Why?". Core-value funnel events (onboarding, diagnostic start/complete/skip, next action shown, accepted, proof blocked by supply) and `npm run wjec:quality:report` support internal measurement.

## A simpler first minute, honest summaries and a paper result you can act on — 2026-10-03

**New students get a first step, not a pile of cards.** With no trusted answers yet, Today leads with a short, skippable quick check on the subject with the nearest exam. Its answers become normal attempts, so the next recommendation comes from what was actually lost.

**Today answers six questions.** What to do, why, how long, what is at stake, what happens after, and one Start button. Ranking numbers are gone, and the streak/XP text with them.

**A paper result you can act on.** Marks lost, where, the likely reason, what is still to win back, one next button and one of the six state words. Detail sits below.

**Sessions continue and resume exactly.** A finished mission step offers the next best action; a refresh mid-step restores the same questions and support level. Summaries say Improving, Still fragile, Awaiting proof, Proven or Regressed and when Revise will check again, with no generic praise.

**Outcome measurement and supply audit.** Conservative per-method outcomes with 90% bands (needs 5 delayed checks to say a method works well for you), and `npm run wjec:supply:audit` for the four WJEC flagship subjects. See [learner-experience-2026-10-03.md](docs/learner-experience-2026-10-03.md).

## One vocabulary in the Library, and a proof journey in the browser — 2026-10-03

**The Library uses the same six words.** Topics now read Not checked, Needs work, Improving, Awaiting proof, Proven or Regressed, with the reason on tap, instead of covered/shaky plus an unexplained mastery percentage and bar. A topic you have not checked is neutral, never red.

**Proof is tested end to end in the browser.** A seeded earlier success, then a correct answer on a different question after the delay, turns the marks Proven, shows "delayed proof passed" at the end of the session, and Today stops offering the proof check.

## Mission session fixes — 2026-10-03

**No stale resume card.** Finishing a mission, recovery, paper-repair, weak-topic or quick session no longer leaves Today offering to resume a question list you never opened.

**Today reads better on a phone.** The Start button now sits straight under the task title, the shown minutes match the session you will actually get, and a mission only reads as Improving once something has succeeded. The marks-recovered line says "No marks recovered yet" rather than an empty range.

## One next best action — 2026-10-03

**One engine decides.** Missions, paper recovery, proof checks, regressions, due reviews, untouched topics, paper sections and the adaptive session now compete in a single ranking across all your subjects. Today shows only the winner, with why, why now, why before the others, what it is based on, what happens after and what would prove it worked. The order of subjects in Settings no longer matters.

**Missions run as real sessions.** A mission step picks questions for its weakness across every topic it touches, with the right amount of help, and every answer is tagged with the mission, stage and method so Revise can measure whether it worked. Proof stages only use verified, unseen questions; when there are none, Revise says it cannot prove the improvement yet.

**Marks recovered, over time.** Progress shows this week's marks targeted, provisionally recovered, proven and regressed, and where they came from (subject, topic, paper, cause, skill, method). Session endings show the standing position.

**Also:** papers get a diagnosis (knowledge versus technique, repeats across papers, weakly evidenced topics); the quick diagnostic ends with the one best next step; missions and paper losses use the same six learner words; the command centre now reads the same plan and no longer favours the first subject; a panel separates real-world evidence from benchmark validation.

## Exam missions and marks recovered — 2026-10-03

**Exam Missions.** Today now shows one mission built from your lost marks: a recurring cause, a weak topic, or a whole paper. Each stage (diagnose, repair, practise, apply, delayed proof) says why it exists. A mission only completes when a different question, answered independently after a delay, proves the marks are back. Finishing tasks never completes one.

**Marks recovered.** Lost marks are tracked as open, targeted, provisional, awaiting proof, proven or regressed. A repeat of the same question or a hinted answer is never proof, and thin evidence is shown as a range.

**Also added.** Learner states (Not checked, Needs work, Improving, Awaiting proof, Proven, Regressed) with the evidence one tap away; a 5-10 minute starting diagnostic; a pre-exam command centre on Today with 5 to 60 minute plans that change with the countdown; paper recovery (Paper, Autopsy, Repair, Equivalent retest, Delayed verification, Closed) on Papers and in each autopsy; a what-happened / why / pattern / best-fix explanation on mistake cards; and a four-part session closure. Mission order now also reflects what has worked for you: once enough delayed, different-question results exist for a type of repair, it moves up or down. Pre-exam plans leave out repair when nothing needs repairing.

## Marks value and proof — 2026-10-01

**Revise now ranks by marks, and says what it can prove.** Today weighs how much of the exam a topic carries and how you do on questions you have not seen, and "Why this session?" lists the evidence behind the choice. A new student sees that evidence is limited rather than an invented number.

**Repeats no longer look like mastery.** One question answered six times used to read as fully mastered. The first answer to a question now counts in full and repeats count for much less.

**Proof of improvement.** Readiness shows which topics have *proven* gains: new questions, answered unaided, days after you studied. It flags topics that look learned only on familiar questions, and when proof is due the plan asks for it. The session debrief no longer says the gain is tested the same day.

**Explicit evidence gaps.** Where answers cannot count as proof yet, such as WJEC questions awaiting human review, Readiness says so. Recurring mistakes that cost marks on several papers now rank first.

Design notes, constants and limits: `docs/marks-value-and-proof-2026-10-01.md`.

## Marks recovery — 2026-10-01

**See where marks are slipping, then win them back.** Readiness now shows *marks at risk*: the marks you have lost that no delayed retest has closed, split by topic, skill, error type, paper, question type and recurring mistake. One button, *Recover these marks*, builds a short set from them: the questions behind the losses, then new ones on the same topics.

**Paper autopsy.** After a paper (and from the papers list) see exactly where it lost marks, a repair plan of short targeted sessions, and an equivalent retest of different, matched questions so progress is measured on something new.

**Improve my answer.** When a part loses marks, get hints instead of the answer, rewrite it, and see the rewrite re-marked against the original. Practice only: it never changes your mastery.

**Sprints from 5 to 60 minutes**, built to a mark budget with topics mixed, and a **specification evidence** page that shows how much real proof exists for every statement. One correct answer is "not enough evidence", not "secure".

Design notes and limits: `docs/marks-recovery-2026-10-01.md`.

## Focus & foundation — 2026-09-04

**The app now does one thing at a time.** First open asks for your exam board, subjects and exam dates — everything else is built from that. Today shows a single bounded session (15–25 minutes, then stop) instead of a dashboard of spec points, and every flashcard hands you an official-style exam question on the same point, so revision always ends in exam practice, not just recall.

**Honest progress, plain language.** Topics are described as *covered / shaky / untouched* rather than raw FSRS numbers. A pace forecast says what is realistically reachable before your exam date — no invented pass percentages. Weekly weak-topic exams are built from your last seven days of missed marks.

**Exam technique, not just knowledge.** Mistakes are split into *knowledge* vs *answering*; when answering is the leak, Today steers you into timed practice with a recommended session length. As an exam enters its final 42 days the strategy shifts through countdown phases (with a notice when timed papers start beating new topics), and paper selection follows your target grade — each recommended paper explains its weakest factor, with a direct link to the fix. Sat papers feed real scores back into predictions.

**A safer content foundation.** All content ids now live in a `cnt:` namespace, ending the id-collision class that once let tooling wipe the question bank. Existing devices migrate automatically and self-heal if an upgrade is interrupted; syncing pulls from other devices are remapped too.

**Under the hood:** startup recovery and repair for damaged local data, cross-device sync with Lamport ordering and idempotency keys, an offline commute pack, and optional end-to-end encryption for synced data.

### What's new banner (in-app copy)

- **One thing at a time** — pick your exam board, subjects and dates; Today builds the plan from there.
- **Sessions that end** — 15–25 minutes of due cards, then stop, with an exam-style question after every card.
- **Plain-language progress** — see topics as covered, shaky or untouched, and a realistic pace to your exam date.
- **Technique, not just knowledge** — timed practice when answering is the leak; papers chosen to hit your target grade.
- **Nothing to migrate** — your data updates itself, self-heals if interrupted, and syncs safely across devices.
