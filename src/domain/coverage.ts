// Pure coverage reporting. Nothing here touches I/O or React — it reads
// curriculum + question bank and returns the numbers the status card needs.
// Coverage is measurable at STATEMENT level: each specPoint is one examinable claim.
import type { Id, Question, Topic } from "./types";

export interface StatementCoverage {
  specPointId: Id;
  ref: string;
  verified: boolean;
  hasCards: boolean;
  hasQuestions: boolean;
  topicId: Id;
}

export interface SubjectCoverage {
  subjectId: Id;
  specVersion: string | null;
  lastChecked: string | null;
  /** Topic coverage (backwards compat). */
  coveragePercent: number;
  topicsTotal: number;
  topicsCovered: number;
  /** Statement-level truth. */
  specPointsTotal: number;
  specPointsVerified: number;
  specPointsLearnable: number;
  specPointsAssessable: number;
  statementCoverage: number;
  statements: StatementCoverage[];
  byVerification: Record<string, number>;
  byStatementVerification: Record<string, number>;
  retrievalItems: number;
  examQuestions: number;
  gaps: Array<{ topicId: Id; title: string; kind: "no-spec-points" | "no-cards" | "no-questions" | "statement-no-cards" | "statement-no-questions" | "statement-unverified" }>;
}

export function coverageForSubject(
  topics: Topic[],
  questionsForSubject: Question[],
  cardsPerTopic: Map<Id, number>,
): SubjectCoverage {
  const subjectId = topics[0]?.subjectId ?? questionsForSubject[0]?.subjectId ?? "unknown";
  const specVersions = new Set(topics.map((t) => t.specVersion).filter(Boolean) as string[]);
  const specVersion = specVersions.size === 1 ? [...specVersions][0] : specVersions.size > 1 ? "mixed" : null;
  const lastChecked = topics.reduce<string | null>((best, t) => {
    const cand = t.specPoints?.reduce<string | null>((b, sp) => {
      const c = sp.lastChecked ?? t.lastChecked ?? null;
      if (!c) return b;
      if (!b) return c;
      return c > b ? c : b;
    }, best) ?? t.lastChecked ?? null;
    if (!cand) return best;
    if (!best) return cand;
    return cand > best ? cand : best;
  }, null);
  const topicsTotal = topics.length;

  const questionTopicIds = new Set(questionsForSubject.flatMap((q) => q.topicIds));
  // union of all specPointIds from questions (evidence that a statement is assessed)
  const assessedIds = new Set(questionsForSubject.flatMap((q) => q.specPointIds ?? q.parts.flatMap((pt) => pt.specPointIds ?? [])));

  // Build per-statement view
  const statements: StatementCoverage[] = [];
  for (const t of topics) {
    for (const sp of t.specPoints ?? []) {
      const hasCards = (cardsPerTopic.get(t.id) ?? 0) > 0;
      // per-statement card presence: if topic has cards and statement is linked; otherwise coarse
      const hasQuestions = assessedIds.has(sp.id);
      const verified = sp.verification === "verified" || (sp.verification === "checked" && t.verification === "verified");
      statements.push({ specPointId: sp.id, ref: sp.ref, verified, hasCards, hasQuestions, topicId: t.id });
    }
  }

  const specPointsTotal = statements.length;
  const specPointsVerified = statements.filter((s) => s.verified).length;
  const specPointsLearnable = statements.filter((s) => s.hasCards).length;
  const specPointsAssessable = statements.filter((s) => s.hasQuestions).length;
  const statementCoverage = specPointsTotal === 0 ? 0 : Math.round((specPointsVerified / specPointsTotal) * 1000) / 10;

  const questionTopicIds2 = questionTopicIds;
  let topicsCovered = 0;
  const byVerification: Record<string, number> = { verified: 0, checked: 0, unverified: 0 };
  const byStatementVerification: Record<string, number> = { verified: 0, checked: 0, unverified: 0 };
  for (const sp of topics.flatMap((t) => t.specPoints ?? [])) {
    const v = sp.verification ?? "unverified";
    byStatementVerification[v] = (byStatementVerification[v] ?? 0) + 1;
  }
  const gaps: SubjectCoverage["gaps"] = [];
  for (const t of topics) {
    const hasCards = (cardsPerTopic.get(t.id) ?? 0) > 0;
    const hasQuestions = questionTopicIds2.has(t.id);
    if (hasCards || hasQuestions || (t.specPoints?.length ?? 0) > 0) topicsCovered += 1;
    const v = t.verification ?? "unverified";
    byVerification[v] = (byVerification[v] ?? 0) + 1;
    if ((t.specPoints?.length ?? 0) === 0) gaps.push({ topicId: t.id, title: t.title, kind: "no-spec-points" });
    if (!hasCards) gaps.push({ topicId: t.id, title: t.title, kind: "no-cards" });
    if (!hasQuestions) gaps.push({ topicId: t.id, title: t.title, kind: "no-questions" });
  }
  for (const s of statements) {
    if (!s.verified) gaps.push({ topicId: s.topicId, title: statements.length ? s.ref : s.topicId, kind: "statement-unverified" } as unknown as SubjectCoverage["gaps"][number]);
    if (!s.hasCards) gaps.push({ topicId: s.topicId, title: s.ref, kind: "statement-no-cards" } as unknown as SubjectCoverage["gaps"][number]);
    if (!s.hasQuestions) gaps.push({ topicId: s.topicId, title: s.ref, kind: "statement-no-questions" } as unknown as SubjectCoverage["gaps"][number]);
  }
  const coveragePercent = topicsTotal === 0 ? 0 : Math.round((topicsCovered / topicsTotal) * 1000) / 10;
  const retrievalItems = [...cardsPerTopic.values()].reduce((a, n) => a + n, 0);
  const examQuestions = questionsForSubject.length;
  return {
    subjectId,
    specVersion,
    lastChecked,
    coveragePercent,
    topicsTotal,
    topicsCovered,
    specPointsTotal,
    specPointsVerified,
    specPointsLearnable: specPointsLearnable,
    specPointsAssessable: specPointsAssessable,
    statementCoverage,
    statements,
    byVerification,
    byStatementVerification,
    retrievalItems,
    examQuestions,
    gaps,
  };
}

export function coverageForAll(
  topicsBySubject: Map<Id, Topic[]>,
  questionsBySubject: Map<Id, Question[]>,
  cardsPerTopic: Map<Id, number>,
): Map<Id, SubjectCoverage> {
  const out = new Map<Id, SubjectCoverage>();
  for (const [subjectId, topics] of topicsBySubject.entries()) {
    out.set(subjectId, coverageForSubject(topics, questionsBySubject.get(subjectId) ?? [], cardsPerTopic));
  }
  return out;
}
