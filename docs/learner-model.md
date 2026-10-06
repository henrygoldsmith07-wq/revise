# The learner model: who owns each metric

Revise measures a learner in many places. To stop two screens from showing two
slightly different meanings of the same word, every learner-facing metric has
exactly one owner, and screens read it through one projection
(`src/domain/learner-model.ts`, `projectSubjectModel`). The projection composes;
it never recalculates.

The same table is exported as `LEARNER_MODEL_OWNERS` and checked by
`tests/learner-model.test.ts` (each owner file must exist; each facet appears once).

```text
Learner
├── Curriculum position   what you have covered
├── Recall                remembering it
├── Application           using it in exam questions
├── Exam technique        how answers are written
├── Mistakes              marks you lost, and whether they are recovered
├── Retention             keeping it over time
├── Transfer              new questions, not just familiar ones
├── Confidence            how sure Revise is (about the evidence, not you)
├── Intervention history  what you have tried
└── Outcomes              proven improvement
```

| Facet | Learner wording | Owner (authoritative) | Calculation | Store field | Never confuse with |
| --- | --- | --- | --- | --- | --- |
| Curriculum position | What you have covered | `src/domain/proof-lifecycle.ts` | `buildTopicLifecycles` (falls back to `masteryStage`) | derived per screen via the hook | How well a topic is known |
| Recall | Remembering it | `src/domain/recall-mastery.ts` | `buildRecallMastery` (FSRS card strength) | `recallMastery` | Application |
| Application | Using it in exam questions | `src/domain/application-mastery.ts` | `buildApplicationMastery` (repeats discounted) | `applicationMastery` | Recall; same-question repeats |
| Exam technique | Answering technique | `src/domain/exam-technique.ts` | `knowledgeVsAnswering` | — | Missing knowledge |
| Mistakes | Marks you lost | `src/domain/mark-recovery.ts` | `buildMarkRecovery` | — (shared via `useRecoveryEvidence`) | Recovered marks (need a delayed check on a different question) |
| Retention | Keeping it | `src/domain/proof-lifecycle.ts` | `topicLifecycle` stages holding / fading / slipped | `proofLedger` | Card retention alone |
| Transfer | New questions | `src/domain/proof-of-improvement.ts` | `buildProofLedger` (`familiarRate`, `unseenRate`, `illusory`) | `proofLedger` | Doing well on practised questions |
| Confidence | How sure Revise is | `src/domain/exam-readiness.ts` + `src/domain/exam-outlook.ts` | `buildExamReadiness().confidence`, `outlookRows().provisional` | `examReadiness`, `predictions` | The learner's score |
| Intervention history | What you have tried | `src/domain/intervention-calibration.ts` | `createInterventionOutcome`, `durableOutcomeScore` | `interventionOutcomes` | Outcomes |
| Outcomes | Proven improvement | `src/domain/proof-of-improvement.ts` | `buildProofLedger` status `proven-gain` / `declined` | `proofLedger` | Same-session success; repeated questions |

## Groupings, not new thresholds

The projection groups topics using the capability model's own thresholds
(`EMERGING_THRESHOLD = 0.6`, `DEVELOPING_THRESHOLD = 0.7` in
`src/domain/capability-mastery.ts`):

- **Weak recall / weak application**: measured (not `unmeasured`) and below `EMERGING_THRESHOLD`.
  Unmeasured is unknown, never weak.
- **Remembers it but cannot use it**: recall evidence `reliable` and at or above
  `DEVELOPING_THRESHOLD`, while measured application is below `EMERGING_THRESHOLD`.

## Compositions built on the model

| Surface | Module | Reads |
| --- | --- | --- |
| Exam trajectory | `src/domain/exam-trajectory.ts` | learner model, `outlookRows`, readiness status, the ranked plan |
| Exam Command Centre (Progress) | `src/domain/exam-command-centre.ts` | trajectory, learner model, plan, pace forecast |
| What changed? (after a session) | `src/domain/what-changed.ts` | plan evidence, step records, proof ledger row, lifecycle |
| Intervention memory | `src/domain/intervention-memory.ts` | outcome records, `effectivenessReport`, `effectivenessClaims`, mistake patterns, proof ledger |
| Study pathway | `src/domain/study-pathway.ts` | the adaptive plan's own steps |
| Trust indicator | `src/domain/trust-indicator.ts` | `trustTier`, `trustNoteFor`, `SPEC_MANIFEST`, topic spec points, human-verification record |

The React hooks that feed these (`src/components/learner-model.ts`) only pass
store values through; they hold no logic.

## Recommendations

There is still exactly one recommender: `rankRevisionActions`
(`src/domain/revision-engine.ts`). Personal intervention memory reaches it
through `estimateEffectiveness` (`src/domain/effectiveness.ts`), which now
weights the adaptive session's chosen intervention as well as mission stages.
The weight is neutral (1) until a kind of session has `MIN_CHAINS_FOR_WEIGHT`
durable chains, so a thin history never moves the ranking.

## Honesty rules the projection preserves

- Recall and application stay separate facets.
- Same-question or same-family success is never proof; only the proof ledger
  (new questions, unaided, after a delay) can say "proven".
- A provisional exam band is labelled as an early estimate; with fewer than
  `MIN_OUTLOOK_ATTEMPTS` marked answers no number is shown.
- Unverified or reference content never reads as checked.
