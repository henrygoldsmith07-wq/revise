import { describe, expect, it } from "vitest";
import { stemRepeatsOnlyPart } from "@/domain/question-display";

describe("stemRepeatsOnlyPart", () => {
  it("is true only for a single part that repeats the stem", () => {
    const text = "Define the rms value of an alternating current.";
    expect(stemRepeatsOnlyPart({ stem: text, parts: [{ prompt: ` ${text.replace(" ", "  ")} ` }] })).toBe(true);
    expect(stemRepeatsOnlyPart({ stem: text, parts: [{ prompt: "State its unit." }] })).toBe(false);
    expect(stemRepeatsOnlyPart({ stem: text, parts: [{ prompt: text }, { prompt: text }] })).toBe(false);
    expect(stemRepeatsOnlyPart({ stem: "", parts: [{ prompt: "" }] })).toBe(false);
  });
});
