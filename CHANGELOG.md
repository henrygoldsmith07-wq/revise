# Changelog

## Repair-plan links do what their labels say, and Schedule shows one plan — 2026-10-15 (twenty-third pass)

**"Guided application", "Unaided exam question" and "Timed question" all
opened the same plain practice hub.** After #64 "Start: Guided application" is
often the one next step after a lost mark, but `/practice` ignored `guided=1`
and `timed=1` (and the unaided step had hints on offer). At 360px the student
landed on "Exam questions" with the wrong-answers card, weak-topic exam, marks
at risk, ledger and quick sessions above the question.

- `src/domain/practice-step-mode.ts` (pure): parses `guided=1` / `timed=1` /
  `unaided=1` and `command=`; a flag never overrides a retest, far-transfer
  check, recall mode or adaptive rung. Timed and unaided allow no hints.
- Guided: the question's own hint rungs below the worked solution (cue,
  "think about", answer structure, all from `buildHintLadder`) are shown
  before the answer box, and recorded on the attempt as used, so mastery
  weights it as supported practice. Nothing new is authored.
- Timed: `ExamPaceTimer` counts up against 90 s a mark (the baseline the
  response-time calibration already uses), never auto-submits, and freezes
  at marking. `command=` (from the plan's command-word check) puts questions
  using that verb first and says so when the topic has none.
- A step page is a short focused try: at most three questions
  (`STEP_QUEUE_LIMIT`), with the hub cards, topic filter, subject switcher
  and "other ways to practise" hidden and "Practise normally instead" to
  leave. At 360×760 the question now starts at y≈380 (was below ~1,500 px
  of hub cards and a 151-question navigator).
- The plan's exam-style link now carries `unaided=1`.

**A fresh student's Schedule showed two blocks at the same time.** Onboarding
saves exam dates (which fires the dynamic replan) and then rebuilds the plan
from a callback captured before those saves. Both `replacePlan` calls read the
existing rows before either wrote, so neither removed the other's: a fresh
four-flagship profile had 238 rows with 14 exact duplicates and two blocks at
16:00 and 16:30 today (probed in IndexedDB on a production build).

- `src/data/repository.ts`: plan replacements run one at a time, so the later
  plan replaces the earlier one (a failed write does not block the next).
- `src/state/planning.ts`: `regeneratePlan` reads the latest committed
  snapshot, so onboarding's rebuild includes the exam dates it just saved.
  Existing doubled plans clear on the next rebuild.
- Schedule week headers read "Week of 12 Oct – 18 Oct" (was
  "WEEK OF 12 OCT – 2026-10-18"), and Today's blocks say they are the
  long-range plan and link to the Today screen's one recommendation, which
  is chosen from the latest answers and can differ.
- `/teacher` redirects (temporary) to `/classes` instead of a 404.

## A lost practice mark gets one next step, and the repair plan stops calling a first mistake a repeat — 2026-10-15 (twenty-second pass)

**After a wrong practice answer, five blocks competed to be the next step.**
Walked as a fresh four-flagship student at 360px on a production build
(`/practice?question=…`, deliberately wrong answers, real offline marking):
the result stacked a guiding question (whose authored text repeats the missed
points), "What you missed", "How to fix it", "What this taught us" (promising
"two targeted items on exactly this point" that practice never delivers, then
giving a below-threshold possible cause twice), the optional structure drill
added in #61/#63, and a four-step repair plan with its own Start and Then
buttons. The plan led with "Fix the misconception — the same wrong idea has
cost marks more than once here" after the student's first wrong answer, while
the guiding-question panel above said no known misconception matched.

- `src/domain/practice-next-step.ts` + `src/components/PracticeNextStep.tsx`:
  one "Your next step" card with one primary button. An actionable
  (above-threshold) structure diagnosis of this answer opens its technique
  drill; otherwise the repair plan's first step; otherwise no button. The
  guiding question, fix list, heuristic shape drill (never primary), the rest
  of the plan, objective pills and the mistake-log note are under "More help
  with this answer". The guiding question mounts only when that is opened, so
  an opted-in AI request is never made for a closed panel. Full-mark and
  in-check results are unchanged.
- `src/state/question-execution.ts`: the lost-mark default now says what
  happens (missed points saved as mistakes that come back for review) instead
  of promising micro-practice; the uncertain cause is no longer appended to
  the action text (the result shows it once, marked "not certain").
- `src/domain/learner-intelligence.ts`: `recurringMistakes` counts open
  mistakes whose misconception (library entry, else tag; "other" excluded)
  appears on at least two different questions. It counted every labelled
  mistake, which is what made a first loss a "repeat".
- At 360px the marked result went **2,165 → 906 px** (Physics explain,
  0/3) and **2,054 → 1,087 px** (Maths show-that, 0/6). Measured on the
  production build before and after both changes.
- Tests: `tests/practice-next-step.test.ts`, `tests/recurring-mistakes.test.ts`,
  `e2e/practice-next-step.spec.ts`; `e2e/repair-loop.spec.ts` opens "More help"
  to reach the tentative drill.

## Wrong-answer feedback lists what you missed once, and a check keeps to its own next step — 2026-10-14 (twenty-first pass)

**A wrong answer got 1.8–2.4k px of marking that said the same thing about
five times.** Walked as a fresh Biology student at 360px on a production
build (quick check, deliberately wrong answers): each missed mark-scheme point
appeared in the part list, the part comment ("No marks yet. The scheme wants:
…"), the examiner summary ("The scheme still wants: …"), an open evidence
list, a remediation card and the guiding-question panel. Inside the check it
also promised "Micro-practice the missed point" (which the check never does),
offered "Improve my answer", repeated an AO/level pill per missed point, and
left the live "Verb covered" chip beside a 0/2.

- `src/domain/marked-feedback-display.ts`: recognises the device marker's own
  restatements by exact match with the text it generates
  (`rubricPartComment`, `examinerSummaryParts` in `marking.ts`, output
  unchanged), so they are dropped; AI or any other wording is shown as is.
  The "no AI was involved" provenance line and any relevant common slip stay.
- `QuestionMarkedResult.tsx`: one "What you missed" list (missed first, then
  credited), evidence and model answer folded away, one objective pill per
  objective, remediation card only where "How to fix it" is not shown. Inside
  a check (`inDiagnostic`): no guiding-question panel, fix list, "What this
  taught us" box, pills or mistake-log footnote; the deferral line and the
  check's own Continue are the next step. The result heading is now an `h2`
  that takes focus when submitting dropped it to the page body.
- `QuestionRunner.tsx`: the live verb check hides once the answer is marked;
  Improve my answer is not offered inside a check (still offered in practice).
- Measured (scratch, same 3 questions, production builds): marked-result panel
  1,797 / 2,367 / 1,813 px → 558 / 724 / 558 px; whole page 2,824 / 3,548 /
  2,819 px → 1,585 / 1,790 / 1,506 px. Guards: `tests/marked-feedback-display.test.ts`,
  `e2e/marked-feedback-compact.spec.ts`.

## Marked feedback in the first check stops naming unrelated errors and pulling students out — 2026-10-13 (twentieth pass)

**A wrong answer in the quick check got feedback that contradicted itself and
a way out of the check.** Walked as a fresh Biology student at 360px on a
production build: every device-marked answer appended "Watch for the classic
error on this topic: <the topic's first common error>" — on the three-domains
recall probe that was "Confusing species richness with diversity", directly
below "No known misconception matches this answer". Each wrong answer also
showed a full repair plan with its own "Start: Guided application" button
after question 1 of 4, and the device footer printed literal underscores.

- `src/domain/common-error-relevance.ts`: a topic common error is offered only
  when it shares two specific words (not title words or generic verbs) with
  the question's stem, prompts or mark scheme, worded "A common slip on this
  topic", never as the student's error. Flagship bank: 2,310 questions all
  got the note before; 863 now (scratch measurement, author-judged spot check:
  mostly on-point, a few still loose).
- `inDiagnostic` on `QuestionRunner`/`MarkedResult` (quick and full
  diagnostic): no repair plan or Start button mid-check; one line says the
  repair is planned from all answers when the check ends. Feedback per wrong
  answer at 360px: 3,273–4,069 px → 2,819–3,548 px tall.
- `DEVICE_MARK_FOOTER` uses `*…*`, which RichText renders as emphasis.

## Staging RLS workflow names the missing secrets — 2026-10-13 (twentieth pass)

The scheduled "Revise staging sync and RLS" run of 2026-10-13 failed because
all seven `REVISE_STAGING_*` secrets are unset (not a code or RLS bug), but
the runner printed a generic sentence. Preflight failures now name the unset
secret *names* (never values) in an error annotation, the step summary and
the artifact; driver/TLS errors still get a fixed sentence. The runbook says
how to clear it.

## A fresh profile's first taps no longer wait for the question bank — 2026-10-13 (nineteenth pass)

**On a fresh profile the first taps in onboarding waited for the question
bank.** Building `@/content` is ~1 s of main-thread JavaScript at 1× CPU and
~3.6 s at 4×, and it ran while onboarding was on screen; the 4.3k seed cards
were then installed in one ~0.3 s (1×) / ~1 s (4×) task. Measured on a
production build at 360px, alternating against `main` (0033352): first tap
1.41–1.81 s → 0.94–1.27 s at 1×, 4.68–5.45 s → 1.84–2.21 s at 4× (CDP
throttling probably does not slow the worker, so the 4× gain is likely
overstated); longest task after onboarding 449 ms → 119 ms.

- `src/worker/content-bank.worker.ts` builds the bank for a fresh profile
  once onboarding has painted and posts the plain-data questions back once.
  Any worker error, 30 s of silence or missing `Worker` support falls back to
  the main-thread import. Returning visits keep the main-thread import.
- Modules that imported `@/content` themselves (Today's roadmap lessons, the
  marked-answer panels, the revision sheet, question execution, the AI client)
  read `@/content/misconceptions` or the loader instead, so nothing rebuilds the
  bank on the main thread; the boundary test covers every student route.
- `putMissing` does one read to find the missing rows (none on a returning
  visit) and writes them in chunks of 500, handing the main thread back
  between chunks; each chunk re-checks inside its write transaction. Wire
  tombstone hashing is skipped when there are no tombstones.
- Offline after onboarding: Turbopack bundles the worker's copy of the bank
  chunks separately from the page's, so a profile onboarded while the worker
  built the bank had only the worker's copy cached, and a later offline visit
  (main-thread import) showed "needs a connection". CI's
  `e2e/offline.spec.ts` caught it. A returning visit whose main-thread import
  fails now tries the worker before reporting the bank unavailable; the spec
  also waits for the warm load's bank before cutting the network.
- Known cost: the first returning visit after onboarding reached Today in
  1.40–1.47 s against 1.20–1.23 s on `main`, because the main thread has no V8
  code cache for the bank chunk yet (the worker built it). Later visits are
  cached again. No cheap fix was found: warming the cache means evaluating the
  bank on the main thread (~0.55 s), which would bring back the long task on
  Today that this pass removed.

## A teacher's invite link opens the reviewer portal — 2026-10-13 (eighteenth pass)

**The reviewer portal never reached a teacher on a fresh browser.** Every
route, `/reviewer/**` included, rendered inside the student shell
(`AccountBoundary` → `StoreProvider` → `AppShell`). A teacher opening
`/reviewer/pairs?subject=physics` from their invite saw "Opening your
revision profile…", then (signed in) "Use your local revision?", then the
student onboarding ("Which exam board are you studying with?"), and their
browser got a learner database in IndexedDB. The portal's server HTML was
never shown, because the account boundary renders a placeholder until a
client effect resolves. Reproduced on a production build of `main`: at
360px and desktop the onboarding showed (0.5–1.3s) and the portal text
never appeared in 8s.

- `src/components/RouteShell.tsx`: the portal renders on its own (shortcut
  registry only); every other route keeps the student shell unchanged. No
  learner profile, IndexedDB or student sync runs for a teacher. Every
  portal page and the decision API still re-check the session and the
  reviewer grant on the server; RLS is unchanged.
- `ReviewerSessionKeeper` starts the Supabase browser client on portal
  pages, which refreshes the session cookie. The student shell used to do
  this as a side effect; Server Components cannot write a refreshed cookie.
- Sign-in links that fail now say why: expired or already used
  (`error_code=otp_expired`), or opened in a different browser from the one
  that asked (Supabase's PKCE verifier lives only there). Before, the
  teacher landed silently on the same form.
- A "Code from the email" box appears after the email is sent
  (`verifyOtp`, type `email`); it works on any device once the Supabase
  Magic Link template includes `{{ .Token }}` (maintainer step,
  `docs/review-workflow.md` → *First teacher approvals*).
- After Approve / Request changes the next page says what was recorded and
  what happens next (one whitelisted word on the URL, display only); the
  confirmation used to unmount with the bar. The review screen shows how
  many decisions this reviewer has recorded and that each one saves
  immediately, so short sessions are safe.
- At phone width the decision bar is in the page flow instead of a fixed
  177px bar that hid the end of the question and squeezed the comment box
  to ~26px; checks and buttons get 44px targets. From `sm` up it is the
  same fixed bar as before.
- `e2e/reviewer-first-visit.spec.ts` (fresh 360px browser sees the portal
  from server HTML, no `revise` IndexedDB, no onboarding; the student app
  still onboards) and `tests/reviewer-teacher-journey.test.ts`.
- Not changed: two independent approvals, the six checks, every domain rule
  in `decisionProblems`, grants, RLS and the audit chain.

## The first screen paints before the question bank loads — 2026-10-13 (seventeenth pass)

**The whole authored question bank sat in the "/" shell chunk.** `@/content`
was statically imported by the store, the repository, the authored-question
reader and the search overlay, so a first visit downloaded, parsed and
evaluated ~2.2 MB of minified questions before React could paint anything:
about a second on a normal CPU, over three at 4× throttling.

- `src/data/authored-questions.ts` loads the bank on demand
  (`loadAuthoredQuestions()`): one request per page, retried once, and a
  failure is forgotten so a later call can try again. Snapshot reads and
  portable restore resolve it before opening an IndexedDB transaction.
  Misconceptions and seed cards are imported from their own small modules.
- A fresh profile's boot waits for the commit that shows onboarding and one
  painted frame before it starts the snapshot (and so the bank), so the first
  step reaches the screen first. Returning students are unaffected.
- If the bank chunk cannot be downloaded (offline before the service worker
  cached it), the student sees "Revise needs a connection to finish setting
  up", with a working Try again, instead of the storage-recovery screen and
  its "Reset this device" button. Covered by
  `e2e/content-bank-unavailable.spec.ts`.
- `tests/shell-content-boundary.test.ts` walks the real import graph
  (esbuild metafile) and fails, printing the chain, if the "/" route ever
  reaches `@/content` statically again.
- `perf:budget` route "/": 5,131,397 → 2,969,938 bytes raw, 1,353,778 →
  733,372 gzip; budget lowered from 5.4 MB / 1.42 MB to 3.06 MB / 760 kB.
- Measured on production builds of `main` and this branch, alternating runs,
  360px mobile emulation, the pass-14/15 scripts plus a DOM-insertion mark
  (Playwright's own visibility probe cannot run while the bank evaluates, so
  it reads late on this branch; a compositor screencast at 4× confirmed the
  step on screen at ~1.0–1.4s against ~3.2–3.5s on `main`). Onboarding in the
  page: 0.92–1.00s → 0.34–0.39s (normal CPU), 3.31–3.32s → 0.96–0.97s (4×).
  Unchanged within noise: the earliest a tap registers (1.42–1.52s →
  1.41–1.49s; 4.67–5.08s → 4.62–4.78s), Today after a scripted
  as-fast-as-possible onboarding (3.60–3.95s → 3.13–3.92s; 7.35–7.86s →
  7.72–7.74s) and a returning visit (1.11–1.42s → 1.16–1.46s; 3.17–3.98s →
  3.51–3.65s). With a human-paced last step the final tap reaches Today in
  0.24–0.25s → 0.20–0.23s (normal) and 0.95–1.05s → 0.57–0.64s (4×), two
  runs each. The "~1s after the last tap" from earlier passes only exists
  when a script taps faster than the bank can install.

## Correct answers in a student's own words get the marks — 2026-10-12 (sixteenth pass)

**The offline marker under-credited correct paraphrases.** It reads keyword
coverage against the scheme's own wording, so "goes up" for "rises", "four
times smaller" for "one quarter", "zero or negative" for "≤ 0" or
"inversely proportional to the square of the distance" for "∝ 1/r²" earned
nothing. The reported inverse-square answer scored 0/3.

- Equivalent wording (`PHRASE_EQUIVALENTS`, `src/domain/marking-language.ts`):
  a curated list rewrites phrases that mean the same thing in every A-level
  context to one form, on both scheme point and answer, for coverage only.
  Opposites, ambiguous words ("fall", "left", "leaves", "double", "by a
  quarter") and mark-earning terms ("diffuses into") are never merged.
- "Zero or negative" / "less than or equal to" are read as `≤` by every check,
  so the relation veto rejects "zero or positive" for a `≤ 0` point.
- An opposite claim in the new wording ("goes down" for an increase, "four
  times bigger" for a quarter) is vetoed in very short answers and in the
  labelled case a point is about ("In A, …" is judged on the sentences about A).
- Two silent zero-credit bugs: the scaffolding guard read a sentence's last
  word with its full stop ("genus." never matched the point "Genus"), and a
  point written only in notation ("P(A ∩ B) = P(A)P(B|A)") could not be
  credited even verbatim.
- Measured on a new paraphrase set of real flagship questions
  (`tests/fixtures/marking-paraphrase-set.ts`; every answer and examiner mark
  is author judgement, not a moderated mark): 50 design paraphrases
  under-credited 11 → 4 (103 → 111 of 115 marks); 13 held-out paraphrases
  written after the change 3 → 2 (26 → 27 of 29); 11 wrong answers in the new
  wording over-credited 4 → 2 (15 → 13 marks where an examiner gives 10).
  Whole flagship bank (3,170 parts): no verbatim model answer loses a mark
  (8,103 → 8,106); rubric-only model answers 71.96% → 72.27%; a same-topic
  wrong-answer probe 1,497 → 1,496 marks. The contradiction regression set
  still has no over-credited answer.
- Not fixed: answers that need comprehension rather than wording ("closer
  together" for "the gap gets smaller", "cosmological component" for "the
  expansion of the universe", number words against digits).

## Today about 3 seconds sooner on a first visit, no over-credited contradictions left, and a real "/" budget — 2026-10-12 (fifteenth pass)

**After onboarding a fresh profile still waited 4.6–4.9s (normal CPU) for
Today**, while ~4k authored questions (~15 MB) were copied into IndexedDB. A
CPU profile of that window was 76% idle: the main thread was waiting on the
writes. Those copies were also never refreshed (`putMissing` never
overwrites), so a device that installed the bank kept that version, including
any mark scheme fixed later.

- Authored questions are served from the shipped bundle
  (`src/data/authored-questions.ts`). They carry no learner state and never
  sync; the `questions` store keeps private questions (AI, imported papers)
  and retired rows. Only seed cards, which hold FSRS state, still install.
- Local and wire tombstones still hide an authored id. Nothing on disk is
  rewritten or dropped: an old device's copies stay where they are, unread,
  and the current authored version supersedes them. Portable restore treats
  authored ids as present and never writes an export's older copy.
- Same snapshot: on a fresh profile the served questions deep-equal what the
  old install-then-read path produced, in the same key order
  (`tests/authored-questions.test.ts`).
- Measured on production builds of `main` and this branch, same scripts as
  pass 14, 360px mobile emulation, alternating runs: Today visible after
  navigation 6.94/7.19s → 3.62/3.99s (normal CPU) and 11.85/11.40s →
  7.57/8.39s (4× CPU); last onboarding tap → Today 4.60/4.90s → 1.28/1.81s
  and 5.84/3.96s → 1.10/0.92s; quick-check path to the diagnostic
  7.18/7.41s → 4.00/4.14s. Onboarding-visible and returning-visit times did
  not change measurably. Numbers and method are in PR #53.

**The last two contradictions in the marker regression set were
over-credited (2 answers, 3 marks)**, both Physics. Authored "do not accept"
rules now cover the inverse-square fallacy item (in the reasoning-depth JSON;
`1/r` is rejected unless the answer states `1/r²`, `1/r^2` or "inverse
square") and the thermal-storage log (all eight Physics specs). The set now
has none; no model answer trips a rule; held-out correct answers lose no
mark. The reasoning-depth fingerprint guard proves the rules are the only
change to that item.

**`perf:budget` reported the `/` route as 0.55 MB** because it counted only
the root files. It now also measures the route's layout and page entry
chunks from the client reference manifest: 5.12 MB raw / 1.35 MB gzip,
budgeted at 5.4 MB / 1.42 MB. The content bank is still in the shell chunk.

## A cold start in about a second, and Start in the first viewport — 2026-10-12 (fourteenth pass)

**After the thirteenth pass a fresh 360px profile still waited 2.6–2.8s
(normal CPU) and 10.4–10.8s (4× CPU throttle) before onboarding appeared,
and returning visits waited the same.** A CPU profile of the boot showed the
main thread busy, not waiting: the content bank is built when the content
module first evaluates, the app shell imports it statically, and most of that
build was spent in authoring helpers rather than in the content itself.

- `hasPhrase` (`src/content/questions/wjec-quality-authoring.ts`)
  re-normalised the same prompt and compiled a fresh `RegExp` for every
  candidate phrase. It now normalises each prompt once and compiles each
  pattern once; the matching rules are unchanged.
- `provenanceFor` scanned every operation word even when a carried reasoning
  token made the result unused; it now scans only when it is needed.
- `equationFragments` (`src/domain/subject-assessment-semantic.ts`) used a
  global pattern whose backtracking was quadratic in sentence length; it now
  splits on the same delimiters, with identical results.
- Same output: the sha256 of the serialised authored questions, seeded cards
  and misconceptions is unchanged. `tests/content-boot-cost.test.ts` checks
  the new `equationFragments` against the old pattern on every authored text
  plus 2,000 generated strings, and the cached matcher against stale state.
- Measured on production builds of `main` and this branch, same script, 360px
  mobile emulation: bank build in Node 2.6–2.7s → 0.8s; onboarding visible
  2.6–2.8s → 1.0–1.3s at normal CPU and 10.4–10.8s → 3.4–4.7s at 4× CPU;
  a returning visit's main view 2.7s → 1.2–1.3s (normal) and 9.2s → 3.6s (4×).
  Numbers and method are in PR #52.
- The bank is still in the shell's 3.6 MB chunk and is still installed into
  IndexedDB after onboarding (about 4.7s before Today on a first visit).
  Moving it off the boot path is the next step, not done here.

**Today's Start button was below the fold on a 360 × 760 phone** (it ended
at y=876; the fixed bottom nav starts at y=694), behind a tall greeting card
and four lines of reasons.

- `AdaptiveSessionHero` puts Start straight under the subject, topic and exam
  line, as `BestNextStep` already did. The provisional note, lifecycle, "In
  this session" and "How" lines follow it, unchanged and still visible.
- `TodayWelcome` is compact below the `sm` breakpoint (no "Today" eyebrow,
  which the bottom nav already shows; smaller heading and padding).
- Start now ends at y=483 (y=462 at 360 × 640). A new check in
  `e2e/narrow-360.spec.ts` fails on `main` ("Start ends at y=876, fold at
  694") and passes here.

## A first visit opens in about 3 seconds, and "due" means owed everywhere — 2026-10-12 (thirteenth pass)

**A brand-new profile on a 360px phone profile waited 8.8–9.0s (normal CPU)
and ~19s (4× CPU throttle) behind "Loading your revision data…" before the
first onboarding step appeared.** A CPU profile showed the main thread idle
for most of that time: it was waiting on IndexedDB while the content bank
(~4.6k cards and questions) installed, and `putAll` made two tombstone reads
per row on top of each write.

- Onboarding no longer waits for the bank. `StoreProvider` reads the one
  `onboardedAt` row in parallel with boot and renders the onboarding flow
  for a never-onboarded profile from the first frame; the store actions
  arrive when the snapshot is ready, and a final click before then is held
  ("Finishing setting up your subjects…") rather than dropped. Nothing is
  saved early; returning students still wait for the full snapshot.
- `putMissing` (`src/data/db.ts`) installs the bank in one transaction that
  reads existing ids and tombstone keys itself, so existing rows are never
  overwritten and deleted content is never resurrected, with two key-range
  scans instead of ~9k per-row reads. The legacy content-id check on every
  boot reads keys rather than whole rows.
- Measured with the same script before and after (production build, 360px
  mobile emulation): onboarding visible 8.8–9.0s → 2.9s at normal CPU and
  19.0s → 8.9–10.0s at 4× CPU. Numbers and method are in PR #51.
- The twelfth pass stopped Today counting installed, never-studied cards as
  owed reviews; the rest of the app still did. The recommender
  (`RecommendationCard`, `RevisionTwinCard`, `CountdownPhaseBanner`),
  `store.dueCards` (the nav badge and Practice's "Review cards (N due)") and
  per-topic `cardsDue` (Library pills, knowledge map, topic status) now use
  `isDueReview` too. `/review` still introduces new cards itself.
- Today's subtitle said "chosen from your answers so far" to a student with
  no answers; it now says so only once there are answers.
- Tests: `tests/seed-boot.test.ts`, plus recommender and mastery tests whose
  fixtures had studied cards (`reps > 0`) still in the New state.

## A first visit no longer opens on a fake card backlog — 2026-10-12 (twelfth pass)

**A phone walk-through of a brand-new profile (375 × 812 and 360 × 800)
that skipped the quick check landed on "Complete your Mathematics reviews —
194 cards due; the later they are done, the more you forget", marked "This
is backed by solid recent evidence."** None of it was true. The 194 were
the seeded deck, which is installed due on day one and had never been
studied; Today counted them as owed reviews, and because every topic had
seeded cards it also treated every topic as already started, so the
"learn an unstarted topic" candidates never reached the engine.

- `isDueReview` and `studiedCardTopicIds` (`src/domain/scheduling.ts`): an
  owed review is a card studied at least once whose interval has run out;
  a topic counts as started only when one of its cards has been studied.
  This is the line `subject-allocation.ts` and the daily queue already drew.
- The adaptive session planner (`scoreTopic`, `src/domain/adaptive-scoring.ts`)
  used the same count, so the session it built opened with "3 due
  retrievals" and "9 cards are due for review" on a topic never studied; it
  now counts owed reviews only.
- Today's plan (`useRevisionPlan`, `src/components/recovery-evidence.ts`)
  uses both. Re-walked on the rebuilt app, the same first visit now opens on
  a marked session in Mathematics · Algebra and functions, labelled
  "Provisional: you have no marked answers on this topic yet, so it was
  chosen from how much of the specification this topic covers."
  Cards still appear in their own review queue; nothing was deleted.
- Removed a design note that had leaked into the last onboarding step ("you
  will leave thinking that, not that you configured a dashboard").
- Tests: `tests/first-visit-recommendation.test.ts`, and a 360px Playwright
  check that a skip-path first visit is offered a marked session, not "cards
  due".

## Mark schemes can say "do not accept" — 2026-10-12 (twelfth pass)

**Sixteen wrong answers in the regression set still earned offline marks
because no general check can see them**: swapped Type I/II definitions keep
every word of both points, "antipodal cells" is a wrong structure rather than
an opposite word, and "Percentage uncertainty = measured value ÷ uncertainty"
keeps every word of the right formula. WJEC mark schemes handle these with
"do not accept" notes beside a point; the bank now can too.

- `QuestionPart.rejects` (optional, backward compatible): per-point
  `MarkSchemeReject` rules with phrases, an optional `except` list, an
  optional whole-answer `scope` (for orderings) and a learner-facing reason.
  Validated by `defineQuestion` and `contentQuestionPartSchema`.
- `src/domain/marking-reject.ts` applies them. A phrase must appear in one
  clause, in order ("…" skips up to six words; a word of four or more letters
  covers its longer forms). A negated phrase ("not osmosis", "rather than",
  "fail to reject") is a contrast and never vetoes. Rules only remove credit:
  the offline marker drops the point and says "the mark scheme does not
  accept “…” for this point" with the reason; on an AI mark the point is
  contested, so the mark is provisional.
- The AI marking prompt gets each rule as a "Do not accept" note under its
  point (bounded in egress, schema-checked server-side; the student answer
  stays in its untrusted fence). The semantic-cache and DLQ scheme hash
  include the rules only when a part has some, so other parts' cached marks
  are unaffected.
- Rules authored for the 15 recall probes behind the regression set's known
  gaps. Regression set: over-credited contradictions 18 answers (23 marks) →
  **2 (3 marks)**, both Physics items that have no rules yet. Held-out
  answers written for this pass (20 correct, 12 wrong, worded differently):
  no correct answer loses a mark to a rule; wrong answers over-credited 7 →
  0. No model answer in the bank trips a rule. Marks are hand-judged, not
  moderated.
- Not changed: proof predicates, review gates, verification status (every
  probe is still unverified), the general contradiction checks.

## Fewer wrong answers earn offline marks — 2026-10-11 (eleventh pass)

**Writing a plainly wrong answer for each of the 40 new recall probes showed
the offline marker still crediting 19 of them.** "H₀: ρ = 1 and H₁: ρ < 0"
scored 2/2 for "H₀: ρ = 0, H₁: ρ > 0"; "dm/dt = km, so m = Ae^(kt)" 2/2 for
exponential decay; "Al₂O₃ is basic only. P₄O₁₀ is basic" 2/2 for
"amphoteric … acidic".

- A digit that belongs to a name is no longer numeric evidence on its own.
  A scheme point whose only digits are subscripts or formula digits (H₀,
  Al₂O₃, H₃N⁺CH₂COO⁻, V₁) used to be credited by any shared digit in the
  answer; now that only counts when one of those names is in the answer
  (`pointStatesNumber`, `namedDigitsPresent` in `src/domain/marking.ts`).
  Powers (v², ½kx²) still count as stated numbers, because formula points
  in the bank rely on them.
- New contradiction checks in `src/domain/marking-contradiction.ts`, each
  only removing credit: an equation identical to the scheme's apart from
  its + and − signs ("dm/dt = km", "xₙ + f(xₙ)/f′(xₙ)"); a population
  parameter set to a different value ("ρ = 1" for "ρ = 0"; ρ, μ, σ, λ only,
  since unknowns such as x take several values in working); a different
  numeric ratio ("1 : 1" for "3 : 1"); a different whole-number count of the
  same thing ("38 ATP" for "2 ATP", never a unit); Greek letters inside
  relations, so "ρ < 0" is read as the flip of "ρ > 0"; and opposite pairs
  rational/irrational, full/partial, same/different and acidic/basic/
  amphoteric, plus shortens/lengthens. A different stated value now
  overrides the symbolic layer, which called "M : M+2 = 1 : 1" equivalent
  to "3 : 1" through a shared fragment.
- Regression set `tests/fixtures/marking-contradiction-set.ts` grows to 164
  answers (67 model, 19 paraphrased-correct, 78 contradictory). Before:
  24 contradictory answers over-credited (35 marks). After: 18 (23 marks),
  every one a documented `knownGap` (swapped definitions, wrong structures
  that are not opposites, quantifiers). No contradictory answer is
  under-credited and all 19 paraphrases keep full marks.
- Whole bank, every authored model answer submitted verbatim: no part loses
  a mark. See the PR for the paraphrase-proxy measurement and the three
  parts whose proxy credit came only from unrelated digits.
- Not changed: proof predicates, review gates, the anti-recitation cap, the
  Physics reversal guards and the structured-notation path (√2, ±, ≤).

## Every flagship topic has a recall question — 2026-10-11 (eleventh pass)

**A recall gap and an application gap looked the same in 40 topics.** Early
diagnostics probe recall first and escalate to application
(`diagnostic-intake.ts`). Before this pass 12 of 23 Maths, 14 of 25 Biology
and 14 of 23 Chemistry topics had no recall-level question, so those topics
could only be probed at application level.

- 40 new recall probes in `src/content/questions/wjec-recall-probes.ts`, one
  for every remaining topic (Maths 12, Biology 14, Chemistry 14), using the
  ninth-pass pattern: two-mark definitions or standard results mapped to one
  capability node and its spec point, with a visible model answer. Examples:
  Type I/II errors, Newton–Raphson, F ≤ μR, double fertilisation, Taq
  polymerase, ΔG = ΔH − TΔS, the silver nitrate halide test.
- Original practice content, not board questions: every item is
  `unverified`, has no reviewer and is not proof-eligible until two
  independent teachers approve it in the reviewer portal.
- Recall coverage is now 23/23, 25/25 and 23/23 topics (Physics was already
  19/19). Authoring backlog refreshed: "core if every approvable question
  were approved" moves from 12/87 to 16/87 (Maths), 10/114 to 11/114
  (Biology) and 14/108 to 17/108 (Chemistry); none of it is approved.
- Writing them exposed a marker weakness: hand-written wrong answers to 17
  of the 40 still earned marks offline (see the next entry).

## The offline marker stops crediting answers that contradict the scheme — 2026-10-11 (tenth pass)

**Short wrong answers were scoring full marks.** With no AI provider (or
offline), the rubric marker credits a scheme point when enough of its words
appear in the answer. Half of "Pulmonary vein" is "pulmonary", so
"Pulmonary artery, right atrium" scored 2/2; "b² + 4ac" passed for
"b² − 4ac", "< 0" for "> 0", "centre (−3, 2), radius 25" for "(3, −2), radius
5", and "both alleles are not expressed" for "both alleles are expressed".

- New pure module `src/domain/marking-contradiction.ts`. Per scheme point it
  checks for an opposite term next to the point's subject (artery/vein,
  left/right, atrium/ventricle, oxidised/reduced, anode/cathode,
  endo/exothermic, nucleophilic/electrophilic, donor/acceptor, α/β cells,
  insulin/glucagon and ~30 more groups), a negation of one of the point's
  own words, a flipped sign in an expression, a flipped inequality, a
  different coordinate or named value (radius, roots, gradient …) where the
  scheme's value appears nowhere, and a different chemical formula (NH₂⁻ for
  NH₃). It only fires when the scheme's own term or value is absent, so a
  contrast ("the vein, not the artery") is left alone. It only ever removes
  credit.
- `markPart` applies it as a veto after the existing polarity check; the
  authored-model-answer shortcut no longer passes an answer that contradicts
  a point (its term-order canonicalisation made "1 − 2cos²θ" look like
  "2cos²θ − 1"). The symbolic layer's "equivalent" stays decisive only for a
  point that is a bare expression: on prose points it extracted a fragment
  and called "b² + 4ac" equivalent to "Discriminant = b² − 4ac".
- Scope, chosen from false-positive measurements on every model answer in
  the bank: wording checks (opposite terms, negation) run on answers of up
  to 40 words, whole-answer only up to 15; Physics parts, which have their
  own reversal guards and long multi-claim answers, get the general veto
  only for answers of up to 15 words. A negation inside a conditional
  sentence ("If substrate runs out, the rate need not double") is a
  qualification, not a reversal, and the verbatim model answer always keeps
  the authored-answer shortcut.
- Evidence now says why: "Not awarded: your answer says “artery” where the
  mark scheme needs “vein”." A credited point whose answer hedges between the
  right term and its opposite ("the pulmonary vein or the pulmonary artery")
  is flagged `contested`, and the deterministic assessment then labels the
  whole mark provisional instead of presenting it as firm. The AI path's
  `answer-evidence` check fails softly on the same flag, so an AI mark that
  credits a contradicted point is shown as provisional, never as "checked".
- `pointCoverage` no longer misses a short scheme term because the answer's
  last word carries a full stop ("E(X) = np." scored 0 for "E(X) = np"). The
  anti-recitation cap still reads `tokenise` exactly as before, so it is not
  loosened.
- Regression set `tests/fixtures/marking-contradiction-set.ts`: 27 real bank
  questions, 74 answers (27 model, 9 paraphrased-correct, 38 contradictory)
  with hand-judged examiner marks (not human-moderated). Before: 30 of 38
  contradictory answers over-credited (35 marks), 8/9 paraphrases at full
  marks. After: 5 over-credited (7 marks), all documented known gaps; 9/9
  paraphrases at full marks; no contradictory answer under-credited. On
  every model answer in the bank the veto fires on 1 of 13,288 scheme points.
- Not changed: copied-mark-scheme detection (`textOverload`), the
  anti-recitation cap, proof predicates and review gates. The veto can only
  lower a rubric mark.

## Readiness explains "Proven" next to unrecovered marks — 2026-10-11 (tenth pass)

Both signals were right but scoped differently: "Proven"/"Secure" (and an
"improved on new questions" claim) describe a topic as a whole, while "N
marks lost and not yet recovered" counts specific questions not yet won back.
`buildProgressSummary` now reports `losing.inStrongTopics` and a one-line
`scopeNote` when they overlap, and each strong topic row carries its
`openMarks`. The Progress summary shows "N lost marks here still to win back"
beside the badge and the scope sentence under the lost-marks total. No stage,
proof rule or total changed.

## Missions stop promising proof the lost marks can never give — 2026-10-11 (ninth pass)

**"Awaiting proof" was a dead end.** A mission decided whether proof was
possible only from question supply. But proof of recovery also needs the
*loss itself* to be trusted evidence (`trustedAssessmentMistake`): a WJEC
paper-mode loss needs a verified past paper and human-reviewed marking
(`authenticPaperEvidence`), and any flagship loss needs a teacher-reviewed
source question and a reliable mark. When that failed, an unaided success on
a different reviewed question stayed "provisional" forever, yet the mission
still read "Awaiting proof" and offered the apply step again.

- `mark-recovery.ts`: each review-gated loss that fails the gate now carries a
  `proofBarrier` (`loss-unverified-paper`, `loss-unreviewed-question`,
  `loss-untrusted-mark`, `loss-unlinked`) with plain wording. It is computed
  only after `trustedAssessmentMistake` has already said no: no state, total
  or predicate changes.
- `buildMission`: when every loss in a mission is barred, proof is reported
  impossible whatever the supply (new evidence limit `loss-not-provable`,
  named first), the mission is never "awaiting proof", the apply step becomes
  "Answer unaided on a different question (practice)" (and runs on unreviewed
  unseen questions rather than emptying), and the delayed check becomes
  "Spaced practice checks", blocked with the reason. Today then routes to the
  existing spaced practice Revisit ("Check it held: …") with the barrier as
  the evidence limit, instead of blaming question supply.
- The same supply-only reasoning was fixed on the mission card (no more
  dead-end with no button: "Practise it (not proof)"), Today's "Evidence
  limit", Progress's improvement story ("on the way … waiting for that check"
  no longer counts barred marks), and the paper autopsy stage reason. A
  blocked mission with marks recovered in practice now reads "Improving", as
  each lost mark already did.
- `e2e/paper-recovery-journey.spec.ts` now asserts this honest state instead
  of a proof step it could never reach, and still fakes no reviewed paper.
- Test fixtures in `tests/revision-engine.test.ts` now include the marked
  attempts their losses link to; without them those losses could never have
  been proven under the existing gate.

**Recall-level probes where there were none.** Early diagnostics probe recall
first and escalate to application (`diagnostic-intake.ts`), but most WJEC
Maths, Biology and Chemistry topics had no recall-level question (by primary
topic: 18 of 23, 20 of 25 and 20 of 23), so a recall gap and an application
gap looked the same. `src/content/questions/wjec-recall-probes.ts` adds 18
original, spec-mapped recall questions (one or two AO1 marks each) on the six
highest reviewer-priority topics without one in each subject (Maths: algebra,
integration, trigonometry, coordinate geometry, distributions, kinematics;
Biology: nucleic acids, homeostasis, transport in animals, ecosystems, gas
exchange, inheritance; Chemistry: bonding, acids and bases, kinetics,
energetics, redox, hydrocarbons). All are `unverified` with no reviewer and
pass the review gates, so they are approvable, never trusted, until two
teachers approve them. Topics still without one: 12 of 23, 14 of 25, 14 of
23. Authoring backlog refreshed (`wjec:authoring:refresh`).

## Teachers can find, judge and finish the transfer pairs — 2026-10-11 (eighth pass)

**The questions that most need two teachers were invisible to them.** A
transfer question can only help prove improvement once it and its baseline
are each approved by two different reviewers. In the portal's
capability-first queue the 14 linked Physics transfer items sat at about
positions 1,371–1,384 of 1,643 "Ready for you" rows (the table renders 200)
and their baselines anywhere from 123 to 1,273, and the review screen asked a
teacher to tick "Genuine transfer" without showing the baseline.

- `/reviewer/pairs?subject=<slug>`: every linked (baseline, transfer) pair in
  a subject, baseline first, with pairs usable for proof, questions verified,
  approvals recorded (of 56 for Physics) and who still has to act on each
  question ("needs 1 more reviewer, not teacher-a"). Linked from the queue.
- Opened from the batch, Next/Skip stay in batch order and skip anything the
  reviewer already approved or that waits for an author edit
  (`nextInBatch`); the review screen shows the linked baseline (prompt, mark
  scheme, worked answer) beside a transfer question, and the transfer items
  built on a baseline beside the baseline.
- The queue table now says when it shows only the first 200 rows.
- `src/lib/reviewer/batches.ts` is ordering and context only: states come from
  `reviewStateOf`; no rule, gate or trust predicate changes.

**Smaller fixes.** Touch targets on Today at 360px: "Skip, just start
revising", "Choose how to study", "Change subjects", "View my plan", "Set up
my plan", "View full roadmap" and "Continue roadmap" are now at least 44px
tall (`min-h-11`; `e2e/narrow-360.spec.ts` passes), and the review screen
no longer tells a teacher that approving one half of a transfer pair "unlocks
nothing new": it says the pair counts only once the other half is verified
too. E2E specs updated to the current Today lead ("Do this now"), the Tools
menu's "Review <count>" label, a settings toggle that waits for hydration, and
proof journeys re-based on fixture-reviewed WJEC Biology content (approvals
written only inside the test's own browser profile), the quick check's
"Next question" step (a marked answer stays on screen until the student
continues), and the proof stage's "Start proof check" CTA.

**Known: a paper's lost marks cannot reach delayed proof without an attested
past paper.** `e2e/paper-recovery-journey.spec.ts` now runs through repair and
the unaided step on fixture-reviewed content, then stops where the trust rule
says it must: WJEC paper-mode mistakes count only through
`authenticPaperEvidence` (verified past-paper provenance plus a human-reviewed
marking attestation). The mission still labels that state "Awaiting proof" and
offers the apply step again; that wording gap is recorded, not fixed here.

**Onboarding offline sent the student back to step 1.** `finish()` called
`onDone()` (which writes the "onboarded" marker) without waiting, then
`router.push('/diagnostic?…')`. Online that is a client-side transition and
the write finished anyway; offline the RSC fetch fails, Next falls back to a
full browser navigation and the in-flight write was lost, so the reloaded app
showed "Step 1 of 5 · Board" again. `finish()` now awaits the marker before
navigating (`AppShell` passes `completeOnboarding` itself). Found by
`e2e/offline.spec.ts` "offline banner appears when offline", which reproduced
it deterministically and now passes.

**A teacher following the sign-in link landed on the sign-in form again.**
The gate is server-rendered before the browser finishes the magic-link
exchange, and the link always returned to `/reviewer`. `ReviewerSignIn` now
re-renders the server page once a session exists (the server still checks the
grant), and the link returns to the portal page that was opened
(`reviewerReturnPath`, portal paths only), so a shared batch link survives
sign-in. Needs `https://<site>/reviewer/**` in Supabase's redirect allow-list.

**Granting a teacher took the Supabase dashboard plus hand-written SQL.**
`npm run wjec:reviewer:grant` (maintainer, service role in their own shell)
finds or invites the auth account and calls `grant_reviewer_role` /
`revoke_reviewer_role`, after validating the `reviewer_roles` constraints,
refusing a label that reuses the email and the obvious self-grant.
`npm run wjec:review:pairs` shows the maintainer, who holds no reviewer
grant, which question needs which reviewer (committed log, plus verified
portal events when the service role is set). No migration.

## Full diagnostic no longer dead-ends without recall questions — 2026-10-11 (seventh pass)

**The full diagnostic could finish before asking anything.** It opened each
topic only with a trusted recall-level question. While only a handful of
questions are teacher-reviewed, none of them may be recall-level (the e2e
fixture's 24 trusted WJEC Maths questions are all application or harder), so
the student chose "Full", saw "No diagnostic answers yet, so nothing can be
said." and had nowhere to go.

- `nextProbe` falls back to the lowest-demand trusted item for a topic when
  the wanted depth has none (`fallbackDepths`): an opening or recall check
  widens upwards; any other want steps down, but never to a depth the topic
  has already answered correctly. The probe's reason says plainly that no
  reviewed recall question exists yet. The record keeps the item's real depth,
  and a miss is no longer described as "Recall is fine" when recall was never
  tested. Untrusted items are still never used.
- `diagnosticStartBlocker` names why a diagnostic cannot ask its first
  question (`no-reviewed`, `all-seen`, `all-known`); the page explains it and
  routes to Today or practice instead of showing an empty report.
- No trust gate, proof predicate or review rule changes.
  `tests/adaptive-diagnostic.test.ts` (6 new cases),
  `tests/full-diagnostic-trusted-start.test.ts` (the 24-trusted Maths fixture).

**Five circular motion/SHM transfer items were only rearrangements.** sp-01,
sp-03, sp-04, sp-05 and sp-06 in `physics-transfer-linked.ts` passed the
Physics novelty check only as inverse problems on their baseline's own
relations (`rearrangementOnly`). Each now continues into a physical relation
its baseline never uses, as one worked chain: sp-01 carries ω and r into the
centripetal force on a stone in the tread (F = mω²r); sp-03 uses the largest
logged acceleration for the amplitude and maximum speed (a_max = ω²A,
v_max = ωA); sp-04 uses the glider's mass for k = mω² and the oscillation
energy (½mv_max², checked as ½kA²); sp-05 finds the loaded chair's maximum
speed by energy conservation (checked against ωA); sp-06 predicts the period
from the k it found (T = 2π√(m/k)). Every new number is recomputed in
`tests/physics-transfer-linked.test.ts`, which now also asserts that none of
the fourteen linked items is `rearrangementOnly`. All stay `generated`,
`unverified`, reviewer null. Physics stays 14/108 (same statements).

**Submitting offline could silently do nothing.** The AI client is a separate
chunk loaded on first use. If a student's first marked answer of the session
happened offline, the import rejected, the submit promise rejected with no
handler, and the button came back as if never pressed.
`src/lib/optional-ai.ts` now marks against the mark scheme on this device
when the chunk cannot load (`aiMarkerUnavailableMark` in
`src/lib/offline-mark.ts`, the same deterministic marker and labelling as the
existing rubric fallback, which now shares its code; nothing is sent, nothing
queued). Any other submit failure now shows "That answer was not marked or
saved. It is still here, so you can submit it again." (`role="alert"`)
instead of nothing. `tests/offline-marking-fallback.test.ts`.

**Browser checks brought up to date.** `e2e/marked-feedback-visible.spec.ts`
now rates due retrieval cards and writes the explain-the-gap recall before
revealing, so it reaches the marked step; `e2e/wjec-trusted-journey.spec.ts`
asserts Today's current "Do this now" card and that its cold-start step names
the reviewed questions it rests on. Every trust assertion is unchanged.

## Spaced revisits for the returning student; Physics-aware novelty; full-diagnostic feedback — 2026-10-11 (sixth pass)

**A returning flagship student got the same Today action for ever.** Every
flagship question is still unreviewed, so a lost mark recovered on another
question stays `provisional` (`unverifiedOnly`) and its mission is blocked on
proof supply. The engine answered that by sending the student straight back
to supported practice on the topic they had just fixed ("Recover 3 marks …"),
an hour later, the next day and a fortnight later. Nothing was spaced, the
Revisit step of the loop never happened, and repeating the practice could
never change the state.

- `mark-recovery` now derives a practice revisit schedule for those items
  (`practiceRevisit`, `practiceRevisitFor`): first check 3 days after the
  first unaided success on a different question; each unaided check on yet
  another question that holds doubles the gap (capped at 30 days); a check
  that loses marks stops the schedule, because that loss opens its own repair.
  Hinted attempts, early attempts and repeats of the same question never count.
- The engine waits ("Waiting for the delay to pass: … from <date>", shown on
  Today under the next step) and then offers **"Check it held: <topic>"**,
  labelled practice, not proof, ranked below open losses of the same stake.
- No proof state, total, predicate or trust gate changes; reviewed content is
  unaffected. `tests/practice-revisit.test.ts` (9 cases).

**Physics transfer novelty compares physics.** The generic comparison reads
reasoning from Maths/Biology/Chemistry vocabulary, so on Physics it matched
chance words ("enzyme-mechanism" on an SHM energy answer, "stoichiometric" on
a rotor ride). For WJEC A-level Physics only, the subject audit now uses
`comparePhysicsTransfer` (`src/domain/physics-transfer-novelty.ts`): the
physical relations each worked solution uses (bound to the step that shows
them), the unknowns each prompt's instruction clauses ask for, and a context
change. It fails closed when it recognises no relation or unknown, and
rejects number swaps and renamed copies that solve the same relations for
the same unknowns. Other subjects keep the graph comparison unchanged.

- All 13 existing linked Physics transfers pass; 5 of them only as inverse
  problems on the baseline's own relations (`rearrangementOnly`: circular
  motion/SHM sp-01, sp-03, sp-04, sp-05, sp-06), reported as weaker transfer.
- The electric circuits sp-04 draft withheld in the fifth pass (fixed 40 W
  from a battery with internal resistance; a quadratic, chosen on efficiency)
  is authored in full and passes: Physics authored ceiling 13/108 → 14/108,
  all unreviewed and `source: "generated"`.

**The full diagnostic shows the mark, and asks confidence first.** It used to
unmount the marked result and ask "How sure were you of that answer?" in its
place. Confidence is now captured with the submit, before the reveal
(`QuestionRunner` `onConfidence`: "Not sure · submit" / "Confident · submit"),
so each calibration record is a judgement of the answer rather than a
reaction to the mark; the marked result stays mounted until "Continue".
`tests/full-diagnostic-feedback.test.ts`.

**Browser check for held feedback.** `e2e/marked-feedback-visible.spec.ts`
drives the adaptive session and the full diagnostic and asserts the result is
still visible after the replan, until Continue. The fixture-review helper the
trusted journey used is shared as `e2e/review-fixture.ts`. `completeOnboarding`
now walks the five-step onboarding: it re-clicks the board until it reports
`aria-pressed` (the dialog can paint before hydration, which left the run on
"Step 1 of 5 · Board"), steps through the quick-check and first-step phases,
and returns to Today after "Start my quick check" redirects to `/diagnostic`.
**Not yet green locally:** with that fix all three specs get past onboarding,
then fail on spec drift — the adaptive-session walker does not rate retrieval
cards; the trusted journey still expects the old "Your highest-value session"
heading; and the fixture's trusted WJEC Maths items contain no recall-depth
question, so the full diagnostic (which opens each topic with a recall probe)
finishes with no questions.

## Marked answers stay on screen; Physics baseline integrity; two more Physics transfer items — 2026-10-10 (fifth pass)

**A student never saw feedback in the two main flows.** `useQuestionExecution`
calls `onFinished` the moment marking completes. The quick diagnostic (a new
student's first marked questions) advanced to the next probe in that same
render, and the adaptive session (Today's "Start session") recorded the step
and replanned, swapping the step panel out. Either way the marked result —
the mark, the points missed, the model answer, "How to fix it" — unmounted
before it could be read. README promised "lost marks appear immediately".

- `QuickDiagnostic` holds the marked attempt until the student taps
  "Next question" / "See what I found" (sticky above the phone nav, mark
  announced via `role="status"`).
- The adaptive session holds a marked step (`heldStep`) on screen until
  "Continue"; the record and the replan still happen at once, the completion
  screen waits, and a retest that resolves its mistake no longer remounts the
  question.
- Tests: `tests/quick-diagnostic-feedback.test.ts`,
  `tests/adaptive-session-feedback.test.ts` (source-level; there is no React
  test renderer in the repo). The WJEC trusted-journey e2e now asserts the
  mark is visible before continuing; it was not executed here (no Playwright
  browsers in the sandbox).

**Physics baseline integrity.** `validateBaselineIntegrity` rejected 9 of 11
Physics transfer baselines because its step families only knew
Maths/Biology/Chemistry vocabulary. For Physics only it now also accepts
`physicsWorkingNodes`: a supplied quantity with a unit, a substitution into a
relation (a number in standard form alone does not count) and a result with
its unit, each bound to a real span. `deriveVerifiedGraph` and every novelty
comparison are unchanged; other subjects' verdicts are unchanged (pinned by
test). Physics transfer parts with an explicit baseline link now go through
the transfer block of `auditFlagshipSubject`; all pass. The spring-period
baseline's model answer now shows its working.

**Reference-tier learning actions are practice-only.** `selectLearningAction`
labelled any item passing the permissive `trustedAssessmentContent` as
`trusted-assessment`; the label now requires `learnerEvidenceTrusted`, and
reference items (still available, including transfer/retention practice) are
`practice-only`.

**Two more linked Physics transfer items** (electric circuits sp-02: divider
worked backwards plus meter loading; electromagnetic induction sp-01: field
from search-coil charge). Physics authored ceiling 11/108 → 13/108, all
unreviewed. A drafted circuits sp-04 item was withheld: the novelty heuristic
rated it not novel because Physics derived graphs are nearly empty.

## Reference-tier mastery says "practice"; nine more linked Physics transfer items — 2026-10-10 (fourth pass)

**A reference-tier topic could still show "Proven".** `masteryStage`
(Progress → "What am I strong at?" and the topic counts under it) judged
evidence with `trustedAssessmentAttempt`, which is permissive for subjects
with no review gate. A correct, unaided, delayed answer on an unreviewed
reference question therefore produced a green **Proven** pill, the claim
#40 removed from the proof ledger but which survived in this layer.

- Reference topics now top out at Secure, labelled **"Secure in practice"**
  (`stageLabel`), with a next step that says why the topic cannot be proven
  there; the topic-count line notes how many "secure" topics rest on
  reference practice only (`practiceOnlySecure`).
- The specification map (`/readiness/spec`) carries `referenceTier`: the
  eyebrow reads "Practice layer", the reference disclaimer is shown, and
  "Secure" / "Secure but stale" become "Secure in practice" (`specStatusLabel`).
- Paper readiness flags `referenceTier`: "secure in practice", "done well on
  unfamiliar practice questions (practice, not proof)", "Next step" instead of
  "Next proof", and "Practise it on an unfamiliar-context question" instead
  of "Prove it…".
- Flagship behaviour and every proof predicate are unchanged.
  `tests/reference-tier-mastery-wording.test.ts` (7 cases, all fail on the
  previous code). `mastery-stage` and `progress-summary` fixtures use a
  non-flagship id, so their "proven"/"Secure" expectations moved to a reviewed
  flagship fixture or to the practice label.

**Nine more Physics transfer items with a real baseline.** Capacitance
sp-01..03 and circular motion/SHM sp-01..06, the statements
`wjec:authoring:plan -- physics` ranked next, in
`src/content/questions/physics-transfer-linked.ts`. Each links to an existing
application/calculation part of the same capability and passes the
structural-novelty comparison on independently derived graphs (the stricter
check that withheld the sp-02 draft last pass); tests recompute every worked
number. `source: "generated"`, `verification: "unverified"`, no reviewer.
Physics authored ceiling 2/108 → 11/108. The deeper `validateBaselineIntegrity`
check still rejects 9 of the 11 baselines (the verified-graph derivation finds
no evidence/conclusion nodes in most Physics model answers); it is not applied
to Physics and was not changed.

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
