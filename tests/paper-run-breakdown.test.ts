import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildPaperRunBreakdown } from "@/domain/paper-run-breakdown";
import { UNIT_MOCK_GRADE_NOTE, type UnitMock } from "@/domain/unit-mock";
import { PaperBreakdown } from "@/components/PaperBreakdown";
import { UnitMockList } from "@/components/UnitMockPanel";
import type { Attempt, Question } from "@/domain/types";

function q(id: string, topicIds: string[], totalMarks: number): Question {
  return {
    id,
    subjectId: "s",
    topicIds,
    kind: "structured",
    stem: id,
    parts: [],
    totalMarks,
    calculatorAllowed: true,
    difficulty: 3,
    origin: "seed",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function attempt(questionId: string, awarded: number, max: number, elapsedMs: number, answer = "an answer", provisional = false): Attempt {
  return {
    id: `a-${questionId}`,
    userId: "u",
    questionId,
    subjectId: "s",
    topicIds: [],
    answers: { [`${questionId}.a`]: answer },
    marked: [],
    awarded,
    max,
    feedback: "",
    markedBy: "rubric",
    elapsedMs,
    mode: "paper",
    createdAt: "2026-10-27T10:00:00.000Z",
    ...(provisional ? { markAssessment: { provisional: true } } : {}),
  } as Attempt;
}

const TITLES: Record<string, string> = { "s.kin": "Kinematics", "s.energy": "Energy", "s.mat": "Materials" };
const title = (id: string) => TITLES[id] ?? id;

// An 80-mark, 90-minute paper: 1.125 minutes (67.5 s) per mark.
const QUESTIONS = [q("q1", ["s.kin"], 10), q("q2", ["s.energy"], 20), q("q3", ["s.kin", "s.mat"], 20), q("q4", ["s.mat"], 30)];

describe("buildPaperRunBreakdown", () => {
  const attempts = [
    attempt("q1", 10, 10, 5 * 60_000),
    attempt("q2", 8, 20, 40 * 60_000),
    attempt("q3", 10, 20, 20 * 60_000, "x", true),
    attempt("q4", 0, 30, 0, "   "),
  ];
  const breakdown = buildPaperRunBreakdown({ questions: QUESTIONS, attempts, durationMinutes: 90, usedMs: 90 * 60_000, topicTitle: title });

  it("times each question against the paper's own pace", () => {
    expect(breakdown.minutesPerMark).toBeCloseTo(1.125);
    expect(breakdown.rows.map((row) => Math.round(row.budgetMs / 1000))).toEqual([675, 1350, 1350, 2025]);
    // q2: 40 min against a 22.5 min budget is over; q3: 20 min against 22.5 is not.
    expect(breakdown.rows.map((row) => row.overBudget)).toEqual([false, true, false, false]);
    expect(breakdown.overBudgetCount).toBe(1);
    expect(breakdown.overBudgetMinutes).toBe(18);
  });

  it("finds blank answers and provisional marks", () => {
    expect(breakdown.rows.map((row) => row.blank)).toEqual([false, false, false, true]);
    expect(breakdown.blankMarks).toBe(30);
    expect(breakdown.rows[2].provisional).toBe(true);
    expect(breakdown.rows[2].topicLabel).toBe("Kinematics · Materials");
  });

  it("splits shared questions across topics and ranks topics by marks lost", () => {
    expect(breakdown.topics.map((topic) => [topic.title, topic.awarded, topic.max, topic.lost])).toEqual([
      ["Materials", 5, 40, 35],
      ["Energy", 8, 20, 12],
      ["Kinematics", 15, 20, 5],
    ]);
    expect(breakdown.focusTopics.map((topic) => topic.topicId)).toEqual(["s.mat", "s.energy", "s.kin"]);
    expect(breakdown.awarded).toBe(28);
    expect(breakdown.max).toBe(80);
  });

  it("explains the pacing problem, blanks first, and spots a blank ending", () => {
    expect(breakdown.findings[0]).toMatch(/^1 question was left blank, 30 marks you could not score, including the end of the paper/);
    expect(breakdown.findings[1]).toMatch(/1 question took well over its time budget \(about 1\.1 min per mark\), 18 minutes over in total\./);
  });

  it("says when time was left on the table and when pace held", () => {
    const early = buildPaperRunBreakdown({
      questions: QUESTIONS,
      attempts: QUESTIONS.map((question) => attempt(question.id, 1, question.totalMarks, 60_000)),
      durationMinutes: 90,
      usedMs: 30 * 60_000,
      topicTitle: title,
    });
    expect(early.findings).toEqual(["You finished with 60 minutes to spare and lost 76 marks: use spare time to check working and add detail."]);
    const steady = buildPaperRunBreakdown({
      questions: QUESTIONS,
      attempts: QUESTIONS.map((question) => attempt(question.id, question.totalMarks, question.totalMarks, question.totalMarks * 60_000)),
      durationMinutes: 90,
      usedMs: 80 * 60_000,
      topicTitle: title,
    });
    expect(steady.findings).toEqual(["Your pace held: no question ran far over its budget and nothing was left blank."]);
    expect(steady.focusTopics).toEqual([]);
  });

  it("renders the breakdown with time against budget, blanks and repair links", () => {
    const html = renderToStaticMarkup(
      createElement(PaperBreakdown, { breakdown, subjectId: "wjec-alevel-physics", formatName: "Unit 1: Motion, Energy and Matter", gradeNote: UNIT_MOCK_GRADE_NOTE }),
    );
    expect(html).toContain("Marks by topic");
    expect(html).toContain("40:00 / 22:30");
    expect(html).toContain("(over budget)");
    expect(html).toContain("Blank");
    expect(html).toContain("Provisional");
    expect(html).toContain('href="/practice?subject=wjec-alevel-physics&amp;topic=s.mat"');
    expect(html).toContain("Practise Materials (35 lost)");
    expect(html).toContain("No grade is shown");
  });
});

describe("UnitMockList", () => {
  const blueprint = {
    subjectId: "wjec-alevel-physics",
    unit: 1,
    level: "AS" as const,
    paperSpecId: "wjec-alevel-physics.u1",
    name: "Unit 1: Motion, Energy and Matter",
    durationMinutes: 90,
    marks: 80,
    weightPercent: 20,
    calculatorAllowed: true,
    topicIds: ["a", "b"],
    sourceUrl: "https://www.wjec.co.uk/qualifications/physics-asa-level/",
  };
  const full: UnitMock = {
    blueprint,
    questionIds: ["q1", "q2", "q3"],
    picks: [],
    totalMarks: 80,
    complete: true,
    topics: [
      { topicId: "a", title: "A", targetMarks: 40, marks: 40 },
      { topicId: "b", title: "B", targetMarks: 40, marks: 40 },
    ],
    trusted: false,
    notes: ["Practice paper: not proof."],
    headline: "",
  };

  it("shows the real paper shape, this mock, its notes and a start button", () => {
    const html = renderToStaticMarkup(createElement(UnitMockList, { subjectName: "Physics", yearGroupLabel: "Year 12: AS units", mocks: [full], savingUnit: null, error: null, onStart: () => undefined }));
    expect(html).toContain("Sit a WJEC unit paper");
    expect(html).toContain("Real paper: 90 minutes · 80 marks · 20% of the A level · calculator");
    expect(html).toContain("This mock: 3 questions · 80 marks · 90 minutes, across 2 of 2 topics");
    expect(html).toContain("Practice paper: not proof.");
    expect(html).toContain("Sit Unit 1 mock");
    expect(html).toContain("Year 12: AS units");
    expect(html).toContain("WJEC specification");
  });

  it("disables the start button when the bank cannot build the paper", () => {
    const empty: UnitMock = { ...full, questionIds: [], totalMarks: 0, complete: false, notes: ["The question bank has no unused questions."] };
    const html = renderToStaticMarkup(createElement(UnitMockList, { subjectName: "Physics", yearGroupLabel: null, mocks: [empty], savingUnit: null, error: null, onStart: () => undefined }));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Sit Unit 1 mock<\/button>/);
    expect(html).not.toContain("This mock:");
  });
});
