# Changelog

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
