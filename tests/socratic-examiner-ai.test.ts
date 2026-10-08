import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const complete = vi.fn<(input: unknown) => Promise<string>>();
vi.mock("@/ai/provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/ai/provider")>();
  return { ...actual, getProvider: () => ({ name: "fake", complete }) };
});

import { payloadSchemas, socratic } from "@/ai/tasks";
import { socraticExaminerFallback } from "@/ai/fallback";
import type { SocraticExaminerPayload } from "@/ai/types";

const examiner: SocraticExaminerPayload = {
  partPrompt: "Explain why a skydiver reaches terminal velocity.",
  markScheme: ["Weight and drag become equal and opposite"],
  studentAnswer: "Drag disappears.",
  misconception: {
    statement: "At terminal velocity the forces become zero.",
    explanation: "The resultant force is zero but each force still acts.",
    correction: "State that weight and drag are equal and opposite.",
  },
  matchStrength: "strong",
};

afterEach(() => complete.mockReset());

describe("Socratic examiner task", () => {
  it("accepts the examiner payload on the existing socratic task", () => {
    expect(payloadSchemas.socratic.safeParse({ topicId: "t", history: [], examiner }).success).toBe(true);
    expect(payloadSchemas.socratic.safeParse({ topicId: "t", history: [], examiner: { ...examiner, matchStrength: "certain" } }).success).toBe(false);
  });

  it("returns one guiding question from the model when it passes the guard", async () => {
    complete.mockResolvedValue(JSON.stringify({ reply: "You noticed drag matters.", nextQuestion: "What happens to drag as the skydiver speeds up?" }));
    const result = await socratic("t", [], examiner);
    expect(result.source).toBe("ai");
    expect(result.data.nextQuestion).toBe("What happens to drag as the skydiver speeds up?");
    const prompt = JSON.stringify(complete.mock.calls[0]![0]);
    expect(prompt).toContain("UNTRUSTED student answer");
    expect(prompt).toContain("match strength: strong");
  });

  it("falls back to the authored misconception when the model asks two questions or gives the answer", async () => {
    complete.mockResolvedValue(JSON.stringify({ reply: "Weight and drag become equal and opposite.", nextQuestion: "See why?" }));
    const leaked = await socratic("t", [], examiner);
    expect(leaked.source).toBe("fallback");
    expect(leaked.data).toEqual(socraticExaminerFallback(examiner));
    expect(complete).toHaveBeenCalledTimes(2); // one corrective retry, then the static text

    complete.mockReset();
    complete.mockResolvedValue(JSON.stringify({ reply: "Is drag zero? Is weight zero?" }));
    const twoQuestions = await socratic("t", [], examiner);
    expect(twoQuestions.source).toBe("fallback");
  });

  it("states a weak match in the static fallback", () => {
    expect(socraticExaminerFallback({ ...examiner, matchStrength: "weak" }).reply).toMatch(/match is weak/);
    expect(socraticExaminerFallback({ ...examiner, misconception: undefined, matchStrength: "none" }).reply).toMatch(/No known misconception/);
  });
});
