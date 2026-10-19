import { describe, expect, it } from "vitest";
import { markPart } from "@/domain/marking";
import { formulaContradicted, formulaEvidence } from "@/domain/marking-formula";
import { alternativesOf, canonicalPhrases, genotypeWords, pointCoverage } from "@/domain/marking-language";
import { numericMatch } from "@/domain/marking-numeric";
import type { QuestionPart } from "@/domain/types";

// ---------------------------------------------------------------------------
// Marker false negatives (twenty-ninth pass, 2026-10-19).
//
// tests/marking-self-consistency.test.ts runs every written part's own model
// answer through the offline marker. 883 of 4,006 scored below full marks;
// instrumenting markPart showed the causes (coverage, the recitation cap,
// the scaffolding guard, the polarity veto, structured numerics, the short
// and self-retraction caps). This pass fixed the general ones, and each fix
// here is pinned twice: a correct answer it now credits, and wrong answers
// through the same path (opposite direction, wrong reagent, wrong value,
// wrong rearrangement, wrong substitution) that must still lose the mark.
// ---------------------------------------------------------------------------

const part = (markScheme: string[], modelAnswer: string, marks = markScheme.length, overrides: Partial<QuestionPart> = {}): QuestionPart => ({
  id: "p1",
  label: "(a)",
  prompt: "Answer the question.",
  marks,
  markScheme,
  modelAnswer,
  ...overrides,
});

const awarded = (p: QuestionPart, answer: string) => markPart(p, answer).awarded;

describe("formula evidence: an equation point shown rearranged, substituted or worked", () => {
  const expected = (...values: number[]) => () => values;

  it("credits a rearranged formula and refuses a wrong rearrangement", () => {
    expect(formulaEvidence("Use pV = nRT", "n = pV/RT = (1.2 × 10⁵ × 0.020)/(8.31 × 300) = 0.963 mol.", expected(0.963))).toBe(true);
    expect(formulaEvidence("Use Q = mcΔT", "c = Q/(mΔT) = 12000/(0.40 × 15) = 2000 J kg⁻¹ K⁻¹.", expected(2000))).toBe(true);
    expect(formulaEvidence("Use F = ke", "k = F/e = 6.0/0.040 = 150 N m⁻¹.", expected(150))).toBe(true);
    expect(formulaEvidence("Use fringe spacing w = λD/s", "λ = ws/D = (4.8 × 10⁻³)(2.5 × 10⁻⁴)/2.0 = 6.0 × 10⁻⁷ m.", expected(6e-7))).toBe(true);
    // Wrong rearrangements, whatever their numbers.
    expect(formulaEvidence("Use pV = nRT", "n = pR/VT = 5 mol.", expected(0.963))).toBe(false);
    expect(formulaEvidence("Use Q = mcΔT", "c = QΔT/m = 5 J kg⁻¹ K⁻¹.", expected(2000))).toBe(false);
    expect(formulaEvidence("Use F = ke", "k = e/F = 6.0/0.040 = 150 N m⁻¹.", expected(150))).toBe(false);
  });

  it("credits numbers substituted into the same quantity's formula only when they reach the right value", () => {
    expect(formulaEvidence("Cardiac output = heart rate × stroke volume", "Cardiac output = 160 × 0.090 = 14.4 dm³ min⁻¹.", expected(14.4))).toBe(true);
    expect(formulaEvidence("RQ = CO₂ produced/O₂ consumed", "RQ = 18/18 = 1.0.", expected(1))).toBe(true);
    expect(formulaEvidence("NPP = GPP − respiratory loss", "NPP = 18 000 − 7 000 = 11 000 kJ m⁻² year⁻¹.", expected(11000))).toBe(true);
    expect(formulaEvidence("Kc = [HI]²/([H₂][I₂])", "Kc = 0.50²/(0.25 × 0.25) = 4.0.", expected(4))).toBe(true);
    expect(formulaEvidence("Use a = (v − u)/t", "a = (20 − 8)/6 = 2.0 m s⁻².", expected(2))).toBe(true);
    // Wrong operation, wrong shape, or the right shape with the wrong numbers.
    expect(formulaEvidence("Cardiac output = heart rate × stroke volume", "Cardiac output = 160 / 0.090 = 1777 dm³ min⁻¹.", expected(14.4))).toBe(false);
    expect(formulaEvidence("Cardiac output = heart rate × stroke volume", "Cardiac output = 150 × 0.090 = 13.5 dm³ min⁻¹.", expected(14.4))).toBe(false);
    expect(formulaEvidence("NPP = GPP − respiratory loss", "NPP = 18 000 + 7 000 = 25 000.", expected(11000))).toBe(false);
    expect(formulaEvidence("Kc = [HI]²/([H₂][I₂])", "Kc = (0.25 × 0.25)/0.50² = 0.25.", expected(4))).toBe(false);
    expect(formulaEvidence("Use a = (v − u)/t", "a = (20 + 8)/6 = 4.7 m s⁻².", expected(2))).toBe(false);
    // A different quantity on the left is not the scheme's formula.
    expect(formulaEvidence("Cardiac output = heart rate × stroke volume", "Stroke volume = 160 × 0.090 = 14.4.", expected(14.4))).toBe(false);
  });

  it("a point that works its formula out needs the working, not only the formula", () => {
    expect(formulaEvidence("F = mv²/r = 1200 × 18² / 45", "F = mv²/r = 1200 × 18² / 45 = 8640 N", expected(8640))).toBe(true);
    expect(formulaEvidence("F = mv²/r = 1200 × 18² / 45", "F = mv²/r = 1500 × 18² / 45 = 10 800 N", expected(8640))).toBe(false);
  });

  it("credits a worked value for the same quantity, and only the same value", () => {
    expect(formulaEvidence("E°cell = +0.34 − (−0.44)", "E°cell = +0.78 V. Iron loses electrons.", expected())).toBe(true);
    expect(formulaEvidence("Average acceleration = (10 − 0)/6", "The average acceleration is 10/6 = 1.67 m s⁻².", expected())).toBe(true);
    expect(formulaEvidence("Magnitude = √(2² + 6²)", "Its magnitude is √40 = 2√10 km.", expected())).toBe(true);
    expect(formulaEvidence("E°cell = +0.34 − (−0.44)", "E°cell = −0.10 V.", expected())).toBe(false);
    expect(formulaEvidence("Average acceleration = (10 − 0)/6", "The average acceleration is 6/10 = 0.6 m s⁻².", expected())).toBe(false);
  });

  it("never reads prose with an equation inside as a formula point", () => {
    expect(formulaEvidence("The student uses the equation for density and concludes that the block is denser than water, which means it sinks = true", "density = 5", expected(5))).toBe(false);
  });

  it("calls a same-quantity equation that does not hold a different formula, and leaves equivalent ones alone", () => {
    expect(formulaContradicted("v² = u² + 2as", "v² = u² − 2as, and the acceleration must be constant.")).toBe(true);
    expect(formulaContradicted("Use F = ke", "k = e/F")).toBe(true);
    expect(formulaContradicted("v² = u² + 2as", "v² = u² + 2as, so v = √(u² + 2as).")).toBe(false);
    expect(formulaContradicted("Use pV = nRT", "n = pV/RT = 0.963 mol")).toBe(false);
    // Several true statements share letters: derivatives are left alone.
    expect(formulaContradicted("d²y/dx² = 6x − 12", "dy/dx = 3x² − 12x + 9, so d²y/dx² = 6x − 12")).toBe(false);
  });

  it("marks a whole part: the substituted formula earns its mark, a sign slip loses it", () => {
    const p = part(["Use a = (v − u)/t", "a = 2.0 m s⁻²"], "a = (20 − 8)/6 = 2.0 m s⁻².", 2);
    expect(awarded(p, "a = (20 − 8)/6 = 2.0 m s⁻²")).toBe(2);
    expect(awarded(p, "a = (20 + 8)/6 = 4.7 m s⁻²")).toBe(0);
    const suvat = part(["v² = u² + 2as", "The acceleration must be constant"], "v² = u² + 2as, valid only for constant acceleration.", 2);
    expect(awarded(suvat, "v² = u² − 2as, and the acceleration must be constant.")).toBe(1);
  });
});

describe("reagents by formula or by name", () => {
  it("treats a reagent's formula and its name as one word, unicode subscripts included", () => {
    expect(pointCoverage("Add NaOH then CuSO4 (biuret reagent)", "Add sodium hydroxide then copper(II) sulfate")).toBeGreaterThanOrEqual(0.6);
    expect(pointCoverage("Products are carbon dioxide and water", "The products are CO₂ and H₂O")).toBe(1);
    expect(canonicalPhrases("acidified K₂Cr₂O₇")).toBe(canonicalPhrases("acidified potassium dichromate(VI)"));
    expect(canonicalPhrases("H₂SO₄")).toBe(canonicalPhrases("sulfuric acid"));
  });

  it("never merges different reagents, or a peroxide with water", () => {
    expect(pointCoverage("Add NaOH then CuSO4 (biuret reagent)", "Add hydrochloric acid then silver nitrate")).toBeLessThan(0.5);
    expect(canonicalPhrases("sodium carbonate")).not.toBe(canonicalPhrases("sodium hydrogencarbonate"));
    expect(canonicalPhrases("H₂O₂")).not.toContain("h2o ");
    expect(canonicalPhrases("hydrogen chloride gas")).toContain("hydrogen chloride");
    expect(canonicalPhrases("an oxygen atom")).toContain("oxygen");
  });

  it("reads a reaction order said as a number or an ordinal as the same order", () => {
    expect(pointCoverage("The reaction is first order in A", "The order in A is one")).toBeGreaterThanOrEqual(0.5);
    expect(canonicalPhrases("first order")).toBe(canonicalPhrases("order 1"));
    expect(canonicalPhrases("first order")).not.toBe(canonicalPhrases("second order"));
    expect(canonicalPhrases("order 1")).not.toBe(canonicalPhrases("order 12"));
  });
});

describe("genotypes keep their case", () => {
  it("credits a cross written without 'the parents are', and the offspring it gives", () => {
    const p = part(
      ["Let S be striped and s be plain; parents are Ss × Ss", "The offspring genotypes are SS, Ss, Ss and ss, so one quarter are plain"],
      "Ss × Ss gives SS, Ss, Ss and ss. The predicted proportion with plain scales is 1/4 or 25%.",
      2,
    );
    expect(awarded(p, p.modelAnswer!)).toBe(2);
  });

  it("does not credit the wrong parents because the letters match", () => {
    expect(pointCoverage("Cross is Aa × Aa", "Cross is aa × aa")).toBeLessThan(0.5);
    expect(pointCoverage("Cross is Aa × Aa", "The cross is AA × aa")).toBeLessThan(0.5);
    expect(genotypeWords("Aa × Aa")).not.toBe(genotypeWords("AA × AA"));
    expect(genotypeWords("This is an apple")).toBe("This is an apple");
  });
});

describe("either-or in a scheme point", () => {
  it("is met by any one alternative", () => {
    expect(alternativesOf("iodine/ki")).toEqual(["iodine", "ki"]);
    expect(pointCoverage("Add iodine/KI solution", "Add iodine in potassium iodide")).toBeGreaterThanOrEqual(0.5);
    expect(pointCoverage("Pioneer species / lichens", "Lichens and mosses colonise bare rock")).toBeGreaterThanOrEqual(0.5);
  });

  it("is not read into units or derivatives", () => {
    expect(alternativesOf("mol/dm")).toBeNull();
    expect(alternativesOf("dy/dx")).toBeNull();
    expect(pointCoverage("Pioneer species / lichens", "Mosses colonise bare rock")).toBeLessThan(0.5);
  });
});

describe("the polarity veto", () => {
  it("reads a comparison stated from the other side as the same comparison", () => {
    const p = part(["A plot dominated by one species is less diverse than one with balanced abundances"],
      "The restored plots may have greater biodiversity because their individuals are distributed more evenly rather than being dominated by one species.", 1);
    expect(awarded(p, p.modelAnswer!)).toBe(1);
    // Still reversed: the dominated plot called more diverse.
    expect(awarded(p, "A plot dominated by one species is more diverse than one with balanced abundances.")).toBe(0);
  });

  it("ignores an opposite word about a different quantity in another clause of a longer answer", () => {
    const p = part(["Less phosphate reduces algal growth and the risk of oxygen depletion"],
      "Removing phosphate reduces excessive algal growth and oxygen depletion. Better oxygen conditions allow more insect larvae to survive, providing more food for small fish.", 1);
    expect(awarded(p, p.modelAnswer!)).toBe(1);
    // The opposite word on the point's own quantity still vetoes.
    expect(awarded(p, "More phosphate reduces algal growth and the risk of oxygen depletion in the water because of the extra nutrients here.")).toBe(0);
  });

  it("reads the forward reaction being exothermic as the reverse being endothermic", () => {
    const p = part(["Increasing temperature favours the endothermic reverse reaction, reducing ammonia yield"],
      "Since the forward reaction is exothermic, higher temperature favours the reverse reaction and lowers the equilibrium ammonia yield.", 1);
    expect(awarded(p, p.modelAnswer!)).toBe(1);
    expect(awarded(p, "Increasing temperature favours the exothermic reverse reaction, reducing ammonia yield.")).toBe(0);
  });

  it("an answer weighing both directions in turn has not reversed the relationship", () => {
    const p = part(["A higher temperature increases the rate but lowers the yield"],
      "A lower temperature would give a higher yield but too slow a rate. A higher temperature increases the rate but lowers the yield.", 1);
    expect(awarded(p, p.modelAnswer!)).toBe(1);
    expect(awarded(p, "A lower temperature increases the rate but lowers the yield.")).toBe(0);
  });

  it("a direction word inside another word is not a direction", () => {
    const p = part(["The solution becomes colourless and more dilute"], "", 1);
    expect(awarded(p, "The solution turns colourless as it becomes more dilute")).toBe(1);
  });
});

describe("caps that took marks from correct answers", () => {
  it("the recitation cap reads words, not the numbers of a correct calculation", () => {
    const p = part(["Kc = [C]/([A][B])", "Kc = 0.40/(0.20 × 0.10)", "Kc = 20 dm³ mol⁻¹"], "Kc = 0.40/(0.20 × 0.10) = 20 dm³ mol⁻¹.", 3);
    expect(awarded(p, "Kc = 0.40/(0.20 × 0.10) = 20 dm³ mol⁻¹.")).toBe(3);
  });

  it("still caps a recited prose scheme", () => {
    const scheme = [
      "Concentration of reactants decreases over time",
      "Fewer successful collisions happen per second",
      "So the rate of reaction decreases",
    ];
    const p = part(scheme, "As the reaction proceeds the reactants are used up, so particles collide less often and the reaction slows.", 3);
    expect(awarded(p, scheme.join(", ") + ".")).toBeLessThan(3);
  });

  it("compact working is not a two-word answer", () => {
    const p = part(["u_2=5", "u_3=17"], "u_2=3(1)+2=5, u_3=3(5)+2=17.", 2);
    expect(awarded(p, "u_2=3(1)+2=5, u_3=3(5)+2=17.")).toBe(2);
    expect(awarded(p, "concentration decreases")).toBeLessThanOrEqual(1);
  });

  it("'concentration' is not a self-reference, but a real retraction still is", () => {
    const p = part(["The system opposes the temperature increase", "The endothermic reverse reaction is favoured", "The concentration of the coloured product decreases"],
      "Increasing temperature favours the endothermic reverse reaction because the equilibrium opposes the temperature change. The coloured product concentration therefore decreases and the mixture becomes paler.", 3);
    expect(awarded(p, p.modelAnswer!)).toBe(3);
    expect(awarded(p, `${p.modelAnswer} However, in the final analysis the opposite holds true and the initial statement is reversed.`)).toBeLessThan(3);
  });
});

describe("a root or π in the working, not the result", () => {
  it("credits the stated result without the √, and only the result", () => {
    expect(numericMatch("Magnitude = √(3² + 4²) = 5 km", "The displacement is 3i + 4j km, with magnitude 5 km.")).toBe(true);
    expect(numericMatch("Magnitude = √(3² + 4²) = 5 km", "The displacement is 3i + 4j km, with magnitude 7 km.")).toBe(false);
    // A √ in the result itself is still required.
    expect(numericMatch("x = 2 ± √3", "x = 2")).toBe(false);
  });
});

describe("the scaffolding guard accepts another form of the distinctive word", () => {
  it("'symmetrical' for 'symmetry', never a word that only starts alike", () => {
    const p = part(["BF₃ has three bonding pairs and is trigonal planar", "Its bond dipoles cancel by symmetry", "NH₃ has a lone pair and a net dipole"],
      "", 3);
    expect(awarded(p, "BF₃ has three bonding pairs and is trigonal planar; its symmetrical bond dipoles cancel. NH₃ has a lone pair and a net dipole.")).toBe(3);
  });
});
