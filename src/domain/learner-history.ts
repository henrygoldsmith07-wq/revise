import { z } from "zod";
import { compareStamps } from "./lamport";
import { canonicalJson, sha256Hex } from "./content-fingerprint";

export const HISTORY_KINDS = ["gradePredictions", "gradeActuals", "paperOutcomes", "interventionOutcomes"] as const;
export type HistoryKind = typeof HISTORY_KINDS[number];
const text = z.string().min(1);
const instant = z.iso.datetime({ offset: true });
const percent = z.number().finite().min(0).max(100);
const ratio = z.number().finite().min(0).max(1);
const base = z.object({ id: text, subjectId: text }).passthrough();
const observation = z.object({ awarded: z.number().nonnegative(), max: z.number().nonnegative(), independent: z.boolean(), attemptId: text, at: instant, trusted: z.boolean().optional(), result: z.enum(["passed", "missed", "viewed", "scheduled"]).optional() }).passthrough()
  .refine(row => row.awarded <= row.max, "Awarded marks exceed maximum.");
const schemas = {
  gradePredictions: base.extend({ anonId: text, predictedPercent: percent, lowerPercent: percent, upperPercent: percent, gradeLabel: text, confidence: ratio, evidenceShare: ratio, createdAt: instant })
    .refine(row => row.lowerPercent <= row.predictedPercent && row.predictedPercent <= row.upperPercent, "Invalid prediction interval."),
  gradeActuals: base.extend({ anonId: text, percent, kind: z.enum(["mock", "paper", "final"]), takenAt: instant }),
  paperOutcomes: base.extend({ userId: text, paperId: text, paperRunId: text.optional(), predictedMarks: z.number().nonnegative(), totalMarks: z.number().positive(), actualMarks: z.number().min(-1), satAt: instant })
    .refine(row => row.actualMarks <= row.totalMarks && row.predictedMarks <= row.totalMarks, "Invalid paper marks."),
  interventionOutcomes: base.extend({ userId: text, topicId: text, capabilityId: text, kind: z.enum(["diagnose", "guided", "independent", "transfer", "retention"]), priorState: z.enum(["unknown", "weak", "developing", "secure"]), priorAccuracy: ratio.optional(), evidenceVersion: z.literal(2).optional(), timeMeasured: z.boolean().optional(), activity: z.enum(["question", "retrieval", "teaching"]).optional(), plannedMinutes: z.number().nonnegative(), actualMinutes: z.number().nonnegative(), support: z.enum(["none", "cue", "prompt", "scaffold", "worked-solution"]), immediate: observation, transfer: observation.safeExtend({ questionId: text }).optional(), delayedRetention: observation.safeExtend({ questionId: text }).optional(), createdAt: instant, updatedAt: instant }),
};

export interface LearnerHistoryRecord {
  id: string;
  userId: string;
  kind: HistoryKind;
  recordId: string;
  value: Record<string, unknown> | null;
  deleted: boolean;
  lamport: number;
  deviceId: string;
}

export function validateHistoryValue(kind: HistoryKind, value: unknown, userId: string): Record<string, unknown> {
  const row = schemas[kind].parse(value);
  if ((kind === "gradePredictions" || kind === "gradeActuals" ? row.anonId : row.userId) !== userId ||
      (row.userId !== undefined && row.userId !== userId)) throw new Error("Mixed-owner learner history.");
  return row;
}
export function historyRecordId(kind: HistoryKind, id: string): string { return `${kind}:${id}`; }
export function historyStorageKey(id: string): string { return `revise.historyRecord.v1:${id}`; }

export function historyFrozenFingerprint(row: LearnerHistoryRecord): string {
  if (!row.value) return "";
  const fields = row.kind === "gradePredictions" ? row.value : row.kind === "paperOutcomes"
    ? Object.fromEntries(["predictedMarks", "totalMarks", "satAt", "paperId", "paperRunId"].map(key => [key, row.value?.[key] ?? null])) : null;
  return fields === null ? "" : sha256Hex(canonicalJson(fields));
}

export function validateHistoryRecord(value: unknown, owner: string): LearnerHistoryRecord {
  const row = z.object({ id: text, userId: text, kind: z.enum(HISTORY_KINDS), recordId: text, deleted: z.boolean(), value: z.record(z.string(), z.unknown()).nullable(), lamport: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), deviceId: text }).strict().parse(value);
  if (row.userId !== owner || row.id !== historyRecordId(row.kind, row.recordId)) throw new Error("Invalid learner history identity.");
  if (row.deleted ? row.value !== null : row.value === null) throw new Error("Invalid learner history deletion.");
  if (row.value) {
    const value = validateHistoryValue(row.kind, row.value, owner);
    if (value.id !== row.recordId) throw new Error("Contradictory history record id.");
  }
  return row;
}

/** Terminal deletion and causal ordering. Arrival time never determines truth. */
export function mergeHistoryRecord(local: LearnerHistoryRecord | undefined, remote: LearnerHistoryRecord): LearnerHistoryRecord {
  if (!local) return remote;
  if (local.userId !== remote.userId || local.id !== remote.id) throw new Error("Mixed history identity.");
  if (local.deleted) return local;
  if (remote.deleted) return remote;
  if (compareStamps({ counter: remote.lamport, deviceId: remote.deviceId }, { counter: local.lamport, deviceId: local.deviceId }) <= 0) return local;
  // Forecasts and sit-time predictions must never be rewritten using later evidence.
  const frozen = local.kind === "gradePredictions" ? Object.keys(local.value ?? {}) :
    local.kind === "paperOutcomes" ? ["predictedMarks", "totalMarks", "satAt", "paperId", "paperRunId"] : [];
  if (frozen.some(key => canonicalJson(local.value?.[key] ?? null) !== canonicalJson(remote.value?.[key] ?? null))) throw new Error("Frozen prediction changed.");
  return remote;
}
