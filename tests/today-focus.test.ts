import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planColdStart } from "@/domain/cold-start";
import { buildMarkRecovery } from "@/domain/mark-recovery";
import { rankRevisionActions, type EngineInput, type RevisionAction } from "@/domain/revision-engine";
import { unseenSupplyByTopic } from "@/domain/supply";
import { describeFocus } from "@/domain/today-focus";
import { LEARNER_STATE_LABEL } from "@/domain/learner-state";
import type { ExamDate, Question } from "@/domain/types";
import { attempt as mkAttempt, mistake as mkMistake, question as mkQuestion } from "./helpers-recovery";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const exam = (subjectId: string, days: number): ExamDate => ({ id: `e-${subjectId}`, userId: "u1", subjectId, date: new Date(NOW.getTime() + days * 86_400_000).toISOString().slice(0, 10), label: subjectId });
const bank = (subjectId: string, topic: string): Question[] => Array.from({ length: 8 }, (_, i) => mkQuestion(`${subjectId}-${topic}-${i}`, topic, { subjectId, kind: i % 2 ? "calculation" : "structured", family: `${subjectId}-${topic}-${i}` } as Partial<Question>));

function plans(): RevisionAction[] {
  const questions = [...bank("physics", "circuits"), ...bank("biology", "cells"), ...bank("chemistry", "bonding")];
  const mistakes = [
    mkMistake("p1", { subjectId: "physics", topicId: "circuits", questionId: "physics-circuits-0", attemptId: "att-p1", marksLost: 4, workingErrorKind: "unit-error", createdAt: "2026-09-20T09:00:00.000Z" }),
    mkMistake("b1", { subjectId: "biology", topicId: "cells", questionId: "biology-cells-0", attemptId: "att-b1", marksLost: 6, category: "communication", createdAt: "2026-09-20T09:00:00.000Z" }),
  ];
  const attempts = [
    mkAttempt("att-p1", "physics-circuits-0", 0, 4, "2026-09-20T09:00:00.000Z", { subjectId: "physics", topicIds: ["circuits"] }),
    mkAttempt("att-b1", "biology-cells-0", 0, 6, "2026-09-20T09:00:00.000Z", { subjectId: "biology", topicIds: ["cells"] }),
  ];
  const examDates = [exam("physics", 8), exam("biology", 40)];
  const recovery = buildMarkRecovery({ mistakes, attempts, questions, now: NOW });
  const topics = new Set(questions.flatMap((q) => q.topicIds));
  const common: EngineInput = {
    now: NOW, subjectIds: ["physics", "biology", "chemistry"], mistakes, attempts, questions, recovery, examDates,
    supplyByTopic: unseenSupplyByTopic(topics, questions, attempts), subjectName: (id) => id, topicTitle: (id) => id,
    dueReviews: [{ subjectId: "chemistry", count: 30, overdue: 4 }], untouched: [{ subjectId: "chemistry", topicId: "bonding", label: "bonding", share: 0.2 }],
    papers: [{ subjectId: "physics", paperId: "paper-1", title: "Paper 1" }],
  };
  const cold = rankRevisionActions({ ...common, mistakes: [], attempts: [], recovery: buildMarkRecovery({ mistakes: [], attempts: [], questions, now: NOW }), supplyByTopic: unseenSupplyByTopic(topics, questions, []), coldStart: planColdStart({ subjectIds: ["physics"], attempts: [], mistakes: [], reviewLogs: [], questions, examDates, topicSubject: () => "physics", now: NOW }) });
  const warm = rankRevisionActions(common);
  return [...cold.actions, ...cold.deferred.map((d) => d.action), ...warm.actions, ...warm.deferred.map((d) => d.action)];
}

const JARGON = /optimi[sz]|weighting|capabilit|interventi|effectiveness|ranking|\bscor(e|ing)\b|factor|confidence interval|evidence class|expected marks|policy|posterior|\bFSRS\b|stability/i;

describe("Today shows one dominant action in plain language", () => {
  const actions = plans();

  it("every action reduces to the six plain answers and exactly one way to start", () => {
    expect(actions.length).toBeGreaterThan(4);
    for (const a of actions) {
      const f = describeFocus(a, a.subjectId);
      for (const field of [f.title, f.subject, f.duration, f.why, f.stake, f.after, f.examLine, f.cta.href, f.cta.label]) expect(field.trim().length, a.id).toBeGreaterThan(0);
      expect(f.duration).toMatch(/^About \d+ min$/);
      expect(f.cta.href.startsWith("/")).toBe(true);
      expect(f.skippable).toBe(a.type === "quick-check");
    }
  });

  it("uses no engine vocabulary anywhere a learner can read it", () => {
    for (const a of actions) {
      const e = a.explanation;
      for (const text of [a.title, e.why, e.whyNow, e.whyBefore, e.stake, e.after, e.proves, ...e.evidence]) expect(text, `${a.id}: ${text}`).not.toMatch(JARGON);
    }
  });

  it("keeps state pills inside the six approved words", () => {
    const words = new Set(Object.keys(LEARNER_STATE_LABEL));
    for (const a of actions) if (a.proofStatus) expect(words.has(a.proofStatus)).toBe(true);
    expect(Object.values(LEARNER_STATE_LABEL).sort()).toEqual(["Awaiting proof", "Improving", "Needs work", "Not checked", "Proven", "Regressed"]);
  });

  it("is ordered the same way every time", () => {
    expect(plans().map((a) => a.id)).toEqual(actions.map((a) => a.id));
  });

  it("renders a single primary action in the Today hero", () => {
    for (const file of ["src/components/BestNextStep.tsx", "src/components/AdaptiveSessionHero.tsx"]) {
      const src = readFileSync(file, "utf8");
      expect(src.match(/variant="primary"/g)?.length ?? 0, file).toBe(1);
    }
  });
});
