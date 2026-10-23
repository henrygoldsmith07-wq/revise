import { describe, expect, it } from "vitest";
import { aboutMinutesLabel, displayMinutes, totalDisplayMinutes } from "@/domain/minutes";
import { INTERVENTION_MINUTES } from "@/domain/intervention-ranking";

describe("shared minute estimate", () => {
  it("rounds up to whole minutes and never shows 0 for real work", () => {
    expect(displayMinutes(8.1)).toBe(9);
    expect(displayMinutes(9)).toBe(9);
    expect(displayMinutes(0.2)).toBe(1);
    expect(displayMinutes(0)).toBe(0);
    expect(displayMinutes(Number.NaN)).toBe(0);
  });
  it("one phrase for every screen", () => {
    expect(aboutMinutesLabel(8.5)).toBe("about 9 min");
    expect(aboutMinutesLabel(0)).toBe("no time needed");
  });
  it("totals round once so a list and its total agree", () => {
    expect(totalDisplayMinutes([2.2, 2.2, 2.2])).toBe(7);
    expect([2.2, 2.2, 2.2].map(displayMinutes).reduce((a, b) => a + b, 0)).toBe(9);
  });
  it("whole-minute stage estimates display unchanged", () => {
    for (const m of Object.values(INTERVENTION_MINUTES)) expect(displayMinutes(m)).toBe(Math.ceil(m));
  });
});
