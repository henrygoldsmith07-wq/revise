import type { SpecManifestEntry } from "./spec";
import { SPEC_MANIFEST } from "./spec";
import { getQualification } from "./curriculum";
import type { Card, Id, IsoDate, Question, Subject, Topic } from "./types";

export type SpecificationAuditStatus = "pass" | "review" | "fail";
export type SpecificationAuditSeverity = "warning" | "error";
export type SpecificationAuditScope = "subject" | "topic" | "spec-point" | "question" | "card";

export type SpecificationAuditIssueKind =
  | "duplicate-manifest"
  | "missing-manifest"
  | "manifest-count-gap"
  | "manifest-count-overrun"
  | "missing-spec-points"
  | "duplicate-spec-point-id"
  | "duplicate-spec-point-ref"
  | "missing-spec-point-metadata"
  | "invalid-date"
  | "future-date"
  | "version-mismatch"
  | "unverified-spec-point"
  | "stale-spec-point"
  | "statement-no-cards"
  | "statement-no-questions"
  | "unmapped-question"
  | "question-topic-mismatch"
  | "question-claim-alignment"
  | "dangling-question-spec-point"
  | "dangling-card-spec-point"
  | "card-topic-mismatch";

export type SpecificationAuditCard = Pick<
  Card,
  "id" | "subjectId" | "topicId" | "specPointIds" | "specVersion" | "lastChecked"
>;

export interface SpecificationAuditIssue {
  kind: SpecificationAuditIssueKind;
  severity: SpecificationAuditSeverity;
  scope: SpecificationAuditScope;
  subjectId: Id;
  id: Id;
  detail: string;
}

export interface SpecificationSubjectAudit {
  subjectId: Id;
  status: SpecificationAuditStatus;
  specVersion: string | null;
  manifestStatements: number | null;
  authoredStatements: number;
  missingManifestStatements: number;
  extraAuthoredStatements: number;
  verifiedStatements: number;
  statementsWithCards: number;
  statementsWithQuestions: number;
  authoredCoverage: number;
  verifiedCoverage: number;
  learnableCoverage: number;
  assessableCoverage: number;
  issues: SpecificationAuditIssue[];
}

export interface SpecificationCoverageAudit {
  status: SpecificationAuditStatus;
  totals: {
    subjects: number;
    manifestStatements: number;
    authoredStatements: number;
    missingManifestStatements: number;
    verifiedStatements: number;
    statementsWithCards: number;
    statementsWithQuestions: number;
    errors: number;
    warnings: number;
  };
  subjects: SpecificationSubjectAudit[];
  issues: SpecificationAuditIssue[];
}

export interface SpecificationCoverageAuditInput {
  subjects: readonly Subject[];
  topics: readonly Topic[];
  questions: readonly Question[];
  cards?: readonly SpecificationAuditCard[];
  manifest?: readonly SpecManifestEntry[];
  today?: IsoDate;
  staleAfterDays?: number;
}

interface PointRecord {
  subjectId: Id;
  topicId: Id;
  pointId: Id;
  ref: string;
}

const DEFAULT_STALE_DAYS = 365;

/**
 * Audit the authored specification model and its retrieval/exam links.
 *
 * This is deliberately pure: the caller supplies the curriculum, questions
 * and cards, so the same report can run in the browser, tests or CI tooling.
 */
export function specificationCoverageAudit(
  input: SpecificationCoverageAuditInput,
): SpecificationCoverageAudit {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const staleAfterDays = input.staleAfterDays ?? DEFAULT_STALE_DAYS;
  const manifest = input.manifest ?? SPEC_MANIFEST;
  const subjectIds = new Set(input.subjects.map((subject) => subject.id));
  const manifestBySubject = new Map<Id, SpecManifestEntry>();
  const issues: SpecificationAuditIssue[] = [];
  const issuesBySubject = new Map<Id, SpecificationAuditIssue[]>();

  const addIssue = (issue: SpecificationAuditIssue): void => {
    issues.push(issue);
    const subjectIssues = issuesBySubject.get(issue.subjectId) ?? [];
    subjectIssues.push(issue);
    issuesBySubject.set(issue.subjectId, subjectIssues);
  };

  const todayMs = Date.parse(today);
  const checkDate = (
    value: string | null | undefined,
    subjectId: Id,
    scope: SpecificationAuditScope,
    id: Id,
    label: string,
    stale: boolean,
  ): void => {
    if (!value) return;
    const checkedMs = Date.parse(value);
    if (!Number.isFinite(checkedMs) || !Number.isFinite(todayMs)) {
      addIssue({
        kind: "invalid-date",
        severity: "error",
        scope,
        subjectId,
        id,
        detail: `${label}: invalid date ${value}`,
      });
    } else if (checkedMs > todayMs) {
      addIssue({
        kind: "future-date",
        severity: "error",
        scope,
        subjectId,
        id,
        detail: `${label}: date ${value} is in the future`,
      });
    } else if (stale && todayMs - checkedMs > staleAfterDays * 86_400_000) {
      addIssue({
        kind: "stale-spec-point",
        severity: "warning",
        scope,
        subjectId,
        id,
        detail: `${label}: last checked on ${value}`,
      });
    }
  };

  for (const entry of manifest) {
    if (manifestBySubject.has(entry.subjectId)) {
      addIssue({
        kind: "duplicate-manifest",
        severity: "error",
        scope: "subject",
        subjectId: entry.subjectId,
        id: entry.subjectId,
        detail: `${entry.subjectId}: more than one specification manifest entry`,
      });
      continue;
    }
    manifestBySubject.set(entry.subjectId, entry);
  }

  for (const entry of manifestBySubject.values()) {
    if (!subjectIds.has(entry.subjectId)) {
      addIssue({
        kind: "missing-manifest",
        severity: "error",
        scope: "subject",
        subjectId: entry.subjectId,
        id: entry.subjectId,
        detail: `${entry.subjectId}: manifest entry has no registered subject`,
      });
    }
  }

  const topicsBySubject = groupBy(input.topics, (topic) => topic.subjectId);
  const topicsById = new Map(input.topics.map((topic) => [topic.id, topic]));
  const pointById = new Map<Id, PointRecord>();
  const pointsBySubject = new Map<Id, PointRecord[]>();
  const verifiedBySubject = new Map<Id, number>();

  for (const subject of input.subjects) {
    const subjectTopics = topicsBySubject.get(subject.id) ?? [];
    const entry = manifestBySubject.get(subject.id);
    const subjectPoints: PointRecord[] = [];
    const refs = new Map<string, PointRecord>();
    let verified = 0;

    if (!entry) {
      addIssue({
        kind: "missing-manifest",
        severity: "error",
        scope: "subject",
        subjectId: subject.id,
        id: subject.id,
        detail: `${subject.name}: no specification manifest entry`,
      });
    } else {
      const mismatches = [
        subject.spec?.version && subject.spec.version !== entry.version
          ? `version ${subject.spec.version} (manifest ${entry.version})`
          : null,
        subject.specCode && subject.specCode !== entry.specCode
          ? `spec code ${subject.specCode} (manifest ${entry.specCode})`
          : null,
        subject.qualificationId !== entry.qualificationId
          ? `qualification ${subject.qualificationId} (manifest ${entry.qualificationId})`
          : null,
        getQualification(subject.qualificationId)?.boardId && getQualification(subject.qualificationId)?.boardId !== entry.boardId
          ? `board ${getQualification(subject.qualificationId)?.boardId} (manifest ${entry.boardId})`
          : null,
      ].filter((value): value is string => Boolean(value));
      if (mismatches.length) {
        addIssue({
          kind: "version-mismatch",
          severity: "error",
          scope: "subject",
          subjectId: subject.id,
          id: subject.id,
          detail: `${subject.name}: ${mismatches.join(", ")}`,
        });
      }
      checkDate(entry.releaseDate, subject.id, "subject", subject.id, `${subject.name}: manifest release date`, false);
      checkDate(entry.lastChecked, subject.id, "subject", subject.id, `${subject.name}: manifest`, true);
    }

    for (const topic of subjectTopics) {
      const specPoints = topic.specPoints ?? [];
      checkDate(topic.lastChecked, subject.id, "topic", topic.id, `${topic.title}: topic`, true);
      if (!specPoints.length) {
        addIssue({
          kind: "missing-spec-points",
          severity: "error",
          scope: "topic",
          subjectId: subject.id,
          id: topic.id,
          detail: `${topic.title}: no spec points`,
        });
        continue;
      }

      for (const [index, point] of specPoints.entries()) {
        const issueId = point.id || `${topic.id}#${index + 1}`;
        const record: PointRecord = {
          subjectId: subject.id,
          topicId: topic.id,
          pointId: point.id,
          ref: point.ref,
        };
        subjectPoints.push(record);

        if (!point.id || !point.ref || typeof point.text !== "string" || !point.text.trim() || !point.aos?.length) {
          addIssue({
            kind: "missing-spec-point-metadata",
            severity: "error",
            scope: "spec-point",
            subjectId: subject.id,
            id: issueId,
            detail: `${topic.title}: spec point metadata is incomplete (id, ref, text and AO are required)`,
          });
        }

        if (point.id) {
          const previous = pointById.get(point.id);
          if (previous) {
            addIssue({
              kind: "duplicate-spec-point-id",
              severity: "error",
              scope: "spec-point",
              subjectId: subject.id,
              id: point.id,
              detail: `${topic.title}: ${point.id} is also used by ${previous.topicId}`,
            });
          } else {
            pointById.set(point.id, record);
          }
        }

        if (point.ref) {
          const previous = refs.get(point.ref);
          if (previous) {
            addIssue({
              kind: "duplicate-spec-point-ref",
              severity: "error",
              scope: "spec-point",
              subjectId: subject.id,
              id: issueId,
              detail: `${topic.title}: specification reference ${point.ref} is also used by ${previous.topicId}`,
            });
          } else {
            refs.set(point.ref, record);
          }
        }

        const expectedVersion = entry?.version ?? subject.spec?.version ?? null;
        const actualVersion = point.specVersion ?? topic.specVersion ?? null;
        const source = point.source ?? topic.source;
        const reviewer = point.reviewer ?? topic.reviewer;
        if (!source || !reviewer || (expectedVersion && !actualVersion)) {
          addIssue({
            kind: "missing-spec-point-metadata",
            severity: "error",
            scope: "spec-point",
            subjectId: subject.id,
            id: issueId,
            detail: `${topic.title}: ${point.ref || issueId} is missing provenance or spec-version metadata`,
          });
        }
        if (expectedVersion && actualVersion && actualVersion !== expectedVersion) {
          addIssue({
            kind: "version-mismatch",
            severity: "error",
            scope: "spec-point",
            subjectId: subject.id,
            id: issueId,
            detail: `${topic.title}: ${point.ref || issueId} records ${actualVersion}, expected ${expectedVersion}`,
          });
        }

        const verification = point.verification ?? "unverified";
        const isVerified = verification === "verified" || (verification === "checked" && topic.verification === "verified");
        if (isVerified) verified += 1;
        if (verification === "unverified") {
          addIssue({
            kind: "unverified-spec-point",
            severity: "warning",
            scope: "spec-point",
            subjectId: subject.id,
            id: issueId,
            detail: `${topic.title}: ${point.ref || issueId} is not checked`,
          });
        }

        const checkedAt = point.lastChecked ?? topic.lastChecked ?? null;
        if (!checkedAt) {
          addIssue({
            kind: "missing-spec-point-metadata",
            severity: "error",
            scope: "spec-point",
            subjectId: subject.id,
            id: issueId,
            detail: `${topic.title}: ${point.ref || issueId} has no lastChecked date`,
          });
        } else {
          checkDate(checkedAt, subject.id, "spec-point", issueId, `${topic.title}: ${point.ref || issueId}`, true);
        }
      }
    }

    pointsBySubject.set(subject.id, subjectPoints);
    verifiedBySubject.set(subject.id, verified);

    const authored = subjectPoints.length;
    const manifestTotal = entry?.statementsTotal ?? authored;
    if (entry && authored < entry.statementsTotal!) {
      addIssue({
        kind: "manifest-count-gap",
        severity: "warning",
        scope: "subject",
        subjectId: subject.id,
        id: subject.id,
        detail: `${subject.name}: ${entry.statementsTotal! - authored} manifest statements are not authored yet`,
      });
    } else if (entry && authored > entry.statementsTotal!) {
      addIssue({
        kind: "manifest-count-overrun",
        severity: "error",
        scope: "subject",
        subjectId: subject.id,
        id: subject.id,
        detail: `${subject.name}: ${authored - entry.statementsTotal!} authored statements exceed the manifest total`,
      });
    }

    // Keep this map populated even when the manifest omits a denominator.
    if (manifestTotal < 0) {
      addIssue({
        kind: "manifest-count-overrun",
        severity: "error",
        scope: "subject",
        subjectId: subject.id,
        id: subject.id,
        detail: `${subject.name}: manifest statement total cannot be negative`,
      });
    }
  }

  const withCardsBySubject = new Map<Id, Set<Id>>();
  const withQuestionsBySubject = new Map<Id, Set<Id>>();
  for (const subject of input.subjects) {
    withCardsBySubject.set(subject.id, new Set());
    withQuestionsBySubject.set(subject.id, new Set());
  }

  for (const card of input.cards ?? []) {
    const subject = input.subjects.find((candidate) => candidate.id === card.subjectId);
    if (!subject) continue;
    const entry = manifestBySubject.get(subject.id);
    const cardTopic = topicsById.get(card.topicId);
    if (!cardTopic || cardTopic.subjectId !== subject.id) {
      addIssue({
        kind: "card-topic-mismatch",
        severity: "error",
        scope: "card",
        subjectId: subject.id,
        id: card.id,
        detail: `${card.id}: card points to a topic outside ${subject.id}`,
      });
    }
    checkDate(card.lastChecked, subject.id, "card", card.id, `${card.id}: card`, true);
    if (card.specVersion && entry && card.specVersion !== entry.version) {
      addIssue({
        kind: "version-mismatch",
        severity: "warning",
        scope: "card",
        subjectId: subject.id,
        id: card.id,
        detail: `${card.id}: card records ${card.specVersion}, expected ${entry.version}`,
      });
    }
    for (const pointId of card.specPointIds ?? []) {
      const record = pointById.get(pointId);
      if (!record || record.subjectId !== subject.id) {
        addIssue({
          kind: "dangling-card-spec-point",
          severity: "error",
          scope: "card",
          subjectId: subject.id,
          id: card.id,
          detail: `${card.id}: card references unknown spec point ${pointId}`,
        });
      } else {
        if (record.topicId !== card.topicId) {
          addIssue({
            kind: "card-topic-mismatch",
            severity: "error",
            scope: "card",
            subjectId: subject.id,
            id: card.id,
            detail: `${card.id}: ${pointId} belongs to ${record.topicId}, not ${card.topicId}`,
          });
          continue;
        }
        withCardsBySubject.get(subject.id)!.add(pointId);
      }
    }
  }

  for (const question of input.questions) {
    const subject = input.subjects.find((candidate) => candidate.id === question.subjectId);
    if (!subject) continue;
    const entry = manifestBySubject.get(subject.id);
    checkDate(question.lastChecked, subject.id, "question", question.id, `${question.id}: question`, true);
    if (question.specVersion && entry && question.specVersion !== entry.version) {
      addIssue({
        kind: "version-mismatch",
        severity: "warning",
        scope: "question",
        subjectId: subject.id,
        id: question.id,
        detail: `${question.id}: question records ${question.specVersion}, expected ${entry.version}`,
      });
    }

    const pointIds = new Set([
      ...(question.specPointIds ?? []),
      ...question.parts.flatMap((part) => part.specPointIds ?? []),
    ]);
    if (!pointIds.size) {
      addIssue({
        kind: "unmapped-question",
        severity: "warning",
        scope: "question",
        subjectId: subject.id,
        id: question.id,
        detail: `${question.id}: question has no spec-point mapping`,
      });
    }
    for (const pointId of pointIds) {
      const record = pointById.get(pointId);
      if (!record || record.subjectId !== subject.id) {
        addIssue({
          kind: "dangling-question-spec-point",
          severity: "error",
          scope: "question",
          subjectId: subject.id,
          id: question.id,
          detail: `${question.id}: question references unknown spec point ${pointId}`,
        });
      } else {
        if (!question.topicIds.includes(record.topicId)) {
          addIssue({
            kind: "question-topic-mismatch",
            severity: "error",
            scope: "question",
            subjectId: subject.id,
            id: question.id,
            detail: `${question.id}: ${pointId} belongs to ${record.topicId}, which is not in topicIds`,
          });
        }
        withQuestionsBySubject.get(subject.id)!.add(pointId);
      }
    }

    for (const topicId of question.topicIds) {
      const topic = topicsById.get(topicId);
      if (!topic || topic.subjectId !== subject.id) {
        addIssue({
          kind: "unmapped-question",
          severity: "warning",
          scope: "question",
          subjectId: subject.id,
          id: question.id,
          detail: `${question.id}: question references unknown topic ${topicId}`,
        });
      }
    }

    for (const part of question.parts) {
      if ((part.specPointIds?.length ?? 0) > 0 && (part.learningClaims?.length ?? 0) !== part.markScheme.length) {
        addIssue({
          kind: "question-claim-alignment",
          severity: "error",
          scope: "question",
          subjectId: subject.id,
          id: question.id,
          detail: `${question.id} part ${part.id}: learningClaims must align one-to-one with markScheme points`,
        });
      }
    }
  }

  for (const subject of input.subjects) {
    const subjectPoints = pointsBySubject.get(subject.id) ?? [];
    const cardPointIds = withCardsBySubject.get(subject.id)!;
    const questionPointIds = withQuestionsBySubject.get(subject.id)!;
    const uniquePointIds = new Set(subjectPoints.map((point) => point.pointId).filter(Boolean));
    for (const pointId of uniquePointIds) {
      const record = pointById.get(pointId)!;
      if (!cardPointIds.has(pointId)) {
        addIssue({
          kind: "statement-no-cards",
          severity: "warning",
          scope: "spec-point",
          subjectId: subject.id,
          id: pointId,
          detail: `${record.ref || pointId}: no retrieval card is linked`,
        });
      }
      if (!questionPointIds.has(pointId)) {
        addIssue({
          kind: "statement-no-questions",
          severity: "warning",
          scope: "spec-point",
          subjectId: subject.id,
          id: pointId,
          detail: `${record.ref || pointId}: no exam question is linked`,
        });
      }
    }
  }

  const subjects = input.subjects.map((subject) => {
    const entry = manifestBySubject.get(subject.id);
    const subjectPoints = pointsBySubject.get(subject.id) ?? [];
    const denominator = entry?.statementsTotal ?? subjectPoints.length;
    const verified = verifiedBySubject.get(subject.id) ?? 0;
    const withCards = withCardsBySubject.get(subject.id)?.size ?? 0;
    const withQuestions = withQuestionsBySubject.get(subject.id)?.size ?? 0;
    const subjectIssues = sortIssues(issuesBySubject.get(subject.id) ?? []);
    return {
      subjectId: subject.id,
      status: statusFor(subjectIssues),
      specVersion: entry?.version ?? subject.spec?.version ?? null,
      manifestStatements: entry?.statementsTotal ?? null,
      authoredStatements: subjectPoints.length,
      missingManifestStatements: Math.max(0, denominator - subjectPoints.length),
      extraAuthoredStatements: Math.max(0, subjectPoints.length - denominator),
      verifiedStatements: verified,
      statementsWithCards: withCards,
      statementsWithQuestions: withQuestions,
      authoredCoverage: percent(subjectPoints.length, denominator),
      verifiedCoverage: percent(verified, denominator),
      learnableCoverage: percent(withCards, denominator),
      assessableCoverage: percent(withQuestions, denominator),
      issues: subjectIssues,
    } satisfies SpecificationSubjectAudit;
  });

  const sortedIssues = sortIssues(issues);
  const errors = sortedIssues.filter((issue) => issue.severity === "error").length;
  const warnings = sortedIssues.length - errors;
  return {
    status: statusFor(sortedIssues),
    totals: {
      subjects: subjects.length,
      manifestStatements: subjects.reduce((sum, subject) => sum + (subject.manifestStatements ?? 0), 0),
      authoredStatements: subjects.reduce((sum, subject) => sum + subject.authoredStatements, 0),
      missingManifestStatements: subjects.reduce((sum, subject) => sum + subject.missingManifestStatements, 0),
      verifiedStatements: subjects.reduce((sum, subject) => sum + subject.verifiedStatements, 0),
      statementsWithCards: subjects.reduce((sum, subject) => sum + subject.statementsWithCards, 0),
      statementsWithQuestions: subjects.reduce((sum, subject) => sum + subject.statementsWithQuestions, 0),
      errors,
      warnings,
    },
    subjects,
    issues: sortedIssues,
  };
}

function groupBy<T>(items: readonly T[], key: (item: T) => Id): Map<Id, T[]> {
  const grouped = new Map<Id, T[]>();
  for (const item of items) {
    const bucket = grouped.get(key(item)) ?? [];
    bucket.push(item);
    grouped.set(key(item), bucket);
  }
  return grouped;
}

function percent(value: number, denominator: number): number {
  return denominator > 0 ? Math.round((value / denominator) * 1000) / 10 : 0;
}

function statusFor(issues: readonly SpecificationAuditIssue[]): SpecificationAuditStatus {
  if (issues.some((issue) => issue.severity === "error")) return "fail";
  if (issues.length) return "review";
  return "pass";
}

function sortIssues(issues: readonly SpecificationAuditIssue[]): SpecificationAuditIssue[] {
  return [...issues].sort((a, b) =>
    a.subjectId.localeCompare(b.subjectId) ||
    a.severity.localeCompare(b.severity) ||
    a.scope.localeCompare(b.scope) ||
    a.id.localeCompare(b.id) ||
    a.kind.localeCompare(b.kind),
  );
}
