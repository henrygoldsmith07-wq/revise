import type { AoCode, Question, QuestionKind } from "@/domain/types";
import { defineQuestions } from "./authoring";

/**
 * Original GCSE practice written against the shared board curriculum. The
 * same authored item is retargeted to each board with board-specific topic
 * and specification-point ids; no past-paper text is copied here.
 */

type GcsePart = {
  prompt: string;
  marks: number;
  scheme: string[];
  answer: string;
  claim: string;
  aos?: AoCode[];
};

type GcseItem = {
  slug: string;
  topic: string;
  stem: string;
  parts: GcsePart[];
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
): GcsePart {
  return { prompt, marks, scheme, answer, claim, aos };
}

function buildQuestions(subjectId: string, items: GcseItem[]): Question[] {
  return defineQuestions(
    items.map((item) => ({
      slug: `gcse-expansion-${subjectId}-${item.slug}`,
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
      reviewer: "authored/gcse-expansion-review",
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

const maths: GcseItem[] = [
  {
    slug: "odd-sum-proof",
    topic: "proof",
    stem: "Let m and n be integers. Prove that the sum of two odd integers is even.",
    difficulty: 3,
    kind: "extended",
    parts: [part("Write a proof using algebra.", 3, ["Represent odd integers as 2m + 1 and 2n + 1", "Their sum is 2m + 1 + 2n + 1 = 2(m + n + 1)", "The result is divisible by 2, so it is even"], "Let the odd integers be 2m + 1 and 2n + 1. Their sum is 2m + 1 + 2n + 1 = 2(m + n + 1), which is divisible by 2 and therefore even.", "prove a statement about odd and even integers", ["AO1", "AO2"])],
  },
  {
    slug: "quadratic-factorisation",
    topic: "algebra",
    stem: "The equation x² − 5x + 6 = 0 has two integer solutions.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Solve the equation by factorising.", 2, ["x² − 5x + 6 = (x − 2)(x − 3)", "x = 2 or x = 3"], "(x − 2)(x − 3) = 0, so x = 2 or x = 3.", "solve a quadratic equation by factorising")],
  },
  {
    slug: "line-equation",
    topic: "coordinate-geometry",
    stem: "A straight line passes through A(2, 3) and B(6, 11).",
    difficulty: 3,
    parts: [part("Find the equation of the line in the form y = mx + c.", 4, ["Gradient = (11 − 3)/(6 − 2) = 2", "Use y = 2x + c", "Substitute (2, 3) to get c = −1", "The equation is y = 2x − 1"], "The gradient is (11 − 3)/(6 − 2) = 2. Using A, 3 = 2(2) + c, so c = −1. The equation is y = 2x − 1.", "find a straight-line equation from two coordinates")],
  },
  {
    slug: "arithmetic-sequence",
    topic: "sequences",
    stem: "The first three terms of an arithmetic sequence are 5, 8 and 11.",
    difficulty: 2,
    parts: [part("Find the nth term and the 20th term.", 3, ["The common difference is 3", "The nth term is 3n + 2", "The 20th term is 62"], "The common difference is 3, so the nth term is 3n + 2. The 20th term is 3(20) + 2 = 62.", "find and use the nth term of an arithmetic sequence")],
  },
  {
    slug: "sine-ratio",
    topic: "trigonometry",
    stem: "In a right-angled triangle, the side opposite angle θ is 7 cm and the hypotenuse is 10 cm.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate θ to the nearest degree.", 2, ["sin θ = 7/10", "θ = sin⁻¹(0.7) = 44.4° ≈ 44°"], "sin θ = 7/10, so θ = sin⁻¹(0.7) = 44.4°, which rounds to 44°.", "use a trigonometric ratio to find an angle")],
  },
  {
    slug: "compound-growth",
    topic: "exponentials",
    stem: "A population of 12 000 increases by 4% each year.",
    kind: "calculation",
    difficulty: 3,
    calculator: true,
    parts: [part("Find the population after three years, giving your answer to the nearest whole number.", 2, ["Use multiplier 1.04", "12 000 × 1.04³ = 13 498.944, so 13 499"], "The multiplier is 1.04. After three years the population is 12 000 × 1.04³ = 13 498.944, so 13 499.", "model repeated percentage growth with an exponential multiplier")],
  },
  {
    slug: "gradient-function",
    topic: "differentiation",
    stem: "A curve has equation y = x³ − 4x.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Find the gradient of the curve at x = 2.", 2, ["dy/dx = 3x² − 4", "At x = 2, the gradient is 8"], "dy/dx = 3x² − 4. At x = 2, the gradient is 3(2²) − 4 = 8.", "differentiate a polynomial and evaluate a gradient")],
  },
  {
    slug: "area-under-curve",
    topic: "integration",
    stem: "The curve has equation y = 3x² − 4x + 1 between x = 0 and x = 2.",
    kind: "calculation",
    difficulty: 4,
    parts: [part("Calculate the signed area under the curve between these limits.", 4, ["An antiderivative is x³ − 2x² + x", "Substitute x = 2 to get 2", "Substitute x = 0 to get 0", "The signed area is 2 square units"], "∫(3x² − 4x + 1) dx = x³ − 2x² + x. Evaluating from 0 to 2 gives (8 − 8 + 2) − 0 = 2 square units.", "use definite integration to find area")],
  },
  {
    slug: "vector-midpoint",
    topic: "vectors",
    stem: "The position vectors of A and B are a and b respectively. M is the midpoint of AB.",
    parts: [part("Show that the position vector of M is (a + b)/2.", 3, ["The displacement from A to B is b − a", "Halfway from A is (b − a)/2", "a + (b − a)/2 = (a + b)/2"], "The displacement from A to B is b − a. Half of this added to a gives a + (b − a)/2 = (a + b)/2, so M has position vector (a + b)/2.", "use vector addition to locate a midpoint", ["AO1", "AO2"])],
  },
  {
    slug: "iterative-root",
    topic: "numerical",
    stem: "The equation x² = 7 has a positive root between 2.6 and 2.7.",
    kind: "calculation",
    difficulty: 4,
    parts: [part("Use a numerical method to give the root to one decimal place.", 3, ["Evaluate or iterate values around the sign change", "The root is approximately 2.6458", "Rounded to one decimal place, the root is 2.6"], "The positive solution is √7 ≈ 2.6458, so to one decimal place the root is 2.6.", "use numerical approximation and appropriate rounding")],
  },
  {
    slug: "stratified-sample",
    topic: "statistical-sampling",
    stem: "A year group contains 120 students in group A, 80 in group B and 100 in group C. A stratified sample of 30 students is required.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Find the number selected from each group.", 3, ["The total is 300", "Group A: 120/300 × 30 = 12", "Group B: 80/300 × 30 = 8 and group C = 10"], "The sample is proportional: 12 from group A, 8 from group B and 10 from group C.", "calculate a proportional stratified sample")],
  },
  {
    slug: "without-replacement",
    topic: "probability",
    stem: "A bag contains 5 red counters and 3 blue counters. Two counters are taken without replacement.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Find the probability that both counters are red.", 2, ["The first probability is 5/8", "The second is 4/7, so the product is 5/14"], "P(two red) = 5/8 × 4/7 = 20/56 = 5/14.", "multiply dependent probabilities without replacement")],
  },
  {
    slug: "expected-value",
    topic: "distributions",
    stem: "A discrete random variable X takes values 0, 1 and 2 with probabilities 0.2, 0.5 and 0.3 respectively.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Calculate E(X).", 2, ["Multiply each value by its probability", "E(X) = 0(0.2) + 1(0.5) + 2(0.3) = 1.1"], "E(X) = 0(0.2) + 1(0.5) + 2(0.3) = 1.1.", "calculate the expected value of a discrete distribution")],
  },
  {
    slug: "kinematics-from-rest",
    topic: "kinematics",
    stem: "A cyclist starts from rest and accelerates uniformly at 2.5 m s⁻² for 8 seconds.",
    kind: "calculation",
    difficulty: 3,
    calculator: true,
    parts: [part("Calculate the final speed and distance travelled.", 4, ["v = u + at = 0 + 2.5 × 8 = 20 m s⁻¹", "s = ut + ½at²", "s = 0 + ½ × 2.5 × 8²", "s = 80 m"], "The final speed is v = 0 + 2.5 × 8 = 20 m s⁻¹. The distance is s = 0 + ½(2.5)(8²) = 80 m.", "apply constant-acceleration equations")],
  },
  {
    slug: "resultant-force",
    topic: "forces",
    stem: "A 600 N vehicle is pulled forwards by 950 N while resistive forces total 350 N. Its mass is 1200 kg.",
    kind: "calculation",
    difficulty: 3,
    calculator: true,
    parts: [part("Calculate the resultant force and acceleration.", 3, ["Resultant force = 950 − 350 = 600 N", "Use F = ma", "a = 600/1200 = 0.50 m s⁻²"], "The resultant force is 600 N forwards. Using F = ma, a = 600/1200 = 0.50 m s⁻² forwards.", "resolve forces and use Newton's second law")],
  },
];

const biology: GcseItem[] = [
  {
    slug: "reducing-sugar-test",
    topic: "biological-molecules",
    stem: "A food sample may contain a reducing sugar.",
    kind: "mcq",
    difficulty: 1,
    options: ["Biuret reagent at room temperature", "Benedict's reagent with heating", "Iodine solution in ice", "Ethanol followed by water"],
    correctIndex: 1,
    parts: [part("Select the test and positive result.", 1, ["Benedict's reagent is heated and gives a coloured precipitate", "A brick-red precipitate indicates a high reducing-sugar concentration"], "Add Benedict's reagent and heat in a water bath. A brick-red precipitate is a positive result.", "identify the test for reducing sugars", ["AO1"])],
  },
  {
    slug: "microscope-magnification",
    topic: "cell-structure",
    stem: "A cell image is 36 mm long. The actual cell is 12 μm long.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the magnification.", 2, ["Convert 36 mm to 36 000 μm", "Magnification = image size/actual size = 36 000/12 = ×3000"], "36 mm = 36 000 μm. Magnification = 36 000/12 = ×3000.", "calculate magnification after converting units")],
  },
  {
    slug: "osmosis-potato",
    topic: "membranes-transport",
    stem: "Potato cylinders are placed in sucrose solutions of different concentrations. A cylinder gains mass in the most dilute solution.",
    difficulty: 2,
    parts: [part("Explain the mass increase.", 3, ["The solution has a higher water potential than the cell sap", "Water moves into the cells by osmosis through partially permeable membranes", "The cylinder gains water and therefore mass"], "The dilute solution has a higher water potential than the cell sap. Water moves into the potato cells by osmosis through partially permeable membranes, so the cylinder gains mass.", "explain osmosis using water potential")],
  },
  {
    slug: "enzyme-temperature",
    topic: "enzymes",
    stem: "An enzyme has rates of 3, 7, 12, 8 and 2 units at 20, 30, 40, 50 and 60 °C.",
    difficulty: 2,
    parts: [part("State the optimum temperature and explain the fall at 60 °C.", 3, ["The optimum in this data is 40 °C", "High temperature disrupts bonds in the enzyme", "The active site changes shape and fewer enzyme-substrate complexes form"], "The recorded optimum is 40 °C. At 60 °C, bonds maintaining the enzyme's shape are disrupted, changing the active site so fewer enzyme-substrate complexes form.", "interpret enzyme-rate data and explain denaturation")],
  },
  {
    slug: "dna-complementary-strand",
    topic: "nucleic-acids",
    stem: "One DNA strand has the base sequence TAC GGA CTT.",
    difficulty: 2,
    parts: [part("Write the complementary DNA strand and explain the base-pairing rule.", 3, ["A pairs with T and C pairs with G", "The complementary sequence is ATG CCT GAA", "Specific pairing preserves the information when DNA is copied"], "The complementary strand is ATG CCT GAA. Adenine pairs with thymine and cytosine pairs with guanine, so each base determines its partner.", "apply complementary base pairing in DNA")],
  },
  {
    slug: "alveoli-adaptations",
    topic: "gas-exchange",
    stem: "Alveoli provide the gas-exchange surface in the lungs.",
    kind: "extended",
    difficulty: 2,
    parts: [
      part("State two adaptations that make diffusion of oxygen efficient.", 2, ["There are many alveoli, giving a large surface area", "Alveolar and capillary walls are one cell thick, giving a short diffusion distance"], "There are many alveoli, giving a large surface area, and the alveolar and capillary walls are one cell thick, giving a short diffusion distance.", "identify gas-exchange adaptations", ["AO1"]),
      part("Explain how ventilation and blood flow improve oxygen diffusion.", 2, ["Ventilation refreshes alveolar air", "Blood flow removes oxygenated blood and maintains a steep concentration gradient"], "Ventilation refreshes the air in the alveoli and blood flow removes oxygenated blood, maintaining a steep oxygen concentration gradient for diffusion.", "explain how gradients are maintained at the gas-exchange surface"),
    ],
  },
  {
    slug: "cardiac-output",
    topic: "transport-animals",
    stem: "During exercise a student's heart rate is 150 beats per minute and stroke volume is 0.080 dm³ per beat.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the cardiac output.", 2, ["Cardiac output = heart rate × stroke volume", "150 × 0.080 = 12.0 dm³ min⁻¹"], "Cardiac output = 150 × 0.080 = 12.0 dm³ min⁻¹.", "calculate cardiac output from heart rate and stroke volume")],
  },
  {
    slug: "xylem-phloem",
    topic: "transport-plants",
    stem: "A plant transports water from its roots and sucrose from leaves to growing tissues.",
    difficulty: 2,
    parts: [part("Compare the tissues responsible for these two transport processes.", 3, ["Xylem carries water and mineral ions mainly upwards", "Phloem translocates sucrose and other assimilates between sources and sinks", "Xylem vessels are dead and lignified; phloem contains living sieve tubes with companion cells"], "Xylem carries water and mineral ions from the roots, mainly upwards, through dead lignified vessels. Phloem translocates sucrose between sources and sinks through living sieve tubes supported by companion cells.", "compare xylem transport with phloem translocation")],
  },
  {
    slug: "quadrat-sampling",
    topic: "biodiversity",
    stem: "A meadow has a shaded edge and a sunny centre. A student wants to compare the abundance of daisies in both areas.",
    kind: "extended",
    difficulty: 3,
    parts: [part("Describe a sampling strategy that would produce representative data.", 4, ["Use separate strata for the shaded edge and sunny centre", "Place quadrats randomly or systematically within each stratum", "Keep quadrat size constant and use enough repeats", "Calculate a mean abundance and record light level as a control variable"], "Use stratified random sampling so both habitats are represented. Place the same-sized quadrats randomly within each area, use enough repeats, calculate a mean abundance and record light intensity.", "design representative quadrat sampling")],
  },
  {
    slug: "aerobic-respiration",
    topic: "respiration",
    stem: "Muscle cells need more energy during vigorous exercise.",
    difficulty: 1,
    parts: [part("State the word equation for aerobic respiration and explain why breathing rate rises.", 3, ["Glucose + oxygen → carbon dioxide + water", "Aerobic respiration releases energy for muscle contraction", "Breathing rate rises to deliver more oxygen and remove carbon dioxide"], "Glucose + oxygen → carbon dioxide + water. Breathing rate increases to supply more oxygen for aerobic respiration and remove the carbon dioxide produced.", "state the aerobic respiration equation and link it to exercise", ["AO1", "AO2"])],
  },
  {
    slug: "photosynthesis-limiting-factor",
    topic: "photosynthesis",
    stem: "A pondweed produces 18 bubbles per minute at 0.04% carbon dioxide and 18 bubbles per minute at 0.08% carbon dioxide, when light is constant.",
    difficulty: 2,
    parts: [part("Explain what the data suggests about the limiting factor.", 3, ["Increasing carbon dioxide has no further effect", "Carbon dioxide is not limiting at 0.04% in this investigation", "Another factor such as light intensity or temperature is limiting"], "The rate does not rise when carbon dioxide increases, so carbon dioxide is not limiting at 0.04% under these conditions. Light intensity or temperature may be limiting instead.", "interpret a photosynthesis rate plateau")],
  },
  {
    slug: "blood-glucose-control",
    topic: "homeostasis",
    stem: "Blood glucose concentration rises after a meal containing carbohydrate.",
    difficulty: 2,
    parts: [part("Explain how negative feedback returns the concentration towards its normal level.", 4, ["Pancreatic cells detect the increase", "Insulin is released into the blood", "Cells take up more glucose and the liver converts glucose to glycogen", "Blood glucose falls towards the set point"], "The pancreas detects the rise and releases insulin. Insulin causes body cells to take up more glucose and the liver to convert glucose to glycogen, so blood glucose falls towards its set point.", "explain insulin control by negative feedback")],
  },
  {
    slug: "recessive-inheritance",
    topic: "genetics-inheritance",
    stem: "Two unaffected parents have a child with a recessive genetic condition.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("State the parents' likely genotypes and the probability that another child is affected.", 3, ["Both parents are heterozygous carriers, Aa × Aa", "The offspring ratio is 1 AA : 2 Aa : 1 aa", "The probability of an affected child is 1/4 or 25%"], "The parents are most likely Aa and Aa. A Punnett cross gives a 1 in 4 probability, or 25%, of another child being aa and affected.", "use a genetic cross to calculate recessive inheritance")],
  },
  {
    slug: "food-chain-energy",
    topic: "ecosystems",
    stem: "A food chain contains grass, rabbits and foxes. The grass stores 20 000 kJ of chemical energy and the rabbits store 2 000 kJ.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the percentage energy transfer from grass to rabbits and explain why it is below 100%.", 3, ["Percentage transfer = 2 000/20 000 × 100", "The transfer is 10%", "Energy is lost in respiration, movement, waste and uneaten material"], "The percentage transfer is (2 000/20 000) × 100 = 10%. Energy is lost through respiration and movement, in waste, and in plant material that is not eaten.", "calculate and explain energy transfer between trophic levels")],
  },
];

const chemistry: GcseItem[] = [
  {
    slug: "isotope-abundance",
    topic: "atomic-structure",
    stem: "An element has isotopes of mass 35 and 37 in the ratio 3:1.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the relative atomic mass.", 2, ["Use a weighted mean", "(35 × 3 + 37 × 1)/4 = 35.5"], "Relative atomic mass = (35 × 3 + 37 × 1)/4 = 35.5.", "calculate a relative atomic mass from isotope abundance")],
  },
  {
    slug: "moles-concentration",
    topic: "moles",
    stem: "0.050 mol of sodium hydroxide is dissolved to make 250 cm³ of solution.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the concentration in mol dm⁻³.", 2, ["Convert 250 cm³ to 0.250 dm³", "Concentration = 0.050/0.250 = 0.200 mol dm⁻³"], "250 cm³ = 0.250 dm³. Concentration = 0.050/0.250 = 0.200 mol dm⁻³.", "calculate concentration from amount and volume")],
  },
  {
    slug: "ionic-bonding-properties",
    topic: "bonding",
    stem: "Sodium chloride has a high melting point and conducts electricity when molten but not when solid.",
    difficulty: 2,
    parts: [part("Explain these properties using its structure and bonding.", 4, ["It has a giant lattice of oppositely charged ions", "Strong electrostatic attractions require much energy to overcome", "In a solid the ions cannot move", "When molten the ions are free to move and carry charge"], "Sodium chloride has a giant ionic lattice with strong attractions between oppositely charged ions, so much energy is needed to melt it. Solid ions cannot move, but molten ions can move and carry charge.", "relate ionic structure to melting point and conductivity")],
  },
  {
    slug: "reaction-energy",
    topic: "energetics",
    stem: "A reaction warms 100 g of solution from 20.0 °C to 26.0 °C. Take the specific heat capacity as 4.18 J g⁻¹ K⁻¹.",
    kind: "calculation",
    difficulty: 3,
    calculator: true,
    parts: [part("Calculate the energy transferred to the solution.", 2, ["Use q = mcΔT", "q = 100 × 4.18 × 6.0 = 2508 J"], "q = mcΔT = 100 × 4.18 × 6.0 = 2508 J, or 2.508 kJ.", "calculate energy change using calorimetry")],
  },
  {
    slug: "rate-surface-area",
    topic: "kinetics",
    stem: "The same mass of calcium carbonate reacts with acid as chips and as powder. The powder reacts faster.",
    difficulty: 2,
    parts: [part("Explain why the powder reacts faster and state one variable that must be controlled.", 3, ["Powder has a larger surface area", "More particles collide with acid each second", "Temperature, acid concentration or mass should be kept constant"], "The powder has a larger surface area, so more particles collide successfully with acid each second. The acid concentration, temperature or mass should be controlled.", "explain collision frequency and control variables")],
  },
  {
    slug: "equilibrium-temperature",
    topic: "equilibria",
    stem: "A reversible reaction is exothermic in the forward direction. The equilibrium mixture becomes paler when the temperature is increased.",
    difficulty: 3,
    parts: [part("Explain the change using Le Chatelier's principle.", 3, ["The system opposes the temperature increase", "The endothermic reverse reaction is favoured", "The concentration of the coloured product decreases"], "Increasing temperature favours the endothermic reverse reaction because the equilibrium opposes the temperature change. The coloured product concentration therefore decreases and the mixture becomes paler.", "predict equilibrium shifts after a temperature change")],
  },
  {
    slug: "neutralisation-calculation",
    topic: "acids-bases",
    stem: "25.0 cm³ of 0.100 mol dm⁻³ hydrochloric acid neutralises sodium hydroxide in a 1:1 reaction.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Calculate the moles of hydrochloric acid used and the moles of sodium hydroxide neutralised.", 3, ["Convert 25.0 cm³ to 0.0250 dm³", "Moles HCl = 0.100 × 0.0250 = 0.00250 mol", "The 1:1 equation gives 0.00250 mol NaOH"], "25.0 cm³ = 0.0250 dm³. Moles HCl = 0.100 × 0.0250 = 0.00250 mol. The 1:1 reaction therefore neutralises 0.00250 mol NaOH.", "use concentration, volume and stoichiometric ratio in neutralisation")],
  },
  {
    slug: "oxidation-state",
    topic: "redox",
    stem: "In the reaction Zn + Cu²⁺ → Zn²⁺ + Cu, zinc forms Zn²⁺.",
    difficulty: 1,
    parts: [part("Identify which substance is oxidised and explain why.", 2, ["Zinc is oxidised", "Its oxidation state rises from 0 to +2 because it loses two electrons"], "Zinc is oxidised because its oxidation state increases from 0 to +2; it loses two electrons to form Zn²⁺.", "identify oxidation using electron loss and oxidation state", ["AO1", "AO2"])],
  },
  {
    slug: "periodic-trend",
    topic: "periodicity",
    stem: "Across a period, atomic radius generally decreases from left to right.",
    difficulty: 2,
    parts: [part("Explain this trend.", 3, ["Nuclear charge increases", "Electrons are added to the same principal energy level", "The stronger attraction pulls the outer electrons closer to the nucleus"], "Nuclear charge increases while added electrons enter the same main shell. Attraction between the nucleus and outer electrons becomes stronger, so atomic radius decreases.", "explain a periodic trend using nuclear charge and shielding")],
  },
  {
    slug: "transition-catalyst",
    topic: "transition-metals",
    stem: "Iron is used as a catalyst in the Haber process.",
    difficulty: 2,
    parts: [part("State what a catalyst does and explain why it is not used up overall.", 3, ["It provides an alternative reaction pathway", "The alternative pathway has a lower activation energy", "It is regenerated and is chemically unchanged at the end"], "A catalyst provides an alternative pathway with lower activation energy. It participates in steps but is regenerated, so it is not used up overall.", "describe catalytic action")],
  },
  {
    slug: "alkane-combustion",
    topic: "organic-basics",
    stem: "Propane is a hydrocarbon in the alkane homologous series.",
    difficulty: 2,
    parts: [part("Write the balanced equation for complete combustion of propane and state the general formula of alkanes.", 3, ["Products are carbon dioxide and water", "C₃H₈ + 5O₂ → 3CO₂ + 4H₂O", "Alkanes have general formula CₙH₂ₙ₊₂"], "Complete combustion is C₃H₈ + 5O₂ → 3CO₂ + 4H₂O. Alkanes have general formula CₙH₂ₙ₊₂.", "write combustion equations and identify an alkane homologous series", ["AO1", "AO2"])],
  },
  {
    slug: "alkene-bromine",
    topic: "hydrocarbons",
    stem: "An unknown hydrocarbon decolourises bromine water at room temperature.",
    kind: "mcq",
    difficulty: 1,
    options: ["It is saturated and contains only single bonds", "It is unsaturated and contains a carbon-carbon double bond", "It is an ionic compound", "It is a noble gas"],
    correctIndex: 1,
    parts: [part("Identify the structural feature indicated by the test.", 1, ["Bromine water is decolourised by an alkene double bond"], "The hydrocarbon is unsaturated and contains a carbon-carbon double bond.", "use the bromine-water test for an alkene", ["AO1"])],
  },
  {
    slug: "carboxylic-acid-reaction",
    topic: "carbonyls-acids",
    stem: "Ethanoic acid reacts with sodium carbonate.",
    difficulty: 2,
    parts: [part("Describe the observation and name the gas produced.", 2, ["There is fizzing or effervescence", "Carbon dioxide is produced and turns limewater milky"], "The mixture fizzes because carbon dioxide is produced. The gas turns limewater milky.", "identify the reaction of a carboxylic acid with a carbonate")],
  },
  {
    slug: "amine-basicity",
    topic: "aromatics-nitrogen",
    stem: "Amines can act as bases in water.",
    difficulty: 3,
    parts: [part("Explain how methylamine acts as a base.", 2, ["The nitrogen has a lone pair of electrons", "It accepts a proton from water to form methylammonium and hydroxide ions"], "Methylamine's nitrogen lone pair accepts a proton from water, forming methylammonium ions and hydroxide ions.", "explain amine basicity using a lone pair")],
  },
  {
    slug: "infrared-identification",
    topic: "spectroscopy",
    stem: "An infrared spectrum has a strong broad absorption around 3300 cm⁻¹ and no strong absorption around 1700 cm⁻¹.",
    kind: "mcq",
    difficulty: 3,
    options: ["An alcohol O–H group", "A carbonyl C=O group only", "An alkane with no functional group", "A metal ion"],
    correctIndex: 0,
    parts: [part("Suggest the functional group shown by the spectrum.", 1, ["A broad absorption around 3300 cm⁻¹ is consistent with an O–H bond"], "The spectrum suggests an alcohol O–H group.", "identify an alcohol from an infrared absorption", ["AO2"])],
  },
];

const physics: GcseItem[] = [
  {
    slug: "acceleration-calculation",
    topic: "kinematics-dynamics",
    stem: "A car increases its speed from 8 m s⁻¹ to 20 m s⁻¹ in 6 seconds.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate its average acceleration.", 2, ["Use a = (v − u)/t", "a = (20 − 8)/6 = 2.0 m s⁻²"], "a = (20 − 8)/6 = 2.0 m s⁻².", "calculate acceleration from change in velocity")],
  },
  {
    slug: "power-from-energy",
    topic: "energy-power",
    stem: "A motor transfers 18 000 J of energy in 30 seconds.",
    kind: "calculation",
    difficulty: 1,
    parts: [part("Calculate its power.", 2, ["Use power = energy/time", "P = 18 000/30 = 600 W"], "P = 18 000/30 = 600 W.", "calculate power from energy and time")],
  },
  {
    slug: "elastic-extension",
    topic: "materials",
    stem: "A spring extends by 0.040 m when a force of 6.0 N is applied, within its limit of proportionality.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the spring constant.", 2, ["Use F = ke", "k = 6.0/0.040 = 150 N m⁻¹"], "k = F/e = 6.0/0.040 = 150 N m⁻¹.", "use Hooke's law within the limit of proportionality")],
  },
  {
    slug: "wave-speed",
    topic: "waves",
    stem: "A wave has frequency 5.0 Hz and wavelength 0.80 m.",
    kind: "calculation",
    difficulty: 1,
    parts: [part("Calculate its speed.", 2, ["Use v = fλ", "v = 5.0 × 0.80 = 4.0 m s⁻¹"], "v = fλ = 5.0 × 0.80 = 4.0 m s⁻¹.", "calculate wave speed from frequency and wavelength")],
  },
  {
    slug: "photon-energy",
    topic: "quantum",
    stem: "A photon has frequency 6.0 × 10¹⁴ Hz. Use h = 6.63 × 10⁻³⁴ J s.",
    kind: "calculation",
    difficulty: 3,
    calculator: true,
    parts: [part("Calculate the photon energy.", 2, ["Use E = hf", "E = 6.63 × 10⁻³⁴ × 6.0 × 10¹⁴ = 3.98 × 10⁻¹⁹ J"], "E = hf = (6.63 × 10⁻³⁴)(6.0 × 10¹⁴) = 3.98 × 10⁻¹⁹ J.", "calculate photon energy from frequency")],
  },
  {
    slug: "series-current",
    topic: "electric-circuits",
    stem: "Two resistors of 4 Ω and 6 Ω are connected in series to a 10 V supply.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the current in the circuit.", 3, ["Series resistance = 4 + 6 = 10 Ω", "Use V = IR", "I = 10/10 = 1.0 A"], "The total resistance is 10 Ω. I = V/R = 10/10 = 1.0 A.", "combine series resistance and use Ohm's law")],
  },
  {
    slug: "momentum-change",
    topic: "momentum",
    stem: "A 0.50 kg ball moving at 12 m s⁻¹ is brought to rest.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the change in momentum.", 2, ["Initial momentum = 0.50 × 12 = 6.0 kg m s⁻¹", "Final momentum is 0, so change = −6.0 kg m s⁻¹"], "Initial momentum is 6.0 kg m s⁻¹ and final momentum is zero, so the change is −6.0 kg m s⁻¹; its magnitude is 6.0 kg m s⁻¹.", "calculate momentum change and interpret its sign")],
  },
  {
    slug: "circular-motion-force",
    topic: "circular-shm",
    stem: "A 2.0 kg object moves in a circle at constant speed.",
    difficulty: 2,
    parts: [part("Explain why the object is accelerating even though its speed is constant.", 2, ["Velocity includes direction as well as speed", "The direction changes continuously, so velocity changes and there is acceleration towards the centre"], "The velocity changes because its direction changes continuously. Therefore the object accelerates towards the centre even though its speed is constant.", "distinguish speed from velocity in circular motion")],
  },
  {
    slug: "gravitational-field",
    topic: "fields",
    stem: "The gravitational field strength at the surface of a planet is 3.0 N kg⁻¹.",
    kind: "calculation",
    difficulty: 1,
    parts: [part("Calculate the weight of a 50 kg object on the planet.", 2, ["Use W = mg", "W = 50 × 3.0 = 150 N"], "W = mg = 50 × 3.0 = 150 N.", "calculate weight from gravitational field strength")],
  },
  {
    slug: "thermal-insulation",
    topic: "thermal",
    stem: "A house loses heat through its roof and windows in winter.",
    kind: "extended",
    difficulty: 2,
    parts: [part("Explain how loft insulation and double glazing reduce energy loss.", 4, ["Loft insulation traps air", "Trapped air is a poor conductor and reduces conduction", "Double glazing traps a layer of air or inert gas", "The reduced temperature gradient and movement lower conduction and convection"], "Loft insulation traps air, which is a poor conductor, reducing conduction through the roof. Double glazing traps air or inert gas between panes, reducing conduction and convection through the windows.", "explain how insulation reduces thermal transfer")],
  },
  {
    slug: "half-life-data",
    topic: "nuclear",
    stem: "A radioactive sample has a count rate of 800 counts per minute. Its half-life is 6 hours.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the count rate after 18 hours, ignoring background radiation.", 3, ["18 hours is three half-lives", "800 → 400 → 200 → 100 counts per minute", "The count rate is 100 counts per minute"], "18 hours is three half-lives, so the count rate is 800 × (1/2)³ = 100 counts per minute.", "apply half-life to radioactive decay")],
  },
];

const subjectIds = {
  maths: ["wjec-gcse-maths", "aqa-gcse-maths", "edexcel-gcse-maths", "ocr-gcse-maths"],
  biology: ["wjec-gcse-biology", "aqa-gcse-biology", "edexcel-gcse-biology", "ocr-gcse-biology"],
  chemistry: ["wjec-gcse-chemistry", "aqa-gcse-chemistry", "edexcel-gcse-chemistry", "ocr-gcse-chemistry"],
  physics: ["wjec-gcse-physics", "aqa-gcse-physics", "edexcel-gcse-physics", "ocr-gcse-physics"],
} as const;

export const gcseExpansionQuestions: Question[] = [
  ...subjectIds.maths.flatMap((subjectId) => buildQuestions(subjectId, maths)),
  ...subjectIds.biology.flatMap((subjectId) => buildQuestions(subjectId, biology)),
  ...subjectIds.chemistry.flatMap((subjectId) => buildQuestions(subjectId, chemistry)),
  ...subjectIds.physics.flatMap((subjectId) => buildQuestions(subjectId, physics)),
];
