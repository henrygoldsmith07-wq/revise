import { defineQuestions } from "./authoring";

const S = "wjec-alevel-chemistry";
const meta = {
  subjectId: S,
  verification: "checked" as const,
  reviewer: "authored/WJEC-2024-v1-review",
  lastChecked: "2026-10-29",
  specVersion: "2024-1.0",
};

/**
 * Chemistry Unit 3 depth pack (Physical and Inorganic Chemistry): electrochemical
 * cells and p-block. Each had two questions, so unit mocks and missions repeated.
 * Every item is original, with one awardable scheme point per mark.
 */
export const wjecChemistryAsDepthQuestions = defineQuestions([
  {
    ...meta,
    slug: "chem-u3-standard-electrode-potential",
    topics: ["electrochemical-cells"],
    stem: "Electrode potentials are measured relative to the standard hydrogen electrode.",
    difficulty: 2,
    aos: ["AO1"],
    parts: [
      {
        prompt: "Define the standard electrode potential of a half-cell.",
        marks: 2,
        aos: ["AO1"],
        scheme: [
          "The e.m.f. of a cell made of the half-cell connected to a standard hydrogen electrode",
          "with all solutions at 1.00 mol dm⁻³ and gases at 100 kPa, measured at 298 K",
        ],
        answer: "The e.m.f. of a cell made of the half-cell connected to a standard hydrogen electrode; with all solutions at 1.00 mol dm⁻³ and gases at 100 kPa, measured at 298 K.",
        specPointIds: [`${S}.electrochemical-cells.sp-01`],
        learningClaims: ["define standard electrode potential"],
      },
      {
        prompt: "Describe the standard hydrogen electrode.",
        marks: 3,
        aos: ["AO1"],
        scheme: [
          "A platinum electrode in contact with H⁺(aq) of concentration 1.00 mol dm⁻³",
          "Hydrogen gas bubbled over the platinum at 100 kPa",
          "Temperature held at 298 K, and its potential is defined as 0.00 V",
        ],
        answer: "A platinum electrode in contact with H⁺(aq) of concentration 1.00 mol dm⁻³; Hydrogen gas bubbled over the platinum at 100 kPa; Temperature held at 298 K, and its potential is defined as 0.00 V.",
        specPointIds: [`${S}.electrochemical-cells.sp-01`],
        learningClaims: ["describe the standard hydrogen electrode"],
      },
    ],
  },
  {
    ...meta,
    slug: "chem-u3-zinc-copper-cell",
    topics: ["electrochemical-cells"],
    stem: "A standard cell is set up from a zinc half-cell and a copper half-cell. E° (Zn²⁺/Zn) = −0.76 V and E° (Cu²⁺/Cu) = +0.34 V.",
    difficulty: 3,
    aos: ["AO2"],
    parts: [
      {
        prompt: "Calculate the standard cell potential.",
        marks: 3,
        aos: ["AO2"],
        scheme: [
          "E°cell = E°(positive electrode) − E°(negative electrode)",
          "E°cell = +0.34 − (−0.76)",
          "E°cell = +1.10 V",
        ],
        answer: "E°cell = E°(positive electrode) − E°(negative electrode); E°cell = +0.34 − (−0.76); E°cell = +1.10 V.",
        specPointIds: [`${S}.electrochemical-cells.sp-02`],
        learningClaims: ["calculate E cell from electrode potentials"],
      },
      {
        prompt: "State which electrode is the negative terminal and write the half-equation occurring there.",
        marks: 2,
        aos: ["AO1", "AO2"],
        scheme: [
          "Zinc is the negative electrode (more negative E°, so electrons are released there)",
          "Zn → Zn²⁺ + 2e⁻",
        ],
        answer: "Zinc is the negative electrode (more negative E°, so electrons are released there); Zn → Zn²⁺ + 2e⁻.",
        specPointIds: [`${S}.electrochemical-cells.sp-03`],
        learningClaims: ["identify the negative terminal and its half-equation"],
      },
    ],
  },
  {
    ...meta,
    slug: "chem-u3-iron-three-halide-feasibility",
    topics: ["electrochemical-cells"],
    stem: "Use the data: E° (Fe³⁺/Fe²⁺) = +0.77 V, E° (I₂/I⁻) = +0.54 V, E° (Br₂/Br⁻) = +1.07 V.",
    difficulty: 3,
    aos: ["AO2", "AO3"],
    parts: [
      {
        prompt: "Show whether Fe³⁺(aq) ions can oxidise iodide ions to iodine under standard conditions.",
        marks: 3,
        aos: ["AO2"],
        scheme: [
          "E°cell = +0.77 − (+0.54)",
          "E°cell = +0.23 V, which is positive",
          "So the reaction is feasible: 2Fe³⁺ + 2I⁻ → 2Fe²⁺ + I₂",
        ],
        answer: "E°cell = +0.77 − (+0.54); E°cell = +0.23 V, which is positive; So the reaction is feasible: 2Fe³⁺ + 2I⁻ → 2Fe²⁺ + I₂.",
        specPointIds: [`${S}.electrochemical-cells.sp-02`],
        learningClaims: ["predict feasibility of a redox reaction from E\u00b0 values"],
      },
      {
        prompt: "Show whether Fe³⁺(aq) ions can oxidise bromide ions to bromine under standard conditions.",
        marks: 3,
        aos: ["AO2"],
        scheme: [
          "E°cell = +0.77 − (+1.07)",
          "E°cell = −0.30 V, which is negative",
          "So the reaction is not feasible under standard conditions",
        ],
        answer: "E°cell = +0.77 − (+1.07); E°cell = −0.30 V, which is negative; So the reaction is not feasible under standard conditions.",
        specPointIds: [`${S}.electrochemical-cells.sp-02`],
        learningClaims: ["predict feasibility of a redox reaction from E\u00b0 values"],
      },
    ],
  },
  {
    ...meta,
    slug: "chem-u3-salt-bridge-roles",
    topics: ["electrochemical-cells"],
    stem: "A student connects a zinc half-cell and a copper half-cell with a wire and a voltmeter. A strip of filter paper soaked in potassium nitrate solution joins the two beakers.",
    difficulty: 3,
    aos: ["AO1", "AO2"],
    parts: [
      {
        prompt: "Explain the role of the salt bridge.",
        marks: 3,
        aos: ["AO1", "AO2"],
        scheme: [
          "It completes the circuit by allowing ions to move between the half-cells",
          "This balances the charge build-up in each beaker so current can keep flowing",
          "The ions are unreactive towards the half-cell solutions (nitrate and potassium ions do not react)",
        ],
        answer: "It completes the circuit by allowing ions to move between the half-cells; This balances the charge build-up in each beaker so current can keep flowing; The ions are unreactive towards the half-cell solutions (nitrate and potassium ions do not react).",
        specPointIds: [`${S}.electrochemical-cells.sp-03`],
        learningClaims: ["explain the role of the salt bridge"],
      },
    ],
  },
  {
    ...meta,
    slug: "chem-u3-cell-diagram-magnesium-silver",
    topics: ["electrochemical-cells"],
    stem: "E° (Mg²⁺/Mg) = −2.37 V and E° (Ag⁺/Ag) = +0.80 V.",
    difficulty: 3,
    aos: ["AO1", "AO2"],
    parts: [
      {
        prompt: "Write the cell diagram for the cell made from these two half-cells, with the negative electrode on the left.",
        marks: 2,
        aos: ["AO1"],
        scheme: [
          "Mg(s) | Mg²⁺(aq) || Ag⁺(aq) | Ag(s)",
          "The single bar shows a phase boundary and the double bar the salt bridge",
        ],
        answer: "Mg(s) | Mg²⁺(aq) || Ag⁺(aq) | Ag(s); The single bar shows a phase boundary and the double bar the salt bridge.",
        specPointIds: [`${S}.electrochemical-cells.sp-03`],
        learningClaims: ["write a conventional cell diagram"],
      },
      {
        prompt: "Calculate E°cell and state the overall equation.",
        marks: 2,
        aos: ["AO2"],
        scheme: [
          "E°cell = +0.80 − (−2.37) = +3.17 V",
          "Mg + 2Ag⁺ → Mg²⁺ + 2Ag",
        ],
        answer: "E°cell = +0.80 − (−2.37) = +3.17 V; Mg + 2Ag⁺ → Mg²⁺ + 2Ag.",
        specPointIds: [`${S}.electrochemical-cells.sp-02`],
        learningClaims: ["calculate E cell and write the overall equation"],
      },
    ],
  },
  {
    ...meta,
    slug: "chem-u3-measure-cell-potential-plan",
    topics: ["electrochemical-cells"],
    stem: "A student plans to measure the potential of a Zn²⁺/Zn half-cell against a Cu²⁺/Cu half-cell as accurately as possible.",
    difficulty: 4,
    aos: ["AO3"],
    parts: [
      {
        prompt: "Describe how the student should set up the measurement so the reading is close to the standard value.",
        marks: 4,
        aos: ["AO3"],
        scheme: [
          "Use 1.00 mol dm⁻³ solutions of Zn²⁺ and Cu²⁺ ions at about 298 K",
          "Clean the metal electrodes (for example with emery paper) before use",
          "Use a high-resistance voltmeter so almost no current flows",
          "Join the half-cells with a fresh salt bridge and take the steady reading",
        ],
        answer: "Use 1.00 mol dm⁻³ solutions of Zn²⁺ and Cu²⁺ ions at about 298 K; Clean the metal electrodes (for example with emery paper) before use; Use a high-resistance voltmeter so almost no current flows; Join the half-cells with a fresh salt bridge and take the steady reading.",
        specPointIds: [`${S}.electrochemical-cells.sp-04`],
        learningClaims: ["plan a fair measurement of cell potential"],
      },
    ],
  },
  {
    ...meta,
    slug: "chem-u3-eo-predicts-not-rate",
    topics: ["electrochemical-cells"],
    stem: "The data book gives E° (MnO₄⁻/Mn²⁺) = +1.51 V and E° (Cl₂/Cl⁻) = +1.36 V, so manganate(VII) ions should oxidise chloride ions.",
    difficulty: 4,
    aos: ["AO2", "AO3"],
    parts: [
      {
        prompt: "Suggest two reasons why a feasible E°cell does not guarantee that the reaction is seen in the laboratory.",
        marks: 2,
        aos: ["AO3"],
        scheme: [
          "E° values show only thermodynamic feasibility, not the rate; the activation energy may be very high so the reaction is too slow",
          "Conditions in the laboratory are not standard (different concentration, temperature or pressure) so the actual E differs from E°",
        ],
        answer: "E° values show only thermodynamic feasibility, not the rate; the activation energy may be very high so the reaction is too slow; Conditions in the laboratory are not standard (different concentration, temperature or pressure) so the actual E differs from E°.",
        specPointIds: [`${S}.electrochemical-cells.sp-04`],
        learningClaims: ["evaluate the limits of E\u00b0 predictions"],
      },
    ],
  },
  {
    ...meta,
    slug: "chem-u3-period3-radius-trend",
    topics: ["p-block"],
    stem: "The atomic radii of the period 3 elements decrease from sodium to chlorine.",
    difficulty: 3,
    aos: ["AO1", "AO2"],
    parts: [
      {
        prompt: "Explain this trend.",
        marks: 3,
        aos: ["AO1", "AO2"],
        scheme: [
          "Nuclear charge (number of protons) increases from sodium to chlorine",
          "Electrons are added to the same shell so shielding stays about the same",
          "The outer electrons are attracted more strongly, pulling the shell closer to the nucleus",
        ],
        answer: "Nuclear charge (number of protons) increases from sodium to chlorine; Electrons are added to the same shell so shielding stays about the same; The outer electrons are attracted more strongly, pulling the shell closer to the nucleus.",
        specPointIds: [`${S}.p-block.sp-01`],
        learningClaims: ["explain the radius trend across period 3"],
      },
    ],
  },
  {
    ...meta,
    slug: "chem-u3-ionisation-energy-dips",
    topics: ["p-block"],
    stem: "The first ionisation energy generally increases across period 3, but there are dips at aluminium and at sulfur.",
    difficulty: 4,
    aos: ["AO1", "AO2"],
    parts: [
      {
        prompt: "Explain the fall in first ionisation energy from magnesium to aluminium.",
        marks: 2,
        aos: ["AO1", "AO2"],
        scheme: [
          "The outer electron in aluminium is in a 3p sub-shell",
          "3p is higher in energy and is shielded by the 3s electrons so is easier to remove than a 3s electron",
        ],
        answer: "The outer electron in aluminium is in a 3p sub-shell; 3p is higher in energy and is shielded by the 3s electrons so is easier to remove than a 3s electron.",
        specPointIds: [`${S}.p-block.sp-01`],
        learningClaims: ["explain the Mg to Al ionisation energy dip"],
      },
      {
        prompt: "Explain the fall in first ionisation energy from phosphorus to sulfur.",
        marks: 2,
        aos: ["AO1", "AO2"],
        scheme: [
          "In sulfur two electrons share one 3p orbital (paired electrons)",
          "Repulsion between the paired electrons makes one easier to remove",
        ],
        answer: "In sulfur two electrons share one 3p orbital (paired electrons); Repulsion between the paired electrons makes one easier to remove.",
        specPointIds: [`${S}.p-block.sp-01`],
        learningClaims: ["explain the P to S ionisation energy dip"],
      },
    ],
  },
  {
    ...meta,
    slug: "chem-u3-period3-oxides",
    topics: ["p-block"],
    stem: "Period 3 oxides react with water to give solutions that range from strongly alkaline to strongly acidic.",
    difficulty: 3,
    aos: ["AO1", "AO2"],
    parts: [
      {
        prompt: "Write the equation for sodium oxide reacting with water and state the approximate pH of the solution formed.",
        marks: 2,
        aos: ["AO1"],
        scheme: [
          "Na₂O + H₂O → 2NaOH",
          "The solution is strongly alkaline (about pH 14)",
        ],
        answer: "Na₂O + H₂O → 2NaOH; The solution is strongly alkaline (about pH 14).",
        specPointIds: [`${S}.p-block.sp-02`],
        learningClaims: ["write equations for oxide reactions with water"],
      },
      {
        prompt: "Write the equation for phosphorus(V) oxide reacting with water and relate the acid-base behaviour to the bonding of the oxide.",
        marks: 2,
        aos: ["AO1", "AO2"],
        scheme: [
          "P₄O₁₀ + 6H₂O → 4H₃PO₄",
          "Sodium oxide is ionic (contains O²⁻ which accepts H⁺), whereas the oxide of a non-metal is covalent and forms an acidic solution",
        ],
        answer: "P₄O₁₀ + 6H₂O → 4H₃PO₄; Sodium oxide is ionic (contains O²⁻ which accepts H⁺), whereas the oxide of a non-metal is covalent and forms an acidic solution.",
        specPointIds: [`${S}.p-block.sp-02`],
        learningClaims: ["relate oxide acid-base behaviour to bonding"],
      },
      {
        prompt: "Explain, using equations, why aluminium oxide is described as amphoteric.",
        marks: 2,
        aos: ["AO1", "AO2"],
        scheme: [
          "It reacts with acid to give a salt and water: Al₂O₃ + 6HCl → 2AlCl₃ + 3H₂O",
          "It also reacts with alkali to give a salt (aluminate) and water: Al₂O₃ + 2NaOH + 3H₂O → 2NaAl(OH)₄",
        ],
        answer: "It reacts with acid to give a salt and water: Al₂O₃ + 6HCl → 2AlCl₃ + 3H₂O; It also reacts with alkali to give a salt (aluminate) and water: Al₂O₃ + 2NaOH + 3H₂O → 2NaAl(OH)₄.",
        specPointIds: [`${S}.p-block.sp-02`],
        learningClaims: ["explain amphoteric behaviour of aluminium oxide"],
      },
    ],
  },
  {
    ...meta,
    slug: "chem-u3-chlorine-disproportionation",
    topics: ["p-block"],
    stem: "Chlorine reacts with cold dilute sodium hydroxide solution: Cl₂ + 2NaOH → NaCl + NaClO + H₂O.",
    difficulty: 4,
    aos: ["AO1", "AO2"],
    parts: [
      {
        prompt: "Give the oxidation number of chlorine in Cl₂, NaCl and NaClO.",
        marks: 2,
        aos: ["AO1"],
        scheme: [
          "Cl₂ is 0",
          "NaCl is −1 and NaClO is +1",
        ],
        answer: "Cl₂ is 0; NaCl is −1 and NaClO is +1.",
        specPointIds: [`${S}.p-block.sp-03`],
        learningClaims: ["assign oxidation numbers in chlorine compounds"],
      },
      {
        prompt: "Explain why this reaction is called disproportionation and write the half-equation for the oxidation.",
        marks: 2,
        aos: ["AO1", "AO2"],
        scheme: [
          "The same element, chlorine, is both oxidised (0 to +1) and reduced (0 to −1)",
          "Oxidation: Cl₂ + 4OH⁻ → 2ClO⁻ + 2H₂O + 2e⁻",
        ],
        answer: "The same element, chlorine, is both oxidised (0 to +1) and reduced (0 to −1); Oxidation: Cl₂ + 4OH⁻ → 2ClO⁻ + 2H₂O + 2e⁻.",
        specPointIds: [`${S}.p-block.sp-03`],
        learningClaims: ["explain disproportionation using half-equations"],
      },
    ],
  },
  {
    ...meta,
    slug: "chem-u3-period3-melting-points",
    topics: ["p-block"],
    stem: "Melting points of some period 3 elements: sodium 371 K, silicon 1687 K, phosphorus (P₄) 317 K, sulfur (S₈) 388 K.",
    difficulty: 4,
    aos: ["AO1", "AO2"],
    parts: [
      {
        prompt: "Explain the differences in melting point between these elements in terms of structure and bonding.",
        marks: 4,
        aos: ["AO1", "AO2"],
        scheme: [
          "Sodium has metallic bonding, the attraction between cations and delocalised electrons, giving a moderate melting point",
          "Silicon has a giant covalent lattice with many strong covalent bonds, so it needs a lot of energy to break and melts at a very high temperature",
          "Phosphorus and sulfur are simple molecular with weak London forces between molecules, so they melt at low temperatures",
          "Sulfur (S₈) melts higher than phosphorus (P₄) because it has more electrons so stronger London forces",
        ],
        answer: "Sodium has metallic bonding, the attraction between cations and delocalised electrons, giving a moderate melting point; Silicon has a giant covalent lattice with many strong covalent bonds, so it needs a lot of energy to break and melts at a very high temperature; Phosphorus and sulfur are simple molecular with weak London forces between molecules, so they melt at low temperatures; Sulfur (S₈) melts higher than phosphorus (P₄) because it has more electrons so stronger London forces.",
        specPointIds: [`${S}.p-block.sp-04`],
        learningClaims: ["relate physical properties to structure"],
      },
    ],
  },
]);
