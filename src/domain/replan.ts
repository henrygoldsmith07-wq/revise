import { buildPlan, rescheduleMissed } from "./planner";
import { toDateOnly } from "./scheduling";
import type { SubjectEvidence } from "./subject-allocation";
import type {
  Availability,
  ExamDate,
  Id,
  PlannedSession,
  Subject,
  Topic,
  TopicMastery,
} from "./types";

// ---------------------------------------------------------------------------
// Dynamic session replanning. The timetable is derived state, so it should
// react to the things that invalidate it — a missed session, a moved exam, a
// changed target grade, different availability — instead of waiting for a
// manual rebuild. This module fingerprints those inputs, detects what changed,
// and applies the smallest correct repair (roll missed work forward, or do a
// full rebuild of pending future sessions while preserving history).
// ---------------------------------------------------------------------------

export type ReplanReason =
  | "sessions-missed"
  | "exam-changed"
  | "target-changed"
  | "availability-changed"
  | "session-length-changed"
  | "subject-set-changed"
  | "year-changed";

/** The replan-relevant inputs, reduced to comparable strings/values. */
export interface ReplanFingerprint {
  exams: string;
  targets: string;
  availability: string;
  sessionLength: number;
  subjects: string;
  /** School year ("" when unset): Year 12 drops A2-only topics from the plan. */
  year?: string;
  /** Year 13 Unit 4 option letter, present only when chosen. */
  unit4?: string;
}

export function computeFingerprint(input: {
  exams: ExamDate[];
  targetGrades: Record<Id, string>;
  availability: Availability[];
  sessionLengthMinutes: number;
  subjectIds: Id[];
  yearGroup?: string;
  unit4Option?: string;
}): ReplanFingerprint {
  return {
    exams: input.exams
      .map((e) => `${e.subjectId}:${e.date}`)
      .sort()
      .join("|"),
    targets: Object.entries(input.targetGrades)
      .map(([id, grade]) => `${id}:${grade}`)
      .sort()
      .join("|"),
    availability: input.availability
      .map((a) => `${a.weekday}:${a.minutes}`)
      .sort()
      .join("|"),
    sessionLength: input.sessionLengthMinutes,
    subjects: [...input.subjectIds].sort().join("|"),
    year: input.yearGroup ?? "",
    ...(input.unit4Option ? { unit4: input.unit4Option } : {}),
  };
}

export function fingerprintKey(fp: ReplanFingerprint): string {
  return JSON.stringify(fp);
}

export interface ReplanInput {
  userId: Id;
  topics: Topic[];
  subjects: Subject[];
  mastery: TopicMastery[];
  exams: ExamDate[];
  availability: Availability[];
  sessionLengthMinutes: number;
  subjectIds: Id[];
  targetGrades: Record<Id, string>;
  yearGroup?: string;
  unit4Option?: string;
  existing: PlannedSession[];
  /** Live cross-subject evidence so scarce blocks go to the strongest work. */
  evidence?: Map<Id, SubjectEvidence>;
  /** Fingerprint of the inputs the current plan was built from, when known. */
  previous?: ReplanFingerprint;
  now?: Date;
  horizonDays?: number;
  /** Daily block cap used when rolling missed sessions forward. */
  dailyBlockCap?: number;
  idFactory?: () => string;
}

export interface ReplanResult {
  plan: PlannedSession[];
  changed: boolean;
  reasons: ReplanReason[];
  fingerprint: ReplanFingerprint;
  /** Human summary of what moved and why, or null when nothing changed. */
  summary: string | null;
}

export function replanDynamically(input: ReplanInput): ReplanResult {
  const now = input.now ?? new Date();
  const today = toDateOnly(now);
  const nextId = input.idFactory ?? (() => crypto.randomUUID());
  const fingerprint = computeFingerprint(input);
  const previous = input.previous;

  const reasons: ReplanReason[] = [];
  if (previous) {
    if (fingerprint.exams !== previous.exams) reasons.push("exam-changed");
    if (fingerprint.targets !== previous.targets) reasons.push("target-changed");
    if (fingerprint.availability !== previous.availability) reasons.push("availability-changed");
    if (fingerprint.sessionLength !== previous.sessionLength) reasons.push("session-length-changed");
    if (fingerprint.subjects !== previous.subjects) reasons.push("subject-set-changed");
    if ((fingerprint.year ?? "") !== (previous.year ?? "") || (fingerprint.unit4 ?? "") !== (previous.unit4 ?? "")) reasons.push("year-changed");
  }
  const structural = reasons.length > 0;

  const hadMissed = input.existing.some((s) => s.status === "pending" && s.date < today);
  if (hadMissed) reasons.push("sessions-missed");

  let plan = input.existing;
  if (hadMissed) {
    plan = rescheduleMissed(plan, today, input.dailyBlockCap ?? 6, nextId, {
      exams: input.exams,
      availability: input.availability,
    });
  }
  // Ids of the replacement blocks the roll-forward created, so the summary
  // only claims what is still in the final plan.
  const before = new Set(input.existing.map((s) => s.id));
  const rolledIds = new Set(plan.filter((s) => !before.has(s.id) && s.status === "pending").map((s) => s.id));
  if (structural) {
    plan = buildPlan({
      userId: input.userId,
      topics: input.topics,
      subjects: input.subjects,
      mastery: input.mastery,
      exams: input.exams,
      availability: input.availability,
      sessionLengthMinutes: input.sessionLengthMinutes,
      subjectIds: input.subjectIds,
      targetGrades: input.targetGrades,
      evidence: input.evidence,
      horizonDays: input.horizonDays,
      now,
      existing: plan,
      idFactory: nextId,
    });
  }

  const changed = hadMissed || structural;
  const rolledSurvived = plan.filter((s) => rolledIds.has(s.id)).length;
  return {
    plan,
    changed,
    reasons,
    fingerprint,
    summary: changed ? describeReplan(reasons, rolledSurvived) : null,
  };
}

function describeReplan(reasons: ReplanReason[], rolledSurvived: number): string {
  const parts: string[] = [];
  if (reasons.includes("exam-changed")) parts.push("an exam date changed");
  if (reasons.includes("target-changed")) parts.push("a target grade changed");
  if (reasons.includes("availability-changed")) parts.push("your availability changed");
  if (reasons.includes("session-length-changed")) parts.push("session length changed");
  if (reasons.includes("subject-set-changed")) parts.push("your subjects changed");
  if (reasons.includes("year-changed")) parts.push("your year group or Unit 4 option changed");
  if (reasons.includes("sessions-missed")) {
    // Say only what survived: a structural rebuild replaces rolled-forward
    // blocks, and work with no room before its exam is not re-queued.
    parts.push(rolledSurvived > 0
      ? `${rolledSurvived} missed session${rolledSurvived === 1 ? " was" : "s were"} rolled forward`
      : "missed sessions stay marked as missed");
  }
  return `Plan updated because ${parts.join(", ")}.`;
}
