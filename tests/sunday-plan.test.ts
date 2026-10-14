import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { clearAll, getDb } from "@/data/db";
import { defaultSettings, loadSundayPlan, saveSettings } from "@/data/repository";
import { buildSundayPlan, retainedSundayPlan, sundayActivityMessage, sundayWeekStart, type SundayPlanInput } from "@/domain/sunday-plan";
import type { Attempt, Card, ReviewLog } from "@/domain/types";

const NOW = new Date("2026-10-11T10:00:00Z");
const USER = "sunday-user";
const card = (patch: Partial<SundayPlanInput["cards"][number]> = {}): SundayPlanInput["cards"][number] => ({ id: "card", subjectId: "physics", topicId: "waves", due: "2026-10-10", reps: 2, state: 2, ...patch });
const attempt = (id: string, createdAt: string): SundayPlanInput["attempts"][number] => ({ id, subjectId: "physics", topicIds: ["waves"], createdAt });
const input = (patch: Partial<SundayPlanInput> = {}): SundayPlanInput => ({ now: NOW, timeZone: "Europe/London", subjectIds: ["physics"], attempts: [], reviewLogs: [], cards: [], examDates: [], ...patch });

beforeEach(async () => { await clearAll(); });

describe("Sunday local calendar weeks", () => {
  it("uses the local Sunday rather than UTC midnight, on both sides of Greenwich", () => {
    expect(sundayWeekStart(new Date("2026-10-10T23:30:00Z"), "Europe/London")).toBe("2026-10-11");
    expect(sundayWeekStart(new Date("2026-10-11T02:00:00Z"), "America/Los_Angeles")).toBe("2026-10-04");
    expect(sundayWeekStart(new Date("2026-10-11T07:00:00Z"), "America/Los_Angeles")).toBe("2026-10-11");
  });

  it("keeps date windows correct across DST and year boundaries", () => {
    const plan = buildSundayPlan(input({ now: new Date("2026-10-25T12:00:00Z") }));
    expect(plan.weekStart).toBe("2026-10-25");
    expect(plan.lastWeek.from).toBe("2026-10-18");
    expect(plan.lastWeek.through).toBe("2026-10-24");
    expect(plan.nextSunday).toBe("2026-11-01");
    expect(sundayWeekStart(new Date("2027-01-01T12:00:00Z"), "Europe/London")).toBe("2026-12-27");
  });

  it("retains exactly the first weekly snapshot until next Sunday, including clock rollback", () => {
    const plan = buildSundayPlan(input());
    expect(retainedSundayPlan(plan, new Date("2026-10-17T22:59:59Z"), "Europe/London")).toBe(plan);
    expect(retainedSundayPlan(plan, new Date("2026-10-17T23:00:00Z"), "Europe/London")).toBeNull();
    expect(retainedSundayPlan(plan, new Date("2026-10-10T12:00:00Z"), "Europe/London")).toBe(plan);
  });
});

describe("Sunday message evidence", () => {
  it("counts only actual last-week activity, compares to the previous week and deduplicates rows", () => {
    const last = attempt("last", "2026-10-10T22:59:00Z");
    const plan = buildSundayPlan(input({
      cards: [card()],
      attempts: [last, last, attempt("current-week", "2026-10-10T23:01:00Z"), attempt("previous", "2026-10-02T10:00:00Z"), attempt("future", "2026-11-01T10:00:00Z"), { ...attempt("other", "2026-10-07T10:00:00Z"), subjectId: "other" }, attempt("invalid", "invalid")],
      reviewLogs: [{ id: "review", topicId: "waves", reviewedAt: "2026-10-04T00:01:00Z" }, { id: "excluded", topicId: "other-topic", reviewedAt: "2026-10-06T10:00:00Z" }],
    }));
    expect(plan.lastWeek).toMatchObject({ attempts: 1, reviews: 1, topics: 1, previousAttempts: 1, previousReviews: 0 });
    expect(sundayActivityMessage(plan)).toContain("1 more recorded activity");
    expect(plan.latestActivityAt).toBe("2026-10-10T23:01:00Z");
    expect(plan.freshness).toBe("recent");
  });

  it("includes reviews of deleted cards when the topic remains enrolled", () => {
    const plan = buildSundayPlan(input({ subjectTopicIds: ["waves"], reviewLogs: [{ id: "review", topicId: "waves", reviewedAt: "2026-10-06T10:00:00Z" }] }));
    expect(plan.lastWeek.reviews).toBe(1);
  });

  it("excludes new, suspended, buried and unenrolled cards from due reviews", () => {
    const plan = buildSundayPlan(input({ cards: [card(), card({ id: "new", state: 0, reps: 0 }), card({ id: "suspended", suspended: true }), card({ id: "buried", buriedUntil: "2026-10-12" }), card({ id: "other", subjectId: "other" }), card({ id: "later", due: "2026-10-12" })] }));
    expect(plan.dueReviews).toBe(1);
    expect(plan.actions[0]?.href).toBe("/review");
  });

  it("uses the nearest valid upcoming saved exam only, including exam day", () => {
    const plan = buildSundayPlan(input({ examDates: [
      { subjectId: "physics", date: "2026-10-14", label: "Paper 2" },
      { subjectId: "physics", date: "2026-10-12", label: "Paper 1" },
      { subjectId: "physics", date: "2026-10-10", label: "Past" },
      { subjectId: "other", date: "2026-10-11", label: "Not enrolled" },
      { subjectId: "physics", date: "2027-02-30", label: "Invalid" },
    ] }));
    expect(plan.nearestExam).toEqual({ subjectId: "physics", date: "2026-10-12", label: "Paper 1", days: 1 });
    expect(plan.actions[0]?.href).toBe("/practice?subject=physics");
    expect(buildSundayPlan(input({ examDates: [{ subjectId: "physics", date: "2026-10-11", label: "Today" }] })).nearestExam?.days).toBe(0);
  });

  it("does not guess a date or improvement when no data or exam exists", () => {
    const plan = buildSundayPlan(input());
    expect(plan.nearestExam).toBeNull();
    expect(plan.freshness).toBe("no-data");
    expect(plan.latestActivityAt).toBeNull();
    expect(plan.lastWeek.attempts + plan.lastWeek.reviews).toBe(0);
    expect(sundayActivityMessage(plan)).toContain("No practice answers or card reviews were recorded");
    expect(plan.actions.map((action) => action.href)).toEqual(["/settings", "/diagnostic"]);
  });

  it("flags old activity and reports quieter practice without guilt or fabricated gains", () => {
    const plan = buildSundayPlan(input({ attempts: [attempt("old", "2026-09-01T10:00:00Z")] }));
    expect(plan.freshness).toBe("old");
    expect(plan.lastWeek.attempts).toBe(0);
    const quieter = buildSundayPlan(input({ attempts: [attempt("last", "2026-10-05T10:00:00Z"), attempt("p1", "2026-09-28T10:00:00Z"), attempt("p2", "2026-09-29T10:00:00Z")] }));
    expect(sundayActivityMessage(quieter)).toContain("1 fewer recorded activity");
    expect(sundayActivityMessage(quieter)).not.toMatch(/marks|proven|streak|points/);
  });
});

describe("IndexedDB consent and immutable weekly capture", () => {
  async function settings(enabled = false) {
    const db = await getDb();
    await db.put("settings", { ...defaultSettings(USER), subjectIds: ["physics"], sundayPlanEnabled: enabled });
    return db;
  }

  it("defaults recurring delivery off and previews without changing consent or saving", async () => {
    expect(defaultSettings(USER).sundayPlanEnabled).toBe(false);
    const db = await settings();
    expect(await loadSundayPlan(USER, NOW, "Europe/London")).toBeNull();
    expect(await loadSundayPlan(USER, NOW, "Europe/London", true)).toMatchObject({ weekStart: "2026-10-11", freshness: "no-data" });
    expect(await db.get("settings", USER)).toMatchObject({ sundayPlanEnabled: false });
    expect((await db.get("settings", USER) as { sundayPlanSnapshot?: unknown }).sundayPlanSnapshot).toBeUndefined();
    expect(await db.count("outbox")).toBe(0);
  });

  it("captures complete persisted activity, isolates users, and freezes later activity and exam edits", async () => {
    const db = await settings(true);
    await db.put("cards", { ...card(), userId: USER } as Card);
    // More than the store's 500-row boot window, proving this path does not use it.
    const write = db.transaction("attempts", "readwrite");
    await Promise.all(Array.from({ length: 510 }, (_, index) => write.store.put({ ...attempt(`attempt-${index}`, "2026-10-06T10:00:00Z"), userId: USER } as Attempt)));
    await write.store.put({ ...attempt("other-user", "2026-10-06T10:00:00Z"), userId: "someone-else" } as Attempt);
    await write.done;
    const first = await loadSundayPlan(USER, NOW, "Europe/London");
    expect(first?.lastWeek.attempts).toBe(510);
    await db.put("reviewLogs", { id: "late-sync", userId: USER, cardId: "card", topicId: "waves", reviewedAt: "2026-10-06T12:00:00Z" } as ReviewLog);
    await db.put("examDates", { id: "new-exam", userId: USER, subjectId: "physics", date: "2026-10-20", label: "Actual exam" });
    expect(await loadSundayPlan(USER, new Date("2026-10-14T10:00:00Z"), "Europe/London")).toEqual(first);
    const preview = await loadSundayPlan(USER, NOW, "Europe/London", true);
    expect(preview?.lastWeek.reviews).toBe(1);
    expect(preview?.nearestExam?.date).toBe("2026-10-20");
    expect((await db.get("settings", USER) as { sundayPlanSnapshot?: unknown }).sundayPlanSnapshot).toEqual(first);
    const next = await loadSundayPlan(USER, new Date("2026-10-18T10:00:00Z"), "Europe/London");
    expect(next?.weekStart).toBe("2026-10-18");
    expect(next?.capturedAt).not.toBe(first?.capturedAt);
  });

  it("retains the first snapshot across concurrent tabs, unrelated settings saves and revocation", async () => {
    const db = await settings(true);
    const stale = await db.get("settings", USER);
    const [first, concurrent] = await Promise.all([
      loadSundayPlan(USER, NOW, "Europe/London"),
      loadSundayPlan(USER, new Date("2026-10-11T11:00:00Z"), "Europe/London"),
    ]);
    expect(concurrent).toEqual(first);
    await saveSettings({ ...stale!, displayName: "Updated", sundayPlanEnabled: false });
    expect((await db.get("settings", USER) as { sundayPlanSnapshot?: unknown }).sundayPlanSnapshot).toEqual(first);
    expect(await loadSundayPlan(USER, new Date("2026-10-18T10:00:00Z"), "Europe/London")).toBeNull();
  });
});

it("keeps persisted settings types independent of behavior and marking dependencies", () => {
  const settingsTypes = readFileSync("src/domain/types-planning.ts", "utf8");
  expect(settingsTypes).toContain('import type { SundayPlanSnapshot } from "./types-sunday-plan"');
  expect(settingsTypes).toContain('import type { TechniqueDrillSubmission } from "./types-technique-drills"');
  expect(settingsTypes).not.toMatch(/from ["']\.\/(sunday-plan|technique-drills)["']/);
  for (const path of ["src/domain/types-sunday-plan.ts", "src/domain/types-technique-drills.ts"]) {
    expect(readFileSync(path, "utf8")).not.toMatch(/^import\s/m);
  }
});

it("keeps the secondary plan in Today with honest delivery/freshness language and no AppShell edit", () => {
  const source = readFileSync("src/components/SundayPlan.tsx", "utf8");
  expect(source).toContain("not email or push");
  expect(source).toContain("Preview without turning on");
  expect(source).toContain("not proof of better marks");
  expect(source).toContain("Frozen until");
  expect(source).toContain("new activity, exam edits and later sync do not rewrite it");
  expect(readFileSync("src/app/page.tsx", "utf8")).toContain("<SundayPlan />");
  expect(readFileSync("src/components/AppShell.tsx", "utf8")).not.toContain("SundayPlan");
  expect(source).not.toMatch(/Notification\.requestPermission|fetch\(/);
});
