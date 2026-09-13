import { describe, expect, it } from "vitest";
import { seedQuestionsForSubject } from "@/content";
import { defineQuestion } from "@/content/questions/authoring";
import { auditPhysicsBank } from "@/domain/physics-bank-audit";
import type { LearningDemand, Question } from "@/domain/types";

function fixture(
  slug: string,
  demand: LearningDemand,
  familyId: string,
  prompt: string,
  options: Partial<Parameters<typeof defineQuestion>[0]> = {},
): Question {
  return defineQuestion({
    slug,
    subjectId: "wjec-alevel-physics",
    topics: ["kinematics-dynamics"],
    kind: "short",
    stem: prompt,
    difficulty: demand === "recall" ? 5 : 3,
    source: "generated",
    verification: "unverified",
    specVersion: "2024-1.0",
    parts: [{
      prompt,
      marks: 2,
      scheme: ["State the relationship", "Use it in the stated context"],
      answer: "State the relationship and use it in the stated context.",
      specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-99"],
      capabilityIds: ["phys.audit-fixture"],
      learning: { familyId, contextId: `${familyId}:context`, demand, reasoningMoves: ["apply the relationship to the stated context"] },
    }],
    learning: { familyId, contextId: `${familyId}:context`, demand, expectedMinutes: 2, reasoningMoves: ["apply the relationship to the stated context"] },
    ...options,
  });
}

describe("Physics bank-wide audit", () => {
  it("audits the live bank with precomputed profiles and no hard consistency errors", () => {
    const questions = seedQuestionsForSubject("wjec-alevel-physics");
    const report = auditPhysicsBank(questions);
    expect(report.questionCount).toBeGreaterThan(1300);
    expect(report.partCount).toBe(report.profileCount);
    expect(report.consistencyErrors).toBe(0);
    expect(report.errors).toBe(0);
    expect(report.estimatedComparisons).toBeGreaterThan(0);
    expect(report.elapsedMs).toBeLessThan(2000);
  });

  it("finds explicit convention conflicts while keeping the result deterministic", () => {
    const rows = [
      fixture("audit-constant-conflict", "calculation", "constant-a", "Use g = 9.81 m s^-2. Use g = 10.0 m s^-2."),
      fixture("audit-constant-superscript", "calculation", "constant-e", "Use e = 1.60 × 10⁻¹⁹ C. Use e = 1.70 × 10⁻¹⁹ C."),
      fixture("audit-sign-conflict", "calculation", "sign-a", "Take upward as positive; take upward as negative."),
      fixture("audit-notation-conflict", "explanation", "notation-a", "Where r is radius; where r is resistance."),
      fixture("audit-definition-conflict", "explanation", "definition-a", "Describe the quantity.", {
        parts: [{
          prompt: "Describe the quantity.", marks: 2,
          scheme: ["Velocity is a vector", "Velocity is not a vector"],
          answer: "Velocity is a vector. Velocity is not a vector.",
          specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-99"],
          capabilityIds: ["phys.audit-fixture"],
          learning: { familyId: "definition-a", contextId: "definition-a:context", demand: "explanation", reasoningMoves: ["compare two definitions"] },
        }],
      }),
      fixture("audit-assumption-conflict", "explanation", "assumption-a", "Neglect air resistance in the model.", {
        parts: [{
          prompt: "Neglect air resistance in the model.", marks: 2,
          scheme: ["Air resistance acts on the object", "Use the resulting force"],
          answer: "Air resistance acts throughout the motion, so include it.",
          specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-99"],
          capabilityIds: ["phys.audit-fixture"],
          learning: { familyId: "assumption-a", contextId: "assumption-a:context", demand: "explanation", reasoningMoves: ["compare a stated model assumption with the force model"] },
        }],
      }),
    ];
    const first = auditPhysicsBank(rows);
    const second = auditPhysicsBank(rows);
    expect([...new Set(first.issues.filter((issue) => issue.severity === "error").map((issue) => issue.kind))]).toEqual(expect.arrayContaining([
      "constant-conflict", "sign-convention-conflict", "notation-conflict", "definition-conflict", "assumption-conflict",
    ]));
    expect(first.errors).toBe(first.consistencyErrors);
    expect(first.issues.map(({ kind, questionId, partId, peerId, severity, detail }) => ({ kind, questionId, partId, peerId, severity, detail })))
      .toEqual(second.issues.map(({ kind, questionId, partId, peerId, severity, detail }) => ({ kind, questionId, partId, peerId, severity, detail })));
  });

  it("flags repeated reasoning, duplicate schemes and implausible difficulty", () => {
    const prompt = "State the relationship and apply it to the experiment.";
    const rows = [
      fixture("audit-duplicate-a", "recall", "family-a", prompt),
      fixture("audit-duplicate-b", "recall", "family-b", prompt),
    ];
    const report = auditPhysicsBank(rows);
    expect(report.duplicatePairs).toBeGreaterThan(0);
    expect(report.difficultyMismatches).toBe(2);
    expect(report.issues.some((issue) => issue.kind === "duplicate-mark-scheme")).toBe(true);
  });
});
