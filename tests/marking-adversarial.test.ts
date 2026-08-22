import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { runAdversarialMarkingBenchmark } from "@/domain/marking-adversarial";

// ---------------------------------------------------------------------------
// Adversarial marking benchmark — hostile answers through the shipped marker.
// The fences encode the project's own marking claims; a failure here means
// rubric marking regressed. Synthetic fixtures, NOT human evidence.
// ---------------------------------------------------------------------------

describe("marking adversarial benchmark", () => {
  const report = runAdversarialMarkingBenchmark({ questions: seedQuestions });

  it("produces cases across every adversarial category", () => {
    const ids = report.categories.map((c) => c.id);
    expect(ids).toEqual([
      "fluent-nonsense",
      "irrelevant-but-fluent",
      "keyword-stuffing",
      "keywords-wrong-reasoning",
      "contradictory",
      "mixed-claims",
      "partially-correct",
      "alternative-method",
      "alternative-notation",
      "scientific-notation",
      "significant-figures",
      "valid-method-wrong-answer",
      "unit-mistakes",
      "unusual-phrasing",
      "grammar-errors",
      "student-shorthand",
      "bullet-points",
      "rambling",
      "ambiguous-transcription",
      "spelling-noise",
      "diagram-reference",
    ]);
    for (const category of report.categories) {
      if (["alternative-notation", "scientific-notation", "significant-figures", "valid-method-wrong-answer"].includes(category.id)) {
        continue; // depend on numeric model answers existing in the sampled bank
      }
      expect(category.cases).toBeGreaterThan(0);
    }
    expect(report.totalCases).toBeGreaterThan(150);
  });

  it("is deterministic — identical reports across two runs", () => {
    const again = runAdversarialMarkingBenchmark({ questions: seedQuestions });
    expect(again).toEqual(report);
  }, 180_000);

  it("never awards full marks for fluent nonsense or off-topic fluency", () => {
    for (const id of ["fluent-nonsense", "irrelevant-but-fluent"] as const) {
      const category = report.categories.find((c) => c.id === id)!;
      expect(category.failures, `${id}: ${category.failures.map((f) => f.detail).join("; ")}`).toEqual([]);
      expect(category.meanShareOfMax).toBeLessThan(0.5);
    }
  });

  it("keyword soup never reaches full marks and cannot beat real answers on average", () => {
    const stuffing = report.categories.find((c) => c.id === "keyword-stuffing")!;
    expect(stuffing.failures, stuffing.failures.map((f) => f.detail).join("; ")).toEqual([]);
    if (stuffing.comparisonMean != null) {
      expect(stuffing.meanShareOfMax).toBeLessThanOrEqual(stuffing.comparisonMean + 0.05);
    }
  });

  it("retractions never reach full marks and cannot beat truth on average", () => {
    const contradictory = report.categories.find((c) => c.id === "contradictory")!;
    expect(contradictory.failures, contradictory.failures.map((f) => f.detail).join("; ")).toEqual([]);
    if (contradictory.comparisonMean != null) {
      expect(contradictory.meanShareOfMax).toBeLessThanOrEqual(contradictory.comparisonMean + 0.05);
    }
  });

  it("partial reasoning earns credit without matching the full answer", () => {
    const partial = report.categories.find((c) => c.id === "partially-correct")!;
    expect(partial.failures, partial.failures.map((f) => f.detail).join("; ")).toEqual([]);
    expect(partial.meanShareOfMax).toBeGreaterThan(0);
    expect(partial.meanShareOfMax).toBeLessThan(1);
  });

  it("equivalent notation and spelling noise are not unfairly punished", () => {
    const notation = report.categories.find((c) => c.id === "alternative-notation")!;
    if (notation.cases > 0) {
      expect(notation.failures, notation.failures.map((f) => f.detail).join("; ")).toEqual([]);
    }
    const noise = report.categories.find((c) => c.id === "spelling-noise")!;
    expect(noise.failures, noise.failures.map((f) => f.detail).join("; ")).toEqual([]);
  });

  it("labels itself honestly as synthetic", () => {
    expect(report.note).toContain("Not human evidence");
    expect(report.ok || report.failedCases > 0).toBe(true);
  });
});

describe("fence sensitivity — mutated markers are caught", () => {
  // Mutation-style check: deliberately broken markers must trip fences, or
  // the harness would be decoration that can never fail.
  const sample = seedQuestions.slice(0, 24);

  it("a marker that awards everything fails loudly", () => {
    const generous = runAdversarialMarkingBenchmark({
      questions: sample,
      marker: (q) => ({ awarded: q.totalMarks, max: q.totalMarks }),
    });
    expect(generous.failedCases).toBeGreaterThan(0);
    expect(generous.ok).toBe(false);
  });

  it("a marker that awards nothing fails loudly", () => {
    const stingy = runAdversarialMarkingBenchmark({
      questions: sample,
      marker: () => ({ awarded: 0, max: 1 }),
    });
    expect(stingy.categories.some((c) => c.id === "partially-correct" && c.failed > 0)).toBe(true);
  });
});

describe("performance budget", () => {
  it("marks adversarial cases at interactive speed", () => {
    const start = performance.now();
    const sampled = runAdversarialMarkingBenchmark({ questions: seedQuestions, maxCasesPerCategory: 12 });
    const elapsedMs = performance.now() - start;
    expect(sampled.totalCases).toBeGreaterThan(100);
    // Generous CI headroom: local runs land well under half of this.
    expect(elapsedMs / sampled.totalCases).toBeLessThan(60);
  }, 30_000);
});
