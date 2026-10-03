import { describe, expect, it } from "vitest";
import { buildMarkRecovery } from "@/domain/mark-recovery";
import { COLD_START_MIN_ATTEMPTS, planColdStart, subjectIsCold } from "@/domain/cold-start";
import { rankRevisionActions, type EngineInput } from "@/domain/revision-engine";
import { unseenSupplyByTopic } from "@/domain/supply";
import type { ExamDate, Question } from "@/domain/types";
import { attempt as mkAttempt, mistake as mkMistake, question as mkQuestion } from "./helpers-recovery";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const exam = (subjectId: string, days: number): ExamDate => ({ id: `e-${subjectId}`, userId: "u1", subjectId, date: new Date(NOW.getTime() + days * 86_400_000).toISOString().slice(0, 10), label: subjectId });
const topicSubject = (id: string) => id.split(":")[0];

function pool(subjectId: string, topics: string[], n = 6): Question[] {
  return topics.flatMap((t) => Array.from({ length: n }, (_, i) => mkQuestion(`${subjectId}-${t}-${i}`, `${subjectId}:${t}`, {
    subjectId, kind: i % 3 === 0 ? "calculation" : i % 3 === 1 ? "short" : "extended", family: `${subjectId}-${t}-f${i}`,
  } as Partial<Question>)));
}

const base = (over: Partial<Parameters<typeof planColdStart>[0]> = {}) => ({
  subjectIds: ["physics", "biology"], attempts: [], mistakes: [], reviewLogs: [], questions: [...pool("physics", ["forces", "waves"]), ...pool("biology", ["cells", "enzymes"])],
  examDates: [], topicSubject, now: NOW, ...over,
});

describe("cold start", () => {
  it("offers one short check, on the subject with the nearest exam, whatever the subject order", () => {
    const exams = [exam("physics", 60), exam("biology", 20)];
    const a = planColdStart(base({ examDates: exams }));
    const b = planColdStart(base({ examDates: exams, subjectIds: ["biology", "physics"] }));
    expect(a).toEqual(b);
    expect(a?.subjectId).toBe("biology");
    expect(a!.questions).toBeGreaterThanOrEqual(3);
    expect(a!.minutes).toBeGreaterThan(0);
  });

  it("is skippable per subject and passes over a subject with too few reviewed questions", () => {
    expect(planColdStart(base({ examDates: [exam("biology", 20)], skipped: ["biology"] }))?.subjectId).toBe("physics");
    expect(planColdStart(base({ skipped: ["biology", "physics"] }))).toBeNull();
    expect(planColdStart(base({ questions: pool("physics", ["forces"], 1) }))).toBeNull();
  });

  it("stops once there is real evidence: answers, lost marks or card history", () => {
    const answers = Array.from({ length: COLD_START_MIN_ATTEMPTS }, (_, i) => mkAttempt(`a${i}`, `physics-forces-${i}`, 2, 3, "2026-10-01T09:00:00.000Z", { subjectId: "physics", topicIds: ["physics:forces"] }));
    expect(subjectIsCold("physics", { ...base(), attempts: answers })).toBe(false);
    expect(subjectIsCold("physics", { ...base(), mistakes: [mkMistake("m1", { subjectId: "physics" })] })).toBe(false);
    const reviews = Array.from({ length: 15 }, (_, i) => ({ id: `r${i}`, userId: "u1", cardId: `c${i}`, topicId: "physics:forces", grade: 3, elapsedMs: 1, reviewedAt: "2026-10-01T09:00:00.000Z" }));
    expect(subjectIsCold("physics", { ...base(), reviewLogs: reviews as never })).toBe(false);
    expect(subjectIsCold("physics", base())).toBe(true);
  });

  it("never counts self-marked answers as evidence", () => {
    const self = Array.from({ length: 5 }, (_, i) => mkAttempt(`s${i}`, `physics-forces-${i}`, 3, 3, "2026-10-01T09:00:00.000Z", { subjectId: "physics", markedBy: "self" as never }));
    expect(subjectIsCold("physics", { ...base(), attempts: self })).toBe(true);
  });
});

function engineFor(over: Partial<Parameters<typeof planColdStart>[0]> & { adaptive?: never }): EngineInput {
  const input = base(over);
  const recovery = buildMarkRecovery({ mistakes: input.mistakes, attempts: input.attempts, questions: input.questions, now: NOW });
  const coldStart = planColdStart(input);
  const topics = new Set(input.questions.flatMap((q) => q.topicIds));
  return {
    now: NOW, subjectIds: input.subjectIds, mistakes: input.mistakes, attempts: input.attempts, questions: input.questions, recovery, examDates: input.examDates,
    supplyByTopic: unseenSupplyByTopic(topics, input.questions, input.attempts), coldStart,
    dueReviews: [{ subjectId: "physics", count: 218, overdue: 0 }], subjectName: (id) => id, topicTitle: (id) => id,
  };
}

describe("cold start in the recommendation", () => {
  it("leads with the quick check when nothing else is evidence-based, ahead of a wall of due cards", () => {
    const plan = rankRevisionActions(engineFor({ examDates: [exam("physics", 40)] }));
    expect(plan.top?.type).toBe("quick-check");
    expect(plan.top?.route.href).toMatch(/^\/diagnostic\?subject=physics$|^\/diagnostic\?subject=biology$/);
    expect(plan.top?.explanation.stake).toMatch(/guessing/);
    expect(plan.actions.some((a) => a.type === "due-reviews")).toBe(true);
  });

  it("is deterministic and independent of subject order", () => {
    const a = rankRevisionActions(engineFor({ examDates: [exam("physics", 40), exam("biology", 20)] }));
    const b = rankRevisionActions(engineFor({ examDates: [exam("physics", 40), exam("biology", 20)], subjectIds: ["biology", "physics"] }));
    expect(a.actions.map((x) => x.id)).toEqual(b.actions.map((x) => x.id));
    expect(a.top?.subjectId).toBe("biology");
  });

  it("is replaced by a recovery mission once the check shows lost marks", () => {
    const before = rankRevisionActions(engineFor({ examDates: [exam("physics", 20)], subjectIds: ["physics"] }));
    expect(before.top?.type).toBe("quick-check");
    const qs = pool("physics", ["forces", "waves"]);
    const answers = qs.slice(0, 3).map((q, i) => mkAttempt(`d${i}`, q.id, 0, 3, "2026-10-03T09:00:00.000Z", { subjectId: "physics", topicIds: q.topicIds }));
    const mistakes = qs.slice(0, 3).map((q, i) => mkMistake(`dm${i}`, { subjectId: "physics", topicId: q.topicIds[0]!, questionId: q.id, attemptId: `d${i}`, createdAt: "2026-10-03T09:00:00.000Z" }));
    const after = rankRevisionActions(engineFor({ examDates: [exam("physics", 20)], subjectIds: ["physics"], attempts: answers, mistakes, questions: qs }));
    expect(after.top?.type).not.toBe("quick-check");
    expect(after.actions.some((a) => a.type === "quick-check")).toBe(false);
    expect(after.top?.id).not.toBe(before.top?.id);
    expect(after.top?.marksRecoverable ?? 0).toBeGreaterThan(0);
  });

  it("does not outrank marks that are already lost elsewhere", () => {
    const qs = [...pool("physics", ["forces"]), ...pool("biology", ["cells"])];
    const lost = qs.find((q) => q.subjectId === "physics")!;
    const input = engineFor({
      subjectIds: ["physics", "biology"], questions: qs, examDates: [exam("physics", 20), exam("biology", 30)],
      attempts: [mkAttempt("a1", lost.id, 0, 3, "2026-09-20T09:00:00.000Z", { subjectId: "physics", topicIds: lost.topicIds })],
      mistakes: [mkMistake("m1", { subjectId: "physics", topicId: lost.topicIds[0]!, questionId: lost.id, attemptId: "a1", workingErrorKind: "unit-error" })],
    });
    expect(input.coldStart?.subjectId).toBe("biology");
    expect(rankRevisionActions(input).top?.type).not.toBe("quick-check");
  });

  it("is absent when no reviewed unseen questions exist, instead of pretending a check can run", () => {
    expect(rankRevisionActions(engineFor({ questions: [] })).actions.some((a) => a.type === "quick-check")).toBe(false);
  });
});
