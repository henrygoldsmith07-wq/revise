import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { questionFamilies, questionFreshness, questionReasoningMoves, unseenQuestion, unseenQuestionTester } from "@/domain/learning-evidence";
import { quickDiagnosticPool } from "@/domain/quick-diagnostic";
import { isShallowReskin } from "@/domain/reskin";
import type { Attempt, Question } from "@/domain/types";

// The batch form of unseenQuestion must give exactly the verdicts the
// original single-question implementation gave, on the real authored bank.
// `reference` is that original implementation, kept verbatim.
function reference(question: Question, history: readonly Attempt[], questions: readonly Question[]): boolean {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const families = new Set(questionFamilies(question));
  const previous = history.flatMap(a => byId.has(a.questionId) ? [byId.get(a.questionId)!] : []);
  const reskin = previous.some((seen) => seen.subjectId === question.subjectId && seen.topicIds.some((t) => question.topicIds.includes(t)) && isShallowReskin(question, seen));
  return !reskin && !history.some((a) => a.questionId === question.id ||
    (byId.has(a.questionId) && questionFamilies(byId.get(a.questionId)!).some((family) => families.has(family)))) &&
    (question.subjectId !== "wjec-alevel-physics" || !questionReasoningMoves(question).length ||
      questionFreshness(question, previous).newReasoning);
}

const attemptOn = (q: Question, i: number): Attempt => ({
  id: `a${i}`, userId: "u", questionId: q.id, subjectId: q.subjectId, topicIds: q.topicIds, answers: {}, marked: [], awarded: 1,
  max: q.totalMarks, feedback: "", markedBy: "rubric", elapsedMs: 60_000, mode: "practice", createdAt: "2026-10-01T09:00:00.000Z",
} as Attempt);

describe("unseenQuestionTester", () => {
  const bank = seedQuestions;
  const physics = bank.filter((q) => q.subjectId === "wjec-alevel-physics");
  // A history spanning subjects, with Physics answers so the reasoning-freshness path runs,
  // plus an attempt on a question that is not in the bank.
  const history: Attempt[] = [
    ...physics.filter((_, i) => i % 53 === 0).slice(0, 8),
    ...bank.filter((q, i) => q.subjectId !== "wjec-alevel-physics" && i % 211 === 0).slice(0, 8),
  ].map(attemptOn);
  history.push({ ...attemptOn(bank[0]!, 99), questionId: "not-in-bank" });

  it("gives the original verdict for every Physics question and a sample of the rest", () => {
    const sample = [...physics, ...bank.filter((q, i) => q.subjectId !== "wjec-alevel-physics" && i % 7 === 0)];
    const unseen = unseenQuestionTester(history, bank);
    const mismatches = sample.filter((q) => unseen(q) !== reference(q, history, bank)).map((q) => q.id);
    expect(mismatches).toEqual([]);
    // Both outcomes occur, so the comparison is not vacuous.
    expect(sample.some((q) => unseen(q))).toBe(true);
    expect(sample.some((q) => !unseen(q))).toBe(true);
  });

  it("the single-question form agrees with the batch form", () => {
    const unseen = unseenQuestionTester(history, bank);
    for (const q of physics.slice(0, 40)) expect(unseenQuestion(q, history, bank)).toBe(unseen(q));
  });

  // No wall-clock assertion (a known flake class here). Measured on the real
  // bank: the Physics pool took ~0.9 s when every question rebuilt the bank
  // index, ~50 ms with one index per call.
  it("the quick-diagnostic pool is unchanged", () => {
    const expected = physics.filter((q) => reference(q, history, bank)).map((q) => q.id);
    expect(quickDiagnosticPool(bank, history, "wjec-alevel-physics").map((q) => q.id)).toEqual(expected);
  });
});
