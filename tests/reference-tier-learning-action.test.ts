import { describe, expect, it } from "vitest";
import { wjecCapabilities } from "@/content/capabilities";
import { wjecRepairDepthQuestions as rawBank } from "@/content/questions/wjec-repair-depth";
import { advanceMistakeRepair, REPAIR_RETENTION_DELAY_MS } from "@/domain/repair-evidence";
import { mistakesFromAttempt } from "@/domain/mistakes";
import { selectLearningAction } from "@/domain/learning-action";
import { isFlagship } from "@/domain/flagship";
import type { Attempt, Question } from "@/domain/types";

// Reference-tier subjects have no review gate, so they pass the permissive
// trustedAssessmentContent. Their questions must stay available for practice,
// including transfer and retention practice, but a learning action built on
// one must never be labelled "trusted-assessment" (the label that means a
// result can count as proof). Same scenario as the durable-learning-loop
// retention test, with the bank moved to a non-flagship subject id.

const REFERENCE = "aqa-alevel-biology";
const bank: Question[] = rawBank.map((question) => ({ ...question, subjectId: REFERENCE }));
const START = Date.parse("2026-09-08T09:00:00Z");
const q = (slug: string) => bank.find((item) => item.id === `cnt:question:repair-depth-${slug}`)!;
function answer(question: Question, id: string, offset: number): Attempt {
  return { id, userId: "learner", questionId: question.id, subjectId: question.subjectId,
    topicIds: question.topicIds, answers: Object.fromEntries(question.parts.map((p) => [p.id, p.modelAnswer])),
    marked: question.parts.map((p) => ({ partId: p.id, awarded: p.marks, max: p.marks, creditedPoints: p.markScheme, missedPoints: [], comment: "" })),
    awarded: question.totalMarks, max: question.totalMarks, feedback: "", markedBy: "rubric", elapsedMs: 90_000,
    mode: "practice", createdAt: new Date(START + offset).toISOString() };
}

describe("reference-tier learning actions", () => {
  it("keeps reference practice available but labels it practice-only, never trusted assessment", () => {
    expect(isFlagship(REFERENCE)).toBe(false);
    const source = q("bio-inhibitor-recall");
    const original = { ...answer(source, "original", 0), awarded: 0,
      marked: source.parts.map((p) => ({ partId: p.id, awarded: 0, max: p.marks, creditedPoints: [], missedPoints: p.markScheme, comment: "" })) };
    let next = 0;
    const mistake = mistakesFromAttempt(original, source, () => `id-${++next}`, new Date(START))[0]!.mistake;
    const guided = { ...answer(source, "guided", 60_000), repairTeachingSeen: true, retestMistakeId: mistake.id };
    const m1 = advanceMistakeRepair(mistake, source, guided, [original], bank);
    const independent = answer(q("bio-inhibitor-application"), "independent", 120_000);
    const m2 = advanceMistakeRepair(m1, q("bio-inhibitor-application"), independent, [original, guided], bank);
    const transfer = answer(q("bio-inhibitor-transfer"), "transfer", 180_000);
    const m3 = advanceMistakeRepair(m2, q("bio-inhibitor-transfer"), transfer, [original, guided, independent], bank);
    const attempts = [original, guided, independent, transfer, answer(q("bio-site-probe"), "site", -2000), answer(q("bio-saturation-probe"), "sat", -1000)];
    const action = selectLearningAction({ topicId: m3.topicId, nodes: wjecCapabilities, questions: bank, attempts, mistakes: [m3],
      now: new Date(START + 180_000 + REPAIR_RETENTION_DELAY_MS) });
    expect(action).toBeTruthy();
    expect(action!.contentTrust).toBe("practice-only");
  });
});
