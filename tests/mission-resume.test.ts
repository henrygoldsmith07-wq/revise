import { describe, expect, it } from "vitest";
import { missionCheckpoint, missionContinuation, missionResumePosition, missionRunAttempts, restoreMissionSession, type MissionSession } from "@/domain/mission-session";
import { createRevisionCheckpoint, isLocalRoute, isRevisionCheckpoint } from "@/domain/revision-checkpoint";
import { attempt } from "./helpers-recovery";

const ctx = (stage: "repair" | "practise") => ({ missionId: "m1", stage, intervention: "independent-set", targetCause: "unit-error", sourceMistakeIds: ["x1"] });
const session: MissionSession = {
  missionId: "m1", title: "Recover 4 marks", stage: "repair", steps: [], questionIds: ["q1", "q2", "q3"], minutes: 9, intro: [], limit: null,
  hintBudgetFor: { q1: undefined, q2: 0, q3: 0 }, contextFor: { q1: ctx("repair"), q2: ctx("practise"), q3: ctx("practise") },
};
const START = "2026-10-03T10:00:00.000Z";

describe("a mission step survives a refresh", () => {
  it("saves exactly the questions, support and attribution that were running", () => {
    const input = missionCheckpoint(session, { stage: "repair" }, START, 1);
    const checkpoint = createRevisionCheckpoint("u1", input, START);
    expect(isRevisionCheckpoint(JSON.parse(JSON.stringify(checkpoint)))).toBe(true);
    expect(isLocalRoute(checkpoint.href)).toBe(true);
    expect(checkpoint.href).toBe("/practice?mission=m1&stage=repair");
    expect(checkpoint.position).toBe(1);
    expect(checkpoint.total).toBe(3);
  });

  it("restores the same questions even when a fresh build would choose differently", () => {
    const saved = missionCheckpoint(session, { stage: "repair" }, START, 1).mission!;
    const freshlyRebuilt: MissionSession = { ...session, questionIds: ["q9", "q8", "q7"], hintBudgetFor: {}, contextFor: {} };
    const restored = restoreMissionSession(freshlyRebuilt, JSON.parse(JSON.stringify(saved)), { missionId: "m1", stage: "repair" }, () => true)!;
    expect(restored.questionIds).toEqual(["q1", "q2", "q3"]);
    expect(restored.hintBudgetFor).toEqual({ q1: undefined, q2: 0, q3: 0 });
    expect(restored.contextFor.q2).toEqual(ctx("practise"));
  });

  it("refuses to restore a different mission, a different stage or a missing question", () => {
    const saved = missionCheckpoint(session, { stage: "repair" }, START, 0).mission!;
    expect(restoreMissionSession(session, saved, { missionId: "m2", stage: "repair" }, () => true)).toBeNull();
    expect(restoreMissionSession(session, saved, { missionId: "m1", stage: "apply" }, () => true)).toBeNull();
    expect(restoreMissionSession(session, saved, { missionId: "m1", stage: null }, () => true)).toBeNull();
    expect(restoreMissionSession(session, saved, { missionId: "m1", stage: "repair" }, (id) => id !== "q2")).toBeNull();
    expect(restoreMissionSession(session, undefined, { missionId: "m1", stage: "repair" }, () => true)).toBeNull();
  });

  it("resumes at the first question this run has not answered, ignoring older attempts", () => {
    const old = attempt("old", "q2", 1, 3, "2026-09-01T09:00:00.000Z");
    const first = attempt("a1", "q1", 0, 3, "2026-10-03T10:05:00.000Z");
    expect(missionResumePosition(session.questionIds, [], START)).toBe(0);
    expect(missionResumePosition(session.questionIds, [old, first], START)).toBe(1);
    expect(missionResumePosition(session.questionIds, [first, attempt("a2", "q2", 3, 3, "2026-10-03T10:09:00.000Z")], START)).toBe(2);
    expect(missionResumePosition(session.questionIds, ["q1", "q2", "q3"].map((q, i) => attempt(`d${i}`, q, 3, 3, "2026-10-03T10:30:00.000Z")), START)).toBe(3);
  });

  it("is wired to the mission runner and clears when the step ends", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/components/MissionSessionMode.tsx", "utf8");
    expect(src).toContain("saveRevisionCheckpoint(missionCheckpoint(");
    expect(src).toContain("restoreMissionSession(");
    expect(src).toMatch(/onFinished = useCallback\(\(\) => \{[\s\S]*?void clearRevisionCheckpoint\(\)/);
  });
});

describe("Today offers to continue a mission step saved mid-way", () => {
  const at = (minutes: number) => new Date(Date.parse(START) + minutes * 60_000).toISOString();
  const inRun = (id: string, q: string, minutes: number, missionId = "m1") => attempt(id, q, 1, 3, at(minutes), { mission: { ...ctx("repair"), missionId } });
  const saved = createRevisionCheckpoint("u1", missionCheckpoint(session, { stage: "repair" }, START, 1), START);

  it("appears only for a mission checkpoint with a question still unanswered in its own run", () => {
    expect(missionContinuation(saved, [inRun("a1", "q1", 5)])).toEqual({ missionId: "m1", stage: "repair", href: "/practice?mission=m1&stage=repair", position: 1, total: 3 });
    expect(missionContinuation(null, [])).toBeNull();
    expect(missionContinuation({ ...saved, mission: undefined }, [])).toBeNull();
    expect(missionContinuation({ ...saved, href: "/practice?mission=m2&stage=repair" }, [])).toBeNull();
    expect(missionContinuation({ ...saved, href: "/practice?mission=m1&stage=apply" }, [])).toBeNull();
    expect(missionContinuation(saved, ["q1", "q2", "q3"].map((q, i) => inRun(`d${i}`, q, 5 + i)))).toBeNull();
  });

  it("counts the position the runner resumes at, ignoring older answers and other missions", () => {
    const attempts = [attempt("old", "q1", 3, 3, at(-60), { mission: ctx("repair") }), inRun("other", "q1", 2, "m2"), inRun("a1", "q1", 5), inRun("a2", "q2", 8)];
    const run = missionRunAttempts(saved.mission!, attempts);
    expect(run.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(missionContinuation(saved, attempts)?.position).toBe(missionResumePosition(saved.mission!.questionIds, run, START));
    expect(missionContinuation(saved, attempts)?.position).toBe(2);
  });

  it("routes back into the saved step, same order and hint budget, not a re-planned or re-shuffled one", () => {
    const next = missionContinuation(JSON.parse(JSON.stringify(saved)), [inRun("a1", "q1", 5)])!;
    const route = new URLSearchParams(next.href.split("?")[1]);
    const rebuilt: MissionSession = { ...session, questionIds: ["q3", "q1", "q2"], hintBudgetFor: { q1: 0, q2: undefined, q3: undefined }, contextFor: {} };
    const restored = restoreMissionSession(rebuilt, saved.mission, { missionId: route.get("mission")!, stage: route.get("stage") }, () => true)!;
    expect(restored.questionIds).toEqual(["q1", "q2", "q3"]);
    expect(restored.hintBudgetFor).toEqual({ q1: undefined, q2: 0, q3: 0 });
    expect(restored.questionIds[next.position]).toBe("q2");
  });

  it("is wired into the Today resume card and the runner shares its attempt filter", async () => {
    const { readFileSync } = await import("node:fs");
    const card = readFileSync("src/components/ResumeRevisionCard.tsx", "utf8");
    expect(card).toContain("missionContinuation(checkpoint, store.attempts)");
    expect(card).toContain("Continue mission");
    expect(readFileSync("src/components/MissionSessionMode.tsx", "utf8")).toContain("missionRunAttempts(saved, store.attempts)");
  });
});
