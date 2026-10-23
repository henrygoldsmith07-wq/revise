import { describe, expect, it } from "vitest";
import { buildMarkRecovery } from "@/domain/mark-recovery";
import { buildPaperReadiness } from "@/domain/paper-readiness";
import { rankRevisionActions, type EngineInput } from "@/domain/revision-engine";
import type { Subject, Topic, Unit } from "@/domain/types";
import { attempt as mkAttempt, mistake as mkMistake, question as mkQuestion } from "./helpers-recovery";

const NOW = new Date("Sat 2026-10-03 1:00 PM BST (UTC+01:00)");
const SUBJECT = "wjec-alevel-physics";

const subject: Subject = {
  id: SUBJECT, qualificationId: "q", name: "Physics", gradeBoundaries: [],
  papers: [
    { id: "p.u1", name: "Unit 1", weight: 0.5, durationMinutes: 90, calculatorAllowed: true },
    { id: "p.u3", name: "Unit 3", weight: 0.5, durationMinutes: 90, calculatorAllowed: true },
  ],
};
const units: Unit[] = [
  { id: "a", subjectId: SUBJECT, title: "Unit 1: Motion", order: 1 },
  { id: "c", subjectId: SUBJECT, title: "Unit 3: Oscillations", order: 2 },
];
const topic = (id: string, unitId: string, specRef: string): Topic => ({
  id, subjectId: SUBJECT, unitId, title: id, order: 1, intrinsicDifficulty: 2, summary: "", keyPoints: [], commonErrors: [], specPoints: [], specRef,
});
const topics = [topic("motion", "a", "Unit 1.1"), topic("shm", "c", "Unit 3.1")];

describe("year-aware paper readiness", () => {
  const run = (yearGroup?: "year-12" | "year-13") => buildPaperReadiness({ subject, topics, units, questions: [], attempts: [], mistakes: [], now: NOW, yearGroup });
  it("Year 12 reports AS papers only; Year 13 and unset keep both", () => {
    expect(run("year-12").map((r) => r.paperId)).toEqual(["p.u1"]);
    expect(run("year-13").map((r) => r.paperId)).toEqual(["p.u1", "p.u3"]);
    expect(run().map((r) => r.paperId)).toEqual(["p.u1", "p.u3"]);
  });
});

describe("year-aware missions", () => {
  function input(scopeTopicIds?: ReadonlySet<string>): EngineInput {
    const questions = ["motion", "shm"].flatMap((t) => [0, 1].map((i) => mkQuestion(`${t}-${i}`, t, { subjectId: SUBJECT })));
    const mistakes = ["motion", "shm"].flatMap((t) => [0, 1].map((i) =>
      mkMistake(`${t}-m${i}`, { subjectId: SUBJECT, topicId: t, questionId: `${t}-${i}`, attemptId: `att-${t}-${i}`, marksLost: 3, workingErrorKind: "unit-error", createdAt: "2026-09-20T09:00:00.000Z" })));
    const attempts = mistakes.map((x) => mkAttempt(`att-${x.id}`, x.questionId!, 0, 3, "2026-09-20T09:00:00.000Z", { subjectId: SUBJECT, topicIds: [x.topicId] }));
    const recovery = buildMarkRecovery({ mistakes, attempts, questions, now: NOW });
    return { now: NOW, subjectIds: [SUBJECT], mistakes, attempts, questions, recovery, examDates: [], topicTitle: (id) => id, subjectName: (id) => id, ...(scopeTopicIds ? { scopeTopicIds } : {}) };
  }
  const missionTopics = (plan: ReturnType<typeof rankRevisionActions>) =>
    plan.actions.filter((a) => a.type === "mission" || a.type === "recurring-error").map((a) => (a.topicIds ?? []).join("+")).join(",");

  it("a Year 12 scope never builds a mission from an A2 topic's lost marks", () => {
    const all = rankRevisionActions(input());
    const y12 = rankRevisionActions(input(new Set(["motion"])));
    expect(JSON.stringify(all.actions)).toContain("shm");
    expect(JSON.stringify(y12.actions)).not.toContain("shm");
    expect(JSON.stringify(y12.actions)).toContain("motion");
    expect(missionTopics(y12)).not.toContain("shm");
  });
});
