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
 * Pass 102 adds Unit 2 (energetics, kinetics, equilibria) items below.
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
  {
    ...meta,
    slug: "chem-u2-hess-formation-methane",
    topics: ["energetics"],
    stem: "Standard enthalpy changes of combustion: C(s) = −394 kJ mol⁻¹, H₂(g) = −286 kJ mol⁻¹, CH₄(g) = −890 kJ mol⁻¹.",
    difficulty: 3,
    aos: ["AO2"],
    parts: [
      {
        prompt: "Draw the Hess cycle and use it to calculate the standard enthalpy change of formation of methane.",
        marks: 3,
        aos: ["AO2"],
        scheme: [
          "Cycle (or equation) links C + 2H₂ and CH₄ to CO₂ and H₂O via the combustion routes",
          "ΔHf = ΔHc(C) + 2 × ΔHc(H₂) − ΔHc(CH₄) = −394 + 2(−286) − (−890)",
          "ΔHf = −76 kJ mol⁻¹"
],
        answer: "Cycle (or equation) links C + 2H₂ and CH₄ to CO₂ and H₂O via the combustion routes; ΔHf = ΔHc(C) + 2 × ΔHc(H₂) − ΔHc(CH₄) = −394 + 2(−286) − (−890); ΔHf = −76 kJ mol⁻¹.",
        specPointIds: [`${S}.energetics.sp-02`],
        learningClaims: ["use Hess cycles with combustion data"],
      },
    ],
  },
  {
    ...meta,
    slug: "chem-u2-bond-enthalpy-methane-combustion",
    topics: ["energetics"],
    stem: "Mean bond enthalpies in kJ mol⁻¹: C–H 413, O=O 498, C=O 805, O–H 464. Methane burns: CH₄(g) + 2O₂(g) → CO₂(g) + 2H₂O(g).",
    difficulty: 3,
    aos: ["AO2", "AO3"],
    parts: [
      {
        prompt: "Calculate the enthalpy change for the reaction using bond enthalpies.",
        marks: 3,
        aos: ["AO2"],
        scheme: [
          "Bonds broken = 4(413) + 2(498) = 2648 kJ",
          "Bonds formed = 2(805) + 4(464) = 3466 kJ",
          "ΔH = broken − formed = −818 kJ mol⁻¹"
],
        answer: "Bonds broken = 4(413) + 2(498) = 2648 kJ; Bonds formed = 2(805) + 4(464) = 3466 kJ; ΔH = broken − formed = −818 kJ mol⁻¹.",
        specPointIds: [`${S}.energetics.sp-03`],
        learningClaims: ["calculate enthalpy change from bond enthalpies"],
      },
      {
        prompt: "Explain why a value from bond enthalpies only approximates the true enthalpy change.",
        marks: 2,
        aos: ["AO3"],
        scheme: [
          "Bond enthalpies are mean values averaged over many different compounds",
          "They apply to gaseous species, so they ignore the enthalpy of vaporisation of liquid water"
],
        answer: "Bond enthalpies are mean values averaged over many different compounds; They apply to gaseous species, so they ignore the enthalpy of vaporisation of liquid water.",
        specPointIds: [`${S}.energetics.sp-04`],
        learningClaims: ["explain why bond enthalpy values are approximate"],
      },
    ],
  },
  {
    ...meta,
    slug: "chem-u2-calorimetry-neutralisation",
    topics: ["energetics"],
    stem: "In a polystyrene cup, 50.0 g of water rose in temperature by 6.5 K when 0.0200 mol of a reactant was dissolved. The specific heat capacity of water is 4.18 J g⁻¹ K⁻¹.",
    difficulty: 3,
    aos: ["AO2", "AO3"],
    parts: [
      {
        prompt: "Calculate the enthalpy change of the reaction in kJ mol⁻¹ to three significant figures.",
        marks: 3,
        aos: ["AO2"],
        scheme: [
          "q = m c ΔT = 50.0 × 4.18 × 6.5 = 1358.5 J",
          "Energy per mole = 1.3585 kJ ÷ 0.0200 mol",
          "ΔH = −67.9 kJ mol⁻¹ (negative because the temperature rose)"
],
        answer: "q = m c ΔT = 50.0 × 4.18 × 6.5 = 1358.5 J; Energy per mole = 1.3585 kJ ÷ 0.0200 mol; ΔH = −67.9 kJ mol⁻¹ (negative because the temperature rose).",
        specPointIds: [`${S}.energetics.sp-05`],
        learningClaims: ["calculate enthalpy change from calorimetry"],
      },
      {
        prompt: "Suggest one source of error in this experiment and its effect on the result.",
        marks: 2,
        aos: ["AO3"],
        scheme: [
          "Heat is lost to the surroundings, or absorbed by the cup and thermometer",
          "so the measured temperature rise is too small and the ΔH appears less exothermic than the true value"
],
        answer: "Heat is lost to the surroundings, or absorbed by the cup and thermometer; so the measured temperature rise is too small and the ΔH appears less exothermic than the true value.",
        specPointIds: [`${S}.energetics.sp-05`],
        learningClaims: ["evaluate calorimetry errors"],
      },
    ],
  },
  {
    ...meta,
    slug: "chem-u2-maxwell-boltzmann-temperature",
    topics: ["kinetics"],
    stem: "The Maxwell-Boltzmann distribution shows how molecular energies are spread in a gas at a fixed temperature.",
    difficulty: 3,
    aos: ["AO1", "AO2"],
    parts: [
      {
        prompt: "Sketch-describe how the curve changes when the temperature is raised, and explain why the rate increases.",
        marks: 3,
        aos: ["AO1", "AO2"],
        scheme: [
          "The peak moves to the right and is lower, but the total area under the curve stays the same",
          "A greater proportion of molecules have energy equal to or greater than the activation energy",
          "so a greater fraction of collisions are successful and the rate rises"
],
        answer: "The peak moves to the right and is lower, but the total area under the curve stays the same; A greater proportion of molecules have energy equal to or greater than the activation energy; so a greater fraction of collisions are successful and the rate rises.",
        specPointIds: [`${S}.kinetics.sp-03`],
        learningClaims: ["interpret Maxwell-Boltzmann curves"],
      },
    ],
  },
  {
    ...meta,
    slug: "chem-u2-catalyst-activation-energy",
    topics: ["kinetics"],
    stem: "A catalyst is added to a reaction mixture and the rate increases at constant temperature.",
    difficulty: 2,
    aos: ["AO1", "AO2"],
    parts: [
      {
        prompt: "Explain how the catalyst increases the rate.",
        marks: 3,
        aos: ["AO1", "AO2"],
        scheme: [
          "It provides an alternative reaction pathway",
          "with a lower activation energy",
          "so a greater proportion of molecules have energy at or above it, and the catalyst is not used up"
],
        answer: "It provides an alternative reaction pathway; with a lower activation energy; so a greater proportion of molecules have energy at or above it, and the catalyst is not used up.",
        specPointIds: [`${S}.kinetics.sp-04`],
        learningClaims: ["explain catalysis in terms of activation energy"],
      },
    ],
  },
  {
    ...meta,
    slug: "chem-u2-rate-equation-from-data",
    topics: ["kinetics"],
    stem: "Initial rates were measured for A + B → products. Experiment 1: [A] 0.10, [B] 0.10 mol dm⁻³, rate 2.0 × 10⁻³ mol dm⁻³ s⁻¹. Experiment 2: [A] 0.20, [B] 0.10, rate 8.0 × 10⁻³. Experiment 3: [A] 0.10, [B] 0.20, rate 4.0 × 10⁻³.",
    difficulty: 4,
    aos: ["AO2"],
    parts: [
      {
        prompt: "Deduce the order with respect to A and with respect to B.",
        marks: 2,
        aos: ["AO2"],
        scheme: [
          "Doubling [A] quadruples the rate, so second order in A",
          "Doubling [B] doubles the rate, so first order in B"
],
        answer: "Doubling [A] quadruples the rate, so second order in A; Doubling [B] doubles the rate, so first order in B.",
        specPointIds: [`${S}.kinetics.sp-05`],
        learningClaims: ["deduce orders from initial rates data"],
      },
      {
        prompt: "Write the rate equation and calculate k, including its units.",
        marks: 3,
        aos: ["AO2"],
        scheme: [
          "rate = k[A]²[B]",
          "k = 2.0 × 10⁻³ ÷ (0.10² × 0.10) = 2.0",
          "units dm⁶ mol⁻² s⁻¹"
],
        answer: "rate = k[A]²[B]; k = 2.0 × 10⁻³ ÷ (0.10² × 0.10) = 2.0; units dm⁶ mol⁻² s⁻¹.",
        specPointIds: [`${S}.kinetics.sp-05`],
        learningClaims: ["calculate a rate constant with units"],
      },
    ],
  },
  {
    ...meta,
    slug: "chem-u2-kc-ammonia",
    topics: ["equilibria"],
    stem: "At equilibrium in a closed vessel at constant temperature the concentrations are N₂ 0.50, H₂ 1.50 and NH₃ 0.40 mol dm⁻³ for N₂(g) + 3H₂(g) ⇌ 2NH₃(g).",
    difficulty: 4,
    aos: ["AO2"],
    parts: [
      {
        prompt: "Write the expression for Kc and calculate its value with units.",
        marks: 3,
        aos: ["AO2"],
        scheme: [
          "Kc = [NH₃]² ÷ ([N₂][H₂]³)",
          "Kc = 0.40² ÷ (0.50 × 1.50³)",
          "Kc = 0.0948 dm⁶ mol⁻²"
],
        answer: "Kc = [NH₃]² ÷ ([N₂][H₂]³); Kc = 0.40² ÷ (0.50 × 1.50³); Kc = 0.0948 dm⁶ mol⁻².",
        specPointIds: [`${S}.equilibria.sp-03`],
        learningClaims: ["write Kc and calculate it with units"],
      },
    ],
  },
  {
    ...meta,
    slug: "chem-u2-haber-conditions",
    topics: ["equilibria"],
    stem: "The Haber process is exothermic: N₂(g) + 3H₂(g) ⇌ 2NH₃(g), ΔH = −92 kJ mol⁻¹.",
    difficulty: 3,
    aos: ["AO2", "AO3"],
    parts: [
      {
        prompt: "Predict and explain the effect of raising the temperature on the equilibrium yield and on Kc.",
        marks: 2,
        aos: ["AO2"],
        scheme: [
          "The equilibrium moves left (the endothermic direction), so the yield of ammonia falls",
          "Kc decreases because it depends on temperature"
],
        answer: "The equilibrium moves left (the endothermic direction), so the yield of ammonia falls; Kc decreases because it depends on temperature.",
        specPointIds: [`${S}.equilibria.sp-02`],
        learningClaims: ["predict temperature effects on equilibrium"],
      },
      {
        prompt: "Explain why raising the pressure increases the yield.",
        marks: 2,
        aos: ["AO2"],
        scheme: [
          "Four moles of gas on the left and two on the right",
          "so the equilibrium moves right to reduce the pressure"
],
        answer: "Four moles of gas on the left and two on the right; so the equilibrium moves right to reduce the pressure.",
        specPointIds: [`${S}.equilibria.sp-02`],
        learningClaims: ["predict pressure effects on equilibrium"],
      },
      {
        prompt: "Explain why a moderate temperature and a catalyst are used industrially.",
        marks: 2,
        aos: ["AO3"],
        scheme: [
          "A low temperature gives a higher yield but too slow a rate, so a compromise temperature is chosen",
          "The catalyst speeds up the approach to equilibrium without changing the position"
],
        answer: "A low temperature gives a higher yield but too slow a rate, so a compromise temperature is chosen; The catalyst speeds up the approach to equilibrium without changing the position.",
        specPointIds: [`${S}.equilibria.sp-05`],
        learningClaims: ["explain industrial compromise conditions"],
      },
    ],
  },
]);
