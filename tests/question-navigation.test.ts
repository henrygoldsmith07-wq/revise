import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("question navigation", () => {
  it("provides numbered, keyboard-friendly navigation with draft status", () => {
    const navigator = readFileSync(join(process.cwd(), "src/components/QuestionNavigator.tsx"), "utf8");

    expect(navigator).toContain('aria-label="Question navigation"');
    expect(navigator).toContain('"step"');
    expect(navigator).toContain("Draft saved");
    expect(navigator).toContain("answered");
    expect(navigator).toContain("onSelect");
  });

  it("wires draft restoration and navigation into both question flows", () => {
    const runner = readFileSync(join(process.cwd(), "src/components/QuestionRunner.tsx"), "utf8");
    const practice = readFileSync(join(process.cwd(), "src/app/practice/page.tsx"), "utf8");
    const papers = readFileSync(join(process.cwd(), "src/app/papers/page.tsx"), "utf8");

    expect(runner).toContain("QuestionDraft");
    expect(runner).toContain("onDraftChange");
    expect(practice).toContain("QuestionNavigator");
    expect(practice).toContain("questionDrafts");
    expect(papers).toContain("QuestionNavigator");
    expect(papers).toContain("questionDrafts");
  });
});
