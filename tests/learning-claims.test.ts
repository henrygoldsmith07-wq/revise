import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";

describe("learningClaims match the part they sit on", () => {
  it("does not paste the osmosis intercept claim onto chemiosmosis", () => {
    const respiration = seedQuestions.find((q) => q.id === "cnt:question:bio-respiration-chemiosmosis");
    expect(respiration).toBeDefined();
    const claim = (respiration!.parts[0].learningClaims ?? []).join(" ").toLowerCase();
    expect(claim).toMatch(/chemiosmosis|oxidative phosphorylation|atp/);
    expect(claim).not.toMatch(/water potential|gained mass|change in mass/);
  });

  it("gives the zero-mass-change osmosis part its own claim", () => {
    const osmosis = seedQuestions.find((q) => q.id === "cnt:question:bio-transport-osmosis");
    expect(osmosis).toBeDefined();
    expect(osmosis!.parts).toHaveLength(2);
    const dilute = (osmosis!.parts[0].learningClaims ?? []).join(" ").toLowerCase();
    const intercept = (osmosis!.parts[1].learningClaims ?? []).join(" ").toLowerCase();
    expect(dilute).toMatch(/dilute|gained mass|osmosis/);
    expect(intercept).toMatch(/zero|no change|intercept|water potential/);
    expect(intercept).not.toBe(dilute);
  });
});
