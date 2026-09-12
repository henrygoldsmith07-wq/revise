import { describe, expect, it } from "vitest";
import { auditPhysicsAssessmentQuality, isTemplatedReasoningMove, physicsQualityQueue, promptOverload } from "@/domain/physics-assessment-quality";
import { conflictingWorkingLabel, markCalculationWorking } from "@/domain/calculation-rubric";
import { redundantPrerequisiteEdges, validateCapabilityGraph, type CapabilityNode } from "@/domain/capability-graph";
import { questionContexts, questionFamilies } from "@/domain/learning-evidence";
import { PHYSICS_PART_LEARNING } from "@/content/questions/physics-part-learning";
import { physicsCoverageQuestions } from "@/content/questions/physics-coverage";
import { seedQuestionsForSubject } from "@/content";
import { wjecPhysics } from "@/domain/curriculum/wjec-physics";
import { wjecCapabilities } from "@/content/capabilities";
import type { Question, QuestionPart } from "@/domain/types";

// ---------------------------------------------------------------------------
// Shallow-variation hardening: number swaps, wording changes and templated
// reasoning moves can no longer count as distinct families.
// ---------------------------------------------------------------------------

const SUBJECT = "wjec-alevel-physics";

function partWith(overrides: Partial<QuestionPart> & { prompt: string; learning?: QuestionPart["learning"] }): QuestionPart {
  return {
    id: "p", label: "", marks: 1, markScheme: ["point"], modelAnswer: "answer",
    specPointIds: [`${SUBJECT}.kinematics-dynamics.sp-01`],
    capabilityIds: ["phys.kinematics-dynamics.sp-01"],
    ...overrides,
  };
}

function questionWith(parts: QuestionPart[], id = "test-q"): Question {
  return {
    id, subjectId: SUBJECT, topicIds: [`${SUBJECT}.kinematics-dynamics`], kind: "short",
    stem: "stem", options: undefined, correctIndex: undefined, parts,
    totalMarks: parts.reduce((sum, part) => sum + part.marks, 0),
    calculatorAllowed: true, difficulty: 1, origin: "seed", source: "authored",
    licensedSource: null, verification: "unverified", reviewer: null, lastChecked: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("shallow-variation detection", () => {
  const learning = (family: string, move: string) => ({ familyId: family, contextId: `${family}-ctx`, demand: "calculation" as const, reasoningMoves: [move] });

  it("rejects a reasoning move that only restates the demand category", () => {
    expect(isTemplatedReasoningMove("calculation reasoning in the stated physical context")).toBe(true);
    expect(isTemplatedReasoningMove("transfer reasoning with the authored data")).toBe(true);
    expect(isTemplatedReasoningMove("compute the resultant before applying Newton's second law")).toBe(false);
  });

  it("does not count a templated move as a distinct reasoning operation", () => {
    const audit = auditPhysicsAssessmentQuality({
      topics: wjecPhysics.topics, nodes: wjecCapabilities, trustedQuestion: () => false,
      questions: [questionWith([
        partWith({ prompt: "A 2 kg trolley is pushed with 6 N. Calculate a.", learning: learning("f1", "calculation reasoning in the stated physical context") }),
        partWith({ prompt: "A 4 kg cart is pulled with 12 N. Calculate a.", learning: learning("f2", "calculation reasoning in the stated physical context") }),
      ])],
    });
    const cell = audit.capabilityCoverageByCapability.find((row) => row.capabilityId === "phys.kinematics-dynamics.sp-01");
    const calculation = cell?.demands.find((demand) => demand.demand === "calculation");
    // Two families/contexts exist, but the reasoning moves are filler.
    expect(calculation?.families).toHaveLength(2);
    expect(calculation?.distinct).toBe(false);
    expect(audit.issues.some((issue) => issue.kind === "templated-reasoning-move")).toBe(true);
  });

  it("flags a wording-only near-duplicate prompt in the same statement and demand", () => {
    const audit = auditPhysicsAssessmentQuality({
      topics: wjecPhysics.topics, nodes: wjecCapabilities, trustedQuestion: () => false,
      questions: [
        questionWith([partWith({ prompt: "Calculate the resultant force acting on the trolley.", learning: learning("f1", "add opposing forces with signs") })], "q-a"),
        questionWith([partWith({ prompt: "Determine the resultant force that acts on the trolley.", learning: learning("f2", "add opposing forces with their signs") })], "q-b"),
      ],
    });
    expect(promptOverload("Calculate the resultant force acting on the trolley.", "Determine the resultant force that acts on the trolley.")).toBeGreaterThanOrEqual(0.6);
    expect(audit.issues.some((issue) => issue.kind === "surface-rewording" && issue.questionId === "q-b")).toBe(true);
  });

  it("does not flag same-formula practice that uses a different reasoning operation", () => {
    const audit = auditPhysicsAssessmentQuality({
      topics: wjecPhysics.topics, nodes: wjecCapabilities, trustedQuestion: () => false,
      questions: [
        questionWith([partWith({ prompt: "Calculate the resultant force acting on the trolley.", learning: learning("f1", "add opposing forces with signs") })], "q-a"),
        questionWith([partWith({ prompt: "Determine the resultant force that acts on the trolley.", learning: learning("f2", "resolve the applied force into components first") })], "q-b"),
      ],
    });
    expect(audit.issues.some((issue) => issue.kind === "surface-rewording")).toBe(false);
  });

  it("accepts two genuinely different questions as distinct", () => {
    const audit = auditPhysicsAssessmentQuality({
      topics: wjecPhysics.topics, nodes: wjecCapabilities, trustedQuestion: () => false,
      questions: [
        questionWith([partWith({ prompt: "Resolve the 50 N pull at 30° to the horizontal into components.", learning: learning("f1", "resolve a force into perpendicular components") })], "q-a"),
        questionWith([partWith({ prompt: "A lift of mass 600 kg accelerates upward at 0.80 m s⁻². Find the cable tension.", learning: learning("f2", "apply Newton's second law with a sign convention") })], "q-b"),
      ],
    });
    const cell = audit.capabilityCoverageByCapability.find((row) => row.capabilityId === "phys.kinematics-dynamics.sp-01");
    const application = cell?.demands.find((demand) => demand.demand === "calculation");
    expect(application?.questionCount).toBe(2);
    expect(audit.issues.some((issue) => issue.kind === "surface-rewording")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Calculation marking: equivalent algebra earns method marks; contradictory
// labels escalate instead of confidently mis-marking.
// ---------------------------------------------------------------------------

describe("equivalent-algebra method marking", () => {
  const tensionPart = (): QuestionPart => ({
    id: "p", label: "", prompt: "Find the tension.", marks: 2,
    markScheme: ["T - mg = ma shown", "T = 6366 N"],
    modelAnswer: "T - mg = ma\nT = 600(9.81 + 0.8) = 6366 N",
    specPointIds: [`${SUBJECT}.kinematics-dynamics.sp-04`],
    capabilityIds: ["phys.kinematics-dynamics.sp-04"],
    calculationRules: [
      { kind: "method", label: "T", expected: 6366, method: { operator: "+", operands: [5886, 480] } },
      { kind: "accuracy", label: "T", expected: 6366 },
    ],
  });

  it("credits a method line written as a rearranged but equivalent sum", () => {
    // 5886 + 480 = 6366: direct binary match works; the equivalent form
    // `T = mg + a-total` with the same values is a labelled rearrangement.
    const marked = markCalculationWorking(tensionPart(), "T = 600 * 9.81 + 600 * 0.8 = 6366 N");
    expect(marked?.awarded).toBe(2);
  });

  it("does not award a method mark for a coincidental numeric match without operand references", () => {
    // 6366 reached by an unrelated route: no reference to the method's operands.
    const marked = markCalculationWorking(tensionPart(), "T = 2122 * 3 = 6366 N");
    expect(marked?.awarded).toBe(1); // accuracy only
    expect(marked?.evidence?.[0]?.status).not.toBe("credited");
  });

  it.each([
    "Given values: 5886 and 480.\nT = 2122 * 3 = 6366 N",
    "T = 15886 - 9520 + 480 - 480 = 6366 N",
  ])("does not infer a method from irrelevant numbers or digit substrings: %s", (answer) => {
    const marked = markCalculationWorking(tensionPart(), answer);
    expect(marked?.awarded).toBe(1);
    expect(marked?.evidence?.[0]?.status).not.toBe("credited");
  });

  it("escalates every rule when two lines assign different values to the same label", () => {
    expect(conflictingWorkingLabel("F = 6 N\nF = 8 N")).toBe("f"); // labels are compared case-insensitively
    expect(conflictingWorkingLabel("F = 2 * 3 = 6 N")).toBeNull(); // slip, not contradiction
    const marked = markCalculationWorking(tensionPart(), "T = 5886 + 480 = 6366 N\nT = 7000 N");
    expect(marked?.awarded).toBe(0);
    expect(marked?.evidence?.every((point) => point.status === "unreported")).toBe(true);
    expect(marked?.comment).toContain("provisional");
  });

  it("reads standard-form answers with powers of ten", () => {
    const standardPart: QuestionPart = { ...tensionPart(), marks: 1,
      markScheme: ["T = 6.366 × 10³ N"], modelAnswer: "T = 6.366 × 10³ N",
      calculationRules: [{ kind: "accuracy", label: "T", expected: 6366 }] };
    expect(markCalculationWorking(standardPart, "T = 6.366 × 10³ N")?.awarded).toBe(1);
    expect(markCalculationWorking(standardPart, "T = 6.366e3 N")?.awarded).toBe(1);
    expect(markCalculationWorking(standardPart, "T = 6.366 × 10² N")?.awarded).toBe(0);
  });

  it("credits significant figures declared in standard form", () => {
    const precisionPart: QuestionPart = { ...tensionPart(), marks: 1,
      markScheme: ["v to 3 s.f."], modelAnswer: "v = 2.77",
      calculationRules: [{ kind: "precision", label: "v", expected: 2.77, significantFigures: 3 }] };
    expect(markCalculationWorking(precisionPart, "v = 2.77")?.awarded).toBe(1);
    expect(markCalculationWorking(precisionPart, "v = 2.77 × 10⁰")?.awarded).toBe(1);
    expect(markCalculationWorking(precisionPart, "v = 2.8")?.awarded).toBe(0);
    expect(markCalculationWorking(precisionPart, "v = 11/4")?.awarded).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Curated-pack enrichment: every mapped part isolates one capability and
// carries authored reasoning moves.
// ---------------------------------------------------------------------------

describe("curated Physics part-learning enrichment", () => {
  const physics = seedQuestionsForSubject(SUBJECT);

  it("gives every curated Physics part a single-capability mapping with authored reasoning moves", () => {
    let enrichedCount = 0;
    for (const question of physics) {
      question.parts.forEach((part, index) => {
        const spec = PHYSICS_PART_LEARNING[`${question.id}:${index}`];
        if (!spec) return;
        enrichedCount++;
        expect(part.learning, `${question.id}:${index} learning`).toBeDefined();
        expect(part.capabilityIds, `${question.id}:${index} capability`).toHaveLength(1);
        expect(wjecCapabilities.some((node) => node.id === part.capabilityIds![0])).toBe(true);
        expect(part.learning!.reasoningMoves.length).toBeGreaterThan(0);
        expect(part.learning!.reasoningMoves.every((move) => !isTemplatedReasoningMove(move))).toBe(true);
      });
    }
    expect(enrichedCount).toBeGreaterThan(80);
    // And no part is left without learning metadata anywhere in the bank.
    for (const question of physics) {
      expect(question.parts.every((part) => part.learning), `${question.id} has a part without learning`).toBe(true);
      expect(question.parts.every((part) => (part.capabilityIds ?? []).length === 1), `${question.id} has a part without a capability`).toBe(true);
    }
  });

  it("leaves the bank free of missing-capability and missing-part-learning issues", () => {
    const audit = auditPhysicsAssessmentQuality({
      topics: wjecPhysics.topics, questions: physics, nodes: wjecCapabilities, trustedQuestion: () => false,
    });
    expect(audit.issues.some((issue) => issue.kind === "missing-capability")).toBe(false);
    expect(audit.issues.some((issue) => issue.kind === "missing-part-learning")).toBe(false);
    expect(audit.issues.some((issue) => issue.kind === "missing-reasoning-move")).toBe(false);
  });

  it("keeps the authored coverage items distinct from each other and template-free", () => {
    expect(physicsCoverageQuestions.length).toBe(24);
    const prompts = physicsCoverageQuestions.flatMap((question) => question.parts.map((part) => part.prompt));
    expect(new Set(prompts).size).toBe(prompts.length);
    expect(prompts.some((prompt) => /first examinable requirement/i.test(prompt))).toBe(false);
    for (const question of physicsCoverageQuestions) {
      expect(question.parts).toHaveLength(1);
      const part = question.parts[0]!;
      expect(part.specPointIds).toHaveLength(1);
      expect(part.capabilityIds).toHaveLength(1);
      expect(part.markScheme).toHaveLength(part.marks);
      expect(part.learning?.reasoningMoves[0]).toBeTruthy();
      expect(isTemplatedReasoningMove(part.learning!.reasoningMoves[0]!)).toBe(false);
      expect(wjecCapabilities.some((node) => node.id === part.capabilityIds![0] && node.specPointIds.includes(part.specPointIds![0]!))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// The quality queue must stay a real worklist: mapping items cleared, demand
// items still present but never fabricated as complete.
// ---------------------------------------------------------------------------

describe("physics quality queue after enrichment", () => {
  it("reports mapping and review work honestly", () => {
    const physics = seedQuestionsForSubject(SUBJECT);
    const audit = auditPhysicsAssessmentQuality({
      topics: wjecPhysics.topics, questions: physics, nodes: wjecCapabilities, trustedQuestion: () => false,
    });
    const queue = physicsQualityQueue(audit);
    // Mapping repair is finished; review and demand work remain.
    expect(queue.some((item) => item.reason === "missing-mapping" && item.issueKind === "missing-capability")).toBe(false);
    expect(queue.some((item) => item.reason === "missing-review")).toBe(true);
    expect(queue.some((item) => item.reason === "missing-demand")).toBe(true);
    expect(audit.releaseReady).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Prerequisite-graph coherence: no cycles, no transitively redundant blockers.
// ---------------------------------------------------------------------------

describe("prerequisite graph coherence", () => {
  it("the shipped Physics graph has no cycles and no redundant (implied) edges", () => {
    expect(validateCapabilityGraph(wjecCapabilities)).toEqual([]);
    expect(redundantPrerequisiteEdges(wjecCapabilities, SUBJECT)).toEqual([]);
  });

  it("flags a direct edge that is already implied by a longer path", () => {
    const node = (id: string, prerequisites: string[]): CapabilityNode => ({
      id, subjectId: SUBJECT, topicId: `${SUBJECT}.t`, label: id.toUpperCase(),
      specPointIds: [`${SUBJECT}.t.sp-01`], prerequisites, explanation: `Demonstrate ${id}.`,
    });
    const nodes = [node("x", ["y", "z"]), node("y", ["z"]), node("z", [])];
    // x reaches z through y, so the direct x <- z edge is an unnecessary blocker.
    expect(redundantPrerequisiteEdges(nodes)).toEqual(["x <- z"]);
  });
});

// ---------------------------------------------------------------------------
// Family/context isolation for transfer freshness.
// ---------------------------------------------------------------------------

describe("question context isolation", () => {
  it("reads part-level contexts when a structured question mixes skills", () => {
    const q: Question = { ...questionWith([
      partWith({ prompt: "p one", learning: { familyId: "fa", contextId: "ctx-one", demand: "calculation", reasoningMoves: ["one"] } }),
      partWith({ prompt: "p two", learning: { familyId: "fb", contextId: "ctx-two", demand: "explanation", reasoningMoves: ["two"] } }),
    ], "q-ctx") };
    expect(new Set(questionContexts(q))).toEqual(new Set(["ctx-one", "ctx-two"]));
    expect(new Set(questionFamilies(q))).toEqual(new Set(["fa", "fb"]));
  });
});
