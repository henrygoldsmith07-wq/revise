import { describe, expect, it } from "vitest";
import { physicsMotionGraphQuestions as bank } from "@/content/questions/physics-motion-graphs";
import { questionFreshness, unseenQuestion } from "@/domain/learning-evidence";
import { selectLearningAction } from "@/domain/learning-action";
import { wjecCapabilities } from "@/content/capabilities";
import { advanceMistakeRepair, REPAIR_RETENTION_DELAY_MS } from "@/domain/repair-evidence";
import type { Attempt, Mistake, Question } from "@/domain/types";

const source = bank.find(q => q.id.endsWith("tangent-not-secant"))!;
const different = bank.find(q => q.id.endsWith("scaled-axes"))!;
function attempt(q: Question): Attempt {
  return { id: "exposure", userId: "test", subjectId: q.subjectId, questionId: q.id,
    topicIds: q.topicIds, answers: {}, marked: [], awarded: 0, max: q.totalMarks,
    markedBy: "rubric", feedback: "", elapsedMs: 60000, mode: "practice",
    hintTier: "worked-solution", createdAt: "2026-09-01T12:00:00Z" };
}
const relabelled: Question = { ...source, id: "new-id-same-task", learning: {
  ...source.learning!, familyId: "new-family-label", contextId: "new-context-label",
} };

describe("Physics assessment exposure follows reasoning rather than IDs", () => {
  it("does not erase part context or reasoning through question-level relabelling", () => {
    expect(questionFreshness(relabelled, [source])).toEqual({
      newFamily: true, newContext: false, newReasoning: false,
    });
    expect(unseenQuestion(relabelled, [attempt(source)], [source, relabelled])).toBe(false);
  });
  it("distinguishes axis conversion from the previously shown tangent method", () => {
    expect(questionFreshness(different, [source])).toEqual({
      newFamily: true, newContext: true, newReasoning: true,
    });
    expect(unseenQuestion(different, [attempt(source)], [source, different])).toBe(true);
  });
  it("selects the unpractised reasoning after a supported draft answer", () => {
    const selected = selectLearningAction({ topicId: source.topicIds[0]!,
      nodes: wjecCapabilities.filter(n => n.id === "phys.motion.graph-gradient"),
      questions: [source, relabelled, different], attempts: [attempt(source)], mistakes: [],
      now: new Date("2026-09-02T12:00:00Z") });
    expect(selected?.question.id).toBe(different.id);
    expect(selected?.contentTrust).toBe("needs-human-review");
  });
  it("restarts retention after uncertain draft exposure without advancing repair", () => {
    const when = "2026-09-08T12:00:00Z";
    const mistake: Mistake = { id: "m", userId: "test", subjectId: source.subjectId,
      topicId: source.topicIds[0]!, questionId: source.id, partId: source.parts[0]!.id,
      marksLost: 3, description: "Could not distinguish tangent slope from graph coordinates.", category: "interpretation",
      capabilityIds: ["phys.motion.graph-gradient"], createdAt: "2026-09-01T10:00:00Z",
      resolved: false, repair: { version: 1, stage: "transfer", evidence: [], dueAt: when },
    };
    const updated = advanceMistakeRepair(mistake, different, { ...attempt(different),
      createdAt: when, markConfidence: 0.1 }, [], [source, different]);
    expect(updated.repair?.stage).toBe("transfer");
    expect(updated.repair?.evidence).toEqual([]);
    expect(Date.parse(updated.repair!.dueAt!)).toBe(Date.parse(when) + REPAIR_RETENTION_DELAY_MS);
    expect(updated.resolved).toBe(false);
  });
});
