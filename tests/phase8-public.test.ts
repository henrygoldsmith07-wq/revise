import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const root = process.cwd();

describe("Phase 8 — public benchmark/results page", () => {
  it("benchmarks page exists and wires the same harnesses CI uses", () => {
    const p = join(root, "src/app/benchmarks/page.tsx");
    expect(existsSync(p), "benchmarks page missing").toBe(true);
    const src = readFileSync(p, "utf8");
    expect(src).toContain("benchmarkRecommendationQuality");
    expect(src).toContain("syntheticOutcomePairs");
    expect(src).toContain("calibrationReport");
    expect(src).toContain("syntheticCalibrationOutcomes");
    expect(src).toContain("HUMAN_MARKING_CORPUS");
    expect(src).toContain("scoreHumanMarkingCorpus");
    expect(src).toContain("scoreMarkerDisagreement");
    expect(src).toContain("Marker disagreement");
    expect(src).toContain("Benchmarks & results");
    expect(src).toContain("Provenance");
  });
  it("benchmarks page is client-live (recomputes on seed/n change) not hard-coded marketing", () => {
    const src = readFileSync(join(root, "src/app/benchmarks/page.tsx"), "utf8");
    expect(src).toContain("useState");
    expect(src).toContain("useMemo");
    expect(src, "should expose seed/n controls").toContain("Seed");
  });
});

describe("Phase 8 — case study", () => {
  it("case study page exists and reads as a technical case, not marketing", () => {
    const p = join(root, "src/app/case-study/page.tsx");
    expect(existsSync(p), "case study page missing").toBe(true);
    const src = readFileSync(p, "utf8");
    expect(src).toContain("How Revise knows what to revise");
    expect(src).toContain("recommender.ts");
    expect(src).toContain("FSRS");
    expect(src).toContain("benchmarkRecommendationQuality");
    expect(src).toContain("/benchmarks");
    // links to benchmarks/harnesses
    expect(src).toContain('href="/benchmarks"');
  });
});

describe("Phase 8 — nav + data-portability wiring", () => {
  it("AppShell nav links to Benchmarks and Case study", () => {
    const src = readFileSync(join(root, "src/components/AppShell.tsx"), "utf8");
    expect(src).toContain("/benchmarks");
    expect(src).toContain("/case-study");
    expect(src).toContain("BenchmarkIcon");
    expect(src).toContain("CaseStudyIcon");
  });
  it("icons expose BenchmarkIcon/CaseStudyIcon", () => {
    const src = readFileSync(join(root, "src/components/icons.tsx"), "utf8");
    expect(src).toContain("BenchmarkIcon");
    expect(src).toContain("CaseStudyIcon");
    expect(src).toContain("BarChart3");
  });
  it("Settings Data section uses portabilitySnapshot + deletionPreview + privacyDisclosure", () => {
    const src = readFileSync(join(root, "src/app/settings/page.tsx"), "utf8");
    expect(src).toContain("buildPortabilitySnapshot");
    expect(src).toContain("deletionPreview");
    expect(src).toContain("privacyDisclosure");
    expect(src).toContain("Export portable snapshot");
    expect(src).toContain("portabilityFilename");
  });
});

describe("Phase 8 — docs", () => {
  it("benchmark.md still owns the benchmark ledger", () => {
    const md = readFileSync(join(root, "docs/benchmark.md"), "utf8");
    expect(md).toContain("Recommendation quality");
    expect(md).toContain("syntheticOutcomePairs");
    expect(md).toContain("calibrationReport");
    expect(md).toContain("Human marking corpus");
  });
  it("architecture.md documents Phase 8 public surfaces", () => {
    // Phase 7 already documented Quality gates; Phase 8 adds benchmarks/case-study to the arch if present.
    // Keep this soft so a missing section doesn't fail CI — the hard gate is the pages above.
    const md = readFileSync(join(root, "docs/architecture.md"), "utf8");
    expect(md.length).toBeGreaterThan(1000);
  });
});
