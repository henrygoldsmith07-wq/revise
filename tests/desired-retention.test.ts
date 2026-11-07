import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DESIRED_RETENTION,
  desiredRetention,
  intervalScale,
  retentionEffect,
} from "@/domain/desired-retention";
import { createCard, gradeCard, previewIntervals } from "@/domain/scheduling";
import { mergeCard, syncCardState } from "@/domain/sync-crdt";
import type { Card, RecallGrade } from "@/domain/types";

const START = new Date("2026-01-05T09:00:00.000Z");
const DAY = 86_400_000;

function fresh(): Card {
  return createCard({ id: "c1", userId: "u", subjectId: "s", topicId: "s.t", front: "Q", back: "A" }, START);
}

/** Grade on fixed days so every run sees the same elapsed times, whatever the target. */
function history(retention: number | undefined, days = [0, 3, 10, 30], grades: RecallGrade[] = ["good", "good", "good", "good"]): Card {
  let card = fresh();
  days.forEach((day, index) => {
    card = gradeCard(card, grades[index]!, new Date(START.getTime() + day * DAY), { deviceId: "a", lamport: index + 1 }, retention);
  });
  return card;
}

const daysUntilDue = (card: Card) => (Date.parse(`${card.due}T00:00:00Z`) - Date.parse(card.lastReviewedAt!)) / DAY;

describe("the desired retention setting", () => {
  it("reads a stored value, and falls back to 90% for anything missing or out of range", () => {
    expect(desiredRetention(undefined)).toBe(0.9);
    expect(desiredRetention(0.85)).toBe(0.85);
    expect(desiredRetention(0.8512)).toBe(0.85);
    for (const odd of [0.5, 0.99, 1, Number.NaN, Infinity, -1]) expect(desiredRetention(odd)).toBe(DEFAULT_DESIRED_RETENTION);
  });

  it("says what a target does to the gaps between reviews", () => {
    expect(intervalScale(0.9)).toBeCloseTo(1, 10);
    expect(intervalScale(0.8)).toBeGreaterThan(3);
    expect(intervalScale(0.95)).toBeLessThan(0.5);
    expect(retentionEffect(0.9)).toMatch(/standard/);
    expect(retentionEffect(0.8)).toMatch(/3\.3× longer.*fewer reviews/);
    expect(retentionEffect(0.95)).toMatch(/2\.5× shorter.*more reviews/);
  });
});

describe("grading at a desired retention", () => {
  it("schedules further out at a lower target and sooner at a higher one", () => {
    const low = history(0.8);
    const standard = history(undefined);
    const high = history(0.95);
    expect(daysUntilDue(low)).toBeGreaterThan(daysUntilDue(standard) * 2);
    expect(daysUntilDue(high)).toBeLessThan(daysUntilDue(standard));
  });

  it("leaves stability and difficulty alone: the target moves only the interval", () => {
    const low = history(0.8);
    const high = history(0.95);
    expect(low.stability).toBeCloseTo(high.stability, 10);
    expect(low.difficulty).toBeCloseTo(high.difficulty, 10);
  });

  it("previews the intervals the buttons will set", () => {
    const card = history(undefined, [0, 3], ["good", "good"]);
    const now = new Date(Date.parse(`${card.due}T09:00:00Z`));
    expect(previewIntervals(card, now, 0.8).good).toBeGreaterThan(previewIntervals(card, now).good * 2);
    expect(previewIntervals(card, now, 0.95).good).toBeLessThan(previewIntervals(card, now).good);
  });

  it("records the target on each grade, and leaves the default unrecorded so old logs keep their shape", () => {
    expect(history(0.8).log?.every((event) => event.retention === 0.8)).toBe(true);
    expect(history(undefined).log?.some((event) => "retention" in event)).toBe(false);
  });
});

describe("sync replay honours the target each grade used", () => {
  it("rebuilds the lower target's long interval instead of falling back to 90%", () => {
    const low = history(0.8);
    const replayed = syncCardState(low).card;
    const asIfDefault = syncCardState({ ...low, log: low.log!.map(({ retention: _retention, ...event }) => event) }).card;
    expect(replayed.stability).toBeCloseTo(asIfDefault.stability, 10);
    expect(daysUntilDue(replayed)).toBeGreaterThan(daysUntilDue(asIfDefault) * 2);
  });

  it("takes the last grade's target when devices used different ones, and both replicas agree", () => {
    const first = gradeCard(fresh(), "good", START, { deviceId: "a", lamport: 1 }, 0.8);
    const onA = gradeCard(first, "good", new Date(START.getTime() + 5 * DAY), { deviceId: "a", lamport: 2 }, 0.8);
    const onB = gradeCard(first, "good", new Date(START.getTime() + 6 * DAY), { deviceId: "b", lamport: 3 }, 0.95);
    const ab = mergeCard(onA, onB);
    const ba = mergeCard(onB, onA);
    expect(ab.due).toBe(ba.due);
    expect(ab.stability).toBe(ba.stability);
    expect(ab.log?.at(-1)?.retention).toBe(0.95);
  });
});

describe("wiring", () => {
  it("Settings offers the target and the store grades and validates with it", () => {
    const settings = readFileSync("src/app/settings/page.tsx", "utf8");
    expect(settings).toContain('label="Desired retention"');
    expect(settings).toContain("updateSettings({ desiredRetention: value })");
    const store = readFileSync("src/state/store.tsx", "utf8");
    expect(store).toContain("saveCardReview(card, userId, grade, elapsedMs, confidence, new Date(), retentionTarget)");
    expect(store).toContain("predictedRetention: retentionTarget");
    for (const file of ["src/app/review/page.tsx", "src/components/AdaptiveRetrievalBlock.tsx"]) {
      expect(readFileSync(file, "utf8")).toContain("desiredRetention(store.settings.desiredRetention)");
    }
  });
});
