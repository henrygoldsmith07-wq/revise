import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

/**
 * A minimal exclusive Web Locks stand-in shared by two module instances,
 * which is what two tabs on one origin are: separate JS heaps (so separate
 * in-tab queues) over one IndexedDB.
 */
function sharedLocks() {
  let tail: Promise<unknown> = Promise.resolve();
  const names: string[] = [];
  return {
    names,
    request<T>(name: string, callback: () => Promise<T>): Promise<T> {
      names.push(name);
      const run = tail.then(() => callback());
      tail = run.catch(() => undefined);
      return run;
    },
  };
}

describe("replacing the plan from two tabs", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    vi.resetModules();
  });

  async function twoTabs() {
    vi.resetModules();
    const tabA = await import("@/data/repository");
    vi.resetModules();
    const tabB = await import("@/data/repository");
    expect(tabA.replacePlan).not.toBe(tabB.replacePlan);
    return { tabA, tabB };
  }

  it("leaves one plan when both tabs replan at once", async () => {
    const locks = sharedLocks();
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks } });
    const { tabA, tabB } = await twoTabs();
    await Promise.all([
      tabA.replacePlan(USER, [session("a-1", 960, "maths"), session("a-2", 990, "biology")]),
      tabB.replacePlan(USER, [session("b-1", 960, "maths"), session("b-2", 990, "physics")]),
    ]);
    const rows = ((await (await getDb()).getAll("plannedSessions")) as PlannedSession[]).filter((row) => row.userId === USER);
    expect(rows.map((row) => row.id).sort()).toEqual(["b-1", "b-2"]);
    expect(locks.names).toEqual([tabA.PLAN_REPLACE_LOCK, tabB.PLAN_REPLACE_LOCK]);
  });

  it("without Web Locks each tab still replaces its own plans in order", async () => {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
    const { tabA } = await twoTabs();
    await Promise.all([
      tabA.replacePlan(USER, [session("a-1", 960, "maths")]),
      tabA.replacePlan(USER, [session("c-1", 960, "maths")]),
    ]);
    const rows = ((await (await getDb()).getAll("plannedSessions")) as PlannedSession[]).filter((row) => row.userId === USER);
    expect(rows.map((row) => row.id)).toEqual(["c-1"]);
  });
});
