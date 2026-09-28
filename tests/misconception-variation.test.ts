import { describe, expect, it } from "vitest";
import { checkMisconceptionIntegrity, findDuplicateMisconceptions, repairCopyFor } from "@/domain/misconception-integrity";
import { detectShallowVariants, demandDiversity } from "@/domain/content-variation";
import type { Misconception, Question, Topic } from "@/domain/types";

function misconception(id: string, statement: string, topicIds: string[] = ["t1"]): Misconception {
  return {
    id, subjectId: "wjec-alevel-physics", topicIds,
    statement, explanation: "Correct distinction.", example: "Student writes X.",
    correction: "Write Y instead.", source: "authored",
    verification: "checked", reviewer: null, lastChecked: "2026-08-01",
  };
}

function question(id: string, stem: string, family: string, moves: string[] = ["apply formula"], scheme = ["point a"]): Question {
  return {
    id, subjectId: "wjec-alevel-physics", topicIds: ["t1"], kind: "structured",
    stem, parts: [{
      id: `${id}-p`, label: "a", prompt: stem, marks: 1, markScheme: scheme,
      modelAnswer: `Model for ${stem}`, specPointIds: ["sp1"], capabilityIds: ["cap1"],
      learning: { familyId: family, contextId: `ctx-${family}`, demand: "application", reasoningMoves: moves },
    }],
    totalMarks: 1, calculatorAllowed: true, difficulty: 3, origin: "seed",
    source: "authored", verification: "unverified", specPointIds: ["sp1"],
    createdAt: "2026-01-01T00:00:00.000Z",
  } as Question;
}

describe("misconception integrity", () => {
  it("flags duplicate wording instead of silently doubling coverage", () => {
    const entries = [misconception("m1", "Current is used up in a circuit."), misconception("m2", "Current is used up in a circuit!")];
    expect(findDuplicateMisconceptions(entries).map((i) => i.misconceptionId)).toEqual(["m2"]);
  });

  it("flags missing repair, unreachable topics and missing diagnostic/transfer links", () => {
    const topics: Topic[] = [{ id: "t1", subjectId: "wjec-alevel-physics", unitId: "u1", title: "T", order: 1, intrinsicDifficulty: 2, summary: "s", keyPoints: ["k"], commonErrors: ["e"] }];
    const questions = [question("q1", "Stem one", "fam-1")];
    const noRepair = { ...misconception("m1", "Idea one"), correction: "  ", explanation: "" };
    const issues = checkMisconceptionIntegrity({ entries: [noRepair], topics, questions });
    expect(issues.some((i) => i.kind === "missing-repair")).toBe(true);
    expect(issues.some((i) => i.kind === "missing-diagnostic-link")).toBe(true);
    expect(issues.some((i) => i.kind === "missing-transfer-link")).toBe(true);
    const orphan = checkMisconceptionIntegrity({
      entries: [misconception("m2", "Idea two", ["missing-topic"])],
      topics, questions,
    });
    expect(orphan.some((i) => i.kind === "unreachable-topic")).toBe(true);
  });

  it("grounds repair copy in the library entry", () => {
    const copy = repairCopyFor(misconception("m1", "Idea"));
    expect(copy.body).toContain("Write Y instead");
  });
});

describe("content variation", () => {
  it("flags number-swaps, duplicated schemes and similar model answers", () => {
    const a = question("qa", "A trolley of mass 2 kg accelerates at 3 m/s^2. Find force.", "fam-a", ["apply newton second law"], ["F=ma"]);
    const b = question("qb", "A trolley of mass 5 kg accelerates at 7 m/s^2. Find force.", "fam-a", ["apply newton second law"], ["F=ma"]);
    const issues = detectShallowVariants([a, b]);
    expect(issues.some((i) => i.kind === "numerical-template" || i.kind === "near-duplicate")).toBe(true);
    expect(issues.some((i) => i.kind === "duplicate-mark-scheme")).toBe(true);
  });

  it("flags same reasoning path counted as independent families", () => {
    const a = question("qa", "Explain how a capacitor stores energy in a circuit context alpha beta gamma.", "fam-a", ["relate energy to capacitance"]);
    const b = question("qb", "Describe energy storage by a capacitor in a device context alpha beta gamma delta.", "fam-b", ["relate energy to capacitance"]);
    const issues = detectShallowVariants([a, b]);
    expect(issues.some((i) => i.kind === "same-reasoning-path")).toBe(true);
  });

  it("measures demand diversity from authored metadata, not scores", () => {
    const qs = [
      { ...question("q1", "Recall stem", "fam-1", ["recall definition"]), parts: [{ id: "q1-p", label: "a", prompt: "Recall", marks: 1, markScheme: ["x"], modelAnswer: "y", specPointIds: ["sp1"], learning: { familyId: "fam-1", contextId: "c1", demand: "recall" as const, reasoningMoves: ["recall"] } }] },
      { ...question("q2", "Apply stem", "fam-2", ["apply"]), parts: [{ id: "q2-p", label: "a", prompt: "Apply", marks: 1, markScheme: ["x"], modelAnswer: "y", specPointIds: ["sp1"], learning: { familyId: "fam-2", contextId: "c2", demand: "application" as const, reasoningMoves: ["apply"] } }] },
    ] as unknown as Question[];
    const diversity = demandDiversity("sp1", qs);
    expect(diversity.demands.sort()).toEqual(["application", "recall"]);
    expect(diversity.weak).toBe(false);
    const single = demandDiversity("sp1", [qs[0]!]);
    expect(single.weak).toBe(true);
  });
});
