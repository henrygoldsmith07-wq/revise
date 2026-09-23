import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("Timed-run prescription — TechniqueSignal", () => {
  const component = () => src("src/components/TechniqueSignal.tsx");

  it("offers a time-boxed run only when the recommendation exists (answering verdict)", () => {
    const source = component();
    expect(source).toContain("timedSessionRecommendation");
    expect(source).toContain("timedRun");
    expect(source).toContain("/practice?quick=${timedRun.minutes}");
  });

  it("names the session length and question count in the CTA", () => {
    const source = component();
    expect(source).toContain("{timedRun.headline}");
    expect(source).toContain("{timedRun.rationale}");
    expect(source).toContain("Start the {timedRun.minutes}-minute timed run");
  });
});

describe("Knowledge-vs-answering split — Knowledge map subject header", () => {
  const component = () => src("src/components/KnowledgeMap.tsx");
  const page = () => src("src/app/library/page.tsx");

  it("threads the technique report from the Library page into the map", () => {
    expect(page()).toContain('import { knowledgeVsAnswering } from "@/domain/exam-technique";');
    expect(page()).toContain("<KnowledgeMap graph={subjectGraph} technique={technique} />");
  });

  it("renders the split in the specification node only when losses exist", () => {
    const source = component();
    expect(source).toContain("Knowledge vs answering");
    expect(source).toContain("technique.mistakes > 0");
    expect(source).toContain('aria-label={`Knowledge ${techniquePct.k}% of lost marks, answering ${techniquePct.a}%`}');
  });

  it("keeps the header honest when the split is too early to call", () => {
    const source = component();
    expect(source).toContain("the split firms up as marked");
    expect(source).toContain('technique.reliable ?');
  });

  it("never renders colour alone — the split carries an accessible label", () => {
    const source = component();
    expect(source).toContain('role="img"');
    expect(source).toContain("aria-label=");
  });
});
