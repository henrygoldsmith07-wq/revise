# Simpler for the student, stricter underneath — 2026-10-03

The engine already ranked missions, paper recovery, proof checks, reviews and the adaptive session
together. This pass changes what the learner meets, not how marks are judged.

## What changed

- **Cold start.** `src/domain/cold-start.ts` offers one short, skippable quick check on the subject with
  the nearest exam, only while the learner has fewer than 3 trusted answers, no lost marks and under 15
  reviews in it, and only when at least 3 reviewed, unseen questions exist. It leads Today only while no
  mission, proof check or recovery exists; real lost marks always outrank it. The answers go through the
  normal attempt pipeline, so there is no second evidence store: once they exist the learner is no longer
  cold and the quick check disappears. Skipping is stored in `settings.quickCheckSkipped`.
  WJEC flagship subjects currently have no human-reviewed questions, so no quick check is offered there
  rather than diagnosing on unreviewed content.
- **Today.** `src/domain/today-focus.ts` reduces the winning action to what the learner needs: what to do,
  why, how long, what is at stake (`explanation.stake`), what happens after, and one Start button.
  Ranking numbers are no longer shown; "why before the others" is plain language. Streak and XP text is
  gone from the shell.
- **Paper result.** `src/domain/paper-result.ts` and `PaperResultCard` give one block: marks lost, where,
  likely reason, marks still to win back, one next step, and one of the six state words. The breakdown,
  repair steps and equivalent retest sit one tap below. When proof is blocked it says "There aren't enough
  new questions to prove this yet".
- **Continuous mission sessions.** A finished mission step offers "Continue: <next best action>" computed
  from the evidence it just created. A refresh mid-step resumes the exact questions, support level and
  attribution (`MissionCheckpointState` in the revision checkpoint) instead of rebuilding a different set.
- **Session summary.** `buildSessionEvidence` adds a verdict in the six words ("Improving, but not proven
  yet", "Still fragile", "Needs another independent attempt", "Regressed", "Proven") and says when Revise
  will check again, in days. Generic closures no longer congratulate: "Went well, not proven yet", "Still
  fragile", "Marks dropped: repair before moving on".
- **Outcome measurement.** `src/domain/outcome-measurement.ts` measures, per intervention: baseline marks
  lost, support used, immediate independent, unfamiliar and delayed independent performance, recurrence of
  the same mistake, minutes, and marks recovered per minute from delayed unaided checks only. Every rate has
  a 90% band. "This has worked well for you" needs at least 5 delayed independent checks and a gain band
  wholly above zero. Progress shows these statements inside "How much real evidence says this works?".
- **Question supply audit.** See [question-supply-audit.md](question-supply-audit.md). `npm run
  wjec:supply:audit` reports, for the four WJEC flagship subjects, trusted, transfer, data-analysis and
  distinct-reasoning-family counts and detects number-swap and noun-swap duplicates. `npm run
  wjec:supply:check` fails only on integrity errors, never on thin supply.
- **Trust wording.** `src/domain/trust-label.ts` maps content to four plain tiers (trusted, reference,
  unverified, insufficient). Progress states where Revise can prove improvement per subject.

## Entry points

Today is the one place that decides what to revise next. Review, Practice, Past papers, Lessons, Study and
Session stay available under "Choose your own" for learners who want to pick; the readiness page and the command centre
read the same plan rather than ranking separately. No engine was deleted.

## Limits

- Nothing here supplies new reviewed questions. Until WJEC content passes human review, flagship proof stays
  blocked and the interface says so.
- Outcome statements are associations from one learner's own checks, not causal claims.
- A mid-question draft is not saved on refresh; the step resumes at the first unanswered question.
