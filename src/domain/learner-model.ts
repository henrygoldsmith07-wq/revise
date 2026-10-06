// ---------------------------------------------------------------------------
// The learner model — one projection over the systems that already measure
// the learner. It owns no calculation of its own.
//
//   Learner
//   ├── Curriculum position   proof-lifecycle  (topicLifecycle / masteryStage)
//   ├── Recall                recall-mastery   (FSRS card strength)
//   ├── Application           application-mastery (marked exam answers)
//   ├── Exam technique        exam-technique   (knowledgeVsAnswering)
//   ├── Mistakes              mark-recovery    (buildMarkRecovery)
//   ├── Retention             proof-lifecycle  (holding / fading / slipped)
//   ├── Transfer              proof-of-improvement (unseen vs familiar)
//   ├── Confidence            exam-readiness + exam-outlook
//   ├── Intervention history  intervention-calibration (outcome records)
//   └── Outcomes              proof-of-improvement (delayed, unseen, unaided)
//
// Every field below is read from the owner's own output, so two screens that
// read this projection cannot drift into two meanings of the same word. The
// thresholds used to group topics are the capability model's own
// (EMERGING_THRESHOLD / DEVELOPING_THRESHOLD), not new ones.
//
// docs/learner-model.md documents the same ownership table for people.
// Pure domain: no React, no storage, no clock.
// ---------------------------------------------------------------------------

import type { ApplicationMasteryRow } from "./application-mastery";
import { DEVELOPING_THRESHOLD, EMERGING_THRESHOLD } from "./capability-mastery";
import type { ExamOutlookRow } from "./exam-outlook";
import type { ExamReadiness, ExamReadinessStatus } from "./exam-readiness";
import type { KnowledgeAnsweringReport, TechniqueVerdict } from "./exam-technique";
import type { MarkRecovery, RecoveryTotals } from "./mark-recovery";
import type { TopicLifecycle } from "./proof-lifecycle";
import type { ProofLedger } from "./proof-of-improvement";
import type { RecallMasteryRow } from "./recall-mastery";
import type { Id, InterventionOutcomeRecord, Topic } from "./types";
import { durableOutcomeScore } from "./intervention-calibration";

export type LearnerFacet =
  | "curriculum" | "recall" | "application" | "examTechnique" | "mistakes"
  | "retention" | "transfer" | "confidence" | "interventions" | "outcomes";

export interface MetricOwner {
  facet: LearnerFacet;
  /** What the learner would call it. */
  learnerName: string;
  /** Module that is authoritative for the number. */
  owner: string;
  /** The exported function that computes it. */
  calculation: string;
  /** Where the live value sits in the store, when it is held there. */
  storeField: string | null;
  /** Why the learner should care, in one sentence. */
  whyItMatters: string;
  /** The nearest thing it must never be confused with. */
  notTheSameAs: string;
}

/** The single ownership table. Screens read values through the projection below, never re-derive them. */
export const LEARNER_MODEL_OWNERS: readonly MetricOwner[] = [
  {
    facet: "curriculum", learnerName: "What you have covered", owner: "src/domain/proof-lifecycle.ts",
    calculation: "buildTopicLifecycles (falls back to masteryStage)", storeField: null,
    whyItMatters: "Topics you have never touched cannot score in the exam.",
    notTheSameAs: "How well you know a topic: started is not secure.",
  },
  {
    facet: "recall", learnerName: "Remembering it", owner: "src/domain/recall-mastery.ts",
    calculation: "buildRecallMastery", storeField: "recallMastery",
    whyItMatters: "If you cannot bring the idea to mind, you cannot use it in an answer.",
    notTheSameAs: "Application: remembering a fact is not using it for marks.",
  },
  {
    facet: "application", learnerName: "Using it in exam questions", owner: "src/domain/application-mastery.ts",
    calculation: "buildApplicationMastery", storeField: "applicationMastery",
    whyItMatters: "Marks come from applying ideas to the question in front of you.",
    notTheSameAs: "Recall, and same-question repeats (which are discounted).",
  },
  {
    facet: "examTechnique", learnerName: "Answering technique", owner: "src/domain/exam-technique.ts",
    calculation: "knowledgeVsAnswering", storeField: null,
    whyItMatters: "Some marks are lost by how an answer is written, not what you know.",
    notTheSameAs: "Missing knowledge.",
  },
  {
    facet: "mistakes", learnerName: "Marks you lost", owner: "src/domain/mark-recovery.ts",
    calculation: "buildMarkRecovery", storeField: null,
    whyItMatters: "Lost marks are the most direct route to a higher grade.",
    notTheSameAs: "Recovered marks: a mark is only recovered after a delayed check on a different question.",
  },
  {
    facet: "retention", learnerName: "Keeping it", owner: "src/domain/proof-lifecycle.ts",
    calculation: "topicLifecycle (holding / fading / slipped)", storeField: "proofLedger",
    whyItMatters: "What fades before the exam is lost even if you once knew it.",
    notTheSameAs: "Card retention on its own (recall facet).",
  },
  {
    facet: "transfer", learnerName: "New questions", owner: "src/domain/proof-of-improvement.ts",
    calculation: "buildProofLedger (familiarRate / unseenRate / illusory)", storeField: "proofLedger",
    whyItMatters: "The exam asks questions you have not seen.",
    notTheSameAs: "Doing well on questions you have already practised.",
  },
  {
    facet: "confidence", learnerName: "How sure Revise is", owner: "src/domain/exam-readiness.ts + src/domain/exam-outlook.ts",
    calculation: "buildExamReadiness (confidence) / outlookRows (provisional band)", storeField: "examReadiness, predictions",
    whyItMatters: "Little evidence means a wide range; Revise says so rather than guessing.",
    notTheSameAs: "Your score: confidence is about the evidence, not about you.",
  },
  {
    facet: "interventions", learnerName: "What you have tried", owner: "src/domain/intervention-calibration.ts",
    calculation: "createInterventionOutcome / durableOutcomeScore", storeField: "interventionOutcomes",
    whyItMatters: "Revise learns which kinds of session actually work for you.",
    notTheSameAs: "Outcomes: trying something is not evidence that it worked.",
  },
  {
    facet: "outcomes", learnerName: "Proven improvement", owner: "src/domain/proof-of-improvement.ts",
    calculation: "buildProofLedger (status proven-gain / declined)", storeField: "proofLedger",
    whyItMatters: "Only improvement on new questions after a delay is likely to show in the exam.",
    notTheSameAs: "Same-session success or repeating a question you have seen.",
  },
] as const;

export interface TopicRef { topicId: Id; title: string }

export interface SubjectLearnerModel {
  subjectId: Id;
  curriculum: { topics: number; started: number; notStarted: number };
  recall: { measuredTopics: number; dueCards: number; weak: TopicRef[] };
  application: {
    measuredTopics: number;
    weak: TopicRef[];
    /** Recall is reliable and secure, but marked application is weak: the "knows it, cannot use it" gap. */
    recallStrongApplicationWeak: TopicRef[];
  };
  examTechnique: { verdict: TechniqueVerdict; reliable: boolean; narrative: string | null };
  mistakes: Pick<RecoveryTotals, "previouslyLost" | "open" | "regressed" | "provisional" | "proven" | "evidence"> & {
    /** Topics with the most open marks, largest first. */
    topics: Array<TopicRef & { openMarks: number }>;
  };
  retention: { holding: TopicRef[]; fading: TopicRef[]; slipped: TopicRef[] };
  transfer: { memorised: TopicRef[]; proofDue: TopicRef[] };
  confidence: {
    readinessStatus: ExamReadinessStatus | null;
    /** Readiness's own evidence confidence, 0–1; null when readiness has not been built. */
    readinessConfidence: number | null;
    outlookProvisional: boolean | null;
  };
  interventions: { recorded: number; checkedAfterDelay: number };
  outcomes: {
    proven: Array<TopicRef & { claim: string | null }>;
    declined: TopicRef[];
    /** Marks on a 100-mark paper, from the ledger; 0 unless proven. */
    provenMarkPoints: number;
  };
}

export interface SubjectLearnerModelInput {
  subjectId: Id;
  topics: ReadonlyArray<Pick<Topic, "id" | "title">>;
  /** buildTopicLifecycles over exactly these topics. */
  lifecycles: readonly TopicLifecycle[];
  recall: readonly RecallMasteryRow[];
  application: readonly ApplicationMasteryRow[];
  recovery: MarkRecovery;
  technique?: KnowledgeAnsweringReport | null;
  outlook?: ExamOutlookRow | null;
  readiness?: ExamReadiness | null;
  ledger?: ProofLedger;
  interventionOutcomes?: readonly InterventionOutcomeRecord[];
}

const byTitle = (a: TopicRef, b: TopicRef) => a.title.localeCompare(b.title) || a.topicId.localeCompare(b.topicId);

export function projectSubjectModel(input: SubjectLearnerModelInput): SubjectLearnerModel {
  const { subjectId } = input;
  const topicIds = new Set(input.topics.map((t) => t.id));
  const title = new Map(input.topics.map((t) => [t.id, t.title] as const));
  const ref = (topicId: Id): TopicRef => ({ topicId, title: title.get(topicId) ?? topicId });
  const lifecycles = input.lifecycles.filter((l) => topicIds.has(l.topicId));
  const stage = (...stages: TopicLifecycle["stage"][]) => lifecycles.filter((l) => stages.includes(l.stage)).map((l) => ref(l.topicId)).sort(byTitle);

  const recall = input.recall.filter((r) => r.subjectId === subjectId && topicIds.has(r.topicId));
  const application = input.application.filter((r) => r.subjectId === subjectId && topicIds.has(r.topicId));
  const recallById = new Map(recall.map((r) => [r.topicId, r] as const));
  const measuredRecall = recall.filter((r) => r.evidence !== "unmeasured");
  const measuredApplication = application.filter((r) => r.evidence !== "unmeasured");

  const recovery = input.recovery.summarise((i) => i.subjectId === subjectId);
  const openByTopic = new Map<Id, number>();
  for (const item of input.recovery.items) {
    if (item.subjectId !== subjectId || !topicIds.has(item.topicId)) continue;
    if (item.state !== "open" && item.state !== "targeted" && item.state !== "regressed") continue;
    openByTopic.set(item.topicId, (openByTopic.get(item.topicId) ?? 0) + item.marks);
  }

  const ledgerRows = (input.ledger?.topics ?? []).filter((row) => row.subjectId === subjectId && topicIds.has(row.topicId));
  const claims = new Map(lifecycles.map((l) => [l.topicId, l.claim] as const));
  const records = (input.interventionOutcomes ?? []).filter((r) => r.subjectId === subjectId);

  return {
    subjectId,
    curriculum: {
      topics: input.topics.length,
      started: lifecycles.filter((l) => l.stage !== "not-started").length,
      notStarted: lifecycles.filter((l) => l.stage === "not-started").length,
    },
    recall: {
      measuredTopics: measuredRecall.length,
      dueCards: recall.reduce((sum, r) => sum + r.cardsDue, 0),
      weak: measuredRecall.filter((r) => r.mastery < EMERGING_THRESHOLD).map((r) => ref(r.topicId)).sort(byTitle),
    },
    application: {
      measuredTopics: measuredApplication.length,
      weak: measuredApplication.filter((r) => r.mastery < EMERGING_THRESHOLD).map((r) => ref(r.topicId)).sort(byTitle),
      recallStrongApplicationWeak: measuredApplication
        .filter((r) => {
          const rec = recallById.get(r.topicId);
          return r.mastery < EMERGING_THRESHOLD && rec?.evidence === "reliable" && rec.mastery >= DEVELOPING_THRESHOLD;
        })
        .map((r) => ref(r.topicId))
        .sort(byTitle),
    },
    examTechnique: {
      verdict: input.technique?.verdict ?? "none",
      reliable: input.technique?.reliable ?? false,
      narrative: input.technique?.reliable ? input.technique.narrative : null,
    },
    mistakes: {
      previouslyLost: recovery.previouslyLost, open: recovery.open, regressed: recovery.regressed,
      provisional: recovery.provisional, proven: recovery.proven, evidence: recovery.evidence,
      topics: [...openByTopic]
        .map(([topicId, marks]) => ({ ...ref(topicId), openMarks: Math.round(marks * 10) / 10 }))
        .sort((a, b) => b.openMarks - a.openMarks || byTitle(a, b)),
    },
    retention: { holding: stage("holding"), fading: stage("fading"), slipped: stage("slipped") },
    transfer: {
      memorised: lifecycles.filter((l) => l.memorised).map((l) => ref(l.topicId)).sort(byTitle),
      proofDue: lifecycles.filter((l) => l.dueNow).map((l) => ref(l.topicId)).sort(byTitle),
    },
    confidence: {
      readinessStatus: input.readiness?.status ?? null,
      readinessConfidence: input.readiness ? input.readiness.confidence : null,
      outlookProvisional: input.outlook ? input.outlook.provisional : null,
    },
    interventions: {
      recorded: records.length,
      checkedAfterDelay: records.filter((r) => durableOutcomeScore(r) !== null).length,
    },
    outcomes: {
      proven: ledgerRows
        .filter((row) => row.status === "proven-gain" && !row.illusory)
        .sort((a, b) => b.markPoints - a.markPoints || a.topicId.localeCompare(b.topicId))
        .map((row) => ({ ...ref(row.topicId), claim: claims.get(row.topicId) ?? null })),
      declined: ledgerRows.filter((row) => row.status === "declined").map((row) => ref(row.topicId)).sort(byTitle),
      provenMarkPoints: Math.round(ledgerRows.filter((row) => row.status === "proven-gain" && !row.illusory).reduce((s, row) => s + row.markPoints, 0) * 10) / 10,
    },
  };
}
