import { describe, expect, it } from "vitest";
import { seedQuestionsForSubject } from "@/content";
import { defineQuestion } from "@/content/questions/authoring";
import { auditPhysicsBank } from "@/domain/physics-bank-audit";
import { auditPhysicsPartNumerics, parsePhysicsNumericExpression } from "@/domain/physics-numerical-audit";
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

  it("counts every numeric claim independently and retains equation provenance", () => {
    const part = fixture("audit-claim-level", "calculation", "claim-level", "Calculate the speed.", {
      parts: [{
        prompt: "Calculate the speed.", marks: 2,
        scheme: ["v = 6.0 / 3.0 = 2.0 m s^-1; the measured time is 0.50 s"],
        answer: "v = 2.0 m s^-1. The measured time is 0.50 s.",
        specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-99"], capabilityIds: ["phys.audit-fixture"],
        learning: { familyId: "claim-level", contextId: "claim-level:context", demand: "calculation", reasoningMoves: ["separate a checked equation from an additional reported value"] },
      }],
    }).parts[0]!;
    const report = auditPhysicsPartNumerics(part);
    expect(report.claimsDetected).toBeGreaterThanOrEqual(3);
    expect(report.claimsParsed).toBeGreaterThanOrEqual(3);
    expect(report.claimsVerified).toBeGreaterThanOrEqual(1);
    expect(report.claimsUnresolved).toBeGreaterThan(0);
    expect(report.provenance.some((row) => row.source === "scheme" && row.sourceValues.length === 2 && row.status === "verified")).toBe(true);
    expect(report.dimensionalCoverage.claimsDetected).toBeGreaterThan(report.dimensionalCoverage.checks);
  });

  it("recomputes Physics-law candidates and uses precision-aware tolerances", () => {
    const good = fixture("audit-law-good", "calculation", "law-good", "Calculate the force.", {
      parts: [{
        prompt: "Calculate the force.", marks: 2,
        scheme: ["F = ma = 2.0 × 3.0 = 6.0 N", "The current calculation uses F = ma."],
        answer: "F = 6.0 N.", specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-99"], capabilityIds: ["phys.audit-fixture"],
        learning: { familyId: "law-good", contextId: "law-good:context", demand: "calculation", reasoningMoves: ["apply F=ma"] },
      }],
    }).parts[0]!;
    const goodAudit = auditPhysicsPartNumerics(good);
    expect(goodAudit.physicsRuleDetected).toBeGreaterThan(0);
    expect(goodAudit.physicsRuleVerified).toBeGreaterThan(0);
    expect(goodAudit.provenance.some((row) => row.rule === "F=ma" && row.status === "verified")).toBe(true);

    const rounded = fixture("audit-precision", "calculation", "precision", "Calculate the current.", {
      parts: [{
        prompt: "Calculate the current.", marks: 2,
        scheme: ["I = 14.1 / 6.0 = 2.36 A"], answer: "I = 2.36 A.",
        specPointIds: ["wjec-alevel-physics.electric-circuits.sp-99"], capabilityIds: ["phys.audit-fixture"],
        learning: { familyId: "precision", contextId: "precision:context", demand: "calculation", reasoningMoves: ["retain a guard digit from measured inputs"] },
      }],
    }).parts[0]!;
    expect(auditPhysicsPartNumerics(rounded).arithmeticErrors).toBe(0);

    const bad = fixture("audit-law-bad", "calculation", "law-bad", "Calculate the force.", {
      parts: [{
        prompt: "Calculate the force.", marks: 2,
        scheme: ["F = ma = 2.0 × 3.0 = 7.0 N", "Use F = ma."], answer: "F = 7.0 N.",
        specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-99"], capabilityIds: ["phys.audit-fixture"],
        learning: { familyId: "law-bad", contextId: "law-bad:context", demand: "calculation", reasoningMoves: ["reject an incorrect F=ma result"] },
      }],
    }).parts[0]!;
    const badAudit = auditPhysicsPartNumerics(bad);
    expect(badAudit.physicsRuleErrors).toBeGreaterThan(0);
    expect(badAudit.issues.some((issue) => issue.kind === "numeric-arithmetic")).toBe(true);
  });

  it("validates safe rearrangements across the common Physics law set", () => {
    const part = fixture("audit-law-set", "calculation", "law-set", "Apply the stated relations.", {
      parts: [{
        prompt: "Apply the stated relations.", marks: 8,
        scheme: [
          "F = ma = 2.0 × 3.0 = 6.0 N",
          "I = V / R = 12 / 4.0 = 3.0 A",
          "P = VI = 12 × 3.0 = 36 W",
          "pV = nRT; n = pV / RT = 1.0×10⁵ × 0.020 / (8.31 × 300) = 0.802 mol",
          "Q = mcΔT = 2.0 × 4200 × 5.0 = 42000 J",
          "λ = h / p = 6.63e-34 / 2.0e-24 = 3.32e-10 m",
          "E = hf = 6.63e-34 × 5.0e14 = 3.32e-19 J",
        ],
        answer: "The safe results are F = 6.0 N, I = 3.0 A, P = 36 W, n = 0.802 mol, Q = 42000 J, λ = 3.32e-10 m and E = 3.32e-19 J.",
        specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-99"], capabilityIds: ["phys.audit-fixture"],
        learning: { familyId: "law-set", contextId: "law-set:context", demand: "calculation", reasoningMoves: ["rearrange and check common Physics relations"] },
      }],
    }).parts[0]!;
    const report = auditPhysicsPartNumerics(part);
    expect(report.physicsRuleChecks).toBeGreaterThanOrEqual(6);
    expect(report.physicsRuleVerified).toBe(report.physicsRuleChecks);
    expect(report.physicsRuleErrors).toBe(0);
    expect(report.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("matches normal prose quantities conservatively across the scheme and answer", () => {
    const part = fixture("audit-prose-quantity", "calculation", "prose-quantity", "Find the speed.", {
      parts: [{
        prompt: "Find the speed.", marks: 2,
        scheme: ["The speed is 2.0 m s^-1"], answer: "The resulting speed is 2.0 m s^-1.",
        specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-99"], capabilityIds: ["phys.audit-fixture"],
        learning: { familyId: "prose-quantity", contextId: "prose-quantity:context", demand: "calculation", reasoningMoves: ["report a final quantity in prose"] },
      }],
    }).parts[0]!;
    const report = auditPhysicsPartNumerics(part);
    expect(report.schemeAnswerChecks).toBe(1);
    expect(report.schemeAnswerVerified).toBe(1);
    expect(report.schemeAnswerCoverage.coveragePercent).toBe(100);
  });

  it("matches equivalent dimensions and explicit magnitude wording without hiding sign errors", () => {
    const part = fixture("audit-equivalent-units", "calculation", "equivalent-units", "Compare the field strength.", {
      parts: [{
        prompt: "Compare the field strength.", marks: 2,
        scheme: ["field strength = 2.0 N C^-1"], answer: "field strength = 2.0 V m^-1.",
        specPointIds: ["wjec-alevel-physics.electric-fields.sp-99"], capabilityIds: ["phys.audit-fixture"],
        learning: { familyId: "equivalent-units", contextId: "equivalent-units:context", demand: "calculation", reasoningMoves: ["recognise equivalent SI dimensions"] },
      }],
    }).parts[0]!;
    const equivalent = auditPhysicsPartNumerics(part);
    expect(equivalent.schemeAnswerChecks).toBe(1);
    expect(equivalent.schemeAnswerVerified).toBe(1);
    expect(equivalent.dimensionalErrors).toBe(0);

    const magnitude = fixture("audit-magnitude-sign", "calculation", "magnitude-sign", "Find the internal resistance.", {
      parts: [{
        prompt: "Find the internal resistance.", marks: 2,
        scheme: ["gradient magnitude = 0.50 Ω"], answer: "gradient = -0.50 V A^-1.",
        specPointIds: ["wjec-alevel-physics.electric-circuits.sp-99"], capabilityIds: ["phys.audit-fixture"],
        learning: { familyId: "magnitude-sign", contextId: "magnitude-sign:context", demand: "calculation", reasoningMoves: ["interpret the signed V-I gradient as a resistance magnitude"] },
      }],
    }).parts[0]!;
    expect(auditPhysicsPartNumerics(magnitude).schemeAnswerErrors).toBe(0);
  });
});
