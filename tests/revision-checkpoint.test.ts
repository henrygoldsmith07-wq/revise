import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearAll } from "@/data/db";
import {
  clearRevisionCheckpoint,
  loadRevisionCheckpoint,
  saveRevisionCheckpoint,
} from "@/data/repository";
import {
  createRevisionCheckpoint,
  isRevisionCheckpoint,
} from "@/domain/revision-checkpoint";

const USER = "checkpoint-user";

beforeEach(async () => {
  await clearAll();
});

describe("revision checkpoints", () => {
  it("normalises progress and queue ids into a durable checkpoint", () => {
    const checkpoint = createRevisionCheckpoint(USER, {
      activity: "practice",
      title: "Exam questions",
      href: "/practice?resume=1",
      position: 4.8,
      total: 4,
      queueIds: ["q1", "q1", "q2"],
    }, "2026-08-18T09:00:00.000Z");

    expect(checkpoint.position).toBe(3);
    expect(checkpoint.total).toBe(4);
    expect(checkpoint.queueIds).toEqual(["q1", "q2"]);
    expect(isRevisionCheckpoint(checkpoint)).toBe(true);
  });

  it("rejects external resume destinations", () => {
    expect(isRevisionCheckpoint({
      version: 1,
      userId: USER,
      activity: "practice",
      title: "Questions",
      href: "https://example.com",
      position: 0,
      total: 1,
      updatedAt: "2026-08-18T09:00:00.000Z",
    })).toBe(false);
  });

  it("round-trips per-user checkpoints and clears only the owning user", async () => {
    const checkpoint = createRevisionCheckpoint(USER, {
      activity: "paper",
      title: "Summer paper",
      href: "/papers?resume=1",
      position: 2,
      total: 8,
      paperId: "paper-1",
      paperRunId: "run-1",
    });
    const other = createRevisionCheckpoint("another-user", {
      activity: "review",
      title: "Recall",
      href: "/review?resume=1",
      position: 1,
      total: 4,
      queueIds: ["c1"],
    });

    await saveRevisionCheckpoint(checkpoint);
    await saveRevisionCheckpoint(other);
    expect(await loadRevisionCheckpoint(USER)).toEqual(checkpoint);
    expect(await loadRevisionCheckpoint("another-user")).toEqual(other);

    await clearRevisionCheckpoint("another-user");
    expect(await loadRevisionCheckpoint(USER)).toEqual(checkpoint);
    await clearRevisionCheckpoint(USER);
    expect(await loadRevisionCheckpoint(USER)).toBeUndefined();
  });
});
