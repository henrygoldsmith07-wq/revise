import type { AoCode, Question, QuestionKind } from "@/domain/types";
import { defineQuestion } from "./authoring";

/**
 * Evidence-pass expansion (2026-08): examiner-style items written against the
 * gaps named in the marking-validation audit — evaluate/compare command
 * words, synoptic links across units, practical-method questions, multi-step
 * calculations, and misconception-targeting MCQs. Authored original material
 * with full provenance; nothing here is copied from a live paper.
 */

type Discipline = "biology" | "chemistry" | "maths" | "physics";

interface ExpansionPart {
  prompt: string;
  marks: number;
  scheme: string[];
  answer: string;
  claim: string;
  point?: number;
  aos?: AoCode[];
}

interface ExpansionItem {
  slug: string;
  topic: string;
  stem: string;
  parts: ExpansionPart[];
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
  aos: AoCode[] = ["AO2"],
): ExpansionPart {
  return { prompt, marks, scheme, answer, claim, aos };
}

function buildQuestion(subjectId: string, item: ExpansionItem): Question {
  const prefix = `${subjectId}.${item.topic}`;
  return defineQuestion({
    slug: `evidence-${subjectId}-${item.slug}`,
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
    reviewer: "authored/evidence-pass-review",
    lastChecked: "2026-08-21",
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

// ---------------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------------

const physics: ExpansionItem[] = [
  {
    slug: "centripetal-practical-evaluate",
    topic: "circular-shm",
    difficulty: 4,
    calculator: true,
    stem: "A student whistles a rubber bung on a string in a horizontal circle and measures the period with a stopwatch for five different radii, keeping the tension provided by a hanging mass constant. Describe how the student should determine the period accurately, and evaluate one limitation of using a handheld stopwatch at this rotation speed.",
    parts: [
      part(
        "Describe one method to measure the period accurately with the equipment given.",
        3,
        [
          "Time a large number of consecutive rotations (e.g. 10+) and divide by the count",
          "Timing starts when the bung passes a fixed reference marker",
          "Repeats taken and averaged to reduce random timing error",
        ],
        "Time a large number of consecutive rotations — ten or more — and divide the total time by the count of rotations. Start timing when the bung passes a fixed reference marker, and take repeats of the whole run, averaging the results to reduce random error.",
        "Practical techniques for measuring periodic motion reduce random error.",
        ["AO1", "AO2"],
      ),
      part(
        "Evaluate the stopwatch limitation and state, with a reason, whether a light gate would improve the measurement.",
        3,
        [
          "Human reaction time (~0.2 s) is a significant fraction of one short period",
          "Counting many rotations makes reaction-time error negligible per rotation",
          "A light gate removes human reaction time entirely so improves precision",
        ],
        "Human reaction time of about 0.2 s is large compared with a single fast rotation, but dividing a long timed run over many rotations makes its effect small; a light gate would remove reaction time altogether and improve precision further.",
        "Evaluation of measurement limitations and instrument choice.",
        ["AO2", "AO3"],
      ),
    ],
  },
  {
    slug: "satellite-orbit-synoptic",
    topic: "fields",
    difficulty: 5,
    calculator: true,
    stem: "A communications satellite is moved from a low circular orbit (400 km) to a higher circular orbit (36 000 km). Use ideas about gravitational fields and energy to explain what must be done to raise the orbit, and evaluate the claim that 'a higher orbit means the satellite travels faster'.",
    parts: [
      part(
        "Explain why the satellite's speed in a stable circular orbit depends only on the orbital radius.",
        3,
        [
          "Gravitational force provides the centripetal force: GMm/r² = v²/r",
          "Cancelling m and solving gives v = √(GM/r)",
          "Speed therefore decreases as orbital radius increases",
        ],
        "Setting gravitational force equal to the required centripetal force gives GMm/r² = mv²/r, so v = √(GM/r); the speed depends only on the radius and decreases as the orbit grows larger.",
        "Circular motion in a gravitational field links force, field strength and orbital speed.",
        ["AO1", "AO2"],
      ),
      part(
        "Evaluate the claim that a higher orbit means the satellite travels faster.",
        3,
        [
          "From v = √(GM/r) the orbital speed is lower at larger r, so the claim is wrong for orbital speed",
          "Total energy (less negative at larger r) increases, so more work is needed to raise the orbit",
          "Distinguishes speed from energy: raising the orbit needs energy input yet yields lower speed",
        ],
        "The claim is incorrect: v = √(GM/r) shows orbital speed falls as radius rises. Raising the orbit does require net energy input because the total energy becomes less negative, but that energy goes into potential energy, not extra speed.",
        "Energy considerations in gravitational fields; evaluating claims quantitatively.",
        ["AO2", "AO3"],
      ),
    ],
  },
  {
    slug: "third-law-misconception",
    topic: "kinematics-dynamics",
    difficulty: 2,
    kind: "mcq",
    stem: "A book rests on a table. Which pair of forces is a Newton's-third-law pair?",
    options: [
      "The weight of the book, and the upward normal force of the table on the book",
      "The normal force of the book on the table, and the normal force of the table on the book",
      "The weight of the book, and the gravitational pull of the book on the Earth",
      "The normal force of the table on the book, and the weight of the table",
    ],
    correctIndex: 1,
    parts: [part("Select the correct third-law pairing.", 1, ["Third-law pairs act on different bodies and are of the same type"], "Third-law pairs act on different bodies, are equal in magnitude, opposite in direction, and of the same type of force.", "Newton's third law identifies force pairs.", ["AO1"])],
  },
  {
    slug: "projectile-data-interpretation",
    topic: "kinematics-dynamics",
    difficulty: 4,
    calculator: true,
    stem: "In a laboratory, a ball is launched horizontally at 4.0 m/s from a bench of height 0.80 m. Calculate the time of flight, the horizontal range, and explain why the horizontal velocity can be treated as constant.",
    parts: [
      part("Calculate the time of flight.", 2, ["Vertical motion: s = ½gt²", "t = √(2s/g) = √(2×0.80/9.8)", "t ≈ 0.40 s"], "Vertically: 0.80 = ½(9.8)t² so t = √(0.163) ≈ 0.40 s.", "Projectile motion separates into independent components.", ["AO2"]),
      part("Calculate the horizontal range.", 2, ["Range = horizontal speed × time", "range = 4.0 × 0.40", "range ≈ 1.6 m"], "Range = 4.0 × 0.40 = 1.6 m.", "Range follows from uniform horizontal velocity and flight time.", ["AO2"]),
      part("Explain why the horizontal velocity stays constant.", 1, ["No horizontal resultant force acts once launched (air resistance neglected)"], "With air resistance neglected there is no horizontal resultant force, and by Newton's first law the horizontal velocity remains constant.", "Newton's laws applied to projectile motion.", ["AO1", "AO2"]),
    ],
  },
];

// ---------------------------------------------------------------------------
// Chemistry
// ---------------------------------------------------------------------------

const chemistry: ExpansionItem[] = [
  {
    slug: "back-titration-purity",
    topic: "acids-bases",
    difficulty: 5,
    calculator: true,
    stem: "A 1.50 g sample of impure calcium carbonate is added to exactly 50.0 cm³ of 1.00 mol/dm³ hydrochloric acid, an excess. The remaining acid requires 22.4 cm³ of 0.500 mol/dm³ sodium hydroxide for neutralisation. Calculate the percentage purity of the calcium carbonate by mass (Mr CaCO₃ = 100.1).",
    parts: [
      part("Calculate the moles of acid initially added and of NaOH used in the back-titration.", 2, ["initial HCl = 0.0500 dm³ × 1.00 = 0.0500 mol", "NaOH = 0.0224 dm³ × 0.500 = 0.0112 mol", "NaOH : HCl is 1:1 so excess HCl = 0.0112 mol"], "Initial acid: 0.0500 mol. NaOH used: 0.0112 mol, which neutralised 0.0112 mol of the leftover acid (1:1).", "Volumetric calculation of amount of substance.", ["AO2"]),
      part("Calculate the moles of acid consumed by the carbonate and hence the mass of pure CaCO₃.", 3, ["HCl reacting with CaCO₃ = 0.0500 − 0.0112 = 0.0388 mol", "CaCO₃ + 2HCl → CaCl₂ + H₂O + CO₂ so CaCO₃ = 0.0388/2 = 0.0194 mol", "mass CaCO₃ = 0.0194 × 100.1 = 1.94 g"], "Acid consumed by the carbonate: 0.0500 − 0.0112 = 0.0388 mol. CaCO₃ reacts 1:2, so n(CaCO₃) = 0.0194 mol, mass = 0.0194 × 100.1 ≈ 1.94 g.", "Stoichiometry of carbonate–acid reaction applied to assay.", ["AO2"]),
      part("Explain whether the stated percentage purity is physically possible, and conclude what this indicates about the data.", 2, ["purity = 1.94/1.50 × 100 = 129%", "Purity above 100% is impossible for an impure sample", "Concludes a measurement or assumption error (e.g. concentration mislabelled)"], "Purity = 1.94/1.50 ≈ 129%, impossible for an impure sample; the data must contain an error such as a mislabelled concentration or volume.", "Evaluating quantitative results for physical plausibility.", ["AO2", "AO3"]),
    ],
  },
  {
    slug: "colorimetry-method",
    topic: "energetics",
    difficulty: 3,
    stem: "A student wants to find the concentration of blue copper(II) sulfate solution using a colorimeter. Outline a method, including how the colorimeter is calibrated and how the result is obtained.",
    parts: [
      part(
        "Outline a valid colorimetric method with calibration.",
        4,
        [
          "Prepare a series of standard CuSO₄ solutions of known concentration",
          "Zero/calibrate the colorimeter with distilled water choosing a suitable filter wavelength",
          "Measure absorbance of each standard and plot a calibration curve",
          "Read the unknown concentration from the curve via its absorbance",
        ],
        "Prepare standard solutions of known concentration, zero the colorimeter on distilled water with an appropriate filter, measure each standard's absorbance, plot absorbance against concentration, then read the unknown's concentration from its measured absorbance on the calibration curve.",
        "Instrumental methods quantify concentration by comparison with standards.",
        ["AO1", "AO2"],
      ),
    ],
  },
  {
    slug: "strong-vs-concentrated-misconception",
    topic: "acids-bases",
    difficulty: 2,
    kind: "mcq",
    stem: "Which statement correctly compares 0.5 mol/dm³ ethanoic acid (weak) with 0.01 mol/dm³ hydrochloric acid (strong)?",
    options: [
      "The hydrochloric acid has the lower pH because it is fully ionised in solution",
      "The ethanoic acid has the lower pH because it is more concentrated",
      "Both have the same pH because pH depends only on concentration",
      "Ethanoic acid has the lower pH because weak acids are safer",
    ],
    correctIndex: 0,
    parts: [part("Choose the correct comparison.", 1, ["Strong means fully ionised; weak acids are partially ionised", "pH depends on hydrogen ion concentration produced, not label strength alone"], "A strong acid is fully ionised: even dilute HCl donates essentially all its protons, while only a small fraction of concentrated ethanoic acid ionises, so the HCl solution here has the lower pH.", "'Strong' and 'concentrated' are independent properties of acids.", ["AO1", "AO2"])],
  },
];

// ---------------------------------------------------------------------------
// Biology
// ---------------------------------------------------------------------------

const biology: ExpansionItem[] = [
  {
    slug: "energy-flow-synoptic",
    topic: "ecosystems",
    difficulty: 5,
    stem: "Explain why only about 10% of the energy in a herbivore's body is incorporated into the body mass of the carnivore that eats it, linking your answer to both ecological efficiency and the biochemistry of respiration.",
    parts: [
      part(
        "Explain the ecological losses between trophic levels.",
        3,
        [
          "Not all of the prey is eaten or digested/assimilated (e.g. bone, fur, excretion)",
          "Energy lost in excretory products (urea) and egested material",
          "Large losses via respiration as heat for movement and maintaining body temperature",
        ],
        "Much of the herbivore's biomass is never assimilated by the carnivore: parts are not eaten, material is egested or excreted (e.g. urea), and a large share of assimilated energy is lost through respiration as heat during movement and thermoregulation.",
        "Energy transfers between trophic levels are inefficient and quantifiable.",
        ["AO1", "AO2"],
      ),
      part(
        "Link the respiratory loss to ATP synthesis and explain why heat cannot be recycled by producers.",
        3,
        [
          "Respiration transfers energy to ATP via oxidative phosphorylation",
          "Energy not trapped in ATP is released as heat during electron transfer",
          "Heat disperses and cannot be reconverted to chemical energy by photosynthesis; producers need light, not heat",
        ],
        "Oxidative phosphorylation traps some energy in ATP; the remainder leaves as heat. Producers rely on light energy for photosynthesis and cannot reabsorb dispersed heat, so the loss is permanent for the ecosystem.",
        "Synoptic link: respiration biochemistry constrains ecosystem energy flow.",
        ["AO2", "AO3"],
      ),
    ],
  },
  {
    slug: "water-potential-method",
    topic: "cell-structure",
    difficulty: 4,
    stem: "A student investigates the water potential of potato tissue using a serial dilution series of sucrose solutions. Describe a valid method, including the control variables that must be held constant, and state which result identifies the water potential of the tissue.",
    parts: [
      part(
        "Describe the method and key control variable.",
        4,
        [
          "Prepare serial dilutions of sucrose solution of known concentrations",
          "Cut identical potato chips (same mass/surface area) and blot before weighing",
          "Control temperature and immersion time; leave chips in each solution equally long",
          "Record percentage change in mass for each concentration",
        ],
        "Make a range of known sucrose concentrations; cut potato chips to identical initial mass and surface area, blot and weigh them; immerse one chip in each solution for the same length of time at the same temperature; reweigh and calculate percentage change in mass.",
        "Calibration curves of osmotic effects identify tissue water potential.",
        ["AO1", "AO2"],
      ),
      part(
        "State the result that identifies the potato's water potential.",
        2,
        [
          "The concentration where the graph crosses zero change in mass",
          "At that concentration there is no net water movement so solutions are isotonic to the tissue",
        ],
        "Plotting percentage mass change against concentration, the concentration giving zero change is where no net water moves — the solution is isotonic with the potato cells, identifying their water potential.",
        "Interpreting dilution-series data to locate equivalence.",
        ["AO2", "AO3"],
      ),
    ],
  },
  {
    slug: "mass-flow-misconception",
    topic: "gas-exchange",
    difficulty: 2,
    kind: "mcq",
    stem: "Fish replace water across their gills continuously by drinking. Which statement best explains why oxygen uptake still depends on ventilation of the gill surfaces?",
    options: [
      "Diffusion alone maintains a steep concentration gradient only if fresh water constantly passes over the lamellae",
      "Drinking supplies oxygen directly to the blood",
      "Ventilation matters only for carbon dioxide removal",
      "Water movement is irrelevant because blood flow sets all gas exchange rates",
    ],
    correctIndex: 0,
    parts: [part("Select the best explanation.", 1, ["Diffusion requires maintenance of a concentration gradient at the exchange surface"], "Diffusion only works while a gradient exists; ventilating the lamellae with fresh water keeps the water side oxygen-rich so uptake continues.", "Exchange surfaces need a maintained diffusion gradient.", ["AO1", "AO2"])],
  },
];

// ---------------------------------------------------------------------------
// Mathematics
// ---------------------------------------------------------------------------

const maths: ExpansionItem[] = [
  {
    slug: "optimisation-fence-model",
    topic: "differentiation",
    difficulty: 5,
    calculator: false,
    stem: "A farmer encloses a rectangular paddock against a straight river using 240 m of fencing on the three sides not bordered by the river. Show that the maximum area is achieved when the side parallel to the river is twice the width perpendicular to it, and state the maximum area.",
    parts: [
      part(
        "Set up the constraint and express area as a function of one variable.",
        3,
        [
          "If width perpendicular is x, fenced parallel side is 240 − 2x",
          "Area A(x) = x(240 − 2x)",
          "Valid domain 0 < x < 120",
        ],
        "Let the two perpendicular sides be x each; the parallel side is then 240 − 2x, so A(x) = x(240 − 2x) = 240x − 2x² for 0 < x < 120.",
        "Modelling with constraints produces a one-variable optimisation.",
        ["AO1", "AO2"],
      ),
      part(
        "Use calculus to prove the maximum and verify its nature.",
        4,
        [
          "dA/dx = 240 − 4x; setting to zero gives x = 60",
          "d²A/dx² = −2 < 0 confirming a maximum",
          "Parallel side = 240 − 2(60) = 120 m, which is twice the 60 m width",
          "Maximum area = 60 × 120 = 7200 m²",
        ],
        "dA/dx = 240 − 4x = 0 gives x = 60; since d²A/dx² = −2 < 0 this is a maximum. The parallel side is 120 m, exactly twice the width, giving A = 60 × 120 = 7200 m².",
        "Stationary points classify optima and answer modelling questions.",
        ["AO2", "AO3"],
      ),
    ],
  },
  {
    slug: "proof-irrationality",
    topic: "algebra",
    difficulty: 4,
    calculator: false,
    stem: "Prove by contradiction that √2 is irrational.",
    parts: [
      part(
        "Construct the contradiction argument.",
        4,
        [
          "Assume √2 = p/q in lowest terms with integers p, q, q ≠ 0",
          "Then p² = 2q², so p² is even and therefore p is even; write p = 2k",
          "Substituting: 4k² = 2q² ⇒ q² = 2k², so q is also even",
          "Both even contradicts lowest terms; hence no such p/q exists",
        ],
        "Suppose √2 = p/q in lowest terms. Squaring gives p² = 2q², so p² is even, forcing p even; write p = 2k. Then q² = 2k², so q is also even. Both divisible by 2 contradicts the fraction being in lowest terms, so √2 cannot be rational.",
        "Proof by contradiction establishes irrationality results.",
        ["AO1", "AO2"],
      ),
    ],
  },
  {
    slug: "exponential-cooling-model-evaluate",
    topic: "exponentials",
    difficulty: 5,
    calculator: true,
    stem: "Boiling water at 100 °C cools in a room held at 20 °C. Its temperature T(t) in °C satisfies Newton's law of cooling, dT/dt = −k(T − 20). After 10 minutes the water is at 60 °C. Find k, predict the temperature after 20 minutes, and evaluate one limitation of applying this model beyond an hour.",
    parts: [
      part(
        "Solve for k using the given data.",
        4,
        [
          "Solution form T = 20 + Ae^(−kt) with A = 80 from T(0)=100",
          "60 = 20 + 80e^(−10k)",
          "e^(−10k) = 0.5 so k = ln 2 / 10 ≈ 0.0693 min⁻¹",
        ],
        "With T = 20 + 80e^(−kt): 60 = 20 + 80e^(−10k) gives e^(−10k) = ½, so k = ln2/10 ≈ 0.0693 per minute.",
        "Exponential models are fitted from two data points.",
        ["AO1", "AO2"],
      ),
      part(
        "Predict T(20) and evaluate a model limitation.",
        3,
        [
          "T(20) = 20 + 80e^(−20k) = 20 + 80×(0.25)",
          "= 40 °C",
          "Limitation: assumes constant room temperature and ignores evaporation/drinks vessel changes; near room temperature small measurement errors dominate",
        ],
        "T(20) = 20 + 80×¼ = 40 °C since another 10 minutes halves the excess again. Limitation: the model presumes a perfectly constant ambient temperature and no evaporation; close to room temperature these violations dominate the prediction.",
        "Model evaluation distinguishes mathematical prediction from physical validity.",
        ["AO2", "AO3"],
      ),
    ],
  },
];

const catalogues: Record<Discipline, ExpansionItem[]> = { biology, chemistry, maths, physics };
const supportedSubjects = ["wjec-alevel"] as const;

export const evidenceExpansionQuestions: Question[] = (
  Object.entries(catalogues) as Array<[Discipline, ExpansionItem[]]>
).flatMap(([discipline, items]) =>
  supportedSubjects.flatMap((qualification) => {
    const subjectId = `${qualification}-${discipline}`;
    return items.map((item) => buildQuestion(subjectId, item));
  }),
);
