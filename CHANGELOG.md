# Changelog

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
