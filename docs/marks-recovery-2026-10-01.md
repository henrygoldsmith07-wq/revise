# Marks recovery: marks at risk, paper autopsy, answer improvement, sprints, specification evidence

This pass turns "where am I losing marks, and how do I get them back?" into
product surfaces. Each one reads data the app already records; nothing here
adds a new store, migration or sync row.

## What shipped

| Feature | Where | Domain module |
|---------|-------|---------------|
| **Marks at risk** and **Recover these marks** | `/readiness` panel, a card in Today's collapsed overview and on `/practice`; session at `/practice?recover=1` | `src/domain/marks-at-risk.ts` |
| **Paper autopsy**, **repair plan**, **equivalent retest** | after a paper in `/papers`, an "Autopsy" link per sat paper, `/practice?autopsy=<run>[&step=repair-N\|retest]` | `src/domain/paper-autopsy.ts` |
| **Improve my answer** | under any non-MCQ part that lost marks in ordinary practice | `src/domain/answer-improvement.ts` |
| **Exam sprints** of 5, 10, 20, 30, 45 and 60 minutes | `/practice` ("Short on time?") | `src/domain/quick-session.ts` |
| **Specification evidence** and map | `/readiness/spec` | `src/domain/specification-evidence.ts` |

## Design decisions

- **Marks at risk is observed, not forecast.** It totals the marks lost on
  mistakes that are still open (no delayed retest has closed them). It is
  broken down by topic, skill (AO), error type, paper, question type and
  recurring pattern. A student with no marked answers sees "nothing to
  estimate", never a reassuring zero. The recent loss rate per topic uses only
  trusted attempts from the last 90 days.
- **Recover these marks** is one bounded set (at most six questions and 24
  marks): the exact questions behind open losses first, then unseen questions
  on the same topics so the repair is tested on something new. Doing well does
  not close a mistake; the existing delayed retest still does.
- **Paper autopsy uses the same trust filter as the paper weakness report**
  (`paperEvidenceAttempts`), including WJEC physics authentication, so it never
  breaks down marks the rest of the app would not believe.
- **"Equivalent" is matched, not proven.** Retest questions share a topic and,
  where available, a specification statement, and are scored on question type,
  marks and difficulty. They must be unseen and outside the paper. When the
  bank cannot supply enough, the retest is reported as not ready rather than
  padded. The retest summary compares totals and says the questions are
  similar, not identical.
- **Improve my answer is practice only.** Cues name the ground to cover (up to
  three key words, or a units-and-precision nudge for numeric points) without
  quoting the mark-scheme point. The rewrite and the original are both marked
  by the offline rubric so the comparison is like for like. A rewrite is never
  saved as an attempt and never changes mastery or mistakes, because the
  student has already seen the feedback. It is offered only in ordinary
  practice, not in delayed far-transfer or mistake-retest attempts. Pasting the
  model answer is detected and not rewarded. The existing mark-by-mark
  feedback is unchanged and still visible above the rewrite box.
- **Sprints keep the old behaviour up to ten minutes** (two and four questions).
  Longer sprints allow about 2.5 minutes a question, interleave topics weakest
  first, and stop at a mark budget of about one mark a minute, always offering
  at least one question.
- **Specification evidence separates "how well" from "how much proof".** A
  statement is secure only with at least three distinct questions, at least
  eight marks, three unaided attempts and retrieval within 42 days; one
  correct answer reads as "not enough evidence". Statements with no mapped
  question are reported as content gaps. Attempts join statements through the
  authored `specPointIds` on question parts, falling back to the whole question
  only where no part claims the statement.

## Known limits

- The specification map is unit → topic → statement. The curriculum data does
  not carry a paper level, so there is no paper → topic hierarchy.
- Marks at risk counts only open mistakes. It does not yet fold in forgetting
  (stale but previously secure topics), which the specification page flags
  per statement.
- A repair step's fresh questions and the retest pairs are recomputed from
  attempt history when reopened, so a step reopened after being worked may
  offer different new questions.
