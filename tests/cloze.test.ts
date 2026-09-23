import { describe, expect, it } from "vitest";
import { buildCloze, CLOZE_BLANK, clozeReveal, clozeSource, normaliseCloze, validCloze } from "@/domain/cloze";

describe("buildCloze", () => {
  it("blanks the hidden answer and keeps the complete source", () => {
    const built = buildCloze("Mitochondria release energy by aerobic respiration.", "aerobic respiration");
    expect(built).toEqual({
      front: "Mitochondria release energy by " + CLOZE_BLANK + ".",
      back: "aerobic respiration",
      clozeSource: "Mitochondria release energy by aerobic respiration.",
    });
  });

  it("matches without caring about typed answer casing but preserves source casing", () => {
    const built = buildCloze("ATP is produced in mitochondria.", "atp");
    expect(built?.front).toBe(CLOZE_BLANK + " is produced in mitochondria.");
    expect(built?.back).toBe("ATP");
  });

  it("blanks only the first occurrence so one card tests one deletion", () => {
    const built = buildCloze("ATP transfers energy; ATP is regenerated.", "ATP");
    expect(built?.front).toBe(CLOZE_BLANK + " transfers energy; ATP is regenerated.");
  });

  it("treats punctuation and maths characters as literal hidden text", () => {
    expect(buildCloze("Use E = mc^2 in this model.", "E = mc^2")?.front).toBe(
      "Use " + CLOZE_BLANK + " in this model.",
    );
    expect(buildCloze("The concentration [H+] increases.", "[H+]")?.front).toBe(
      "The concentration " + CLOZE_BLANK + " increases.",
    );
  });

  it("refuses empty or unrelated hidden answers", () => {
    expect(buildCloze("", "ATP")).toBeNull();
    expect(buildCloze("ATP transfers energy.", "")).toBeNull();
    expect(buildCloze("ATP transfers energy.", "glucose")).toBeNull();
    expect(validCloze("ATP transfers energy.", "ATP")).toBe(true);
    expect(validCloze("ATP transfers energy.", "glucose")).toBe(false);
  });
});

describe("cloze reveal compatibility", () => {
  it("prefers the stored full source", () => {
    const card = {
      kind: "cloze" as const,
      front: "Water moves by […] across a partially permeable membrane.",
      back: "osmosis",
      clozeSource: "Water moves by osmosis across a partially permeable membrane.",
    };
    expect(clozeSource(card)).toBe(card.clozeSource);
    expect(clozeReveal(card)).toBe(card.clozeSource);
  });

  it("reconstructs legacy cards that have a blank but no clozeSource", () => {
    const card = {
      kind: "cloze" as const,
      front: "Water moves by […] across a partially permeable membrane.",
      back: "osmosis",
    };
    expect(clozeSource(card)).toBe("Water moves by osmosis across a partially permeable membrane.");
    expect(clozeReveal(card)).toBe("Water moves by osmosis across a partially permeable membrane.");
  });

  it("falls back to the answer when a legacy cloze cannot be reconstructed", () => {
    expect(clozeReveal({ kind: "cloze", front: "What is osmosis?", back: "Water movement" })).toBe("Water movement");
  });
});

describe("normaliseCloze", () => {
  it("upgrades a legacy blank prompt into a canonical source", () => {
    expect(normaliseCloze("Water moves by […] across a membrane.", "osmosis")).toEqual({
      front: "Water moves by […] across a membrane.",
      back: "osmosis",
      clozeSource: "Water moves by osmosis across a membrane.",
    });
  });

  it("turns a complete generated sentence into a cloze when the answer is present", () => {
    expect(normaliseCloze("ATP is the immediate energy carrier.", "ATP")?.front).toBe(
      "[…] is the immediate energy carrier.",
    );
  });

  it("returns null for a fake cloze that has no recoverable deletion", () => {
    expect(normaliseCloze("What is the immediate energy carrier?", "ATP")).toBeNull();
  });
});
