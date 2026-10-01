import { describe, expect, it } from "vitest";
import { buildAdaptiveSession } from "@/domain/adaptive-session";
import { computeTopicMastery } from "@/domain/mastery";
import { buildProofLedger } from "@/domain/proof-of-improvement";
import { explainSession } from "@/domain/session-explanation";
import type { Attempt, ExamDate, Question, SpecPoint, Topic } from "@/domain/types";

const NOW = new Date("2026-09-30T12:00:00.000Z");
const day = (n: number) => new Date(Date.UTC(2026, 8, n, 9)).toISOString();
const SUBJECT = "aqa-alevel-maths";
const spec = (id: string): SpecPoint => ({ id, ref: id, text: id, aos: ["AO1"] });
const topic = (id: string, statements: number, order: number): Topic => ({
  id, subjectId: SUBJECT, unitId: "u", title: id, order, intrinsicDifficulty: 3, summary: "", keyPoints: [], commonErrors: [],
  specPoints: Array.from({ length: statements }, (_, i) => spec(`${id}.${i}`)),
});
const question = (id: string, topicId: string): Question => ({
  id, subjectId: SUBJECT, topicIds: [topicId], kind: "short", stem: id,
  parts: [{ id: `${id}.a`, label: "", prompt: "p", marks: 4, markScheme: ["x"], modelAnswer: "x" }],
  totalMarks: 4, calculatorAllowed: true, difficulty: 3, origin: "seed", createdAt: day(1),
});
let n = 0;
const attempt = (questionId: string, topicId: string, awarded: number, at: string, extra: Partial<Attempt> = {}): Attempt => ({
  id: `a${n++}`, userId: "u", questionId, subjectId: SUBJECT, topicIds: [topicId], answers: {}, marked: [], awarded, max: 4,
  feedback: "", markedBy: "rubric", elapsedMs: 1, mode: "practice", createdAt: at, ...extra,
});

const topics = [topic("a", 6, 1), topic("b", 2, 2)];
const bank = [...Array.from({ length: 10 }, (_, i) => question(`a${i}`, "a")), ...Array.from({ length: 10 }, (_, i) => question(`b${i}`, "b"))];

function planFor(attempts: Attempt[], exams: ExamDate[] = [], topicId?: string) {
  const mastery = computeTopicMastery({ topics, cards: [], reviewLogs: [], attempts, mistakes: [], questions: bank, now: NOW });
  const proofLedger = buildProofLedger({ topics, attempts, questions: bank, now: NOW });
  const plan = buildAdaptiveSession({ topics, cards: [], reviewLogs: [], questions: bank, attempts, mistakes: [], mastery, exams, subjectIds: [SUBJECT], proofLedger, now: NOW, ...(topicId ? { topicId } : {}) });
  return plan!;
}

describe("session explanation", () => {
  it("tells a review-gated subject's student the truth: practice counts, but is not proof yet", () => {
    const gatedTopics = topics.map((t) => ({ ...t, subjectId: "wjec-alevel-maths" }));
    const gatedBank = bank.map((q) => ({ ...q, subjectId: "wjec-alevel-maths" }));
    const attempts = [1, 2, 3, 4].map((d) => ({ ...attempt(`a${d}`, "a", 3, day(d)), subjectId: "wjec-alevel-maths" }));
    const plan = buildAdaptiveSession({
      topics: gatedTopics, cards: [], reviewLogs: [], questions: gatedBank, attempts, mistakes: [], mastery: [], exams: [],
      subjectIds: ["wjec-alevel-maths"], now: NOW, topicId: "a",
    })!;
    const explanation = explainSession(plan);
    expect(explanation.stakes).toMatch(/not enough evidence/i);
    expect(explanation.lines.some((line) => line.tone === "gap" && /awaiting human review/.test(line.text))).toBe(true);
  });

  it("makes no marks claim for a new student and says what this session is for", () => {
    const explanation = explainSession(planFor([]));
    expect(explanation.stakes).toMatch(/not enough evidence/i);
    expect(explanation.stakes).not.toMatch(/marks of 100/);
    expect(explanation.lines.some((line) => /nothing to claim/i.test(line.text))).toBe(true);
    expect(explanation.lines.at(-1)?.tone).toBe("proof");
    expect(explanation.lines.at(-1)?.text).toMatch(/baseline/i);
  });

  it("states marks at stake as a range once different questions give the evidence for it", () => {
    const attempts = Array.from({ length: 8 }, (_, i) => attempt(`a${i}`, "a", 2, day(i + 1)));
    const explanation = explainSession(planFor(attempts, [], "a"));
    expect(explanation.stakes).toMatch(/Up to about \d+(–\d+)? marks of 100.*; about \d+(–\d+)? look recoverable/);
    expect(explanation.lines.some((line) => /default until you have proven topics of your own/.test(line.text))).toBe(true);
    expect(explanation.lines.some((line) => /different questions/.test(line.text))).toBe(true);
  });

  it("does not turn thin evidence into a marks claim", () => {
    const explanation = explainSession(planFor([attempt("a0", "a", 2, day(1))], [], "a"));
    expect(explanation.stakes).not.toMatch(/marks of 100/);
    expect(explanation.stakes).toMatch(/little evidence|not enough evidence/i);
  });

  it("calls out repeats and why they count for less", () => {
    const attempts = [1, 2, 3, 4, 5].map((d) => attempt("a0", "a", 4, day(d)));
    const plan = planFor(attempts, [], "a");
    const text = explainSession(plan).lines.map((line) => line.text).join(" ");
    expect(plan.topicId).toBe("a");
    expect(text).toMatch(/4 of your 5 answers repeated a question/);
  });

  it("names the heavier topic's weight and the exam countdown strategy", () => {
    const exam: ExamDate[] = [{ id: "e", userId: "u", subjectId: SUBJECT, label: "Paper 1", date: "2026-10-12" }];
    const explanation = explainSession(planFor([], exam));
    const text = explanation.lines.map((line) => line.text).join(" ");
    expect(text).toMatch(/Carries more of the exam than an average topic: about 75%/);
    expect(text).toMatch(/exam in 12 days/);
    expect(text).toMatch(/Exam technique/);
  });

  it("surfaces an evidence gap instead of hiding it", () => {
    const all = Array.from({ length: 10 }, (_, i) => attempt(`a${i}`, "a", 2, day(i + 1)));
    const gapPlan = planFor(all, [], "a");
    expect(gapPlan.topicId).toBe("a");
    const explanation = explainSession(gapPlan);
    expect(explanation.lines.some((line) => line.tone === "gap" && /new proof needs new questions/i.test(line.text))).toBe(true);
  });

  it("keeps the answer short and always ends with how this will be proven", () => {
    const attempts = [1, 2, 3, 4, 5].map((d) => attempt("a0", "a", 2, day(d)));
    const exam: ExamDate[] = [{ id: "e", userId: "u", subjectId: SUBJECT, label: "Paper 1", date: "2026-10-12" }];
    const explanation = explainSession(planFor(attempts, exam, "a"));
    expect(explanation.lines.length).toBeLessThanOrEqual(5);
    expect(explanation.lines.at(-1)?.tone).toBe("proof");
  });

  it("uses the learner's own conversion rate once they have proven topics", () => {
    const attempts = Array.from({ length: 8 }, (_, i) => attempt(`a${i}`, "a", 2, day(i + 1)));
    const plan = planFor(attempts, [], "a");
    const own = explainSession(plan, { rate: 0.7, pairs: 3, observed: true });
    const text = own.lines.map((line) => line.text).join(" ");
    expect(text).toMatch(/about 70% of the gap: your own rate across 3 proven topics/);
    const defaultRate = explainSession(plan);
    expect(own.stakes).not.toBe(defaultRate.stakes);
  });
});
