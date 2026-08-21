import type { AoCode, Question, QuestionKind } from "@/domain/types";
import { defineQuestions } from "./authoring";

/** Original transfer questions that place familiar ideas in unfamiliar settings. */

type ContextPart = {
  prompt: string;
  marks: number;
  scheme: string[];
  answer: string;
  claim: string;
  aos?: AoCode[];
};

type ContextItem = {
  slug: string;
  topic: string;
  stem: string;
  parts: ContextPart[];
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
): ContextPart {
  return { prompt, marks, scheme, answer, claim, aos };
}

function buildQuestions(subjectId: string, items: ContextItem[]): Question[] {
  return defineQuestions(
    items.map((item) => ({
      slug: `unfamiliar-context-${subjectId}-${item.slug}`,
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
      reviewer: "authored/unfamiliar-context-review",
      lastChecked: "2026-08-18",
      specVersion: "2024-1.0",
      parts: item.parts.map((current) => ({
        prompt: current.prompt,
        marks: current.marks,
        scheme: current.scheme,
        answer: current.answer,
        aos: current.aos,
        specPointIds: [subjectId + "." + item.topic + ".sp-01"],
        learningClaims: [current.claim],
      })),
    })),
  );
}

const biology: ContextItem[] = [
  {
    slug: "nectar-test",
    topic: "biological-molecules",
    stem: "Unfamiliar context: A bat sanctuary is checking whether a new nectar substitute contains the carbohydrate needed for night-flying bats.",
    kind: "mcq",
    difficulty: 2,
    options: [
      "Use Benedict's reagent and heat; a brick-red precipitate indicates reducing sugar",
      "Use iodine solution; a lilac colour indicates reducing sugar",
      "Use Biuret reagent; a blue colour indicates starch",
      "Use ethanol; a cloudy emulsion indicates glucose",
    ],
    correctIndex: 0,
    parts: [part("Choose the most appropriate test and state the positive result.", 2, ["Benedict's reagent is suitable for a reducing sugar", "A brick-red/orange precipitate after heating is positive"], "Use Benedict's reagent and heat the sample. A brick-red or orange precipitate indicates reducing sugar.", "select and interpret a food test in a new biological setting", ["AO2"])],
  },
  {
    slug: "salt-marsh-cell",
    topic: "cell-structure",
    stem: "Unfamiliar context: A salt-marsh microbe has a cell wall, a plasma membrane, circular DNA and many infoldings of its plasma membrane, but no nucleus.",
    kind: "extended",
    difficulty: 2,
    parts: [
      part("Identify the type of cell and give the evidence.", 2, ["It is a prokaryotic cell", "It has circular DNA and no membrane-bound nucleus"], "It is prokaryotic because its DNA is circular and it has no membrane-bound nucleus.", "identify cell type from unfamiliar structural evidence"),
      part("Suggest why the membrane infoldings could help the microbe respire in salty water.", 2, ["Infoldings increase membrane surface area", "More respiratory enzymes or electron carriers can be present, increasing ATP production"], "The infoldings increase membrane surface area, allowing more respiratory electron carriers and enzymes to operate and produce ATP.", "apply surface-area ideas to cell ultrastructure", ["AO2", "AO3"]),
    ],
  },
  {
    slug: "desert-alga-membrane",
    topic: "membranes-transport",
    stem: "Unfamiliar context: A newly discovered desert alga is transferred from dilute rainwater to a concentrated salt solution. Its cell has a selectively permeable membrane.",
    difficulty: 2,
    parts: [part("Predict the change in the cell and explain it using water potential.", 3, ["Water leaves the cell by osmosis", "The external solution has lower water potential than the cell contents", "The cell loses turgor and the membrane pulls away from the cell wall"], "Water leaves the algal cell by osmosis because the salt solution has a lower water potential. The cell loses turgor and may become plasmolysed.", "transfer water-potential and osmosis reasoning to a novel organism")],
  },
  {
    slug: "deep-vent-enzyme",
    topic: "enzymes",
    stem: "Unfamiliar context: An enzyme isolated from a deep-sea vent remains active at 70 °C but loses activity quickly at 95 °C.",
    difficulty: 2,
    parts: [part("Explain why activity falls at 95 °C and why the enzyme is useful in an industrial reactor.", 3, ["High temperature disrupts bonds maintaining tertiary structure", "The active site changes shape, so fewer enzyme-substrate complexes form", "It can catalyse reactions at a temperature that would denature many ordinary enzymes"], "At 95 °C, bonds maintaining the enzyme's tertiary structure are disrupted, changing the active site. Its stability at 70 °C makes it useful for high-temperature industrial reactions.", "explain denaturation and apply enzyme adaptation to industry")],
  },
  {
    slug: "conservation-gene",
    topic: "nucleic-acids",
    stem: "Unfamiliar context: A conservation lab compares a template DNA sequence TAC CCG GAT with a variant TAC CCA GAT found in a rare lizard.",
    kind: "extended",
    difficulty: 3,
    parts: [
      part("State the mRNA sequence transcribed from the original template.", 1, ["Use complementary base pairing", "The mRNA sequence is AUG GGC CUA"], "The mRNA sequence is AUG GGC CUA.", "transcribe a sequence in an unfamiliar conservation context"),
      part("Explain why the substitution may have no effect on the lizard's protein.", 2, ["The changed template triplet still gives a codon for the same amino acid", "The genetic code is degenerate"], "The changed DNA triplet produces a different codon that may specify the same amino acid because the genetic code is degenerate. It can therefore be a silent mutation.", "apply degeneracy of the genetic code to a new sequence", ["AO2", "AO3"]),
    ],
  },
  {
    slug: "nocturnal-insect",
    topic: "gas-exchange",
    stem: "Unfamiliar context: A nocturnal insect folds its spiracles almost shut during the day and opens them widely before a night flight.",
    difficulty: 2,
    parts: [part("Explain how opening the spiracles can increase oxygen delivery without requiring a lung.", 3, ["Opening spiracles allows air into the tracheal system", "The diffusion pathway to cells is shorter than a blood transport route", "A steep oxygen concentration gradient is maintained as respiring cells use oxygen"], "Opening the spiracles lets air enter the tracheae and tracheoles. Oxygen diffuses directly towards respiring cells, where its use maintains a steep concentration gradient.", "apply gas-exchange gradients to an unfamiliar invertebrate")],
  },
  {
    slug: "highland-mammal",
    topic: "transport-animals",
    stem: "Unfamiliar context: A highland mammal has haemoglobin with a higher affinity for oxygen than the same species at sea level.",
    difficulty: 3,
    parts: [part("Explain one advantage and one possible disadvantage of the higher affinity.", 3, ["It loads oxygen effectively when oxygen partial pressure is low", "The dissociation curve is shifted to the left", "It may release less oxygen to respiring tissues at the same tissue pO₂"], "Higher affinity helps the mammal load oxygen in thin highland air. However, haemoglobin may hold oxygen more tightly and unload less of it to tissues unless the tissue pO₂ is especially low.", "evaluate oxygen-loading and unloading in a new environmental context")],
  },
  {
    slug: "vertical-farm",
    topic: "transport-plants",
    stem: "Unfamiliar context: A vertical farm grows vines on a tower while their roots remain in a nutrient tank at the base.",
    difficulty: 2,
    parts: [part("Explain how water can reach leaves high above the tank and identify the tissue that carries sugars down the vine.", 3, ["Water moves up xylem vessels in a transpiration stream", "Evaporation from leaves creates tension and cohesion helps maintain the column", "Phloem translocates assimilates from leaves to sinks"], "Water rises in xylem because transpiration creates tension and cohesion keeps a continuous water column. Sugars are transported through phloem from leaves to sinks such as roots and fruits.", "apply plant transport mechanisms to a vertical-growing system")],
  },
  {
    slug: "island-restoration",
    topic: "biodiversity",
    stem: "Unfamiliar context: An island restoration team removes an invasive shrub from one patch but leaves a second patch untouched for comparison.",
    kind: "extended",
    difficulty: 2,
    parts: [
      part("Suggest why the team should sample several random quadrats in each patch.", 2, ["Several samples reduce the effect of chance variation", "Random placement reduces selection bias and allows a representative comparison"], "Several random quadrats reduce chance variation and selection bias, making the comparison between the two patches more representative.", "design representative biodiversity sampling in a novel field study"),
      part("State one variable that should be kept similar between patches.", 1, ["Use the same quadrat area, sampling season or sampling effort"], "The team should use the same quadrat area and sampling season in both patches.", "identify a control variable in an ecological comparison", ["AO2", "AO3"]),
    ],
  },
  {
    slug: "fermentation-vessel",
    topic: "respiration",
    stem: "Unfamiliar context: A sealed vessel contains yeast and a sugary seaweed extract. After the oxygen is used, the vessel produces bubbles and a sharp-smelling liquid.",
    difficulty: 2,
    parts: [part("Identify the respiration pathway and name the two products formed by the yeast.", 3, ["The yeast is carrying out anaerobic respiration", "Glucose is converted to ethanol", "Carbon dioxide is also produced"], "The yeast is respiring anaerobically. It converts glucose to ethanol and carbon dioxide, which accounts for the liquid and bubbles.", "apply respiration pathways to a novel fermentation process")],
  },
  {
    slug: "deep-ocean-alga",
    topic: "photosynthesis",
    stem: "Unfamiliar context: An alga living beneath red ice grows faster under green light than under red light, even though most land plants use red light efficiently.",
    difficulty: 3,
    parts: [part("Suggest why the alga may show this unusual response and state what an action spectrum would measure.", 3, ["Accessory pigments may absorb green wavelengths and transfer energy to chlorophyll", "The available light under the ice has a different spectrum", "An action spectrum shows photosynthetic rate at different wavelengths"], "Accessory pigments could absorb green light and transfer its energy to chlorophyll. An action spectrum would show the rate of photosynthesis at each wavelength.", "interpret an unusual light response using pigments and action spectra")],
  },
  {
    slug: "desert-rodent",
    topic: "homeostasis",
    stem: "Unfamiliar context: A desert rodent produces very concentrated urine after several hours without drinking and its collecting ducts become more permeable to water.",
    difficulty: 2,
    parts: [part("Explain the hormonal response that produces the concentrated urine.", 3, ["Low blood water potential is detected by osmoreceptors", "The posterior pituitary releases more ADH", "ADH increases water permeability of collecting ducts so more water is reabsorbed"], "Low blood water potential stimulates ADH release. ADH makes collecting ducts more permeable to water, so more water is reabsorbed and a small volume of concentrated urine is produced.", "apply negative feedback and ADH action to water conservation")],
  },
  {
    slug: "lizard-pattern",
    topic: "genetics-inheritance",
    stem: "Unfamiliar context: In a lizard species, striped scales are dominant to plain scales. Two heterozygous striped lizards are bred in a conservation programme.",
    kind: "extended",
    difficulty: 2,
    parts: [
      part("Use a genetic diagram to predict the proportion of plain offspring.", 2, ["Let S be striped and s be plain; parents are Ss × Ss", "The offspring genotypes are SS, Ss, Ss and ss, so one quarter are plain"], "Ss × Ss gives SS, Ss, Ss and ss. The predicted proportion with plain scales is 1/4 or 25%.", "apply a monohybrid cross to an unfamiliar conservation example"),
      part("Explain why the actual proportion may differ in a small clutch.", 1, ["Random fertilisation and sampling variation can make observed results differ from the expected ratio"], "A small clutch is affected by sampling variation, so the observed proportion need not be exactly 25%.", "evaluate expected genetic ratios using sampling variation", ["AO2", "AO3"]),
    ],
  },
  {
    slug: "floating-wetland",
    topic: "ecosystems",
    stem: "Unfamiliar context: A floating wetland is placed on a polluted lake. Its plants remove phosphate, insect larvae increase and small fish become more numerous.",
    difficulty: 3,
    parts: [part("Explain how removing phosphate could produce the observed changes through the food web.", 4, ["Less phosphate reduces algal growth and the risk of oxygen depletion", "Improved oxygen conditions support aquatic invertebrates", "More insect larvae provide more food for small fish", "The changes are indirect effects through interdependent populations"], "Removing phosphate reduces excessive algal growth and oxygen depletion. Better oxygen conditions allow more insect larvae to survive, providing more food for small fish; this is an indirect food-web effect.", "apply nutrient-cycle and food-web reasoning to a restoration intervention", ["AO2", "AO3"])],
  },
];

const chemistry: ContextItem[] = [
  {
    slug: "meteorite-isotopes",
    topic: "atomic-structure",
    stem: "Unfamiliar context: A meteorite contains three isotopes of element Z with masses 62, 63 and 64 and relative abundances 9, 69 and 22.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the relative atomic mass of Z and explain why it is not a whole number.", 3, ["Use a weighted mean", "(62 × 9 + 63 × 69 + 64 × 22)/100 = 63.13", "The value is an abundance-weighted mean of isotopes"], "The relative atomic mass is (62 × 9 + 63 × 69 + 64 × 22)/100 = 63.13. It is not a whole number because it is a weighted mean of isotopes.", "calculate and explain an isotopic abundance result in a novel sample")],
  },
  {
    slug: "oxygen-scrubber",
    topic: "moles",
    stem: "Unfamiliar context: A spacecraft uses lithium hydroxide to remove carbon dioxide. A cartridge contains 24.0 g of LiOH, Mr = 24.0, and reacts as 2LiOH + CO₂ → Li₂CO₃ + H₂O.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the maximum amount, in moles, of carbon dioxide removed.", 3, ["Moles of LiOH = 24.0/24.0 = 1.00 mol", "The equation gives a 2:1 ratio of LiOH to CO₂", "Moles of CO₂ removed = 0.500 mol"], "The cartridge contains 1.00 mol LiOH. The 2:1 ratio means it can remove 0.500 mol CO₂.", "apply mole ratios to an unfamiliar life-support reaction")],
  },
  {
    slug: "ceramic-polymer",
    topic: "bonding",
    stem: "Unfamiliar context: A heat shield is made from a brittle ceramic that conducts electricity when molten, while its flexible coating has a low melting point and does not conduct.",
    kind: "mcq",
    difficulty: 2,
    options: [
      "The ceramic is giant ionic and the coating is simple molecular",
      "The ceramic is metallic and the coating is giant covalent",
      "Both substances are simple molecular",
      "The ceramic is giant covalent and the coating is ionic",
    ],
    correctIndex: 0,
    parts: [part("Choose the structure assignment that best fits the observations.", 1, ["The ceramic has a giant ionic lattice with mobile ions when molten", "The coating has weak intermolecular forces and no mobile charged particles"], "The ceramic is giant ionic and the flexible coating is simple molecular.", "infer bonding and structure from unfamiliar physical properties", ["AO2"])],
  },
  {
    slug: "hand-warmer",
    topic: "energetics",
    stem: "Unfamiliar context: A reusable hand-warmer heats 100 g of water from 18.0 °C to 34.0 °C. The specific heat capacity of water is 4.18 J g⁻¹ K⁻¹.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the heat transferred to the water and state whether the process in the warmer is exothermic.", 3, ["q = mcΔT", "q = 100 × 4.18 × 16.0 = 6688 J", "The warmer releases heat, so the process is exothermic"], "q = 100 × 4.18 × 16.0 = 6688 J, or 6.69 kJ. The process in the warmer is exothermic because it releases heat to the water.", "apply calorimetry and enthalpy conventions to a consumer device")],
  },
  {
    slug: "pollutant-catalyst",
    topic: "kinetics",
    stem: "Unfamiliar context: A catalyst is added to a reactor that breaks down a river pollutant. The initial rate increases, but the final concentration of pollutant is unchanged.",
    difficulty: 2,
    parts: [part("Explain the effect of the catalyst on the reaction and its equilibrium position.", 3, ["The catalyst provides an alternative pathway with lower activation energy", "More particles have energy greater than the activation energy, so rate increases", "A catalyst speeds both forward and reverse reactions and does not change equilibrium position"], "The catalyst lowers activation energy through an alternative pathway, increasing the rate. It does not change the equilibrium position because it speeds the forward and reverse reactions equally.", "distinguish kinetic effects from equilibrium effects in an environmental context")],
  },
  {
    slug: "ammonia-sensor",
    topic: "equilibria",
    stem: "Unfamiliar context: A closed fertiliser locker contains NH₃(g) ⇌ N₂(g) + H₂(g), an endothermic forward reaction. A sensor warms the locker to reduce the NH₃ reading.",
    difficulty: 3,
    parts: [part("Explain why warming the locker can reduce the equilibrium concentration of ammonia.", 3, ["The forward reaction is endothermic and absorbs heat", "Increasing temperature favours the endothermic direction", "More NH₃ decomposes and the equilibrium shifts towards nitrogen and hydrogen"], "Because the forward reaction is endothermic, increasing temperature favours decomposition. The equilibrium shifts towards nitrogen and hydrogen, reducing the equilibrium concentration of ammonia.", "apply Le Chatelier's principle to an unfamiliar equilibrium system")],
  },
  {
    slug: "ant-sting",
    topic: "acids-bases",
    stem: "Unfamiliar context: An ant sting injects methanoic acid. A student applies a weak alkali cream rather than a strong alkali.",
    difficulty: 2,
    parts: [part("Explain why a weak alkali is a safer neutralising treatment than a strong alkali.", 3, ["The weak alkali reacts with the acid in a neutralisation reaction", "A weak alkali is less likely to be corrosive or cause a large pH change", "The products include a salt and water"], "The weak alkali neutralises methanoic acid to form a salt and water, while its lower alkalinity makes a damaging pH change or corrosive burn less likely.", "apply neutralisation and strength ideas to a practical context")],
  },
  {
    slug: "corrosion-coating",
    topic: "redox",
    stem: "Unfamiliar context: An underwater robot uses a zinc plate attached to a steel frame. The zinc corrodes while the steel remains intact.",
    difficulty: 2,
    parts: [part("Explain how the zinc protects the steel using oxidation and reduction.", 3, ["Zinc is oxidised and loses electrons more readily than iron", "The zinc supplies electrons to the steel", "The steel is prevented from oxidising while the zinc remains connected"], "Zinc is oxidised to Zn²⁺ and supplies electrons. The steel is kept at a more reducing potential, so oxidation of iron is inhibited while the zinc corrodes as the sacrificial metal.", "apply redox and sacrificial protection to an unfamiliar device")],
  },
  {
    slug: "unknown-period",
    topic: "periodicity",
    stem: "Unfamiliar context: The first ionisation energies of four unknown elements are 496, 738, 578 and 1012 kJ mol⁻¹. The values include a drop between the second and third entries.",
    kind: "mcq",
    difficulty: 3,
    options: [
      "The first two elements are likely in the same period with the third starting a new period",
      "The third element must be a noble gas",
      "The drop proves the third element has fewer electron shells than the second",
      "All four elements must be in the same group",
    ],
    correctIndex: 0,
    parts: [part("Select the interpretation that best explains the unusually low third value.", 2, ["A large drop can indicate the start of a new period", "The electron removed from the third element is in a shell farther from the nucleus"], "The third element may start a new period. Its outer electron is in a new shell farther from the nucleus and is easier to remove.", "interpret an unfamiliar ionisation-energy pattern using electron structure", ["AO2"])],
  },
  {
    slug: "transition-catalyst",
    topic: "transition-metals",
    stem: "Unfamiliar context: A pale green metal complex turns yellow as it catalyses oxidation of a dissolved pollutant, then returns to pale green when the reaction is complete.",
    difficulty: 3,
    parts: [part("Explain how the colour change and catalytic behaviour are consistent with a transition-metal complex.", 3, ["Different oxidation states or ligand environments have different d-orbital energy gaps", "Different gaps absorb different wavelengths, so observed colour changes", "The metal can provide an alternative pathway and cycle between oxidation states"], "Changing oxidation state or ligand environment changes the d-orbital energy gap and therefore the absorbed wavelength. The metal can cycle between oxidation states, providing a catalytic pathway.", "apply transition-metal properties to an unfamiliar catalytic system")],
  },
  {
    slug: "biofuel-distillation",
    topic: "organic-basics",
    stem: "Unfamiliar context: A biofuel plant separates propan-1-ol from water by fractional distillation before blending the fuel.",
    difficulty: 2,
    parts: [part("Explain why fractional distillation can separate the liquids and identify the functional group in propan-1-ol.", 3, ["The liquids have different boiling points", "Repeated vaporisation and condensation enriches the more volatile component", "Propan-1-ol contains a hydroxyl alcohol group"], "Fractional distillation separates the liquids because their boiling points differ; repeated vaporisation and condensation enriches the lower-boiling component. Propan-1-ol contains a hydroxyl alcohol group.", "apply distillation and functional-group knowledge to a biofuel process")],
  },
  {
    slug: "spacecraft-fuel",
    topic: "hydrocarbons",
    stem: "Unfamiliar context: A spacecraft stores ethene as a feedstock and converts it to a solid polymer for protective panels.",
    difficulty: 2,
    parts: [part("Describe the reaction that converts ethene into the polymer and identify the bond that changes.", 3, ["This is addition polymerisation", "The C=C double bond opens and forms C-C single bonds between monomers", "The repeating unit contains a carbon chain with side hydrogen atoms"], "Ethene undergoes addition polymerisation. The C=C bond opens and forms C-C single bonds linking many monomers into a long chain.", "apply addition polymerisation to an unfamiliar material")],
  },
  {
    slug: "fragrance-identification",
    topic: "carbonyls-acids",
    stem: "Unfamiliar context: A fragrance sample gives an orange precipitate with 2,4-DNPH and a positive Tollens' test, but no reaction with sodium carbonate.",
    kind: "extended",
    difficulty: 2,
    parts: [
      part("Identify the functional group and decide whether the compound is an aldehyde or ketone.", 2, ["2,4-DNPH shows a carbonyl group", "A positive Tollens' test identifies an aldehyde"], "The compound contains a carbonyl group and is an aldehyde. The negative sodium carbonate test means it is not a carboxylic acid.", "interpret qualitative organic tests in an unfamiliar sample"),
      part("State the observation expected with Tollens' reagent.", 1, ["A silver mirror or grey silver deposit forms"], "A silver mirror forms on the inside of the test tube.", "recall the diagnostic observation for an aldehyde test", ["AO1", "AO2"]),
    ],
  },
  {
    slug: "pharmaceutical-amine",
    topic: "aromatics-nitrogen",
    stem: "Unfamiliar context: A pharmaceutical contains a benzene ring attached to an amine group. The drug forms a water-soluble salt when treated with hydrochloric acid.",
    difficulty: 2,
    parts: [part("Explain why treatment with hydrochloric acid increases the drug's solubility in water.", 3, ["The amine has a lone pair that can accept a proton", "An ammonium salt forms", "The ionic salt interacts more strongly with polar water molecules"], "The amine lone pair accepts H⁺ from hydrochloric acid, forming an ammonium chloride salt. The ionic salt is more strongly hydrated and therefore more soluble in water.", "apply amine basicity and aromatic structure to a drug context")],
  },
  {
    slug: "unknown-spectrum",
    topic: "spectroscopy",
    stem: "Unfamiliar context: An unknown liquid has an IR absorption near 1715 cm⁻¹ and a proton NMR spectrum with a singlet integrating to six hydrogens.",
    kind: "mcq",
    difficulty: 3,
    options: ["Propanone", "Ethanol", "Ethanoic acid", "Propan-1-ol"],
    correctIndex: 0,
    parts: [part("Identify the compound and use both spectra to justify the choice.", 2, ["The IR peak indicates a carbonyl group", "A six-hydrogen singlet is consistent with two equivalent methyl groups beside the carbonyl in propanone"], "The compound is propanone, CH₃COCH₃. The IR peak indicates C=O and the six-hydrogen singlet fits two equivalent methyl groups.", "combine IR and NMR evidence to identify an unfamiliar compound", ["AO2", "AO3"])],
  },
];

const maths: ContextItem[] = [
  {
    slug: "game-score-claim",
    topic: "proof",
    stem: "Unfamiliar context: A game designer claims that the score n² + n + 41 is prime for every whole-number level n from 0 onwards because it works for the first five levels.",
    kind: "extended",
    difficulty: 3,
    parts: [part("Disprove the claim with a counterexample and explain why the first five results are insufficient.", 3, ["Testing a finite set does not prove a statement for every whole number", "At n = 40, the expression is 40² + 40 + 41 = 1681", "1681 = 41², so it is not prime"], "The first five cases cannot prove a universal claim. At n = 40 the expression is 1681 = 41², which is not prime, so the claim is false.", "use counterexample and limits of empirical evidence in proof", ["AO2", "AO3"])],
  },
  {
    slug: "revenue-model",
    topic: "algebra",
    stem: "Unfamiliar context: A pop-up observatory charges £x per visitor and receives 80 − 2x visitors per evening. Its evening revenue is modelled by R = x(80 − 2x).",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Find the two prices that give zero revenue and the price that gives the maximum revenue.", 4, ["R = 0 when x = 0 or 80 − 2x = 0", "The prices are x = 0 and x = 40", "R = 80x − 2x² has vertex at x = −80/(2 × −2) = 20", "At x = 20 the maximum revenue is £800"], "Zero revenue occurs at £0 and £40. The quadratic has its maximum at x = 20, giving R = 20(80 − 40) = £800.", "apply quadratic modelling and completing-the-square or vertex methods")],
  },
  {
    slug: "satellite-map",
    topic: "coordinate-geometry",
    stem: "Unfamiliar context: A satellite maps two beacons at A(2, 5) and B(8, 2). A service route must be perpendicular to AB and pass through A.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Find the equation of the service route.", 3, ["Gradient AB = (2 − 5)/(8 − 2) = −1/2", "A perpendicular gradient is 2", "Using A(2,5), y − 5 = 2(x − 2), so y = 2x + 1"], "The gradient of AB is −1/2, so the perpendicular gradient is 2. Through A, the route is y − 5 = 2(x − 2), or y = 2x + 1.", "apply gradients and perpendicular lines to a mapping context")],
  },
  {
    slug: "spiral-staircase",
    topic: "sequences",
    stem: "Unfamiliar context: The vertical clearances between successive platforms in a spiral staircase are 2.4, 3.1, 4.0, 5.1 and 6.4 cm.",
    difficulty: 3,
    parts: [part("Suggest a formula for the nth clearance and use it to estimate the sixth clearance.", 3, ["The second differences are approximately constant at 0.2", "A quadratic model is aₙ = 0.1n² + 0.4n + 1.9", "The sixth clearance is approximately 8.5 cm"], "The values are consistent with a quadratic model aₙ = 0.1n² + 0.4n + 1.9. This gives a sixth clearance of about 8.5 cm.", "fit and extrapolate a quadratic sequence in an unfamiliar design context")],
  },
  {
    slug: "robot-arm",
    topic: "trigonometry",
    stem: "Unfamiliar context: A robot arm has two links of lengths 0.80 m and 0.55 m. The angle between them is 68° when it reaches a sample.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the distance from the joint to the sample.", 3, ["Use the cosine rule", "d² = 0.80² + 0.55² − 2(0.80)(0.55)cos68°", "d ≈ 0.84 m"], "Using the cosine rule, d² = 0.80² + 0.55² − 2(0.80)(0.55)cos68°, so d ≈ 0.84 m.", "apply the cosine rule to a non-standard engineering context")],
  },
  {
    slug: "fungal-spread",
    topic: "exponentials",
    stem: "Unfamiliar context: A fungus colony on a tree trunk has area 12 cm² and grows by a factor of 1.35 each week while conditions remain suitable.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Model the area after t weeks and estimate when it first exceeds 100 cm².", 3, ["A(t) = 12(1.35)^t", "Solve 12(1.35)^t > 100 using logarithms", "t > log(100/12)/log(1.35) ≈ 6.4, so it first exceeds 100 cm² in week 7"], "The model is A(t) = 12(1.35)^t. The threshold is reached when t > 6.4, so the area first exceeds 100 cm² during week 7.", "apply exponential modelling and logarithms to a biological spread")],
  },
  {
    slug: "drone-path",
    topic: "differentiation",
    stem: "Unfamiliar context: The height of a survey drone is h(t) = 18 + 6t − 0.5t² metres, where t is time in seconds after launch.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Find the time at which the drone reaches its greatest height and calculate that height.", 3, ["dh/dt = 6 − t", "Set dh/dt = 0, giving t = 6 s", "h(6) = 18 + 36 − 18 = 36 m"], "The vertical velocity is dh/dt = 6 − t. It is zero at t = 6 s, when the height is 36 m.", "apply differentiation to optimise an unfamiliar motion model")],
  },
  {
    slug: "reservoir-flow",
    topic: "integration",
    stem: "Unfamiliar context: Water enters a reservoir at rate q(t) = 4 + 2t − 0.5t² litres per minute for the first four minutes.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Find the volume entering during the first four minutes.", 3, ["Integrate q(t) from 0 to 4", "∫(4 + 2t − 0.5t²)dt = 4t + t² − t³/6", "The volume is [4t + t² − t³/6]₀⁴ = 16 + 16 − 64/6 ≈ 21.3 litres"], "The volume is ∫₀⁴(4 + 2t − 0.5t²)dt = [4t + t² − t³/6]₀⁴ ≈ 21.3 litres.", "apply definite integration to an unfamiliar flow-rate model")],
  },
  {
    slug: "rescue-drone",
    topic: "vectors",
    stem: "Unfamiliar context: A rescue drone flies 3 km east and then 4 km north to reach a stranded walker.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Represent the displacement as a vector and find its magnitude and bearing from east.", 3, ["The displacement is 3i + 4j km", "Magnitude = √(3² + 4²) = 5 km", "Bearing angle = tan⁻¹(4/3) ≈ 53.1° north of east"], "The displacement is 3i + 4j km, with magnitude 5 km. Its direction is 53.1° north of east.", "apply vector components and direction to an unfamiliar navigation problem")],
  },
  {
    slug: "bridge-equation",
    topic: "numerical",
    stem: "Unfamiliar context: A bridge designer needs a root of f(x) = x³ − 4x − 1 = 0 to set a support angle, starting with x₀ = 2.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Use one Newton-Raphson iteration to find x₁.", 3, ["f'(x) = 3x² − 4", "f(2) = −1 and f'(2) = 8", "x₁ = 2 − (−1/8) = 2.125"], "Since f'(x) = 3x² − 4, f(2) = −1 and f'(2) = 8. Therefore x₁ = 2 − (−1/8) = 2.125.", "apply Newton-Raphson iteration to an unfamiliar engineering model")],
  },
  {
    slug: "museum-survey",
    topic: "statistical-sampling",
    stem: "Unfamiliar context: A museum wants to estimate visitor satisfaction. Visitors are 60% adults, 25% students and 15% children, and the survey will sample 200 visitors.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Give a proportional stratified sample for the three groups and explain why it is preferable to taking 200 visitors at random.", 3, ["Adults: 0.60 × 200 = 120; students: 0.25 × 200 = 50; children: 0.15 × 200 = 30", "The sample should contain 120 adults, 50 students and 30 children", "Stratification ensures each group is represented in the population proportions"], "Use 120 adults, 50 students and 30 children. Proportional stratification represents every visitor group fairly and reduces the chance of an unrepresentative random sample.", "design and justify proportional sampling in an unfamiliar setting")],
  },
  {
    slug: "network-packets",
    topic: "probability",
    stem: "Unfamiliar context: A data centre reports that 3% of packets are corrupted. A second packet is corrupted with probability 0.10 if the first was corrupted and 0.02 otherwise.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Find the probability that two consecutive packets are both corrupted.", 2, ["Use P(A and B) = P(A)P(B given A)", "P = 0.03 × 0.10 = 0.003"], "The probability is 0.03 × 0.10 = 0.003, or 0.3%.", "apply conditional probability to a communications context")],
  },
  {
    slug: "battery-lifetimes",
    topic: "distributions",
    stem: "Unfamiliar context: The lifetime of a batch of sensor batteries is normally distributed with mean 48 hours and standard deviation 6 hours.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Estimate the proportion lasting longer than 60 hours.", 2, ["Standardise: z = (60 − 48)/6 = 2", "P(Z > 2) ≈ 0.0228, or 2.28%"], "A lifetime of 60 hours is two standard deviations above the mean. P(X > 60) = P(Z > 2) ≈ 0.0228, about 2.28%.", "apply the normal distribution to an unfamiliar product-reliability context")],
  },
  {
    slug: "delivery-robot",
    topic: "kinematics",
    stem: "Unfamiliar context: A delivery robot travels at 1.2 m s⁻¹ for 20 s, stops for 5 s, then travels at 0.8 m s⁻¹ for 30 s.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the robot's average speed over the complete 55-second journey.", 3, ["First distance = 1.2 × 20 = 24 m and second distance = 0.8 × 30 = 24 m", "Total distance = 48 m", "Average speed = 48/55 ≈ 0.873 m s⁻¹"], "The robot travels 48 m in 55 s, including the stop. Its average speed is 48/55 ≈ 0.873 m s⁻¹.", "apply average-speed reasoning to a piecewise unfamiliar journey")],
  },
  {
    slug: "maglev-cable",
    topic: "forces",
    stem: "Unfamiliar context: A maglev cable supports a 600 N load. The cable makes an angle of 30° to the vertical and the two sides share the load equally.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the tension in each side of the cable.", 3, ["The vertical component of each tension is T cos30°", "2T cos30° = 600", "T = 600/(2cos30°) ≈ 346 N"], "Resolving vertically gives 2T cos30° = 600, so the tension in each side is T ≈ 346 N.", "resolve forces in an unfamiliar support system")],
  },
];

const physics: ContextItem[] = [
  {
    slug: "hovercraft-launch",
    topic: "kinematics-dynamics",
    stem: "Unfamiliar context: A hovercraft of mass 800 kg accelerates from rest to 12 m s⁻¹ in 15 s while the average resistive force is 400 N.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the average driving force.", 3, ["Acceleration = 12/15 = 0.80 m s⁻²", "Resultant force = ma = 800 × 0.80 = 640 N", "Driving force = resultant force + resistance = 640 + 400 = 1040 N"], "The acceleration is 0.80 m s⁻², so the resultant force is 640 N. The driving force is 640 + 400 = 1040 N.", "apply Newton's second law with resistance to an unfamiliar vehicle")],
  },
  {
    slug: "wave-buoy",
    topic: "energy-power",
    stem: "Unfamiliar context: A wave-energy buoy transfers 18 kJ to its generator every 12 s, but only 65% becomes useful electrical output.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the useful electrical power.", 3, ["Useful energy = 0.65 × 18 000 = 11 700 J", "Power = energy/time", "P = 11 700/12 = 975 W"], "The useful energy is 11 700 J. The electrical power is 11 700/12 = 975 W.", "apply efficiency and power calculations to an unfamiliar renewable device")],
  },
  {
    slug: "smart-polymer",
    topic: "materials",
    stem: "Unfamiliar context: A smart polymer strip has a cross-sectional area of 2.0 × 10⁻⁶ m² and extends by 1.5 mm under a 120 N force. Its original length is 0.30 m.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Calculate the stress, strain and Young modulus of the strip.", 4, ["Stress = F/A = 120/(2.0 × 10⁻⁶) = 6.0 × 10⁷ Pa", "Strain = extension/original length = 0.0015/0.30 = 0.0050", "Young modulus = stress/strain", "E = 6.0 × 10⁷/0.0050 = 1.2 × 10¹⁰ Pa"], "The stress is 6.0 × 10⁷ Pa, the strain is 0.0050 and the Young modulus is 1.2 × 10¹⁰ Pa.", "apply stress, strain and Young modulus to an unfamiliar material")],
  },
  {
    slug: "ultrasound-image",
    topic: "waves",
    stem: "Unfamiliar context: An ultrasound probe emits waves of frequency 5.0 MHz through tissue where the wave speed is 1540 m s⁻¹.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the wavelength in the tissue and explain why a high frequency improves image detail.", 3, ["λ = v/f", "λ = 1540/(5.0 × 10⁶) = 3.08 × 10⁻⁴ m", "Shorter wavelength allows smaller structures to be resolved"], "The wavelength is 3.08 × 10⁻⁴ m. The high frequency gives a short wavelength, so the probe can distinguish smaller structures.", "apply wave equation and resolution ideas to a medical context")],
  },
  {
    slug: "led-threshold",
    topic: "quantum",
    stem: "Unfamiliar context: A violet LED begins emitting light when the applied potential reaches 2.8 V. Take the electron charge as 1.60 × 10⁻¹⁹ C.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Estimate the energy of one emitted photon and explain why the threshold voltage matters.", 3, ["Electrical energy gained is E = eV", "E = 1.60 × 10⁻¹⁹ × 2.8 = 4.48 × 10⁻¹⁹ J", "The threshold supplies approximately the energy needed for an electron-hole recombination photon"], "The photon energy is approximately 4.48 × 10⁻¹⁹ J. The threshold voltage is the minimum energy per charge needed for the LED to emit photons.", "apply quantisation and electrical energy to a semiconductor context")],
  },
  {
    slug: "wearable-sensor",
    topic: "electric-circuits",
    stem: "Unfamiliar context: A wearable sensor uses a thermistor whose resistance falls as skin temperature rises. It is placed in a potential-divider circuit.",
    difficulty: 2,
    parts: [part("Predict how the output potential changes when the skin warms if the thermistor is the lower resistor in the divider, and explain your reasoning.", 3, ["The thermistor resistance decreases", "The fraction Rthermistor/(Rfixed + Rthermistor) decreases", "The output potential across the thermistor decreases"], "When the skin warms, the thermistor resistance decreases. Its fraction of the total resistance decreases, so the output potential across the lower thermistor decreases.", "apply potential-divider and thermistor behaviour to an unfamiliar sensor")],
  },
  {
    slug: "airbag-collision",
    topic: "momentum",
    stem: "Unfamiliar context: An airbag increases the time taken for a passenger's momentum to fall from 900 kg m s⁻¹ to zero from 0.10 s to 0.40 s.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Compare the average forces on the passenger with and without the airbag.", 3, ["Force = change in momentum/time", "Without airbag: 900/0.10 = 9000 N", "With airbag: 900/0.40 = 2250 N, one quarter as large"], "Without the airbag the average force is 9000 N. With the airbag it is 2250 N, so increasing stopping time reduces the force to one quarter.", "apply impulse and momentum change to a safety context")],
  },
  {
    slug: "space-station-rotation",
    topic: "circular-shm",
    stem: "Unfamiliar context: A rotating space station has radius 50 m and completes one rotation every 20 s. A loose tool at the rim moves in a circle.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the centripetal acceleration of the tool at the rim.", 3, ["Angular speed ω = 2π/T = 2π/20 rad s⁻¹", "Centripetal acceleration a = ω²r", "a = (2π/20)² × 50 ≈ 4.93 m s⁻²"], "The angular speed is 2π/20 rad s⁻¹, so a = (2π/20)² × 50 ≈ 4.93 m s⁻² towards the centre.", "apply circular-motion equations to an unfamiliar rotating habitat")],
  },
  {
    slug: "lunar-transfer",
    topic: "fields",
    stem: "Unfamiliar context: A probe moves farther from a moon. Its gravitational potential changes from −2.0 × 10⁷ to −1.2 × 10⁷ J kg⁻¹.",
    difficulty: 2,
    parts: [part("Calculate the change in gravitational potential energy per kilogram and explain the sign.", 2, ["Change = final − initial", "ΔV = (−1.2 × 10⁷) − (−2.0 × 10⁷) = +8.0 × 10⁶ J kg⁻¹", "Positive change means energy is supplied as the probe moves away"], "The change is +8.0 × 10⁶ J kg⁻¹. The positive value means gravitational potential energy per kilogram increases as the probe moves away and work is done against the field.", "interpret gravitational potential changes in a spaceflight context")],
  },
  {
    slug: "insulated-cup",
    topic: "thermal",
    stem: "Unfamiliar context: A sealed cup of tea cools from 85 °C to 65 °C in a room at 20 °C. A new vacuum layer reduces the cooling rate.",
    difficulty: 2,
    parts: [part("Explain why the vacuum layer reduces cooling without stopping it completely.", 3, ["A vacuum contains very few particles, so conduction and convection through the layer are reduced", "Radiation and conduction through the solid walls can still transfer energy", "The temperature difference between tea and room drives net energy transfer"], "The vacuum suppresses conduction and convection because there are few particles in the gap. Radiation and conduction through the cup walls remain, and the temperature difference still drives cooling.", "apply thermal-transfer mechanisms to an unfamiliar product design")],
  },
  {
    slug: "medical-tracer",
    topic: "nuclear",
    stem: "Unfamiliar context: A medical tracer has an initial activity of 640 MBq and a half-life of 6 hours. A scan is planned 18 hours after injection.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the activity during the scan and explain why a short half-life is useful.", 3, ["18 hours is three half-lives", "Activity = 640 × (1/2)³ = 80 MBq", "A short half-life limits the time the patient is exposed to radiation"], "After three half-lives the activity is 640/8 = 80 MBq. A short half-life allows useful imaging but reduces the duration of radiation exposure.", "apply radioactive decay and risk reasoning to medical imaging")],
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

export const unfamiliarContextQuestions: Question[] = [
  ...subjectIds.biology.flatMap((subjectId) => buildQuestions(subjectId, biology)),
  ...subjectIds.chemistry.flatMap((subjectId) => buildQuestions(subjectId, chemistry)),
  ...subjectIds.maths.flatMap((subjectId) => buildQuestions(subjectId, maths)),
  ...subjectIds.physics.flatMap((subjectId) => buildQuestions(subjectId, physics)),
];
