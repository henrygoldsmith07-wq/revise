import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const page = () => readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
const recommendation = () => readFileSync(join(process.cwd(), "src/components/RecommendationCard.tsx"), "utf8");

describe("Today screen", () => {
  it("leads with Next Best Action as the hero", () => {
    const source = page();
    expect(source).toContain("NextBestAction");
    expect(source).toContain("Your next");
    expect(source).toContain("Start →");
    // Queue shows what comes after
    expect(source).toContain("After this:");
  });

  it("keeps a minimal status strip below the fold", () => {
    const source = page();
    expect(source).toContain("due");
    expect(source).toContain("streak");
    expect(source).toContain("mistakes open");
  });

  it("shows why-this reasons from structured factors", () => {
    const source = page();
    expect(source).toContain("Why this?");
    expect(source).toContain("recoverableMarks");
    expect(source).toContain("daysToExam");
  });

  it("does not compete with secondary cards", () => {
    const source = page();
    expect(source).not.toContain("ExpectedMarksCard");
    expect(source).not.toContain('title="Other options"');
    expect(source).not.toContain("Need less time?");
  });

  it("allows the recommendation detail disclosure to be compact on Today", () => {
    const source = recommendation();
    expect(source).toContain("compact?: boolean");
    expect(source).toContain('compact ? "Next step" : "Recommended now"');
    expect(source).toContain("if (compact)");
  });

  it("explains the recommendation in plain English before exposing scoring detail", () => {
    const source = recommendation();
    expect(source).toContain("Why this?");
    expect(source).toContain("Show scoring detail");
    expect(source).toContain("The rank weighs expected marks, exam timing, weakness, fading recall and evidence depth");
    expect(source).toContain("limited marked evidence");
  });
});
