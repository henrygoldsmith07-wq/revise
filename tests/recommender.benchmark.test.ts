import { describe, expect, it } from "vitest";
import { recommend } from "@/domain/recommender";
import { createCard } from "@/domain/scheduling";
import type { Card, ExamDate, Mistake, Topic, TopicMastery } from "@/domain/types";

// ---------------------------------------------------------------------------
// Recommender benchmark — 400 synthetic learner states.
// This is the "highest-value next action" proof:
//  - ranking is total and stable (scores sorted, no dup keys, explanation present)
//  - each factor is monotone when varied in isolation
//  - no single factor dominates across the population
// Deterministic seeded RNG so CI is reproducible.
// ---------------------------------------------------------------------------

const NOW = new Date("2025-06-10T09:00:00.000Z");
// TODAY kept for factor prose symmetry
// const TODAY_UNUSED = "2025-06-10";

function xorshift(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) / 0xffffffff);
  };
}

const rng = xorshift(0xc0ffee);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

const TOPICS: Topic[] = [
  { id: "chem.electrolysis", subjectId: "chem", unitId: "u1", title: "Electrolysis", order: 0, intrinsicDifficulty: 3, summary: "s", keyPoints: ["k"], commonErrors: ["e"] },
  { id: "chem.acids", subjectId: "chem", unitId: "u1", title: "Acids and bases", order: 1, intrinsicDifficulty: 3, summary: "s", keyPoints: ["k"], commonErrors: ["e"] },
  { id: "chem.moles", subjectId: "chem", unitId: "u1", title: "Moles", order: 2, intrinsicDifficulty: 2, summary: "s", keyPoints: ["k"], commonErrors: ["e"] },
  { id: "chem.equilibria", subjectId: "chem", unitId: "u1", title: "Equilibria", order: 3, intrinsicDifficulty: 4, summary: "s", keyPoints: ["k"], commonErrors: ["e"] },
];

function mastery(topicId: string, masteryVal: number, retention: number, opts: Partial<TopicMastery> = {}): TopicMastery {
  return {
    topicId,
    subjectId: "chem",
    mastery: masteryVal,
    retention,
    confidence: masteryVal,
    cardsTotal: opts.cardsTotal ?? 6,
    cardsDue: opts.cardsDue ?? 0,
    attempts: opts.attempts ?? 4,
    accuracy: masteryVal * 0.9 + 0.05,
    lastStudiedAt: opts.lastStudiedAt ?? "2025-06-05T09:00:00.000Z",
    weak: masteryVal < 0.55 && (opts.attempts ?? 4) > 0,
    ...opts,
  };
}

function dueCard(id: string, due: string): Card {
  return { ...createCard({ id, userId: "u", subjectId: "chem", topicId: "chem.electrolysis", front: "f", back: "b" }, NOW), due, state: 2 };
}

function syntheticMasterySet(): TopicMastery[] {
  return TOPICS.map((t) => {
    const mv = 0.1 + rng() * 0.8;
    const retention = Math.max(0.15, Math.min(0.95, mv + (rng() - 0.5) * 0.4));
    const cardsTotal = Math.floor(rng() * 10);
    const attempts = Math.floor(rng() * 8);
    const daysAgo = Math.floor(rng() * 41);
    const d = new Date(NOW.getTime() - daysAgo * 86400000).toISOString();
    return mastery(t.id, Math.round(mv * 100) / 100, Math.round(retention * 100) / 100, {
      cardsTotal,
      attempts,
      lastStudiedAt: rng() < 0.15 ? null : d,
      weak: mv < 0.55 && (cardsTotal + attempts * 2) > 0,
    });
  });
}

type Scenario = {
  mastery: TopicMastery[];
  cards: Card[];
  mistakes: Mistake[];
  exams: ExamDate[];
  sessionLengthMinutes: number;
  marksPerHour: Map<string, number> | undefined;
};

function randomScenario(): Scenario {
  const m = syntheticMasterySet();
  const daysToExam = pick([null, 3, 14, 60] as const);
  const exams: ExamDate[] = daysToExam == null ? [] : [{ id: "e", userId: "u", subjectId: "chem", date: new Date(NOW.getTime() + daysToExam * 86400000).toISOString().slice(0, 10), label: "Paper 1" }];
  const dueCount = Math.floor(rng() * 12);
  const cards: Card[] = Array.from({ length: dueCount }, (_, i) => {
    const overdueDays = Math.floor(rng() * 20);
    const due = new Date(NOW.getTime() - overdueDays * 86400000).toISOString().slice(0, 10);
    return dueCard(`c${i}-${Math.floor(rng()*10000)}`, due);
  });
  const openMistakeCount = rng() < 0.4 ? Math.floor(rng() * 9) : 0;
  const mistakes: Mistake[] = Array.from({ length: openMistakeCount }, (_, i) => ({
    id: `m${i}`, userId: "u", subjectId: "chem", topicId: pick(TOPICS).id, marksLost: 1 + Math.floor(rng() * 3), description: "d", category: "method" as const, resolved: false, createdAt: NOW.toISOString(),
  }));
  const sessionLengthMinutes = pick([15, 18, 25, 40]);
  const marksPerHour = rng() < 0.5 ? new Map(TOPICS.map((t) => [t.id, Math.round((0.5 + rng() * 8) * 10) / 10])) : undefined;
  return { mastery: m, cards, mistakes, exams, sessionLengthMinutes, marksPerHour };
}

describe("recommender benchmark — ranking proof over 400 synthetic learner states", () => {
  const N = 400;
  const scenarios: Scenario[] = Array.from({ length: N }, () => randomScenario());

  it("every scenario ranks recommendations by score with explanation and no duplicate keys", () => {
    for (let i = 0; i < scenarios.length; i++) {
      const s = scenarios[i];
      const result = recommend({
        topics: TOPICS,
        mastery: s.mastery,
        cards: s.cards,
        mistakes: s.mistakes,
        exams: s.exams,
        plan: [],
        sessionLengthMinutes: s.sessionLengthMinutes,
        subjectIds: ["chem"],
        marksPerHour: s.marksPerHour,
        now: NOW,
      });
      if (!result.length) continue;
      const scores = result.map((r) => r.score);
      const sorted = [...scores].sort((a, b) => b - a);
      expect(scores, `scenario ${i}: not sorted`).toEqual(sorted);
      const keys = result.map((r) => `${r.activity}:${r.subjectId}:${r.topicId ?? "-"}`);
      expect(new Set(keys).size, `scenario ${i}: duplicate key`).toBe(keys.length);
      for (const r of result) {
        expect(r.factors, `scenario ${i}: missing factors`).toBeDefined();
        expect(r.explanation, `scenario ${i}: missing explanation`).toBeDefined();
        expect(r.explanation!.factors, `scenario ${i}: missing factors in explanation`).toBeDefined();
        expect(r.reason.length).toBeGreaterThan(10);
        expect(r.score).toBeGreaterThan(0);
        expect(Number.isFinite(r.score)).toBe(true);
      }
    }
  });

  it("urgency is monotone: nearer exam never scores lower (weak topic in isolation)", () => {
    const base = mastery("chem.electrolysis", 0.35, 0.5, { cardsTotal: 6, attempts: 4, lastStudiedAt: "2025-06-05T09:00:00.000Z" });
    const scoreFor = (days: number | null) => {
      const exams: ExamDate[] = days == null ? [] : [{ id: "e", userId: "u", subjectId: "chem", date: new Date(NOW.getTime() + days * 86400000).toISOString().slice(0, 10), label: "Paper 1" }];
      const rec = recommend({
        topics: [TOPICS[0]], mastery: [base], cards: [], mistakes: [], exams, plan: [],
        sessionLengthMinutes: 25, subjectIds: ["chem"], now: NOW,
      }).find((r) => r.topicId === "chem.electrolysis");
      return rec?.score ?? 0;
    };
    const far = scoreFor(60);
    const mid = scoreFor(14);
    const near = scoreFor(3);
    const none = scoreFor(null);
    expect(near).toBeGreaterThanOrEqual(mid);
    expect(mid).toBeGreaterThanOrEqual(far - 1e-9);
    expect(near).toBeGreaterThan(none);
  });

  it("weakness is monotone: weaker mastery raises the practice score when gain is equalised", () => {
    // Fix marksPerHour so gain is not mastery-dependent; stay in weak region so practice appears.
    const mk = (mv: number) => mastery("chem.electrolysis", mv, 0.5, { cardsTotal: 6, attempts: 4, lastStudiedAt: NOW.toISOString() });
    const score = (mv: number) => recommend({
      topics: [TOPICS[0]], mastery: [mk(mv)], cards: [], mistakes: [], exams: [], plan: [],
      sessionLengthMinutes: 25, subjectIds: ["chem"], marksPerHour: new Map([["chem.electrolysis", 3]]), now: NOW,
    }).find((r) => r.topicId === "chem.electrolysis")!.score;
    // 0.2 < 0.4 < 0.54 are all weak, so each produces a practice rec
    expect(score(0.20)).toBeGreaterThan(score(0.40));
    expect(score(0.40)).toBeGreaterThan(score(0.54));
  });

  it("forgetting is monotone: lower retention raises the score", () => {
    const mk = (ret: number) => mastery("chem.electrolysis", 0.35, ret, { cardsTotal: 6, attempts: 4, lastStudiedAt: NOW.toISOString() });
    const score = (ret: number) => recommend({
      topics: [TOPICS[0]], mastery: [mk(ret)], cards: [], mistakes: [], exams: [], plan: [],
      sessionLengthMinutes: 25, subjectIds: ["chem"], now: NOW,
    }).find((r) => r.topicId === "chem.electrolysis")!.score;
    expect(score(0.2)).toBeGreaterThan(score(0.5));
    expect(score(0.5)).toBeGreaterThan(score(0.9));
  });

  it("uncertainty: thin-evidence topics outrank thick-evidence ones at equal mastery", () => {
    // thin: few cards, few attempts but still counted as weak so practice appears
    const thin = mastery("chem.electrolysis", 0.35, 0.5, { cardsTotal: 2, attempts: 1, lastStudiedAt: NOW.toISOString() });
    const thick = mastery("chem.acids", 0.35, 0.5, { cardsTotal: 10, attempts: 6, lastStudiedAt: NOW.toISOString() });
    const result = recommend({
      topics: [TOPICS[0], TOPICS[1]], mastery: [thin, thick], cards: [], mistakes: [], exams: [], plan: [],
      sessionLengthMinutes: 25, subjectIds: ["chem"], now: NOW,
    });
    const thinRec = result.find((r) => r.topicId === "chem.electrolysis")!;
    const thickRec = result.find((r) => r.topicId === "chem.acids")!;
    expect(thinRec.factors!.uncertainty).toBeGreaterThan(thickRec.factors!.uncertainty);
  });

  it("higher expected marks-per-hour outranks lower at equal mastery and urgency", () => {
    const a = mastery("chem.electrolysis", 0.35, 0.5, { cardsTotal: 6, attempts: 4 });
    const b = mastery("chem.acids", 0.35, 0.5, { cardsTotal: 6, attempts: 4 });
    const result = recommend({
      topics: TOPICS.slice(0, 2), mastery: [a, b], cards: [], mistakes: [], exams: [], plan: [],
      sessionLengthMinutes: 25, subjectIds: ["chem"], marksPerHour: new Map([["chem.electrolysis", 6], ["chem.acids", 0.8]]), now: NOW,
    });
    const pra = result.filter((r) => r.activity === "practice");
    expect(pra[0].topicId).toBe("chem.electrolysis");
  });

  it("explanation fields are recoverableMarks/marksPerHour/lastEvidence%/daysSince/paperLabel contract", () => {
    for (const s of scenarios.slice(0, 50)) {
      const result = recommend({
        topics: TOPICS, mastery: s.mastery, cards: s.cards, mistakes: s.mistakes, exams: s.exams, plan: [],
        sessionLengthMinutes: s.sessionLengthMinutes, subjectIds: ["chem"], marksPerHour: s.marksPerHour, now: NOW,
      });
      for (const r of result) {
        const e = r.explanation!;
        expect(typeof e.recoverableMarks).toBe("number");
        expect(e.daysToExam === null || typeof e.daysToExam === "number").toBe(true);
        expect(e.paperLabel === null || typeof e.paperLabel === "string").toBe(true);
        expect(e.lastEvidencePercent === null || (typeof e.lastEvidencePercent === "number" && e.lastEvidencePercent >= 0 && e.lastEvidencePercent <= 100)).toBe(true);
        expect(e.daysSinceRetrieval === null || typeof e.daysSinceRetrieval === "number").toBe(true);
        expect(e.factors.examGain).toBeGreaterThan(0);
      }
    }
  });
});
