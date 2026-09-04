import { describe, expect, it } from "vitest";
import {
  selectNextPaper,
  neededPercentForGrade,
  PAPER_SELECT_WEIGHTS,
  type PaperSelectionInput,
  type PaperSelectionResult,
} from "../src/domain/exam-paper-selection";
import type { Attempt, Mistake, Paper, Question, Topic, TopicMastery } from "../src/domain/types";

const NOW = new Date("2026-06-01T12:00:00Z");
const SUBJECT = "wjec-alevel-biology";

const TOPICS: Topic[] = ["photo", "enzymes", "transport"].map((slug, i) => ({
  id: `${SUBJECT}.${slug}`,
  subjectId: SUBJECT,
  unitId: `${SUBJECT}.u1`,
  title: slug,
  order: i,
  intrinsicDifficulty: 3,
  summary: "s",
  keyPoints: [],
  commonErrors: [],
}));

const TOPIC_A = TOPICS[0]!.id;
const TOPIC_B = TOPICS[1]!.id;
const TOPIC_C = TOPICS[2]!.id;

function question(id: string, topicId: string, difficulty: 1 | 2 | 3 | 4 | 5, marks = 10): Question {
  return {
    id,
    subjectId: SUBJECT,
    topicIds: [topicId],
    kind: "structured",
    stem: `Question ${id}`,
    parts: [
      {
        id: `${id}-p`,
        label: "(a)",
        prompt: "Answer.",
        marks,
        markScheme: ["point"],
        modelAnswer: "answer",
      },
    ],
    totalMarks: marks,
    calculatorAllowed: false,
    difficulty,
    origin: "past-paper",
    createdAt: "2025-01-01T00:00:00Z",
  };
}

function paper(id: string, title: string, questionIds: string[], totalMarks: number, subjectId = SUBJECT): Paper {
  return {
    id,
    userId: "local",
    subjectId: subjectId,
    title,
    totalMarks,
    questionIds,
    status: "extracted",
    createdAt: "2025-02-01T00:00:00Z",
  };
}

function mistake(id: string, topicId: string, daysAgo: number, marksLost = 2, resolved = false): Mistake {
  return {
    id,
    userId: "local",
    subjectId: SUBJECT,
    topicId,
    description: "miss",
    category: "recall",
    resolved,
    marksLost,
    createdAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
  };
}

function runAttempt(paperId: string, runId: string, questionId: string, daysAgo: number, awarded = 6, max = 10): Attempt {
  return {
    id: `${paperId}-${runId}`,
    userId: "local",
    questionId,
    subjectId: SUBJECT,
    topicIds: [TOPIC_A],
    answers: {},
    marked: [],
    awarded,
    max,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 60_000,
    mode: "paper",
    paperId,
    paperRunId: runId,
    createdAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
  };
}

function masteryRow(topicId: string, mastery: number, attempts = 4, retention = 0.9, weak = false): TopicMastery {
  return {
    topicId,
    subjectId: SUBJECT,
    mastery,
    retention,
    confidence: 0.6,
    cardsTotal: 5,
    cardsDue: 0,
    attempts,
    accuracy: 0.8,
    lastStudiedAt: new Date(NOW.getTime() - 86_400_000).toISOString(),
    weak,
  };
}

function select(overrides: Partial<PaperSelectionInput> = {}): PaperSelectionResult {
  return selectNextPaper({
    subjectId: SUBJECT,
    papers: [],
    questions: [],
    attempts: [],
    mistakes: [],
    mastery: [],
    topics: TOPICS,
    now: NOW,
    ...overrides,
  });
}

describe("weakness factor", () => {
  it("ranks a paper that retests recently-lost topics above one that does not", () => {
    const qWeak = question("q1", TOPIC_A, 3);
    const qOk = question("q2", TOPIC_B, 3);
    const result = select({
      papers: [
        paper("p-weak", "Paper on the weak topic", [qWeak.id], 10),
        paper("p-ok", "Paper on a holding topic", [qOk.id], 10),
      ],
      questions: [qWeak, qOk],
      mistakes: [mistake("m1", TOPIC_A, 1, 4)],
      mastery: [masteryRow(TOPIC_B, 0.8)],
      attempts: [runAttempt("p-ok", "r1", qOk.id, 30)],
    });
    const [weakPaper, okPaper] = result.candidates;
    expect(result.recommended?.paperId).toBe("p-weak");
    expect(weakPaper!.factors.weakness.score).toBeGreaterThan(okPaper!.factors.weakness.score);
    expect(weakPaper!.factors.weakness.detail).toContain("marks sit on topics");
    expect(weakPaper!.recentLossMarks).toBe(4);
    expect(okPaper!.factors.weakness.detail).toBe("none of its topics are weak right now");
  });

  it("ignores losses outside the 7-day window when judging weakness", () => {
    const qOld = question("q-old", TOPIC_A, 3);
    const result = select({
      papers: [paper("p1", "Old-loss paper", [qOld.id], 10)],
      questions: [qOld],
      mistakes: [mistake("m-old", TOPIC_A, 12, 6, true)],
    });
    expect(result.candidates[0]!.factors.weakness.score).toBe(0);
    expect(result.candidates[0]!.recentLossMarks).toBe(0);
  });
});

describe("recency and exposure", () => {
  it("prefers a never-sat paper over one sat twice, all else equal", () => {
    const q = question("qA", TOPIC_A, 3);
    const result = select({
      papers: [
        paper("p-fresh", "Never sat", [q.id], 10),
        paper("p-repeat", "Sat twice", [q.id], 10),
      ],
      questions: [q],
      attempts: [
        runAttempt("p-repeat", "run-1", q.id, 30),
        runAttempt("p-repeat", "run-2", q.id, 1),
      ],
    });
    const [fresh, repeat] = result.candidates;
    expect(fresh!.paperId).toBe("p-fresh");
    expect(fresh!.factors.recency.detail).toBe("never sat");
    expect(fresh!.factors.exposure.detail).toBe("no recorded runs");
    expect(fresh!.runs).toBe(0);
    expect(repeat!.runs).toBe(2);
    expect(repeat!.factors.recency.detail).toBe("last sat 1 day ago");
    expect(repeat!.factors.exposure.detail).toBe("2 runs so far");
    expect(fresh!.daysSinceLastRun).toBeNull();
  });
});

describe("coverage factor", () => {
  it("prefers the paper that samples more of the syllabus when other signals are equal", () => {
    const qa = question("qA", TOPIC_A, 3);
    const qb = question("qB", TOPIC_B, 3);
    const qc = question("qC", TOPIC_C, 3);
    const result = select({
      papers: [
        paper("p-wide", "Broad paper", [qa.id, qb.id, qc.id], 30),
        paper("p-narrow", "Narrow paper", [qa.id], 10),
      ],
      questions: [qa, qb, qc],
    });
    const [wide, narrow] = result.candidates;
    expect(wide!.paperId).toBe("p-wide");
    expect(wide!.topicCount).toBe(3);
    expect(narrow!.topicCount).toBe(1);
    expect(wide!.factors.coverage.score).toBeGreaterThan(narrow!.factors.coverage.score);
    expect(wide!.factors.coverage.detail).toBe("covers 3 of 3 topics");
  });
});

describe("difficulty factor", () => {
  it("penalises a paper that is hard on topics the student has not secured", () => {
    const qHard = question("q-hard", TOPIC_A, 5);
    const qModerate = question("q-mod", TOPIC_B, 2);
    const result = select({
      papers: [
        paper("p-hard", "Hard paper", [qHard.id], 10),
        paper("p-mod", "Moderate paper", [qModerate.id], 10),
      ],
      questions: [qHard, qModerate],
      // Secured ~40% on the hard paper's topic, ~90% on the moderate one —
      // neither topic is *weak*, so only the difficulty factor differs.
      mastery: [masteryRow(TOPIC_A, 0.4, 3, 0.85, false), masteryRow(TOPIC_B, 0.9, 6)],
    });
    const [moderate, hard] = result.candidates;
    expect(moderate!.paperId).toBe("p-mod");
    expect(moderate!.factors.difficulty.score).toBeGreaterThan(hard!.factors.difficulty.score);
    expect(hard!.factors.difficulty.detail).toContain("/5 difficulty");
    expect(hard!.averageDifficulty).toBe(5);
  });
});

describe("predicted gain", () => {
  it("reports real recent losses as the predicted gain and names them", () => {
    const qa = question("qA", TOPIC_A, 3);
    const qb = question("qB", TOPIC_B, 3);
    const qc = question("qC", TOPIC_C, 3);
    const result = select({
      papers: [
        paper("p-loss", "Loss paper", [qa.id, qb.id], 20),
        paper("p-clean", "Clean paper", [qc.id], 10),
      ],
      questions: [qa, qb, qc],
      mistakes: [mistake("m1", TOPIC_A, 1, 6)],
    });
    const [loss, clean] = result.candidates;
    expect(loss!.paperId).toBe("p-loss");
    expect(loss!.factors.gain.detail).toContain("6 marks recently lost in the topics it tests");
    expect(clean!.factors.gain.detail).toBe("no recent losses in its topics yet");
  });

  it("shows a predicted percentage only when most marks sit on measured topics", () => {
    const qMeasured = question("qM", TOPIC_A, 3, 10);
    const qUnmeasured = question("qU", TOPIC_B, 3, 10);
    const result = select({
      papers: [paper("p-mix", "Half-measured paper", [qMeasured.id, qUnmeasured.id], 20)],
      questions: [qMeasured, qUnmeasured],
      mastery: [masteryRow(TOPIC_A, 0.75, 6)],
    });
    expect(result.candidates[0]!.predictedPercent).toBeNull();

    const allMeasured = select({
      papers: [paper("p-full", "Measured paper", [qMeasured.id], 10)],
      questions: [qMeasured],
      mastery: [masteryRow(TOPIC_A, 0.75, 6)],
    });
    expect(allMeasured.candidates[0]!.predictedPercent).toBe(75);
  });

  it("builds an honest reason for the recommended paper mentioning its factors", () => {
    const qa = question("qA", TOPIC_A, 3);
    const result = select({
      papers: [paper("p1", "The paper", [qa.id], 10)],
      questions: [qa],
      mistakes: [mistake("m1", TOPIC_A, 1, 3)],
      mastery: [masteryRow(TOPIC_A, 0.8, 5)],
    });
    expect(result.recommended).not.toBeNull();
    expect(result.recommended!.reason.length).toBeGreaterThan(10);
    expect(result.recommended!.reason).toContain("Ranked first");
  });
});

describe("cohort hygiene", () => {
  it("ignores papers with no usable questions and papers of other subjects", () => {
    const q = question("qA", TOPIC_A, 3);
    const result = select({
      papers: [
        paper("p-empty", "No questions", [], 0),
        paper("p-other", "Other subject", [q.id], 10, "wjec-alevel-chemistry"),
        paper("p-good", "Usable", [q.id], 10),
      ],
      questions: [q],
    });
    expect(result.candidates.map((c) => c.paperId)).toEqual(["p-good"]);
    expect(result.candidates[0]!.questionCount).toBe(1);
  });

  it("sums to a weighted composite with documented weights", () => {
    const q = question("qA", TOPIC_A, 3);
    const result = select({
      papers: [paper("p1", "Single paper", [q.id], 10)],
      questions: [q],
      mastery: [masteryRow(TOPIC_A, 0.8, 5)],
      attempts: [runAttempt("p1", "r1", q.id, 3)],
    });
    const c = result.candidates[0]!;
    const expected =
      PAPER_SELECT_WEIGHTS.coverage * c.factors.coverage.score +
      PAPER_SELECT_WEIGHTS.weakness * c.factors.weakness.score +
      PAPER_SELECT_WEIGHTS.difficulty * c.factors.difficulty.score +
      PAPER_SELECT_WEIGHTS.recency * c.factors.recency.score +
      PAPER_SELECT_WEIGHTS.exposure * c.factors.exposure.score +
      PAPER_SELECT_WEIGHTS.gain * c.factors.gain.score;
    expect(c.score).toBeCloseTo(expected, 10);
  });
});

describe("target-grade fit gate", () => {
  const BOUNDARIES = [
    { grade: "A", percent: 70 },
    { grade: "B", percent: 60 },
    { grade: "C", percent: 50 },
  ];

  it("sets aside papers predicted far above what the target needs", () => {
    const q = question("qA", TOPIC_A, 3);
    const result = select({
      papers: [paper("p-easy", "Too easy now", [q.id], 10)],
      questions: [q],
      mastery: [masteryRow(TOPIC_A, 0.95, 6)], // predicted ≈95%
      targetGrade: "B",
      gradeBoundaries: BOUNDARIES, // needs 60 → 95 is 35 above
    });
    expect(result.candidates).toHaveLength(0);
    expect(result.recommended).toBeNull();
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({
      paperId: "p-easy",
      direction: "easier",
      predictedPercent: 95,
      neededPercent: 60,
      targetGrade: "B",
    });
    expect(result.skipped[0]!.reason).toContain("would not change anything");
  });

  it("sets aside papers predicted far below what the target needs", () => {
    const q = question("qA", TOPIC_A, 3);
    const result = select({
      papers: [paper("p-hard", "Out of reach", [q.id], 10)],
      questions: [q],
      mastery: [masteryRow(TOPIC_A, 0.3, 6)], // predicted ≈30%
      targetGrade: "B",
      gradeBoundaries: BOUNDARIES, // needs 60 → 30 is 30 below
    });
    expect(result.candidates).toHaveLength(0);
    expect(result.skipped[0]).toMatchObject({ paperId: "p-hard", direction: "harder" });
    expect(result.skipped[0]!.reason).toContain("Close the gap");
  });

  it("keeps near-miss papers sitting — a scraped paper is exactly the one to sit", () => {
    const q = question("qA", TOPIC_A, 3);
    const result = select({
      papers: [paper("p-near", "Near miss", [q.id], 10)],
      questions: [q],
      mastery: [masteryRow(TOPIC_A, 0.68, 6)], // predicted ≈68% vs needed 70 → within 15
      targetGrade: "A",
      gradeBoundaries: BOUNDARIES,
    });
    expect(result.skipped).toHaveLength(0);
    expect(result.candidates).toHaveLength(1);
    expect(result.recommended?.paperId).toBe("p-near");
  });

  it("never skips papers without an honest prediction — no evidence, no gate", () => {
    const qMeasured = question("qM", TOPIC_A, 3, 10);
    const qUnmeasured = question("qU", TOPIC_B, 3, 10);
    const result = select({
      papers: [paper("p-mix", "Unmeasured paper", [qMeasured.id, qUnmeasured.id], 20)],
      questions: [qMeasured, qUnmeasured],
      mastery: [masteryRow(TOPIC_A, 0.95, 6)], // half unmeasured → predictedPercent null
      targetGrade: "C",
      gradeBoundaries: BOUNDARIES,
    });
    expect(result.skipped).toHaveLength(0);
    expect(result.candidates).toHaveLength(1);
  });

  it("is fully neutral without a target or boundaries", () => {
    const q = question("qA", TOPIC_A, 3);
    const noTarget = select({
      papers: [paper("p1", "Paper", [q.id], 10)],
      questions: [q],
      mastery: [masteryRow(TOPIC_A, 0.95, 6)],
      gradeBoundaries: BOUNDARIES,
    });
    const noBoundaries = select({
      papers: [paper("p1", "Paper", [q.id], 10)],
      questions: [q],
      mastery: [masteryRow(TOPIC_A, 0.95, 6)],
      targetGrade: "B",
    });
    const unknownGrade = select({
      papers: [paper("p1", "Paper", [q.id], 10)],
      questions: [q],
      mastery: [masteryRow(TOPIC_A, 0.95, 6)],
      targetGrade: "Z",
      gradeBoundaries: BOUNDARIES,
    });
    for (const r of [noTarget, noBoundaries, unknownGrade]) {
      expect(r.skipped).toEqual([]);
      expect(r.candidates).toHaveLength(1);
    }
  });

  it("resolves the needed percent from the subject's boundaries", () => {
    expect(neededPercentForGrade(BOUNDARIES, "B")).toBe(60);
    expect(neededPercentForGrade(BOUNDARIES, "Z")).toBeNull();
    expect(neededPercentForGrade(undefined, "B")).toBeNull();
    expect(neededPercentForGrade(BOUNDARIES, null)).toBeNull();
  });
});

describe("weakest factor", () => {
  const select = (rows: Partial<PaperSelectionInput>) =>
    selectNextPaper({
      subjectId: SUBJECT,
      papers: [],
      questions: [],
      attempts: [],
      mistakes: [],
      mastery: [],
      topics: TOPICS,
      now: NOW,
      ...rows,
    });

  it("names the factor with the largest weighted shortfall as weakest", () => {
    // All three topics are weak (window losses on each), so weakness scores 1
    // for both papers. Paper A holds the cohort-max loss share on its topic
    // (gain = 1) but covers only 1 of 2 cohort topics; Paper B covers both but
    // holds only the small C-topic losses (gain = 0.2). B therefore ranks
    // second, and its largest weighted shortfall is gain: 0.2 × (1 − 0.2) = 0.16.
    const qA = question("qa", TOPIC_A, 3);
    const qB1 = question("qb1", TOPIC_B, 3, 10);
    const qB2 = question("qb2", TOPIC_C, 3, 10);
    const r = select({
      papers: [paper("pa", "Paper A", [qA.id], 10), paper("pb", "Paper B", [qB1.id, qB2.id], 20)],
      questions: [qA, qB1, qB2],
      mistakes: [mistake("m1", TOPIC_A, 1, 10), mistake("m2", TOPIC_B, 1, 2), mistake("m3", TOPIC_C, 1, 2)],
    });
    expect(r.candidates[0]!.paperId).toBe("pa");
    const runnerUp = r.candidates[1]!;
    expect(runnerUp.paperId).toBe("pb");
    const wf = runnerUp.weakestFactor;
    expect(wf).not.toBeNull();
    expect(wf!.key).toBe("gain");
    expect(wf!.label).toBe("Predicted gain");
    expect(wf!.shortfall).toBeCloseTo(0.16, 5);
    // The detail matches the gain factor chip's detail for the same paper.
    expect(wf!.detail).toBe(runnerUp.factors.gain.detail);
  });

  it("prefers weakness over gain when both score zero (heavier weight wins ties)", () => {
    // No negative evidence anywhere: weakness and gain both score 0 for every
    // paper. Weakness weighs 0.25 > gain 0.2, so the tie resolves to weakness.
    const q1 = question("q1", TOPIC_A, 3);
    const q2 = question("q2", TOPIC_B, 3);
    const r = select({
      papers: [paper("p1", "One", [q1.id], 10), paper("p2", "Two", [q2.id], 10)],
      questions: [q1, q2],
    });
    const c = r.candidates[0]!;
    expect(c.weakestFactor).not.toBeNull();
    expect(c.weakestFactor!.key).toBe("weakness");
  });

  it("stays null when every factor is maxed", () => {
    // Paper W: every topic weak (window losses), holds the cohort-max loss
    // share, covers all 3 syllabus topics, never sat, no mastery rows so no
    // difficulty gap → all six scores 1.0 → nothing is holding it back.
    const qw = [TOPIC_A, TOPIC_B, TOPIC_C].map((t, i) => question(`qw${i}`, t, 3, 5));
    const qv = question("qv", TOPIC_C, 3, 10);
    const r = select({
      papers: [paper("pw", "Paper W", qw.map((q) => q.id), 15), paper("pv", "Paper V", [qv.id], 10)],
      questions: [...qw, qv],
      mistakes: [mistake("m1", TOPIC_A, 1, 10), mistake("m2", TOPIC_B, 1, 8), mistake("m3", TOPIC_C, 1, 4)],
    });
    const w = r.candidates.find((c) => c.paperId === "pw")!;
    expect(w.weakestFactor).toBeNull();
  });

  it("shows weakness for a lone paper with no evidence (0.25 beats gain's 0.2)", () => {
    // Sole paper, no evidence at all: coverage/recency/exposure max, weakness
    // and gain both 0. Shortfalls: weakness 0.25 × 1 = 0.25, gain 0.2 × 1 = 0.2
    // — weakness wins outright (no tie), and the line under the paper is the
    // honest "none of its topics are weak right now".
    const q = question("q1", TOPIC_A, 3);
    const r = select({ papers: [paper("p1", "Only", [q.id], 10)], questions: [q] });
    const wf = r.candidates[0]!.weakestFactor;
    expect(wf).not.toBeNull();
    expect(wf!.key).toBe("weakness");
    expect(wf!.detail).toContain("none of its topics are weak");
  });
});

describe("weakest-factor fix links", () => {
  const select = (rows: Partial<PaperSelectionInput>) =>
    selectNextPaper({
      subjectId: SUBJECT,
      papers: [],
      questions: [],
      attempts: [],
      mistakes: [],
      mastery: [],
      topics: TOPICS,
      now: NOW,
      ...rows,
    });

  it("points a gain-weakest paper at a timed run on the topic where marks actually went", () => {
    // Runner-up B touches topics B and C with 10 marks each; 1 mark lost on
    // B, 3 on C (A carries the cohort-max losses elsewhere). Gain is B's
    // weakest factor (shortfall 0.2 x (1 - 0.2) = 0.16), and the honest timed
    // target is C — most lost marks — not the topic with most paper marks.
    const qA = question("qa", TOPIC_A, 3);
    const qB1 = question("qb1", TOPIC_B, 3, 10);
    const qB2 = question("qb2", TOPIC_C, 3, 10);
    const r = select({
      papers: [paper("pa", "Paper A", [qA.id], 10), paper("pb", "Paper B", [qB1.id, qB2.id], 20)],
      questions: [qA, qB1, qB2],
      mistakes: [mistake("m1", TOPIC_A, 1, 10), mistake("m2", TOPIC_B, 1, 1), mistake("m3", TOPIC_C, 1, 3)],
    });
    const runnerUp = r.candidates[1]!;
    expect(runnerUp.paperId).toBe("pb");
    const wf = runnerUp.weakestFactor!;
    expect(wf.key).toBe("gain");
    expect(wf.fix).toEqual({
      kind: "timed",
      topicId: TOPIC_C,
      topicTitle: "transport",
      href: `/practice?quick=10&subject=${SUBJECT}&topic=${TOPIC_C}`,
    });
  });

  it("points a weakness-weakest paper at a review of its heaviest weak topic", () => {
    // One paper: 4 marks on weak topic A (3 lost there), 16 on healthy C.
    // Weakness shortfall 0.25 x 0.8 = 0.2 beats gain's 0.2 x 0.85 = 0.17, so
    // the fix is the review of A — the only weak topic the paper touches.
    const qA = question("qw1", TOPIC_A, 3, 4);
    const qC = question("qw2", TOPIC_C, 3, 16);
    const r = select({
      papers: [paper("p1", "Only", [qA.id, qC.id], 20)],
      questions: [qA, qC],
      mistakes: [mistake("m1", TOPIC_A, 1, 3)],
    });
    const wf = r.candidates[0]!.weakestFactor!;
    expect(wf.key).toBe("weakness");
    expect(wf.fix).toEqual({
      kind: "review",
      topicId: TOPIC_A,
      topicTitle: "photo",
      href: `/review?subject=${SUBJECT}&topic=${TOPIC_A}`,
    });
  });

  it("leaves the fix off factors no session can fix (difficulty)", () => {
    // Every topic weak and the losses all recovered (gain 1, weakness 1,
    // coverage/recency/exposure maxed) — the only shortfall left is
    // difficulty: a 5/5 paper against 0.3 measured mastery. No session fixes
    // "this paper is too hard for you", so fix stays null.
    const qHard = question("qhard", TOPIC_B, 5, 10);
    const r = select({
      papers: [paper("ph", "Hard", [qHard.id], 10)],
      questions: [qHard],
      mistakes: [mistake("m1", TOPIC_B, 1, 10)],
      mastery: [{ topicId: TOPIC_B, subjectId: SUBJECT, mastery: 0.3, attempts: 10, retention: 0.5, weak: false } as never],
    });
    const hard = r.candidates[0]!;
    expect(hard.weakestFactor).not.toBeNull();
    expect(hard.weakestFactor!.key).toBe("difficulty");
    expect(hard.weakestFactor!.fix).toBeNull();
  });
});
