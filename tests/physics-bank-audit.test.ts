import { describe, expect, it } from "vitest";
import { seedQuestionsForSubject } from "@/content";
import { defineQuestion } from "@/content/questions/authoring";
import { auditPhysicsBank } from "@/domain/physics-bank-audit";
import { parsePhysicsNumericExpression } from "@/domain/physics-numerical-audit";
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
    expect(report.numericalChecks).toBeGreaterThan(0);
    expect(report.numericalVerified).toBe(report.numericalChecks);
    expect(report.numericalErrors).toBe(0);
    expect(report.dimensionalChecks).toBeGreaterThan(0);
    expect(report.dimensionalErrors).toBe(0);
    expect(report.physicsRuleChecks).toBeGreaterThan(0);
    expect(report.manualReviewRequired).toBeGreaterThan(0);
    expect(report.confidence.structural).toBe("checked");
    expect(report.confidence.numerical).toBe("partial");
    expect(report.confidence.dimensional).toBe("verified");
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
    expect(first.errors).toBeGreaterThanOrEqual(first.consistencyErrors);
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

  it("recomputes arithmetic, percentages, gradients, half-life and standard form", () => {
    const rows = [
      fixture("audit-good-arithmetic", "calculation", "numeric-good", "Calculate the speed.", {
        parts: [{
          prompt: "Calculate the speed.", marks: 2,
          scheme: ["v = 6.0 / 3.0 = 2.0 m s^-1"],
          answer: "v = 2.0 m s^-1.",
          specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-99"], capabilityIds: ["phys.audit-fixture"],
          learning: { familyId: "numeric-good", contextId: "numeric-good:context", demand: "calculation", reasoningMoves: ["divide distance by time"] },
        }],
      }),
      fixture("audit-good-percent", "calculation", "numeric-percent", "Find the percentage.", {
        parts: [{
          prompt: "Find the percentage.", marks: 2,
          scheme: ["percentage = (3 / 12) × 100 = 25 %"],
          answer: "percentage = 25 %.",
          specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-99"], capabilityIds: ["phys.audit-fixture"],
          learning: { familyId: "numeric-percent", contextId: "numeric-percent:context", demand: "calculation", reasoningMoves: ["convert a fraction to a percentage"] },
        }],
      }),
      fixture("audit-good-gradient", "calculation", "numeric-gradient", "Find the graph gradient.", {
        parts: [{
          prompt: "Find the graph gradient.", marks: 2,
          scheme: ["gradient = (8.0 - 2.0) / (4.0 - 1.0) = 2.0 N s^-1"],
          answer: "gradient = 2.0 N s^-1.",
          specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-99"], capabilityIds: ["phys.audit-fixture"],
          learning: { familyId: "numeric-gradient", contextId: "numeric-gradient:context", demand: "calculation", reasoningMoves: ["obtain a gradient from two points"] },
        }],
      }),
      fixture("audit-good-half-life", "calculation", "numeric-half-life", "Find the remaining fraction.", {
        parts: [{
          prompt: "Find the remaining fraction.", marks: 2,
          scheme: ["N/N0 = (1/2)^(12/6) = 0.25"],
          answer: "N/N0 = 0.25.",
          specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-99"], capabilityIds: ["phys.audit-fixture"],
          learning: { familyId: "numeric-half-life", contextId: "numeric-half-life:context", demand: "calculation", reasoningMoves: ["apply repeated half-lives"] },
        }],
      }),
      fixture("audit-good-standard-form", "calculation", "numeric-standard-form", "Calculate the ratio.", {
        parts: [{
          prompt: "Calculate the ratio.", marks: 2,
          scheme: ["ratio = (5.0 × 10^8) / (2.0 × 10^11) = 2.5 × 10^-3"],
          answer: "ratio = 2.5 × 10^-3.",
          specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-99"], capabilityIds: ["phys.audit-fixture"],
          learning: { familyId: "numeric-standard-form", contextId: "numeric-standard-form:context", demand: "calculation", reasoningMoves: ["divide values in standard form"] },
        }],
      }),
    ];
    const report = auditPhysicsBank(rows);
    expect(report.numericalChecks).toBeGreaterThanOrEqual(5);
    expect(report.numericalErrors).toBe(0);
    expect(report.dimensionalErrors).toBe(0);
    expect(parsePhysicsNumericExpression("1/5.00×10^5 m^-1")?.unit?.dimension).toBe("L");
    expect(parsePhysicsNumericExpression("2.0 m/s")?.unit?.dimension).toBe("L T-1");
  });

  it("catches adversarial arithmetic, powers of ten, units and scheme-answer mismatches", () => {
    const rows = [
      fixture("audit-bad-arithmetic", "calculation", "numeric-bad-arithmetic", "Calculate speed.", {
        parts: [{
          prompt: "Calculate speed.", marks: 2,
          scheme: ["v = 6.0 / 3.0 = 2.5 m s^-1"], answer: "v = 2.5 m s^-1.",
          specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-99"], capabilityIds: ["phys.audit-fixture"],
          learning: { familyId: "numeric-bad-arithmetic", contextId: "numeric-bad-arithmetic:context", demand: "calculation", reasoningMoves: ["divide distance by time"] },
        }],
      }),
      fixture("audit-bad-power", "calculation", "numeric-bad-power", "Calculate energy.", {
        parts: [{
          prompt: "Calculate energy.", marks: 2,
          scheme: ["E = (3.0 × 10^8) × (2.0 × 10^-3) = 6.0 × 10^8"], answer: "E = 6.0 × 10^8.",
          specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-99"], capabilityIds: ["phys.audit-fixture"],
          learning: { familyId: "numeric-bad-power", contextId: "numeric-bad-power:context", demand: "calculation", reasoningMoves: ["multiply standard-form values"] },
        }],
      }),
      fixture("audit-bad-gradient", "calculation", "numeric-bad-gradient", "Find gradient.", {
        parts: [{
          prompt: "Find gradient.", marks: 2,
          scheme: ["gradient = (8.0 - 2.0) / (4.0 - 1.0) = 3.0 N s^-1"], answer: "gradient = 3.0 N s^-1.",
          specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-99"], capabilityIds: ["phys.audit-fixture"],
          learning: { familyId: "numeric-bad-gradient", contextId: "numeric-bad-gradient:context", demand: "calculation", reasoningMoves: ["obtain a gradient from two points"] },
        }],
      }),
      fixture("audit-bad-graph-area", "calculation", "numeric-bad-graph-area", "Find the graph area.", {
        parts: [{
          prompt: "Find the graph area.", marks: 2,
          scheme: ["area = 0.5 × 4.0 × 6.0 = 15 J"], answer: "area = 0.5 × 4.0 × 6.0 = 15 J.",
          specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-99"], capabilityIds: ["phys.audit-fixture"],
          learning: { familyId: "numeric-bad-graph-area", contextId: "numeric-bad-graph-area:context", demand: "calculation", reasoningMoves: ["obtain work from a graph area"] },
        }],
      }),
      fixture("audit-bad-proportional", "calculation", "numeric-bad-proportional", "Find the fraction.", {
        parts: [{
          prompt: "Find the fraction.", marks: 2,
          scheme: ["fraction = 2.0 / 5.0 = 0.50"], answer: "fraction = 2.0 / 5.0 = 0.50.",
          specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-99"], capabilityIds: ["phys.audit-fixture"],
          learning: { familyId: "numeric-bad-proportional", contextId: "numeric-bad-proportional:context", demand: "calculation", reasoningMoves: ["use a proportional ratio"] },
        }],
      }),
      fixture("audit-bad-sign", "calculation", "numeric-bad-sign", "Find the force.", {
        parts: [{
          prompt: "Find the force.", marks: 2,
          scheme: ["F = -0.16 / 0.040 = +4.0 N"], answer: "F = -0.16 / 0.040 = +4.0 N.",
          specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-99"], capabilityIds: ["phys.audit-fixture"],
          learning: { familyId: "numeric-bad-sign", contextId: "numeric-bad-sign:context", demand: "calculation", reasoningMoves: ["preserve a signed impulse direction"] },
        }],
      }),
      fixture("audit-bad-significant-figures", "calculation", "numeric-bad-significant-figures", "Report the speed to 3 significant figures.", {
        parts: [{
          prompt: "Report the speed to 3 significant figures.", marks: 2,
          scheme: ["v = 2.35 m s^-1"], answer: "v = 2.4 m s^-1.",
          specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-99"], capabilityIds: ["phys.audit-fixture"],
          learning: { familyId: "numeric-bad-significant-figures", contextId: "numeric-bad-significant-figures:context", demand: "calculation", reasoningMoves: ["report a result at the requested precision"] },
        }],
      }),
      fixture("audit-bad-unit", "calculation", "numeric-bad-unit", "Calculate speed.", {
        parts: [{
          prompt: "Calculate speed.", marks: 2,
          scheme: ["v = 2.0 m s^-1"], answer: "v = 2.0 m s^-2.",
          specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-99"], capabilityIds: ["phys.audit-fixture"],
          learning: { familyId: "numeric-bad-unit", contextId: "numeric-bad-unit:context", demand: "calculation", reasoningMoves: ["report a speed with units"] },
        }],
      }),
      fixture("audit-bad-scheme-answer", "calculation", "numeric-bad-scheme-answer", "Calculate speed.", {
        parts: [{
          prompt: "Calculate speed.", marks: 2,
          scheme: ["v = 2.0 m s^-1"], answer: "v = 2.5 m s^-1.",
          specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-99"], capabilityIds: ["phys.audit-fixture"],
          learning: { familyId: "numeric-bad-scheme-answer", contextId: "numeric-bad-scheme-answer:context", demand: "calculation", reasoningMoves: ["report a speed consistently"] },
        }],
      }),
    ];
    const report = auditPhysicsBank(rows);
    expect(report.numericalErrors).toBeGreaterThanOrEqual(3);
    expect(report.dimensionalErrors).toBeGreaterThanOrEqual(1);
    expect(report.schemeAnswerErrors).toBeGreaterThanOrEqual(1);
    expect(report.issues.some((issue) => issue.kind === "numeric-arithmetic")).toBe(true);
    expect(report.issues.some((issue) => issue.kind === "dimension-mismatch")).toBe(true);
    expect(report.issues.some((issue) => issue.kind === "scheme-answer-mismatch")).toBe(true);
    expect(report.issues.some((issue) => issue.detail.includes("15 J"))).toBe(true);
    expect(report.issues.some((issue) => issue.detail.includes("0.50"))).toBe(true);
    expect(report.issues.some((issue) => issue.detail.includes("+4.0 N"))).toBe(true);
    expect(report.issues.some((issue) => issue.kind === "rounding-conflict")).toBe(true);
  });
});
