import { describe, expect, it } from "vitest";
import {
  buildHintLadder,
  hintEvidenceMultiplier,
  hintEvidenceSource,
  nextHint,
} from "@/domain/hints";
import { EVIDENCE_WEIGHT } from "@/domain/capability-mastery";
import type { Question } from "@/domain/types";

// ---------------------------------------------------------------------------
// Hint integrity: the ladder escalates cue → prompt → scaffold → worked
// solution, and the early rungs must not leak the credited answer content of
// the question being answered. Only the top tier (revealed on explicit
// give-up) may show the mark-scheme material. Evidence weighting follows the
// same rule: the more support, the weaker the resulting evidence.
// ---------------------------------------------------------------------------

function questionWithScheme(markScheme: string[], stemOverrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    subjectId: "bio",
    topicIds: ["bio.respiration"],
    kind: "structured",
    stem: "Explain the effect of temperature on the rate.",
    parts: [
      {
        id: "q1.a",
        label: "(a)",
        prompt: "Explain the effect.",
        marks: 3,
        markScheme,
        modelAnswer: markScheme.join(" "),
      },
    ],
    totalMarks: 3,
    calculatorAllowed: true,
    difficulty: 3,
    origin: "seed",
    createdAt: "2026-09-05T12:00:00.000Z",
    ...stemOverrides,
  };
}

describe("hint ladder integrity", () => {
  // A distinctive credited phrase that appears nowhere in the stem or in the
  // topic key points — the only place it may surface is the top tier.
  const credited = ["more frequent successful collisions raise the rate"];
  const question = questionWithScheme(credited, {
    stem: "Describe how temperature affects this reaction.",
    parts: [
      {
        id: "q1.a",
        label: "",
        prompt: "Explain.",
        marks: 3,
        markScheme: credited,
        modelAnswer: credited[0],
      },
    ],
  });
  const topic = {
    keyPoints: ["Particles gain kinetic energy."],
    commonErrors: ["Confusing rate with activation energy."],
  };

  it("builds cue → prompt → scaffold → worked solution in order", () => {
    const ladder = buildHintLadder(question, topic);
    expect(ladder.map((hint) => hint.tier)).toEqual(["cue", "prompt", "scaffold", "worked-solution"]);
  });

  it("never leaks the credited answer content in the early tiers", () => {
    const ladder = buildHintLadder(question, topic);
    const early = ladder.filter((hint) => hint.tier !== "worked-solution");
    for (const hint of early) {
      expect(hint.text).not.toContain("successful collisions");
      expect(hint.text).not.toContain("raise the rate");
    }
  });

  it("serves the tiers one at a time and only the top tier shows the credited material", () => {
    const ladder = buildHintLadder(question, topic);
    expect(nextHint(ladder, [])?.tier).toBe("cue");
    expect(nextHint(ladder, ["cue"])?.tier).toBe("prompt");
    expect(nextHint(ladder, ["cue", "prompt"])?.tier).toBe("scaffold");
    expect(nextHint(ladder, ["cue", "prompt", "scaffold"])?.tier).toBe("worked-solution");
    const top = ladder[ladder.length - 1];
    expect(top?.text).toContain("Worked through");
  });

  it("keeps the scaffold structural rather than echoing the mark scheme verbatim", () => {
    const ladder = buildHintLadder(question, topic);
    const scaffold = ladder.find((hint) => hint.tier === "scaffold");
    expect(scaffold).toBeDefined();
    expect(scaffold!.text.startsWith("Structure the answer:")).toBe(true);
    // It guides how many points to plan without naming which ones.
    expect(scaffold!.text).toMatch(/3 distinct points/);
  });

  it("weights evidence by the highest tier reached", () => {
    expect(hintEvidenceSource(null)).toBe("independent");
    expect(hintEvidenceSource("cue")).toBe("assisted");
    expect(hintEvidenceSource("prompt")).toBe("assisted");
    expect(hintEvidenceSource("scaffold")).toBe("viewed");
    expect(hintEvidenceSource("worked-solution")).toBe("viewed");
    expect(hintEvidenceMultiplier("worked-solution")).toBe(EVIDENCE_WEIGHT.viewed);
    expect(hintEvidenceMultiplier("cue")).toBeLessThan(EVIDENCE_WEIGHT.independent);
  });
});
