import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearAll } from "@/data/db";
import { loadSnapshot, saveCard } from "@/data/repository";
import { buildPortabilitySnapshot, parsePortabilitySnapshot } from "@/domain/portability";
import { restorePortableSnapshot, validatePortableRestore } from "@/data/portable-restore";
import type { Attempt, Card, ReviewLog } from "@/domain/types";

const SOURCE = "source-user";
const TARGET = "target-user";
const AT = "2026-09-01T10:00:00.000Z";

beforeEach(async () => {
  await clearAll();
});

function manualCard(userId: string, id = "manual-card"): Card {
  return {
    id,
    userId,
    subjectId: "wjec-alevel-physics",
    topicId: "wjec-alevel-physics.capacitance",
    kind: "basic",
    front: "What is capacitance?",
    back: "Charge stored per unit potential difference.",
    tags: ["restore-test"],
    origin: "manual",
    due: "2026-09-02",
    stability: 4,
    difficulty: 5,
    reps: 2,
    lapses: 0,
    state: 2,
    lastReviewedAt: AT,
    createdAt: AT,
    updatedAt: AT,
  };
}

function review(userId: string, cardId = "manual-card"): ReviewLog {
  return {
    id: "review-1",
    userId,
    cardId,
    topicId: "wjec-alevel-physics.capacitance",
    grade: "good",
    elapsedMs: 10_000,
    reviewedAt: AT,
  };
}

describe("portable profile restore", () => {
  it("preserves card ids and review linkage while remapping the profile owner", async () => {
    const card = manualCard(SOURCE);
    const snap = buildPortabilitySnapshot({
      userId: SOURCE,
      cards: [card],
      attempts: [],
      reviewLogs: [review(SOURCE)],
      mistakes: [],
      plannedSessions: [],
      examDates: [],
      settings: null,
      streak: null,
      now: new Date(AT),
    });

    const validation = await validatePortableRestore(snap, TARGET);
    expect(validation.ok).toBe(true);

    await restorePortableSnapshot(snap, TARGET);
    const restored = await loadSnapshot(TARGET);

    expect(restored.cards.some((row) => row.id === card.id && row.userId === TARGET)).toBe(true);
    expect(restored.reviewLogs).toContainEqual(
      expect.objectContaining({ id: "review-1", cardId: card.id, userId: TARGET }),
    );
  });

  it("rejects a legacy v1 snapshot for full restore", async () => {
    const v2 = buildPortabilitySnapshot({
      userId: SOURCE,
      cards: [manualCard(SOURCE)],
      attempts: [],
      reviewLogs: [],
      mistakes: [],
      plannedSessions: [],
      examDates: [],
      settings: null,
      streak: null,
    });
    const legacy = { ...v2, formatVersion: 1 as const, cardRecords: undefined };
    const validation = await validatePortableRestore(legacy, TARGET);
    expect(validation.ok).toBe(false);
    expect(validation.issues[0]?.reason).toContain("stable card ids");
  });

  it("rejects dangling review-log card references before mutating the target profile", async () => {
    const original = manualCard(TARGET, "existing-card");
    await saveCard(original);

    const snap = buildPortabilitySnapshot({
      userId: SOURCE,
      cards: [manualCard(SOURCE)],
      attempts: [],
      reviewLogs: [review(SOURCE, "missing-card")],
      mistakes: [],
      plannedSessions: [],
      examDates: [],
      settings: null,
      streak: null,
    });

    await expect(restorePortableSnapshot(snap, TARGET)).rejects.toThrow(/references a card/);
    const after = await loadSnapshot(TARGET);
    expect(after.cards.some((row) => row.id === "existing-card")).toBe(true);
  });

  it("rejects mixed-owner rows before any restore mutation", async () => {
    const original = manualCard(TARGET, "existing-card");
    await saveCard(original);

    const snap = buildPortabilitySnapshot({
      userId: SOURCE,
      cards: [{ ...manualCard(SOURCE), userId: "unexpected-owner" }],
      attempts: [],
      reviewLogs: [],
      mistakes: [],
      plannedSessions: [],
      examDates: [],
      settings: null,
      streak: null,
    });

    const validation = await validatePortableRestore(snap, TARGET);
    expect(validation.ok).toBe(false);
    expect(validation.issues).toContainEqual(
      expect.objectContaining({ store: "cards", field: "userId" }),
    );

    await expect(restorePortableSnapshot(snap, TARGET)).rejects.toThrow(/snapshot owner/);
    const after = await loadSnapshot(TARGET);
    expect(after.cards.some((row) => row.id === "existing-card")).toBe(true);
  });

  it("rejects grade history belonging to a different snapshot owner", async () => {
    const snap = buildPortabilitySnapshot({
      userId: SOURCE,
      cards: [manualCard(SOURCE)],
      attempts: [],
      reviewLogs: [],
      mistakes: [],
      plannedSessions: [],
      examDates: [],
      settings: null,
      streak: null,
      gradePredictions: [{
        id: "prediction-foreign",
        anonId: "unexpected-owner",
        subjectId: "wjec-alevel-physics",
        predictedPercent: 70,
        lowerPercent: 60,
        upperPercent: 80,
        gradeLabel: "B",
        confidence: 0.7,
        evidenceShare: 0.5,
        createdAt: AT,
      }],
    });

    const validation = await validatePortableRestore(snap, TARGET);
    expect(validation.ok).toBe(false);
    expect(validation.issues).toContainEqual(
      expect.objectContaining({ store: "meta", field: "anonId" }),
    );
  });

  it("fails malformed outcome history through validation instead of crashing", async () => {
    const snap = buildPortabilitySnapshot({
      userId: SOURCE,
      cards: [manualCard(SOURCE)],
      attempts: [],
      reviewLogs: [],
      mistakes: [],
      plannedSessions: [],
      examDates: [],
      settings: null,
      streak: null,
    });
    snap.gradePredictions = [null as never];
    snap.gradePredictionsCount = 1;

    await expect(validatePortableRestore(snap, TARGET)).resolves.toMatchObject({ ok: false });
    await expect(restorePortableSnapshot(snap, TARGET)).rejects.toThrow(/snapshot owner/);
  });

  it("rejects attempts whose question no longer exists instead of reviving stale seed content", async () => {
    const attempt: Attempt = {
      id: "attempt-1",
      userId: SOURCE,
      questionId: "missing-question",
      subjectId: "wjec-alevel-physics",
      topicIds: ["wjec-alevel-physics.capacitance"],
      answers: {},
      marked: [],
      awarded: 0,
      max: 1,
      feedback: "",
      markedBy: "rubric",
      elapsedMs: 1_000,
      mode: "practice",
      createdAt: AT,
    };
    const snap = buildPortabilitySnapshot({
      userId: SOURCE,
      cards: [manualCard(SOURCE)],
      attempts: [attempt],
      reviewLogs: [],
      mistakes: [],
      plannedSessions: [],
      examDates: [],
      settings: null,
      streak: null,
    });

    const validation = await validatePortableRestore(snap, TARGET);
    expect(validation.ok).toBe(false);
    expect(validation.issues.some((issue) => issue.field === "questionId")).toBe(true);
  });

  it("parses a v2 archive without a legacy restore warning", () => {
    const snap = buildPortabilitySnapshot({
      userId: SOURCE,
      cards: [manualCard(SOURCE)],
      attempts: [],
      reviewLogs: [],
      mistakes: [],
      plannedSessions: [],
      examDates: [],
      settings: null,
      streak: null,
    });
    const parsed = parsePortabilitySnapshot(JSON.stringify(snap));
    expect(parsed.snapshot?.formatVersion).toBe(2);
    expect(parsed.warnings.join(" ")).not.toContain("full study-history restore is unavailable");
  });
});
