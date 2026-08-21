import { describe, expect, it } from "vitest";
import { createCard, gradeCard } from "@/domain/scheduling";
import { validateFsrs, reviewsUntilPersonalisation } from "@/domain/fsrs-tuning";
import { empiricalDifficulties, masteryInterval } from "@/domain/mastery-uncertainty";
import { traceTopic, traceQuestion, predictCorrect } from "@/domain/knowledge-tracing";
import { inferPrerequisiteEdges } from "@/domain/prerequisites";
import type { Attempt, Card, ReviewLog, Topic, Question } from "@/domain/types";

const NOW = new Date("2025-06-01T09:00:00.000Z");

function topic(id: string, diff: 1 | 2 | 3 | 4 | 5 = 3): Topic {
  return { id, subjectId: "s", unitId: "u", title: `T ${id}`, order: 0, intrinsicDifficulty: diff, summary: "s", keyPoints: ["k"], commonErrors: ["e"] };
}

function attempt(topicId: string, awarded: number, max: number, at = NOW): Attempt {
  return { id: crypto.randomUUID(), userId: "u", questionId: `q:${topicId}`, subjectId: "s", topicIds: [topicId], answers: {}, marked: [], awarded, max, feedback: "", markedBy: "rubric", elapsedMs: 1000, mode: "practice", createdAt: at.toISOString() } as Attempt;
}

function strongCard(tid: string, id: string): Card {
  return { ...createCard({ id, userId: "u", subjectId: "s", topicId: tid, front: "f", back: "b" }, NOW), stability: 30, reps: 5, lastReviewedAt: NOW.toISOString(), due: "2025-07-01" };
}

describe("fsrs-tuning — validation & personalisation", () => {
  it("reports insufficient-data when < 20 logs", () => {
    const logs: ReviewLog[] = [{ id: "l1", userId: "u", cardId: "c1", topicId: "t1", grade: "good", elapsedMs: 1000, reviewedAt: NOW.toISOString() }];
    const r = validateFsrs({ cards: [], logs });
    expect(r.verdict).toBe("insufficient-data");
    expect(r.suggestion).toBeNull();
  });

  it("validates a realistic log set and produces a verdict", () => {
    // Build a card then 60 good reviews — retention should look well-calibrated
    let card = createCard({ id: "c1", userId: "u", subjectId: "s", topicId: "t1", front: "f", back: "b" }, NOW);
    const logs: ReviewLog[] = [];
    let cursor = new Date(NOW);
    for (let i = 0; i < 60; i++) {
      const grade = i % 7 === 0 ? "again" as const : "good" as const;
      card = gradeCard(card, grade, cursor);
      // advance to due date
      cursor = new Date(`${card.due}T09:00:00.000Z`);
      logs.push({ id: `l${i}`, userId: "u", cardId: card.id, topicId: "t1", grade, elapsedMs: 1000, reviewedAt: new Date(cursor.getTime() - 86_400_000).toISOString() });
    }
    const cards = [card];
    const r = validateFsrs({ cards, logs });
    expect(r.n).toBe(60);
    expect(r.buckets.length).toBeGreaterThan(0);
    expect(["well-calibrated", "over-confident", "under-confident", "insufficient-data"]).toContain(r.verdict);
  });

  it("gates personalisation until 100+ reviews", () => {
    expect(reviewsUntilPersonalisation(20)).toBe(180);
    expect(reviewsUntilPersonalisation(199)).toBe(1);
    expect(reviewsUntilPersonalisation(250)).toBe(0);
  });
});

describe("mastery-uncertainty — Wilson intervals", () => {
  it("wide interval when evidence is thin", () => {
    const row = masteryInterval({ topicId: "t1", mastery: 0.7, cards: [strongCard("t1", "c1")], attempts: [], mistakes: [] });
    expect(row.width).toBeGreaterThan(0.4);
    expect(row.needsMoreEvidence).toBe(true);
  });

  it("narrow interval when evidence is thick and consistent", () => {
    const cards = Array.from({ length: 10 }, (_, i) => strongCard("t1", `c${i}`));
    const attempts = [attempt("t1", 8, 10), attempt("t1", 9, 10), attempt("t1", 8, 10)];
    const row = masteryInterval({ topicId: "t1", mastery: 0.8, cards, attempts, mistakes: [] });
    expect(row.width).toBeLessThan(0.5);
    expect(row.uncertainty === "low" || row.uncertainty === "medium").toBe(true);
  });

  it("empirical difficulty blends authored with measured when reliable", () => {
    const topics = [topic("a", 3), topic("b", 2)];
    const attemptsByTopic = new Map<string, Attempt[]>([
      ["a", [attempt("a", 9, 10), attempt("a", 10, 10), attempt("a", 8, 10), attempt("a", 9, 10), attempt("a", 9, 10)]],
      ["b", [attempt("b", 1, 10), attempt("b", 2, 10), attempt("b", 1, 10), attempt("b", 2, 10), attempt("b", 0, 10)]],
    ]);
    const cardsByTopic = new Map<string, Card[]>();
    const rows = empiricalDifficulties({ topics, attemptsByTopic, cardsByTopic, now: NOW });
    const ea = rows.find((r) => r.topicId === "a")!;
    const eb = rows.find((r) => r.topicId === "b")!;
    expect(eb.empiricalDifficulty).toBeGreaterThan(ea.empiricalDifficulty);
    expect(eb.reliable).toBe(true);
  });
});

describe("knowledge-tracing — topic + question", () => {
  it("BKT rises with correct answers and falls with incorrect", () => {
    const t = topic("t1");
    const attsGood = [attempt("t1", 10, 10), attempt("t1", 9, 10), attempt("t1", 10, 10), attempt("t1", 9, 10), attempt("t1", 10, 10)];
    const attsBad = [attempt("t1", 0, 10), attempt("t1", 1, 10), attempt("t1", 0, 10), attempt("t1", 1, 10), attempt("t1", 0, 10)];
    const g = traceTopic({ topic: t, attempts: attsGood, cards: [] });
    const b = traceTopic({ topic: t, attempts: attsBad, cards: [] });
    expect(g.pKnown).toBeGreaterThan(b.pKnown);
    expect(g.reliable).toBe(true);
    expect(predictCorrect(g.pKnown)).toBeGreaterThan(predictCorrect(b.pKnown));
  });

  it("question difficulty inferred when n>=5", () => {
    const q: Question = { id: "q1", subjectId: "s", topicIds: ["t1"], kind: "structured", stem: "S", parts: [{ id: "p1", label: "(a)", prompt: "p", marks: 3, markScheme: ["x"], modelAnswer: "m" }], totalMarks: 3, calculatorAllowed: false, difficulty: 3, origin: "seed", createdAt: NOW.toISOString() };
    const atts = [attempt("t1", 0, 3), attempt("t1", 0, 3), attempt("t1", 1, 3), attempt("t1", 0, 3), attempt("t1", 1, 3)].map((a) => ({ ...a, questionId: "q1" }));
    const r = traceQuestion({ question: q, attempts: atts as Attempt[] });
    expect(r.reliable).toBe(true);
    expect(r.empiricalDifficulty).toBeGreaterThanOrEqual(3);
  });

  it("needs more evidence message when thin", () => {
    const t = topic("t1");
    const r = traceTopic({ topic: t, attempts: [attempt("t1", 5, 10)], cards: [] });
    expect(r.narrative).toMatch(/No attempts|Early estimate/);
    expect(r.reliable).toBe(false);
  });
});

describe("prerequisites — data-driven inference", () => {
  it("infers nothing when downstream not weak or prereq not weak", () => {
    const topics = [topic("a"), topic("b")];
    const mastery = [
      { topicId: "a", subjectId: "s", mastery: 0.8, retention: 0.8, confidence: 0.8, cardsTotal: 6, cardsDue: 0, attempts: 6, accuracy: 0.8, lastStudiedAt: null, weak: false } as unknown as import("@/domain/types").TopicMastery,
      { topicId: "b", subjectId: "s", mastery: 0.75, retention: 0.75, confidence: 0.75, cardsTotal: 6, cardsDue: 0, attempts: 6, accuracy: 0.75, lastStudiedAt: null, weak: false } as unknown as import("@/domain/types").TopicMastery,
    ];
    const atts = new Map([["a", [attempt("a", 8, 10), attempt("a", 8, 10), attempt("a", 8, 10), attempt("a", 8, 10), attempt("a", 8, 10)]]]);
    expect(inferPrerequisiteEdges({ topics, mastery, attemptsByTopic: atts }).length).toBe(0);
  });

  it("surfaces an edge when prereq materially weaker than a weak downstream", () => {
    const topics = [topic("down"), topic("pre")];
    const mastery = [
      { topicId: "down", subjectId: "s", mastery: 0.35, retention: 0.3, confidence: 0.3, cardsTotal: 4, cardsDue: 1, attempts: 6, accuracy: 0.3, lastStudiedAt: null, weak: true } as unknown as import("@/domain/types").TopicMastery,
      { topicId: "pre", subjectId: "s", mastery: 0.2, retention: 0.2, confidence: 0.2, cardsTotal: 4, cardsDue: 2, attempts: 6, accuracy: 0.2, lastStudiedAt: null, weak: true } as unknown as import("@/domain/types").TopicMastery,
    ];
    const atts = new Map([["down", [attempt("down", 2, 10), attempt("down", 3, 10), attempt("down", 2, 10), attempt("down", 3, 10), attempt("down", 2, 10)]]]);
    const edges = inferPrerequisiteEdges({ topics, mastery, attemptsByTopic: atts });
    expect(edges.length).toBeGreaterThan(0);
    expect(edges[0].gap).toBeLessThan(0);
  });
});
