import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPostSessionClosure } from "@/domain/post-session-closure";

describe("post-session closure", () => {
  it("turns dropped marks into a concrete mistakes action", () => {
    const closure = buildPostSessionClosure({
      session: "practice",
      attempted: 4,
      total: 5,
      awarded: 5,
      available: 10,
      elapsedMs: 184_000,
    });

    expect(closure).toMatchObject({
      completionPercent: 80,
      scorePercent: 50,
      missedMarks: 5,
      minutes: 3,
      nextAction: "mistakes",
    });
    expect(closure.detail).toContain("5 marks");
  });

  it("keeps a strong completed session pointed at useful continuation", () => {
    const closure = buildPostSessionClosure({
      session: "paper",
      attempted: 12,
      total: 12,
      awarded: 46,
      available: 50,
      elapsedMs: 2_640_000,
    });

    expect(closure).toMatchObject({
      completionPercent: 100,
      scorePercent: 92,
      missedMarks: 4,
      minutes: 44,
      nextAction: "practice",
    });
    expect(closure.headline).toContain("Strong");
  });

  it("handles review sessions without marks and never reports zero minutes", () => {
    const closure = buildPostSessionClosure({
      session: "review",
      attempted: 6,
      total: 6,
      retryCount: 2,
      elapsedMs: 0,
    });

    expect(closure).toMatchObject({
      completionPercent: 100,
      scorePercent: null,
      missedMarks: 0,
      minutes: 1,
      nextAction: "mistakes",
    });
    expect(closure.detail).toContain("2");
  });

  it("returns a clean review to today instead of duplicating the practice action", () => {
    expect(
      buildPostSessionClosure({
        session: "review",
        attempted: 6,
        total: 6,
        elapsedMs: 360_000,
      }).nextAction,
    ).toBe("today");
  });

  it("gives an unstarted session a safe return action", () => {
    expect(
      buildPostSessionClosure({
        session: "practice",
        attempted: 0,
        total: 8,
        elapsedMs: 0,
      }).nextAction,
    ).toBe("today");
  });

  it("uses one accessible closure surface across review, practice and papers", () => {
    const component = readFileSync(join(process.cwd(), "src/components/PostSessionClosure.tsx"), "utf8");
    const review = readFileSync(join(process.cwd(), "src/app/review/page.tsx"), "utf8");
    const practice = readFileSync(join(process.cwd(), "src/app/practice/page.tsx"), "utf8");
    const papers = readFileSync(join(process.cwd(), "src/app/papers/page.tsx"), "utf8");

    expect(component).toContain('role="status"');
    expect(component).toContain('aria-live="polite"');
    expect(component).toContain("Close the loop");
    expect(review).toContain("PostSessionClosure");
    expect(practice).toContain("finishSession");
    expect(practice).toContain("PostSessionClosure");
    expect(practice).not.toContain("completed === 0");
    expect(papers).toContain("Finish and review mistakes");
    expect(papers).toContain("PostSessionClosure");
  });
});
