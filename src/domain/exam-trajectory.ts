// ---------------------------------------------------------------------------
// Exam trajectory — where the learner is, where current evidence points, what
// is driving the risk and which actions could change it.
//
// A projection only:
//   position  ← exam-outlook (percentBand / provisional / MIN_OUTLOOK_ATTEMPTS)
//   risk      ← exam-readiness status (its own confidence gate)
//   drivers   ← the learner model (mark recovery, recall vs application,
//               retention, transfer, coverage)
//   levers    ← the Next Best Action plan's own ranked actions
//
// It never computes a grade, a band or a probability, and it never claims an
// action will move the grade: proven gains are stated as what they are
// (better on new questions after a delay), not as a cause of the band.
// Pure domain: no React, no storage, no clock.
// ---------------------------------------------------------------------------

import { MIN_OUTLOOK_ATTEMPTS, type ExamOutlookRow } from "./exam-outlook";
import type { ExamReadiness } from "./exam-readiness";
import type { SubjectLearnerModel, TopicRef } from "./learner-model";
import { confidenceWord, EVIDENCE_CONFIDENCE } from "./plain-numbers";
import type { RevisionAction } from "./revision-engine";
import type { Id } from "./types";

export type TrajectoryPosition =
  | { kind: "band"; low: number; high: number; grade: string; provisional: boolean; confidence: "low" | "moderate" | "high" }
  | { kind: "forming"; answers: number; needed: number }
  | { kind: "none" };

export type RiskLevel = "on-track" | "close" | "at-risk" | "too-early";

export const RISK_LABEL: Record<RiskLevel, string> = {
  "on-track": "On track",
  close: "Close",
  "at-risk": "At risk",
  "too-early": "Too early to say",
};

export interface TrajectoryLever { id: string; title: string; minutes: number; href: string }

export interface ExamTrajectory {
  subjectId: Id;
  position: TrajectoryPosition;
  risk: RiskLevel;
  riskLabel: string;
  /** Where current evidence suggests the learner is heading, in one sentence. */
  heading: string;
  /** What is driving the risk, most important first; at most three. */
  drivers: string[];
  /** Ranked actions from the plan that work on this subject; at most two. */
  levers: TrajectoryLever[];
  /** Evidence-backed improvement, never phrased as a cause of the band. */
  provenLine: string | null;
}

export interface ExamTrajectoryInput {
  model: SubjectLearnerModel;
  outlook?: ExamOutlookRow | null;
  readiness?: ExamReadiness | null;
  targetGrade?: string | null;
  /** The ranked plan's actions; filtered to this subject here. */
  actions?: readonly RevisionAction[];
}

const names = (rows: readonly TopicRef[], max = 2) =>
  rows.slice(0, max).map((r) => r.title).join(" and ") + (rows.length > max ? ` and ${rows.length - max} more` : "");

const many = (rows: readonly TopicRef[]) => rows.length > 1;

function riskOf(readiness: ExamReadiness | null | undefined): RiskLevel {
  switch (readiness?.status) {
    case "ready": return "on-track";
    case "nearly-ready": return "close";
    case "at-risk": return "at-risk";
    default: return "too-early";
  }
}

function positionOf(outlook: ExamOutlookRow | null | undefined): TrajectoryPosition {
  if (!outlook || outlook.attempts === 0) return { kind: "none" };
  if (outlook.attempts < MIN_OUTLOOK_ATTEMPTS) return { kind: "forming", answers: outlook.attempts, needed: MIN_OUTLOOK_ATTEMPTS - outlook.attempts };
  return {
    kind: "band", low: outlook.low, high: outlook.high, grade: outlook.grade, provisional: outlook.provisional,
    confidence: confidenceWord(outlook.confidence, EVIDENCE_CONFIDENCE) ?? "low",
  };
}

/** What is pulling the trajectory down, from the learner model only. */
export function trajectoryDrivers(model: SubjectLearnerModel): string[] {
  const out: string[] = [];
  const m = model.mistakes;
  if (m.regressed > 0) out.push(`${m.regressed} mark${m.regressed === 1 ? "" : "s"} you had recovered slipped again.`);
  if (m.open > 0) {
    const where = m.topics.length ? `, mostly in ${names(m.topics)}` : "";
    out.push(`${m.open} lost mark${m.open === 1 ? " is" : "s are"} not recovered yet${where}.`);
  }
  if (model.application.recallStrongApplicationWeak.length) {
    const rows = model.application.recallStrongApplicationWeak;
    out.push(`You remember ${names(rows)}, but lose marks applying ${many(rows) ? "them" : "it"} to exam questions.`);
  } else if (model.application.weak.length) {
    out.push(`Exam-style answers are weak in ${names(model.application.weak)}.`);
  }
  if (model.transfer.memorised.length) out.push(`${names(model.transfer.memorised)} ${many(model.transfer.memorised) ? "hold" : "holds"} up on questions you have seen, but not on new ones.`);
  if (model.retention.slipped.length) out.push(`${names(model.retention.slipped)} scored lower on new questions after a delay.`);
  else if (model.retention.fading.length) out.push(`${names(model.retention.fading)} ${many(model.retention.fading) ? "have" : "has"} not been practised for a while and may be fading.`);
  if (model.examTechnique.reliable && model.examTechnique.verdict === "answering") out.push("More marks are lost on how answers are written than on what you know.");
  if (model.curriculum.notStarted > 0 && model.curriculum.started > 0) {
    out.push(`${model.curriculum.notStarted} topic${model.curriculum.notStarted === 1 ? " has" : "s have"} not been started yet.`);
  }
  return out.slice(0, 3);
}

export function buildExamTrajectory(input: ExamTrajectoryInput): ExamTrajectory {
  const { model, readiness } = input;
  const position = positionOf(input.outlook);
  const risk = riskOf(readiness);
  const target = input.targetGrade ?? readiness?.targetGrade ?? null;

  let heading: string;
  if (position.kind === "none") {
    heading = "No marked exam-style answers yet, so Revise cannot say where you are heading.";
  } else if (position.kind === "forming") {
    heading = `A likely score range appears after ${position.needed} more marked answer${position.needed === 1 ? "" : "s"}.`;
  } else if (position.provisional || risk === "too-early") {
    heading = `Early estimate: ${position.low}–${position.high}%. The range narrows as you answer more questions without help.`;
  } else if (target && readiness && readiness.gapPercent !== null) {
    heading = readiness.gapPercent > 0
      ? `Current evidence points to ${position.low}–${position.high}%, below your ${target} target.`
      : `Current evidence points to ${position.low}–${position.high}%, in line with your ${target} target.`;
  } else {
    heading = `Current evidence points to ${position.low}–${position.high}% (most likely grade ${position.grade}).`;
  }

  const proven = model.outcomes.proven.length;
  return {
    subjectId: model.subjectId,
    position,
    risk,
    riskLabel: RISK_LABEL[risk],
    heading,
    drivers: trajectoryDrivers(model),
    levers: (input.actions ?? [])
      .filter((a) => a.subjectId === model.subjectId)
      .slice(0, 2)
      .map((a) => ({ id: a.id, title: a.title, minutes: Math.max(1, Math.ceil(a.minutes)), href: a.route.href })),
    provenLine: proven
      ? `${proven} topic${proven === 1 ? "" : "s"} improved on new questions after a delay: ${names(model.outcomes.proven, 3)}.`
      : null,
  };
}
