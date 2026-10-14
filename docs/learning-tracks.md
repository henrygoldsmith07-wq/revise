# Technique drills and WJEC practical-topic pathways

## Exam technique

`/technique` is a generic writing workshop, available even when there are no
human-reviewed questions. A fictional library trial provides observations and a
clearly labelled assumption. Learners can practise **describe**, **explain**,
**evaluate** and a **6-mark-style extended-response plan**. This does not add
science questions or content approvals to the authored bank.

`src/domain/technique-drills.ts` reuses `validateCommandWord` from the existing
command-word validation module. It reports visible response-shape signals:
observations, reason links, balance, judgement and separate plan sections. This
is heuristic feedback, not semantic validation. Keyword matching can flag a
poor answer; valid alternative wording can be missed. No marks, mastery, grade
prediction or exam-readiness claims are produced. Six bullets do not guarantee
six marks; the actual question and scheme determine credit.

The Check response structure action writes a real submission event into the
existing IndexedDB **settings** row through `updateSettings`, then the existing
outbox path handles sync when configured. The optional `techniqueDrillHistory`
field contains at most 30 events: a random submission id, drill id, submission
time and detected shape ids. It never stores the typed response or an invented
marked question attempt. History is scoped to the profile; unsaved responses
are discarded on account changes. There is no AI call. Existing settings sync
is last-write-wins, not an append-only CRDT: simultaneous settings edits across
devices can replace the short history. Counts are activity only, not evidence
of improvement. No database store/schema or server migration is added.

## Practical topics

`/practicals` currently covers enrolled **WJEC A-level Biology, Chemistry and
Physics**. GCSE, other boards and Mathematics are not substituted. The subject
chooser and explicit topic list lead into an ordered path:

1. Method and controls.
2. Errors and uncertainty.
3. Graphs and conclusions.

The list is a navigation subset of existing curriculum topics, including each
subject's Unit 5 practical-skills topic. It is **not an official required-practical
checklist**, and nothing is labelled as a completed laboratory experiment.
The repository curriculum supports practical skills but does not establish an
official named required-experiment register. Learners must use their teacher's
list/current specification and follow supervised laboratory safety procedures.

`src/domain/practical-track.ts` is pure: subjects, topics, questions, attempts,
cards, enrolments and user id are passed in. Topic labels and specification
references come from the supplied curriculum. The route calls
`loadAuthoredQuestions()` asynchronously rather than importing the bank. It
uses the profile-resolved question pool (including available private questions)
and current authored versions without resurrecting locally deleted questions.

Method and uncertainty steps link to the subject's existing practical-skills
lesson; the graph step and topic overview link to the chosen topic's lesson.
Question navigation uses visible stem/part wording only, with explicitly
labelled heuristic skill matching. A matching word does not establish an
approved skill mapping. Links use the supported `/lesson?subject=…&topic=…` and
`/practice?subject=…&topic=…&question=…` parameters. A specific available question
is chosen, preferring one not yet attempted. There is no invented `skill`
filter. Where no prompt matches, the page says so and offers a lesson and the
generic technique workshop, not an empty practice link. Bank-load failure
shows an explicit retry while lessons and available profile questions remain
usable. Unreviewed questions stay unreviewed and are practice only.

Progress is drawn from deduplicated records belonging to the active learner,
subject and topic: recorded question-attempt counts and cards with positive
review counts plus a last-reviewed time. Stage counts use only attempts on
currently available matching prompts and reviewed cards whose text mentions
that skill. Retired-question attempts can contribute to the topic's activity
count but never invent stage coverage. These are not marks, mastery, approved
assessment evidence, required-practical completion or proof of improvement.
Counts may increase while older local history hydrates. Stages can overlap
when the same prompt mentions multiple skills.

## Focused verification

```sh
npx vitest run tests/technique-drills.test.ts tests/technique-drill-persistence.test.ts tests/practical-track.test.ts tests/command-word-validation.test.ts
npx eslint src/domain/technique-drills.ts src/domain/practical-track.ts src/app/technique/page.tsx src/app/practicals/page.tsx tests/technique-drills.test.ts tests/technique-drill-persistence.test.ts tests/practical-track.test.ts --max-warnings 0
```

The tests cover blank responses, command-word distinctions, extended-response
shape, honest limitations, bounded/profile-scoped IndexedDB history, existing
curriculum links, qualification/enrolment scope, no-bank fallback, supported
query parameters, real learner evidence and no direct authored-bank import.
Accessible labels, pressed-state drill/topic controls and live save/load
messages are asserted in route-source checks. Those source checks are not a
substitute for a browser accessibility or keyboard audit.
