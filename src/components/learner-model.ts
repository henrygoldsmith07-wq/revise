"use client";

// One derivation of the learner model and the Exam Command Centre, shared by
// every surface that shows them. Nothing is stored: each value is read from
// the store's own derived state (recall/application mastery, the proof
// ledger, readiness, predictions, outcome records) and the shared recovery
// evidence, then composed by the pure projections in src/domain.

import { useMemo } from "react";
import { allTopics, getSubject } from "@/domain/curriculum";
import { buildCommandCentre, type CommandCentre } from "@/domain/exam-command-centre";
import { outlookRows } from "@/domain/exam-outlook";
import { knowledgeVsAnswering } from "@/domain/exam-technique";
import { buildInterventionMemory, type InterventionMemory } from "@/domain/intervention-memory";
import { projectSubjectModel, type SubjectLearnerModel } from "@/domain/learner-model";
import { forecastUntouched } from "@/domain/pace-forecast";
import { buildTopicLifecycles } from "@/domain/proof-lifecycle";
import { useStoreFields } from "@/state/store";
import { useRecoveryEvidence, useRevisionPlan } from "./recovery-evidence";

/** Per-subject learner models for the enrolled subjects. */
export function useLearnerModels(): SubjectLearnerModel[] {
  const evidence = useRecoveryEvidence();
  const store = useStoreFields("applicationMastery", "attempts", "examReadiness", "interventionOutcomes", "mastery", "mistakes", "predictions", "proofLedger", "questions", "recallMastery", "settings");
  return useMemo(() => {
    const subjectIds = store.settings.subjectIds;
    const topics = allTopics(subjectIds);
    const reviewedTopicIds = new Set(store.mastery.filter((row) => row.attempts > 0).map((row) => row.topicId));
    const lifecycles = buildTopicLifecycles({ topics, ledger: store.proofLedger, attempts: store.attempts, questions: store.questions, reviewedTopicIds });
    const outlook = outlookRows(store.predictions, store.attempts, store.questions);
    return subjectIds.map((subjectId) => {
      const subjectTopics = topics.filter((t) => t.subjectId === subjectId);
      return projectSubjectModel({
        subjectId,
        topics: subjectTopics,
        lifecycles,
        recall: store.recallMastery,
        application: store.applicationMastery,
        recovery: evidence.recovery,
        technique: knowledgeVsAnswering({ subjectId, mistakes: store.mistakes, questions: store.questions, attempts: store.attempts }),
        outlook: outlook.find((row) => row.subjectId === subjectId) ?? null,
        readiness: store.examReadiness.find((row) => row.subjectId === subjectId) ?? null,
        ledger: store.proofLedger,
        interventionOutcomes: store.interventionOutcomes,
      });
    });
  }, [evidence.recovery, store.applicationMastery, store.attempts, store.examReadiness, store.interventionOutcomes, store.mastery, store.mistakes, store.predictions, store.proofLedger, store.questions, store.recallMastery, store.settings.subjectIds]);
}

/** The Exam Command Centre over the shared plan and learner models. */
export function useCommandCentre(): CommandCentre {
  const models = useLearnerModels();
  const { plan } = useRevisionPlan();
  const store = useStoreFields("attempts", "examDates", "examReadiness", "mastery", "predictions", "questions", "reviewLogs", "settings");
  return useMemo(() => {
    const now = new Date();
    return buildCommandCentre({
      now,
      subjectIds: store.settings.subjectIds,
      subjectName: (id) => getSubject(id)?.name ?? id,
      models,
      examDates: store.examDates,
      outlook: outlookRows(store.predictions, store.attempts, store.questions),
      readiness: store.examReadiness,
      targetGrades: store.settings.targetGrades,
      actions: plan.actions,
      pace: forecastUntouched({ now, subjectIds: store.settings.subjectIds, mastery: store.mastery, reviewLogs: store.reviewLogs, examDates: store.examDates }),
    });
  }, [models, plan.actions, store.attempts, store.examDates, store.examReadiness, store.mastery, store.predictions, store.questions, store.reviewLogs, store.settings.subjectIds, store.settings.targetGrades]);
}

/** What Revise has learned about which kinds of session work for this learner. */
export function useInterventionMemory(): InterventionMemory {
  const evidence = useRecoveryEvidence();
  const store = useStoreFields("interventionOutcomes", "proofLedger", "settings");
  return useMemo(() => buildInterventionMemory({
    records: store.interventionOutcomes ?? [],
    chains: evidence.effectiveness.chains,
    patterns: evidence.patterns,
    ledger: store.proofLedger,
    topicTitle: evidence.topicTitle,
    subjectIds: store.settings.subjectIds,
  }), [evidence.effectiveness.chains, evidence.patterns, evidence.topicTitle, store.interventionOutcomes, store.proofLedger, store.settings.subjectIds]);
}
