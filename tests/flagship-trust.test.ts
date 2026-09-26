import { describe, expect, it } from "vitest";
import { allTopics } from "@/domain/curriculum";
import { seedQuestions } from "@/content";
import { FLAGSHIP_SUBJECTS } from "@/domain/flagship";
import { flagshipTrustReadiness } from "@/domain/flagship-trust";
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
});
