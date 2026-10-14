import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearAll, getDb } from "@/data/db";
import { defaultSettings, saveSettings } from "@/data/repository";
import { techniqueDrillHistory, techniqueSubmissionPatch } from "@/domain/technique-drills";

beforeEach(async () => { await clearAll(); });

describe("technique submission IndexedDB persistence", () => {
  it("persists real submission metadata in the existing settings row without making assessment attempts", async () => {
    const before = defaultSettings("learner-a");
    const patch = techniqueSubmissionPatch(before, { id: "submitted-once", drillId: "explain", submittedAt: "2026-10-14T12:00:00Z", detectedChecks: ["response", "reason"] });
    await saveSettings({ ...before, ...patch });
    const db = await getDb();
    const restored = await db.get("settings", "learner-a");
    expect(techniqueDrillHistory(restored!)).toEqual(patch.techniqueDrillHistory);
    expect(restored?.subjectIds).toEqual(before.subjectIds);
    expect(await db.getAll("attempts")).toEqual([]);
    expect(await db.getAll("cards")).toEqual([]);
    expect(JSON.stringify(restored?.techniqueDrillHistory)).not.toContain("answer");
    expect(JSON.stringify(restored?.techniqueDrillHistory)).not.toContain("awarded");
  });

  it("keeps separate profiles' submission histories separate", async () => {
    const a = defaultSettings("learner-a");
    const b = defaultSettings("learner-b");
    await saveSettings({ ...a, ...techniqueSubmissionPatch(a, { id: "a", drillId: "describe", submittedAt: "2026-10-14T12:00:00Z", detectedChecks: ["response"] }) });
    await saveSettings(b);
    const db = await getDb();
    expect(techniqueDrillHistory((await db.get("settings", "learner-a"))!)).toHaveLength(1);
    expect(techniqueDrillHistory((await db.get("settings", "learner-b"))!)).toEqual([]);
  });
});
