import { describe, expect, it } from "vitest";
import { learnerEvidenceTrusted } from "@/domain/content-trust";
import { buildMarkRecovery } from "@/domain/mark-recovery";
import { buildExamMissions } from "@/domain/exam-mission";
import { buildMissionSession, buildProofCheck } from "@/domain/mission-session";
import type { ProofLedger, TopicProof } from "@/domain/proof-of-improvement";
import { rankRevisionActions, type RevisionAction } from "@/domain/revision-engine";
import { unseenSupplyByTopic } from "@/domain/supply";
import type { Question } from "@/domain/types";
import { FLAGSHIP_FIXTURE_SUBJECT, flagshipBank, flagshipMistake, sourceAttempt } from "./helpers-recovery";

// Evidence wording follows trust (PR #66): "counts as evidence" / "counts as
// proof" is said only when the questions behind it are teacher-reviewed
// flagship content (learnerEvidenceTrusted). Every flagship bank currently has
// zero approved questions, so the unreviewed case is the one learners see.

const NOW = new Date("2026-10-16T10:00:00.000Z");
const TOPIC = "algebra";
const unreviewedBank: Question[] = flagshipBank.map((q) => ({ ...q, verification: undefined, humanVerification: undefined }));

function row(): TopicProof {
  return {
    topicId: TOPIC, subjectId: FLAGSHIP_FIXTURE_SUBJECT, share: 0.2, status: "awaiting-proof",
    before: { rate: 0.4, low: 0.1, high: 0.7, questions: 3, from: "2026-10-01T10:00:00.000Z", to: "2026-10-02T10:00:00.000Z" },
    after: null, gain: null, delayDays: null, provableFrom: "2026-10-05", proofDue: true,
    familiarRate: null, unseenRate: null, illusory: false, markPoints: 0,
  };
}

function ledger(): ProofLedger {
  return {
    topics: [row()], conversion: { rate: 0, pairs: 0, observed: false }, bySubject: {},
    provenMarks: 0, proven: 0, declined: 0, awaiting: 1, due: 1, illusory: 0, headline: "",
  };
}

function proofAction(questions: Question[]): RevisionAction {
  const recovery = buildMarkRecovery({ mistakes: [], attempts: [], questions, now: NOW });
  const plan = rankRevisionActions({
    now: NOW, recovery, mistakes: [], attempts: [], questions, examDates: [], subjectIds: [FLAGSHIP_FIXTURE_SUBJECT],
    supplyByTopic: unseenSupplyByTopic([TOPIC], questions, []), topicTitle: (id) => id, subjectName: (id) => id, proof: ledger(),
  });
  const all = [...plan.actions, ...plan.deferred.map((d) => d.action)];
  const found = all.find((a) => a.id === `action:proof:${TOPIC}`);
  expect(found, "the due proof check is offered or deferred, never dropped").toBeDefined();
  return found!;
}

const text = (a: RevisionAction) => JSON.stringify(a.explanation);

describe("proof-check wording follows trust", () => {
  it("claims evidence when every question in the check is teacher-reviewed", () => {
    expect(flagshipBank.every(learnerEvidenceTrusted)).toBe(true);
    const action = proofAction(flagshipBank);
    expect(action.blockedBy).toBeUndefined();
    expect(action.explanation.evidence).toContain("reviewed by teachers, so a correct answer counts as evidence");
    expect(action.explanation.whyNow).toMatch(/would count as evidence/);
  });

  it("never claims evidence or proof with zero reviewed questions (the state every flagship is in today)", () => {
    expect(unreviewedBank.some(learnerEvidenceTrusted)).toBe(false);
    expect(buildProofCheck({ topicId: TOPIC, questions: unreviewedBank, attempts: [] }).questionIds).toEqual([]);
    const action = proofAction(unreviewedBank);
    expect(action.blockedBy).toBeTruthy();
    expect(text(action)).not.toMatch(/counts as evidence|would count as evidence|reviewed by (a human|teachers), so/i);
    expect(action.explanation.proves).toMatch(/cannot count as proof/);
  });
});

function missionStepText(questions: Question[], stage: "apply" | "delayed-proof"): { why: string[]; verified: boolean[] } {
  const mistakes = [flagshipMistake("m1", { questionId: "q-a1", marksLost: 3 }), flagshipMistake("m2", { questionId: "q-a2", marksLost: 3, createdAt: "2026-09-21T10:00:00.000Z" })];
  const attempts = mistakes.map(sourceAttempt);
  const recovery = buildMarkRecovery({ mistakes, attempts, questions, now: NOW });
  const mission = buildExamMissions({ mistakes, recovery, daysToExam: 30, unseenByTopic: {}, supplyByTopic: unseenSupplyByTopic([TOPIC], questions, attempts) })[0]!;
  const session = buildMissionSession(mission, { questions, attempts, mistakes }, stage);
  return { why: [...session.steps.map((st) => st.why), ...session.intro, session.limit ?? ""], verified: session.steps.map((st) => st.verified) };
}

describe("mission copy follows trust", () => {
  it("says 'counts as independent evidence' only on a reviewed apply step", () => {
    const reviewedRun = missionStepText(flagshipBank, "apply");
    expect(reviewedRun.why.join(" ")).toMatch(/counts as independent evidence/);
    expect(reviewedRun.verified.every(Boolean)).toBe(true);
    const unreviewedRun = missionStepText(unreviewedBank, "apply");
    expect(unreviewedRun.why.join(" ")).not.toMatch(/counts as independent evidence|proves the marks are back/);
  });

  it("says a delayed check proves the marks only when its questions are reviewed", () => {
    expect(missionStepText(flagshipBank, "delayed-proof").why.join(" ")).toMatch(/proves the marks are back/);
    expect(missionStepText(unreviewedBank, "delayed-proof").why.join(" ")).not.toMatch(/proves the marks are back|counts as proof/);
  });

  it("only says 'counts as independent evidence' / 'counts as proof' next to a reviewed check", async () => {
    const { readFileSync } = await import("node:fs");
    const session = readFileSync("src/domain/mission-session.ts", "utf8");
    // Each claim sits behind proofEligible(...), which is learnerEvidenceTrusted on every question.
    expect(session).toMatch(/proofEligible\(applied\)\s*\?\s*"[^"]*counts as independent evidence\."/);
    expect(session).toMatch(/proofEligible\(delayed\)\s*\?\s*"[^"]*proves the marks are back\."/);
    expect(session).toContain("qs.length > 0 && qs.every(learnerEvidenceTrusted)");
    const engine = readFileSync("src/domain/revision-engine.ts", "utf8");
    expect(engine).toMatch(/proofEligible\s*\?\s*"Enough time has passed that a check on a different question now counts as proof\."/);
    expect(engine).toContain('session.steps.some((s) => s.kind === "delayed-proof" && s.verified)');
  });
});
