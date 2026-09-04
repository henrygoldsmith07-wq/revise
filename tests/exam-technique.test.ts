import { describe, expect, it } from "vitest";
import { knowledgeVsAnswering, timedSessionRecommendation } from "../src/domain/exam-technique";
import type { Attempt, MarkedPart, Mistake, Question, QuestionPart } from "../src/domain/types";

const SUBJECT = "aqa-alevel-biology";
const TOPIC = `${SUBJECT}.enzymes`;
const OTHER = "aqa-alevel-chemistry";

let seq = 0;
function freshKey(prefix: string): string {
  seq += 1;
  return `${prefix}${seq}`;
}

function mistake(overrides: Partial<Mistake> = {}): Mistake {
  return {
    id: freshKey("m"),
    userId: "local",
    subjectId: SUBJECT,
    topicId: TOPIC,
    description: "miss",
    category: "unclassified",
    resolved: false,
    marksLost: 1,
    createdAt: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

/** A question with its own id; the part always carries partId p1. */
function question(qid: string, partOverride: Partial<QuestionPart>, questionOverride: Partial<Question> = {}): Question {
  return {
    id: qid,
    subjectId: SUBJECT,
    topicIds: [TOPIC],
    kind: "short",
    stem: partOverride.prompt ?? "Answer the question.",
    parts: [
      {
        id: "p1",
        label: "(a)",
        prompt: "Describe what happens.",
        marks: 1,
        markScheme: ["some point"],
        modelAnswer: "answer",
        ...partOverride,
      },
    ],
    totalMarks: partOverride.marks ?? 1,
    calculatorAllowed: false,
    difficulty: 3,
    origin: "seed",
    createdAt: "2026-01-01T00:00:00Z",
    ...questionOverride,
  };
}

function attempt(aid: string, qid: string, answers: Record<string, string>, markedPart: MarkedPart): Attempt {
  return {
    id: aid,
    userId: "local",
    questionId: qid,
    subjectId: SUBJECT,
    topicIds: [TOPIC],
    answers,
    marked: [markedPart],
    awarded: markedPart.awarded,
    max: markedPart.max,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 60_000,
    mode: "practice",
    createdAt: "2026-05-01T00:00:00Z",
  };
}

function marked(markedOverride: Partial<MarkedPart>): MarkedPart {
  return {
    partId: "p1",
    awarded: 0,
    max: 1,
    creditedPoints: [],
    missedPoints: ["some point"],
    comment: "",
    ...markedOverride,
  };
}

interface Row {
  mistake: Mistake;
  question?: Question;
  attempt?: Attempt;
}

function inputs(rows: Row[]) {
  return {
    subjectId: SUBJECT,
    mistakes: rows.map((r) => r.mistake),
    questions: rows.map((r) => r.question).filter((q): q is Question => Boolean(q)),
    attempts: rows.map((r) => r.attempt).filter((a): a is Attempt => Boolean(a)),
  };
}

/** Blank answer on a 1-mark point → knowledge gap, high confidence. */
function knowledgeGapRow(marksLost = 1, overrides: Partial<Mistake> = {}): Row {
  const qid = freshKey("q");
  const aid = freshKey("a");
  const m = mistake({
    marksLost,
    questionId: qid,
    attemptId: aid,
    partId: "p1",
    ...overrides,
  });
  const q = question(qid, { marks: marksLost, markScheme: ["the required fact"], prompt: "State the required fact." });
  const a = attempt(aid, qid, { p1: "" }, marked({ awarded: 0, max: marksLost, missedPoints: ["the required fact"] }));
  return { mistake: m, question: q, attempt: a };
}

/** One-sided compare → command word, high confidence. */
function commandWordRow(marksLost = 1, overrides: Partial<Mistake> = {}): Row {
  const qid = freshKey("q");
  const aid = freshKey("a");
  const m = mistake({
    marksLost,
    questionId: qid,
    attemptId: aid,
    partId: "p1",
    command: "compare",
    ...overrides,
  });
  const q = question(qid, {
    prompt: "Compare the two structures.",
    marks: marksLost,
    markScheme: ["veins have valves, arteries do not"],
  });
  const a = attempt(
    aid,
    qid,
    { p1: "arteries have thick muscular walls" },
    marked({ awarded: marksLost - 1, max: marksLost, missedPoints: ["veins have valves, arteries do not"] }),
  );
  return { mistake: m, question: q, attempt: a };
}

/** Row with no attempt/question context → capture-time category at low confidence. */
function legacyRow(category: Mistake["category"], marksLost = 1, subjectId = SUBJECT): Row {
  return { mistake: mistake({ category, marksLost, subjectId }) };
}

describe("knowledgeVsAnswering", () => {
  it("calls knowledge when every loss is a high-confidence knowledge gap", () => {
    const report = knowledgeVsAnswering(inputs([1, 2, 3, 4].map(() => knowledgeGapRow())));
    expect(report.verdict).toBe("knowledge");
    expect(report.reliable).toBe(true);
    expect(report.knowledgeShare).toBe(1);
    expect(report.answeringShare).toBe(0);
    expect(report.narrative).toContain("Knowledge");
    expect(report.classifiedFromAnswers).toBe(4);
    expect(report.mappedFromLegacy).toBe(0);
  });

  it("calls answering when every loss is a one-sided compare (command word)", () => {
    const report = knowledgeVsAnswering(inputs([1, 2, 3, 4].map(() => commandWordRow())));
    expect(report.verdict).toBe("answering");
    expect(report.knowledgeShare).toBe(0);
    expect(report.answeringShare).toBe(1);
    expect(report.narrative).toContain("Answering");
    expect(report.drivers[0]?.klass).toBe("command word");
  });

  it("calls mixed when the evidence is split", () => {
    const report = knowledgeVsAnswering(
      inputs([1, 2, 3].map(() => knowledgeGapRow()).concat([4, 5, 6, 7].map(() => commandWordRow()))),
    );
    expect(report.verdict).toBe("mixed");
    expect(report.knowledgeShare).toBeGreaterThan(0.3);
    expect(report.knowledgeShare).toBeLessThan(0.7);
    expect(report.narrative).toContain("Mixed");
  });

  it("stays too-early below the evidence threshold instead of inventing a direction", () => {
    const report = knowledgeVsAnswering(inputs([knowledgeGapRow(), commandWordRow()]));
    expect(report.verdict).toBe("too-early");
    expect(report.reliable).toBe(false);
    expect(report.narrative).toContain("2 losses");
  });

  it("returns none when the subject has no mistakes", () => {
    const report = knowledgeVsAnswering(inputs([commandWordRow(1, { subjectId: OTHER })]));
    expect(report.verdict).toBe("none");
    expect(report.mistakes).toBe(0);
  });

  it("ignores mistakes from other subjects", () => {
    const report = knowledgeVsAnswering(
      inputs([knowledgeGapRow(), knowledgeGapRow(), commandWordRow(1, { subjectId: OTHER }), commandWordRow(1, { subjectId: OTHER })]),
    );
    expect(report.mistakes).toBe(2);
    expect(report.knowledgeShare).toBe(1);
    expect(report.classifiedFromAnswers).toBe(2);
  });

  it("counts legacy rows at quarter weight and labels them as mapped", () => {
    const report = knowledgeVsAnswering(inputs([1, 2, 3, 4].map(() => knowledgeGapRow()).concat([legacyRow("recall")])));
    expect(report.classifiedFromAnswers).toBe(4);
    expect(report.mappedFromLegacy).toBe(1);
    expect(report.knowledgeMarks).toBeCloseTo(4.25, 2);
    expect(report.totalMarks).toBeCloseTo(4.25, 2);
  });

  it("weights a legacy arithmetic row mostly to answering at quarter weight", () => {
    const report = knowledgeVsAnswering(inputs([legacyRow("arithmetic")]));
    expect(report.verdict).toBe("too-early");
    // arithmetic maps to calculation → 20% knowledge, 80% answering, ×0.25.
    expect(report.answeringMarks).toBeCloseTo(0.2, 2);
    expect(report.knowledgeMarks).toBeCloseTo(0.05, 2);
  });

  it("applies the documented terminology fraction (75% knowledge)", () => {
    const qid = freshKey("q");
    const aid = freshKey("a");
    const m = mistake({
      marksLost: 4,
      questionId: qid,
      attemptId: aid,
      partId: "p1",
      command: "explain",
      misconception: "terminology",
      ao: "AO1",
    });
    const q = question(
      qid,
      {
        prompt: "Explain how water moves in osmosis.",
        marks: 4,
        markScheme: ["water moves down its water potential gradient"],
        aos: ["AO1"],
      },
      {},
    );
    const a = attempt(
      aid,
      qid,
      { p1: "water moves from where there is a lot to where there is less" },
      marked({ awarded: 0, max: 4, missedPoints: ["water moves down its water potential gradient"] }),
    );
    const report = knowledgeVsAnswering(inputs([{ mistake: m, question: q, attempt: a }]));
    expect(report.knowledgeMarks).toBeCloseTo(3, 1); // 4 × 0.75
    expect(report.answeringMarks).toBeCloseTo(1, 1); // 4 × 0.25
  });

  it("orders drivers by raw marks lost and caps the list", () => {
    const rows: Row[] = [];
    for (let i = 0; i < 6; i += 1) rows.push(knowledgeGapRow(3));
    for (let i = 0; i < 2; i += 1) rows.push(commandWordRow(5));
    const report = knowledgeVsAnswering(inputs(rows));
    expect(report.drivers[0]?.klass).toBe("knowledge gap");
    expect(report.drivers[0]?.marksLost).toBe(18);
    expect(report.drivers[1]?.klass).toBe("command word");
    expect(report.drivers.length).toBe(2);
    expect(report.knowledgeShare).toBeGreaterThan(0.6);
  });
});

describe("timedSessionRecommendation", () => {
  it("prescribes a 5-minute run when answering is the leak, sized by the app's real quick-session mechanics", () => {
    const report = knowledgeVsAnswering(inputs([1, 2, 3, 4].map(() => commandWordRow())));
    const rec = timedSessionRecommendation(report);
    expect(rec).not.toBeNull();
    expect(rec?.minutes).toBe(5);
    expect(rec?.questionCount).toBe(2); // quickSessionQuestionLimit(5)
    expect(rec?.headline).toContain("5-minute");
    expect(rec?.headline).toContain("2 questions");
  });

  it("escalates to the 10-minute box once answering losses pile up", () => {
    const report = knowledgeVsAnswering(inputs([1, 2, 3, 4].map(() => commandWordRow(3))));
    // 4 rows × 3 marks × 100% answering = 12 weighted answering marks ≥ 8.
    expect(report.answeringMarks).toBeGreaterThanOrEqual(8);
    const rec = timedSessionRecommendation(report);
    expect(rec?.minutes).toBe(10);
    expect(rec?.questionCount).toBe(4); // quickSessionQuestionLimit(10)
  });

  it("names the top answering driver as the focus of the run", () => {
    const report = knowledgeVsAnswering(inputs([1, 2, 3, 4].map(() => commandWordRow())));
    const rec = timedSessionRecommendation(report);
    expect(rec?.rationale).toContain("command word");
  });

  it("stays silent unless answering is the verdict", () => {
    expect(timedSessionRecommendation(knowledgeVsAnswering(inputs([1, 2, 3, 4].map(() => knowledgeGapRow()))))).toBeNull();
    expect(timedSessionRecommendation(knowledgeVsAnswering(inputs([])))).toBeNull();
    expect(timedSessionRecommendation(knowledgeVsAnswering(inputs([knowledgeGapRow(), commandWordRow()])))).toBeNull();
  });
});
