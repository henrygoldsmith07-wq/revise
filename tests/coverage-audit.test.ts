import { describe, expect, it } from "vitest";
import { coverageAudit } from "@/domain/coverage-audit";
import type { Question, Topic } from "@/domain/types";

function topic(id: string, unitId = "unit-1"): Topic {
  return {
    id,
    subjectId: "subj-physics",
    unitId,
    title: id,
    order: 0,
    intrinsicDifficulty: 3,
    summary: "summary",
    keyPoints: ["kp"],
    commonErrors: ["error"],
    specPoints: [{ id: `${id}.sp-01`, ref: "1.1", text: "claim", aos: ["AO1"], verification: "verified" }],
    source: "authored",
    verification: "verified",
  };
}
function question(id: string, subjectId: string, topicId: string, kind: Question["kind"], marks: number, opts: Partial<Question> = {}): Question {
  return {
    id,
    subjectId,
    topicIds: [topicId],
    kind,
    stem: kind === "mcq" ? "Choose" : "Calculate the energy",
    parts: [{ id: `${id}:0`, label: "(a)", prompt: "Calculate", marks, markScheme: ["point"], modelAnswer: "answer", specPointIds: [`${topicId}.sp-01`], learningClaims: ["claim"] }],
    totalMarks: marks,
    calculatorAllowed: kind === "calculation",
    difficulty: 3,
    origin: "seed",
    source: "authored",
    verification: "checked",
    reviewer: "reviewer",
    lastChecked: "2026-08-01",
    specVersion: "2024-1.0",
    createdAt: new Date().toISOString(),
    ...opts,
  };
}

describe("content coverage audit", () => {
  it("reports coverage by subject/spec point/topic/subtopic/command/mark type/difficulty/misconception/practical/calculator/provenance", () => {
    const topics = [topic("subj-physics.t1", "unit-1"), topic("subj-physics.t2", "unit-2")];
    const questions: Question[] = [
      question("q1", "subj-physics", "subj-physics.t1", "calculation", 4, { calculatorAllowed: true, verification: "checked" }),
      question("q2", "subj-physics", "subj-physics.t2", "extended", 6, { verification: "verified" }),
      question("q3", "subj-physics", "subj-physics.t1", "mcq", 1, { options: ["a","b"], correctIndex: 0 }),
    ];
    const report = coverageAudit({ subjects: [{ id: "subj-physics" }], topics, questions });
    expect(report.subjects[0].key).toBe("subj-physics");
    expect(report.specPoints.total).toBe(2);
    expect(report.topics.total).toBe(2);
    expect(report.subtopics.length).toBeGreaterThan(0);
    expect(report.commandWords.length).toBeGreaterThan(0);
    expect(report.markTotals.length).toBeGreaterThan(0);
    expect(report.questionTypes.length).toBeGreaterThan(0);
    expect(report.difficulties.length).toBeGreaterThan(0);
    expect(report.misconceptions.length).toBeGreaterThan(0);
    expect(report.requiredPracticals.length).toBe(2);
    expect(report.calculatorSplit.calculator).toBeGreaterThan(0);
    expect(report.provenance.length).toBeGreaterThan(0);
  });

  it("never implies generated questions are official — provenance distinguishes", () => {
    const topics = [topic("t1")];
    const qGen = question("q-gen", "subj", "t1", "short", 2, { source: "generated", verification: "unverified" });
    const report = coverageAudit({ subjects: [{ id: "subj" }], topics, questions: [qGen] });
    const genProv = report.provenance.find((p) => p.key === "ai-generated-draft");
    expect(genProv?.total).toBe(1);
    expect(report.provenance.find((p) => p.key === "official/past-paper")?.total ?? 0).toBe(0);
  });
});
