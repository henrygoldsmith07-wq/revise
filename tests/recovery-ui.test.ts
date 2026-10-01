import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("marks recovery surfaces", () => {
  it("shows marks at risk on Readiness and Practice, and leaves Today to the single next-best-action hero", () => {
    expect(read("src/app/readiness/page.tsx")).toContain("<MarksAtRiskPanel />");
    expect(read("src/app/practice/page.tsx")).toContain("<RecoverMarksCard />");
    expect(read("src/app/page.tsx")).not.toContain("RecoverMarksCard");
  });

  it("opens recovery, autopsy and repair sessions from practice URLs, including same-page links", () => {
    const practice = read("src/app/practice/page.tsx");
    expect(practice).toContain('params.get("recover") === "1"');
    expect(practice).toContain('params.get("autopsy")');
    expect(practice).toContain("<RecoverMarksMode");
    expect(practice).toContain("<PaperRepairMode");
    expect(practice).toContain("<PaperAutopsyView");
    expect(practice).toContain("setSeenParams");
  });

  it("puts the autopsy after a paper and keeps it reachable from the papers list", () => {
    const papers = read("src/app/papers/page.tsx");
    expect(papers).toContain("<PaperAutopsyPanel");
    expect(papers).toContain("autopsyHref(latestRun.get(paper.id)!)");
    // The runner must save the paper before following an autopsy link.
    expect(papers).toContain("onNavigate={(href) => void finish(href)}");
  });

  it("ships the specification evidence page and links to it from Readiness", () => {
    expect(read("src/app/readiness/spec/page.tsx")).toContain("SpecificationMapView");
    expect(read("src/app/readiness/page.tsx")).toContain('href="/readiness/spec"');
  });

  it("offers answer improvement only on ordinary practice, never on evidence-bearing modes", () => {
    const runner = read("src/components/QuestionRunner.tsx");
    expect(runner).toContain('improvableAnswers={mode === "practice" && !farTransfer && !retestMistake ? answers : undefined}');
    const marked = read("src/components/QuestionMarkedResult.tsx");
    expect(marked).toContain("improvableAnswers && part");
    expect(marked).toContain('question.kind !== "mcq"');
    const improve = read("src/components/ImproveAnswer.tsx");
    expect(improve).not.toMatch(/recordAttempt|useStore/);
  });
});
