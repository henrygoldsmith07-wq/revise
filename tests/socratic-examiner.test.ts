import { describe, expect, it } from "vitest";
import { misconceptionsForTopic, seedMisconceptions } from "@/content";
import {
  checkSocraticReply,
  matchStrength,
  revealsMarkScheme,
  selectSocraticFocus,
  socraticExaminerContext,
  staticSocraticGuidance,
} from "@/domain/socratic-examiner";
import { bestMisconceptionMatch, matchMisconception } from "@/domain/misconception-library";
import type { Question } from "@/domain/types";

const terminal = seedMisconceptions.find((m) => m.id === "cnt:misconception:terminal-velocity-zero-force")!;

const question = {
  totalMarks: 4,
  parts: [
    {
      id: "a",
      label: "(a)",
      prompt: "Explain why a skydiver reaches terminal velocity.",
      marks: 3,
      markScheme: [
        "Drag increases with speed",
        "Weight and drag become equal and opposite",
        "Resultant force is zero so acceleration is zero",
      ],
      modelAnswer: "",
    },
    { id: "b", label: "(b)", prompt: "State the unit of force.", marks: 1, markScheme: ["newton"], modelAnswer: "" },
  ],
} as unknown as Pick<Question, "parts" | "totalMarks">;

describe("Socratic examiner — focus selection", () => {
  it("returns null when every part earned full marks", () => {
    const focus = selectSocraticFocus({
      question,
      marked: [
        { partId: "a", awarded: 3, max: 3, missedPoints: [] },
        { partId: "b", awarded: 1, max: 1, missedPoints: [] },
      ],
      answers: {},
      misconceptions: seedMisconceptions,
    });
    expect(focus).toBeNull();
  });

  it("focuses on the part that dropped most marks and finds the authored misconception", () => {
    const focus = selectSocraticFocus({
      question,
      marked: [
        { partId: "a", awarded: 1, max: 3, missedPoints: ["Weight and drag become equal and opposite", "Resultant force is zero so acceleration is zero"] },
        { partId: "b", awarded: 0, max: 1, missedPoints: ["newton"] },
      ],
      answers: { a: "Drag disappears at terminal velocity so the forces on a falling object become zero.", b: "kg" },
      misconceptions: seedMisconceptions,
    });
    expect(focus?.partId).toBe("a");
    expect(focus?.marksDropped).toBe(2);
    expect(focus?.misconception?.id).toBe(terminal.id);
    expect(focus?.strength).not.toBe("none");
  });

  it("calls a match strong when the answer carries the misconception's tell-tale wording", () => {
    const focus = selectSocraticFocus({
      question,
      marked: [{ partId: "a", awarded: 1, max: 3, missedPoints: ["Weight and drag become equal and opposite"] }],
      answers: { a: "drag disappears at terminal velocity so the forces on a falling object become zero" },
      misconceptions: seedMisconceptions,
    });
    expect(focus?.misconception?.id).toBe(terminal.id);
    expect(focus?.strength).toBe("strong");
  });

  it("reports no misconception rather than a weak guess when nothing matches", () => {
    const focus = selectSocraticFocus({
      question,
      marked: [{ partId: "b", awarded: 0, max: 1, missedPoints: ["newton"] }],
      answers: { b: "kg" },
      misconceptions: misconceptionsForTopic("wjec-alevel-physics.kinematics-dynamics"),
    });
    expect(focus?.strength).toBe("none");
    expect(focus?.misconception).toBeNull();
    const guidance = staticSocraticGuidance(focus!);
    expect(guidance.statement).toBeNull();
    expect(guidance.basis).toMatch(/No known misconception/);
  });

  it("falls back to the part's own scheme when no missed points were named", () => {
    const focus = selectSocraticFocus({
      question,
      marked: [{ partId: "a", awarded: 2, max: 3, missedPoints: [] }],
      answers: { a: "" },
      misconceptions: [],
    });
    expect(focus?.missedPoints).toEqual(question.parts[0]!.markScheme);
  });

  it("grades match strength from the raw library score", () => {
    expect(matchStrength(0.9)).toBe("strong");
    expect(matchStrength(0.7)).toBe("strong");
    expect(matchStrength(0.55)).toBe("weak");
    expect(matchStrength(0.2)).toBe("none");
  });

  it("keeps matchMisconception's 0.5 threshold on top of the unthresholded best match", () => {
    const best = bestMisconceptionMatch(seedMisconceptions, "newton", "kg");
    expect(best).not.toBeNull();
    if (best!.score < 0.5) expect(matchMisconception(seedMisconceptions, "newton", "kg")).toBeNull();
  });
});

describe("Socratic examiner — static guidance and context", () => {
  const base = {
    partId: "a",
    partLabel: "(a)",
    partPrompt: "Explain…",
    missedPoints: ["Weight and drag become equal and opposite"],
    studentAnswer: "drag disappears",
    marksDropped: 1,
  };

  it("uses the authored misconception verbatim for a strong match", () => {
    const g = staticSocraticGuidance({ ...base, misconception: terminal, matchScore: 0.8, strength: "strong" });
    expect(g.statement).toBe(terminal.statement);
    expect(g.explanation).toBe(terminal.explanation);
    expect(g.correction).toBe(terminal.correction);
    expect(g.basis).not.toMatch(/weak/);
  });

  it("says so plainly when the match is weak", () => {
    const g = staticSocraticGuidance({ ...base, misconception: terminal, matchScore: 0.55, strength: "weak" });
    expect(g.basis).toMatch(/weak/);
    expect(g.statement).toBe(terminal.statement);
  });

  it("builds the model context with the misconception and its strength, and nothing else", () => {
    const ctx = socraticExaminerContext({ ...base, misconception: terminal, matchScore: 0.8, strength: "strong" });
    expect(Object.keys(ctx).sort()).toEqual(["markScheme", "matchStrength", "misconception", "partPrompt", "studentAnswer"]);
    expect(ctx.misconception?.statement).toBe(terminal.statement);
    const none = socraticExaminerContext({ ...base, misconception: null, matchScore: 0.1, strength: "none" });
    expect(none.misconception).toBeUndefined();
    expect(none.matchStrength).toBe("none");
  });
});

describe("Socratic examiner — reply guard", () => {
  const missed = ["Weight and drag become equal and opposite", "Resultant force is zero so acceleration is zero"];

  it("accepts one guiding question with a lead-in", () => {
    const check = checkSocraticReply(
      { reply: "You spotted that drag matters.", nextQuestion: "What happens to the size of the drag force as the skydiver speeds up?" },
      missed,
    );
    expect(check).toEqual({
      ok: true,
      lead: "You spotted that drag matters.",
      question: "What happens to the size of the drag force as the skydiver speeds up?",
    });
  });

  it("extracts the single question when the model puts it in the reply", () => {
    const check = checkSocraticReply({ reply: "Good start. Which forces still act on the skydiver at that point?" }, missed);
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.question).toBe("Which forces still act on the skydiver at that point?");
      expect(check.lead).toBe("Good start.");
    }
  });

  it("rejects replies with no question or more than one", () => {
    expect(checkSocraticReply({ reply: "Drag grows with speed." }, missed)).toEqual({ ok: false, reason: "no-question" });
    expect(checkSocraticReply({ reply: "Is drag zero? Or is it equal to weight?" }, missed)).toEqual({
      ok: false,
      reason: "more-than-one-question",
    });
    expect(
      checkSocraticReply({ reply: "Why?", nextQuestion: "What acts on the skydiver?" }, missed),
    ).toEqual({ ok: false, reason: "more-than-one-question" });
  });

  it("rejects a reply that hands over a dropped mark-scheme point", () => {
    const check = checkSocraticReply(
      { reply: "The weight and drag become equal and opposite.", nextQuestion: "Can you see why?" },
      missed,
    );
    expect(check).toEqual({ ok: false, reason: "reveals-answer" });
  });

  it("does not treat a short numeric point as leaked by accident", () => {
    expect(revealsMarkScheme("What unit is force measured in?", ["newton"])).toBe(false);
  });
});
