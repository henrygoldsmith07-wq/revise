import { describe, expect, it } from "vitest";
import { analyseWriting, buildLongAnswerFeedback, commandWordOf } from "@/domain/long-answer-feedback";
import type { MarkedPart, Question } from "@/domain/types";

const question = (id: string, family: string, marks = 6): Question => ({
  id, subjectId: "bio", topicIds: ["t"], kind: "extended", stem: "Stem", totalMarks: marks, calculatorAllowed: false, difficulty: 3, origin: "seed",
  createdAt: "2026-01-01T00:00:00.000Z", learning: { familyId: family } as Question["learning"],
  parts: [{ id: `${id}:a`, label: "", prompt: "Evaluate the effect of temperature on enzyme activity.", marks, markScheme: ["a", "b"], modelAnswer: "m" }],
}) as Question;
const marked = (awarded: number, missed: string[]): MarkedPart => ({ partId: "x:a", awarded, max: 6, creditedPoints: ["denaturation"], missedPoints: missed, comment: "" });
const src = question("src", "f1");

describe("long-answer feedback", () => {
  it("finds the command word from the prompt first", () => {
    expect(commandWordOf("Explain why, then state the value")).toBe("explain");
    expect(commandWordOf("no verb here")).toBeNull();
  });
  it("flags missing linking, vague terms and missing evaluation without touching marks", () => {
    const issues = analyseWriting("Temperature is a thing. Enzymes do stuff when it is hot. Enzymes work faster in warm conditions and slower in cold.", "evaluate", 6).map((i) => i.kind);
    expect(issues).toEqual(expect.arrayContaining(["no-linking", "vague-terms", "no-evaluation", "too-short"]));
  });
  it("accepts a linked, balanced, concluded answer", () => {
    const text = "Raising temperature increases kinetic energy, which means substrates collide with active sites more often, so the rate rises. However, above the optimum the enzyme denatures because hydrogen bonds break, although the extent depends on the enzyme. Overall, the optimum balances these effects, therefore activity peaks at a moderate temperature and falls sharply beyond it.";
    expect(analyseWriting(text, "evaluate", 6)).toEqual([]);
  });
  it("orders earned, lost, why, impact and rewrite, and picks a fresh-family equivalent", () => {
    const fb = buildLongAnswerFeedback({
      question: src, part: src.parts[0]!, marked: marked(3, ["optimum temperature named"]), answer: "Enzymes work better when warm.",
      candidates: [question("same", "f1"), question("seen", "f2"), question("ok", "f3"), question("other-topic", "f4")].map((c) => (c.id === "other-topic" ? { ...c, topicIds: ["z"] } : c)),
      attemptedQuestionIds: new Set(["seen"]),
    });
    expect(fb.earned).toMatchObject({ marks: 3, of: 6, credited: ["denaturation"] });
    expect(fb.lost.marks).toBe(3);
    expect(fb.why[0]).toMatch(/optimum temperature named/);
    expect(fb.highestImpact).toMatch(/optimum temperature named/);
    expect(fb.rewrite?.instruction).toMatch(/own words/);
    expect(fb.equivalentQuestionId).toBe("ok");
    expect(fb.commandWord.fulfilled).toBe(false);
  });
  it("gives no rewrite for full marks", () => {
    const fb = buildLongAnswerFeedback({ question: src, part: src.parts[0]!, marked: marked(6, []), answer: "x ".repeat(80) });
    expect(fb.rewrite).toBeNull();
    expect(fb.lost.marks).toBe(0);
  });
  it("labels low-confidence marks and keeps human review", () => {
    const fb = buildLongAnswerFeedback({ question: src, part: src.parts[0]!, marked: marked(3, ["a"]), answer: "short", attempt: { markedBy: "ai", markConfidence: 0.4 } });
    expect(fb.confidence).toMatchObject({ level: "low", humanReview: true });
  });
  it("returns no equivalent when none is genuinely different", () => {
    const fb = buildLongAnswerFeedback({ question: src, part: src.parts[0]!, marked: marked(3, ["a"]), answer: "a", candidates: [question("same", "f1")] });
    expect(fb.equivalentQuestionId).toBeNull();
  });
});
