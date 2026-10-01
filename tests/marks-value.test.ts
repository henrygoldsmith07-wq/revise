import { describe, expect, it } from "vitest";
import { buildAdaptiveSession, scoreAdaptiveTopic } from "@/domain/adaptive-session";
import { exposureWeights, repeatWeight, REPEAT_WEIGHTS } from "@/domain/evidence-weights";
import { computeTopicMastery } from "@/domain/mastery";
import { buildTopicValues, evidenceGapReport, evidenceGaps, provenPerformance, topicSupply } from "@/domain/marks-value";
import { relativeTopicWeight, topicShares } from "@/domain/topic-weight";
import type { Attempt, ExamDate, Question, SpecPoint, Topic } from "@/domain/types";

const NOW = new Date("2026-09-05T12:00:00.000Z");

const spec = (id: string): SpecPoint => ({ id, ref: id, text: id, aos: ["AO1"] });
function topic(id: string, subjectId: string, statements?: number, order = 1): Topic {
  return {
    id, subjectId, unitId: `${subjectId}.u`, title: id, order, intrinsicDifficulty: 3, summary: "", keyPoints: [], commonErrors: [],
    ...(statements ? { specPoints: Array.from({ length: statements }, (_, i) => spec(`${id}.sp${i}`)) } : {}),
  };
}
function question(id: string, topicId: string, subjectId = "s"): Question {
  return {
    id, subjectId, topicIds: [topicId], kind: "short", stem: id,
    parts: [{ id: `${id}.a`, label: "", prompt: "Explain.", marks: 4, markScheme: ["x"], modelAnswer: "x" }],
    totalMarks: 4, calculatorAllowed: true, difficulty: 3, origin: "seed", createdAt: NOW.toISOString(),
  };
}
let counter = 0;
function attempt(questionId: string, topicId: string, awarded: number, day: number, overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: `a${counter++}`, userId: "u", questionId, subjectId: "s", topicIds: [topicId], answers: {}, marked: [],
    awarded, max: 4, feedback: "", markedBy: "rubric", elapsedMs: 1000, mode: "practice",
    createdAt: new Date(Date.UTC(2026, 7, day, 9)).toISOString(), ...overrides,
  };
}

describe("exposure weights", () => {
  it("counts the first exposure in full and discounts each repeat", () => {
    const rows = [attempt("q", "t", 4, 1), attempt("q", "t", 4, 2), attempt("q", "t", 4, 3), attempt("q", "t", 4, 4), attempt("q", "t", 4, 5), attempt("other", "t", 4, 2)];
    const weights = exposureWeights(rows);
    expect(rows.map((row) => weights.get(row.id))).toEqual([1, 0.35, 0.15, 0.05, 0.05, 1]);
    expect(repeatWeight(99)).toBe(REPEAT_WEIGHTS[REPEAT_WEIGHTS.length - 1]);
    expect(repeatWeight(-3)).toBe(1);
  });

  it("orders by time, not by array position, and keeps learners apart", () => {
    const late = attempt("q", "t", 4, 9);
    const early = attempt("q", "t", 0, 1);
    const weights = exposureWeights([late, early]);
    expect(weights.get(early.id)).toBe(1);
    expect(weights.get(late.id)).toBe(0.35);
    const other = { ...attempt("q", "t", 4, 2), userId: "someone-else" };
    expect(exposureWeights([early, other]).get(other.id)).toBe(1);
  });
});

describe("topic weight", () => {
  it("shares a subject's exam by specification statements, summing to one per subject", () => {
    const topics = [topic("big", "s1", 6), topic("small", "s1", 2), topic("other", "s2", 3)];
    const shares = topicShares(topics);
    expect(shares.get("big")).toBeCloseTo(0.75, 5);
    expect(shares.get("small")).toBeCloseTo(0.25, 5);
    expect(shares.get("other")).toBe(1);
    expect(relativeTopicWeight(0.75, 2)).toBeCloseTo(1.5, 5);
  });

  it("falls back to equal weights rather than inventing data when statements are missing", () => {
    const shares = topicShares([topic("a", "s"), topic("b", "s"), topic("c", "s")]);
    for (const share of shares.values()) expect(share).toBeCloseTo(1 / 3, 5);
  });
});

describe("proven performance", () => {
  const weights = (rows: Attempt[]) => exposureWeights(rows);

  it("claims nothing without evidence", () => {
    const proven = provenPerformance([], new Map());
    expect(proven.level).toBe("none");
    expect(proven.effectiveQuestions).toBe(0);
    expect(proven.high - proven.low).toBeGreaterThan(0.5);
  });

  it("narrows with different questions but not with repeats of one", () => {
    const repeats = Array.from({ length: 8 }, (_, i) => attempt("only", "t", 4, i + 1));
    const distinct = Array.from({ length: 8 }, (_, i) => attempt(`q${i}`, "t", 4, i + 1));
    const a = provenPerformance(repeats, weights(repeats));
    const b = provenPerformance(distinct, weights(distinct));
    expect(a.distinctQuestions).toBe(1);
    expect(b.distinctQuestions).toBe(8);
    expect(b.low).toBeGreaterThan(a.low + 0.1);
    expect(b.level).toBe("solid");
    expect(["thin", "building"]).toContain(a.level);
  });

  it("treats hinted successes as weaker evidence and excludes recall practice", () => {
    const base = Array.from({ length: 4 }, (_, i) => attempt(`q${i}`, "t", 4, i + 1));
    const hinted = base.map((row) => ({ ...row, hintTier: "prompt" as const }));
    const recall = base.map((row) => ({ ...row, mode: "recall" as const }));
    const independent = provenPerformance(base, weights(base));
    expect(provenPerformance(hinted, weights(hinted)).rate).toBeLessThan(independent.rate);
    expect(provenPerformance(hinted, weights(hinted)).independentQuestions).toBe(0);
    expect(provenPerformance(recall, weights(recall)).level).toBe("none");
  });
});

describe("evidence gaps", () => {
  const bank = [question("a", "t"), question("b", "t"), question("c", "t"), question("d", "t")];
  it("distinguishes no questions, none unseen and few unseen", () => {
    expect(evidenceGaps(topicSupply([], new Set()))[0]?.kind).toBe("no-questions");
    const gated = [{ ...question("w1", "t"), subjectId: "wjec-alevel-maths" }, { ...question("w2", "t"), subjectId: "wjec-alevel-maths" }];
    const unreviewed = evidenceGaps(topicSupply(gated, new Set()))[0];
    expect(unreviewed?.kind).toBe("unreviewed");
    expect(unreviewed?.text).toMatch(/awaiting human review.*not counted as proof/);
    expect(evidenceGaps(topicSupply(bank, new Set(["a", "b", "c", "d"])))[0]?.kind).toBe("no-unseen");
    expect(evidenceGaps(topicSupply(bank, new Set(["a", "b"])))[0]?.kind).toBe("few-unseen");
    expect(evidenceGaps(topicSupply(bank, new Set(["a"])))).toEqual([]);
  });
});

describe("the optimiser values marks, honestly", () => {
  it("ranks the topic that carries more of the exam first when all else is equal", () => {
    const topics = [topic("light", "s", 2, 1), topic("heavy", "s", 6, 2)];
    const bank = [...["l1", "l2", "l3"].map((id) => question(id, "light")), ...["h1", "h2", "h3"].map((id) => question(id, "heavy"))];
    const plan = buildAdaptiveSession({
      topics, cards: [], reviewLogs: [], questions: bank, attempts: [], mistakes: [], mastery: [], exams: [], subjectIds: ["s"], now: NOW,
    });
    expect(plan?.topicId).toBe("heavy");
    expect(plan?.evidence.value?.relativeWeight).toBeGreaterThan(1);
    expect(plan?.evidence.value?.stakesFactor).toBeGreaterThan(1);
  });

  it("does not treat one memorised question as a secure topic", () => {
    const topics = [topic("memorised", "s", 3, 1), topic("proven", "s", 3, 2)];
    const bank = [...Array.from({ length: 8 }, (_, i) => question(`m${i}`, "memorised")), ...Array.from({ length: 8 }, (_, i) => question(`p${i}`, "proven"))];
    const attempts = [
      ...[1, 2, 3, 4, 5, 6].map((day) => attempt("m0", "memorised", 4, day)),
      ...[1, 2, 3, 4, 5, 6].map((day) => attempt(`p${day}`, "proven", 4, day)),
    ];
    const mastery = computeTopicMastery({ topics, cards: [], reviewLogs: [], attempts, mistakes: [], questions: bank, now: NOW });
    const plan = buildAdaptiveSession({
      topics, cards: [], reviewLogs: [], questions: bank, attempts, mistakes: [], mastery, exams: [], subjectIds: ["s"], now: NOW,
    });
    expect(plan?.topicId).toBe("memorised");
    const rowFor = (id: string) => mastery.find((row) => row.topicId === id);
    const onTopic = (id: string) => attempts.filter((row) => row.topicIds[0] === id);
    const proven = scoreAdaptiveTopic({ topic: topics[1]!, cards: [], reviewLogs: [], questions: bank.filter((q) => q.topicIds[0] === "proven"), attempts: onTopic("proven"), mistakes: [], exams: [], mastery: rowFor("proven"), now: NOW });
    const memorised = scoreAdaptiveTopic({ topic: topics[0]!, cards: [], reviewLogs: [], questions: bank.filter((q) => q.topicIds[0] === "memorised"), attempts: onTopic("memorised"), mistakes: [], exams: [], mastery: rowFor("memorised"), now: NOW });
    expect(rowFor("memorised")!.mastery).toBeLessThan(rowFor("proven")!.mastery);
    expect(memorised.evidence.value?.proven.independentQuestions).toBe(1);
    expect(proven.evidence.value?.proven.independentQuestions).toBe(6);
    expect(memorised.score).toBeGreaterThan(proven.score);
  });

  it("scores a topic with no unseen questions below the same topic with fresh ones", () => {
    const t = topic("t", "s", 3);
    const bank = ["a", "b", "c", "d"].map((id) => question(id, "t"));
    const seenAll = ["a", "b", "c", "d"].map((id, i) => attempt(id, "t", 2, i + 1));
    const seenSome = seenAll.slice(0, 1);
    const none = scoreAdaptiveTopic({ topic: t, cards: [], reviewLogs: [], questions: bank, attempts: seenAll, mistakes: [], exams: [], now: NOW });
    const some = scoreAdaptiveTopic({ topic: t, cards: [], reviewLogs: [], questions: bank, attempts: seenSome, mistakes: [], exams: [], now: NOW });
    expect(none.evidence.value?.gaps[0]?.kind).toBe("no-unseen");
    expect(none.evidence.value?.supplyFactor).toBe(0.85);
    expect(some.evidence.value?.gaps).toEqual([]);
  });

  it("will not open an untouched topic in the final days, but keeps measured work", () => {
    const t = topic("t", "s", 3);
    const bank = ["a", "b", "c"].map((id) => question(id, "t"));
    const exam: ExamDate[] = [{ id: "e", userId: "u", subjectId: "s", label: "Paper", date: "2026-09-07" }];
    const untouched = scoreAdaptiveTopic({ topic: t, cards: [], reviewLogs: [], questions: bank, attempts: [], mistakes: [], exams: exam, now: NOW });
    const measured = scoreAdaptiveTopic({ topic: t, cards: [], reviewLogs: [], questions: bank, attempts: [attempt("a", "t", 1, 1)], mistakes: [], exams: exam, now: NOW });
    expect(untouched.evidence.value?.phase).toBe("final");
    expect(untouched.evidence.value?.phaseFactor).toBe(0.35);
    expect(measured.evidence.value?.phaseFactor).toBe(1);
    const far = scoreAdaptiveTopic({ topic: t, cards: [], reviewLogs: [], questions: bank, attempts: [], mistakes: [], exams: [{ ...exam[0]!, date: "2026-12-01" }], now: NOW });
    expect(far.evidence.value?.phaseFactor).toBe(1);
  });

  it("states no marks claim for a brand-new student", () => {
    const t = topic("t", "s", 3);
    const row = scoreAdaptiveTopic({ topic: t, cards: [], reviewLogs: [], questions: [question("a", "t")], attempts: [], mistakes: [], exams: [], now: NOW });
    expect(row.evidence.value?.proven.level).toBe("none");
    expect(row.evidence.factors.uncertainty).toBe(1);
  });

  it("values every topic for a student studying several subjects", () => {
    const topics = [topic("m1", "maths", 4), topic("m2", "maths", 4), topic("p1", "physics", 10)];
    const values = buildTopicValues({
      topics, shares: topicShares(topics), attempts: [], allAttempts: [], questions: [], daysToExam: (subject) => (subject === "maths" ? 10 : null),
    });
    expect(values.get("m1")?.share).toBeCloseTo(0.5, 5);
    expect(values.get("p1")?.share).toBe(1);
    expect(values.get("m1")?.phase).toBe("technique");
    expect(values.get("p1")?.phase).toBe("foundation");
    expect(values.get("p1")?.gaps[0]?.kind).toBe("no-questions");
  });
});

describe("evidence gap report", () => {
  it("orders gaps by severity then by how much of the exam is affected, and summarises per subject", () => {
    const topics = [topic("big", "s", 6), topic("small", "s", 2), topic("fine", "s", 3), topic("gated", "wjec-alevel-maths", 4)];
    const questions = [
      ...["b1", "b2", "b3"].map((id) => question(id, "big")),
      question("s1", "small"),
      ...["f1", "f2", "f3", "f4"].map((id) => question(id, "fine")),
      { ...question("g1", "gated"), subjectId: "wjec-alevel-maths" },
    ];
    const attempts = [attempt("b1", "big", 2, 1), attempt("b2", "big", 2, 2), attempt("s1", "small", 2, 3)];
    const report = evidenceGapReport({ topics, shares: topicShares(topics), questions, attempts });

    expect(report.rows.map((row) => [row.topicId, row.gap.kind])).toEqual([
      ["gated", "unreviewed"],
      ["small", "no-unseen"],
      ["big", "few-unseen"],
    ]);
    const maths = report.bySubject.find((row) => row.subjectId === "wjec-alevel-maths");
    expect(maths).toMatchObject({ topics: 1, unreviewed: 1 });
    const s = report.bySubject.find((row) => row.subjectId === "s");
    expect(s).toMatchObject({ topics: 3, exhausted: 1, fewUnseen: 1 });
  });

  it("reports nothing when every topic has unseen evidence-grade questions", () => {
    const topics = [topic("fine", "s", 3)];
    const questions = ["f1", "f2", "f3", "f4"].map((id) => question(id, "fine"));
    expect(evidenceGapReport({ topics, shares: topicShares(topics), questions, attempts: [] })).toEqual({ rows: [], bySubject: [] });
  });
});
