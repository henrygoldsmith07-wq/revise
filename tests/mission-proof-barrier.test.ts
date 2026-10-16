import { describe, expect, it } from "vitest";
import { buildExamMissions, buildPaperMission, missionNextAction, type MissionInput } from "@/domain/exam-mission";
import { buildMarkRecovery, lossProofBarrier, PROOF_BARRIER_TEXT } from "@/domain/mark-recovery";
import { missionLearnerState } from "@/domain/learner-state";
import { buildMissionSession } from "@/domain/mission-session";
import { buildPaperRecovery } from "@/domain/paper-recovery";
import { rankRevisionActions } from "@/domain/revision-engine";
import { unseenSupplyByTopic } from "@/domain/supply";
import type { Attempt, Mistake, Question } from "@/domain/types";
import { flagshipAttempt as attempt, flagshipBank, flagshipMistake as mistake, FLAGSHIP_FIXTURE_SUBJECT, question } from "./helpers-recovery";

// "Awaiting proof" used to be offered for losses that can never count towards proof (for example WJEC
// paper-mode marks without a verified past paper and human-reviewed marking), so the mission kept
// sending the student back to a proof step it could never complete. These tests pin the honest state:
// the gate itself (trustedAssessmentMistake) is unchanged; the mission now says why and routes to practice.

const NOW = new Date("2026-10-11T12:00:00.000Z");
const at = (iso: string) => `${iso}T09:00:00.000Z`;
// A flagship bank with every question fixture-reviewed: ample reviewed supply, so nothing here is
// blocked by supply. Only the loss itself can be the reason proof is unavailable.
const bank: Question[] = flagshipBank;

const paperLoss = (id: string, questionId: string, topicId = "algebra"): { m: Mistake; a: Attempt } => ({
  m: mistake(id, { questionId, topicId, attemptId: `src-${id}`, workingErrorKind: "unit-error", createdAt: at("2026-09-20") }),
  a: attempt(`src-${id}`, questionId, 0, 3, at("2026-09-20"), { mode: "paper", paperId: "mock-1", paperRunId: "run-1", topicIds: [topicId] }),
});

function input(mistakes: Mistake[], attempts: Attempt[], questions: Question[] = bank, over: Partial<MissionInput> = {}): MissionInput {
  const recovery = buildMarkRecovery({ mistakes, attempts, questions, now: NOW });
  const topics = [...new Set(questions.flatMap((q) => q.topicIds))];
  return { mistakes, recovery, daysToExam: 40, unseenByTopic: {}, supplyByTopic: unseenSupplyByTopic(topics, questions, attempts), topicTitle: (id) => id, ...over };
}

describe("lost marks that cannot count as proof", () => {
  const l1 = paperLoss("m1", "q-a1");
  const l2 = paperLoss("m2", "q-a2");
  const losses = [l1.m, l2.m];
  const sources = [l1.a, l2.a];

  it("labels a paper-mode loss without a verified past paper, and never as awaiting proof", () => {
    const recovery = buildMarkRecovery({ mistakes: losses, attempts: sources, questions: bank, now: NOW });
    expect(recovery.items.map((i) => i.proofBarrier)).toEqual(["loss-unverified-paper", "loss-unverified-paper"]);
    const [mission] = buildExamMissions(input(losses, sources));
    expect(mission.proofBarrier).toBe("loss-unverified-paper");
    expect(mission.proofPossible).toBe(false);
    expect(mission.evidenceLimits[0]?.kind).toBe("loss-not-provable");
    expect(mission.limitsSentence).toContain(PROOF_BARRIER_TEXT["loss-unverified-paper"]);
    expect(mission.limitsSentence).toMatch(/More questions would not change that/);
    expect(mission.completionCondition).toMatch(/cannot be proven/);
    // Supply is ample, so the old supply-only wording must not appear.
    expect(mission.evidence.join(" ")).not.toMatch(/too few unseen|only unverified unseen/);
    expect(mission.stages.map((s) => s.title)).not.toContain("Delayed check");
  });

  it("after an unaided success on a different question: practice route with a spaced check, not a repeat of apply", () => {
    const success = attempt("ok1", "q-a3", 3, 3, at("2026-09-25"));
    const success2 = attempt("ok2", "q-a4", 3, 3, at("2026-09-25"));
    const attempts = [...sources, success, success2];
    const recovery = buildMarkRecovery({ mistakes: losses, attempts, questions: bank, now: NOW });
    expect(recovery.items.every((i) => i.state === "provisional" && i.unverifiedOnly && i.practiceRevisit)).toBe(true);
    expect(recovery.items[0]!.reason).toContain(PROOF_BARRIER_TEXT["loss-unverified-paper"]);
    const [mission] = buildExamMissions(input(losses, attempts));
    expect(mission.status).not.toBe("awaiting-proof");
    expect(mission.status).toBe("blocked");
    expect(mission.stages.find((s) => s.kind === "apply")!.done).toBe(true);
    expect(mission.current.kind).toBe("delayed-proof");
    expect(mission.current.title).toBe("Spaced practice checks");
    expect(mission.current.blockedBy).toContain(PROOF_BARRIER_TEXT["loss-unverified-paper"]);
    expect(missionLearnerState(mission.status, mission.recovery)).toBe("improving");
    expect(missionNextAction(mission).blocked).toBe(true);
    // The mission session never runs a proof check here: it explains instead.
    const proof = buildMissionSession(mission, { questions: bank, attempts, mistakes: losses }, "delayed-proof");
    expect(proof.questionIds).toEqual([]);
    expect(proof.limit).toContain(PROOF_BARRIER_TEXT["loss-unverified-paper"]);
  });

  it("Today brings it back as a spaced practice check once due, labelled practice, not proof", () => {
    const attempts = [...sources, attempt("ok1", "q-a3", 3, 3, at("2026-09-25")), attempt("ok2", "q-a4", 3, 3, at("2026-09-25"))];
    const recovery = buildMarkRecovery({ mistakes: losses, attempts, questions: bank, now: NOW });
    const plan = rankRevisionActions({
      now: NOW, recovery, mistakes: losses, attempts, questions: bank, subjectIds: [FLAGSHIP_FIXTURE_SUBJECT], examDates: [],
      supplyByTopic: unseenSupplyByTopic(["algebra", "geometry"], bank, attempts), topicTitle: (id) => id, subjectName: (id) => id,
    });
    const action = plan.actions.find((x) => x.id.endsWith(":practice-revisit"));
    expect(action, "a spaced practice check should be offered").toBeDefined();
    expect(action!.title).toMatch(/^Check it held/);
    expect(action!.explanation.proves).toContain(PROOF_BARRIER_TEXT["loss-unverified-paper"]);
    // Today's "Evidence limit" reads this, so it never blames question supply for a barred loss.
    expect(action!.explanation.limit).toContain(PROOF_BARRIER_TEXT["loss-unverified-paper"]);
    expect(plan.actions.some((x) => x.type === "proof-check")).toBe(false);
  });

  it("the apply step still runs as practice when no reviewed question is left", () => {
    const unreviewed = bank.map((q) => q.topicIds[0] === "algebra" && q.id !== "q-a1" && q.id !== "q-a2" ? question(q.id, "algebra", { subjectId: FLAGSHIP_FIXTURE_SUBJECT }) : q);
    const [mission] = buildExamMissions(input(losses, sources, unreviewed));
    expect(mission.proofBarrier).toBe("loss-unverified-paper");
    const apply = buildMissionSession(mission, { questions: unreviewed, attempts: sources, mistakes: losses }, "apply");
    expect(apply.questionIds.length).toBeGreaterThan(0);
    expect(apply.steps.every((s) => s.hintBudget === 0 && /Practice, not proof/.test(s.why))).toBe(true);
  });

  it("names an unreviewed source question and an unlinked loss specifically", () => {
    const unreviewed = [...bank.filter((q) => q.id !== "q-a1"), question("q-a1", "algebra", { subjectId: FLAGSHIP_FIXTURE_SUBJECT })];
    const m = mistake("u1", { questionId: "q-a1", attemptId: "src-u1" });
    const src = attempt("src-u1", "q-a1", 0, 3, m.createdAt);
    const byId = new Map(unreviewed.map((q) => [q.id, q] as const));
    expect(lossProofBarrier(m, byId, [src])).toBe("loss-unreviewed-question");
    expect(lossProofBarrier(m, byId, [])).toBe("loss-unlinked");
    const [mission] = buildExamMissions(input([m], [src], unreviewed));
    expect(mission.proofBarrier).toBe("loss-unreviewed-question");
    expect(mission.limitsSentence).toContain("reviewed by two teachers");
  });

  it("a self-marked loss is an untrusted mark, not a paper problem", () => {
    const m = mistake("s1", { questionId: "q-a1", attemptId: "src-s1" });
    const src = attempt("src-s1", "q-a1", 0, 3, m.createdAt, { markedBy: "self" });
    expect(lossProofBarrier(m, new Map(bank.map((q) => [q.id, q] as const)), [src])).toBe("loss-untrusted-mark");
  });

  it("leaves trusted losses and mixed missions on the proof route", () => {
    const trusted = mistake("t1", { questionId: "q-a5", attemptId: "src-t1", workingErrorKind: "unit-error", createdAt: at("2026-09-21") });
    const trustedSrc = attempt("src-t1", "q-a5", 0, 3, at("2026-09-21"));
    const recovery = buildMarkRecovery({ mistakes: [trusted], attempts: [trustedSrc], questions: bank, now: NOW });
    expect(recovery.items[0]!.proofBarrier).toBeUndefined();
    const mixed = buildExamMissions(input([l1.m, l2.m, trusted], [...sources, trustedSrc]));
    expect(mixed.every((x) => x.proofBarrier === undefined)).toBe(true);
    expect(mixed.some((x) => x.stages.some((s) => s.title === "Delayed check"))).toBe(true);
  });

  it("a paper mission built from the autopsy says the same thing", () => {
    const recoveryInput = input(losses, sources);
    const withPaper = { ...recoveryInput, recovery: buildMarkRecovery({ mistakes: losses, attempts: sources, questions: bank, now: NOW }) };
    const mission = buildPaperMission("mock-1", withPaper);
    expect(mission?.proofBarrier).toBe("loss-unverified-paper");
    expect(mission?.status).not.toBe("awaiting-proof");
  });

  it("the paper autopsy does not imply a different question would prove it", () => {
    const attempts = [...sources, attempt("ok1", "q-a3", 3, 3, at("2026-09-25")), attempt("ok2", "q-a4", 3, 3, at("2026-09-25"))];
    const recovery = buildMarkRecovery({ mistakes: losses, attempts, questions: bank, now: NOW });
    const paper = buildPaperRecovery({ paperId: "mock-1", title: "Mock", mistakes: losses, recovery, attempts, questions: bank });
    expect(paper?.stageReason).toContain(PROOF_BARRIER_TEXT["loss-unverified-paper"]);
    expect(paper?.stageReason).not.toMatch(/not yet on a different question/);
  });

  it("reference-tier losses are untouched by barriers (their own practice-only rules apply)", () => {
    const m: Mistake = { ...mistake("r1"), subjectId: "maths" };
    expect(lossProofBarrier(m, new Map(), [])).toBeUndefined();
  });
});
