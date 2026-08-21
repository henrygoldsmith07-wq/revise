import type { AoCode, Question, QuestionKind } from "@/domain/types";
import { defineQuestions } from "./authoring";

/** Original table, graph and experimental-data questions for every subject variant. */

type DataPart = {
  prompt: string;
  marks: number;
  scheme: string[];
  answer: string;
  claim: string;
  aos?: AoCode[];
};

type DataItem = {
  slug: string;
  topic: string;
  stem: string;
  parts: DataPart[];
  kind?: QuestionKind;
  options?: string[];
  correctIndex?: number;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  calculator?: boolean;
};

function part(
  prompt: string,
  marks: number,
  scheme: string[],
  answer: string,
  claim: string,
  aos: AoCode[] = ["AO2"],
): DataPart {
  return { prompt, marks, scheme, answer, claim, aos };
}

function buildQuestions(subjectId: string, items: DataItem[]): Question[] {
  return defineQuestions(
    items.map((item) => ({
      slug: `data-expansion-${subjectId}-${item.slug}`,
      subjectId,
      topics: [item.topic],
      kind: item.kind,
      stem: item.stem,
      options: item.options,
      correctIndex: item.correctIndex,
      difficulty: item.difficulty,
      calculator: item.calculator,
      source: "authored",
      verification: "checked",
      reviewer: "authored/data-question-expansion-review",
      lastChecked: "2026-08-18",
      specVersion: "2024-1.0",
      parts: item.parts.map((current) => ({
        prompt: current.prompt,
        marks: current.marks,
        scheme: current.scheme,
        answer: current.answer,
        aos: current.aos,
        specPointIds: [`${subjectId}.${item.topic}.sp-01`],
        learningClaims: [current.claim],
      })),
    })),
  );
}

const biology: DataItem[] = [
  {
    slug: "food-test-table",
    topic: "biological-molecules",
    stem: "Data: Food samples gave these test results: A—Benedict blue, iodine blue-black; B—Benedict brick-red, iodine yellow-brown; C—Biuret lilac, ethanol cloudy.",
    kind: "mcq",
    difficulty: 2,
    options: ["Sample A contains starch but no reducing sugar", "Sample B contains reducing sugar but no starch", "Sample C contains no protein", "All three samples contain reducing sugar"],
    correctIndex: 1,
    parts: [part("Select the correct interpretation of the results.", 1, ["Sample B gives a positive Benedict's test and a negative iodine test, so it contains reducing sugar but no starch detected"], "Sample B contains reducing sugar but no starch detected.", "interpret food-test results", ["AO2"])],
  },
  {
    slug: "micrograph-magnification",
    topic: "cell-structure",
    stem: "Data: A mitochondrion measures 18 mm on a micrograph. Its actual length is 6.0 μm.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the magnification.", 2, ["Convert 18 mm to 18 000 μm", "Magnification = 18 000/6.0 = ×3000"], "18 mm = 18 000 μm. Magnification = 18 000/6.0 = ×3000.", "calculate magnification from image and actual size")],
  },
  {
    slug: "osmosis-results",
    topic: "membranes-transport",
    stem: "Data: A potato cylinder changes from 4.80 g to 5.04 g in solution X. In solution Y it changes from 4.80 g to 4.56 g.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the percentage change in each solution and state which has the higher water potential than the potato cells.", 3, ["Solution X: (0.24/4.80) × 100 = +5.0%", "Solution Y: (−0.24/4.80) × 100 = −5.0%", "Solution X has higher water potential and water entered the cells"], "Solution X gives +5.0% and solution Y gives −5.0%. Solution X has higher water potential than the cell sap, so water entered by osmosis.", "calculate percentage mass change and interpret osmosis")],
  },
  {
    slug: "enzyme-ph-table",
    topic: "enzymes",
    stem: "Data: Enzyme rate in arbitrary units was pH 5: 2, pH 6: 6, pH 7: 11, pH 8: 8 and pH 9: 3.",
    difficulty: 2,
    parts: [part("State the optimum pH and explain why the rate falls above it.", 3, ["The optimum pH recorded is 7", "Extreme pH disrupts ionic and hydrogen bonds", "The active site changes shape and fewer enzyme-substrate complexes form"], "The optimum pH is 7. Above the optimum, pH disrupts bonds maintaining the tertiary structure, changing the active site so fewer enzyme-substrate complexes form.", "interpret enzyme data and explain denaturation")],
  },
  {
    slug: "dna-sequence-data",
    topic: "nucleic-acids",
    stem: "Data: The template DNA sequence from a gene is TAC GGA CTT. The codon table is used for the mRNA product.",
    difficulty: 2,
    parts: [part("Give the mRNA sequence and explain how the data are used to determine an amino-acid sequence.", 3, ["Complementary mRNA is AUG CCU GAA", "RNA polymerase forms mRNA using base pairing", "Ribosome reads codons and tRNA brings the corresponding amino acids"], "The mRNA sequence is AUG CCU GAA. The ribosome reads these codons and tRNA molecules bring the matching amino acids according to the codon table.", "use sequence data to link transcription to translation")],
  },
  {
    slug: "ventilation-data",
    topic: "gas-exchange",
    stem: "Data: During exercise, breathing rate is 32 breaths min⁻¹ and tidal volume is 2.1 dm³. At rest the values are 14 breaths min⁻¹ and 0.50 dm³.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate minute ventilation during exercise and compare it with rest.", 3, ["Minute ventilation = breathing rate × tidal volume", "Exercise = 32 × 2.1 = 67.2 dm³ min⁻¹", "Rest = 14 × 0.50 = 7.0 dm³ min⁻¹, so exercise is higher"], "Exercise minute ventilation is 67.2 dm³ min⁻¹; resting ventilation is 7.0 dm³ min⁻¹. Exercise ventilation is therefore much greater.", "calculate and compare ventilation data")],
  },
  {
    slug: "haemoglobin-data",
    topic: "transport-animals",
    stem: "Data: Haemoglobin saturation is 98% at pO₂ 12 kPa in the lungs and 72% at pO₂ 4 kPa in active muscle.",
    difficulty: 2,
    parts: [part("Explain why the difference in saturation supports oxygen delivery to muscle.", 3, ["Muscle has lower oxygen partial pressure because of respiration", "Haemoglobin releases oxygen as pO₂ falls", "The difference between 98% and 72% represents oxygen unloaded to the muscle"], "Respiring muscle lowers pO₂. Haemoglobin has lower saturation at the lower pO₂, so oxygen is unloaded from the blood to the muscle.", "interpret oxygen-dissociation data")],
  },
  {
    slug: "transpiration-conditions",
    topic: "transport-plants",
    stem: "Data: A shoot loses 0.30 g of water in still air, 0.52 g in moving air and 0.18 g in humid air over 20 minutes.",
    difficulty: 3,
    parts: [part("Identify the condition with the greatest transpiration rate and explain the pattern.", 3, ["Moving air gives the greatest water loss", "Moving air removes humid air next to the leaf", "This maintains a steeper water-vapour gradient; humid air reduces the gradient"], "Moving air gives the greatest rate. It removes the humid boundary layer around the leaf, maintaining a steep water-vapour gradient; humid air does the opposite.", "interpret environmental effects on transpiration")],
  },
  {
    slug: "quadrat-counts",
    topic: "biodiversity",
    stem: "Data: Daisies counted in five equal quadrats are 8, 5, 7, 10 and 5. Each quadrat has area 0.25 m².",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the mean density of daisies per square metre.", 3, ["Mean count = 35/5 = 7", "Total sampled area = 5 × 0.25 = 1.25 m²", "Density = 35/1.25 = 28 daisies m⁻²"], "The mean count is 7, but the total sampled area is 1.25 m². Density = 35/1.25 = 28 daisies m⁻².", "calculate density from quadrat data")],
  },
  {
    slug: "respiration-gas-data",
    topic: "respiration",
    stem: "Data: A germinating seed consumes 24 cm³ oxygen and produces 30 cm³ carbon dioxide in one hour.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the respiratory quotient and interpret it.", 3, ["RQ = carbon dioxide produced/oxygen consumed", "RQ = 30/24 = 1.25", "The value is above 1, so a substrate other than carbohydrate alone may be used"], "RQ = 30/24 = 1.25. The value above 1 suggests the seed is not respiring on carbohydrate alone, possibly using an organic acid or lipid mixture.", "calculate respiratory quotient from gas data")],
  },
  {
    slug: "photosynthesis-light-data",
    topic: "photosynthesis",
    stem: "Data: Pondweed oxygen production is 4, 9, 15, 15 and 15 bubbles min⁻¹ at light intensities 10, 20, 40, 80 and 160 units.",
    difficulty: 2,
    parts: [
      part("Identify the light intensity at which the rate first reaches its maximum.", 1, ["The rate first reaches 15 bubbles min⁻¹ at 40 units"], "The rate first reaches its maximum at a light intensity of 40 units.", "identify a plateau from a photosynthesis dataset"),
      part("Explain the plateau in the data and identify a suitable conclusion.", 3, ["Rate rises as light intensity increases up to 40 units", "At higher intensities light is no longer limiting", "Another factor such as carbon dioxide concentration or temperature limits the rate"], "The rate increases up to 40 units but then plateaus. Light is no longer limiting above this point; another factor, such as carbon dioxide concentration or temperature, limits photosynthesis.", "interpret a limiting-factor dataset"),
    ],
  },
  {
    slug: "glucose-insulin-data",
    topic: "homeostasis",
    stem: "Data: Blood glucose rises from 4.8 to 8.9 mmol dm⁻³ after a meal, while blood insulin rises from 6 to 42 arbitrary units.",
    difficulty: 2,
    parts: [part("Explain how the two changes form a negative-feedback response.", 4, ["Pancreatic beta cells detect increased glucose", "Insulin secretion increases", "Cells take up glucose and the liver converts it to glycogen", "Glucose concentration falls towards its set point"], "The pancreas detects the increased glucose and beta cells release more insulin. Insulin increases uptake by cells and glycogenesis in the liver, returning blood glucose towards its set point.", "interpret linked homeostasis data")],
  },
  {
    slug: "inheritance-counts",
    topic: "genetics-inheritance",
    stem: "Data: Offspring from a dihybrid cross are observed as 92, 31, 29 and 8 for the four phenotypes. The expected ratio is 9:3:3:1.",
    kind: "extended",
    difficulty: 3,
    parts: [part("Evaluate whether the results support independent assortment without doing a chi-squared calculation.", 3, ["Expected counts for 160 offspring are 90, 30, 30 and 10", "Observed counts are close to expected values", "The small differences could be due to sampling variation, so the data support the ratio"], "Expected counts are 90, 30, 30 and 10. The observed counts are close, so the differences could be sampling variation and the data support the 9:3:3:1 ratio.", "compare observed and expected genetic data", ["AO2", "AO3"])],
  },
  {
    slug: "trophic-energy-data",
    topic: "ecosystems",
    stem: "Data: Energy stores are 18 000 kJ in plants, 2 700 kJ in herbivores and 270 kJ in primary consumers' predators.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the percentage transfer from plants to herbivores and state one reason it is incomplete.", 3, ["Transfer = 2700/18 000 × 100", "Transfer = 15%", "Energy is lost through respiration, movement, waste or uneaten material"], "The transfer is 2700/18 000 × 100 = 15%. Energy is lost in respiration and movement, waste and biomass that is not eaten.", "calculate trophic energy transfer from data")],
  },
];

const chemistry: DataItem[] = [
  {
    slug: "isotope-abundance-data",
    topic: "atomic-structure",
    stem: "Data: A mass spectrum gives isotope masses 24, 25 and 26 with relative abundances 79, 10 and 11.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the relative atomic mass.", 2, ["Use a weighted mean", "(24 × 79 + 25 × 10 + 26 × 11)/100 = 24.32"], "Relative atomic mass = (24 × 79 + 25 × 10 + 26 × 11)/100 = 24.32.", "calculate relative atomic mass from mass-spectrum data")],
  },
  {
    slug: "titration-readings",
    topic: "moles",
    stem: "Data: Concordant titres are 24.60, 24.70 and 24.65 cm³. A 25.00 cm³ sample reacts with 0.100 mol dm⁻³ acid in a 1:1 reaction.",
    kind: "calculation",
    difficulty: 3,
    calculator: true,
    parts: [part("Calculate the mean titre and the concentration of the sample.", 4, ["Mean titre = (24.60 + 24.70 + 24.65)/3 = 24.65 cm³", "Moles acid = 0.100 × 0.02465 = 0.002465 mol", "The 1:1 reaction gives the same moles of sample", "Concentration = 0.002465/0.02500 = 0.0986 mol dm⁻³"], "The mean titre is 24.65 cm³. Moles acid = 0.100 × 0.02465 = 0.002465 mol, so sample concentration = 0.002465/0.02500 = 0.0986 mol dm⁻³.", "select concordant titres and calculate concentration")],
  },
  {
    slug: "bonding-properties-data",
    topic: "bonding",
    stem: "Data: Substance P melts at 801 °C and conducts when molten; substance Q melts at −114 °C and does not conduct.",
    kind: "mcq",
    difficulty: 2,
    options: ["P is likely ionic and Q is likely simple molecular", "P is simple molecular and Q is metallic", "Both are giant covalent", "P is a noble gas and Q is ionic"],
    correctIndex: 0,
    parts: [part("Select the best interpretation of the physical data.", 1, ["P has an ionic lattice and mobile ions when molten; Q has weak intermolecular forces and no mobile charge carriers"], "P is likely ionic and Q is likely simple molecular.", "infer structure and bonding from physical data", ["AO2"])],
  },
  {
    slug: "calorimetry-data",
    topic: "energetics",
    stem: "Data: 100.0 g solution rises from 20.0 °C to 26.5 °C when 0.0200 mol reacts. c = 4.18 J g⁻¹ K⁻¹.",
    kind: "calculation",
    difficulty: 3,
    calculator: true,
    parts: [part("Calculate the molar enthalpy change and state one reason the magnitude may be underestimated.", 4, ["q = mcΔT = 100.0 × 4.18 × 6.5 = 2717 J", "The reaction is exothermic", "ΔH = −2.717/0.0200 = −136 kJ mol⁻¹", "Heat may be lost to the surroundings or absorbed by the apparatus"], "q = 2717 J, so ΔH = −2.717/0.0200 = −136 kJ mol⁻¹. Heat loss to the surroundings or apparatus would make the measured magnitude too small.", "calculate and evaluate calorimetry data")],
  },
  {
    slug: "rate-concentration-data",
    topic: "kinetics",
    stem: "Data: Initial rate is 0.020, 0.040 and 0.080 mol dm⁻³ s⁻¹ when [A] is 0.10, 0.20 and 0.40 mol dm⁻³; [B] is constant.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Deduce the order with respect to A and state the effect of doubling [A].", 2, ["Doubling [A] doubles the rate", "The reaction is first order in A"], "The rate doubles whenever [A] doubles, so the reaction is first order with respect to A.", "deduce reaction order from a rate dataset")],
  },
  {
    slug: "equilibrium-composition-data",
    topic: "equilibria",
    stem: "Data: At equilibrium for H₂ + I₂ ⇌ 2HI, concentrations are [H₂] = 0.25, [I₂] = 0.25 and [HI] = 0.50 mol dm⁻³.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Calculate Kc and describe what a value of Kc greater than one would imply for this reaction.", 3, ["Kc = [HI]²/([H₂][I₂])", "Kc = 0.50²/(0.25 × 0.25) = 4.0", "Products are favoured relative to reactants, although equilibrium is not complete"], "Kc = 0.50²/(0.25 × 0.25) = 4.0. A value above one means products are favoured at this temperature, but both sides remain present.", "calculate and interpret an equilibrium constant")],
  },
  {
    slug: "ph-dilution-data",
    topic: "acids-bases",
    stem: "Data: A strong monoprotic acid has pH 2.00 at 0.010 mol dm⁻³. A tenfold dilution gives pH 3.00.",
    difficulty: 2,
    parts: [part("Explain why the pH rises by one unit after the tenfold dilution.", 2, ["For a strong acid, [H⁺] is proportional to concentration", "A tenfold fall in [H⁺] gives a one-unit increase in pH because pH = −log[H⁺]"], "The hydrogen-ion concentration falls tenfold. Because pH is logarithmic, pH increases by one unit from 2.00 to 3.00.", "interpret pH change after dilution")],
  },
  {
    slug: "redox-potential-data",
    topic: "redox",
    stem: "Data: E°(Cu²⁺/Cu) = +0.34 V and E°(Fe²⁺/Fe) = −0.44 V.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate E°cell for a cell using these half-cells and identify the reducing agent.", 3, ["E°cell = +0.34 − (−0.44)", "E°cell = +0.78 V", "Iron is oxidised and is the reducing agent"], "E°cell = +0.78 V. Iron loses electrons to Cu²⁺, so iron is the reducing agent.", "use electrode-potential data to identify redox roles")],
  },
  {
    slug: "ionisation-energy-data",
    topic: "periodicity",
    stem: "Data: First ionisation energies for four consecutive elements are 496, 738, 578 and 1012 kJ mol⁻¹.",
    difficulty: 3,
    parts: [part("Identify the likely position of the large drop and explain it using electron structure.", 3, ["The drop from 738 to 578 kJ mol⁻¹ is the anomaly", "The next element has an electron entering a higher-energy p sub-shell", "That electron is easier to remove than an s electron"], "The drop from 738 to 578 is the anomaly. The next element has its outer electron in a higher-energy p sub-shell, so it is easier to remove.", "interpret first-ionisation-energy data")],
  },
  {
    slug: "transition-absorbance-data",
    topic: "transition-metals",
    stem: "Data: A complex absorbs most strongly at 520 nm and appears orange to the eye.",
    difficulty: 2,
    parts: [part("Explain why the observed colour is not the same as the wavelength absorbed.", 2, ["The complex removes green light around 520 nm", "The colour seen is the complementary colour of the absorbed wavelength"], "The complex absorbs green light near 520 nm. The orange colour observed is the complementary colour of the wavelength absorbed.", "interpret absorption and complementary-colour data")],
  },
  {
    slug: "homologous-boiling-data",
    topic: "organic-basics",
    stem: "Data: Boiling points for four consecutive alkanes are 36, 69, 98 and 126 °C.",
    difficulty: 2,
    parts: [part("Describe the trend and explain it in terms of intermolecular forces.", 3, ["Boiling point increases as chain length increases", "Larger molecules have more electrons and stronger London forces", "More energy is needed to separate the molecules"], "Boiling point rises with chain length because larger molecules have more electrons and stronger London dispersion forces, requiring more energy to separate.", "explain a boiling-point trend in a homologous series")],
  },
  {
    slug: "alkene-bromine-data",
    topic: "hydrocarbons",
    stem: "Data: Bromine-water colour disappears in 18 s for an alkene sample, 44 s after dilution with solvent and not at all for an alkane control.",
    difficulty: 2,
    parts: [part("Interpret the results and explain why dilution changes the time.", 3, ["The alkene contains a carbon-carbon double bond", "The alkane control is saturated and does not react under these conditions", "Dilution lowers reactant concentration, reducing collision frequency and increasing time"], "The alkene decolourises bromine water because it undergoes addition at its C=C bond. The alkane control does not react; dilution lowers concentration and makes the reaction slower.", "interpret an alkene test and rate data")],
  },
  {
    slug: "carbonyl-test-data",
    topic: "carbonyls-acids",
    stem: "Data: Unknown X gives an orange precipitate with 2,4-DNPH and a silver mirror with Tollens' reagent. Unknown Y gives only the 2,4-DNPH precipitate.",
    difficulty: 2,
    parts: [part("Identify the functional group class of X and distinguish it from Y.", 3, ["Both contain a carbonyl group", "X is an aldehyde because it reduces Tollens' reagent", "Y is a ketone because it does not give the silver mirror"], "Both compounds contain a carbonyl group. X is an aldehyde; Y is a ketone because only X reduces Tollens' reagent.", "interpret qualitative carbonyl-test data")],
  },
  {
    slug: "nmr-data",
    topic: "aromatics-nitrogen",
    stem: "Data: A proton NMR spectrum has signals at 1.3 ppm (triplet, 3H) and 4.2 ppm (quartet, 2H), with no other proton signals.",
    difficulty: 3,
    parts: [part("Deduce a structure consistent with the data and explain the splitting pattern.", 3, ["The integration gives a 3H:2H ratio", "The triplet and quartet indicate adjacent CH₃ and CH₂ groups", "The shifts are consistent with CH₃CH₂ attached to oxygen, such as ethanol"], "The data fit ethanol, CH₃CH₂OH. The CH₃ signal is split into a triplet by two neighbouring CH₂ protons; the CH₂ signal is a quartet from three neighbouring CH₃ protons.", "deduce structure from proton NMR data")],
  },
  {
    slug: "spectroscopy-identification",
    topic: "spectroscopy",
    stem: "Data: An unknown has a strong IR absorption at 1715 cm⁻¹ and a proton NMR singlet integrating to 6H at 2.1 ppm.",
    kind: "mcq",
    difficulty: 3,
    options: ["Propanone", "Ethanol", "Ethene", "Methanoic acid"],
    correctIndex: 0,
    parts: [part("Identify the compound.", 1, ["1715 cm⁻¹ indicates C=O and a 6H singlet fits two equivalent methyl groups in propanone"], "The compound is propanone, CH₃COCH₃.", "combine IR and NMR data to identify a structure", ["AO2"])],
  },
];

const maths: DataItem[] = [
  {
    slug: "counterexample-data",
    topic: "proof",
    stem: "Data: A claim says n² + n + 41 is prime for every positive integer n. Values for n = 1, 2, 3 and 39 are 43, 47, 53 and 1601.",
    kind: "extended",
    difficulty: 3,
    parts: [part("Explain whether these data prove the claim and give a counterexample if one exists.", 3, ["Several examples cannot prove a universal statement", "At n = 40, the value is 40² + 40 + 41 = 1681", "1681 = 41², so it is not prime and the claim is false"], "The examples do not prove the claim. At n = 40, the expression is 1681 = 41², so this is a counterexample and the universal claim is false.", "use data and counterexample in proof", ["AO2", "AO3"])],
  },
  {
    slug: "function-table",
    topic: "algebra",
    stem: "Data: A function gives f(−2) = 3, f(−1) = 0, f(0) = −1, f(1) = 0 and f(2) = 3.",
    difficulty: 2,
    parts: [part("Suggest a factorised quadratic model for f(x) and justify it from the data.", 3, ["Zeros at x = −1 and x = 1 suggest factors (x + 1)(x − 1)", "The model is x² − 1", "It gives f(0) = −1 and f(±2) = 3, matching the data"], "A suitable model is f(x) = (x + 1)(x − 1) = x² − 1. It gives the two roots and matches f(0) and f(±2).", "infer an algebraic model from a value table")],
  },
  {
    slug: "coordinate-gradient-data",
    topic: "coordinate-geometry",
    stem: "Data: Measured points on a line are (1, 4), (3, 8), (5, 12) and (7, 16).",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Find the gradient and equation of the line, then state what a residual of zero means.", 3, ["Gradient = (8 − 4)/(3 − 1) = 2", "Using (1,4), c = 2, so y = 2x + 2", "A zero residual means the observed point lies on the model line"], "The gradient is 2 and y = 2x + 2. A zero residual means the measured value equals the value predicted by the line.", "interpret linear coordinate data")],
  },
  {
    slug: "sequence-data",
    topic: "sequences",
    stem: "Data: The first five terms of a sequence are 4, 7, 12, 19 and 28.",
    difficulty: 2,
    parts: [part("Find a formula for the nth term and use it to predict the sixth term.", 3, ["First differences are 3, 5, 7, 9; second differences are 2", "A quadratic model is n² + n + 2", "The sixth term is 36 + 6 + 2 = 44"], "The second difference is 2, giving the model aₙ = n² + n + 2. The sixth term is 44.", "identify a quadratic sequence from data")],
  },
  {
    slug: "trig-calibration-data",
    topic: "trigonometry",
    stem: "Data: A sensor records y = 0.50, 0.87 and 1.00 at angles θ = 30°, 60° and 90° respectively.",
    kind: "mcq",
    difficulty: 1,
    options: ["The data are consistent with y = sin θ", "The data are consistent with y = cos θ", "The data are consistent with y = tan θ", "The data cannot be trigonometric"],
    correctIndex: 0,
    parts: [part("Select the model that fits the data.", 1, ["sin 30° = 0.50, sin 60° ≈ 0.87 and sin 90° = 1"], "The data are consistent with y = sin θ.", "match trigonometric models to tabulated data", ["AO2"])],
  },
  {
    slug: "exponential-population-data",
    topic: "exponentials",
    stem: "Data: A culture has populations 500 at t = 0, 605 at t = 2 and 732 at t = 4 hours.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Estimate the two-hour growth multiplier and predict the population at t = 6.", 3, ["Multiplier over two hours ≈ 605/500 = 1.21", "The second interval gives 732/605 ≈ 1.21", "Prediction = 732 × 1.21 ≈ 886"], "The two-hour multiplier is about 1.21, confirmed by 732/605. The six-hour estimate is 732 × 1.21 ≈ 886.", "fit and extrapolate an exponential model from data")],
  },
  {
    slug: "gradient-data",
    topic: "differentiation",
    stem: "Data: A curve has points (1, 0), (2, 3), (3, 12) and (4, 27). A tangent near x = 2 passes through (1.9, 2.6) and (2.1, 3.4).",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Estimate dy/dx at x = 2 from the tangent data and compare it with the average gradient from x = 1 to x = 3.", 3, ["Tangent gradient = (3.4 − 2.6)/(2.1 − 1.9) = 4", "Average gradient = (12 − 0)/(3 − 1) = 6", "A tangent gives the instantaneous gradient, while the secant gives an average over an interval"], "The tangent estimate is 4. The average gradient from x = 1 to 3 is 6; they differ because one is instantaneous and the other is an interval average.", "estimate a derivative from local data")],
  },
  {
    slug: "trapezium-data",
    topic: "integration",
    stem: "Data: A curve has ordinates y = 2, 3, 5 and 4 at x = 0, 1, 2 and 3.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Use the trapezium rule with width 1 to estimate the area from x = 0 to x = 3.", 3, ["Area ≈ 1/2 × 1 × [2 + 4(3 + 5) + 4]", "Area ≈ 19", "The estimate is based on straight-line chords between data points"], "Area ≈ ½[2 + 4(3 + 5) + 4] = 19 square units. It is an estimate because the curve between points is approximated by chords.", "apply the trapezium rule to tabulated data")],
  },
  {
    slug: "vector-coordinate-data",
    topic: "vectors",
    stem: "Data: A journey has displacement 3i + 4j km followed by −i + 2j km.",
    difficulty: 2,
    parts: [part("Find the total displacement and its magnitude.", 3, ["Add components: 2i + 6j", "Magnitude = √(2² + 6²)", "Magnitude = √40 = 2√10 km"], "The displacement is 2i + 6j km and its magnitude is √40 = 2√10 km.", "combine vector data and find magnitude")],
  },
  {
    slug: "iteration-table",
    topic: "numerical",
    stem: "Data: An iteration gives x₀ = 2.0, x₁ = 2.25, x₂ = 2.2361 and x₃ = 2.23607.",
    difficulty: 2,
    parts: [part("State the approximate root and explain how the data indicate convergence.", 2, ["The values converge to about 2.236", "Successive values become closer together, so the iteration is converging"], "The root is approximately 2.236. The decreasing change between successive iterates indicates convergence.", "interpret an iteration table")],
  },
  {
    slug: "sampling-data",
    topic: "statistical-sampling",
    stem: "Data: A population has 120 students in group A, 80 in group B and 100 in group C. A sample of 30 is required.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the proportional stratified sample from each group.", 3, ["Total population = 300", "A: 120/300 × 30 = 12", "B: 80/300 × 30 = 8 and C: 100/300 × 30 = 10"], "The proportional sample is 12 from A, 8 from B and 10 from C.", "calculate a stratified sample from population data")],
  },
  {
    slug: "frequency-probability-data",
    topic: "probability",
    stem: "Data: In a sample of 200 components, 18 are defective. Two components are selected without replacement.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Estimate the probability that both selected components are non-defective.", 2, ["There are 182 non-defective components", "Probability = 182/200 × 181/199 = 0.827 approximately"], "P(both good) = (182/200)(181/199) ≈ 0.827.", "use frequency data to estimate dependent probability")],
  },
  {
    slug: "distribution-data",
    topic: "distributions",
    stem: "Data: A random variable X takes values 0, 1, 2 and 3 with frequencies 4, 8, 6 and 2 in a sample of 20.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the sample mean of X.", 2, ["Σxf = 0(4) + 1(8) + 2(6) + 3(2) = 26", "Mean = 26/20 = 1.3"], "The total of xf is 26, so the sample mean is 26/20 = 1.3.", "calculate a mean from a discrete frequency table")],
  },
  {
    slug: "velocity-time-data",
    topic: "kinematics",
    stem: "Data: A vehicle has velocities 0, 4, 8 and 10 m s⁻¹ at times 0, 2, 4 and 6 s.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Estimate the distance travelled using trapezia and calculate the average acceleration over the six seconds.", 4, ["Distance ≈ ½×2(0 + 4) + ½×2(4 + 8) + ½×2(8 + 10)", "Distance ≈ 4 + 12 + 18 = 34 m", "Average acceleration = (10 − 0)/6", "Average acceleration = 1.67 m s⁻²"], "The trapezium estimate is 34 m. The average acceleration is 10/6 = 1.67 m s⁻².", "interpret velocity-time data using area and gradient")],
  },
  {
    slug: "force-extension-data",
    topic: "forces",
    stem: "Data: Force values 0, 2, 4 and 6 N produce extensions 0, 4, 8 and 13 mm in a spring.",
    difficulty: 2,
    parts: [part("Identify the limit of proportionality from the data and calculate the stiffness in the proportional region.", 3, ["The first three points are proportional", "The 6 N point is above the straight-line extension of 12 mm", "k = F/x = 4/(0.008) = 500 N m⁻¹"], "The data cease to be proportional at 6 N. In the proportional region, k = 4/0.008 = 500 N m⁻¹.", "interpret force-extension data")],
  },
];

const physics: DataItem[] = [
  {
    slug: "velocity-time-table",
    topic: "kinematics-dynamics",
    stem: "Data: A trolley has velocities 2, 5, 8 and 11 m s⁻¹ at times 0, 1, 2 and 3 s.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the acceleration and describe the motion.", 2, ["Acceleration = change in velocity/time = (11 − 2)/3 = 3.0 m s⁻²", "Equal velocity increases each second indicate constant acceleration"], "The acceleration is 3.0 m s⁻². The equal increases in velocity show uniform acceleration.", "interpret velocity-time data")],
  },
  {
    slug: "power-efficiency-data",
    topic: "energy-power",
    stem: "Data: A lift receives 18 kJ of energy each second and increases the gravitational potential energy of its load by 13.5 kJ each second.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the useful efficiency and state where the remaining energy is transferred.", 2, ["Efficiency = 13.5/18.0 = 0.75", "Efficiency = 75%; the remainder is dissipated, mainly as thermal energy and sound"], "The efficiency is 13.5/18.0 = 75%. The remaining energy is dissipated to the surroundings, for example as thermal energy and sound.", "calculate efficiency from energy-transfer data")],
  },
  {
    slug: "stress-strain-data",
    topic: "materials",
    stem: "Data: A wire has stress 1.2 × 10⁸ Pa at strain 6.0 × 10⁻⁴, while a second wire has stress 1.2 × 10⁸ Pa at strain 1.5 × 10⁻³.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Calculate the Young modulus of each wire and identify the stiffer material.", 3, ["E₁ = 1.2 × 10⁸/(6.0 × 10⁻⁴) = 2.0 × 10¹¹ Pa", "E₂ = 1.2 × 10⁸/(1.5 × 10⁻³) = 8.0 × 10¹⁰ Pa", "The first material is stiffer because it has the larger Young modulus"], "E₁ = 2.0 × 10¹¹ Pa and E₂ = 8.0 × 10¹⁰ Pa. The first material is stiffer.", "compare Young modulus values from stress-strain data")],
  },
  {
    slug: "wave-speed-data",
    topic: "waves",
    stem: "Data: A wave has wavelengths 0.40, 0.50 and 0.80 m at frequencies 5.0, 4.0 and 2.5 Hz.",
    kind: "mcq",
    difficulty: 1,
    options: ["The wave speed is approximately constant at 2.0 m s⁻¹", "The wave speed increases with wavelength", "The frequency is independent of wavelength", "The data violate v = fλ"],
    correctIndex: 0,
    parts: [part("Select the conclusion supported by the data.", 1, ["Each product fλ is 2.0 m s⁻¹, so the wave speed is constant"], "The wave speed is approximately constant at 2.0 m s⁻¹.", "interpret frequency-wavelength data", ["AO2"])],
  },
  {
    slug: "photoelectric-data",
    topic: "quantum",
    stem: "Data: Stopping potential is 0.40 V at 6.0 × 10¹⁴ Hz and 1.23 V at 8.0 × 10¹⁴ Hz. The electron charge is 1.60 × 10⁻¹⁹ C.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Estimate h from the change in stopping potential and frequency.", 3, ["Change in electron energy = eΔV = 1.60 × 10⁻¹⁹ × 0.83", "Change in frequency = 2.0 × 10¹⁴ Hz", "h = eΔV/Δf = 6.64 × 10⁻³⁴ J s"], "h = (1.60 × 10⁻¹⁹ × 0.83)/(2.0 × 10¹⁴) = 6.64 × 10⁻³⁴ J s.", "estimate Planck's constant from photoelectric data")],
  },
  {
    slug: "iv-data",
    topic: "electric-circuits",
    stem: "Data: A component has currents 0.10, 0.20 and 0.30 A at p.d.s 2.0, 4.0 and 5.4 V respectively.",
    difficulty: 2,
    parts: [part("Determine whether the component is ohmic over the full range and calculate its resistance at 0.20 A.", 3, ["The first two ratios V/I are 20 Ω", "At 0.30 A, V/I = 18 Ω, so the ratio is not constant", "At 0.20 A, resistance = 4.0/0.20 = 20 Ω"], "The component is not ohmic over the full range because V/I changes at 0.30 A. Its resistance at 0.20 A is 20 Ω.", "interpret current-potential-difference data")],
  },
  {
    slug: "collision-data",
    topic: "momentum",
    stem: "Data: A 0.40 kg trolley moving at 3.0 m s⁻¹ collides with a stationary 0.60 kg trolley. They move together afterwards.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate their common velocity and state whether kinetic energy is conserved.", 3, ["Initial momentum = 0.40 × 3.0 = 1.2 kg m s⁻¹", "Common velocity = 1.2/(0.40 + 0.60) = 1.2 m s⁻¹", "They stick together, so the collision is inelastic and kinetic energy is not conserved"], "The common velocity is 1.2 m s⁻¹. Because the trolleys stick together, the collision is inelastic and kinetic energy is not conserved.", "use conservation of momentum with collision data")],
  },
  {
    slug: "shm-period-data",
    topic: "circular-shm",
    stem: "Data: A particle completes 20 oscillations in 16.0 s at amplitude 0.020 m and 20 oscillations in 16.1 s at amplitude 0.040 m.",
    difficulty: 2,
    parts: [part("Calculate the two periods and comment on whether the data support simple harmonic motion.", 3, ["T₁ = 16.0/20 = 0.800 s", "T₂ = 16.1/20 = 0.805 s", "The near-constant period supports SHM within experimental uncertainty"], "The periods are 0.800 s and 0.805 s. Their near equality supports the small-amplitude SHM model within experimental uncertainty.", "interpret period data for simple harmonic motion")],
  },
  {
    slug: "gravitational-potential-data",
    topic: "fields",
    stem: "Data: Gravitational potential at radii 2R and 4R from a spherical body is −3.0 × 10⁷ and −1.5 × 10⁷ J kg⁻¹.",
    difficulty: 2,
    parts: [part("Describe the relationship between potential and radius shown by the data.", 2, ["Doubling radius halves the magnitude of the potential", "This is consistent with V = −GM/r"], "When radius doubles from 2R to 4R, the magnitude of potential halves. This is consistent with V = −GM/r.", "interpret gravitational-potential data")],
  },
  {
    slug: "gas-pressure-data",
    topic: "thermal",
    stem: "Data: A fixed mass of gas has pressure 100, 110 and 120 kPa at temperatures 300, 330 and 360 K respectively.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Test whether pressure is proportional to absolute temperature and predict the pressure at 390 K.", 3, ["p/T is approximately 0.333 kPa K⁻¹ for each pair", "Pressure is proportional to absolute temperature at constant volume", "p = 0.333 × 390 ≈ 130 kPa"], "The ratio p/T is approximately constant, so pressure is proportional to absolute temperature. At 390 K, p ≈ 130 kPa.", "interpret pressure-temperature data for a fixed gas")],
  },
  {
    slug: "half-life-count-data",
    topic: "nuclear",
    stem: "Data: Background count rate is 20 counts min⁻¹. The measured sample count rates are 820, 420, 220 and 120 counts min⁻¹ at 0, 6, 12 and 18 minutes.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Determine the half-life after correcting for background radiation.", 3, ["Corrected counts are 800, 400, 200 and 100 counts min⁻¹", "The count halves every 6 minutes", "Half-life = 6 minutes"], "Subtracting the background gives 800, 400, 200 and 100 counts min⁻¹. The count halves every 6 minutes, so the half-life is 6 minutes.", "correct and interpret radioactive-count data")],
  },
];

const subjectIds = {
  biology: [
    "wjec-alevel-biology", "aqa-alevel-biology", "edexcel-alevel-biology", "ocr-alevel-biology",
    "wjec-gcse-biology", "aqa-gcse-biology", "edexcel-gcse-biology", "ocr-gcse-biology",
  ],
  chemistry: [
    "wjec-alevel-chemistry", "aqa-alevel-chemistry", "edexcel-alevel-chemistry", "ocr-alevel-chemistry",
    "wjec-gcse-chemistry", "aqa-gcse-chemistry", "edexcel-gcse-chemistry", "ocr-gcse-chemistry",
  ],
  maths: [
    "wjec-alevel-maths", "aqa-alevel-maths", "edexcel-alevel-maths", "ocr-alevel-maths",
    "wjec-gcse-maths", "aqa-gcse-maths", "edexcel-gcse-maths", "ocr-gcse-maths",
  ],
  physics: [
    "wjec-alevel-physics", "aqa-alevel-physics", "edexcel-alevel-physics", "ocr-alevel-physics",
    "wjec-gcse-physics", "aqa-gcse-physics", "edexcel-gcse-physics", "ocr-gcse-physics",
  ],
} as const;

export const dataExpansionQuestions: Question[] = [
  ...subjectIds.biology.flatMap((subjectId) => buildQuestions(subjectId, biology)),
  ...subjectIds.chemistry.flatMap((subjectId) => buildQuestions(subjectId, chemistry)),
  ...subjectIds.maths.flatMap((subjectId) => buildQuestions(subjectId, maths)),
  ...subjectIds.physics.flatMap((subjectId) => buildQuestions(subjectId, physics)),
];
