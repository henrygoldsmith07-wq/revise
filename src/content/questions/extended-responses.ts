import type { AoCode, Question } from "@/domain/types";
import { defineQuestion } from "./authoring";

/** Original longer-form questions for the authored A-Level catalogue. */

type Discipline = "biology" | "chemistry" | "maths" | "physics";

interface ExtendedPart {
  prompt: string;
  marks: number;
  scheme: string[];
  answer: string;
  claim: string;
  point?: number;
  aos?: AoCode[];
}

interface ExtendedItem {
  slug: string;
  topic: string;
  stem: string;
  parts: ExtendedPart[];
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
): ExtendedPart {
  return { prompt, marks, scheme, answer, claim, point, aos };
}

function buildQuestion(qualification: string, discipline: Discipline, item: ExtendedItem): Question {
  const subjectId = `${qualification}-${discipline}`;
  const prefix = `${subjectId}.${item.topic}`;
  return defineQuestion({
    slug: `extended-response-${subjectId}-${item.slug}`,
    subjectId,
    topics: [item.topic],
    kind: "extended",
    stem: item.stem,
    difficulty: item.difficulty,
    calculator: item.calculator,
    source: "authored",
    verification: "checked",
    reviewer: "authored/extended-response-review",
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

const biology: ExtendedItem[] = [
  {
    slug: "photosynthesis-limiting-factors",
    topic: "photosynthesis",
    stem: "In an investigation, increasing light intensity raises the rate of oxygen production until a plateau. At high light intensity, increasing carbon dioxide concentration raises the rate again.",
    difficulty: 4,
    parts: [part(
      "Explain these results and describe how a student could test whether temperature is the next limiting factor.",
      5,
      [
        "At the first plateau, light is no longer limiting and another factor limits the rate",
        "At low light, the light-dependent reactions limit ATP and reduced NADP production, so extra carbon dioxide has little effect",
        "At high light, carbon dioxide becomes limiting for carbon fixation in the Calvin cycle, so extra carbon dioxide increases the rate",
        "Keep light intensity, carbon dioxide concentration, leaf area and measurement time controlled when comparing temperatures",
        "Use several temperatures and repeated measurements of oxygen production per unit time to identify an optimum or plateau",
      ],
      "The first plateau shows that light is no longer the limiting factor. At low light, the light-dependent reactions limit ATP and reduced NADP production, so adding carbon dioxide has little effect. At high light, carbon dioxide limits carbon fixation in the Calvin cycle and increasing it raises the rate. To test temperature, keep light intensity, carbon dioxide concentration, leaf area and measurement time constant, then repeat oxygen-production measurements at several temperatures.",
      "explain limiting factors of photosynthesis",
      4,
      ["AO2", "AO3"],
    )],
  },
  {
    slug: "homeostasis-adh",
    topic: "homeostasis",
    stem: "After a long run, a person has lost water in sweat and their blood water potential is lower than normal.",
    difficulty: 4,
    parts: [part(
      "Explain how ADH restores water balance and affects the volume and concentration of urine.",
      5,
      [
        "Osmoreceptors in the hypothalamus detect the lower blood water potential",
        "The posterior pituitary releases more ADH into the blood",
        "ADH binds to receptors on collecting-duct cells and causes aquaporins to be inserted, increasing water permeability",
        "Water moves from the filtrate into the blood by osmosis down the medullary water-potential gradient",
        "A smaller volume of more concentrated urine is produced and negative feedback returns blood water potential towards normal",
      ],
      "The lower blood water potential is detected by osmoreceptors in the hypothalamus. The posterior pituitary releases more ADH, which binds to collecting-duct cells and increases aquaporin insertion. The collecting duct becomes more permeable to water, so water moves by osmosis into the blood down the medullary gradient. The kidneys produce a smaller volume of more concentrated urine, restoring water potential by negative feedback.",
      "explain water balance including ADH and osmoregulation",
      4,
      ["AO1", "AO2"],
    )],
  },
];

const chemistry: ExtendedItem[] = [
  {
    slug: "equilibria-industrial-compromise",
    topic: "equilibria",
    stem: "The Haber process uses N₂(g) + 3H₂(g) ⇌ 2NH₃(g), an exothermic forward reaction. An iron catalyst, high pressure and a temperature of about 450 °C are used industrially.",
    difficulty: 4,
    parts: [part(
      "Explain why these conditions are a compromise and why the catalyst does not increase the equilibrium yield.",
      5,
      [
        "A lower temperature favours the exothermic forward reaction and gives a higher ammonia yield, but the reaction is slower",
        "A higher temperature increases the rate but shifts equilibrium towards the endothermic reverse reaction, lowering yield",
        "High pressure favours the side with fewer gas molecules, so it shifts equilibrium towards ammonia",
        "Very high pressure increases plant cost, energy use and safety risk, so a compromise pressure is used",
        "The iron catalyst lowers activation energy for both directions equally, so equilibrium is reached faster but its position, K and yield are unchanged",
      ],
      "A lower temperature would give a higher ammonia yield because the forward reaction is exothermic, but the rate would be too slow. A higher temperature gives a faster rate but reduces the equilibrium yield. High pressure favours the two-molecule product side because four moles of gas become two, although very high pressure is expensive and hazardous. The iron catalyst lowers activation energy for both forward and reverse reactions, so it speeds attainment of equilibrium without changing its position or the equilibrium yield.",
      "explain the compromise conditions in industrial processes",
      5,
      ["AO2", "AO3"],
    )],
  },
  {
    slug: "redox-cell-evaluation",
    topic: "redox",
    stem: "A cell is made from Zn²⁺/Zn with E° = −0.76 V and Cu²⁺/Cu with E° = +0.34 V. A measured voltage is lower than the standard cell EMF.",
    difficulty: 5,
    calculator: true,
    parts: [
      part(
        "Use the electrode potentials to identify the direction of electron transfer and calculate the standard cell EMF.",
        3,
        [
          "Copper ions are reduced at the cathode and zinc is oxidised at the anode",
          "E°cell = E°(reduction) − E°(oxidation) = +0.34 − (−0.76)",
          "E°cell = +1.10 V, so the reaction is feasible under standard conditions",
        ],
        "Cu²⁺ is reduced at the cathode and Zn is oxidised at the anode. E°cell = +0.34 − (−0.76) = +1.10 V, so the cell reaction is thermodynamically feasible under standard conditions.",
        "predict feasibility of redox reactions from electrode potentials",
        4,
        ["AO2"],
      ),
      part(
        "Explain why the measured voltage may be lower and why a positive EMF does not guarantee a fast reaction.",
        4,
        [
          "Standard electrode potentials assume 298 K, 100 kPa and 1.00 mol dm⁻³ solutions",
          "Different ion concentrations or temperature change the cell potential from its standard value",
          "Internal resistance, polarisation or the connecting circuit can make the terminal voltage lower than the EMF",
          "A positive EMF describes thermodynamic feasibility, whereas reaction rate also depends on activation energy and kinetics",
        ],
        "The standard value applies only at 298 K, 100 kPa and 1.00 mol dm⁻³. Different concentrations or temperature change the potential. Internal resistance and polarisation can reduce the terminal voltage measured by a real circuit. A positive EMF indicates that the reaction is thermodynamically feasible, but it may still be slow if its activation energy is large.",
        "explain limitations of electrode potential predictions",
        5,
        ["AO2", "AO3"],
      ),
    ],
  },
];

const maths: ExtendedItem[] = [
  {
    slug: "proof-square-root-two",
    topic: "proof",
    stem: "The number √2 is claimed to be rational.",
    difficulty: 4,
    calculator: false,
    parts: [part(
      "Use proof by contradiction to show that √2 is irrational.",
      5,
      [
        "Assume √2 = a/b, where a and b are coprime integers and b is non-zero",
        "Squaring gives 2b² = a², so a² is even and therefore a is even; write a = 2k",
        "Substitution gives 2b² = 4k², so b² = 2k² and b is even",
        "Both a and b are even, contradicting the assumption that a/b is in lowest terms",
        "Therefore the assumption is false and √2 is irrational",
      ],
      "Assume for contradiction that √2 = a/b in lowest terms, with a and b integers and b ≠ 0. Then a² = 2b², so a is even; let a = 2k. Substitution gives b² = 2k², so b is also even. This contradicts a/b being in lowest terms. Hence √2 is irrational.",
      "construct proofs by contradiction including irrationality",
      2,
      ["AO1", "AO2"],
    )],
  },
  {
    slug: "sampling-method-evaluation",
    topic: "statistical-sampling",
    stem: "A college wants to estimate the mean daily travel time of all its students. It posts a survey link in the cycling club and receives 120 volunteer responses, 90 of which are from cyclists.",
    difficulty: 4,
    calculator: false,
    parts: [part(
      "Evaluate this sample and propose a better sampling method for the college.",
      5,
      [
        "The volunteer sample is likely biased because students who choose to respond may differ from non-responders",
        "Sampling through the cycling club over-represents cyclists and is unlikely to represent all students",
        "Use a sampling frame containing all enrolled students rather than only club members",
        "A stratified random sample by year group or usual transport can preserve relevant proportions",
        "Use a consistent definition of travel time, invite selected students repeatedly if needed and report non-response",
      ],
      "The sample is not representative: volunteers may have different travel times from non-responders, and the cycling-club sampling frame over-represents cyclists. A better method would select students at random from a complete college list, stratified by year group or usual transport in representative proportions. The question and time period should be standardised, and non-response should be recorded and followed up.",
      "evaluate sampling methods for bias and representativeness",
      2,
      ["AO2", "AO3"],
    )],
  },
];

const physics: ExtendedItem[] = [
  {
    slug: "induced-emf-direction",
    topic: "fields",
    stem: "A 0.25 m conducting rod moves at 3.0 m s⁻¹ perpendicular to a 0.40 T magnetic field. Its ends are connected in a complete circuit.",
    difficulty: 4,
    calculator: true,
    parts: [
      part(
        "State Faraday's law and Lenz's law, then explain why a current is induced in the circuit.",
        3,
        [
          "Faraday's law states that induced EMF is proportional to the rate of change of flux linkage",
          "Lenz's law states that the induced effect opposes the change causing it",
          "Moving charges in the rod experience a magnetic force and separate, producing a potential difference and current in the complete circuit",
        ],
        "Faraday's law says that induced EMF is proportional to the rate of change of flux linkage. Lenz's law says that the induced effect opposes the change causing it. As the rod moves through the field, charges in it experience a magnetic force and separate, creating an EMF; the complete circuit allows a current to flow.",
        "state Faraday law and Lenz law for electromagnetic induction",
        7,
        ["AO1", "AO2"],
      ),
      part(
        "Calculate the induced EMF and describe what happens if the speed doubles or the direction of motion reverses.",
        3,
        [
          "For perpendicular motion, emf = Bℓv = 0.40 × 0.25 × 3.0 = 0.30 V",
          "The EMF doubles if the speed doubles because emf is proportional to v",
          "Reversing the motion reverses the polarity and therefore the direction of induced current",
        ],
        "The induced EMF is Bℓv = 0.40 × 0.25 × 3.0 = 0.30 V. Doubling the speed doubles the EMF to 0.60 V. Reversing the motion reverses the polarity and the direction of the induced current.",
        "calculate induced emf as rate of change of flux linkage and predict direction",
        8,
        ["AO2"],
      ),
    ],
  },
  {
    slug: "binding-energy-release",
    topic: "nuclear",
    stem: "The binding energy per nucleon rises for light nuclei, reaches a maximum near iron-56, and then falls for heavier nuclei. Both fusion of light nuclei and fission of heavy nuclei can release energy.",
    difficulty: 5,
    calculator: false,
    parts: [part(
      "Explain why both processes can release energy using the binding-energy curve and mass–energy equivalence.",
      5,
      [
        "Fusion moves light nuclei towards iron-56, where binding energy per nucleon is greater",
        "Fission splits a heavy nucleus into medium-mass nuclei that are also closer to the maximum",
        "The products therefore have greater total binding energy and are more tightly bound",
        "The total mass of the products is lower than the reactants, creating a mass defect",
        "The mass defect is released as energy according to ΔE = Δmc²",
      ],
      "Fusion combines light nuclei and moves them up the binding-energy-per-nucleon curve towards iron-56. Fission splits a heavy nucleus into medium-mass nuclei that are also nearer the maximum. In either case the products have greater total binding energy and a lower total mass than the reactants. The mass defect is released as energy according to ΔE = Δmc².",
      "explain binding energy per nucleon curve and energy release in fission and fusion",
      5,
      ["AO1", "AO2"],
    )],
  },
];

const catalogues: Record<Discipline, ExtendedItem[]> = { biology, chemistry, maths, physics };
const supportedQualifications = ["wjec-alevel", "aqa-alevel", "ocr-alevel"] as const;

export const extendedResponseQuestions: Question[] = (Object.entries(catalogues) as Array<[Discipline, ExtendedItem[]]>).flatMap(
  ([discipline, items]) => supportedQualifications.flatMap((qualification) => {
    return items.map((item) => buildQuestion(qualification, discipline, item));
  }),
);
