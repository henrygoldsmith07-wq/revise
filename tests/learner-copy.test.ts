import { describe, expect, it } from "vitest";
import { skillPhrase } from "@/domain/learning-action";

// Capability labels are verb phrases; learner-facing sentences wrap them as
// "check whether you can …". The old templates produced "One short question
// will check interpret local slopes…", seen on the live adaptive-session intro.
describe("skillPhrase", () => {
  it("lowers only the first letter so the label reads inside a sentence", () => {
    expect(skillPhrase("Find the resultant force with signs")).toBe("find the resultant force with signs");
    expect(skillPhrase("interpret local slopes and their signs in motion graphs.")).toBe(
      "interpret local slopes and their signs in motion graphs",
    );
  });

  it("keeps acronyms, units and symbols intact", () => {
    expect(skillPhrase("Convert solution volumes to dm³")).toBe("convert solution volumes to dm³");
    expect(skillPhrase("EMF and internal resistance")).toBe("EMF and internal resistance");
  });

  it("never produces an empty phrase", () => {
    expect(skillPhrase("   ")).toBe("this skill");
  });
});
