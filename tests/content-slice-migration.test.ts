import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  physicsCapacitorEnergyQuestions,
  physicsCapacitorRcQuestions,
} from "@/content/questions/physics-capacitors.generated";
import { pipelineQuestion } from "@/content/pipeline";
import type { Question } from "@/domain/types";

// The capacitors slice (WJEC Physics capacitance: stored energy + RC
// transients) is authored in src/content/sources/capacitors.json and generated
// into physics-capacitors.generated.ts. These tests pin the migration:
// nothing dropped, nothing altered, source and artefact in sync.
const EXPECTED_ENERGY_SLUGS = [
  "charge-energy-definition", "graph-energy-recall", "why-half-qv", "energy-when-separated",
  "choose-pulse-bank", "usable-voltage-window", "same-energy-half-voltage", "neutral-does-not-mean-empty",
  "infer-capacitance-from-slope", "infer-voltage-from-charge-energy", "charge-sharing-loss",
  "harvester-plate-cycle", "energy-half-life", "capacitor-lift-budget",
];
const EXPECTED_RC_SLUGS = [
  "time-constant", "current-area", "charging-feedback", "meter-loading", "threshold-timer",
  "sampling-window", "one-tau-not-empty", "equal-drops", "log-gradient", "unknown-supply",
  "nonzero-start", "infer-leakage", "resistor-power", "count-transferred-electrons",
];

function slugOf(question: Question): string {
  return question.id.replace(/^cnt:question:physics-(energy|rc)-/, "");
}

describe("capacitors slice migration (JSON source → generated runtime)", () => {
  it("keeps every question with stable ids", () => {
    expect(physicsCapacitorEnergyQuestions).toHaveLength(14);
    expect(physicsCapacitorRcQuestions).toHaveLength(14);
    expect(physicsCapacitorEnergyQuestions.map(slugOf).sort()).toEqual([...EXPECTED_ENERGY_SLUGS].sort());
    expect(physicsCapacitorRcQuestions.map(slugOf).sort()).toEqual([...EXPECTED_RC_SLUGS].sort());
  });

  it("preserves provenance, spec mappings, AO and learning demand", () => {
    for (const question of [...physicsCapacitorEnergyQuestions, ...physicsCapacitorRcQuestions]) {
      expect(question.subjectId).toBe("wjec-alevel-physics");
      expect(question.topicIds).toEqual(["wjec-alevel-physics.capacitance"]);
      expect(question.source).toBe("generated");
      expect(question.verification).toBe("unverified");
      for (const part of question.parts) {
        expect(part.specPointIds?.length).toBeGreaterThan(0);
        expect(part.capabilityIds?.length).toBeGreaterThan(0);
        expect(part.aos?.length).toBeGreaterThan(0);
        expect(part.markScheme.length).toBe(part.marks);
        expect(part.modelAnswer.trim().length).toBeGreaterThan(0);
      }
      expect(question.learning?.demand).toBeTruthy();
      expect(question.learning?.familyId).toBeTruthy();
    }
    // Energy items map to sp-02, RC items to sp-04.
    expect(new Set(physicsCapacitorEnergyQuestions.flatMap((q) => q.parts.flatMap((p) => p.specPointIds ?? [])))).toEqual(
      new Set(["wjec-alevel-physics.capacitance.sp-02"]),
    );
    expect(new Set(physicsCapacitorRcQuestions.flatMap((q) => q.parts.flatMap((p) => p.specPointIds ?? [])))).toEqual(
      new Set(["wjec-alevel-physics.capacitance.sp-04"]),
    );
  });

  it("passes every generated question through the content pipeline", () => {
    for (const question of [...physicsCapacitorEnergyQuestions, ...physicsCapacitorRcQuestions]) {
      const result = pipelineQuestion(question);
      expect(result.schemaIssues, question.id).toEqual([]);
      expect(result.mappingIssues, question.id).toEqual([]);
    }
  });

  it("keeps the generated artefact in sync with the JSON source", () => {
    const out = execFileSync("node", ["scripts/generate-content.mjs", "capacitors", "--check"], { encoding: "utf8" });
    expect(out).toMatch(/in sync/);
    const source = JSON.parse(readFileSync(join(process.cwd(), "src/content/sources/capacitors.json"), "utf8")) as {
      groups: Array<{ items: unknown[] }>;
    };
    expect(source.groups.flatMap((g) => g.items)).toHaveLength(28);
  });
});
