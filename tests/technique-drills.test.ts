import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { checkTechniqueDrill, TECHNIQUE_CONTEXT, TECHNIQUE_DRILLS, techniqueDrillHistory, techniqueSubmissionPatch, type TechniqueDrillSubmission } from "@/domain/technique-drills";
import type { UserSettings } from "@/domain/types";

const settings = (history?: unknown): UserSettings => ({
  userId: "learner", displayName: "Student", subjectIds: [], availability: [], sessionLengthMinutes: 20,
  targetGrades: {}, theme: "system", accessibility: { largeText: false, dyslexiaFont: false, highContrast: false, reduceMotion: false },
  aiEnabled: false, pulseEnabled: false, labMode: false, updatedAt: "2026-10-14T12:00:00Z", techniqueDrillHistory: history,
} as UserSettings);
const submission = (id: string): TechniqueDrillSubmission => ({ id, drillId: "describe", submittedAt: "2026-10-14T12:00:00Z", detectedChecks: ["response", "data"] });

function detected(id: "describe" | "explain" | "evaluate" | "six-mark", answer: string) {
  return checkTechniqueDrill(id, answer).checks.filter((check) => check.detected).map((check) => check.id);
}

describe("generic exam technique drills", () => {
  it("provides describe, explain, evaluate and six-mark structure without science-content approval", () => {
    expect(TECHNIQUE_DRILLS.map((drill) => drill.id)).toEqual(["describe", "explain", "evaluate", "six-mark"]);
    expect(TECHNIQUE_CONTEXT).toContain("fictional library");
    expect(TECHNIQUE_DRILLS.find((drill) => drill.id === "six-mark")?.guidance).toContain("six bullets do not guarantee six marks");
  });

  it("reuses the existing command-word shape check", () => {
    expect(checkTechniqueDrill("describe", "The mean wait decreases from 12 to 8 minutes.").command.command).toBe("describe");
    expect(checkTechniqueDrill("explain", "The wait changes.").command.status).toBe("needs-attention");
    expect(checkTechniqueDrill("explain", "The queue could clear faster because two requests can be served at once.").command.evidence).toContain("reason link");
    expect(checkTechniqueDrill("evaluate", "However the sample is small. Overall extend the trial.").command.command).toBe("evaluate");
    expect(checkTechniqueDrill("six-mark", "").command.command).toBe("evaluate");
  });

  it("does not detect structure in an empty or whitespace response", () => {
    for (const drill of TECHNIQUE_DRILLS) {
      const result = checkTechniqueDrill(drill.id, " \n ");
      expect(result.command.status).toBe("empty");
      expect(result.checks.every((check) => !check.detected)).toBe(true);
    }
  });

  it("distinguishes describing observations from linking a reason", () => {
    expect(detected("describe", "The wait decreases from 12 minutes to 8 minutes.")).toEqual(["response", "data", "observation"]);
    expect(detected("explain", "The wait decreases from 12 to 8 minutes.")).not.toContain("reason");
    expect(detected("explain", "Two desks could reduce the wait because two requests can be served simultaneously.")).toContain("reason");
    // The explanatory assumption can be used without irrelevant numbers.
    expect(checkTechniqueDrill("explain", "because").checks.some((check) => check.id === "data")).toBe(false);
  });

  it("offers separate balance and judgement prompts in an evaluation", () => {
    expect(detected("evaluate", "The wait was 12 minutes and is now 8 minutes.")).toEqual(["response", "data"]);
    expect(detected("evaluate", "The wait was 12 and is now 8. However, visitor numbers differed. Overall extend the trial.")).toEqual(["response", "data", "balance", "judgement"]);
  });

  it("accepts sentences or a multi-section plan for extended-response structure", () => {
    expect(detected("six-mark", "Evidence: 12 to 8.\nReason: because two desks serve requests.\nHowever, one day is limited.\nOverall repeat the trial.")).toContain("structure");
    expect(detected("six-mark", "The wait fell from 12 to 8. It could fall because two desks serve requests. However, only one day was measured. Overall extend the trial.")).toContain("structure");
    expect(detected("six-mark", "overall however because 12 8")).not.toContain("structure");
  });

  it("never converts keyword matches into correctness, marks or mastery", () => {
    const result = checkTechniqueDrill("evaluate", "overall however 12 8");
    expect(result.checks.some((check) => check.detected)).toBe(true);
    expect(result.disclaimer).toContain("Matching a word does not prove");
    expect(result).not.toHaveProperty("mark");
    expect(result).not.toHaveProperty("mastery");
    expect(result).not.toHaveProperty("passed");
  });

  it("keeps model examples illustrative, not approved questions", () => {
    for (const drill of TECHNIQUE_DRILLS) {
      expect(drill.example.length).toBeGreaterThan(30);
      expect(checkTechniqueDrill(drill.id, drill.example).checks.every((check) => check.detected)).toBe(true);
    }
  });
});

describe("local-first settings submission history", () => {
  it("starts empty and rejects malformed history", () => {
    expect(techniqueDrillHistory(settings())).toEqual([]);
    expect(techniqueDrillHistory(settings("invalid"))).toEqual([]);
    expect(techniqueDrillHistory(settings([null, {}, { ...submission("bad"), drillId: "invented" }, { ...submission("date"), submittedAt: "never" }, { ...submission("signals"), detectedChecks: [1] }]))).toEqual([]);
  });

  it("reads only real persisted submissions and deduplicates ids", () => {
    const row = submission("one");
    expect(techniqueDrillHistory(settings([row, row]))).toEqual([row]);
    expect(techniqueDrillHistory(settings([row]))).toHaveLength(1);
  });

  it("caps history at the latest 30 and preserves the existing settings", () => {
    const before = settings(Array.from({ length: 30 }, (_, index) => submission(String(index))));
    const patch = techniqueSubmissionPatch(before, submission("latest"));
    expect(patch.techniqueDrillHistory).toHaveLength(30);
    expect(patch.techniqueDrillHistory?.[0]?.id).toBe("1");
    expect(patch.techniqueDrillHistory?.at(-1)?.id).toBe("latest");
    expect(before.techniqueDrillHistory?.[0]?.id).toBe("0");
    expect(Object.keys(patch)).toEqual(["techniqueDrillHistory"]);
    expect(patch.techniqueDrillHistory?.[0]).not.toHaveProperty("answer");
  });

  it("replaces an existing submission id without double-counting", () => {
    const patch = techniqueSubmissionPatch(settings([submission("one")]), { ...submission("one"), detectedChecks: ["response"] });
    expect(patch.techniqueDrillHistory).toEqual([{ ...submission("one"), detectedChecks: ["response"] }]);
  });

  it("the UI writes metadata through settings, not marked attempts or AI", () => {
    const source = readFileSync("src/app/technique/page.tsx", "utf8");
    expect(source).toContain("store.updateSettings(techniqueSubmissionPatch");
    expect(source).not.toContain("recordAttempt");
    expect(source).not.toContain("@/content");
    expect(source).not.toContain("aiGenerate");
    expect(source).toContain('htmlFor="technique-answer"');
    expect(source).toContain('aria-describedby="technique-guidance technique-limits"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("aria-pressed=");
    expect(source).toContain("key={userId}");
    expect(source).toContain("maxLength={3000}");
  });
});
