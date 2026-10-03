import { describe, expect, it } from "vitest";
import { buildAdaptiveSession } from "@/domain/adaptive-session";
import { chooseIntervention, gapExtrasFor, interventionContextFor } from "@/domain/adaptive-intervention";
import { emptyProfile } from "@/domain/capability-mastery";
import type { AdaptiveTopicCandidate } from "@/domain/adaptive-scoring";
import type { Question, Topic, TopicMastery } from "@/domain/types";

const topic: Topic = { id: "t", subjectId: "s", unitId: "u", title: "Respiration", order: 1, intrinsicDifficulty: 3, summary: "", keyPoints: [], commonErrors: [] };
const q = (id: string, demand?: string): Question => ({
  id, subjectId: "s", topicIds: ["t"], kind: "short", stem: id, totalMarks: 3, calculatorAllowed: true, difficulty: 3, origin: "seed",
  createdAt: "2026-01-01T00:00:00.000Z", ...(demand ? { learning: { familyId: id, contextId: id, demand, expectedMinutes: 3 } } : {}),
  parts: [{ id: `${id}:a`, label: "", prompt: "p", marks: 3, markScheme: ["a"], modelAnswer: "m" }],
}) as Question;
const mastery: TopicMastery = { topicId: "t", subjectId: "s", mastery: 0, retention: 0, confidence: 0, cardsTotal: 0, cardsDue: 0, attempts: 0, accuracy: 0, lastStudiedAt: null, weak: false };

describe("plan intervention", () => {
  it("attaches a ranked intervention with a plain explanation, or nothing if nothing is eligible", () => {
    const plan = buildAdaptiveSession({
      topics: [topic], subjectIds: ["s"], cards: [], reviewLogs: [], questions: [q("a"), q("b")], attempts: [], mistakes: [], mastery: [mastery],
      exams: [], now: new Date("2026-09-05T12:00:00Z"),
    });
    expect(plan).not.toBeNull();
    if (plan!.intervention) {
      expect(plan!.intervention.minutes).toBeLessThanOrEqual(plan!.targetMinutes);
      expect(plan!.intervention.lines.join(" ")).not.toMatch(/\d\.\d/);
    }
  });

  it("only counts trusted, unseen-family questions as supply", () => {
    const selected = { topicId: "t", subjectId: "s", score: 1, evidence: {
      attempts: 0, mastery: 0.5, daysToExam: null, dueCount: 0, factors: { forgetting: 0 }, openMistakeIds: [],
    } } as unknown as AdaptiveTopicCandidate;
    const ctx = interventionContextFor({ topic, selected, profile: emptyProfile(), questions: [q("a"), q("b", "transfer")], attempts: [], mistakes: [] });
    expect(ctx.recall).toBeNull();
    expect(ctx.application).toBeNull();
    expect(ctx.mastery).toBeNull();
    expect(ctx.unseen.recall + ctx.unseen.application + ctx.unseen.transfer).toBeLessThanOrEqual(2);
    const none = chooseIntervention({ ...ctx, unseen: { recall: 0, application: 0, transfer: 0 }, evidenceAttempts: 5, recall: 0.9, application: 0.9, transferProven: true, openMistakeMarks: 0 });
    expect(none).toBeNull();
  });
});

import { currentFatigue, recentActiveMinutes } from "@/domain/fatigue";

describe("study fatigue from history", () => {
  const now = new Date(2026, 8, 5, 14, 0, 0);
  const at = (minsAgo: number) => new Date(now.getTime() - minsAgo * 60_000).toISOString();
  const ev = (minsAgo: number, minutes: number) => ({ at: at(minsAgo), elapsedMs: minutes * 60_000 });

  it("is fresh with no history or after a long break", () => {
    expect(recentActiveMinutes([], now)).toBe(0);
    expect(recentActiveMinutes([ev(90, 20)], now)).toBe(0);
    expect(currentFatigue([], now)).toBe(0);
  });
  it("sums only the latest unbroken block", () => {
    const events = [ev(5, 30), ev(40, 30), ev(75, 30), ev(300, 60)];
    expect(recentActiveMinutes(events, now)).toBe(90);
  });
  it("rises with a long block and late hours, and compounds", () => {
    const long = [ev(2, 40), ev(45, 40), ev(90, 40), ev(130, 40)];
    expect(currentFatigue(long, now)).toBeGreaterThan(0.5);
    const night = new Date(2026, 8, 5, 23, 0, 0);
    expect(currentFatigue([], night)).toBeGreaterThan(0.4);
    expect(currentFatigue([], night)).toBeGreaterThan(currentFatigue([], now));
  });
  it("ignores future and malformed events", () => {
    expect(recentActiveMinutes([{ at: "nope", elapsedMs: 1 }, ev(-10, 30)], now)).toBe(0);
  });
});


describe("evidence gap on the plan", () => {
  const at = (id: string, o: Partial<import("@/domain/types").Attempt> = {}): import("@/domain/types").Attempt => ({
    id, userId: "u", questionId: id, subjectId: "s", topicIds: ["t"], answers: {}, marked: [], awarded: 2, max: 3, feedback: "", markedBy: "rubric", elapsedMs: 1000, mode: "practice",
    createdAt: "2026-09-01T00:00:00.000Z", ...o,
  });
  const NOW = new Date("2026-10-01T00:00:00Z");

  it("counts independent, distinct, timed and low-confidence evidence from the learner's history", () => {
    const extras = gapExtrasFor({
      questions: [q("a")], daysToExam: 12, now: NOW,
      attempts: [at("a"), at("a", { id: "a2" }), at("b", { hintTier: "cue" }), at("c", { mode: "paper" }), at("d", { markedBy: "ai", markConfidence: 0.3 })],
    });
    expect(extras).toMatchObject({ distinctIndependent: 2, independentAttempts: 3, timedPaperAttempts: 1, lowConfidenceMarks: 1, daysToExam: 12, daysSinceEvidence: 30 });
  });
  it("reports no evidence age when nothing was answered unaided", () => {
    expect(gapExtrasFor({ questions: [], attempts: [at("b", { hintTier: "cue" })], daysToExam: null, now: NOW }).daysSinceEvidence).toBeNull();
  });
  it("attaches the top gap to the chosen intervention", () => {
    const selected = { topicId: "t", subjectId: "s", score: 1, evidence: { attempts: 6, mastery: 0.6, daysToExam: 40, dueCount: 0, factors: { forgetting: 0 }, openMistakeIds: [] } } as unknown as AdaptiveTopicCandidate;
    const ctx = interventionContextFor({ topic, selected, profile: emptyProfile(), questions: [q("a")], attempts: [], mistakes: [] });
    const withGap = chooseIntervention({ ...ctx, recall: 0.8, application: null, evidenceAttempts: 6, unseen: { recall: 1, application: 3, transfer: 0 } }, 20, {
      daysSinceEvidence: 2, distinctIndependent: 4, independentAttempts: 4, timedPaperAttempts: 0, trustedQuestions: 5, lowConfidenceMarks: 0, daysToExam: 40,
    });
    expect(withGap?.gap).toMatchObject({ label: "Test application", minutes: 6 });
    expect(chooseIntervention({ ...ctx, recall: 0.8, application: null, unseen: { recall: 1, application: 3, transfer: 0 } }, 20)?.gap).toBeNull();
  });
});

describe("headline minutes match the session", () => {
  it("uses the planned session length, not the intervention's own default", () => {
    const selected = { topicId: "t", subjectId: "s", score: 1, evidence: { attempts: 6, mastery: 0.6, daysToExam: 40, dueCount: 0, factors: { forgetting: 0 }, openMistakeIds: [] } } as unknown as AdaptiveTopicCandidate;
    const ctx = { ...interventionContextFor({ topic, selected, profile: emptyProfile(), questions: [q("a")], attempts: [], mistakes: [] }), recall: 0.8, application: 0.4, unseen: { recall: 1, application: 3, transfer: 0 } };
    const own = chooseIntervention(ctx, 25);
    const shown = chooseIntervention(ctx, 25, undefined, 19.2);
    expect(own!.minutes).not.toBe(20);
    expect(shown!.minutes).toBe(20);
    expect(shown!.headline).toMatch(/^20-minute /);
  });
});
