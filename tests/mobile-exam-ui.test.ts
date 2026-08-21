import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("mobile exam UI contracts", () => {
  it("keeps question content readable and answer controls touchable", () => {
    const runner = read("src/components/QuestionRunner.tsx");
    const examQuestion = read("src/components/ExamConditionMode.tsx");
    const answerInput = read("src/components/AnswerInput.tsx");

    for (const source of [runner, examQuestion]) {
      expect(source).toContain("text-base leading-7");
      expect(source).toContain("min-h-12");
      expect(source).toContain("flex-1 min-w-0");
      expect(source).toContain("w-full min-h-11");
    }
    expect(answerInput).toContain("text-base leading-6");
    expect(answerInput).toContain("min-h-10");
    expect(answerInput).toContain("sm:ml-auto");
  });

  it("stacks practice filters and keeps question navigation side by side", () => {
    const practice = read("src/app/practice/page.tsx");

    expect(practice).toContain("grid grid-cols-1 sm:flex sm:flex-wrap");
    expect(practice).toContain("grid grid-cols-2 gap-2");
    expect(practice).toContain("w-full sm:w-auto");
  });

  it("keeps paper actions usable on narrow screens", () => {
    const papers = read("src/app/papers/page.tsx");

    expect(papers).toContain("flex flex-col gap-3 sm:flex-row sm:items-center");
    expect(papers).toContain("grid grid-cols-1 sm:flex");
    expect(papers).toContain("sticky top-14 lg:top-0");
  });

  it("keeps timed-session controls reachable while scrolling", () => {
    const exam = read("src/components/ExamConditionMode.tsx");
    const sprint = read("src/components/QuickSessionMode.tsx");

    for (const source of [exam, sprint]) {
      expect(source).toContain("sticky top-14 lg:top-0");
      expect(source).toContain("grid grid-cols-2 gap-2");
      expect(source).toContain("flex flex-col-reverse sm:flex-row");
      expect(source).toContain("min-h-11");
    }
  });
});
