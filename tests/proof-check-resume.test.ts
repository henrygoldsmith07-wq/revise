import { describe, expect, it } from "vitest";
import {
  buildMissionSession,
  buildProofCheck,
  PROOF_CHECK_STAGE,
  proofCheckCheckpoint,
  proofCheckRunId,
  proofHref,
  restoreMissionSession,
  restoreProofCheck,
} from "@/domain/mission-session";
import { createRevisionCheckpoint, isRevisionCheckpoint, type RevisionCheckpoint } from "@/domain/revision-checkpoint";
import type { Attempt, Question } from "@/domain/types";
import { FLAGSHIP_FIXTURE_SUBJECT, flagshipAttempt, flagshipBank, question } from "./helpers-recovery";

// Regression cover for two proof-check resume bugs (PR #66):
//  (a) the run was dated by the checkpoint's `updatedAt`, which moves on every
//      save, so a refresh after answering dropped the answers already given;
//  (b) the check was rebuilt on resume, and the selector excludes answered
//      questions, so the saved set, order and hint budget were replaced.

const TOPIC = "algebra";
const SUBJECT = FLAGSHIP_FIXTURE_SUBJECT;
const START = "2026-10-16T10:00:00.000Z";
const FIRST_ANSWER = "2026-10-16T10:04:00.000Z";
/** Saved after the first answer: this is the `updatedAt` the old code used as the run start. */
const SAVED_AFTER_FIRST = "2026-10-16T10:04:05.000Z";

const at = (id: string, questionId: string, createdAt: string): Attempt =>
  flagshipAttempt(id, questionId, 2, 3, createdAt, { topicIds: [TOPIC], mode: "practice" });

/** The checkpoint as the store would hold it after the learner answered question 1 and moved to question 2. */
function savedAfterFirstAnswer(): { checkpoint: RevisionCheckpoint; ids: string[]; attempts: Attempt[] } {
  const fresh = buildProofCheck({ topicId: TOPIC, questions: flagshipBank, attempts: [] });
  expect(fresh.questionIds.length).toBe(2);
  const input = proofCheckCheckpoint(fresh, { title: "Prove Algebra", subjectId: SUBJECT }, START, 1);
  const checkpoint = JSON.parse(JSON.stringify(createRevisionCheckpoint("u1", input, SAVED_AFTER_FIRST))) as RevisionCheckpoint;
  return { checkpoint, ids: fresh.questionIds, attempts: [at("p1", fresh.questionIds[0]!, FIRST_ANSWER)] };
}

describe("a proof check survives a refresh", () => {
  it("saves a valid checkpoint with no schema change: start instant, exact questions, no hints", () => {
    const { checkpoint, ids } = savedAfterFirstAnswer();
    expect(isRevisionCheckpoint(checkpoint)).toBe(true);
    expect(checkpoint.href).toBe(proofHref(SUBJECT, TOPIC));
    expect(checkpoint.mission).toEqual({
      missionId: proofCheckRunId(TOPIC), stage: PROOF_CHECK_STAGE, startedAt: START, questionIds: ids,
      hintBudgetFor: Object.fromEntries(ids.map((id) => [id, 0])), contextFor: {},
    });
  });

  it("(a) keeps answers given before the last save, because the run is dated by its start, not updatedAt", () => {
    const { checkpoint, ids, attempts } = savedAfterFirstAnswer();
    // The old bug in one line: the first answer predates updatedAt.
    expect(attempts[0]!.createdAt < checkpoint.updatedAt).toBe(true);
    const restored = restoreProofCheck(checkpoint, { topicId: TOPIC, subjectId: SUBJECT, questions: flagshipBank, attempts })!;
    expect(restored).not.toBeNull();
    expect(restored.startedAt).toBe(START);
    expect(restored.resume.attempts.map((a) => a.questionId)).toEqual([ids[0]]);
    expect(restored.resume.index).toBe(1);
  });

  it("(b) restores the saved question set, order and zero hint budget even though a rebuild would choose differently", () => {
    const { checkpoint, ids, attempts } = savedAfterFirstAnswer();
    // What the old code did: rebuild. The answered question is no longer unseen, so the set changes.
    const rebuilt = buildProofCheck({ topicId: TOPIC, questions: flagshipBank, attempts });
    expect(rebuilt.questionIds).not.toEqual(ids);
    expect(rebuilt.questionIds).not.toContain(ids[0]);
    const restored = restoreProofCheck(checkpoint, { topicId: TOPIC, subjectId: SUBJECT, questions: flagshipBank, attempts })!;
    expect(restored.check.questionIds).toEqual(ids);
    expect(restored.check.hintBudget).toBe(0);
    expect(restored.check.verified).toBe(true);
    expect(restored.check.limit).toBeNull();
    // A saved order is kept even when it is not the order a fresh build would produce.
    const reversed = { ...checkpoint, mission: { ...checkpoint.mission!, questionIds: [...ids].reverse() } };
    expect(restoreProofCheck(reversed, { topicId: TOPIC, subjectId: SUBJECT, questions: flagshipBank, attempts })!.check.questionIds).toEqual([...ids].reverse());
  });

  it("ignores answers on the same questions from before this run", () => {
    const { checkpoint, ids } = savedAfterFirstAnswer();
    const earlier = at("old", ids[0]!, "2026-10-01T09:00:00.000Z");
    const restored = restoreProofCheck(checkpoint, { topicId: TOPIC, subjectId: SUBJECT, questions: flagshipBank, attempts: [earlier] })!;
    expect(restored.resume.index).toBe(0);
    expect(restored.resume.attempts).toEqual([]);
  });

  it("reports a finished run as finished rather than starting it again", () => {
    const { checkpoint, ids, attempts } = savedAfterFirstAnswer();
    const both = [...attempts, at("p2", ids[1]!, "2026-10-16T10:08:00.000Z")];
    const restored = restoreProofCheck(checkpoint, { topicId: TOPIC, subjectId: SUBJECT, questions: flagshipBank, attempts: both })!;
    expect(restored.resume.index).toBe(2);
    expect(restored.resume.attempts).toHaveLength(2);
  });

  it("never restores a run that would weaken proof: unreviewed, missing, other-topic or hinted questions", () => {
    const { checkpoint, ids, attempts } = savedAfterFirstAnswer();
    const ctx = { topicId: TOPIC, subjectId: SUBJECT, attempts };
    // Review withdrawn since the save: trust is re-checked, never inherited.
    const unreviewed = flagshipBank.map((q) => (q.id === ids[1] ? { ...q, verification: undefined, humanVerification: undefined } : q));
    expect(restoreProofCheck(checkpoint, { ...ctx, questions: unreviewed })).toBeNull();
    // Reference-tier copy of the same question can never be proof.
    const reference = flagshipBank.map((q) => (q.id === ids[1] ? question(q.id, TOPIC) : q));
    expect(restoreProofCheck(checkpoint, { ...ctx, questions: reference })).toBeNull();
    expect(restoreProofCheck(checkpoint, { ...ctx, questions: flagshipBank.filter((q) => q.id !== ids[1]) })).toBeNull();
    const hinted = { ...checkpoint, mission: { ...checkpoint.mission!, hintBudgetFor: { ...checkpoint.mission!.hintBudgetFor, [ids[1]!]: 2 } } };
    expect(restoreProofCheck(hinted, { ...ctx, questions: flagshipBank })).toBeNull();
    const geometry = flagshipBank.find((q: Question) => q.topicIds.includes("geometry"))!;
    const otherTopic = { ...checkpoint, mission: { ...checkpoint.mission!, questionIds: [ids[0]!, geometry.id] } };
    expect(restoreProofCheck(otherTopic, { ...ctx, questions: flagshipBank })).toBeNull();
  });

  it("refuses a checkpoint for another topic, another route or an ordinary practice queue", () => {
    const { checkpoint, attempts } = savedAfterFirstAnswer();
    const ctx = { subjectId: SUBJECT, questions: flagshipBank, attempts };
    expect(restoreProofCheck(checkpoint, { ...ctx, topicId: "geometry" })).toBeNull();
    expect(restoreProofCheck({ ...checkpoint, href: "/practice" }, { ...ctx, topicId: TOPIC })).toBeNull();
    expect(restoreProofCheck({ ...checkpoint, mission: undefined }, { ...ctx, topicId: TOPIC })).toBeNull();
    expect(restoreProofCheck({ ...checkpoint, mission: { ...checkpoint.mission!, stage: "delayed-proof" } }, { ...ctx, topicId: TOPIC })).toBeNull();
    expect(restoreProofCheck(null, { ...ctx, topicId: TOPIC })).toBeNull();
  });

  it("is never mistaken for a mission step by mission resume", () => {
    const { checkpoint, ids } = savedAfterFirstAnswer();
    const fakeMission = buildMissionSessionStub(ids);
    expect(restoreMissionSession(fakeMission, checkpoint.mission, { missionId: fakeMission.missionId, stage: "delayed-proof" }, () => true)).toBeNull();
  });

  it("is wired into ProofCheckMode: restores before building, and saves the run start", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/components/ProofCheckMode.tsx", "utf8");
    expect(src).toContain("restoreProofCheck(store.revisionCheckpoint");
    expect(src).toContain("proofCheckCheckpoint(check,");
    expect(src).not.toContain("saved.updatedAt");
    expect(src.indexOf("restoreProofCheck(")).toBeLessThan(src.indexOf("buildProofCheck({ topicId"));
  });
});

function buildMissionSessionStub(ids: string[]): ReturnType<typeof buildMissionSession> {
  return { missionId: "mission:algebra", title: "Prove it", stage: "delayed-proof", steps: [], questionIds: ids, minutes: 4, intro: [], limit: null, hintBudgetFor: {}, contextFor: {} };
}
