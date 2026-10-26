import { describe, expect, it } from "vitest";
import { numericMatch } from "@/domain/marking-numeric";

// Pass 82: small values were compared with a flat 0.005 slack, so any two numbers
// of order 1e-6 (or 1e-34) "matched", and a number in the working earned the result mark.
const POINT = "ρ = RA/L = 4.0×0.50×10⁻⁶/2.0 = 1.0×10⁻⁶ Ω m";
describe("numericMatch with small values and chained working", () => {
  it("does not credit a wrong small result because the working shares a number", () => {
    expect(numericMatch(POINT, "R L / A = 4.0 x 2.0 / 0.50e-6 = 1.6e7 ohm m")).toBe(false);
  });
  it("does not treat 5e-7 as 1e-6", () => {
    expect(numericMatch("1.0×10⁻⁶ Ω m", "5.0e-7 ohm m")).toBe(false);
  });
  it("still credits the right result, however written", () => {
    expect(numericMatch(POINT, "rho = 4.0 x 0.50e-6 / 2.0 = 1.0e-6 ohm m")).toBe(true);
    expect(numericMatch("1.0×10⁻⁶ Ω m", "1.0 x 10^-6 ohm m")).toBe(true);
  });
  it("keeps the small absolute slack for ordinary values", () => {
    expect(numericMatch("Strain = 0.0012", "strain 0.0012")).toBe(true);
  });
});
