import { describe, expect, it } from "vitest";
import { allTopics } from "@/domain/curriculum";
import { seedQuestions } from "@/content";
import { FLAGSHIP_SUBJECTS } from "@/domain/flagship";
import { buildFlagshipReviewPlan, flagshipTrustReadiness } from "@/domain/flagship-trust";
import type { Question, Topic } from "@/domain/types";

describe("flagship trusted-depth ledger", () => {
  it("counts authored volume separately from approved assessment depth", () => {
    const topicId = "wjec-test.topic";
    const specPointId = `${topicId}.sp-01`;
    const topic = {
      id: topicId,
      subjectId: "wjec-test",
      specPoints: [{ id: specPointId, ref: "1(a)", text: "claim", aos: ["AO2"] }],
    } as unknown as Topic;
    const question = (id: string, demand: "recall" | "application" | "transfer"): Question => ({
      id,
      subjectId: "wjec-test",
      topicIds: [topicId],
      kind: "structured",
      stem: id,
      parts: [{
        id: `${id}:0`,
        label: "",
        prompt: id,
        marks: demand === "recall" ? 1 : 2,
        markScheme: ["point"],
        modelAnswer: "answer",
        aos: demand === "recall" ? ["AO1"] : ["AO2"],
        specPointIds: [specPointId],
        learningClaims: ["claim"],
      }],
      totalMarks: demand === "recall" ? 1 : 2,
      learning: { familyId: id, contextId: id, demand, expectedMinutes: 2 },
    } as unknown as Question);
    const questions = [
      question("trusted-r", "recall"),
      question("trusted-a1", "application"),
      question("trusted-a2", "application"),
      question("trusted-t", "transfer"),
      question("draft-extra", "transfer"),
    ];

    const report = flagshipTrustReadiness({
      subjectId: "wjec-test",
      topics: [topic],
      questions,
      trustedQuestion: (row) => row.id.startsWith("trusted-"),
    });

    expect(report.questionsTotal).toBe(5);
    expect(report.trustedQuestions).toBe(4);
    expect(report.reviewQueue).toBe(1);
    expect(report.statementsWithTrustedQuestions).toBe(1);
    expect(report.statementsMeetingCoreTrustBar).toBe(1);
    expect(report.coreTrustShare).toBe(1);
  });

  it("does not let four approved questions count when transfer is missing", () => {
    const topicId = "wjec-test.topic";
    const specPointId = `${topicId}.sp-01`;
    const topic = {
      id: topicId,
      subjectId: "wjec-test",
      specPoints: [{ id: specPointId, ref: "1(a)", text: "claim", aos: ["AO2"] }],
    } as unknown as Topic;
    const questions = Array.from({ length: 4 }, (_, index) => ({
      id: `approved-${index}`,
      subjectId: "wjec-test",
      topicIds: [topicId],
      kind: "structured",
      stem: "s",
      parts: [{
        id: `p-${index}`,
        label: "",
        prompt: "p",
        marks: index === 0 ? 1 : 3,
        markScheme: ["point"],
        modelAnswer: "answer",
        aos: index === 0 ? ["AO1"] : ["AO2"],
        specPointIds: [specPointId],
      }],
      totalMarks: index === 0 ? 1 : 3,
    } as unknown as Question));

    const report = flagshipTrustReadiness({
      subjectId: "wjec-test",
      topics: [topic],
      questions,
      trustedQuestion: () => true,
    });
    expect(report.statementsMeetingCoreTrustBar).toBe(0);
    expect(report.statements[0]?.missing).toContain("transfer");
  });

  it("uses part-level categories while counting a structured question only once", () => {
    const topicId = "wjec-test.topic";
    const specPointId = `${topicId}.sp-01`;
    const topic = {
      id: topicId,
      subjectId: "wjec-test",
      specPoints: [{ id: specPointId, ref: "1(a)", text: "claim", aos: ["AO2"] }],
    } as unknown as Topic;
    const base = (id: string): Question => ({
      id,
      subjectId: "wjec-test",
      topicIds: [topicId],
      kind: "structured",
      stem: id,
      parts: [{ id: id + ":0", label: "", prompt: "apply", marks: 3, markScheme: ["x"], modelAnswer: "x", aos: ["AO2"], specPointIds: [specPointId] }],
      totalMarks: 3,
    } as unknown as Question);
    const mixed = {
      ...base("mixed"),
      parts: [
        { id: "mixed:r", label: "(a)", prompt: "state", marks: 1, markScheme: ["r"], modelAnswer: "r", aos: ["AO1"], specPointIds: [specPointId] },
        { id: "mixed:t", label: "(b)", prompt: "evaluate", marks: 2, markScheme: ["t"], modelAnswer: "t", aos: ["AO3"], specPointIds: [specPointId] },
      ],
      totalMarks: 3,
    } as unknown as Question;
    const report = flagshipTrustReadiness({
      subjectId: "wjec-test",
      topics: [topic],
      questions: [mixed, base("a"), base("b"), base("c")],
      trustedQuestion: () => true,
    });
    expect(report.statements[0]?.trustedQuestionIds).toHaveLength(4);
    expect(new Set(report.statements[0]?.categories)).toEqual(new Set(["recall", "application", "transfer"]));
    expect(report.statementsMeetingCoreTrustBar).toBe(1);
  });

  it("does not make unrelated draft extras block an explicit trusted release set", () => {
    const topicId = "wjec-test.topic";
    const specPointId = `${topicId}.sp-01`;
    const topic = {
      id: topicId,
      subjectId: "wjec-test",
      specPoints: [{ id: specPointId, ref: "1(a)", text: "claim", aos: ["AO2"] }],
    } as unknown as Topic;
    const make = (id: string, demand: "recall" | "application" | "transfer"): Question => ({
      id,
      subjectId: "wjec-test",
      topicIds: [topicId],
      kind: "structured",
      stem: id,
      parts: [{
        id: `${id}:0`,
        label: "",
        prompt: id,
        marks: demand === "recall" ? 1 : 3,
        markScheme: ["point"],
        modelAnswer: "answer",
        aos: demand === "recall" ? ["AO1"] : ["AO2"],
        specPointIds: [specPointId],
      }],
      totalMarks: demand === "recall" ? 1 : 3,
      learning: { familyId: id, contextId: id, demand, expectedMinutes: 2 },
    } as unknown as Question);
    const releaseIds = new Set(["r", "a1", "a2", "t"]);
    const questions = [
      make("r", "recall"),
      make("a1", "application"),
      make("a2", "application"),
      make("t", "transfer"),
      make("draft-extra", "transfer"),
    ];
    const report = flagshipTrustReadiness({
      subjectId: "wjec-test",
      topics: [topic],
      questions,
      trustedQuestion: (question) => releaseIds.has(question.id),
      releaseQuestion: (question) => releaseIds.has(question.id),
    });
    expect(report.trustedReleaseQuestions).toBe(4);
    expect(report.releaseQuestionsTotal).toBe(4);
    expect(report.releaseStatementsMeetingCoreTrustBar).toBe(1);
    expect(report.releaseReady).toBe(true);
    expect(report.reviewQueue).toBe(1);
  });

  it("reports every live flagship without treating draft questions as approved", () => {
    for (const flagship of FLAGSHIP_SUBJECTS) {
      const report = flagshipTrustReadiness({
        subjectId: flagship.subjectId,
        topics: allTopics(),
        questions: seedQuestions,
      });
      expect(report.statementsTotal).toBeGreaterThan(0);
      expect(report.trustedQuestions).toBeLessThanOrEqual(report.questionsTotal);
      expect(report.reviewQueue).toBe(report.questionsTotal - report.trustedQuestions);
      expect(report.coreTrustShare).toBeGreaterThanOrEqual(0);
      expect(report.coreTrustShare).toBeLessThanOrEqual(1);
    }
  });

  it("prioritises new statement coverage before a second question on the same statement", () => {
    const topicId = "wjec-test.topic";
    const topic = {
      id: topicId,
      subjectId: "wjec-test",
      specPoints: [
        { id: `${topicId}.sp-01`, ref: "1(a)", text: "claim one", aos: ["AO1"] },
        { id: `${topicId}.sp-02`, ref: "1(b)", text: "claim two", aos: ["AO1"] },
      ],
    } as unknown as Topic;
    const make = (id: string, specPointId: string): Question => ({
      id,
      subjectId: "wjec-test",
      topicIds: [topicId],
      kind: "short",
      stem: id,
      parts: [{
        id: `${id}:0`,
        label: "",
        prompt: id,
        marks: 1,
        markScheme: ["point"],
        modelAnswer: "answer",
        aos: ["AO1"],
        specPointIds: [specPointId],
      }],
      totalMarks: 1,
      source: "authored",
    } as unknown as Question);
    const plan = buildFlagshipReviewPlan({
      subjectId: "wjec-test",
      topics: [topic],
      questions: [
        make("a-first", `${topicId}.sp-01`),
        make("b-second-same", `${topicId}.sp-01`),
        make("c-other-statement", `${topicId}.sp-02`),
      ],
      trustedQuestion: () => false,
      limit: 2,
    });
    expect(plan).toHaveLength(2);
    expect(new Set(plan.flatMap((item) => item.specPointIds))).toEqual(
      new Set([`${topicId}.sp-01`, `${topicId}.sp-02`]),
    );
    expect(plan.every((item) => item.newStatementCoverage === 1)).toBe(true);
  });

  it("keeps explicit pending release candidates ahead of non-release backlog", () => {
    const topicId = "wjec-test.topic";
    const point = `${topicId}.sp-01`;
    const topic = {
      id: topicId,
      subjectId: "wjec-test",
      specPoints: [{ id: point, ref: "1(a)", text: "claim", aos: ["AO1"] }],
    } as unknown as Topic;
    const make = (id: string): Question => ({
      id,
      subjectId: "wjec-test",
      topicIds: [topicId],
      kind: "short",
      stem: id,
      parts: [{ id: `${id}:0`, label: "", prompt: id, marks: 1, markScheme: ["point"], modelAnswer: "answer", aos: ["AO1"], specPointIds: [point] }],
      totalMarks: 1,
      source: "authored",
    } as unknown as Question);
    const plan = buildFlagshipReviewPlan({
      subjectId: "wjec-test",
      topics: [topic],
      questions: [make("normal-a"), make("release-z")],
      trustedQuestion: () => false,
      preferredQuestion: (question) => question.id === "release-z",
      limit: 1,
    });
    expect(plan[0]?.questionId).toBe("release-z");
  });
});
