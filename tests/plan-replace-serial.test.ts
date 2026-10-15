import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { clearAll, getDb } from "@/data/db";
import { replacePlan } from "@/data/repository";
import type { PlannedSession } from "@/domain/types";

const USER = "11111111-1111-4111-8111-111111111111";
const session = (id: string, startMinute: number, subjectId: string): PlannedSession => ({
  id, userId: USER, date: "2026-10-15", startMinute, minutes: 25, subjectId,
  activity: "learn", reason: "First pass.", status: "pending",
});

beforeEach(async () => { await clearAll(); });

describe("replacing the plan", () => {
  it("two overlapping rebuilds leave one plan, not both (fresh-profile duplicate blocks)", async () => {
    // Onboarding fires the dynamic replan (exam dates changed) and its own
    // rebuild together. Before the twenty-third pass both read "existing"
    // first, so neither removed the other's rows: two blocks at 16:00.
    const first = [session("a-1", 960, "maths"), session("a-2", 990, "biology")];
    const second = [session("b-1", 960, "maths"), session("b-2", 990, "physics")];
    await Promise.all([replacePlan(USER, first), replacePlan(USER, second)]);
    const rows = ((await (await getDb()).getAll("plannedSessions")) as PlannedSession[]).filter((row) => row.userId === USER);
    expect(rows.map((row) => row.id).sort()).toEqual(["b-1", "b-2"]);
    const slots = rows.map((row) => `${row.date}@${row.startMinute}`);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it("a failed replacement does not block the next one", async () => {
    await expect(replacePlan(USER, [{ ...session("bad", 960, "maths"), id: undefined as unknown as string }])).rejects.toBeDefined();
    await replacePlan(USER, [session("ok", 960, "maths")]);
    const rows = ((await (await getDb()).getAll("plannedSessions")) as PlannedSession[]).filter((row) => row.userId === USER);
    expect(rows.map((row) => row.id)).toEqual(["ok"]);
  });

  it("regeneratePlan reads the latest snapshot, not the one its caller captured", () => {
    const src = readFileSync("src/state/planning.ts", "utf8");
    expect(src).toContain("const snapshot = latestSnapshot.current ?? input.snapshot;");
  });
});
