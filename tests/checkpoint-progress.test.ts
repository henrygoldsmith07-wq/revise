import { describe, expect, it } from "vitest";
import { CHECKPOINT_LEAD_HOURS, checkpointHasProgress, checkpointLeadsToday, checkpointReviewedCount, createRevisionCheckpoint, type RevisionCheckpointInput } from "@/domain/revision-checkpoint";

// Every revision page saves a resume point as soon as its first question is on
// screen. Opening a repair-plan step and going straight back left Today
// offering "Resume interrupted revision" (in place of its recommendation) for
// a run with nothing in it (twenty-fifth pass audit, 360px production build).
// Today now offers it only once the run holds progress.

const USER = "u1";
const T0 = "2026-10-16T10:00:00.000Z";
const T1 = "2026-10-16T10:05:00.000Z";
const T2 = "2026-10-16T10:09:00.000Z";
const practice: RevisionCheckpointInput = {
  activity: "practice", title: "Exam questions", href: "/practice?topic=motion&unaided=1&minutes=10&resume=1", position: 0, total: 2, queueIds: ["q1", "q2"],
};
const none = { attempts: [], reviewLogs: [] };
const answered = (questionId: string, createdAt: string, topicIds = ["motion"]) => ({ questionId, topicIds, createdAt });

describe("checkpointHasProgress", () => {
  it("a run opened and left before any answer is not offered", () => {
    expect(checkpointHasProgress(createRevisionCheckpoint(USER, practice, T0), none)).toBe(false);
  });

  it("an answer on the run's question since it began is progress, even before moving on", () => {
    const cp = createRevisionCheckpoint(USER, practice, T0);
    expect(checkpointHasProgress(cp, { attempts: [answered("q1", T1)], reviewLogs: [] })).toBe(true);
  });

  it("an answer from before the run began, or on another question, is not", () => {
    const cp = createRevisionCheckpoint(USER, practice, T1);
    expect(checkpointHasProgress(cp, { attempts: [answered("q1", T0), answered("q9", T2)], reviewLogs: [] })).toBe(false);
  });

  it("moving past the first item is progress", () => {
    expect(checkpointHasProgress(createRevisionCheckpoint(USER, { ...practice, position: 1 }, T0), none)).toBe(true);
  });

  it("saving the same run again keeps its start, so a later re-save cannot hide an earlier answer", () => {
    const first = createRevisionCheckpoint(USER, practice, T0);
    const again = createRevisionCheckpoint(USER, practice, T2, first);
    expect(again.startedAt).toBe(T0);
    expect(checkpointHasProgress(again, { attempts: [answered("q1", T1)], reviewLogs: [] })).toBe(true);
    // A different run (another route) starts afresh.
    const other = createRevisionCheckpoint(USER, { ...practice, href: "/practice?topic=waves&resume=1", queueIds: ["w1"] }, T2, first);
    expect(other.startedAt).toBe(T2);
  });

  it("mission and proof-check runs use their own start and question set", () => {
    const cp = createRevisionCheckpoint(USER, {
      ...practice, href: "/practice?mission=m1&resume=1", queueIds: ["q1", "q2"],
      mission: { missionId: "m1", stage: "practise", startedAt: T1, questionIds: ["q1", "q2"], hintBudgetFor: {}, contextFor: {} },
    }, T2);
    expect(checkpointHasProgress(cp, { attempts: [answered("q2", T0)], reviewLogs: [] })).toBe(false);
    expect(checkpointHasProgress(cp, { attempts: [answered("q2", T1)], reviewLogs: [] })).toBe(true);
  });

  it("review runs count a card reviewed since the run began; adaptive runs count work on their topic", () => {
    const review = createRevisionCheckpoint(USER, { activity: "review", title: "Spaced repetition", href: "/review?resume=1", position: 0, total: 3, queueIds: ["c1", "c2", "c3"] }, T0);
    expect(checkpointHasProgress(review, none)).toBe(false);
    expect(checkpointHasProgress(review, { attempts: [], reviewLogs: [{ cardId: "c1", topicId: "motion", reviewedAt: T1 }] })).toBe(true);
    const adaptive = createRevisionCheckpoint(USER, { activity: "adaptive", title: "Physics — Motion", href: "/adaptive-session?topic=motion&resume=1", topicId: "motion", position: 0, total: 3, queueIds: ["step-1", "step-2", "step-3"] }, T0);
    expect(checkpointHasProgress(adaptive, none)).toBe(false);
    expect(checkpointHasProgress(adaptive, { attempts: [answered("q7", T1, ["motion"])], reviewLogs: [] })).toBe(true);
    expect(checkpointHasProgress(adaptive, { attempts: [answered("q7", T1, ["waves"])], reviewLogs: [] })).toBe(false);
  });

  it("a checkpoint saved before startedAt existed falls back to its last save", () => {
    const { startedAt: _drop, ...legacy } = createRevisionCheckpoint(USER, practice, T1);
    void _drop;
    expect(checkpointHasProgress(legacy, { attempts: [answered("q1", T0)], reviewLogs: [] })).toBe(false);
    expect(checkpointHasProgress(legacy, { attempts: [answered("q1", T2)], reviewLogs: [] })).toBe(true);
  });
});

describe("checkpointLeadsToday", () => {
  const left = { updatedAt: "2026-11-12T18:30:00.000Z" };
  const at = (iso: string) => new Date(iso);

  it("leads on the day the run was left", () => {
    expect(checkpointLeadsToday(left, at("2026-11-12T18:31:00.000Z"), "Europe/London")).toBe(true);
    expect(checkpointLeadsToday(left, at("2026-11-12T23:50:00.000Z"), "Europe/London")).toBe(true);
  });

  it("steps aside from the next day on, so the day's recommendation leads", () => {
    expect(checkpointLeadsToday(left, at("2026-11-13T08:00:00.000Z"), "Europe/London")).toBe(false);
    expect(checkpointLeadsToday(left, at("2026-11-17T18:30:00.000Z"), "Europe/London")).toBe(false);
  });

  it("still leads just after midnight, within a few hours of being left", () => {
    const late = { updatedAt: "2026-11-12T23:30:00.000Z" };
    expect(CHECKPOINT_LEAD_HOURS).toBe(4);
    expect(checkpointLeadsToday(late, at("2026-11-13T00:10:00.000Z"), "Europe/London")).toBe(true);
    expect(checkpointLeadsToday(late, at("2026-11-13T03:29:00.000Z"), "Europe/London")).toBe(true);
    expect(checkpointLeadsToday(late, at("2026-11-13T03:31:00.000Z"), "Europe/London")).toBe(false);
  });

  it("uses the local day, not the UTC one, and never leads on an unreadable time", () => {
    // 23:30 UTC on the 12th is already the 13th in Auckland: at 09:00 Auckland time that day it is the same local day.
    expect(checkpointLeadsToday({ updatedAt: "2026-11-12T11:30:00.000Z" }, at("2026-11-12T20:00:00.000Z"), "Pacific/Auckland")).toBe(true);
    expect(checkpointLeadsToday({ updatedAt: "2026-11-12T09:00:00.000Z" }, at("2026-11-12T20:00:00.000Z"), "Pacific/Auckland")).toBe(false);
    expect(checkpointLeadsToday({ updatedAt: "not a date" }, at("2026-11-12T20:00:00.000Z"))).toBe(false);
  });
});

describe("checkpointReviewedCount", () => {
  const run = { position: 0, queueIds: ["c1", "c2", "c3"], startedAt: "2026-11-12T18:00:00.000Z", updatedAt: "2026-11-12T18:00:00.000Z" };
  const log = (cardId: string, reviewedAt: string) => ({ cardId, reviewedAt });

  it("counts a card reviewed in this run even when the saved position trails it", () => {
    expect(checkpointReviewedCount(run, [log("c1", "2026-11-12T18:01:00.000Z")])).toBe(1);
  });

  it("ignores reviews before the run, cards outside it, and a card graded twice", () => {
    expect(checkpointReviewedCount(run, [
      log("c1", "2026-11-12T17:00:00.000Z"),
      log("c9", "2026-11-12T18:01:00.000Z"),
      log("c2", "2026-11-12T18:02:00.000Z"),
      log("c2", "2026-11-12T18:03:00.000Z"),
    ])).toBe(1);
  });

  it("never reports fewer than the saved position", () => {
    expect(checkpointReviewedCount({ ...run, position: 2 }, [])).toBe(2);
  });
});
