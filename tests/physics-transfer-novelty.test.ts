import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { physicsTransferLinkedQuestions } from "@/content/questions/physics-transfer-linked";
import { allTopics } from "@/domain/curriculum";
import { wjecCapabilities } from "@/content/capabilities";
import { comparePhysicsTransfer, physicsRelationsUsed, physicsUnknowns } from "@/domain/physics-transfer-novelty";
import { compareTransferStructures, deriveVerifiedGraph, fingerprintSetup, verifiedGraphToPlain } from "@/domain/reasoning-graph";
import { auditFlagshipSubject } from "@/domain/subject-assessment-audit";
import type { QuestionPart } from "@/domain/types";

// The Physics novelty check compares what a Physics teacher would compare:
// the physical relations each worked solution uses, the unknowns each prompt
// asks for, and the context. It must reject renamed or re-numbered copies,
// fail closed when it cannot see the physics, and leave other subjects alone.

const PHYSICS = "wjec-alevel-physics";
const partById = new Map(seedQuestions.flatMap((q) => q.parts.map((p) => [p.id, { question: q, part: p }] as const)));

function part(prompt: string, scheme: string[], answer: string, contextId = "test:context:a"): QuestionPart {
  return {
    id: `test-${contextId}`, label: "", prompt, marks: scheme.length, markScheme: scheme, modelAnswer: answer,
    specPointIds: [`${PHYSICS}.circular-shm.sp-04`], capabilityIds: ["phys.circular-shm.sp-04"],
    learning: { familyId: "test", contextId, demand: "transfer", reasoningMoves: [] },
  };
}

const baseline = part(
  "An oscillator has amplitude 0.080 m and period 0.40 s. Calculate its maximum speed.",
  ["ω = 2π/T = 2π/0.40 = 15.7 rad s⁻¹", "vmax = ωA = 15.7 × 0.080 = 1.26 m s⁻¹"],
  "ω = 2π/0.40 = 15.7 rad s⁻¹, so vmax = ωA = 15.7(0.080) = 1.26 m s⁻¹.",
  "test:shm:cart",
);

describe("physics relation and unknown recognition", () => {
  it("binds each relation to the worked step that shows it", () => {
    const hits = physicsRelationsUsed(baseline);
    expect(hits.map((hit) => hit.relation).sort()).toEqual(["angular-frequency", "shm-maxima"]);
    for (const hit of hits) expect(hit.evidence.length).toBeGreaterThan(0);
  });

  it("does not read √2 as an rms conversion unless the step is about rms or peak values", () => {
    const halving = part("p", ["Halving the energy divides the p.d. by √2: 12/√2 = 8.5 V"], "12/√2 = 8.5 V.");
    expect(physicsRelationsUsed(halving).map((hit) => hit.relation)).not.toContain("rms-peak");
    const rms = part("p", ["V_rms = V₀/√2 = 170/√2 = 120 V"], "V_rms = 120 V.");
    expect(physicsRelationsUsed(rms).map((hit) => hit.relation)).toContain("rms-peak");
  });

  it("reads unknowns only from instruction clauses, not from assumptions or setup", () => {
    expect(physicsUnknowns("A 0.250 kg mass oscillates with period 0.80 s. Calculate the spring constant, neglecting the spring's mass.")).toEqual(["spring-constant"]);
    expect(physicsUnknowns("Use the area under the charge-p.d. line to find the energy stored at 12 V, and find the capacitance.")).toEqual(["capacitance", "energy"]);
    expect(physicsUnknowns("Calculate the rms current and the peak current.")).toEqual(["current-peak", "current-rms"]);
  });
});

describe("comparePhysicsTransfer verdicts", () => {
  it("rejects a number swap in the same setting", () => {
    const swapped = part(
      "An oscillator has amplitude 0.060 m and period 0.50 s. Calculate its maximum speed.",
      ["ω = 2π/T = 2π/0.50 = 12.6 rad s⁻¹", "vmax = ωA = 12.6 × 0.060 = 0.75 m s⁻¹"],
      "ω = 2π/0.50 = 12.6 rad s⁻¹, so vmax = ωA = 0.75 m s⁻¹.",
      "test:shm:cart-2",
    );
    const verdict = comparePhysicsTransfer(baseline, swapped);
    expect(verdict.isNovel).toBe(false);
    expect(verdict.contextChanged).toBe(false);
  });

  it("rejects a renamed context that solves the same relations for the same unknown", () => {
    const renamed = part(
      "A child on a garden swing moves through an arc of amplitude 0.080 m, taking 0.40 s per cycle. Calculate the child's maximum speed.",
      ["ω = 2π/T = 2π/0.40 = 15.7 rad s⁻¹", "vmax = ωA = 15.7 × 0.080 = 1.26 m s⁻¹"],
      "ω = 2π/0.40 = 15.7 rad s⁻¹, so vmax = ωA = 1.26 m s⁻¹.",
      "test:shm:swing",
    );
    const verdict = comparePhysicsTransfer(baseline, renamed);
    expect(verdict.contextChanged).toBe(true);
    expect(verdict.isNovel).toBe(false);
    expect(verdict.reasons.join(" ")).toMatch(/same relations solved for the same unknowns/);
  });

  it("fails closed when no physical relation is recognised", () => {
    const vague = part(
      "A pendulum clock in a museum loses time. Determine the period of its pendulum.",
      ["Use the usual oscillation result", "Period found"],
      "The period follows from the usual result.",
      "test:shm:clock",
    );
    const verdict = comparePhysicsTransfer(baseline, vague);
    expect(verdict.isNovel).toBe(false);
    expect(verdict.reasons.join(" ")).toMatch(/no physical relation recognised in the transfer/);
  });

  it("accepts a new unknown in a new context", () => {
    const inverse = part(
      "A motion sensor and an accelerometer on a glider record a largest speed of 0.60 m s⁻¹ and a largest acceleration of 4.8 m s⁻². Determine the amplitude.",
      ["ω = a_max/v_max = 4.8/0.60 = 8.0 rad s⁻¹", "A = v_max/ω = 0.60/8.0 = 0.075 m"],
      "v_max = ωA and a_max = ω²A, so ω = 8.0 rad s⁻¹ and A = 0.075 m.",
      "test:shm:glider",
    );
    const verdict = comparePhysicsTransfer(baseline, inverse);
    expect(verdict.isNovel, verdict.reasons.join("; ")).toBe(true);
    expect(verdict.newUnknowns).toContain("amplitude");
  });
});

describe("the subject audit uses it for Physics only", () => {
  it("every linked Physics transfer passes, and the audit raises no transfer-not-novel on them", () => {
    const physicsQuestions = seedQuestions.filter((q) => q.subjectId === PHYSICS);
    const audit = auditFlagshipSubject({ subjectId: PHYSICS, topics: allTopics().filter((t) => t.subjectId === PHYSICS), questions: physicsQuestions, nodes: wjecCapabilities });
    const linkedIds = new Set(physicsTransferLinkedQuestions.map((q) => q.id));
    const flagged = audit.subjectIssues.filter((issue) => linkedIds.has(issue.questionId) && issue.kind === "transfer-not-novel");
    expect(flagged).toEqual([]);
  }, 60_000);

  it("flags a Physics transfer whose link points at a renamed copy of itself", () => {
    const question = physicsTransferLinkedQuestions.find((q) => q.id.endsWith("circular-shm-sp-04-sensor-maxima"))!;
    const realBaseline = partById.get(question.parts[0]!.learning!.transferLink!.baselinePartId)!;
    const copy = {
      ...question,
      id: "cnt:question:test-renamed-copy",
      parts: question.parts.map((p) => ({
        ...p,
        id: "cnt:question:test-renamed-copy:0",
        prompt: realBaseline.part.prompt.replace("oscillator", "pendulum bob"),
        markScheme: realBaseline.part.markScheme,
        modelAnswer: realBaseline.part.modelAnswer,
      })),
    };
    const fixedLink = { ...copy, parts: copy.parts.map((p) => ({ ...p, learning: { ...p.learning!, transferLink: {
      ...p.learning!.transferLink!,
      baselineSetupFingerprint: fingerprintSetup(realBaseline.part.prompt),
      transferSetupFingerprint: fingerprintSetup(p.prompt, p.modelAnswer),
    } } })) };
    const audit = auditFlagshipSubject({ subjectId: PHYSICS, topics: [], questions: [realBaseline.question, fixedLink], nodes: [] });
    const kinds = audit.subjectIssues.filter((issue) => issue.questionId === fixedLink.id).map((issue) => issue.kind);
    expect(kinds).toContain("transfer-not-novel");
    expect(audit.subjectIssues.some((issue) => issue.questionId === fixedLink.id && /Physics transfer is not novel/.test(issue.detail))).toBe(true);
  });

  it("leaves the generic comparison unchanged for other subjects", () => {
    // Same inputs, same verdict as before this module existed: the generic
    // comparison is still what non-Physics audits call.
    const g = verifiedGraphToPlain(deriveVerifiedGraph(baseline));
    const same = compareTransferStructures(fingerprintSetup(baseline.prompt), fingerprintSetup(baseline.prompt), g, g);
    expect(same.isNovel).toBe(false);
  });
});
