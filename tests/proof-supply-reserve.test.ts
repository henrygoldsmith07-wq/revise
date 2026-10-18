import { describe, expect, it } from "vitest";
import { learnerEvidenceTrusted } from "@/domain/content-trust";
import { buildExamMissions } from "@/domain/exam-mission";
import { buildMarkRecovery } from "@/domain/mark-recovery";
import { buildMissionSession, buildProofCheck, selectProofCandidates } from "@/domain/mission-session";
import { deferProofSupply } from "@/domain/practice-step-mode";
import { unseenSupplyByTopic } from "@/domain/supply";
import type { Attempt, Mistake, Question } from "@/domain/types";
import { FLAGSHIP_FIXTURE_SUBJECT, flagshipAttempt, flagshipMistake, question, reviewed, sourceAttempt } from "./helpers-recovery";

// Thirtieth pass: a supported step (mission repair/practise, the unaided
// practice of a proof-barred mission, a guided or worked plan step) must not
// spend teacher-reviewed questions the topic's unaided/delayed proof needs.
// Every flagship has 0 approved questions today, so these use fixture
// approvals (helpers-recovery `reviewed`); nothing here is a real approval.

const NOW = new Date("Sun 2026-10-18 11:00 AM BST (UTC+01:00)");
const TOPIC = "algebra";
const unreviewedQ = (id: string, overrides: Partial<Question> = {}) => question(id, TOPIC, { subjectId: FLAGSHIP_FIXTURE_SUBJECT, ...overrides });
const reviewedQ = (id: string, overrides: Partial<Question> = {}) => reviewed(unreviewedQ(id, overrides));

/** q-a1 is the question marks were lost on; the rest are candidates. */
function bankWith(reviewedIds: string[], unreviewedIds: string[]): Question[] {
  return [unreviewedQ("q-a1"), ...reviewedIds.map((id) => reviewedQ(id)), ...unreviewedIds.map((id) => unreviewedQ(id))];
}

function missionFor(questions: Question[], stage: "repair" | "practise" | "apply") {
  const mistakes: Mistake[] = [flagshipMistake("m1", { questionId: "q-a1", marksLost: 3 })];
  const attempts: Attempt[] = mistakes.map(sourceAttempt);
  const recovery = buildMarkRecovery({ mistakes, attempts, questions, now: NOW });
  const mission = buildExamMissions({ mistakes, recovery, daysToExam: 30, unseenByTopic: {}, supplyByTopic: unseenSupplyByTopic([TOPIC], questions, attempts) })[0]!;
  expect(mission, "fixture produces a mission").toBeDefined();
  return { session: buildMissionSession(mission, { questions, attempts, mistakes }, stage), attempts };
}

const byId = (qs: Question[]) => new Map(qs.map((q) => [q.id, q] as const));

describe("selectProofCandidates reserveReviewed", () => {
  const bank = bankWith(["q-r1", "q-r2"], ["q-u1", "q-u2"]);

  it("without the option keeps the old order (reviewed first on a tie)", () => {
    const picked = selectProofCandidates(bank, [], [TOPIC], { max: 2, verifiedOnly: false, excludeQuestionIds: ["q-a1"] });
    expect(picked.every(learnerEvidenceTrusted)).toBe(true);
  });

  it("fills with unreviewed questions first", () => {
    const picked = selectProofCandidates(bank, [], [TOPIC], { max: 2, verifiedOnly: false, reserveReviewed: true, excludeQuestionIds: ["q-a1"] });
    expect(picked.map((q) => q.id).sort()).toEqual(["q-u1", "q-u2"]);
  });

  it("spends a reviewed question only for a slot nothing else can fill", () => {
    const picked = selectProofCandidates(bank, [], [TOPIC], { max: 3, verifiedOnly: false, reserveReviewed: true, excludeQuestionIds: ["q-a1"] });
    expect(picked.filter(learnerEvidenceTrusted)).toHaveLength(1);
    expect(picked.slice(0, 2).some(learnerEvidenceTrusted)).toBe(false);
  });

  it("falls back to reviewed questions when they are the only supply", () => {
    const only = bankWith(["q-r1", "q-r2"], []);
    const picked = selectProofCandidates(only, [], [TOPIC], { max: 1, verifiedOnly: false, reserveReviewed: true, excludeQuestionIds: ["q-a1"] });
    expect(picked).toHaveLength(1);
    expect(learnerEvidenceTrusted(picked[0])).toBe(true);
  });

  it("is ignored by verifiedOnly selection (proof still gets reviewed questions)", () => {
    const picked = selectProofCandidates(bank, [], [TOPIC], { max: 2, verifiedOnly: true, reserveReviewed: true });
    expect(picked.map((q) => q.id).sort()).toEqual(["q-r1", "q-r2"]);
  });

  it("require filters before the tiers, so a reviewed match beats a re-sit only when no unreviewed match exists", () => {
    const tagged = [
      unreviewedQ("q-a1"),
      reviewedQ("q-r1", { parts: [{ id: "q-r1:a", label: "", prompt: "Answer.", marks: 3, markScheme: ["a", "b", "c"], modelAnswer: "model", specPointIds: ["sp-x"] }] }),
      unreviewedQ("q-u1"),
    ];
    const needsX = (q: Question) => q.parts.some((p) => p.specPointIds?.includes("sp-x"));
    const picked = selectProofCandidates(tagged, [], [TOPIC], { max: 1, verifiedOnly: false, reserveReviewed: true, require: needsX, excludeQuestionIds: ["q-a1"] });
    expect(picked.map((q) => q.id)).toEqual(["q-r1"]);
  });
});

describe("mission supported steps keep reviewed questions for proof", () => {
  it("repair takes an unreviewed sibling and the proof check still has two reviewed questions afterwards", () => {
    const bank = bankWith(["q-r1", "q-r2"], ["q-u1"]);
    const { session, attempts } = missionFor(bank, "repair");
    const repair = session.steps.find((s) => s.kind === "repair")!;
    expect(repair.questionIds).toEqual(["q-u1"]);
    expect(repair.reviewedSpent).toBeUndefined();
    // The learner answers the repair question; the proof check is still fully supplied.
    const after = [...attempts, flagshipAttempt("att-repair", "q-u1", 3, 3, "Sun 2026-10-18 11:10 AM BST (UTC+01:00)")];
    const proof = buildProofCheck({ topicId: TOPIC, questions: bank, attempts: after });
    expect(proof.questionIds.sort()).toEqual(["q-r1", "q-r2"]);
    expect(proof.verified).toBe(true);
  });

  it("repair falls back to a reviewed sibling only when there is no other, and says so", () => {
    const bank = bankWith(["q-r1", "q-r2"], []);
    const { session } = missionFor(bank, "repair");
    const repair = session.steps.find((s) => s.kind === "repair")!;
    expect(repair.questionIds).toHaveLength(1);
    expect(learnerEvidenceTrusted(byId(bank).get(repair.questionIds[0]!))).toBe(true);
    expect(repair.reviewedSpent).toBe(1);
    expect(repair.why).toMatch(/teacher-reviewed question is used here; once seen, it cannot be your proof check/);
  });

  it("a re-sat original is not counted as spent supply", () => {
    const bank = [reviewedQ("q-a1")];
    const { session } = missionFor(bank, "repair");
    const repair = session.steps.find((s) => s.kind === "repair")!;
    expect(repair.questionIds).toEqual(["q-a1"]);
    expect(repair.reviewedSpent).toBeUndefined();
    expect(repair.why).not.toMatch(/proof check/);
  });

  it("supported practice prefers unreviewed questions", () => {
    const bank = bankWith(["q-r1", "q-r2"], ["q-u1", "q-u2", "q-u3"]);
    const { session } = missionFor(bank, "practise");
    const step = session.steps.find((s) => s.kind === "practise")!;
    expect(step.questionIds.sort()).toEqual(["q-u1", "q-u2", "q-u3"]);
    expect(step.reviewedSpent).toBeUndefined();
  });

  it("the proof-bearing apply stage still uses reviewed questions", () => {
    // Lost marks on a reviewed question can count, so the mission has no proof barrier.
    const bank = [reviewedQ("q-a1"), ...bankWith(["q-r1", "q-r2"], ["q-u1", "q-u2"]).slice(1)];
    const { session } = missionFor(bank, "apply");
    const apply = session.steps.find((s) => s.kind === "apply")!;
    expect(apply.questionIds.sort()).toEqual(["q-r1", "q-r2"]);
    expect(apply.verified).toBe(true);
  });

  it("the unaided practice of a proof-barred mission (unreviewed lost marks) keeps reviewed questions too", () => {
    const bank = bankWith(["q-r1", "q-r2"], ["q-u1", "q-u2"]);
    const { session } = missionFor(bank, "apply");
    const apply = session.steps.find((s) => s.kind === "apply")!;
    expect(apply.title).toBe("Unaided practice");
    expect(apply.questionIds.sort()).toEqual(["q-u1", "q-u2"]);
  });

  it("with zero reviewed questions (every flagship today) nothing changes and nothing is noted", () => {
    const bank = bankWith([], ["q-u1", "q-u2", "q-u3"]);
    const { session } = missionFor(bank, "practise");
    expect(session.steps.every((s) => s.reviewedSpent === undefined)).toBe(true);
    expect(session.steps.flatMap((s) => s.questionIds)).toHaveLength(3);
  });
});

describe("deferProofSupply (plan steps on /practice)", () => {
  const bank = bankWith(["q-r1"], ["q-u1", "q-u2"]);
  const ranked = [bank[1]!, bank[2]!, bank[3]!]; // q-r1 ranked first

  it("moves unseen reviewed questions behind the rest in guided and worked steps", () => {
    for (const mode of ["guided", "worked"] as const) {
      const { ordered, deferred } = deferProofSupply(ranked, mode, [], bank);
      expect(ordered.map((q) => q.id)).toEqual(["q-u1", "q-u2", "q-r1"]);
      expect(deferred).toBe(1);
    }
  });

  it("leaves timed, unaided and plain queues alone", () => {
    for (const mode of ["timed", "unaided", null] as const) {
      expect(deferProofSupply(ranked, mode, [], bank).ordered.map((q) => q.id)).toEqual(["q-r1", "q-u1", "q-u2"]);
    }
  });

  it("does not defer a reviewed question already seen (it is no longer proof supply)", () => {
    const seen = [flagshipAttempt("att-r1", "q-r1", 1, 3, "Sat 2026-10-17 11:00 AM BST (UTC+01:00)")];
    expect(deferProofSupply(ranked, "guided", seen, bank).deferred).toBe(0);
  });
});
