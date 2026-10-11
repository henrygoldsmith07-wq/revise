import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Question } from "@/domain/types";

// A student whose first marked answer happens offline used to press Submit and
// see nothing: the AI client chunk failed to load, the submit promise rejected
// silently and the button came back as if never pressed.

vi.mock("@/ai/client", () => {
  throw new Error("Failed to load chunk /_next/static/chunks/ai-client.js");
});

const question = {
  id: "q-offline", subjectId: "wjec-alevel-physics", topicIds: ["wjec-alevel-physics.circular-shm"], kind: "short", stem: "s", totalMarks: 2,
  calculatorAllowed: true, difficulty: 2, origin: "seed", createdAt: "2026-01-01T00:00:00.000Z",
  parts: [{ id: "q-offline:a", label: "", prompt: "State the defining equation of SHM.", marks: 2, markScheme: ["a = −ω²x", "acceleration directed towards equilibrium"], modelAnswer: "a = −ω²x: acceleration proportional to displacement and directed towards equilibrium." }],
} as unknown as Question;
const answers = { "q-offline:a": "a = −ω²x, acceleration always towards equilibrium" };

describe("marking when the AI marker cannot be loaded", () => {
  it("marks on this device against the mark scheme, labelled, and queues nothing", async () => {
    const { aiMark } = await import("@/lib/optional-ai");
    const envelope = await aiMark(question, answers);
    expect(envelope.source).toBe("fallback");
    expect(envelope.tier).toBe("fallback");
    expect(envelope.retryable).toBe(false);
    expect(envelope.withheld).toBeNull();
    expect(envelope.note).toMatch(/could not be loaded/);
    expect(envelope.data.feedback).toContain("no AI was involved");
    expect(envelope.data.marked).toHaveLength(1);
    expect(envelope.data.marked[0]!.max).toBe(2);
  });

  it("gives the same marks as the existing rubric fallback", async () => {
    const { markFallback } = await import("@/ai/fallback");
    const { aiMarkerUnavailableMark, deviceRubricMark } = await import("@/lib/offline-mark");
    expect(markFallback(question, answers)).toEqual(deviceRubricMark(question, answers));
    expect(aiMarkerUnavailableMark(question, answers).data.marked.map((m) => m.awarded)).toEqual(markFallback(question, answers).marked.map((m) => m.awarded));
  });

  it("tells the student when a submit fails outright, and keeps the answer", () => {
    const execution = readFileSync(join(process.cwd(), "src/state/question-execution.ts"), "utf8");
    const runner = readFileSync(join(process.cwd(), "src/components/QuestionRunner.tsx"), "utf8");
    expect(execution).toContain("That answer was not marked or saved. It is still here, so you can submit it again.");
    expect(runner).toContain('{submitError && !result && !marking ? (');
    expect(runner).toContain('role="alert">{submitError}</p>');
  });
});
