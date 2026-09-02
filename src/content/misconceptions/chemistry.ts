import { defineMisconceptions } from "./authoring";

const SUBJECT_ID = "wjec-alevel-chemistry";

export const chemistryMisconceptions = defineMisconceptions([
  {
    slug: "3d-before-4s",
    subjectId: SUBJECT_ID,
    topics: ["atomic-structure"],
    statement:
      "Electron configurations are written with 3d before 4s, and transition metal ions lose their 4s electrons last.",
    explanation:
      "4s is filled before 3d but is written after it in full configurations, and it empties first when a transition metal forms a positive ion - once occupied, the 3d level drops below 4s in energy.",
    example: "For Fe3+ the student writes [Ar] 3d3 4s2, keeping the 4s electrons instead of removing them first.",
    correction:
      "Write Fe as [Ar] 4s2 3d6; on ionisation the 4s electrons are lost first, so Fe3+ is [Ar] 3d5.",
    tag: "terminology",
    ao: "AO1",
  },
  {
    slug: "ionisation-energy-state-symbols",
    subjectId: SUBJECT_ID,
    topics: ["atomic-structure"],
    statement:
      "The first ionisation energy equation only needs the element, the electron and the ion - state symbols are optional.",
    explanation:
      "State symbols are part of the definition: the atom is gaseous and the ion formed is gaseous and singly charged. They carry a mark, and omitting them loses it.",
    example: "The student writes Na -> Na+ + e- with no (g) symbols, losing the definition marks.",
    correction:
      "Always write the full equation Na(g) -> Na+(g) + e-, with state symbols and the +1 charge.",
    tag: "other",
    ao: "AO1",
  },
  {
    slug: "cm3-in-mole-equation",
    subjectId: "aqa-alevel-chemistry",
    topics: ["moles"],
    statement: "In n = cV I can mix units — volume in cm³ with concentration in mol dm⁻³ — and still get moles.",
    explanation:
      "The equation is only valid when V is in dm³, because the concentration c is per dm³. Substituting cm³ makes n a thousand times too large.",
    example: "25.0 cm³ of 0.1 mol dm⁻³ gives n = 0.1 × 25 = 2.5 mol instead of 0.0025 mol.",
    correction:
      "Convert first: 1 dm³ = 1000 cm³, so 25.0 cm³ = 0.0250 dm³, then n = 0.1 × 0.0250 = 0.00250 mol.",
    tag: "units",
    ao: "AO2",
  },
  {
    slug: "celsius-in-ideal-gas",
    subjectId: "aqa-alevel-chemistry",
    topics: ["moles"],
    statement: "pV = nRT works with temperatures in °C because the gas equation is just proportional.",
    explanation:
      "T is the absolute temperature in kelvin. °C is an offset scale, so substituting 25 instead of 298 K changes the calculated volume by a factor the equation does not describe.",
    example: "The student substitutes T = 25 into pV = nRT, then wonders why the gas volume does not match the measured value.",
    correction:
      "Convert °C to kelvin (K = °C + 273.15) before substituting, and keep the rest of the equation in Pa, m³ and mol.",
    tag: "units",
    ao: "AO2",
  },
  // --- AQA GCSE ---------------------------------------------------------
  {
    slug: "gcse-yield-from-excess",
    subjectId: "aqa-gcse-chemistry",
    topics: ["moles"],
    statement: "Percentage yield is the same whichever reactant I calculate it from, because the equation fixes the amounts.",
    explanation:
      "The limiting reagent decides how much product can form; the excess reagent is left over and makes no extra product. Basing the theoretical yield on the excess reagent inflates it, so the calculated percentage yield is too low.",
    example: "With 0.10 mol of A and 0.60 mol of B in a 1:1 reaction, the student bases the yield on B and reports a tiny percentage.",
    correction:
      "Identify the limiting reagent first, then calculate theoretical yield from that amount only.",
    tag: "method-skipped",
    ao: "AO2",
  },
  {
    slug: "gcse-celsius-ideal-gas",
    subjectId: "aqa-gcse-chemistry",
    topics: ["moles"],
    statement: "pV = nRT works with temperatures in °C because the gas equation is just proportional.",
    explanation:
      "T is the absolute temperature in kelvin. °C is an offset scale, so substituting 25 instead of 298 K changes the calculated volume by a factor the equation does not describe.",
    example: "The student substitutes T = 25 into pV = nRT, then wonders why the gas volume does not match the measured value.",
    correction:
      "Convert °C to kelvin (K = °C + 273.15) before substituting, and keep the rest of the equation in Pa, m³ and mol.",
    tag: "units",
    ao: "AO2",
  },
  {
    slug: "gcse-empirical-formula-percentages",
    subjectId: "aqa-gcse-chemistry",
    topics: ["moles"],
    statement: "Percentage masses by mass can be written into the empirical formula as they stand — no need to divide by atomic mass.",
    explanation:
      "Percentages are amounts in grams, not amounts of atoms. To find the mole ratio you divide each percentage by the relative atomic mass (Aᵣ) first, then reduce to the smallest whole-number ratio.",
    example: "40% C and 6.7% H by mass: the student writes C₄₀H₆.₇ instead of dividing by Aᵣ to find a 1 : 2 ratio.",
    correction:
      "Treat percentages as grams, divide each by Aᵣ, then divide by the smallest result to get the integer mole ratio.",
    tag: "method-skipped",
    ao: "AO2",
  },
  {
    slug: "gcse-exothermic-sign",
    subjectId: "aqa-gcse-chemistry",
    topics: ["energetics"],
    statement: "An exothermic reaction releases heat, so its enthalpy change ΔH is positive.",
    explanation:
      "ΔH is measured from the system's point of view: energy leaving the system is negative. Heat released to the surroundings therefore means ΔH < 0 — exothermic is negative, endothermic is positive.",
    example: "The student writes ΔH = +92 kJ for a combustion reaction because 'released feels positive'.",
    correction:
      "Think about the system, not the surroundings: energy given out → ΔH negative; energy taken in → ΔH positive.",
    tag: "conceptual",
    ao: "AO1",
  },
  {
    slug: "gcse-ionic-lattice-energy",
    subjectId: "aqa-gcse-chemistry",
    topics: ["bonding"],
    statement: "Molten ionic compounds do not conduct electricity because the bonds have not broken.",
    explanation:
      "In the molten state the giant ionic lattice has melted — ions are free to move and do carry current. It is the solid that cannot conduct: fixed lattice positions keep the ions from moving, not 'unbroken bonds'.",
    example: "The student says molten sodium chloride cannot conduct because 'the ionic bonds still hold it together'.",
    correction:
      "Conduction needs mobile charge carriers. Solid → ions fixed, no conduction; molten or aqueous → ions mobile, conduction happens.",
    tag: "conceptual",
    ao: "AO1",
  },
  // --- Edexcel & OCR boards ----------------------------------------------
  {
    slug: "edexcel-catalyst-yield",
    subjectId: "edexcel-alevel-chemistry",
    topics: ["equilibria"],
    statement: "Adding a catalyst shifts the equilibrium toward the products, increasing the yield.",
    explanation:
      "A catalyst lowers the activation energy of the forward and reverse reactions equally, so the forward and reverse rates speed up by the same factor. Equilibrium is reached faster, but its position — and therefore the yield — is untouched. Only temperature changes the value of K.",
    example: "In the Haber process question the student credits the iron catalyst with a higher yield of ammonia, when it only shortens the time to reach equilibrium.",
    correction:
      "A catalyst changes rate, never position: K is unchanged, yield is unchanged, equilibrium is simply reached sooner.",
    tag: "conceptual",
    ao: "AO2",
  },
  {
    slug: "edexcel-weak-acid-partial",
    subjectId: "edexcel-alevel-chemistry",
    topics: ["acids-bases"],
    statement: "A weak acid is one that is fully dissociated but present at a low concentration.",
    explanation:
      "Weak and concentrated are independent axes. Weak describes the degree of dissociation: a weak acid such as ethanoic acid only partially ionises, CH₃COOH ⇌ CH₃COO⁻ + H⁺, so [H⁺] must be found from Ka — [H⁺] = √(Ka × [HA]) — never read off the label concentration.",
    example: "The student computes the pH of 0.1 mol dm⁻³ ethanoic acid as pH = −log(0.1) = 1, when Ka ≈ 1.7 × 10⁻⁵ gives [H⁺] ≈ 1.3 × 10⁻³ and pH ≈ 2.9.",
    correction:
      "Strong/weak → extent of dissociation; concentrated/dilute → amount per volume. For a weak acid use [H⁺] = √(Ka × [HA]).",
    tag: "terminology",
    ao: "AO2",
  },
  {
    slug: "ocr-oxidation-gain",
    subjectId: "ocr-alevel-chemistry",
    topics: ["redox"],
    statement: "Oxidation means gaining electrons, because the oxidising agent supplies them.",
    explanation:
      "Oxidation is loss of electrons (OIL RIG): the species being oxidised loses electrons and its oxidation number rises. It is the oxidising agent that gains those electrons and is itself reduced — the agent and the substrate move in opposite directions.",
    example: "For Fe²⁺ → Fe³⁺ + e⁻ the student labels iron 'oxidised because it gained the oxidising agent's electrons', reversing the half-equation.",
    correction:
      "Follow the electrons: loss → oxidation (oxidation number up); gain → reduction. The oxidising agent gains electrons and is reduced itself.",
    tag: "terminology",
    ao: "AO1",
  },
  {
    slug: "ocr-base-oh-direct-ph",
    subjectId: "ocr-alevel-chemistry",
    topics: ["acids-bases"],
    statement: "For a strong base, pH = −log₁₀[OH⁻] — the hydroxide concentration goes straight into pH.",
    explanation:
      "pH is defined on hydrogen ions: pH = −log₁₀[H⁺]. For a base you first convert with Kw = [H⁺][OH⁻] = 1.0 × 10⁻¹⁴ at 298 K, so [H⁺] = Kw/[OH⁻], then take −log. Using [OH⁻] directly returns pOH, not pH.",
    example: "For 0.1 mol dm⁻³ NaOH the student computes pH = −log(0.1) = 1, when in fact [H⁺] = 10⁻¹³ and pH = 13.",
    correction:
      "Convert first, then log: [H⁺] = Kw/[OH⁻], then pH = −log₁₀[H⁺]. For 0.1 mol dm⁻³ NaOH that gives pH 13, not 1.",
    tag: "method-skipped",
    ao: "AO2",
  },
  // --- Edexcel & OCR GCSE -------------------------------------------------
  {
    slug: "edexcel-4s-3d-ionisation",
    subjectId: "edexcel-gcse-chemistry",    topics: ["atomic-structure"],
    statement: "4s fills before 3d, so in a transition-metal ion the electrons leave 3d first.",
    explanation:
      "The filling order rules the build-up, not the removal. 4s fills before 3d, but once occupied 3d sits lower, so ionisation empties 4s first: Fe is [Ar] 3d⁶ 4s², and Fe²⁺ is [Ar] 3d⁶ — not 3d⁴ 4s².",
    example: "The student writes the Fe²⁺ configuration as 3d⁴ 4s², keeping the 4s electrons and losing the d-block chemistry marks.",
    correction:
      "Fill 4s before 3d, but empty 4s first on ionisation: the highest n leaves first when removing electrons.",
    tag: "conceptual",
    ao: "AO1",
  },
  {
    slug: "ocr-covalent-bonds-melt",
    subjectId: "ocr-gcse-chemistry",
    topics: ["bonding"],
    statement: "When ice or iodine melts, the covalent bonds within the molecules break.",
    explanation:
      "Melting a simple molecular solid overcomes only the weak intermolecular forces between molecules — the strong covalent bonds inside each molecule survive intact. That is why molecular melting points are low while the molecules themselves stay whole.",
    example: "The student explains iodine's low melting point as 'I–I covalent bonds breaking', when I₂ molecules leave the lattice intact.",
    correction:
      "Melting/boiling a simple molecular substance breaks intermolecular forces only; covalent bonds break in giant covalent structures or in chemical reactions.",
    tag: "conceptual",
    ao: "AO1",
  },
  // --- WJEC GCSE -----------------------------------------------------------
  {
    slug: "wjec-gcse-calorimetry-solid-mass",
    subjectId: "wjec-gcse-chemistry",
    topics: ["energetics"],
    statement: "In a calorimetry experiment q = mcΔT uses the mass of the solid burned, because that is what releases the energy.",
    explanation:
      "The heat released by the fuel is absorbed by the water in the calorimeter, so m is the mass of the water being warmed — typically a few hundred grams. Using the mass of the fuel (often under a gram) shrinks q by a factor of hundreds.",
    example: "Burning 0.40 g of methanol warms 150 g of water by 22 K: the student computes q with 0.40 instead of 150 and gets an enthalpy of combustion thousands of kJ mol⁻¹ too small.",
    correction:
      "q = mcΔT with m = the mass of the solution/water, c = 4.18 J g⁻¹ K⁻¹, then scale per mole of fuel burned.",
    tag: "substitution-slips",
    ao: "AO2",
  },
  {
    slug: "wjec-gcse-curly-arrow-charge",
    subjectId: "wjec-gcse-chemistry",
    topics: ["organic-basics"],
    statement: "A curly arrow starts from the positive charge, showing where the electron pair wants to go.",
    explanation:
      "Curly arrows show the movement of an electron pair, so each one must start from a source of electrons — a bond or a lone pair — and end where that pair ends up. A positive charge has no electrons to give; an arrow drawn from it describes an impossible electron movement.",
    example: "Attacking an aldehyde with HCN, the student draws the arrow from C⁺ of the carbocation to the cyanide lone pair, reversing the real flow.",
    correction:
      "Arrow starts at the electron pair (lone pair or π bond) and points to where the pair lands — usually the electron-poor atom, never from it.",
    tag: "conceptual",
    ao: "AO2",
  },
  // --- AQA & Edexcel, wider topics ----------------------------------------
  {
    slug: "aqa-haloalkane-polarity-rate",
    subjectId: "aqa-alevel-chemistry",
    topics: ["hydrocarbons"],
    statement: "C–Cl hydrolyses fastest of the haloalkanes because it is the most polar bond.",
    explanation:
      "Rate is governed by bond enthalpy, not bond polarity. The C–I bond is the weakest (longest, least overlap), so iodoalkanes hydrolyse fastest despite being the least polar — C–I < C–Br < C–Cl in rate terms is exactly backwards if you argue from polarity.",
    example: "In the silver nitrate timed-hydrolysis experiment the student predicts the chloroalkane's precipitate first, when yellow AgI appears fastest.",
    correction:
      "Rate order C–I > C–Br > C–Cl: bond enthalpy falls down the group, so the weakest bond breaks first. Polarity points the other way.",
    tag: "conceptual",
    ao: "AO2",
  },
  {
    slug: "edexcel-orders-from-equation",
    subjectId: "edexcel-alevel-chemistry",
    topics: ["kinetics"],
    statement: "The rate equation for aA + bB → products is rate = k[A]ᵃ[B]ᵇ — orders match the balancing numbers.",
    explanation:
      "Orders are experimental quantities: they describe the rate-determining step's mechanism, not the overall stoichiometry. Balancing numbers give powers only for elementary single-step reactions; multi-step mechanisms routinely disagree.",
    example: "For H₂ + Br₂ → 2HBr the student writes rate = k[H₂][Br₂], when the observed kinetics involve a chain mechanism with fractional orders.",
    correction:
      "Derive orders from initial-rates data or the rate-determining step only; never read them off the balanced equation.",
    tag: "conceptual",
    ao: "AO2",
  },
]); 