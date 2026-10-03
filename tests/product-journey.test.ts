import { describe, expect, it } from "vitest";
import { COLD_START_FLAGSHIP_MIN_TOPICS, planColdStart } from "@/domain/cold-start";
import { trustedAssessmentContent } from "@/domain/content-trust";
import { buildMarkRecovery } from "@/domain/mark-recovery";
import { buildExamMissions } from "@/domain/exam-mission";
import { buildMistakePatterns } from "@/domain/mistake-patterns";
import { quickDiagnosticPool, selectQuickDiagnostic } from "@/domain/quick-diagnostic";
import { rankRevisionActions, type EngineInput } from "@/domain/revision-engine";
import { evidenceLimits, limitsSentence, proofBlocked, unseenSupplyByTopic } from "@/domain/supply";
import { buildReviewPriorities } from "@/domain/review-priority";
import type { Attempt, ExamDate, Mistake, Question } from "@/domain/types";
import { DISTINCT_PROMPTS, gateFor, NOW, SUBJECT, topic, verifyThroughWorkflow, wq } from "./helpers-review";

// One flagship learner, end to end, on a bank whose trust comes only through the review workflow:
// cold start → diagnostic → lost marks → repair → independent success → delayed proof → regression.

const slugs = ["algebra", "calculus", "probability", "mechanics", "statistics", "sequences"];
const topics = slugs.map((s, i) => topic(s, i + 1));
const topicId = (slug: string) => `${SUBJECT}.${slug}`;
const authored: Question[] = slugs.flatMap((slug, s) => [0, 1, 2].map((n) => wq(`${slug}-${n}`, slug, DISTINCT_PROMPTS[s * 3 + n]!)));
const trustedIds = slugs.flatMap((slug) => [0, 1, 2].map((n) => `${slug}-${n}`));
const exam: ExamDate = { id: "e", userId: "u1", subjectId: SUBJECT, date: "2026-12-05", label: "Maths" };
const day = (d: number, h = 9) => new Date(Date.UTC(2026, 9, d, h)).toISOString();
const topicSubject = (id: string) => id.split(".")[0] === "wjec-alevel-maths" ? SUBJECT : undefined;

let counter = 0;
function attempt(q: Question, awarded: number, createdAt: string, over: Partial<Attempt> = {}): Attempt {
  return {
    id: `att-${++counter}`, userId: "u1", questionId: q.id, subjectId: SUBJECT, topicIds: q.topicIds, answers: {}, marked: [], awarded, max: q.totalMarks, feedback: "",
    markedBy: "rubric", elapsedMs: 80_000, mode: "practice", createdAt, ...over,
  };
}
function loss(q: Question, a: Attempt): Mistake {
  return { id: `m-${a.id}`, userId: "u1", subjectId: SUBJECT, topicId: q.topicIds[0]!, questionId: q.id, attemptId: a.id, marksLost: q.totalMarks, description: "Lost marks", category: "method", resolved: false, createdAt: a.createdAt };
}

function engine(questions: Question[], attempts: Attempt[], mistakes: Mistake[], now: Date): EngineInput {
  const recovery = buildMarkRecovery({ mistakes, attempts, questions, now });
  const topicIds = new Set(questions.flatMap((q) => q.topicIds));
  return {
    now, subjectIds: [SUBJECT], mistakes, attempts, questions, recovery, examDates: [exam],
    supplyByTopic: unseenSupplyByTopic(topicIds, questions, attempts),
    coldStart: planColdStart({ subjectIds: [SUBJECT], attempts, mistakes, reviewLogs: [], questions, examDates: [exam], topicSubject, now }),
    dueReviews: [], subjectName: () => "Maths", topicTitle: (id) => id,
  };
}

describe("flagship learner journey on workflow-verified questions", () => {
  const { questions: bank } = verifyThroughWorkflow(authored, trustedIds);
  const byId = new Map(bank.map((q) => [q.id, q]));
  const q = (id: string) => byId.get(id)!;

  it("supply failure: with no reviewed questions Revise offers no diagnostic, explains the block and claims nothing", () => {
    expect(authored.some(trustedAssessmentContent)).toBe(false);
    const plan = planColdStart({ subjectIds: [SUBJECT], attempts: [], mistakes: [], reviewLogs: [], questions: authored, examDates: [exam], topicSubject, now: NOW });
    expect(plan).toBeNull();
    const input = engine(authored, [], [], NOW);
    expect(rankRevisionActions(input).top?.type).not.toBe("quick-check");
    const notes = evidenceLimits({ supply: unseenSupplyByTopic([topicId("algebra")], authored, [])[topicId("algebra")]!, daysToExam: 60, minProofDays: 3, trustedAttempts: 0, delayedChecked: false });
    expect(proofBlocked(notes)).toBe(true);
    expect(limitsSentence(notes)).toMatch(/cannot currently prove the improvement because the remaining new questions have not been reviewed yet/);
    const review = buildReviewPriorities({ topics, questions: authored, gate: gateFor(topics), now: NOW, subjectIds: [SUBJECT] });
    expect(review.subjects[0]!.coldStartReady).toBe(false);
    expect(review.queue[0]!.unlocks).toContain("cold-start-diagnostic");
  });

  it("cold start: reviewed questions unlock a short, broad, unseen diagnostic as the first action", () => {
    const plan = planColdStart({ subjectIds: [SUBJECT], attempts: [], mistakes: [], reviewLogs: [], questions: bank, examDates: [exam], topicSubject, now: NOW });
    expect(plan).not.toBeNull();
    expect(plan!.topics).toBeGreaterThanOrEqual(COLD_START_FLAGSHIP_MIN_TOPICS);
    expect(plan!.minutes).toBeLessThanOrEqual(10);
    expect(rankRevisionActions(engine(bank, [], [], NOW)).top?.type).toBe("quick-check");

    const pool = quickDiagnosticPool(bank, [], SUBJECT);
    const selection = selectQuickDiagnostic({ questions: pool, topicIds: [...new Set(pool.flatMap((p) => p.topicIds))].sort() });
    expect(selection.items.every((i) => trustedAssessmentContent(q(i.questionId)))).toBe(true);
    expect(new Set(selection.items.map((i) => i.topicId)).size).toBeGreaterThanOrEqual(COLD_START_FLAGSHIP_MIN_TOPICS);
  });

  it("a question already answered is never offered in the diagnostic again", () => {
    const seen = attempt(q("algebra-0"), 2, day(1));
    expect(quickDiagnosticPool(bank, [seen], SUBJECT).some((p) => p.id === "algebra-0")).toBe(false);
  });

  it("fresh learner → wrong diagnostic answers → lost marks → Today changes to recovery", () => {
    const pool = quickDiagnosticPool(bank, [], SUBJECT);
    const { items } = selectQuickDiagnostic({ questions: pool, topicIds: [...new Set(pool.flatMap((p) => p.topicIds))].sort() });
    const attempts = items.map((i) => attempt(q(i.questionId), 0, day(1, 9), { mode: "diagnostic" as never }));
    const mistakes = items.map((i, n) => loss(q(i.questionId), attempts[n]!));
    const now = new Date(day(1, 10));
    const recovery = buildMarkRecovery({ mistakes, attempts, questions: bank, now });
    expect(recovery.totals.previouslyLost).toBeGreaterThan(0);
    const plan = rankRevisionActions(engine(bank, attempts, mistakes, now));
    expect(plan.top?.type).not.toBe("quick-check");
    expect(plan.actions.some((a) => a.type === "quick-check")).toBe(false);
    expect(plan.top?.marksRecoverable ?? 0).toBeGreaterThan(0);
  });

  describe("repair → awaiting proof → proven → regressed on one lost question", () => {
    const source = q("algebra-0");
    const lost = attempt(source, 0, day(1));
    const mistakes = [loss(source, lost)];
    const state = (attempts: Attempt[], now: Date) => buildMarkRecovery({ mistakes, attempts: [lost, ...attempts], questions: bank, now }).items[0]!;

    it("supported success is not proof", () => {
      const supported = attempt(q("algebra-1"), 2, day(2), { hintTier: "scaffold", retestMistakeId: mistakes[0]!.id });
      expect(state([supported], new Date(day(2, 12))).state).toBe("provisional");
    });

    it("independent success on a genuinely different question awaits a delayed check", () => {
      const independent = attempt(q("algebra-1"), 2, day(2));
      const item = state([independent], new Date(day(2, 12)));
      expect(item.state).toBe("awaiting-proof");
      expect(item.proofDueAt).toBeDefined();
    });

    it("the delay passes and a new trusted unseen question answered independently proves it", () => {
      const independent = attempt(q("algebra-1"), 2, day(2));
      const tooSoon = attempt(q("algebra-2"), 2, day(3));
      expect(state([independent, tooSoon], new Date(day(3, 12))).state).toBe("awaiting-proof");
      const delayed = attempt(q("algebra-2"), 2, day(7));
      expect(state([independent, delayed], new Date(day(7, 12))).state).toBe("proven");
    });

    it("a later independent failure regresses it, and Today prioritises repair", () => {
      const independent = attempt(q("algebra-1"), 2, day(2));
      const delayed = attempt(q("algebra-2"), 2, day(7));
      const failure = attempt(q("calculus-0"), 0, day(10), { topicIds: [topicId("algebra")] });
      const attempts = [lost, independent, delayed, failure];
      const now = new Date(day(10, 12));
      expect(state([independent, delayed, failure], now).state).toBe("regressed");
      const plan = rankRevisionActions(engine(bank, attempts, [...mistakes, loss(q("calculus-0"), failure)], now));
      expect(["regression-recovery", "mission", "recurring-error", "weak-topic"]).toContain(plan.top?.type);
      expect(plan.top?.type).not.toBe("quick-check");
    });

    it("an exam mission is awaiting proof, then proven, on the same evidence", () => {
      const independent = attempt(q("algebra-1"), 2, day(2));
      const patterns = (attempts: Attempt[]) => buildMistakePatterns({ mistakes, attempts, questions: bank });
      const missionAt = (attempts: Attempt[], now: Date) => buildExamMissions({
        mistakes, recovery: buildMarkRecovery({ mistakes, attempts, questions: bank, now }), patterns: patterns(attempts), daysToExam: 60,
        unseenByTopic: { [topicId("algebra")]: 3 }, topicTitle: (id) => id, includeProven: true,
      })[0];
      expect(missionAt([lost, independent], new Date(day(2, 12)))?.status).toBe("awaiting-proof");
      const delayed = attempt(q("algebra-2"), 2, day(7));
      expect(missionAt([lost, independent, delayed], new Date(day(7, 12)))?.status).toBe("proven");
    });
  });

  describe("duplicate protection", () => {
    const source = wq("src", "algebra", "Show that x = 2 is a root of f(x) = x³ - 5x² + 4x - 3 and state the remainder when f is divided by x - 2.");
    const numberSwap = wq("swap-number", "algebra", "Show that x = 3 is a root of f(x) = x³ - 6x² + 5x - 4 and state the remainder when f is divided by x - 3.");
    const nounSwap = wq("swap-noun", "algebra", "Show that x = 2 is a root of g(x) = x³ - 5x² + 4x - 3 and state the remainder when g is divided by x - 2.");
    const genuinely = wq("different", "algebra", DISTINCT_PROMPTS[20]!);
    const { questions } = verifyThroughWorkflow([source, numberSwap, nounSwap, genuinely], ["src", "swap-number", "swap-noun", "different"]);
    const find = (id: string) => questions.find((x) => x.id === id)!;
    const lostAttempt = attempt(find("src"), 0, day(1));
    const mistake = [loss(find("src"), lostAttempt)];
    const recoveryOf = (attempts: Attempt[]) => buildMarkRecovery({ mistakes: mistake, attempts: [lostAttempt, ...attempts], questions, now: new Date(day(12)) }).items[0]!;

    it("number and noun reskins never count as independent proof", () => {
      expect(recoveryOf([attempt(find("swap-number"), 2, day(2))]).state).toBe("provisional");
      expect(recoveryOf([attempt(find("swap-noun"), 2, day(2))]).state).toBe("provisional");
      expect(recoveryOf([attempt(find("different"), 2, day(2))]).state).toBe("awaiting-proof");
    });

    it("a reskin of the first success cannot supply the delayed check", () => {
      const first = attempt(find("different"), 2, day(2));
      const reskinOfFirst = wq("different-reskin", "algebra", DISTINCT_PROMPTS[20]!.replace("logarithmic", "exponential"));
      const bank2 = verifyThroughWorkflow([source, find("different"), reskinOfFirst], ["src", "different", "different-reskin"]).questions;
      const result = buildMarkRecovery({ mistakes: mistake, attempts: [lostAttempt, first, attempt(bank2.find((x) => x.id === "different-reskin")!, 2, day(8))], questions: bank2, now: new Date(day(12)) }).items[0]!;
      expect(result.state).toBe("awaiting-proof");
    });

    it("a reskin of an answered question is not unseen supply", () => {
      const supply = unseenSupplyByTopic([topicId("algebra")], questions, [lostAttempt])[topicId("algebra")]!;
      expect(supply.provable).toBe(1); // only the genuinely different question remains
    });
  });

  describe("supply failure after improvement", () => {
    it("improvement on unreviewed content stays provisional and says why", () => {
      const source = wq("u-src", "algebra", DISTINCT_PROMPTS[10]!);
      const next = wq("u-next", "algebra", DISTINCT_PROMPTS[11]!);
      const { questions } = verifyThroughWorkflow([source, next], ["u-src"]);
      const lostAttempt = attempt(questions[0]!, 0, day(1));
      const mistake = [loss(questions[0]!, lostAttempt)];
      const item = buildMarkRecovery({ mistakes: mistake, attempts: [lostAttempt, attempt(questions[1]!, 2, day(2))], questions, now: new Date(day(9)) }).items[0]!;
      expect(item.state).toBe("provisional");
      expect(item.reason).toBe("You improved here, but Revise does not yet have enough reviewed new questions to prove it.");
    });
  });
});
