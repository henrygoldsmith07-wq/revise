import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildAdaptiveSession,
  replanAdaptiveSession,
  type AdaptiveSessionPlan,
  type AdaptiveSessionStep,
  type AdaptiveStepRecord,
} from "@/domain/adaptive-session";
import {
  assertBudgetNotExceeded,
  clampTargetMinutes,
  spentMinutes,
  stepMinutesTotal,
} from "@/domain/adaptive-budget";
import { wjecCapabilities } from "@/content/capabilities";
import type { Card, ExamDate, Mistake, Question, Topic, TopicMastery } from "@/domain/types";

const NOW = new Date("2026-09-05T12:00:00.000Z");
const NODE = wjecCapabilities.find((n) => n.subjectId === "wjec-alevel-biology") ?? wjecCapabilities[0]!;
const SUBJECT = NODE.subjectId;
const TOPIC_ID = NODE.topicId;

function topic(): Topic {
  return {
    id: TOPIC_ID,
    subjectId: SUBJECT,
    unitId: "u1",
    title: "Mapped topic",
    order: 1,
    intrinsicDifficulty: 3,
    summary: "s",
    keyPoints: ["k"],
    commonErrors: ["e"],
  };
}

function card(id: string, due = "2026-09-01"): Card {
  return {
    id, userId: "u", subjectId: SUBJECT, topicId: TOPIC_ID, kind: "basic",
    front: "f", back: "b", tags: [], origin: "seed", due,
    stability: 2, difficulty: 5, reps: 2, lapses: 1, state: 2,
    lastReviewedAt: "2026-08-01T12:00:00.000Z",
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
  };
}

function mappedQuestion(id: string, opts: { expectedMinutes?: number; totalMarks?: number; demand?: "application" | "recall" | "transfer" } = {}): Question {
  const totalMarks = opts.totalMarks ?? 4;
  const demand = opts.demand ?? "application";
  return {
    id,
    subjectId: SUBJECT,
    topicIds: [TOPIC_ID],
    kind: "short",
    stem: `Mapped ${id}`,
    parts: [{
      id: `${id}.a`, label: "", prompt: "Apply.", marks: totalMarks,
      markScheme: ["p"], modelAnswer: "m",
      capabilityIds: [NODE.id],
      learning: { familyId: `fam-${id}`, contextId: `ctx-${id}`, demand, reasoningMoves: [`move-${id}`] },
    }],
    totalMarks,
    calculatorAllowed: true,
    difficulty: 3,
    ...(opts.expectedMinutes != null
      ? { learning: { familyId: `fam-${id}`, contextId: `ctx-${id}`, demand, expectedMinutes: opts.expectedMinutes, reasoningMoves: [`move-${id}`] } }
      : {}),
    origin: "seed",
    createdAt: NOW.toISOString(),
  };
}

function unmappedQuestion(id: string, difficulty: 1 | 2 | 3 | 4 | 5, totalMarks = 2): Question {
  return {
    id, subjectId: SUBJECT, topicIds: [TOPIC_ID], kind: "short", stem: `Q ${id}`,
    parts: [{ id: `${id}.a`, label: "", prompt: "Explain.", marks: totalMarks, markScheme: ["p"], modelAnswer: "m" }],
    totalMarks, calculatorAllowed: true, difficulty, origin: "seed", createdAt: NOW.toISOString(),
  };
}

function mistake(id: string): Mistake {
  return {
    id, userId: "u", subjectId: SUBJECT, topicId: TOPIC_ID, marksLost: 2,
    description: "d", category: "recall", resolved: false, createdAt: "2026-09-04T12:00:00.000Z",
  };
}

function mastery(value: number): TopicMastery {
  return {
    topicId: TOPIC_ID, subjectId: SUBJECT, mastery: value, retention: value, confidence: value,
    cardsTotal: 3, cardsDue: 1, attempts: 2, accuracy: value,
    lastStudiedAt: "2026-08-20T12:00:00.000Z", weak: value < 0.55,
  };
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    topics: [topic()],
    cards: [],
    reviewLogs: [],
    questions: [],
    attempts: [],
    mistakes: [],
    mastery: [mastery(0.3)],
    exams: [] as ExamDate[],
    subjectIds: [SUBJECT],
    now: NOW,
    ...overrides,
  };
}

function record(partial: Partial<AdaptiveStepRecord> & Pick<AdaptiveStepRecord, "stepId" | "kind" | "result">): AdaptiveStepRecord {
  const minutes = partial.minutes ?? 4;
  return {
    minutes, awardedMarks: 0, maxMarks: 0, hintTier: null,
    elapsedMs: partial.elapsedMs ?? minutes * 60_000, ...partial,
  };
}

describe("adaptive budget invariants", () => {
  it("clamps configured targets into 12–25", () => {
    expect(clampTargetMinutes(5)).toBe(12);
    expect(clampTargetMinutes(20)).toBe(20);
    expect(clampTargetMinutes(99)).toBe(25);
    expect(clampTargetMinutes(undefined)).toBe(20);
  });

  it("shares one spent definition between planning and replanning", () => {
    expect(spentMinutes([{ minutes: 4, elapsedMs: 0 }])).toBe(0 + 4);
    expect(spentMinutes([{ minutes: 4, elapsedMs: 90_000 }])).toBe(1.5);
    // A question that ran long consumes its measured time, not its plan.
    expect(spentMinutes([{ minutes: 4, elapsedMs: 360_000 }])).toBe(6);
  });

  it("fits every target from 12–25 on the standard ladder", () => {
    for (let target = 12; target <= 25; target++) {
      const plan = buildAdaptiveSession(baseInput({
        targetMinutes: target,
        cards: [card("c1"), card("c2"), card("c3"), card("c4")],
        questions: [unmappedQuestion("s1", 2), unmappedQuestion("i1", 3), unmappedQuestion("t1", 4)],
        mistakes: [mistake("m1"), mistake("m2")],
      }))!;
      expect(plan.targetMinutes).toBe(target);
      expect(plan.totalMinutes).toBeLessThanOrEqual(target);
      expect(plan.steps.some((s) => s.kind === "delayed-retrieval")).toBe(true);
    }
  });

  it("fits the capability path when retrieval, a long action and delayed retrieval collide", () => {
    // One eligible action at exactly the target plus due retrieval plus the
    // structural delayed step: 2 + 20 + 1 would exceed 20 without fitting.
    const plan = buildAdaptiveSession(baseInput({
      targetMinutes: 20,
      cards: [card("c1"), card("c2")],
      questions: [mappedQuestion("long", { expectedMinutes: 20 })],
    }))!;
    expect(plan.learningPolicy).toBe("capability-evidence-v1");
    expect(plan.totalMinutes).toBeLessThanOrEqual(20);
    expect(plan.steps.some((s) => s.kind === "delayed-retrieval")).toBe(true);
    assertBudgetNotExceeded(plan.steps, plan.targetMinutes, "test");
  });

  it("keeps the capability path inside small budgets too", () => {
    for (const target of [12, 14, 18]) {
      const plan = buildAdaptiveSession(baseInput({
        targetMinutes: target,
        cards: [card("c1"), card("c2"), card("c3")],
        questions: [mappedQuestion("m1", { expectedMinutes: 9 }), mappedQuestion("m2", { expectedMinutes: 6 })],
        mistakes: [mistake("m1")],
      }))!;
      expect(plan.totalMinutes).toBeLessThanOrEqual(target);
    }
  });

  it("replan respects the remaining budget after measured elapsed time", () => {
    const plan = buildAdaptiveSession(baseInput({
      targetMinutes: 20,
      questions: [unmappedQuestion("s1", 2), unmappedQuestion("i1", 3)],
    }))!;
    const first = plan.steps[0]!;
    // The first rung ran almost twice as long as planned.
    const completed = [record({ stepId: first.id, kind: first.kind, result: "passed-assisted", elapsedMs: (first.minutes * 2 - 1) * 60_000, minutes: first.minutes })];
    const spent = spentMinutes(completed);
    const next = replanAdaptiveSession({
      plan, completed, questions: baseInput().questions as Question[], cards: [], mistakes: [], attempts: [],
    });
    expect(stepMinutesTotal(next.steps)).toBeLessThanOrEqual(Math.max(0, plan.targetMinutes - spent) + 1e-9);
  });

  it("leaves only the schedule-later step on a near-zero remaining budget", () => {
    const steps: AdaptiveSessionStep[] = [
      { id: `${TOPIC_ID}:independent-application`, kind: "independent-application", minutes: 4, label: "x", description: "", href: "/", topicId: TOPIC_ID, subjectId: SUBJECT, cardIds: [], questionIds: ["q"], mistakeIds: [] },
      { id: `${TOPIC_ID}:delayed-retrieval`, kind: "delayed-retrieval", minutes: 1, label: "x", description: "", href: "/", topicId: TOPIC_ID, subjectId: SUBJECT, cardIds: ["c"], questionIds: [], mistakeIds: [] },
    ];
    const plan: AdaptiveSessionPlan = {
      key: "k", subjectId: SUBJECT, topicId: TOPIC_ID, topicTitle: "t",
      targetMinutes: 12, totalMinutes: 5, score: 1, reason: "t",
      evidence: {
        dueCount: 0, overdueCount: 0, dueCardIds: [], openMistakes: 0, openMistakeIds: [],
        marksLost: 0, mastery: 0.3, retention: 0.4, daysSinceStudy: null, daysToExam: null,
        examUrgency: 0, questionCount: 0, attempts: 0, focus: "application", focusState: "emerging",
        factors: { fsrs: 0, mastery: 0.7, mistakes: 0, examProximity: 0, forgetting: 0, capabilityGap: 0.5, uncertainty: 0.5 },
      },
      steps, startHref: "/",
    };
    // 11.8 of 12 minutes measured as spent: no question rung may start.
    const completed = [record({ stepId: "done-1", kind: "independent-application", result: "missed", minutes: 4, elapsedMs: 11.8 * 60_000 })];
    const next = replanAdaptiveSession({ plan, completed, questions: [], cards: [], mistakes: [], attempts: [] });
    expect(next.steps.every((s) => s.kind === "delayed-retrieval")).toBe(true);
    expect(stepMinutesTotal(next.steps)).toBeLessThanOrEqual(0.2 + 1e-9);
  });

  it("stays inside budget across randomised evidence (property)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 12, max: 25 }),
        fc.integer({ min: 0, max: 6 }),
        fc.integer({ min: 0, max: 4 }),
        fc.integer({ min: 0, max: 6 }),
        fc.integer({ min: 1, max: 12 }),
        (target, dueCount, mistakeCount, questionCount, longMarks) => {
          const cards = Array.from({ length: dueCount }, (_, i) => card(`pc-${i}`));
          const mistakes = Array.from({ length: mistakeCount }, (_, i) => mistake(`pm-${i}`));
          const questions: Question[] = [
            ...Array.from({ length: questionCount }, (_, i) =>
              unmappedQuestion(`pq-${i}`, ((i % 4) + 1) as 1 | 2 | 3 | 4, 2)),
            mappedQuestion("plong", { expectedMinutes: Math.min(25, longMarks), totalMarks: longMarks }),
          ];
          const plan = buildAdaptiveSession(baseInput({ targetMinutes: target, cards, mistakes, questions }));
          expect(plan).not.toBeNull();
          expect(plan!.totalMinutes).toBeLessThanOrEqual(target);
          expect(plan!.steps.every((s) => Number.isFinite(s.minutes) && s.minutes >= 0)).toBe(true);
          expect(plan!.steps.some((s) => s.kind === "delayed-retrieval")).toBe(true);
        },
      ),
      { seed: 20260928, numRuns: 60 },
    );
  });

  it("replanning never exceeds the remaining budget across randomised runs (property)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 12, max: 25 }),
        fc.integer({ min: 0, max: 3 }),
        fc.double({ min: 0, max: 2, noNaN: true }),
        (target, doneCount, overrunFactor) => {
          const plan = buildAdaptiveSession(baseInput({
            targetMinutes: target,
            questions: [unmappedQuestion("s1", 2), unmappedQuestion("i1", 3), unmappedQuestion("t1", 4)],
          }))!;
          const first = plan.steps[0];
          if (!first) return;
          // Complete a few rungs, some running longer than planned.
          const completed = Array.from({ length: Math.min(doneCount, plan.steps.length) }, (_, i) => {
            const step = plan.steps[i]!;
            return record({
              stepId: step.id, kind: step.kind, result: "passed-assisted",
              minutes: step.minutes, elapsedMs: Math.round(step.minutes * overrunFactor * 60_000),
            });
          });
          const remaining = Math.max(0, plan.targetMinutes - spentMinutes(completed));
          const next = replanAdaptiveSession({
            plan, completed, questions: [unmappedQuestion("s1", 2), unmappedQuestion("i1", 3)], cards: [], mistakes: [], attempts: [],
          });
          expect(stepMinutesTotal(next.steps)).toBeLessThanOrEqual(remaining + 1e-9);
        },
      ),
      { seed: 7291, numRuns: 60 },
    );
  });
});
