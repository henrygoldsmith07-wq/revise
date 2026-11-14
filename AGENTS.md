# AGENTS.md

Notes for agents working in this repository. Everything here was checked against
the code on 2026-10-17; if a command below stops existing, update this file in the
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
  Rename nothing and drop nothing, so old rows stay readable by every later
  build. An *older* build cannot open a newer database at all (IndexedDB
  VersionError); that is shown as "this tab is running an older version —
  reload" (`src/data/db-notice.ts`), and an old tab closes its connection on
  `versionchange` so the new one can upgrade. Any store that reaches the
  server needs a migration before a client ships.
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
  (5.13 MB → 2.97 MB raw); the curriculum topic tree is the largest piece
  left. The 28 reference subjects build from four shared outlines in
  `src/domain/curriculum/outlines` (forty-sixth pass, → 2.41 MB raw); never
  paste an outline back into a subject module. Lower the budget as more
  leaves; never raise it to fit a regression.
- **AQA's four A-level sciences and maths follow AQA's own specification**
  (one-hundred-and-ninth pass). `boardOutline` (`src/domain/curriculum/board-outline.ts`)
  places the shared outline topics, plus the science's extra topics
  (`outlines/*-extra.ts`), under the board's sections with its own titles and
  references (`src/domain/curriculum/boards/`). Topic ids and statement ids
  never move: a statement keeps `sp-NN` from its outline position, `null`
  drops one the board does not examine (only if no question cites it), and
  added statements are appended. `tests/board-structure.test.ts` checks units
  and section coverage against lists transcribed from the AQA PDFs, and that
  every board-added topic has an authored question
  (`src/content/questions/aqa-alevel-board-topics.ts`); the shared question
  templates skip board-added topics (`tests/fixtures/board-added-topics.ts`).
  Edexcel, OCR and every GCSE still use the WJEC-derived outline. Do the next
  board the same way, from its published PDF, and add it to
  `BOARD_STRUCTURED_SUBJECTS` (honest labelling) in the same commit.
- **GCSE physics builds from the DfE GCSE subject content, not the A-level
  outline** (one-hundred-and-nineteenth pass). `GCSE_PHYSICS_OUTLINE`
  (`src/domain/curriculum/outlines/gcse-physics.ts`) is the DfE document's
  physics bullets under its own headings; every board's GCSE physics uses it
  (`GCSE_SUBJECT_CONTENT_SUBJECTS` in `honesty.ts` labels it, and WJEC's
  label says its Welsh GCSE is regulated separately). Its slugs must never
  match an A-level slug: seed cards install once by id and are never
  rewritten. A seed card whose topic has left its loaded subject is retired
  (`src/domain/card-retirement.ts`), hidden by the store, never deleted.
  Every GCSE physics question passes `scopeGcseQuestion`
  (`src/content/gcse-question-scope.ts`): a shared template is retagged to
  a GCSE statement or withheld (`null`), an unplaced template is withheld
  and fails `tests/gcse-question-scope.test.ts`, and the
  `gcse-physics-course-` pack is written for the outline directly. Do
  biology, chemistry and maths the same way: their GCSE trees are still the
  A-level ones.
- **Reference subjects' topic trees load on demand** (one-hundred-and-tenth
  pass, `/` → 2.24 MB raw / 652 KB gzip). Every subject's metadata is
  registered at startup from `src/domain/curriculum/catalog.ts`; only the four
  WJEC flagships register their topics eagerly. Any other subject's units and
  topics arrive through `ensureSubjects(ids)` / `loadAllSubjects()`
  (`registry.ts`); until then `topicsFor`/`unitsFor` return `[]` and
  `getTopic` `undefined`, as for an unknown subject. The store loads the
  learner's own subjects before seeding (`ensureSeeded`), `updateSettings`
  loads a newly enrolled one (`installSubjects`), onboarding preloads all of
  them in idle time so an offline enrolment still works, and `CurriculumGate`
  (in `RouteShell`) holds a page opened with `?subject=`/`?topic=` for another
  subject until it has loaded. Server code that renders any subject (the md
  twins, `llms*.txt`, `/api/ai`), scripts and the domain worker call
  `loadAllSubjects()`; tests get it from `tests/setup-curriculum.ts`.
  Anything new that reads another subject's topics on the client must ensure
  it first. A new reference subject needs a catalogue entry and a loader in
  `index.ts` (`SUBJECT_LOADERS`).
- **Desired retention lives on each grade event** (one-hundred-and-eleventh
  pass, `src/domain/desired-retention.ts`). `gradeCard`/`previewIntervals`
  take the learner's target (`UserSettings.desiredRetention`, default 0.9),
  the event records it as `retention` when it is not 0.9, and
  `syncCardState` replays each event at its own target. Anything new that
  grades or replays a card must pass the target through, or a sync silently
  resets intervals to 90%. The target never changes stability or difficulty.
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
  `tests/marking-contradictions.test.ts`; neither may get worse. The list
  now also maps common reagents' formulae to their names (NaOH, CuSO₄, HCl,
  H₂SO₄, KMnO₄, K₂Cr₂O₇, AgNO₃, CO₂, H₂O, NH₃…; "oxygen" and "hydrogen" stay
  unmapped because they also name the atom) and reaction orders ("first
  order" ↔ "order 1").
- **Equation points are read as formulas** (`src/domain/marking-formula.ts`,
  twenty-ninth pass). A scheme point that is an equation is credited when the
  answer writes it rearranged (checked numerically at fixed sample values),
  substitutes numbers into the same quantity's formula with the same shape
  and a value the part's own scheme or model answer reaches, or works the
  same quantity to the same value; a same-quantity equation that does not
  hold vetoes the point (`formulaContradicted`). It only reads equations, never
  prose. `tests/marking-self-consistency.test.ts` is a ratchet on model answers
  scoring below full marks (687 after this pass); `tests/marking-false-negatives.test.ts`
  pins each marker fix with wrong answers that must still lose the mark.
- **Watch for TDZ and memo ordering** when adding a `useMemo` that reads another
  one. Declare dependencies first, and gate an expensive memo on a cheap
  condition (`plan.top === null`) when the answer is only needed in the empty case.
- **Source-string tests constrain UI edits.** Several suites assert on literal
  strings in component source (`tests/today-screen.test.ts`,
  `tests/recovery-ui.test.ts`, `tests/proof-ui.test.ts`,
  `tests/onboarding-first-screen.test.ts`, `tests/perf.test.ts`). Read them before
  changing copy or adding a route.
- **Repair-plan links carry a mode and `/practice` must honour it**
  (twenty-third pass). `src/domain/intervention-engine.ts` builds
  `guided=1`, `unaided=1`, `worked=1` and `timed=1&command=…`;
  `src/domain/practice-step-mode.ts` parses them. A new link parameter needs
  a consumer and a test, or the plan promises something the page does not
  do. Still unhonoured: `/practice?transfer=1`, which no plan emits (the
  unfamiliar-context check is the delayed far-transfer retest). A proof check link is
  `proofHref` (`/practice?proof=<topic>&subject=…`, ProofCheckMode); the
  old `/adaptive-session?…&proof=1` was never read and is gone (thirtieth
  pass, `tests/proof-links.test.ts`).
- **`/practice?retest=` takes a mistake id or a far-transfer check id**
  (fifty-fifth pass). A far-transfer check (`far-transfer:<source attempt>`,
  `src/domain/delayed-far-transfer.ts`) runs with no hints and no topic
  reminders, since only an independent attempt completes it; Exam readiness
  links the earliest due one. Until this pass the page showed "no longer
  available" for it and nothing linked there. No shipped question can
  schedule one yet (WJEC transfer needs two teacher reviews; no reference
  question carries transfer demand); `e2e/far-transfer-check.spec.ts` drives
  it with fixture-only reviews.
- **A saved checkpoint is not an interrupted run** (twenty-ninth pass). Pages
  save a resume point as soon as a question shows; anything that offers to
  resume must ask `checkpointHasProgress` (Today and Schedule do). On Today
  it leads only while fresh (`checkpointLeadsToday`: the local day it was
  left, or within `CHECKPOINT_LEAD_HOURS`); from the next day the
  recommendation leads and `ResumeRevisionCard compact` sits beneath it
  (one-hundred-and-seventeenth pass, `e2e/resume-steps-aside.spec.ts`), so a
  student back after a week is not shown only a stale queue. Mission
  titles that prefix "Recover N marks" compose through `missionActionTitle`,
  never by concatenating `mission.title`.
- **Outbox failures are classified** (`src/domain/sync-retry.ts`). Only a
  permanent (content) rejection spends an item's `MAX_OUTBOX_ATTEMPTS`
  budget; a transient one (network, timeout, 5xx, 429, expired JWT) records
  `lastError`, sets a persisted push backoff (`outboxBackoff` meta, 15 s
  doubling to 15 min) and stops the drain. A rejected batch is bisected so
  only the poison row(s) are counted. `sync()` runs under the cross-tab
  `revise-sync` Web Lock (`skipped: "busy"` in the losing tab), and a card
  whose merged op log holds reviews the server copy lacks is re-queued on
  pull with a newer `updatedAt` (the server drops older card updates).
  `tests/sync-delivery-resilience.test.ts` covers all of it.
- **The service worker's cache is named per build** (`public/sw.js` reads
  `?v=` from its own URL; `ServiceWorker.tsx` registers
  `/sw.js?v=${NEXT_PUBLIC_BUILD_ID}`, set in `next.config.ts`). Keep
  `CACHE_BASE` pinned; activate deletes every other cache.
- **`replacePlan` is serialised** (`src/data/repository.ts`). Two concurrent
  rebuilds used to union into overlapping blocks; keep plan writes going
  through it.
- **A new route under `src/app` must be added to `APP_SHELL` in `public/sw.js`**,
  or `tests/perf.test.ts` fails.
- **Pages use a per-request nonce CSP** (twenty-seventh pass). `src/proxy.ts`
  sets it from `buildContentSecurityPolicy` (`src/lib/csp.ts`); script-src has
  no `'unsafe-inline'`, because the E2EE key lives in this origin's IndexedDB.
  The root layout reads `headers()` for the nonce, so every page renders per
  request. An inline `<script>` needs `nonce={nonce}`; never add a page CSP in
  `next.config.ts` (browsers enforce every CSP header, and a nonce-less one
  blocks Next's own scripts). `tests/security.test.ts` pins this.
- **Lesson teaching is authored per spec point** in `src/content/teaching`
  (all 108 WJEC Physics checkpoints). A checkpoint without an entry is an
  outline (`outlineCheckpointLesson`, `outline: true`, labelled "Outline
  only"): the requirement, the topic's key points that bear on it
  (`bearingOn`: two shared terms), and a common error or misconception only
  when one bears on it. It never builds a model answer, an application or a
  check from the specification wording, and never pairs material with a point
  by list position (one-hundred-and-eighteenth pass). Teaching is unreviewed authored content:
  it never makes a question, mark or proof claim. Check worked-example
  arithmetic before adding one (`tests/lesson-teaching.test.ts` checks shape,
  not physics).
  Every taught lesson carries `teachingReview: "not-teacher-reviewed"`, and
  the lesson page, roadmap card and Today roadmap card say "Not yet
  teacher-reviewed"; there is no review path for lessons, so never set any
  other value (twenty-eighth pass). A lost mark links to the checkpoint that
  teaches the lost part's spec point (`relearnCheckpointFor` in
  `src/domain/practice-next-step.ts`, `/lesson?…&checkpoint=<spec point id>`),
  and the repair plan's "Targeted explanation" step opens that checkpoint
  rather than the topic's first. The practice screen knows which points are
  taught from `src/content/teaching/taught-spec-points.ts`, not the teaching
  itself: add an id there with each new entry
  (`tests/lesson-relearn.test.ts` fails otherwise).
- **A lost mark is read from the answer, then taught in place** (one-hundred-and-thirteenth
  pass). `readAnswerGap` (`src/domain/answer-gap.ts`) reads what the student
  wrote against the points they missed: blank or "I don't know", the opposite
  of a scheme point, a division written the wrong way round, a power of ten
  out, points left unsaid. Detection is `detectAnswerGap`
  (`src/domain/answer-gap-detect.ts`); the sentences are added by
  `readAnswerGap`, which only the marked result imports, because the
  detection half is on the `/` route (the mistake pipeline) and that route
  is within a few KB of its budget: keep wording out of the detect module.
  `localClassifyError` asks the detection first, so a reading
  that rests on the answer itself becomes the mistake's stored
  `errorCategory` (and so the mission's cause and Today's reason); every
  other reading has `verdict: null`, is worded as a possibility and falls
  through to the old keyword heuristics below the action threshold. Add a
  verdict only for evidence in the answer, never from the question's wording,
  and keep `insufficient-detail` below the threshold: an actionable one makes
  the generic writing drill the primary next step
  (`techniqueRepairForDiagnosis`). The marked result shows the reading
  ("Why the marks went") in place of the device marker's percentage-based
  verdict sentence, then `RepairTeaching` (`src/components/LostMarksRepair.tsx`):
  the taught idea, the usual trap, a worked example one step at a time and
  one unrecorded check. Reading it is not evidence and is saved nowhere.
- **Hints come from the question, not the top of its topic**
  (`buildHintLadder` in `src/domain/hints.ts`, same pass). The ladder used
  to take `keyPoints[0]`/`commonErrors[0]` whatever the question tested, and
  its "worked solution" was the mark scheme joined with dots. With a `focus`
  it names the specification point (cue), teaches it (prompt), works a
  different problem on the same idea (scaffold) and only then shows this
  question's own model answer (worked solution, by explicit give-up);
  without teaching it takes the key point and common error that share most
  words with the question. The four tiers and their evidence weights are
  unchanged. `chooseTeachingPoint` decides which taught point bears on a
  question: the part's tag stands unless its teaching shares next to nothing
  with the question, or the tag is the topic's first statement and another
  point is plainly closer (55 of 1,656 written Physics questions move, the
  sp-01 default-tag cases). It is a display choice only: it never retags a
  question and nothing else may read it as a tag. Teaching loads on demand
  through `useQuestionTeaching` (`src/state/checkpoint-teaching.ts`); never
  import `@/content/teaching` statically from a practice component, and
  every caller must work when it returns null (offline, chunk not cached).
  The scaffold's worked example is the point's authored one unless a
  question the student has already sat on that point is closer
  (`chooseAnsweredExample`); never show the answer of a question they have
  not sat, which would spend it with no record that it was seen.
  A mission's repair stage opens guided ("Learn it first, then answer") only
  when its cause is a gap in the idea (`repairTeachesFirst`); a slip or unit
  error keeps help on request so the retry is still retrieval.
- **The step after a mark follows what the answer showed** (one-hundred-and-fourteenth
  pass). `gapNextStep` (`src/domain/practice-next-step.ts`) outranks the
  topic's plan when the reading is clear or likely: a gap in the idea goes to
  a guided question, a slip (a power of ten, or a line of the student's own
  arithmetic that does not add up) to an unaided one, a point left out back
  to "Improve my answer". An unsure reading chooses nothing. Those links
  carry `point=<spec point id>`; `/practice` orders the step's questions on
  that point first, before `deferProofSupply`, so a teacher-reviewed question
  on the point is still kept back. Full marks is read by `readFullMarks`
  (`src/domain/full-marks-reading.ts`): unaided on a question (and family)
  never answered, a familiar one, or with help. It states what the student
  did and, separately, what Revise can claim; it changes no ledger, and its
  wording must never say proof, evidence or mastery for an unreviewed
  question (`tests/full-marks-reading.test.ts`).
- **One trust line per question, and the question first on a phone** (same
  pass). The runner's review warning is the label of `TrustDetails`, not a
  line above a second "About this question"; while a quick check has
  questions on screen the page keeps its title and drops its preamble and
  length switch (`onRunningChange`); a question opened by `?question=` or
  `?retest=` is shown without the practice hub, topic row or navigator
  (`focusedQuestion`). The start panel and the result still say in full that
  unreviewed questions are practice, not proof: shorten the repeats, never
  the first statement.
- **A failed repair is not a second debt** (one-hundred-and-fifteenth pass).
  `missionRetryParts` (`src/domain/repair-evidence.ts`) marks the parts of a
  mission's repair or supported-practice question that sit on an open source
  mistake's point, capability or topic; `recordAttempt` creates no new
  mistake or card for them, as it already did for a retest of the same
  question. Without it a student who kept failing went from 12 marks "still
  open" to 26 in three runs of trying to repair them. Unaided stages (apply,
  delayed proof) are excluded: a failure there is new evidence. The attempt
  is still saved and still moves mastery; only the mistake ledger and the
  card queue are spared. Related fixes from the same walk: a mark the device
  marker cannot be sure of is not called an AI mark or said to be awaiting a
  person (nothing in the product reviews it), and it is said once, in the
  provisional box; the session summary counts such an answer as "not
  counted", not "nothing was marked"; and when the next step is the mission
  stage already open, "Continue" starts a fresh run (`MissionSessionRun`
  keyed by run) instead of linking to the current URL, which did nothing.
- **No mark is ever said to be going to a person** (same pass). Nothing
  resolves a `markEscalation`: the pending record exists so
  `trustworthyAttempt` leaves the answer out of progress. Device and AI marks
  both say only that ("left out of your progress"); never write "human
  review requested" or "second marker" in student-facing copy unless a path
  that performs it ships with it (`tests/low-confidence-mark-escalation.test.ts`,
  `e2e/ai-marking-failures.spec.ts`).
- **A restated value is not contradictory working** (same pass).
  `contradictoryWorkingStep` and `conflictingWorkingLabel`
  (`src/domain/calculation-rubric.ts`) compare values as written and again
  scaled by their unit (`unitScale`: %, SI prefixes in front of a base unit,
  cm³/dm³, minutes and hours), so `= 0.70 = 70%` and `144000 J = 144 kJ`
  agree while `0.7` then `7%` still conflicts. It only ever accepts more
  than before. A prefix is read only in front of a base unit not raised to
  a power (`ms⁻¹` is metres per second). Add a conversion only with a
  still-wrong case beside it in `tests/physics-marking-repairs.test.ts`.
- **Unaided and timed steps skip questions already shown with hints** (same
  pass). Support seen on an unanswered question stays on its saved draft, so
  `/practice` orders the step queue through `deferSupportedQuestions`
  (`src/domain/practice-step-mode.ts`) after the command-word order and
  before the minutes fit; one is served only when nothing else is left, and
  the runner then says support was used instead of the unaided note.
- **A taught lesson gives each step one task and ends on a question**
  (one-hundred-and-sixteenth pass). `authoredCheckpointLesson`
  (`src/content/lessons.ts`) builds idea + check, worked example, exam
  question and (where written) the usual mistake; there is no orientation
  step. `LessonStep.task` (`"check" | "worked" | "apply"`) tells
  `LessonMode` the step's single task: a check step has no typed recall, a
  worked step is `WorkedSteps` (shared with `LostMarksRepair`) and unlocks
  Next when its answer is shown (`completeTask`), an apply step's box is the
  answer to the exam question and reveals the model and checklist. A step
  with no `task` keeps the old shape (outline lessons). Never print a check's
  answer above its question, and never add a second "recall" beside a
  step's task. The summary's first action is `lessonPracticeHref`
  (`/practice?topic=…&unaided=1&point=…&from=lesson`); `from=lesson` is read
  by `parseStepSource` and worded by `stepSourceCopy`, so the practice page
  never tells a student who lost no mark that they are repairing one. A
  lesson still records no evidence.
- **Repair does not re-sit the question just answered** (twenty-seventh pass):
  `buildMissionSession`'s repair stage takes an unseen question from another
  family sharing the lost part's spec point or capability, ranked by
  `causeFit`, and re-sits the original only when none exists (and says so).
- **Supported steps keep reviewed questions for proof** (thirtieth pass).
  Anything that serves questions with help or as practice (mission repair,
  practise, proof-barred apply; guided/worked plan steps) passes
  `reserveReviewed` to `selectProofCandidates` or orders with
  `deferProofSupply`: a reviewed question it serves becomes "seen" and can
  never be the topic's proof. Spend one only when nothing else fits, and say
  so (`reviewedSpent`).
- **A Physics spec tag is a lesson link.** `tests/physics-spec-tags.test.ts`
  checks every WJEC Physics tag is a real point in the question's topic and
  pins the audited massive-authentic tags. Never retag a question to fill a
  depth cell; `tests/subject-assessment-audit.test.ts` lists the honest gaps.
- **Question builders take a spec point; never default to sp-01** (thirty-first
  pass). The data, unfamiliar-context, authentic-source and evidence builders
  used to tag every part sp-01 of its topic. Pass the point the part actually
  tests, checked against the curriculum statement. `node
  scripts/audit-physics-spec-tags.mjs` ranks likely mis-tags by keyword
  agreement; it is triage, not accuracy, and every retag is a human decision
  pinned in `tests/physics-spec-tags.test.ts`.
- **Nothing on the marking path may reach a third party without AI consent**
  (thirty-first pass). The semantic cache loads its embedding model only when
  an embedded entry exists (`tests/semantic-cache-egress.test.ts`);
  `e2e/fresh-student-360.spec.ts` fails on any huggingface.co request.
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
- **Public pages have markdown twins for AI agents** (eighty-ninth pass).
  `src/lib/md/registry.ts` renders `/`, `/welcome`, `/library`, `/lesson` and
  `/technique` (same query strings as the HTML) from the content modules;
  `src/proxy.ts` rewrites `<path>.md` and `Accept: text/markdown` to
  `/api/md/<path>`. A new `page.tsx` needs a renderer (add it to
  `MARKDOWN_PAGES`) or a reason in `NO_TWIN` in
  `tests/markdown-twins.test.ts`, which fails otherwise. Twins never show a
  check's answer, a model answer or the question bank. `/llms.txt`,
  `/llms-full.txt` (kept under 500k characters), `/ai.txt` and `/robots.txt`
  come from `src/lib/md/agent-files.ts`; the production URL is `SITE_URL` in
  `src/lib/site.ts`. After editing `revise-site/index.html`, run
  `npm run site:ai-files`: it regenerates the landing site's `index.md`,
  agent files, head block and `vercel.json` headers, and `verify` fails while
  they are stale.

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

The database re-runs `auditLogIssues` on every insert into
`review_audit_events` (direct PostgREST inserts by a reviewer included):
it recomputes `eventHash` in SQL (`review_audit_event_hash`), anchors the
first runtime row to the committed tail (`review_audit_anchor`) and refuses a
repeat approval by pseudonym or account. Change the event shape, the
canonical JSON or `REVIEWED_WJEC_SUBJECT_IDS` and that SQL must change in a
new migration too (`tests/reviewer-sql.test.ts` compares them). A reviewer's
label never changes once granted (`grant_reviewer_role` refuses), because
independence is counted by it.

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
have 77, 106 and 96 statements to write
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