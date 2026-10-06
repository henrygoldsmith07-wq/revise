// ---------------------------------------------------------------------------
// Exam Command Centre — one decision-first view across subjects.
//
// The first layer answers, per subject, in seconds: when is the exam, how is
// it going, and what is the one thing to do. Everything else (strongest
// areas, highest-value weaknesses, proven improvements, unresolved mistakes)
// is a second layer the UI discloses on request.
//
// Composition only: rows are built from the learner model and the exam
// trajectory, which in turn read the authoritative domain modules. Nothing
// here scores, predicts or ranks; ordering uses the exam date the learner
// entered and the risk level exam-readiness already decided.
// Pure domain: no React, no storage, no clock beyond `now`.
// ---------------------------------------------------------------------------

import { buildExamTrajectory, type ExamTrajectory, type RiskLevel } from "./exam-trajectory";
import type { ExamOutlookRow } from "./exam-outlook";
import type { ExamReadiness } from "./exam-readiness";
import type { SubjectLearnerModel, TopicRef } from "./learner-model";
import type { PaceForecast } from "./pace-forecast";
import { daysToNearestExam, type RevisionAction } from "./revision-engine";
import type { ExamDate, Id } from "./types";

export interface CommandCentreSubject {
  subjectId: Id;
  name: string;
  exam: { date: string; days: number } | null;
  trajectory: ExamTrajectory;
  /** The single best action for this subject from the shared plan, if any. */
  next: { title: string; minutes: number; href: string; why: string } | null;
  /** Second layer. */
  strongest: TopicRef[];
  weaknesses: Array<TopicRef & { reason: string }>;
  proven: Array<TopicRef & { claim: string | null }>;
  unresolved: Array<TopicRef & { openMarks: number }>;
}

export interface CommandCentre {
  subjects: CommandCentreSubject[];
  /** One sentence the learner can read before anything else. */
  headline: string;
  /** The pace sentence, only when the pace forecast produced one. */
  pace: string | null;
  /** Totals across subjects for the "recently proven" strip; 0 means nothing proven yet. */
  provenTopics: number;
}

export interface CommandCentreInput {
  now: Date;
  subjectIds: readonly Id[];
  subjectName: (id: Id) => string;
  models: readonly SubjectLearnerModel[];
  examDates: readonly ExamDate[];
  outlook?: readonly ExamOutlookRow[];
  readiness?: readonly ExamReadiness[];
  targetGrades?: Readonly<Record<Id, string | null | undefined>>;
  actions?: readonly RevisionAction[];
  pace?: PaceForecast | null;
}

const RISK_ORDER: Record<RiskLevel, number> = { "at-risk": 0, close: 1, "too-early": 2, "on-track": 3 };

function weaknessesOf(model: SubjectLearnerModel): Array<TopicRef & { reason: string }> {
  const out = new Map<Id, TopicRef & { reason: string }>();
  const add = (row: TopicRef, reason: string) => { if (!out.has(row.topicId)) out.set(row.topicId, { ...row, reason }); };
  for (const row of model.mistakes.topics) add(row, `${row.openMarks} lost mark${row.openMarks === 1 ? "" : "s"} still open`);
  for (const row of model.retention.slipped) add(row, "Scored lower on new questions after a delay");
  for (const row of model.application.recallStrongApplicationWeak) add(row, "Remembered, but not yet applied for marks");
  for (const row of model.transfer.memorised) add(row, "Holds up on familiar questions only");
  for (const row of model.application.weak) add(row, "Exam-style answers losing marks");
  for (const row of model.retention.fading) add(row, "Not practised for a while");
  return [...out.values()].slice(0, 3);
}

function strongestOf(model: SubjectLearnerModel): TopicRef[] {
  const seen = new Set<Id>();
  const out: TopicRef[] = [];
  for (const row of [...model.outcomes.proven, ...model.retention.holding]) {
    if (seen.has(row.topicId)) continue;
    seen.add(row.topicId);
    out.push({ topicId: row.topicId, title: row.title });
  }
  return out.slice(0, 3);
}

export function buildCommandCentre(input: CommandCentreInput): CommandCentre {
  const enrolled = new Set(input.subjectIds);
  const subjects: CommandCentreSubject[] = input.models
    .filter((model) => enrolled.has(model.subjectId))
    .map((model) => {
      const id = model.subjectId;
      const days = daysToNearestExam(input.examDates, id, input.now);
      const date = days === null ? null : input.examDates
        .filter((e) => e.subjectId === id && e.date.slice(0, 10) >= input.now.toISOString().slice(0, 10))
        .map((e) => e.date.slice(0, 10))
        .sort()[0] ?? null;
      const actions = (input.actions ?? []).filter((a) => a.subjectId === id);
      const top = actions[0];
      return {
        subjectId: id,
        name: input.subjectName(id),
        exam: days !== null && date ? { date, days } : null,
        trajectory: buildExamTrajectory({
          model,
          outlook: input.outlook?.find((r) => r.subjectId === id) ?? null,
          readiness: input.readiness?.find((r) => r.subjectId === id) ?? null,
          targetGrade: input.targetGrades?.[id] ?? null,
          actions,
        }),
        next: top ? { title: top.title, minutes: Math.max(1, Math.ceil(top.minutes)), href: top.route.href, why: top.explanation.why } : null,
        strongest: strongestOf(model),
        weaknesses: weaknessesOf(model),
        proven: model.outcomes.proven.slice(0, 3),
        unresolved: model.mistakes.topics.slice(0, 3),
      };
    })
    .sort((a, b) =>
      (a.exam?.days ?? Number.MAX_SAFE_INTEGER) - (b.exam?.days ?? Number.MAX_SAFE_INTEGER) ||
      RISK_ORDER[a.trajectory.risk] - RISK_ORDER[b.trajectory.risk] ||
      a.name.localeCompare(b.name));

  const provenTopics = subjects.reduce((sum, s) => sum + s.proven.length, 0);
  const nearest = subjects.find((s) => s.exam);
  const atRisk = subjects.filter((s) => s.trajectory.risk === "at-risk");
  let headline: string;
  if (!subjects.length) headline = "Choose your subjects to see your exams here.";
  else if (!nearest) headline = "Add your exam dates so Revise can plan the run-up and show how each subject is tracking.";
  else {
    const when = nearest.exam!.days === 0 ? "today" : `in ${nearest.exam!.days} day${nearest.exam!.days === 1 ? "" : "s"}`;
    const risk = atRisk.length === 0 ? ""
      : atRisk[0]!.subjectId === nearest.subjectId ? ", and it is the one most at risk"
      : `. ${atRisk[0]!.name} is the one most at risk`;
    headline = `Your next exam is ${nearest.name}, ${when}${risk}.`;
  }

  return { subjects, headline, pace: input.pace?.sentence ?? null, provenTopics };
}
