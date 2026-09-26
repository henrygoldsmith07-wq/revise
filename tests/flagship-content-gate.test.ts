import { describe, expect, it } from "vitest";
import { allTopics } from "@/domain/curriculum";
import { seedQuestions } from "@/content";
import { FLAGSHIP_SUBJECTS } from "@/domain/flagship";
import { pipelineQuestion, pipelineTopic } from "@/content/pipeline";
import type { Id } from "@/domain/types";

interface GateFinding {
  rule: string;
  subjectId: string;
  topicId?: Id;
  questionId?: Id;
  partId?: Id;
  specPointId?: Id;
  detail: string;
}

// Grandfathered baselines, measured 2026-09-26. These count pre-existing
// provenance gaps that must NOT grow: every new flagship topic/question is
// required complete, so lower a baseline only by fixing content, never by
// raising it. Bulk-filling dates/reviewers without real review would fabricate
// provenance, which is worse than an honest gap.
const BASELINE_TOPICS_MISSING_REVIEWER = 45;
const BASELINE_QUESTIONS_MISSING_CHECKED = 1672;
const BASELINE_QUESTIONS_MISSING_SPEC_VERSION = 195;
const BASELINE_MAPPED_PARTS_MISSING_AO = 92;

function collectFindings(): { findings: GateFinding[]; counts: Record<string, number> } {
  const findings: GateFinding[] = [];
  const flagshipIds = new Set(FLAGSHIP_SUBJECTS.map((f) => f.subjectId));
  const topics = allTopics().filter((t) => flagshipIds.has(t.subjectId));
  const questions = seedQuestions.filter((q) => flagshipIds.has(q.subjectId));
  const topicById = new Map(topics.map((t) => [t.id, t] as const));
  const specPointTopics = new Map<Id, Id>();
  const seen = { topic: new Set<Id>(), specPoint: new Set<Id>(), question: new Set<Id>(), part: new Set<Id>() };
  const dup = { topic: 0, specPoint: 0, question: 0, part: 0 };
  let mappedPartsMissingAo = 0;

  for (const topic of topics) {
    if (seen.topic.has(topic.id)) dup.topic++;
    seen.topic.add(topic.id);
    const piped = pipelineTopic(topic);
    for (const issue of piped.schemaIssues) {
      findings.push({ rule: "topic-schema", subjectId: topic.subjectId, topicId: topic.id, detail: issue });
    }
    if (!topic.source) findings.push({ rule: "topic-source", subjectId: topic.subjectId, topicId: topic.id, detail: "missing source" });
    if (!topic.verification) findings.push({ rule: "topic-verification", subjectId: topic.subjectId, topicId: topic.id, detail: "missing verification" });
    for (const sp of topic.specPoints ?? []) {
      if (seen.specPoint.has(sp.id)) dup.specPoint++;
      seen.specPoint.add(sp.id);
      specPointTopics.set(sp.id, topic.id);
      if (!sp.id.startsWith(`${topic.id}.`)) {
        findings.push({ rule: "spec-point-id", subjectId: topic.subjectId, topicId: topic.id, specPointId: sp.id, detail: `id does not start with topic id ${topic.id}.` });
      }
      if (!sp.ref.trim() || !sp.text.trim() || !(sp.aos ?? []).length) {
        findings.push({ rule: "spec-point-shape", subjectId: topic.subjectId, topicId: topic.id, specPointId: sp.id, detail: "ref/text/aos must be non-empty" });
      }
    }
  }

  for (const question of questions) {
    if (seen.question.has(question.id)) dup.question++;
    seen.question.add(question.id);
    const piped = pipelineQuestion(question);
    for (const issue of piped.schemaIssues) {
      findings.push({ rule: "question-schema", subjectId: question.subjectId, questionId: question.id, detail: issue });
    }
    if (!question.source) findings.push({ rule: "question-source", subjectId: question.subjectId, questionId: question.id, detail: "missing source" });
    if (!question.verification) findings.push({ rule: "question-verification", subjectId: question.subjectId, questionId: question.id, detail: "missing verification" });
    for (const topicId of question.topicIds) {
      const topic = topicById.get(topicId);
      if (!topic) {
        findings.push({ rule: "question-topic", subjectId: question.subjectId, questionId: question.id, topicId, detail: "unknown topic" });
      } else if (topic.subjectId !== question.subjectId) {
        findings.push({ rule: "question-topic", subjectId: question.subjectId, questionId: question.id, topicId, detail: `topic belongs to ${topic.subjectId}` });
      }
    }
    for (const part of question.parts) {
      if (seen.part.has(part.id)) dup.part++;
      seen.part.add(part.id);
      for (const spId of part.specPointIds ?? []) {
        if (!specPointTopics.has(spId)) {
          findings.push({ rule: "dangling-spec-point", subjectId: question.subjectId, questionId: question.id, partId: part.id, specPointId: spId, detail: "no such specPoint in the flagship bank" });
        }
      }
      const mapped = (part.specPointIds ?? []).length > 0;
      const claims = part.learningClaims ?? [];
      if (mapped && !claims.length) {
        findings.push({ rule: "missing-learning-claims", subjectId: question.subjectId, questionId: question.id, partId: part.id, detail: "specPointIds present but missing learningClaims" });
      }
      if (mapped && claims.length > part.markScheme.length) {
        findings.push({ rule: "missing-learning-claims", subjectId: question.subjectId, questionId: question.id, partId: part.id, detail: `learningClaims (${claims.length}) exceed markScheme points (${part.markScheme.length})` });
      }
      const map = part.claimMap;
      if (map !== undefined && (map.length !== part.markScheme.length || map.some((i) => !Number.isInteger(i) || i < 0 || i >= claims.length))) {
        findings.push({ rule: "invalid-claim-map", subjectId: question.subjectId, questionId: question.id, partId: part.id, detail: "claimMap must hold one valid learningClaims index per markScheme point" });
      }
      if (mapped && !(part.aos ?? []).length) {
        mappedPartsMissingAo++;
      }
      if (!part.markScheme.length || !part.modelAnswer.trim()) {
        findings.push({ rule: "mark-scheme-answer", subjectId: question.subjectId, questionId: question.id, partId: part.id, detail: "markScheme and modelAnswer must be non-empty" });
      }
    }
  }

  if (dup.topic) findings.push({ rule: "duplicate-id", subjectId: "bank", detail: `${dup.topic} duplicate topic ids` });
  if (dup.specPoint) findings.push({ rule: "duplicate-id", subjectId: "bank", detail: `${dup.specPoint} duplicate specPoint ids` });
  if (dup.question) findings.push({ rule: "duplicate-id", subjectId: "bank", detail: `${dup.question} duplicate question ids` });
  if (dup.part) findings.push({ rule: "duplicate-id", subjectId: "bank", detail: `${dup.part} duplicate part ids` });

  // Provenance completeness ratchets (see BASELINE_* above).
  let topicsMissingReviewer = 0;
  for (const topic of topics) {
    if ((topic.verification === "verified" || topic.verification === "checked") && !topic.reviewer) topicsMissingReviewer++;
  }
  let questionsMissingChecked = 0;
  let questionsMissingSpecVersion = 0;
  for (const question of questions) {
    if (!question.lastChecked) questionsMissingChecked++;
    if (!question.specVersion) questionsMissingSpecVersion++;
  }

  const counts: Record<string, number> = {
    topics: topics.length,
    questions: questions.length,
    topicsMissingReviewer,
    questionsMissingChecked,
    questionsMissingSpecVersion,
    mappedPartsMissingAo,
  };
  console.log(
    `flagship gate: ${topics.length} topics, ${questions.length} questions, ` +
    `${findings.length} hard findings, reviewer gaps ${topicsMissingReviewer}, ` +
    `unchecked ${questionsMissingChecked}, unversioned ${questionsMissingSpecVersion}, ` +
    `ao gaps ${mappedPartsMissingAo}`,
  );
  for (const finding of findings.slice(0, 30)) {
    console.log(`  [${finding.rule}] ${finding.subjectId} ${finding.topicId ?? ""} ${finding.questionId ?? ""} ${finding.partId ?? ""} ${finding.detail}`);
  }
  return { findings, counts };
}

describe("flagship content gate (full bank, CI-blocking)", () => {
  it("holds every structural invariant with zero hard findings", () => {
    const { findings } = collectFindings();
    expect(findings.map((f) => `[${f.rule}] ${f.subjectId} ${f.questionId ?? f.topicId ?? ""} ${f.partId ?? ""} ${f.detail}`)).toEqual([]);
  });

  it("does not let provenance gaps grow past the grandfathered baseline", () => {
    const { counts } = collectFindings();
    expect(counts.topicsMissingReviewer).toBeLessThanOrEqual(BASELINE_TOPICS_MISSING_REVIEWER);
    expect(counts.questionsMissingChecked).toBeLessThanOrEqual(BASELINE_QUESTIONS_MISSING_CHECKED);
    expect(counts.questionsMissingSpecVersion).toBeLessThanOrEqual(BASELINE_QUESTIONS_MISSING_SPEC_VERSION);
    expect(counts.mappedPartsMissingAo).toBeLessThanOrEqual(BASELINE_MAPPED_PARTS_MISSING_AO);
  });
});
