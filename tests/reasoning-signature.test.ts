import { describe, expect, it } from "vitest";
import {
  NEAR_DUPLICATE_SIMILARITY,
  REASONING_NOVELTY_FLOOR,
  SIMILARITY_WEIGHTS,
  authoredMoves,
  calculationMethodOf,
  isNearDuplicateReasoning,
  isReasoningTransfer,
  reasoningNovelty,
  reasoningProfileOf,
  reasoningProfilesOf,
  reasoningSimilarity,
  solutionPathOf,
  questionsReasoningSimilarity,
  type ReasoningProfile,
} from "@/domain/reasoning-signature";
import type { CalculationMarkRule, LearningPartMetadata, LearningQuestionMetadata, Question, QuestionPart } from "@/domain/types";

/** The operator part of a calculation rubric rule ("+" | "-" | "*" | "/"). */
type CalculationMarkOperator = NonNullable<CalculationMarkRule["method"]>["operator"];

// This module is the single similarity model shared by question selection and
// the bank audit: a number-swapped reskin must not pass as transfer, and two
// parts that re-run the identical solution path must not both count as fresh
// coverage. Nothing else pins these thresholds directly, so they are held here.

const partLearning = (demand: LearningPartMetadata["demand"], moves: string[]): LearningPartMetadata => ({
  familyId: "fam-1",
  contextId: "ctx-1",
  demand,
  reasoningMoves: moves,
});

const part = (overrides: Partial<QuestionPart> = {}): QuestionPart => ({
  id: "p1",
  label: "(a)",
  prompt: "calculate the speed of the car",
  marks: 2,
  markScheme: ["divide the distance by the time", "state the unit"],
  modelAnswer: "v = 5 m/s",
  ...overrides,
});

const question = (parts: QuestionPart[], learning?: LearningQuestionMetadata): Question =>
  ({
    id: "q1",
    subjectId: "physics",
    topicIds: ["t"],
    kind: "short",
    stem: "A car travels along a road.",
    parts,
    totalMarks: 2,
    calculatorAllowed: true,
    difficulty: 3,
    origin: "seed",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...(learning ? { learning } : {}),
  }) as Question;

const calcRules = (operatorA: CalculationMarkOperator, operatorB: CalculationMarkOperator): CalculationMarkRule[] => [
  { kind: "method", label: "v", expected: 5, method: { operator: operatorA, operands: ["d", "t"] } },
  { kind: "accuracy", label: "a", expected: 2, method: { operator: operatorB, operands: ["v", "t"] } },
];

const profile = (overrides: Partial<ReasoningProfile> = {}): ReasoningProfile => ({
  capabilityId: "cap-1",
  demand: "calculation",
  familyId: "fam-1",
  contextId: "ctx-1",
  reasoningMoves: ["divide the distance by the time taken"],
  promptStructure: "calculate the speed",
  calculationMethod: ["method:/", "accuracy:*"],
  solutionPath: ["method:/", "accuracy:*"],
  ...overrides,
});

describe("authoredMoves", () => {
  it("trims, de-duplicates and drops templated filler that only restates the demand", () => {
    const q = question([part({ learning: partLearning("calculation", ["divide distance by time", "  divide distance by time  ", "calculation reasoning with the given data", "   "]) })]);
    expect(authoredMoves(q, q.parts[0]!)).toEqual(["divide distance by time"]);
  });

  it("falls back to the question-level learning metadata when the part carries none", () => {
    const q = question([part()], { familyId: "fam-1", contextId: "ctx-1", demand: "calculation", expectedMinutes: 3, reasoningMoves: ["resolves the weight along the slope"] });
    expect(authoredMoves(q, q.parts[0]!)).toEqual(["resolves the weight along the slope"]);
  });

  it("returns nothing when neither part nor question carries reasoning moves", () => {
    const q = question([part()]);
    expect(authoredMoves(q, q.parts[0]!)).toEqual([]);
  });
});

describe("calculationMethodOf and solutionPathOf", () => {
  it("reads the operator sequence (method first) from the rubric, independent of the numbers", () => {
    expect(calculationMethodOf(calcRules("/", "*"))).toEqual(["method:/", "accuracy:*"]);
    // A number swap keeps the same sequence — that is the point of the model.
    expect(calculationMethodOf([{ kind: "method", label: "v", expected: 500, method: { operator: "/", operands: ["d", "t"] } }])).toEqual(["method:/"]);
    expect(calculationMethodOf([{ kind: "unit", label: "unit", expected: 1 }])).toEqual(["unit"]);
  });

  it("lets the calculation rubric own the solution path of a calculation part", () => {
    expect(solutionPathOf(part({ calculationRules: calcRules("/", "*") }))).toEqual(["method:/", "accuracy:*"]);
  });

  it("derives an ordered, de-duplicated verb path from the mark scheme, claims and model answer", () => {
    const path = solutionPathOf(
      part({
        markScheme: ["state the law", "apply the law to the circuit"],
        learningClaims: ["the sum of p.d.s around a loop is the supply p.d."],
        modelAnswer: "The total resistance is found first\nthen the current follows from ohm's law",
      }),
    );
    expect(path.slice(0, 4)).toEqual(["state", "law", "apply", "circuit"]);
    // Split on discourse markers: "then" is a separator, not a step.
    expect(path).not.toContain("then");
  });

  it("returns an empty path for a part with no rubric, scheme or answer", () => {
    expect(solutionPathOf(part({ markScheme: [], modelAnswer: "" }))).toEqual([]);
  });
});

describe("reasoningProfileOf", () => {
  it("keeps a capability only when the part tests exactly one", () => {
    expect(reasoningProfileOf(question([part({ capabilityIds: ["cap-1"] })]), part({ capabilityIds: ["cap-1"] })).capabilityId).toBe("cap-1");
    expect(reasoningProfileOf(question([part()]), part()).capabilityId).toBeNull();
    expect(reasoningProfileOf(question([part({ capabilityIds: ["cap-1", "cap-2"] })]), part({ capabilityIds: ["cap-1", "cap-2"] })).capabilityId).toBeNull();
  });

  it("profiles every part of the question", () => {
    const q = question([part({ id: "p1" }), part({ id: "p2", prompt: "explain why the current changes" })]);
    expect(reasoningProfilesOf(q)).toHaveLength(2);
    expect(reasoningProfilesOf(q)[1]!.demand).toBeNull();
  });
});

describe("reasoningSimilarity", () => {
  it("weights sum to one and identical profiles score exactly 1", () => {
    expect(Object.values(SIMILARITY_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    const a = profile();
    expect(reasoningSimilarity(a, { ...profile() }).overall).toBeCloseTo(1);
  });

  it("scores profiles that share nothing but the capability at the capability weight alone", () => {
    const b = profile({
      demand: "explanation",
      familyId: "fam-2",
      contextId: "ctx-2",
      reasoningMoves: ["resolves forces along the slope"],
      promptStructure: "explain why the filament glows",
      calculationMethod: [],
      solutionPath: ["state", "law"],
    });
    const result = reasoningSimilarity(profile({ calculationMethod: [] }), b);
    expect(result.signals.capability).toBe(1);
    expect(result.overall).toBeCloseTo(SIMILARITY_WEIGHTS.capability);
  });

  it("scores two empty profiles at zero (nothing to compare)", () => {
    const empty: ReasoningProfile = { capabilityId: null, demand: null, familyId: null, contextId: null, reasoningMoves: [], promptStructure: "", calculationMethod: [], solutionPath: [] };
    expect(reasoningSimilarity(empty, empty).overall).toBe(0);
  });

  it("counts a reordered operator sequence as the same method, a different sequence as different", () => {
    const reordered = profile({ solutionPath: ["accuracy:*", "method:/"] });
    expect(reasoningSimilarity(profile(), reordered).signals.solutionPath).toBeGreaterThan(0.8);
    const different = profile({ solutionPath: ["method:*", "accuracy:/"] });
    expect(reasoningSimilarity(profile(), different).signals.solutionPath).toBe(0);
  });
});

describe("questionsReasoningSimilarity and reasoningNovelty", () => {
  const calcQuestion = (prompt: string): Question =>
    question([part({ capabilityIds: ["cap-1"], prompt, calculationRules: calcRules("/", "*"), learning: partLearning("calculation", ["divide the distance by the time taken"]) }),], { familyId: "fam-1", contextId: "ctx-1", demand: "calculation", expectedMinutes: 3 });

  it("is 1 for the same reasoning in different numbers, and skips parts of other capabilities", () => {
    const source = calcQuestion("calculate the speed when the car travels 10 m in 2 s");
    const reskin = calcQuestion("calculate the speed when the car travels 40 m in 8 s");
    expect(questionsReasoningSimilarity(source, reskin)).toBeCloseTo(1);
    const otherCapability = question([part({ capabilityIds: ["cap-9"], calculationRules: calcRules("/", "*") })]);
    expect(questionsReasoningSimilarity(source, otherCapability)).toBe(0);
  });

  it("novelty is 1 against nothing practised and 0 against an identical question", () => {
    const source = calcQuestion("calculate the speed when the car travels 10 m in 2 s");
    expect(reasoningNovelty(source, [])).toBe(1);
    expect(reasoningNovelty(source, [source])).toBe(0);
    expect(reasoningNovelty(source, [source])).toBeLessThan(1 - REASONING_NOVELTY_FLOOR);
  });
});

describe("isReasoningTransfer", () => {
  const transferSource = question([
    part({
      capabilityIds: ["cap-1"],
      prompt: "a cyclist travels 10 m in 2 s along a flat road. calculate the speed",
      calculationRules: calcRules("/", "*"),
      learning: partLearning("calculation", ["divides the distance by the time taken"]),
    }),
  ]);
  const samePathReskin = question([
    part({
      capabilityIds: ["cap-1"],
      prompt: "a cyclist travels 50 m in 10 s along a flat road. calculate the speed",
      calculationRules: calcRules("/", "*"),
      learning: partLearning("calculation", ["divides the distance by the time taken"]),
    }),
  ]);
  const differentPath = question([
    part({
      capabilityIds: ["cap-1"],
      prompt: "a ball rolls 20 m up a ramp in 4 s. calculate the acceleration along the slope",
      calculationRules: calcRules("*", "/"),
      learning: partLearning("calculation", ["resolves the weight along the slope", "applies newton's second law"]),
    }),
  ]);

  it("rejects a number-swapped reskin that re-runs the identical solution path", () => {
    expect(isReasoningTransfer(transferSource, samePathReskin, "cap-1")).toBe(false);
  });

  it("accepts a candidate that reaches the same capability by a genuinely different path", () => {
    expect(isReasoningTransfer(transferSource, differentPath, "cap-1")).toBe(true);
  });

  it("refuses to judge when either side does not exercise the target capability", () => {
    const otherCapability = question([part({ capabilityIds: ["cap-2"], calculationRules: calcRules("*", "/") })]);
    expect(isReasoningTransfer(transferSource, otherCapability, "cap-1")).toBe(false);
    expect(isReasoningTransfer(transferSource, differentPath, "cap-none")).toBe(false);
  });

  it("keeps the published floor constants distinct (novelty stricter than near-duplicate)", () => {
    expect(REASONING_NOVELTY_FLOOR).toBeLessThan(NEAR_DUPLICATE_SIMILARITY);
  });
});

describe("isNearDuplicateReasoning", () => {
  it("calls two identical-demand profiles near-duplicates at or above the threshold", () => {
    expect(isNearDuplicateReasoning(profile(), profile())).toBe(true);
  });

  it("never merges profiles with different demands, however similar they look", () => {
    expect(isNearDuplicateReasoning(profile(), profile({ demand: "explanation" }))).toBe(false);
  });
});
