import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { MIN_OUTLOOK_ATTEMPTS, outlookRows, percentBand } from "@/domain/exam-outlook";
import type { GradePrediction } from "@/domain/grades";
import type { Attempt } from "@/domain/types";

function prediction(overrides: Partial<GradePrediction> = {}): GradePrediction {
  return {
    subjectId: "aqa-alevel-biology",
    percent: 60,
    grade: "B",
    bestCase: "A",
    worstCase: "C",
    confidence: 0.5,
    trend: 0,
    headroom: [],
    ...overrides,
  };
}

function attempt(subjectId: string, max: number, awarded = max): Attempt {
  return {
    id: `a-${subjectId}-${max}-${awarded}-${Math.random()}`,
    userId: "u1",
    questionId: "q1",
    subjectId,
    topicIds: ["t1"],
    answers: {},
    marked: [],
    awarded,
    max,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 1000,
    mode: "practice",
    createdAt: "2026-09-01T10:00:00Z",
  };
}

describe("exam outlook — live percent band", () => {
  it("uses the same confidence half-width the weekly grade log persists", () => {
    // confidence 0.5 -> half = 25 points each side.
    expect(percentBand(prediction({ percent: 60, confidence: 0.5 }))).toEqual({ low: 35, high: 85 });
    // High confidence is a tight band, still centred.
    expect(percentBand(prediction({ percent: 60, confidence: 0.9 }))).toEqual({ low: 55, high: 65 });
  });

  it("clamps the band inside 0–100", () => {
    expect(percentBand(prediction({ percent: 90, confidence: 0.4 }))).toEqual({ low: 60, high: 100 });
    expect(percentBand(prediction({ percent: 8, confidence: 0.4 }))).toEqual({ low: 0, high: 38 });
  });

  it("counts only marked answers as evidence", () => {
    const rows = outlookRows(
      [prediction()],
      [
        attempt("aqa-alevel-biology", 3, 2), // marked
        attempt("aqa-alevel-biology", 0, 0), // not marked -> ignored
        attempt("aqa-alevel-chemistry", 5), // other subject
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.attempts).toBe(1);
  });

  it("exposes the evidence gate the UI uses before claiming a score", () => {
    expect(MIN_OUTLOOK_ATTEMPTS).toBeGreaterThan(0);
    const rows = outlookRows([prediction()], [attempt("aqa-alevel-biology", 3)]);
    expect(rows[0]?.attempts).toBeLessThan(MIN_OUTLOOK_ATTEMPTS + 1);
  });

  it("returns one row per predicted subject, carrying the band", () => {
    const rows = outlookRows(
      [prediction({ subjectId: "aqa-alevel-biology" }), prediction({ subjectId: "aqa-alevel-chemistry", percent: 48 })],
      [attempt("aqa-alevel-biology", 3, 2), attempt("aqa-alevel-chemistry", 4, 3)],
    );
    expect(rows.map((r) => r.subjectId)).toEqual(["aqa-alevel-biology", "aqa-alevel-chemistry"]);
    for (const row of rows) {
      expect(row.low).toBeLessThanOrEqual(row.high);
      expect(row.high).toBeLessThanOrEqual(100);
      expect(row.low).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("Today — exam outlook wiring", () => {
  const page = () => readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
  const component = () => readFileSync(join(process.cwd(), "src/components/ExamOutlook.tsx"), "utf8");

  it("renders the outlook on both the due and fallback branches of Today", () => {
    const source = page();
    expect(source).toContain("ExamOutlook");
    // One for the due-session branch, one for the nothing-due branch.
    expect(source.match(/<ExamOutlook/g) ?? []).toHaveLength(2);
  });

  it("is honest: it refuses to show a number without marked evidence", () => {
    const src = component();
    expect(src).toContain("MIN_OUTLOOK_ATTEMPTS");
    expect(src).toContain("no honest score can be guessed");
    expect(src).toContain("you&apos;re most likely to score");
    // Derives from live store predictions — nothing cached or manual.
    expect(src).toContain("outlookRows(predictions, attempts)");
  });
});