import { describe, expect, it } from "vitest";
import { buildProgressSummary } from "@/domain/progress-summary";
import type { ProofLedger, TopicProof } from "@/domain/proof-of-improvement";
import type { Attempt, Mistake, Question, Topic } from "@/domain/types";

const NOW = new Date("2026-10-01T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const topic = (id: string, subjectId = "maths"): Topic => ({ id, subjectId, unitId: "u", title: `Topic ${id}`, order: 1, intrinsicDifficulty: 2, summary: "", keyPoints: [], commonErrors: [] });
const q = (id: string, topicId: string, family = id): Question => ({
  id, subjectId: "maths", topicIds: [topicId], kind: "short", stem: id, totalMarks: 3, calculatorAllowed: true, difficulty: 3, origin: "seed",
  createdAt: "2026-01-01T00:00:00.000Z", learning: { familyId: family, contextId: family, expectedMinutes: 3 } as Question["learning"],
  parts: [{ id: `${id}:a`, label: "", prompt: "p", marks: 3, markScheme: ["a"], modelAnswer: "m" }],
}) as Question;
const att = (id: string, question: Question, awarded: number, daysAgo: number): Attempt => ({
  id, userId: "u", questionId: question.id, subjectId: "maths", topicIds: question.topicIds, answers: {}, marked: [], awarded, max: 3, feedback: "",
  markedBy: "rubric", elapsedMs: 1000, mode: "practice", createdAt: day(daysAgo),
});
const proof = (topicId: string, o: Partial<TopicProof>): TopicProof => ({ topicId, subjectId: "maths", share: 0.1, status: "untested", proofDue: false, illusory: false, markPoints: 0, ...o } as TopicProof);

describe("progress summary", () => {
  it("is a cold start with no evidence and invents no strengths", () => {
    const s = buildProgressSummary({ subjectIds: ["maths"], topics: [topic("t1")], attempts: [], questions: [], mistakes: [], now: NOW });
    expect(s.coldStart).toBe(true);
    expect(s.strong).toEqual([]);
    expect(s.losing.totalMarks).toBe(0);
    expect(s.proven.topics).toEqual([]);
    expect(s.stageCounts.untouched).toBe(1);
  });

  it("lists secure topics as strong and keeps repeats from counting", () => {
    const qs = [q("a", "t1"), q("b", "t1"), q("c", "t1"), q("x", "t2")];
    const attempts = [att("1", qs[0]!, 3, 4), att("2", qs[1]!, 3, 3), att("3", qs[2]!, 3, 2), ...[1, 2, 3, 4].map((i) => att(`r${i}`, qs[3]!, 3, i))];
    const s = buildProgressSummary({ subjectIds: ["maths"], topics: [topic("t1"), topic("t2")], attempts, questions: qs, mistakes: [], now: NOW });
    expect(s.coldStart).toBe(false);
    expect(s.strong.map((row) => row.topicId)).toEqual(["t1"]);
    expect(s.strong[0]!.label).toBe("Secure");
    expect(s.stageCounts.learning).toBe(1);
  });

  it("reports marks lost, recurring patterns, and proven gains separately", () => {
    const mistakes = [
      { id: "m1", userId: "u", subjectId: "maths", topicId: "t1", questionId: "qa", marksLost: 2, description: "", category: "communication", resolved: false, createdAt: day(5) },
      { id: "m2", userId: "u", subjectId: "maths", topicId: "t1", questionId: "qb", marksLost: 3, description: "", category: "communication", resolved: false, createdAt: day(2) },
    ] as Mistake[];
    const ledger = { topics: [proof("t1", { status: "proven-gain", markPoints: 1.5 }), proof("t2", { status: "proven-gain", illusory: true, markPoints: 4 }), proof("t3", { status: "declined", markPoints: -1 }), proof("t4", { proofDue: true })] } as ProofLedger;
    const s = buildProgressSummary({ subjectIds: ["maths"], topics: [topic("t1")], attempts: [], questions: [], mistakes, ledger, nextHeadline: "15-minute topic t1 application session", now: NOW });
    expect(s.losing.patterns[0]).toMatchObject({ cause: "insufficient-explanation", recurring: true });
    expect(s.proven.topics.map((row) => row.topicId)).toEqual(["t1"]);
    expect(s.proven).toMatchObject({ declined: 1, awaiting: 1, markPoints: 1.5 });
    expect(s.next).toMatch(/application session/);
  });

  it("surfaces due checks, memorised topics, slips and only ledger-backed claims", () => {
    const win = (rate: number) => ({ rate, low: rate - 0.1, high: rate + 0.1, questions: 4, from: day(30), to: day(20) });
    const ledger = { topics: [
      proof("t1", { status: "proven-gain", before: win(0.46), after: win(0.72), markPoints: 2 }),
      proof("t2", { status: "awaiting-proof", proofDue: true }),
      proof("t3", { status: "proven-gain", illusory: true, before: win(0.3), after: win(0.9), markPoints: 5 }),
      proof("t4", { status: "declined" }),
    ] } as ProofLedger;
    const topics = ["t1", "t2", "t3", "t4"].map((id) => topic(id));
    const s = buildProgressSummary({ subjectIds: ["maths"], topics, attempts: [], questions: [], mistakes: [], ledger, now: NOW });
    expect(s.lifecycle.claims).toEqual(["Your unseen-question performance in Topic t1 improved from about 45% to about 70% after revision."]);
    expect(s.lifecycle.dueNow.map((row) => row.topicId)).toEqual(["t2"]);
    expect(s.lifecycle.memorised.map((row) => row.topicId)).toEqual(["t3"]);
    expect(s.lifecycle.slipped.map((row) => row.topicId)).toEqual(["t4"]);
    expect(s.lifecycle.counts).toMatchObject({ proven: 1, "awaiting-proof": 1, "looks-learned": 1, slipped: 1 });
  });

  it("has an empty lifecycle with no evidence", () => {
    const s = buildProgressSummary({ subjectIds: ["maths"], topics: [topic("t1")], attempts: [], questions: [], mistakes: [], now: NOW });
    expect(s.lifecycle).toMatchObject({ dueNow: [], memorised: [], slipped: [], claims: [] });
    expect(s.lifecycle.counts["not-started"]).toBe(1);
  });

  it("ignores subjects the learner is not taking", () => {
    const s = buildProgressSummary({ subjectIds: ["maths"], topics: [topic("t1"), topic("z", "other")], attempts: [], questions: [], mistakes: [], now: NOW });
    expect(Object.values(s.stageCounts).reduce((a, b) => a + b, 0)).toBe(1);
  });
});
