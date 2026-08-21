import type { AoCode, Question, QuestionKind } from "@/domain/types";
import { defineQuestion } from "./authoring";

/** Original OCR A-Level exam-style material mapped to the authored OCR curriculum. */

type Discipline = "biology" | "chemistry" | "maths" | "physics";

interface OcrPart {
  prompt: string;
  marks: number;
  scheme: string[];
  answer: string;
  claim: string;
  point?: number;
  aos?: AoCode[];
}

interface OcrItem {
  slug: string;
  topic: string;
  stem: string;
  parts: OcrPart[];
  kind?: QuestionKind;
  options?: string[];
  correctIndex?: number;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  calculator?: boolean;
}

function part(
  prompt: string,
  marks: number,
  scheme: string[],
  answer: string,
  claim: string,
  point = 1,
  aos: AoCode[] = ["AO2"],
): OcrPart {
  return { prompt, marks, scheme, answer, claim, point, aos };
}

function buildQuestion(discipline: Discipline, item: OcrItem): Question {
  const subjectId = `ocr-alevel-${discipline}`;
  const prefix = `${subjectId}.${item.topic}`;
  return defineQuestion({
    slug: `ocr-authored-${discipline}-${item.slug}`,
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
    reviewer: "authored/ocr-expansion-review",
    lastChecked: "2026-08-18",
    specVersion: "2024-1.0",
    parts: item.parts.map((current) => ({
      prompt: current.prompt,
      marks: current.marks,
      scheme: current.scheme,
      answer: current.answer,
      aos: current.aos,
      specPointIds: [`${prefix}.sp-${String(current.point ?? 1).padStart(2, "0")}`],
      learningClaims: [current.claim],
    })),
  });
}

const biology: OcrItem[] = [
  {
    slug: "magnification",
    topic: "cell-structure",
    stem: "An image of a mitochondrion is 18 mm long. Its actual length is 6.0 μm.",
    difficulty: 2,
    kind: "calculation",
    calculator: false,
    parts: [part("Calculate the magnification of the image.", 2, ["Convert 18 mm to 18 000 μm", "Magnification = image size ÷ actual size = 18 000/6.0 = 3000"], "18 mm = 18 000 μm. Magnification = 18 000/6.0 = ×3000.", "calculate magnification and explain resolution of light and electron microscopy", 3, ["AO2"])],
  },
  {
    slug: "water-potential",
    topic: "membranes-transport",
    stem: "A Visking tubing bag contains a sucrose solution with a water potential of −350 kPa. It is placed in distilled water, whose water potential is 0 kPa.",
    difficulty: 3,
    parts: [part("Explain the direction of water movement and predict two changes to the bag.", 3, ["Water moves from the higher water potential outside to the lower water potential inside", "Water enters through the partially permeable membrane by osmosis", "The bag gains mass and its volume or turgidity increases"], "Water moves from the distilled water, at 0 kPa, into the sucrose solution, at −350 kPa, by osmosis through the partially permeable membrane. The bag gains mass and becomes larger or more turgid.", "describe osmosis and water potential", 3, ["AO2"])],
  },
  {
    slug: "bohr-effect",
    topic: "transport-animals",
    stem: "Blood leaving an exercising muscle contains more carbon dioxide than blood at rest. At the same oxygen partial pressure, haemoglobin saturation is lower in the blood from the exercising muscle.",
    difficulty: 4,
    kind: "extended",
    parts: [part("Explain this observation and its advantage to the muscle.", 4, ["Carbon dioxide reacts with water to form carbonic acid, which dissociates and increases hydrogen ion concentration", "The lower pH changes haemoglobin's shape and lowers its affinity for oxygen", "The oxygen dissociation curve shifts to the right", "More oxygen is unloaded at the respiring muscle"], "Carbon dioxide forms carbonic acid in the blood, increasing hydrogen ion concentration and lowering pH. This reduces haemoglobin's affinity for oxygen, shifting the dissociation curve to the right. More oxygen is therefore released to the exercising muscle.", "describe transport of oxygen by haemoglobin including Bohr effect", 5, ["AO2", "AO3"])],
  },
  {
    slug: "hardy-weinberg-frequency",
    topic: "genetics-inheritance",
    stem: "In a large population, 9% of individuals show a recessive phenotype. Assume the population is in Hardy–Weinberg equilibrium.",
    difficulty: 4,
    kind: "calculation",
    calculator: false,
    parts: [part("Calculate the recessive allele frequency, the dominant allele frequency and the percentage of carriers.", 4, ["q² = 0.09, so q = 0.30", "p = 1 − q = 0.70", "Carrier frequency is 2pq = 2 × 0.70 × 0.30 = 0.42", "Therefore 42% of the population are heterozygous carriers"], "The recessive phenotype frequency is q² = 0.09, so q = 0.30 and p = 0.70. The carrier frequency is 2pq = 2 × 0.70 × 0.30 = 0.42, so 42% are carriers.", "explain Hardy Weinberg equilibrium and calculations", 5, ["AO2"])],
  },
];

const chemistry: OcrItem[] = [
  {
    slug: "ionisation-energy-exception",
    topic: "atomic-structure",
    kind: "mcq",
    stem: "The first ionisation energy of oxygen is lower than that of nitrogen, despite oxygen having the greater nuclear charge.",
    options: [
      "Oxygen has fewer occupied shells than nitrogen",
      "One of oxygen's 2p orbitals contains a pair of electrons, causing extra repulsion",
      "Nitrogen has a full 2p subshell",
      "Oxygen has a lower mass number than nitrogen",
    ],
    correctIndex: 1,
    difficulty: 3,
    parts: [part("Select the best explanation.", 1, ["The paired 2p electrons in oxygen repel one another, so one is easier to remove"], "Oxygen has a paired set of 2p electrons. Repulsion within that pair makes the first electron easier to remove than an electron from nitrogen's half-filled 2p subshell.", "explain exceptions to ionisation energy trends by sub-shell structure", 5, ["AO2"])],
  },
  {
    slug: "rate-equation-data",
    topic: "kinetics",
    stem: "For a reaction, the rate is 2.0 × 10⁻³ mol dm⁻³ s⁻¹ when [A] = 0.10 mol dm⁻³ and [B] = 0.10 mol dm⁻³. Doubling [A] alone doubles the rate; doubling [B] alone increases the rate by a factor of four.",
    difficulty: 4,
    kind: "calculation",
    calculator: false,
    parts: [part("Deduce the rate equation and calculate the value and units of k.", 4, ["The reaction is first order with respect to A", "The reaction is second order with respect to B", "Rate = k[A][B]²", "k = (2.0 × 10⁻³)/(0.10 × 0.10²) = 2.0 dm⁶ mol⁻² s⁻¹"], "Doubling [A] doubles the rate, so the order in A is one. Doubling [B] quadruples the rate, so the order in B is two. The rate equation is rate = k[A][B]². Thus k = 2.0 × 10⁻³/(0.10 × 0.10²) = 2.0 dm⁶ mol⁻² s⁻¹.", "deduce rate equations from experimental data", 5, ["AO2"])],
  },
  {
    slug: "weak-acid-ph",
    topic: "acids-bases",
    stem: "A weak acid HA has concentration 0.100 mol dm⁻³ and Ka = 1.8 × 10⁻⁵ mol dm⁻³ at 298 K.",
    difficulty: 4,
    kind: "calculation",
    calculator: true,
    parts: [part("Calculate the pH of the acid solution, assuming the weak-acid approximation is valid.", 3, ["[H⁺] = √(Ka × [HA])", "[H⁺] = √(1.8 × 10⁻⁵ × 0.100) = 1.34 × 10⁻³ mol dm⁻³", "pH = −log₁₀(1.34 × 10⁻³) = 2.87"], "[H⁺] = √(Ka[HA]) = √(1.8 × 10⁻⁵ × 0.100) = 1.34 × 10⁻³ mol dm⁻³. Therefore pH = 2.87.", "calculate pH for weak acids using Ka expression", 3, ["AO2"])],
  },
  {
    slug: "propanoic-acid-spectra",
    topic: "spectroscopy",
    stem: "An organic compound has formula C₃H₆O₂. Its IR spectrum has a strong absorption near 1715 cm⁻¹ and a broad absorption from 2500 to 3300 cm⁻¹. Its proton NMR contains a triplet for 3H near δ 1.1, a quartet for 2H near δ 2.3 and a broad signal for 1H.",
    difficulty: 4,
    parts: [part("Deduce the structure and justify it using the spectral data.", 4, ["The absorption near 1715 cm⁻¹ indicates a carbonyl group", "The broad 2500–3300 cm⁻¹ absorption indicates a carboxylic acid O–H", "The triplet and quartet show a CH₃CH₂ group", "The structure is propanoic acid, CH₃CH₂COOH"], "The IR spectrum shows a carbonyl and a carboxylic acid O–H. The triplet and quartet indicate an ethyl group, so the compound is propanoic acid, CH₃CH₂COOH.", "combine spectroscopic data to determine structure", 4, ["AO2", "AO3"])],
  },
];

const maths: OcrItem[] = [
  {
    slug: "modulus-transformation",
    topic: "algebra",
    stem: "The graph y = |x| is transformed to y = 2|x − 2| − 3.",
    difficulty: 3,
    calculator: false,
    parts: [part("State the coordinates of the vertex and describe the transformations.", 3, ["The vertex is (2, −3)", "The graph is translated 2 units to the right", "It is stretched vertically by scale factor 2 and translated 3 units down"], "The vertex is (2, −3). Starting with y = |x|, translate 2 units right, stretch vertically by factor 2, and translate 3 units down.", "sketch curves including transformations and modulus", 6, ["AO2", "AO3"])],
  },
  {
    slug: "rectangle-optimisation",
    topic: "differentiation",
    stem: "A rectangle has perimeter 40 m. Let one side have length x m, so the other side has length (20 − x) m.",
    difficulty: 4,
    kind: "calculation",
    calculator: false,
    parts: [part("Use differentiation to find the dimensions that give the maximum area.", 4, ["A = x(20 − x) = 20x − x²", "dA/dx = 20 − 2x, so the stationary point has x = 10", "d²A/dx² = −2 < 0, so the stationary point is a maximum", "Both dimensions are 10 m and the maximum area is 100 m²"], "A = 20x − x², so dA/dx = 20 − 2x. Setting this to zero gives x = 10. Since d²A/dx² = −2, the area is maximised when both sides are 10 m and the maximum area is 100 m².", "apply differentiation to rates tangents normals and optimisation", 4, ["AO2", "AO3"])],
  },
  {
    slug: "integration-by-parts",
    topic: "integration",
    stem: "Consider the indefinite integral ∫ x e²ˣ dx.",
    difficulty: 4,
    kind: "calculation",
    calculator: false,
    parts: [part("Evaluate the integral using integration by parts.", 4, ["Choose u = x and dv = e²ˣ dx", "du = dx and v = ½e²ˣ", "∫x e²ˣ dx = ½x e²ˣ − ¼e²ˣ + C", "Equivalent answer: ¼e²ˣ(2x − 1) + C"], "With u = x and dv = e²ˣ dx, v = ½e²ˣ. Therefore ∫x e²ˣ dx = ½x e²ˣ − ¼e²ˣ + C = ¼e²ˣ(2x − 1) + C.", "apply integration by substitution and by parts", 3, ["AO2"])],
  },
  {
    slug: "normal-mean-test",
    topic: "distributions",
    stem: "A population has known standard deviation 6. A random sample of 36 has mean 52.1. Test H₀: μ = 50 against H₁: μ > 50 at the 5% significance level. Use the critical value 1.645.",
    difficulty: 4,
    kind: "calculation",
    calculator: true,
    parts: [part("Calculate the test statistic and state the conclusion in context.", 4, ["The standard error is 6/√36 = 1", "z = (52.1 − 50)/1 = 2.10", "2.10 is greater than the 5% critical value 1.645, so reject H₀", "There is significant evidence that the population mean is greater than 50"], "The standard error is 1, so z = (52.1 − 50)/1 = 2.10. Since 2.10 > 1.645, reject H₀. There is significant evidence that the population mean is greater than 50.", "interpret significance levels and critical regions", 4, ["AO2", "AO3"])],
  },
];

const physics: OcrItem[] = [
  {
    slug: "impulse-force-graph",
    topic: "kinematics-dynamics",
    stem: "A 0.80 kg ball experiences a force that rises linearly from 0 to 120 N in 0.020 s, then falls linearly to 0 N over the next 0.030 s.",
    difficulty: 4,
    kind: "calculation",
    calculator: false,
    parts: [part("Calculate the impulse and the resulting change in velocity.", 4, ["The first triangular area is ½ × 0.020 × 120 = 1.2 N s", "The second triangular area is ½ × 0.030 × 120 = 1.8 N s", "Total impulse is 3.0 N s", "Δv = impulse/mass = 3.0/0.80 = 3.75 m s⁻¹"], "The impulse is the area under the force–time graph: 1.2 + 1.8 = 3.0 N s. Therefore Δv = I/m = 3.0/0.80 = 3.75 m s⁻¹.", "interpret force-time and momentum-time graphs including impulse as area", 8, ["AO2"])],
  },
  {
    slug: "potentiometer-emf",
    topic: "electric-circuits",
    stem: "A potentiometer gives a balance length of 0.42 m for an unknown cell and 0.60 m for a 1.50 V reference cell, with the same current through the wire in both measurements.",
    difficulty: 3,
    kind: "calculation",
    calculator: false,
    parts: [part("Calculate the unknown EMF and explain one advantage of the potentiometer method.", 3, ["For the same wire, EMF is proportional to balance length", "E/1.50 = 0.42/0.60, so E = 1.05 V", "At balance no current is drawn from the test cell, so there is no lost volts from its internal resistance"], "E/1.50 = 0.42/0.60, giving E = 1.05 V. A potentiometer draws no current from the test cell at balance, so the measured EMF is not reduced by internal resistance.", "describe the potentiometer and its use for comparing emfs", 7, ["AO2", "AO3"])],
  },
  {
    slug: "stress-strain-limits",
    topic: "materials",
    stem: "A stress–strain graph for a metal is a straight line from the origin until point X, then becomes curved. If the metal is unloaded from point Y in the curved region, the graph does not return to the origin.",
    difficulty: 3,
    kind: "extended",
    parts: [part("Explain what points X and Y show about the material.", 3, ["X is the limit of proportionality, after which stress is no longer proportional to strain", "Y is beyond the elastic limit", "Unloading from Y leaves permanent strain, showing plastic deformation"], "X is the limit of proportionality because the graph stops being linear. Y lies beyond the elastic limit; unloading from there leaves a permanent strain, so the material has undergone plastic deformation.", "interpret force-extension and stress-strain graphs to identify proportional limit and yield", 5, ["AO2", "AO3"])],
  },
  {
    slug: "decay-constant",
    topic: "nuclear",
    stem: "A radioactive source has a half-life of 8.0 days and an initial activity of 640 kBq.",
    difficulty: 3,
    kind: "calculation",
    calculator: true,
    parts: [part("Calculate the decay constant in s⁻¹ and the activity after 24 days.", 4, ["Convert the half-life: 8.0 × 24 × 3600 = 691 200 s", "λ = ln 2/t½ = 1.00 × 10⁻⁶ s⁻¹", "24 days is three half-lives", "Activity = 640/2³ = 80 kBq"], "The half-life is 691 200 s, so λ = ln2/691 200 = 1.00 × 10⁻⁶ s⁻¹. Twenty-four days is three half-lives, giving an activity of 640/8 = 80 kBq.", "define activity decay constant half-life and use A equals lambda N and N equals N0 exp minus lambda t", 3, ["AO2"])],
  },
];

const catalogues: Record<Discipline, OcrItem[]> = { biology, chemistry, maths, physics };

export const ocrAuthoredQuestions: Question[] = (Object.entries(catalogues) as Array<[Discipline, OcrItem[]]>).flatMap(
  ([discipline, items]) => items.map((item) => buildQuestion(discipline, item)),
);
