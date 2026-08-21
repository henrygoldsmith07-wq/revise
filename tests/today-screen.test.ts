import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const page = () => readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
const recommendation = () => readFileSync(join(process.cwd(), "src/components/RecommendationCard.tsx"), "utf8");

describe("Today screen", () => {
  it("keeps one next step and a compact status rail above secondary navigation", () => {
    const source = page();
    expect(source).toContain('<RecommendationCard recommendation={primary} variant="primary" compact />');
    expect(source).toContain('aria-label="Today status"');
    expect(source).toContain('aria-label="Today follow-up"');
    expect(source).toContain('href="/planner"');
    expect(source).toContain('href="/progress"');
    expect(source).not.toContain("ExpectedMarksCard");
    expect(source).not.toContain('title="Other options"');
  });

  it("keeps the short-session entry points visible without competing cards", () => {
    const source = page();
    expect(source).toContain('href="/practice?quick=5"');
    expect(source).toContain('href="/practice?quick=10"');
    expect(source).toContain('aria-label="I have 5 minutes"');
    expect(source).toContain('aria-label="I have 10 minutes"');
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
    expect(source).not.toContain("Score ≈ gain × urgency");
    expect(source).not.toContain("Estimated recoverable marks");
  });
});
