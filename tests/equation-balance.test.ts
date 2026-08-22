import { describe, expect, it } from "vitest";
import { checkEquationBalance, findUnbalancedEquations } from "@/domain/equation-balance";

describe("checkEquationBalance", () => {
  it("confirms balanced equations including coefficients", () => {
    expect(checkEquationBalance("2H2 + O2 -> 2H2O")?.ok).toBe(true);
    expect(checkEquationBalance("Mg + O2 -> MgO + O")?.ok).toBe(true);
    expect(checkEquationBalance("CH4 + 2O2 -> CO2 + 2H2O")?.ok).toBe(true);
    expect(checkEquationBalance("N2 + 3H2 -> 2NH3")?.ok).toBe(true);
  });

  it("rejects unbalanced equations", () => {
    const result = checkEquationBalance("H2 + O2 -> H2O");
    expect(result?.ok).toBe(false);
    expect(result?.left.O).toBe(2);
    expect(result?.right.O).toBe(1);
    expect(checkEquationBalance("Mg + O2 -> MgO")?.ok).toBe(false);
  });

  it("returns null for non-equations and unsupported syntax", () => {
    expect(checkEquationBalance("no arrow here")).toBeNull();
    expect(checkEquationBalance("pH = 2.88")).toBeNull(); // '=' is not an equation arrow
    expect(checkEquationBalance("Ca(OH)2 -> CaO")) .toBeNull(); // brackets unverifiable
    expect(checkEquationBalance("Zn + 2H+ -> Zn2+ + H2")).toBeNull(); // charges out of scope
  });

  it("ignores state symbols", () => {
    expect(checkEquationBalance("CaCO3(s) -> CaO(s) + CO2(g)")?.ok).toBe(true);
  });
});

describe("findUnbalancedEquations", () => {
  it("flags only the unbalanced equation in a mixed answer", () => {
    const answer = "Magnesium burns: 2Mg + O2 -> 2MgO. Then hydrogen reacts: H2 + O2 -> H2O.";
    expect(findUnbalancedEquations(answer)).toEqual(["H2 + O2 -> H2O"]);
  });

  it("returns empty for prose without equations", () => {
    expect(findUnbalancedEquations("The rate increases because temperature rises. pH = 2.88.")).toEqual([]);
  });

  it("does not flag balanced working", () => {
    expect(findUnbalancedEquations("Burning: CH4 + 2O2 -> CO2 + 2H2O, so complete combustion.")).toEqual([]);
  });
});
