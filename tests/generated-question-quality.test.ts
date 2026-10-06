import { describe, expect, it } from "vitest";
import {
  assessGeneratedQuestion,
  gateGeneratedQuestions,
  generatedProvenanceIsHonest,
  withGeneratedProvenance,
} from "@/domain/generated-question-quality";
import { trustTier } from "@/domain/trust-label";
import type { Question, Topic } from "@/domain/types";

const SUBJECT = "wjec-alevel-physics";

const topic: Pick<Topic, "title" | "summary" | "keyPoints"> = {
  title: "Electric circuits",
  summary: "Current, potential difference and resistance in circuits; the resistance of a filament lamp increases with temperature.",
  keyPoints: [
    "Resistance increases as temperature rises in a filament lamp",
    "Current is inversely proportional to resistance for a fixed potential difference",
  ],
};

function generated(overrides: Partial<Question> = {}): Question {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    subjectId: SUBJECT,
    topicIds: ["circuits"],
    kind: "short",
    stem: "A filament lamp is connected to a fixed potential difference and warms up.",
    parts: [
      {
        id: "p1",
        label: "",
        prompt: "Explain why the current through the filament lamp decreases as it warms up.",
        marks: 2,
        markScheme: [
          "resistance increases as temperature rises",
          "current decreases because current is inversely proportional to resistance",
        ],
        modelAnswer:
          "The resistance increases as temperature rises, so the current decreases because current is inversely proportional to resistance.",
      },
    ],
    totalMarks: 2,
    calculatorAllowed: true,
    difficulty: 3,
    origin: "ai",
    createdAt: "2026-10-07T00:00:00.000Z",
    ...overrides,
  };
}

const gate = (question: Question, origin: "generated" | "extracted" = "generated", existing: Question[] = []) =>
  assessGeneratedQuestion({ question: withGeneratedProvenance(question, origin), origin, topic, existing });

const failed = (result: ReturnType<typeof gate>) => result.gates.filter((g) => !g.passed).map((g) => g.id);

describe("generated questions — deterministic quality gates", () => {
  it("accepts a well-formed, on-topic question whose model answer earns its marks", () => {
    const result = gate(generated());
    expect(result.decision).not.toBe("reject");
    expect(failed(result)).not.toEqual(expect.arrayContaining(["mark-allocation", "model-answer-coverage", "duplicate", "provenance", "spec-alignment"]));
  });

  it("rejects inconsistent mark allocation", () => {
    expect(failed(gate(generated({ totalMarks: 5 })))).toContain("mark-allocation");
    expect(gate(generated({ totalMarks: 5 })).decision).toBe("reject");
    const threeMarks = generated();
    threeMarks.parts = [{ ...threeMarks.parts[0]!, marks: 3 }];
    threeMarks.totalMarks = 3;
    expect(gate(threeMarks).decision).toBe("reject");
  });

  it("rejects a model answer that does not earn its own marks", () => {
    const q = generated();
    q.parts = [{ ...q.parts[0]!, modelAnswer: "Not sure, it just changes." }];
    const result = gate(q);
    expect(failed(result)).toContain("model-answer-coverage");
    expect(result.decision).toBe("reject");
  });

  it("rejects a calculation whose model answer contradicts its mark scheme", () => {
    const q = generated({ kind: "calculation", stem: "A 2 A current flows through a 3 Ω resistor." });
    q.parts = [{ id: "p1", label: "", prompt: "Calculate the potential difference across the resistor.", marks: 2, markScheme: ["V = IR", "6 V"], modelAnswer: "V = IR = 2 × 3 = 12 V" }];
    const result = gate(q);
    expect(failed(result)).toContain("numerical-consistency");
    expect(result.decision).toBe("reject");
  });

  it("rejects reworded duplicates of the bank, including number swaps", () => {
    const bank = generated({ id: "existing", stem: "A filament lamp is connected to a fixed potential difference of 12 V and warms up." });
    const result = gate(generated({ stem: "A filament lamp is connected to a fixed potential difference of 6 V and warms up." }), "generated", [bank]);
    expect(failed(result)).toContain("duplicate");
    expect(result.decision).toBe("reject");
  });

  it("checks difficulty metadata", () => {
    expect(gate(generated({ difficulty: 0 as unknown as Question["difficulty"] })).decision).toBe("reject");
    const big = generated({ difficulty: 1 });
    big.parts = [{ ...big.parts[0]!, marks: 8, markScheme: Array.from({ length: 8 }, (_, i) => `${big.parts[0]!.markScheme[i % 2]} ${i}`) }];
    big.totalMarks = 8;
    expect(failed(gate(big))).toContain("difficulty-metadata");
  });

  it("rejects off-topic generated questions but only warns for heuristically mapped extractions", () => {
    const offTopic = generated({ stem: "Describe the causes of the French Revolution." });
    offTopic.parts = [{
      id: "p1",
      label: "",
      prompt: "Describe two causes of the French Revolution.",
      marks: 2,
      markScheme: ["taxation of the third estate", "bread shortages in Paris"],
      modelAnswer: "Taxation of the third estate and bread shortages in Paris caused unrest.",
    }];
    expect(failed(gate(offTopic))).toContain("spec-alignment");
    expect(gate(offTopic).decision).toBe("reject");
    expect(gate(offTopic, "extracted").decision).not.toBe("reject");
  });

  it("rejects malformed multiple-choice questions", () => {
    const mcq = generated({ kind: "mcq", options: ["A", "B", "C"], correctIndex: 5 });
    mcq.parts = [{ id: "p1", label: "", prompt: "Which is the unit of resistance?", marks: 1, markScheme: ["ohm"], modelAnswer: "ohm" }];
    mcq.totalMarks = 1;
    expect(failed(gate(mcq))).toContain("mark-allocation");
  });
});

describe("generated questions — provenance can never become trust", () => {
  it("pins generated and extracted content to unverified machine output", () => {
    const g = withGeneratedProvenance(generated(), "generated");
    expect(g).toMatchObject({ origin: "ai", source: "generated", verification: "unverified" });
    expect(generatedProvenanceIsHonest(g, "generated")).toBe(true);
    const e = withGeneratedProvenance(generated({ origin: "past-paper" }), "extracted");
    expect(e).toMatchObject({ origin: "past-paper", source: "import", verification: "unverified" });
  });

  it("strips any trust a model or caller tried to attach, so the question is never 'trusted'", () => {
    const forged = generated({
      verification: "verified",
      reviewer: "someone",
      humanVerification: { status: "approved", reviewerId: "r1", reviewedAt: "2026-10-01T00:00:00.000Z" } as unknown as Question["humanVerification"],
      paperProvenance: { status: "verified" } as unknown as Question["paperProvenance"],
    });
    const { accepted } = gateGeneratedQuestions({ questions: [forged], origin: "generated", topicFor: () => topic, bank: [], checkedAt: "2026-10-07T00:00:00.000Z" });
    expect(accepted).toHaveLength(1);
    const saved = accepted[0]!;
    expect(saved.verification).toBe("unverified");
    expect(saved.humanVerification).toBeUndefined();
    expect(saved.reviewer).toBeUndefined();
    expect(saved.paperProvenance).toBeUndefined();
    expect(saved.generationQuality).toMatchObject({ origin: "generated", version: "generated-quality-v1" });
    expect(trustTier(saved)).not.toBe("trusted");
  });

  it("the provenance gate refuses content that claims review it has not had", () => {
    const claimed = { ...withGeneratedProvenance(generated(), "generated"), verification: "verified" as const };
    const result = assessGeneratedQuestion({ question: claimed, origin: "generated", topic, existing: [] });
    expect(result.decision).toBe("reject");
    expect(result.gates.find((g) => g.id === "provenance")!.passed).toBe(false);
  });

  it("de-duplicates within a batch and never saves rejected questions", () => {
    const a = generated();
    const b = generated({ id: "second" });
    const { accepted, rejected } = gateGeneratedQuestions({ questions: [a, b], origin: "generated", topicFor: () => topic, bank: [], checkedAt: "2026-10-07T00:00:00.000Z" });
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.quality.gates.find((g) => g.id === "duplicate")!.passed).toBe(false);
  });
});
