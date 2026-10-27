import { describe, expect, it } from "vitest";
import { getSubject, topicsFor } from "@/domain/curriculum";
import { MOCK_RECENT_WINDOW_DAYS, buildGeneratedPaper, generateMockPaper } from "@/domain/mock-generator";
import { examPaperFormat, isRealPaperSpecId } from "@/domain/exam-conditions";
import { SPEC_MANIFEST } from "@/domain/spec";
import {
  UNIT_MOCK_PRACTICE_NOTE,
  buildUnitMock,
  buildUnitMockPaper,
  earlierUnitMockQuestionIds,
  unitMockBlueprints,
  unitMockMinutes,
} from "@/domain/unit-mock";
import type { Attempt, Paper, PaperSpec, Question, Topic } from "@/domain/types";

const NOW = new Date("2026-10-27T16:00:00.000Z");
const PHYSICS = "wjec-alevel-physics";

function physics() {
  const subject = getSubject(PHYSICS);
  if (!subject) throw new Error("Physics missing");
  return { subject, topics: topicsFor(PHYSICS) };
}

function q(id: string, topicIds: string[], totalMarks: number, overrides: Partial<Question> = {}): Question {
  return {
    id,
    subjectId: PHYSICS,
    topicIds,
    kind: "structured",
    stem: `Question ${id}.`,
    parts: [{ id: `${id}.a`, label: "a", prompt: "Explain.", marks: totalMarks, markScheme: [], modelAnswer: "" }] as unknown as Question["parts"],
    totalMarks,
    calculatorAllowed: true,
    difficulty: 3,
    origin: "seed",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function attemptOn(questionId: string, createdAt: string, extra: Partial<Attempt> = {}): Attempt {
  return {
    id: `att-${questionId}-${createdAt}`,
    userId: "u",
    questionId,
    subjectId: PHYSICS,
    topicIds: [],
    answers: { [`${questionId}.a`]: "something" },
    marked: [],
    awarded: 0,
    max: 1,
    feedback: "",
    markedBy: "rubric",
    createdAt,
    ...extra,
  } as Attempt;
}

describe("WJEC paper shapes", () => {
  it("offers Unit 1 and Unit 2 as the real separate 90-minute, 80-mark AS papers, not one 210-minute paper", () => {
    for (const id of ["wjec-alevel-physics", "wjec-alevel-chemistry", "wjec-alevel-biology"]) {
      const papers = getSubject(id)!.papers;
      expect(papers.find((paper) => paper.id === `${id}.as`)).toBeUndefined();
      expect(papers.find((paper) => paper.id === `${id}.u1`)).toMatchObject({ durationMinutes: 90, marks: 80, weight: 0.2 });
      expect(papers.find((paper) => paper.id === `${id}.u2`)).toMatchObject({ durationMinutes: 90, marks: 80, weight: 0.2 });
    }
  });

  it("uses the WJEC Maths unit marks and weights (Unit 2 is 75 marks and 15%)", () => {
    const papers = getSubject("wjec-alevel-maths")!.papers;
    expect(papers.find((paper) => paper.id === "wjec-alevel-maths.u1")).toMatchObject({ durationMinutes: 150, marks: 120, weight: 0.25 });
    expect(papers.find((paper) => paper.id === "wjec-alevel-maths.u2")).toMatchObject({ durationMinutes: 105, marks: 75, weight: 0.15 });
    expect(papers.find((paper) => paper.id === "wjec-alevel-maths.u3")).toMatchObject({ durationMinutes: 150, marks: 120, weight: 0.35 });
    expect(papers.find((paper) => paper.id === "wjec-alevel-maths.u4")).toMatchObject({ durationMinutes: 105, marks: 80, weight: 0.25 });
  });

  it("keeps each WJEC flagship's unit weights summing to the whole A level", () => {
    for (const id of ["wjec-alevel-physics", "wjec-alevel-chemistry", "wjec-alevel-biology", "wjec-alevel-maths"]) {
      const total = getSubject(id)!.papers.reduce((sum, paper) => sum + paper.weight, 0);
      expect(Math.round(total * 1000) / 1000, id).toBe(1);
      const manifest = SPEC_MANIFEST.find((entry) => entry.subjectId === id)!;
      expect(manifest.paperBreakdown!.map((row) => row.paperId).sort()).toEqual(getSubject(id)!.papers.map((paper) => paper.id).sort());
    }
  });
});

describe("unitMockBlueprints", () => {
  it("offers Units 1-4 (never the Unit 5 practical) with the unit's real shape and topics", () => {
    const { subject, topics } = physics();
    const blueprints = unitMockBlueprints({ subject, topics });
    expect(blueprints.map((blueprint) => blueprint.unit)).toEqual([1, 2, 3, 4]);
    const unit1 = blueprints[0];
    expect(unit1).toMatchObject({
      paperSpecId: `${PHYSICS}.u1`,
      name: "Unit 1: Motion, Energy and Matter",
      level: "AS",
      durationMinutes: 90,
      marks: 80,
      weightPercent: 20,
    });
    expect(unit1.topicIds).toContain(`${PHYSICS}.kinematics-dynamics`);
    expect(unit1.topicIds).not.toContain(`${PHYSICS}.electric-circuits`);
    expect(blueprints[1].topicIds).toContain(`${PHYSICS}.electric-circuits`);
    expect(unit1.sourceUrl).toMatch(/^https:\/\/www\.wjec\.co\.uk\//);
  });

  it("offers a Year 12 student the AS units only", () => {
    const { subject, topics } = physics();
    expect(unitMockBlueprints({ subject, topics, yearGroup: "year-12" }).map((blueprint) => blueprint.unit)).toEqual([1, 2]);
  });

  it("keeps only a Year 13 student's Unit 4 option on the Unit 4 paper", () => {
    const { subject, topics } = physics();
    const unit4 = unitMockBlueprints({ subject, topics, yearGroup: "year-13", unit4Option: "B" }).find((blueprint) => blueprint.unit === 4)!;
    expect(unit4.topicIds).toContain(`${PHYSICS}.medical-physics`);
    expect(unit4.topicIds).not.toContain(`${PHYSICS}.sports-physics`);
  });

  it("offers nothing where unit scoping is not reliable yet (non-WJEC subjects)", () => {
    for (const id of ["aqa-alevel-physics"]) {
      const subject = getSubject(id);
      if (!subject) continue;
      expect(unitMockBlueprints({ subject, topics: topicsFor(id) })).toEqual([]);
    }
  });
});

describe("buildUnitMock", () => {
  const { subject, topics } = physics();
  const unit1 = unitMockBlueprints({ subject, topics, yearGroup: "year-12" })[0];
  const [t1, t2, t3] = unit1.topicIds;

  function bank(): Question[] {
    const out: Question[] = [];
    for (const topicId of [t1, t2, t3]) {
      for (let index = 0; index < 12; index += 1) out.push(q(`${topicId}-${index}`, [topicId], [2, 3, 4, 5, 6][index % 5]));
    }
    // A Unit 2 question and a question spanning Unit 1 and Unit 2 must never appear.
    out.push(q("unit2-only", [`${PHYSICS}.electric-circuits`], 4));
    out.push(q("cross-unit", [t1, `${PHYSICS}.electric-circuits`], 4));
    return out;
  }

  it("fills the real 80-mark total exactly from that unit's questions, across every topic", () => {
    const mock = buildUnitMock({ blueprint: unit1, questions: bank(), topics, attempts: [], now: NOW });
    expect(mock.totalMarks).toBe(80);
    expect(mock.complete).toBe(true);
    expect(mock.questionIds).not.toContain("unit2-only");
    expect(mock.questionIds).not.toContain("cross-unit");
    expect(new Set(mock.questionIds).size).toBe(mock.questionIds.length);
    expect(mock.topics.every((topic) => topic.marks > 0)).toBe(true);
    expect(mock.trusted).toBe(false);
    expect(mock.notes).toContain(UNIT_MOCK_PRACTICE_NOTE);
    expect(mock.headline).toBe(`${unit1.name}: ${mock.questionIds.length} questions, 80 marks, 90 minutes`);
  });

  it("shares marks in proportion to each topic's specification statements", () => {
    const mock = buildUnitMock({ blueprint: unit1, questions: bank(), topics, attempts: [], now: NOW });
    for (const topic of mock.topics) expect(Math.abs(topic.marks - topic.targetMarks)).toBeLessThanOrEqual(6);
  });

  it("takes unseen questions before recently answered ones", () => {
    const questions = bank();
    const recent = new Date(NOW.getTime() - 2 * 86_400_000).toISOString();
    const attempts = questions.filter((question) => question.id.endsWith("-0") || question.id.endsWith("-1")).map((question) => attemptOn(question.id, recent));
    const mock = buildUnitMock({ blueprint: unit1, questions, topics, attempts, now: NOW });
    expect(mock.totalMarks).toBe(80);
    expect(mock.picks.every((pick) => pick.exposure === "fresh")).toBe(true);
  });

  it("reuses questions answered long ago before recent ones when the bank runs short", () => {
    const questions = [q("a", [t1], 40), q("b", [t2], 40), q("c", [t3], 40)];
    const old = new Date(NOW.getTime() - (MOCK_RECENT_WINDOW_DAYS + 5) * 86_400_000).toISOString();
    const recent = new Date(NOW.getTime() - 86_400_000).toISOString();
    const mock = buildUnitMock({ blueprint: unit1, questions, topics, attempts: [attemptOn("a", recent), attemptOn("b", old)], now: NOW });
    expect(mock.questionIds).toContain("c");
    expect(mock.questionIds).toContain("b");
    expect(mock.questionIds).not.toContain("a");
  });

  it("is deterministic for a seed and leaves out excluded questions", () => {
    const first = buildUnitMock({ blueprint: unit1, questions: bank(), topics, attempts: [], now: NOW, seed: 3 });
    const again = buildUnitMock({ blueprint: unit1, questions: bank(), topics, attempts: [], now: NOW, seed: 3 });
    expect(again.questionIds).toEqual(first.questionIds);
    const next = buildUnitMock({ blueprint: unit1, questions: bank(), topics, attempts: [], now: NOW, excludeQuestionIds: first.questionIds.slice(0, 5) });
    for (const id of first.questionIds.slice(0, 5)) expect(next.questionIds).not.toContain(id);
  });

  it("says when the bank is short, never exceeds the total, and shortens the clock at the real pace", () => {
    const questions = [q("s1", [t1], 6), q("s2", [t2], 6), q("s3", [t1], 8)];
    const mock = buildUnitMock({ blueprint: unit1, questions, topics, attempts: [], now: NOW });
    expect(mock.totalMarks).toBe(20);
    expect(mock.complete).toBe(false);
    expect(mock.notes.join(" ")).toMatch(/20 marks of the real 80/);
    expect(mock.notes.join(" ")).toMatch(/does not sample it/);
    expect(unitMockMinutes(unit1, 20)).toBe(23);
    expect(unitMockMinutes(unit1, 80)).toBe(90);
  });

  it("cannot be built from an empty bank and says so", () => {
    const mock = buildUnitMock({ blueprint: unit1, questions: [], topics, attempts: [], now: NOW });
    expect(mock.questionIds).toEqual([]);
    expect(mock.notes[0]).toMatch(/no unused questions/);
  });

  it("saves as a paper locked to the unit format with its own clock", () => {
    const mock = buildUnitMock({ blueprint: unit1, questions: bank(), topics, attempts: [], now: NOW });
    const paper = buildUnitMockPaper({ mock, subjectName: "Physics", userId: "u", id: "p1", createdAt: NOW.toISOString() });
    expect(paper).toMatchObject({
      id: "p1",
      subjectId: PHYSICS,
      title: "WJEC Physics Unit 1: Motion, Energy and Matter (mock)",
      paperSpecId: `${PHYSICS}.u1`,
      totalMarks: 80,
      status: "extracted",
      generated: { focus: 0, targetMarks: 80, durationMinutes: 90, unitMock: { unit: 1, paperSpecId: `${PHYSICS}.u1` } },
    });
    expect(earlierUnitMockQuestionIds([paper, { ...paper, id: "p2", generated: undefined }], unit1)).toEqual(paper.questionIds);
  });

  it("builds a complete Year 12 Physics Unit 1 mock from the real question bank", async () => {
    const { seedQuestions } = await import("@/content");
    const mock = buildUnitMock({ blueprint: unit1, questions: seedQuestions, topics, attempts: [], now: NOW });
    expect(mock.totalMarks).toBe(80);
    const byId = new Map(seedQuestions.map((question) => [question.id, question] as const));
    for (const id of mock.questionIds) {
      expect(byId.get(id)!.topicIds.every((topicId) => unit1.topicIds.includes(topicId))).toBe(true);
    }
  });
});

describe("examPaperFormat", () => {
  const { subject } = physics();
  const fallback: PaperSpec = { id: "default-exam-paper", name: "Timed paper", weight: 1, durationMinutes: 90, calculatorAllowed: false };
  const base: Paper = { id: "p", userId: "u", subjectId: PHYSICS, title: "Paper", totalMarks: 30, questionIds: [], status: "extracted", createdAt: NOW.toISOString() };

  it("times a bespoke mock to its own marks instead of the subject's first format (Unit 3's 135 minutes)", () => {
    const legacy = examPaperFormat({ ...base, generated: { focus: 0.6, targetMarks: 30, topicIds: [] } }, subject.papers, fallback);
    expect(legacy.initial.durationMinutes).toBe(41);
    expect(legacy.initial.durationMinutes).not.toBe(subject.papers[0].durationMinutes);
    expect(legacy.generated).toBe(true);
    expect(isRealPaperSpecId(legacy.initial.id)).toBe(false);
    const stored = examPaperFormat({ ...base, generated: { focus: 0.6, targetMarks: 30, topicIds: [], durationMinutes: 37 } }, subject.papers, fallback);
    expect(stored.initial.durationMinutes).toBe(37);
    expect(stored.options.slice(1)).toEqual(subject.papers);
  });

  it("locks a unit mock to its unit and clock", () => {
    const format = examPaperFormat(
      { ...base, paperSpecId: `${PHYSICS}.u2`, generated: { focus: 0, targetMarks: 80, topicIds: [], durationMinutes: 90, unitMock: { unit: 2, paperSpecId: `${PHYSICS}.u2` } } },
      subject.papers,
      fallback,
    );
    expect(format.locked).toBe(true);
    expect(format.options).toHaveLength(1);
    expect(format.initial).toMatchObject({ id: `${PHYSICS}.u2`, durationMinutes: 90 });
  });

  it("keeps an uploaded paper on its chosen format, else the first", () => {
    expect(examPaperFormat({ ...base, paperSpecId: `${PHYSICS}.u3` }, subject.papers, fallback).initial.id).toBe(`${PHYSICS}.u3`);
    expect(examPaperFormat(base, subject.papers, fallback).initial.id).toBe(subject.papers[0].id);
    expect(examPaperFormat(base, [], fallback).initial).toBe(fallback);
  });

  it("stores the bespoke mock's clock when it is saved", () => {
    const topic: Topic = { id: "s.t", subjectId: "s", unitId: "s.u", title: "T", order: 0, intrinsicDifficulty: 2, summary: "", keyPoints: [], commonErrors: [] };
    const mock = generateMockPaper({
      subjectId: "s",
      questions: [{ ...q("x", ["s.t"], 10), subjectId: "s" }],
      topics: [topic],
      mastery: [],
      attempts: [],
      targetMarks: 10,
      now: NOW,
    });
    expect(buildGeneratedPaper(mock, "u", "id").generated?.durationMinutes).toBe(mock.estimatedMinutes);
  });
});

