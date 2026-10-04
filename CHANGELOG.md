# Changelog

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
