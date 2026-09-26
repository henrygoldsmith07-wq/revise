import { REVIEWED_WJEC_SUBJECT_IDS } from "./physics-content-review";
import type { Id, Question } from "./types";

export const WJEC_RELEASE_SET_VERSION = 1 as const;

export interface WjecReleaseSetFile {
  formatVersion: typeof WJEC_RELEASE_SET_VERSION;
  subjects: Record<string, Id[]>;
}

export interface WjecReleaseSetIssue {
  kind: "invalid-file" | "invalid-subject" | "duplicate-question" | "unknown-question" | "subject-mismatch" | "blocked-question";
  detail: string;
  blocking: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveWjecReleaseSet(
  questions: readonly Question[],
  raw: unknown,
): { questionIds: Set<Id>; issues: WjecReleaseSetIssue[] } {
  const issues: WjecReleaseSetIssue[] = [];
  const questionIds = new Set<Id>();
  if (!isObject(raw) || raw.formatVersion !== WJEC_RELEASE_SET_VERSION || !isObject(raw.subjects)) {
    return {
      questionIds,
      issues: [{ kind: "invalid-file", detail: "Release set must be a version-1 object with a subjects map.", blocking: true }],
    };
  }
  const byId = new Map(questions.map((question) => [question.id, question] as const));
  const allowedSubjects = new Set<string>(REVIEWED_WJEC_SUBJECT_IDS);
  for (const subjectId of REVIEWED_WJEC_SUBJECT_IDS) {
    if (!Object.prototype.hasOwnProperty.call(raw.subjects, subjectId)) {
      issues.push({ kind: "invalid-subject", detail: `Release set is missing explicit subject ${subjectId}.`, blocking: true });
    }
  }

  for (const [subjectId, rows] of Object.entries(raw.subjects)) {
    if (!allowedSubjects.has(subjectId) || !Array.isArray(rows)) {
      issues.push({ kind: "invalid-subject", detail: `Invalid WJEC release-set subject ${subjectId}.`, blocking: true });
      continue;
    }
    const seenForSubject = new Set<string>();
    for (const value of rows) {
      if (typeof value !== "string" || !value.trim()) {
        issues.push({ kind: "unknown-question", detail: `${subjectId} contains a non-string/blank question id.`, blocking: true });
        continue;
      }
      if (seenForSubject.has(value)) {
        issues.push({ kind: "duplicate-question", detail: `${subjectId} contains duplicate release question ${value}.`, blocking: true });
        continue;
      }
      seenForSubject.add(value);
      const question = byId.get(value);
      if (!question) {
        issues.push({ kind: "unknown-question", detail: `Release question ${value} is not in the current bank.`, blocking: true });
        continue;
      }
      if (question.subjectId !== subjectId) {
        issues.push({ kind: "subject-mismatch", detail: `Release question ${value} belongs to ${question.subjectId}, not ${subjectId}.`, blocking: true });
        continue;
      }
      if (["retired", "rejected", "needs_changes"].includes(question.validation?.stage ?? "")) {
        issues.push({ kind: "blocked-question", detail: `Release question ${value} is currently ${question.validation?.stage}.`, blocking: true });
        continue;
      }
      questionIds.add(value);
    }
  }

  return { questionIds, issues };
}
