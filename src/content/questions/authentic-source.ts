import type { AoCode, Question, QuestionKind } from "@/domain/types";
import { defineQuestions } from "./authoring";

/**
 * Original source-stimulus material written in the style of field notes,
 * reports, archive records and technical briefings. It is not copied source
 * material and carries explicit authored provenance.
 */

type SourcePart = {
  prompt: string;
  marks: number;
  scheme: string[];
  answer: string;
  claim: string;
  aos?: AoCode[];
};

type SourceItem = {
  slug: string;
  topic: string;
  stem: string;
  parts: SourcePart[];
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
): SourcePart {
  return { prompt, marks, scheme, answer, claim, aos };
}

function buildQuestions(subjectId: string, items: SourceItem[]): Question[] {
  return defineQuestions(
    items.map((item) => ({
      slug: ["authentic-source", subjectId, item.slug].join("-"),
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
      reviewer: "authored/authentic-source-review",
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

const biology: SourceItem[] = [
  {
    slug: "museum-marrow-extract",
    topic: "biological-molecules",
    stem: "Source extract: A museum conservation report says a preserved animal tissue contains a highly branched glucose polymer that is insoluble and compact enough to store in cells.",
    kind: "mcq",
    difficulty: 2,
    options: ["Cellulose", "Glycogen", "Phospholipid", "Amino acid"],
    correctIndex: 1,
    parts: [part("Identify the molecule and explain why its properties suit storage.", 2, ["The molecule is glycogen", "Its compact, branched structure allows rapid glucose release and its insolubility avoids a large water-potential effect"], "The molecule is glycogen. Its branched, compact structure allows glucose to be released quickly, while its insolubility means it does not greatly lower the cell's water potential.", "identify glycogen from an original conservation extract and link structure to function", ["AO2"])],
  },
  {
    slug: "polar-cell-report",
    topic: "cell-structure",
    stem: "Source extract: A polar research report describes a cell with a large central vacuole, a cellulose wall and many chloroplasts in its outer tissue.",
    difficulty: 2,
    parts: [part("Explain how two of these features help the organism survive at the ice edge.", 3, ["The cellulose wall prevents bursting and supports the cell", "The vacuole maintains turgor and stores solutes", "Chloroplasts absorb light for photosynthesis during the short growing season"], "The cellulose wall supports the cell, while the vacuole helps maintain turgor and can store solutes. Chloroplasts capture light for photosynthesis during the brief season when light is available.", "apply organelle structure and function to an original polar biology report")],
  },
  {
    slug: "tidal-pool-notebook",
    topic: "membranes-transport",
    stem: "Source extract: A marine biologist records that a tidal-pool alga becomes flaccid after a storm leaves salt crystals around its cells.",
    difficulty: 2,
    parts: [part("Explain the change using water potential and the selectively permeable membrane.", 3, ["The concentrated salt solution has a lower water potential than the cell sap", "Water leaves the cell by osmosis through the selectively permeable membrane", "The cell loses turgor and becomes flaccid"], "Salt crystals dissolve to form a concentrated solution with lower water potential than the cell sap. Water leaves through the selectively permeable membrane by osmosis, so the cell loses turgor and becomes flaccid.", "interpret an original field note using water-potential and osmosis ideas")],
  },
  {
    slug: "cheese-culture-report",
    topic: "enzymes",
    stem: "Source extract: A cheese-maker's report says a microbial enzyme works fastest at 42 °C, but heating the milk to 75 °C stops the reaction permanently.",
    difficulty: 2,
    parts: [part("Explain both observations in terms of enzyme structure.", 3, ["At 42 °C molecules have enough kinetic energy for frequent successful collisions", "At 75 °C bonds maintaining tertiary structure are disrupted", "The active site changes shape and the enzyme is denatured"], "At 42 °C, increased kinetic energy makes successful collisions more frequent. At 75 °C, bonds in the tertiary structure are disrupted, changing the active site permanently so the enzyme is denatured.", "explain enzyme rate and irreversible denaturation from an original production report")],
  },
  {
    slug: "virus-sequence-brief",
    topic: "nucleic-acids",
    stem: "Source extract: A veterinary sequencing brief gives the template DNA sequence TAC GGA CTT for a viral protein and notes that ribosomes read mRNA codons.",
    kind: "extended",
    difficulty: 2,
    parts: [
      part("Give the mRNA sequence made from the template.", 1, ["Use complementary base pairing", "The sequence is AUG CCU GAA"], "The mRNA sequence is AUG CCU GAA.", "transcribe a sequence from an original sequencing brief"),
      part("Explain how the ribosome uses this molecule.", 3, ["mRNA attaches to a ribosome", "tRNA anticodons pair with complementary mRNA codons", "The ribosome forms peptide bonds in the specified amino-acid sequence"], "The mRNA binds to a ribosome. tRNA anticodons pair with its codons and the ribosome joins the delivered amino acids with peptide bonds in the sequence specified by the mRNA.", "apply transcription and translation to an original viral source extract", ["AO2", "AO3"]),
    ],
  },
  {
    slug: "mole-burrow-report",
    topic: "gas-exchange",
    stem: "Source extract: A subterranean-mammal report says the animal has enlarged nasal passages and a dense network of capillaries in its lung surfaces.",
    difficulty: 2,
    parts: [part("Explain how these features can increase oxygen uptake in a poorly ventilated burrow.", 3, ["Enlarged passages allow a greater volume of air to reach exchange surfaces", "A dense capillary network provides a large blood supply and maintains a concentration gradient", "The short diffusion distance and large surface area increase diffusion rate"], "Enlarged nasal passages help deliver air to the exchange surfaces. A dense capillary network maintains a steep oxygen gradient, while a large, thin exchange surface increases diffusion rate.", "apply gas-exchange principles to an original ecological report")],
  },
  {
    slug: "camel-blood-report",
    topic: "transport-animals",
    stem: "Source extract: A veterinary report records that a desert camel's haemoglobin remains highly saturated at the low oxygen partial pressure found after a long trek.",
    difficulty: 3,
    parts: [part("Explain how this property helps the camel and how its tissues can still receive oxygen.", 3, ["High haemoglobin affinity allows loading in low lung pO₂", "Respiring tissues have a lower pO₂ and remove oxygen from the blood", "The dissociation curve allows unloading as pO₂ falls"], "High affinity allows the camel to load oxygen when lung pO₂ is low. Respiring tissues lower their own pO₂, so the fall in pO₂ promotes haemoglobin dissociation and oxygen unloading.", "interpret haemoglobin affinity in an original veterinary source")],
  },
  {
    slug: "forest-core-sample",
    topic: "transport-plants",
    stem: "Source extract: A forest-core study reports that water reaches leaves above a ring of bark, but sugars fail to reach roots below the ring.",
    difficulty: 3,
    parts: [part("Use the observations to identify the transport tissues and explain the difference.", 4, ["Xylem carries water and mineral ions upwards", "The xylem remains continuous above the ring", "Phloem carries sucrose and other assimilates between sources and sinks", "Removing a ring interrupts phloem, so sugars accumulate above it and roots receive less"], "The intact xylem still carries water to the leaves. Ringing interrupts the phloem, which normally transports sucrose from leaves to roots, so sugars accumulate above the ring and the roots are deprived.", "interpret a classic transport observation from an original forestry report")],
  },
  {
    slug: "peatland-survey",
    topic: "biodiversity",
    stem: "Source extract: A peatland survey lists 12 plant species in restored plots and 12 species in drained plots, but says restored plots have much more even abundances.",
    difficulty: 3,
    parts: [part("Explain why species richness alone does not fully describe the biodiversity difference.", 3, ["Both plots have the same number of species, so species richness is equal", "Biodiversity also depends on relative abundance or evenness", "A plot dominated by one species is less diverse than one with balanced abundances"], "Species richness is equal because both plots contain 12 species. The restored plots may have greater biodiversity because their individuals are distributed more evenly rather than being dominated by one species.", "evaluate biodiversity measures using an original ecological survey")],
  },
  {
    slug: "brewery-log",
    topic: "respiration",
    stem: "Source extract: A brewery log says yeast was sealed in sugar solution after oxygen was depleted; carbon dioxide increased and ethanol was recovered from the vessel.",
    difficulty: 2,
    parts: [part("Write the word equation and explain why the process is useful to the brewery.", 3, ["The process is anaerobic respiration in yeast", "Glucose is converted to ethanol and carbon dioxide", "Ethanol is the desired product and carbon dioxide can help produce a characteristic texture"], "In anaerobic respiration, glucose is converted to ethanol and carbon dioxide. The brewery collects the ethanol, while the carbon dioxide can contribute to the texture of the product.", "apply anaerobic respiration to an original industrial log")],
  },
  {
    slug: "algal-observatory",
    topic: "photosynthesis",
    stem: "Source extract: An algal-observatory report says oxygen output rises when dissolved carbon dioxide is increased, but only while the culture is under dim light.",
    kind: "extended",
    difficulty: 3,
    parts: [
      part("Explain why carbon dioxide has an effect in dim light but not necessarily in bright light.", 3, ["In dim light, light intensity may be the limiting factor", "Increased carbon dioxide cannot overcome a different limiting factor", "In bright light, carbon dioxide may become limiting and enrichment can increase rate"], "In dim light, light intensity limits the rate, so adding carbon dioxide has little effect. In bright light, carbon dioxide may become the limiting factor and enrichment can raise the photosynthetic rate.", "apply limiting-factor reasoning to an original research report"),
      part("Suggest one controlled variable for comparing the cultures.", 1, ["Keep temperature, algal biomass or volume of culture constant"], "Temperature should be kept constant between the cultures.", "identify control variables in an original photosynthesis investigation", ["AO2", "AO3"]),
    ],
  },
  {
    slug: "thermoregulation-clinic",
    topic: "homeostasis",
    stem: "Source extract: A clinical note says a runner's core temperature rises during a race, then returns towards normal as sweating and skin blood flow increase.",
    difficulty: 2,
    parts: [part("Explain how these responses form a negative-feedback system.", 4, ["Temperature receptors detect a rise above the set point", "The hypothalamus coordinates responses", "Sweat evaporation removes latent heat and vasodilation increases heat loss", "As temperature falls towards the set point, the responses reduce"], "A rise in core temperature is detected and the hypothalamus coordinates sweating and vasodilation. Evaporation and increased blood flow at the skin increase heat loss, reducing temperature towards the set point; the response then decreases.", "explain thermoregulatory negative feedback from an original clinical note")],
  },
  {
    slug: "seed-bank-record",
    topic: "genetics-inheritance",
    stem: "Source extract: A seed-bank record states that two heterozygous plants with purple flowers are crossed, with purple dominant to white.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Predict the genotypic and phenotypic ratios of the offspring.", 3, ["Let P be purple and p be white; parents are Pp × Pp", "Genotypes are PP:Pp:pp = 1:2:1", "Phenotypes are purple:white = 3:1"], "Pp × Pp gives a genotypic ratio of 1 PP:2 Pp:1 pp and a phenotypic ratio of 3 purple:1 white.", "apply a monohybrid cross to an original seed-bank record")],
  },
  {
    slug: "lake-monitoring",
    topic: "ecosystems",
    stem: "Source extract: A lake-monitoring report says phosphate runoff caused algal blooms, followed by low dissolved oxygen and fish deaths after the algae died.",
    difficulty: 3,
    parts: [part("Explain the sequence of events from phosphate enrichment to fish death.", 4, ["Phosphate causes rapid algal growth or eutrophication", "Algae block light and later die", "Decomposers respire while breaking down dead algae and use oxygen", "Dissolved oxygen falls and fish die from lack of oxygen"], "Phosphate enrichment causes an algal bloom. The algae reduce light penetration and eventually die; decomposers break them down aerobically and use dissolved oxygen, so oxygen concentration falls and fish may die.", "explain eutrophication from an original environmental report", ["AO2", "AO3"])],
  },
];

const chemistry: SourceItem[] = [
  {
    slug: "archaeology-isotopes",
    topic: "atomic-structure",
    stem: "Source extract: An archaeology report identifies two isotopes of lead in a pigment sample: mass 206 at 24% abundance and mass 208 at 76% abundance.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the relative atomic mass of lead in the sample and explain the result.", 2, ["Use a weighted mean", "(206 × 24 + 208 × 76)/100 = 207.52", "The result is an abundance-weighted mean rather than one isotope mass"], "The relative atomic mass is (206 × 24 + 208 × 76)/100 = 207.52. It is a weighted mean because the pigment contains both isotopes.", "calculate an isotopic mean from an original archaeology report")],
  },
  {
    slug: "water-treatment-log",
    topic: "moles",
    stem: "Source extract: A water-treatment log uses 0.0200 mol dm⁻³ sodium thiosulfate. A 25.0 cm³ sample requires 18.60 cm³ of solution in a 1:1 reaction.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the amount and concentration of the reacting species in the water sample.", 4, ["Moles of thiosulfate = 0.0200 × 0.01860 = 3.72 × 10⁻⁴ mol", "The 1:1 equation gives the same amount in the sample", "Sample volume = 0.0250 dm³", "Concentration = 3.72 × 10⁻⁴/0.0250 = 0.0149 mol dm⁻³"], "The titre contains 3.72 × 10⁻⁴ mol thiosulfate. With a 1:1 ratio, the sample contains the same amount, giving a concentration of 0.0149 mol dm⁻³.", "apply titration stoichiometry to an original treatment log")],
  },
  {
    slug: "aerogel-materials",
    topic: "bonding",
    stem: "Source extract: A materials report describes an aerogel as rigid, very low density and unable to conduct electricity even when heated strongly.",
    kind: "mcq",
    difficulty: 2,
    options: ["A giant covalent structure with strong bonds throughout", "A simple molecular substance with weak intermolecular forces", "A giant ionic lattice with mobile ions when solid", "A metallic lattice with delocalised electrons"],
    correctIndex: 0,
    parts: [part("Choose the structure that best fits the report and justify it.", 2, ["Strong covalent bonds explain rigidity", "The absence of mobile charged particles explains electrical insulation"], "A giant covalent structure fits the rigidity and lack of electrical conduction. It has strong covalent bonds but no mobile charged particles.", "infer structure and bonding from an original materials report", ["AO2"])],
  },
  {
    slug: "thermal-pack-log",
    topic: "energetics",
    stem: "Source extract: A thermal-pack log records 200 g of water warming from 19.0 °C to 31.5 °C. The specific heat capacity of water is 4.18 J g⁻¹ K⁻¹.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the energy transferred and state whether the pack reaction is exothermic or endothermic.", 3, ["q = mcΔT", "q = 200 × 4.18 × 12.5 = 10 450 J", "The pack releases energy, so its reaction is exothermic"], "The water gains q = 200 × 4.18 × 12.5 = 10 450 J. The reaction in the pack is exothermic because it releases energy to the water.", "apply calorimetry to an original product log")],
  },
  {
    slug: "catalyst-trial",
    topic: "kinetics",
    stem: "Source extract: A catalyst-trial report says a reaction reaches its plateau sooner with catalyst Y, although the final amounts of reactants and products are identical.",
    difficulty: 2,
    parts: [part("Explain the observations using activation energy and equilibrium.", 3, ["Catalyst Y provides an alternative pathway with lower activation energy", "A greater proportion of collisions are successful per second", "The catalyst speeds forward and reverse reactions equally and does not change equilibrium position"], "Catalyst Y lowers activation energy through an alternative pathway, so the rate increases. It does not change the equilibrium position because it speeds the forward and reverse reactions equally.", "separate rate and equilibrium effects in an original kinetics report")],
  },
  {
    slug: "ammonia-plant-memo",
    topic: "equilibria",
    stem: "Source extract: An ammonia-plant memo says N₂ + 3H₂ ⇌ 2NH₃ is exothermic and that increasing pressure raises the equilibrium yield of ammonia.",
    difficulty: 3,
    parts: [part("Explain the pressure observation and state the effect of increasing temperature on the equilibrium yield.", 3, ["There are four moles of gas on the left and two on the right", "Increasing pressure favours the side with fewer gas molecules, so ammonia yield rises", "Increasing temperature favours the endothermic reverse reaction, reducing ammonia yield"], "Higher pressure favours the right because it has fewer gas molecules, increasing ammonia yield. Since the forward reaction is exothermic, higher temperature favours the reverse reaction and lowers the equilibrium yield.", "apply Le Chatelier's principle to an original industrial memo")],
  },
  {
    slug: "lake-acidity-record",
    topic: "acids-bases",
    stem: "Source extract: A lake-acidity record gives pH 4.0 before limestone treatment and pH 5.0 afterwards.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Compare the hydrogen-ion concentrations before and after treatment.", 2, ["[H⁺] at pH 4 is 1.0 × 10⁻⁴ mol dm⁻³", "[H⁺] at pH 5 is 1.0 × 10⁻⁵ mol dm⁻³, so it is ten times lower"], "The hydrogen-ion concentration falls from 1.0 × 10⁻⁴ to 1.0 × 10⁻⁵ mol dm⁻³. It is ten times lower after treatment.", "interpret logarithmic pH change in an original environmental record")],
  },
  {
    slug: "battery-safety-report",
    topic: "redox",
    stem: "Source extract: A battery-safety report says metal M loses electrons at the negative electrode while ions of N gain electrons at the positive electrode.",
    difficulty: 2,
    parts: [part("Identify oxidation and reduction and state the direction of electron flow.", 3, ["M is oxidised because it loses electrons", "N ions are reduced because they gain electrons", "Electrons flow through the external circuit from M to the positive electrode"], "M is oxidised at the negative electrode and N ions are reduced at the positive electrode. Electrons flow through the external circuit from M to the positive electrode.", "apply redox definitions to an original battery report")],
  },
  {
    slug: "periodic-trends-archive",
    topic: "periodicity",
    stem: "Source extract: A teaching archive records first ionisation energies of 496, 738, 578 and 786 kJ mol⁻¹ for four consecutive elements and highlights the drop from the second to the third.",
    kind: "mcq",
    difficulty: 3,
    options: [
      "The third element starts a new period and has an electron in a higher shell",
      "The third element is a noble gas with a complete outer shell",
      "The second element has more electron shells than the third",
      "The drop proves the third element has a larger nuclear charge",
    ],
    correctIndex: 0,
    parts: [part("Select the explanation for the drop and justify it.", 2, ["The drop suggests the third element begins a new period", "Its outer electron is in a shell farther from the nucleus and is easier to remove"], "The third element may begin a new period. Its outer electron occupies a new shell farther from the nucleus, so less energy is needed to remove it.", "interpret an ionisation-energy anomaly in an original archive extract", ["AO2"])],
  },
  {
    slug: "pigment-conservator",
    topic: "transition-metals",
    stem: "Source extract: A pigment conservator writes that a blue copper complex becomes pale when ammonia is removed, then returns blue when ammonia is added again.",
    difficulty: 3,
    parts: [part("Explain why changing the ligand can change the observed colour.", 3, ["Ligands alter the energy difference between d orbitals", "Electrons absorb a different wavelength when they move between d orbitals", "The wavelength not absorbed determines the complementary colour observed"], "Ammonia changes the ligand environment around copper, altering the d-orbital energy gap. A different wavelength is absorbed, so the complementary colour seen by the observer changes.", "apply transition-metal colour theory to an original conservation record")],
  },
  {
    slug: "distillery-record",
    topic: "organic-basics",
    stem: "Source extract: A distillery record says a fermented liquid is fractionally distilled to collect propan-1-ol before it is blended into a fuel.",
    difficulty: 2,
    parts: [part("Explain how fractional distillation separates the propan-1-ol and identify its functional group.", 3, ["The components have different boiling points", "Repeated vaporisation and condensation enriches the more volatile component", "Propan-1-ol contains an alcohol hydroxyl group"], "Fractional distillation separates the liquid because the components have different boiling points; repeated vaporisation and condensation enriches the lower-boiling fraction. Propan-1-ol contains an alcohol hydroxyl group.", "apply separation and functional-group knowledge to an original distillery record")],
  },
  {
    slug: "polymer-lab-notebook",
    topic: "hydrocarbons",
    stem: "Source extract: A polymer laboratory notebook says ethene gas is passed over a catalyst to make a tough solid used in packaging.",
    difficulty: 2,
    parts: [part("Name the reaction and describe the structural change to ethene.", 3, ["The reaction is addition polymerisation", "The C=C double bond opens", "C-C single bonds link many ethene molecules into a long chain"], "Ethene undergoes addition polymerisation. Its C=C double bond opens and C-C single bonds link many monomers into a long-chain polymer.", "apply hydrocarbon reactivity to an original polymer notebook")],
  },
  {
    slug: "flavour-house-record",
    topic: "carbonyls-acids",
    stem: "Source extract: A flavour-house record says compound X gives an orange precipitate with 2,4-DNPH, a silver mirror with Tollens' reagent and no fizzing with sodium carbonate.",
    kind: "extended",
    difficulty: 2,
    parts: [
      part("Identify the functional group and decide whether X is an aldehyde, ketone or carboxylic acid.", 2, ["2,4-DNPH shows a carbonyl group", "Tollens' reagent identifies an aldehyde; the negative carbonate test also rules out a carboxylic acid"], "X contains a carbonyl group and is an aldehyde. The negative carbonate result means it is not a carboxylic acid.", "interpret a sequence of original qualitative organic tests"),
      part("State the observation with sodium carbonate for a carboxylic acid.", 1, ["Fizzing or effervescence occurs as carbon dioxide is released"], "A carboxylic acid would fizz because carbon dioxide is released.", "distinguish carboxylic acids using an original test record", ["AO1", "AO2"]),
    ],
  },
  {
    slug: "drug-design-brief",
    topic: "aromatics-nitrogen",
    stem: "Source extract: A drug-design brief states that a molecule contains a benzene ring and a primary amine; the amine forms a salt with hydrochloric acid during formulation.",
    difficulty: 2,
    parts: [part("Explain why the amine can react with hydrochloric acid and why the salt is more water-soluble.", 3, ["The nitrogen lone pair accepts a proton", "An ammonium salt forms", "The ionic salt is attracted to polar water molecules and is hydrated"], "The amine nitrogen has a lone pair that accepts H⁺, forming an ammonium salt. The ionic salt interacts strongly with polar water molecules and is therefore more soluble.", "apply aromatic amine basicity to an original pharmaceutical brief")],
  },
  {
    slug: "forensic-spectrum",
    topic: "spectroscopy",
    stem: "Source extract: A forensic report gives an IR absorption near 1715 cm⁻¹ and a proton NMR spectrum with a six-hydrogen singlet for an unknown liquid.",
    kind: "mcq",
    difficulty: 3,
    options: ["Propanone", "Ethanol", "Ethanoic acid", "Propan-1-ol"],
    correctIndex: 0,
    parts: [part("Identify the liquid and use both pieces of spectral evidence.", 2, ["The IR absorption indicates a carbonyl group", "A six-hydrogen singlet fits two equivalent methyl groups in propanone"], "The liquid is propanone, CH₃COCH₃. The IR peak indicates C=O and the six-hydrogen singlet fits two equivalent methyl groups.", "combine IR and NMR evidence from an original forensic report", ["AO2", "AO3"])],
  },
];

const maths: SourceItem[] = [
  {
    slug: "railway-claim",
    topic: "proof",
    stem: "Source extract: A railway engineer's note claims that the expression n² + n + 11 is prime for every whole-number carriage index because it worked for the first ten indices.",
    kind: "extended",
    difficulty: 3,
    parts: [part("Disprove the claim and explain why the recorded examples do not constitute proof.", 3, ["At n = 11, the expression is 121 + 11 + 11 = 143", "143 = 11 × 13, so it is not prime", "A finite list of examples cannot prove a statement for every whole number"], "At n = 11, n² + n + 11 = 143 = 11 × 13, so the claim is false. The first ten examples only provide evidence and cannot prove a universal statement.", "use a counterexample and distinguish evidence from proof in an original engineering note", ["AO2", "AO3"])],
  },
  {
    slug: "wildlife-ticket-model",
    topic: "algebra",
    stem: "Source extract: A wildlife park models daily ticket income by R = x(120 − 3x), where x is the ticket price in pounds and visitor numbers are 120 − 3x.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Find the ticket prices giving zero income and the price giving maximum income.", 4, ["R = 0 when x = 0 or 120 − 3x = 0", "The zero-income prices are £0 and £40", "R = 120x − 3x² has vertex at x = −120/(2 × −3) = 20", "At x = 20, R = 20(120 − 60) = £1200"], "Income is zero at £0 and £40. The quadratic is maximised at a ticket price of £20, giving maximum income £1200.", "apply quadratic modelling to an original commercial source extract")],
  },
  {
    slug: "coastline-survey",
    topic: "coordinate-geometry",
    stem: "Source extract: A coastline survey places two markers at P(−2, 4) and Q(6, 0). A protected boundary must pass through P and be perpendicular to PQ.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Find the equation of the protected boundary.", 3, ["Gradient PQ = (0 − 4)/(6 − (−2)) = −1/2", "A perpendicular gradient is 2", "Through P: y − 4 = 2(x + 2), so y = 2x + 8"], "PQ has gradient −1/2, so the perpendicular gradient is 2. The boundary is y − 4 = 2(x + 2), or y = 2x + 8.", "apply perpendicular gradients to an original mapping record")],
  },
  {
    slug: "staircase-archive",
    topic: "sequences",
    stem: "Source extract: An architectural archive records the widths of five decorative steps as 3.0, 4.2, 5.8, 7.8 and 10.2 cm.",
    difficulty: 3,
    parts: [part("Suggest a quadratic formula for the nth width and estimate the sixth width.", 3, ["The first differences are 1.2, 1.6, 2.0 and 2.4", "The second difference is 0.4, so a quadratic model has coefficient 0.2", "Continuing the differences gives a sixth width of 13.0 cm"], "The second difference is 0.4. The next first difference is 2.8, so a reasonable sixth width is 10.2 + 2.8 = 13.0 cm.", "extrapolate a quadratic sequence from an original architectural record")],
  },
  {
    slug: "navigation-log",
    topic: "trigonometry",
    stem: "Source extract: A navigation log says a survey boat travels 7.0 km and then 5.0 km with an included angle of 112° between the legs.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the boat's displacement from its starting point.", 3, ["Use the cosine rule", "d² = 7² + 5² − 2(7)(5)cos112°", "d ≈ 9.36 km"], "The displacement is given by d² = 7² + 5² − 2(7)(5)cos112°, so d ≈ 9.36 km.", "apply the cosine rule to an original navigation log")],
  },
  {
    slug: "virus-growth-report",
    topic: "exponentials",
    stem: "Source extract: A public-health report models the number of infected plants as N(t) = 40(1.28)^t, where t is measured in days.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Estimate the number infected after 8 days and explain the meaning of 1.28.", 2, ["N(8) = 40(1.28)^8 ≈ 353", "1.28 is the daily multiplication factor, equivalent to 28% growth per day"], "After 8 days, N(8) = 40(1.28)^8 ≈ 353 plants. The factor 1.28 means the number is multiplied by 1.28 each day, a 28% daily increase.", "interpret an exponential model in an original epidemiological report")],
  },
  {
    slug: "solar-panel-optimisation",
    topic: "differentiation",
    stem: "Source extract: A solar-panel report models output by P(θ) = 900 + 240 sin θ − 30θ²/100, for a tilt angle θ in degrees over a small operating range.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Explain how differentiation can be used to find the tilt giving a stationary output.", 3, ["Differentiate P with respect to θ", "Set dP/dθ = 0 to find stationary points", "Check the second derivative or nearby values to identify a maximum"], "Differentiate the model, solve dP/dθ = 0, then use the second derivative or compare nearby outputs to decide which stationary point is a maximum.", "apply differentiation and stationary-point reasoning to an original engineering model")],
  },
  {
    slug: "reservoir-archive",
    topic: "integration",
    stem: "Source extract: A reservoir archive models inflow by q(t) = 6 + 3t − t² litres per minute for the first three minutes after a gate opens.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Find the volume entering during the first three minutes.", 3, ["Integrate q(t) from 0 to 3", "An antiderivative is 6t + 1.5t² − t³/3", "The volume is [6t + 1.5t² − t³/3]₀³ = 18 + 13.5 − 9 = 22.5 litres"], "The volume is ∫₀³(6 + 3t − t²)dt = [6t + 1.5t² − t³/3]₀³ = 22.5 litres.", "apply definite integration to an original water-management record")],
  },
  {
    slug: "sailing-route",
    topic: "vectors",
    stem: "Source extract: A sailing log records a displacement of 6 km east followed by 2 km west and 5 km north.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Represent the final displacement as a vector and calculate its magnitude.", 3, ["The east-west component is 6 − 2 = 4 km", "The displacement is 4i + 5j km", "Magnitude = √(4² + 5²) = √41 ≈ 6.40 km"], "The final displacement is 4i + 5j km. Its magnitude is √41 ≈ 6.40 km.", "combine vector components from an original navigation source")],
  },
  {
    slug: "calibration-notebook",
    topic: "numerical",
    stem: "Source extract: A calibration notebook uses Newton-Raphson to solve f(x) = x² − 5 = 0, starting from x₀ = 2.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the next Newton-Raphson estimate.", 3, ["f'(x) = 2x", "f(2) = −1 and f'(2) = 4", "x₁ = 2 − (−1/4) = 2.25"], "For f(x) = x² − 5, f'(x) = 2x. Thus x₁ = 2 − (−1/4) = 2.25.", "apply numerical iteration to an original calibration record")],
  },
  {
    slug: "heritage-survey",
    topic: "statistical-sampling",
    stem: "Source extract: A heritage survey records 500 visitors: 300 adults, 120 children and 80 older visitors. The researchers want a proportional sample of 50.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Give a proportional stratified sample and explain why it is suitable.", 3, ["Adults: 300/500 × 50 = 30", "Children: 120/500 × 50 = 12 and older visitors: 80/500 × 50 = 8", "The sample preserves the population proportions"], "The sample should contain 30 adults, 12 children and 8 older visitors. Proportional stratification ensures each group is represented in the same proportion as the population.", "calculate and justify a stratified sample from an original survey")],
  },
  {
    slug: "quality-control-record",
    topic: "probability",
    stem: "Source extract: A quality-control record says 4% of circuit boards fail inspection. Of failed boards, 70% have a cracked joint; of passing boards, 2% are incorrectly flagged as cracked.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Find the probability that a board chosen at random has a cracked joint and fails inspection.", 2, ["Use P(fail and cracked) = P(fail)P(cracked given fail)", "P = 0.04 × 0.70 = 0.028"], "The probability is 0.04 × 0.70 = 0.028, or 2.8%.", "apply conditional probability to an original quality-control record")],
  },
  {
    slug: "meteorological-record",
    topic: "distributions",
    stem: "Source extract: A meteorological record models daily rainfall as normally distributed with mean 6 mm and standard deviation 2 mm.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Estimate the proportion of days with rainfall above 10 mm.", 2, ["Standardise: z = (10 − 6)/2 = 2", "P(Z > 2) ≈ 0.0228, or 2.28%"], "Ten millimetres is two standard deviations above the mean. The estimated proportion is P(Z > 2) ≈ 0.0228, or 2.28%.", "apply the normal distribution to an original weather record")],
  },
  {
    slug: "train-log",
    topic: "kinematics",
    stem: "Source extract: A heritage railway log says a train travels at 4.0 m s⁻¹ for 30 s, accelerates uniformly to 10.0 m s⁻¹ over 12 s and then stops at a platform in 8 s.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Calculate the distance travelled during the uniform acceleration phase.", 2, ["For uniform acceleration, distance = average velocity × time", "s = ((4.0 + 10.0)/2) × 12 = 84 m"], "The average velocity is 7.0 m s⁻¹, so the distance travelled is 7.0 × 12 = 84 m.", "apply SUVAT and average-velocity reasoning to an original railway log")],
  },
  {
    slug: "cable-inspection",
    topic: "forces",
    stem: "Source extract: A cable-inspection report says a 500 N lamp is suspended symmetrically by two cables, each making 40° to the horizontal.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the tension in each cable.", 3, ["The vertical component of each tension is T sin40°", "2T sin40° = 500", "T = 500/(2sin40°) ≈ 389 N"], "Resolving vertically gives 2T sin40° = 500. Therefore the tension in each cable is approximately 389 N.", "resolve forces using an original structural inspection report")],
  },
];

const physics: SourceItem[] = [
  {
    slug: "cyclist-field-note",
    topic: "kinematics-dynamics",
    stem: "Source extract: A cycling field note says a 75 kg rider and bicycle accelerate from 3.0 to 9.0 m s⁻¹ in 12 s against an average resistance of 25 N.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the average driving force.", 3, ["Acceleration = (9.0 − 3.0)/12 = 0.50 m s⁻²", "Resultant force = ma = 75 × 0.50 = 37.5 N", "Driving force = 37.5 + 25 = 62.5 N"], "The acceleration is 0.50 m s⁻², giving a resultant force of 37.5 N. The driving force is 37.5 + 25 = 62.5 N.", "apply Newton's second law to an original cycling field note")],
  },
  {
    slug: "tidal-generator-report",
    topic: "energy-power",
    stem: "Source extract: A tidal-generator report says a turbine receives 45 kJ of kinetic energy every 20 s and delivers 14 kJ of electrical energy in that time.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the useful power and efficiency.", 3, ["Useful power = 14 000/20 = 700 W", "Efficiency = useful output/input", "Efficiency = 14/45 × 100 ≈ 31.1%"], "The useful power is 700 W. The efficiency is (14/45) × 100 ≈ 31.1%.", "apply energy, power and efficiency to an original renewable-energy report")],
  },
  {
    slug: "bridge-materials-report",
    topic: "materials",
    stem: "Source extract: A bridge-materials report gives a stress of 1.5 × 10⁸ Pa and strain of 7.5 × 10⁻⁴ for a new alloy.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the Young modulus and explain what a larger value indicates.", 2, ["E = stress/strain", "E = (1.5 × 10⁸)/(7.5 × 10⁻⁴) = 2.0 × 10¹¹ Pa", "A larger Young modulus means less strain for a given stress"], "The Young modulus is 2.0 × 10¹¹ Pa. A larger value indicates a stiffer material, which undergoes less strain for the same stress.", "interpret stress-strain data from an original materials report")],
  },
  {
    slug: "sonar-log",
    topic: "waves",
    stem: "Source extract: A sonar log records a pulse frequency of 2.5 × 10⁵ Hz travelling through seawater at 1500 m s⁻¹.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the wavelength and explain why the pulse can resolve small objects.", 3, ["λ = v/f", "λ = 1500/(2.5 × 10⁵) = 6.0 × 10⁻³ m", "A shorter wavelength allows smaller separations to be distinguished"], "The wavelength is 6.0 × 10⁻³ m. Its relatively short wavelength allows the sonar to distinguish objects that are close together.", "apply the wave equation and resolution to an original sonar record")],
  },
  {
    slug: "photodiode-brief",
    topic: "quantum",
    stem: "Source extract: A photodiode brief says photons of frequency 7.0 × 10¹⁴ Hz eject electrons from a surface, while photons of 4.0 × 10¹⁴ Hz do not. Take h = 6.63 × 10⁻³⁴ J s.",
    kind: "extended",
    difficulty: 3,
    parts: [
      part("Explain why increasing the intensity of the lower-frequency light does not eject electrons.", 2, ["The lower frequency is below the threshold frequency", "Each photon has insufficient energy, and intensity only increases the number of photons"], "The lower-frequency photons each have too little energy to exceed the work function. Increasing intensity adds more low-energy photons but does not increase the energy of each photon.", "apply the threshold-frequency model to an original photodiode brief"),
      part("Calculate the energy of one photon at 7.0 × 10¹⁴ Hz.", 2, ["E = hf", "E = 6.63 × 10⁻³⁴ × 7.0 × 10¹⁴ = 4.64 × 10⁻¹⁹ J"], "The photon energy is E = hf = 4.64 × 10⁻¹⁹ J.", "calculate photon energy from an original quantum source", ["AO2", "AO3"]),
    ],
  },
  {
    slug: "sensor-circuit-note",
    topic: "electric-circuits",
    stem: "Source extract: A sensor-circuit note says a thermistor's resistance falls as temperature rises and that it forms the lower arm of a potential divider.",
    difficulty: 2,
    parts: [part("Predict the change in output potential across the thermistor when temperature rises.", 3, ["The thermistor resistance decreases", "The ratio Rthermistor/(Rfixed + Rthermistor) decreases", "The output potential across the lower arm decreases"], "As temperature rises, the thermistor resistance falls. Its fraction of the total resistance becomes smaller, so the output potential across it decreases.", "apply thermistor and potential-divider behaviour to an original circuit note")],
  },
  {
    slug: "crash-test-report",
    topic: "momentum",
    stem: "Source extract: A crash-test report says an occupant's momentum changes by 1200 kg m s⁻¹. A restraint increases the stopping time from 0.12 s to 0.48 s.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Compare the average force with and without the restraint.", 3, ["Force = change in momentum/time", "Without restraint: 1200/0.12 = 10 000 N", "With restraint: 1200/0.48 = 2500 N, one quarter as large"], "Without the restraint the average force is 10 000 N. With it, the force is 2500 N, so the longer stopping time reduces the force to one quarter.", "apply impulse and momentum to an original safety report")],
  },
  {
    slug: "centrifuge-log",
    topic: "circular-shm",
    stem: "Source extract: A centrifuge log records a rotor radius of 0.20 m and a rotation frequency of 5.0 Hz.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the centripetal acceleration at the rotor edge.", 3, ["Angular speed ω = 2πf = 10π rad s⁻¹", "a = ω²r", "a = (10π)² × 0.20 ≈ 197 m s⁻²"], "The angular speed is 10π rad s⁻¹. The centripetal acceleration is (10π)² × 0.20 ≈ 197 m s⁻² towards the centre.", "apply circular-motion equations to an original equipment log")],
  },
  {
    slug: "planetary-mission-report",
    topic: "fields",
    stem: "Source extract: A planetary-mission report says a probe's gravitational potential changes from −4.0 × 10⁷ to −2.5 × 10⁷ J kg⁻¹ as it moves away from a planet.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the change in gravitational potential energy per kilogram and interpret its sign.", 2, ["ΔV = final − initial", "ΔV = (−2.5 × 10⁷) − (−4.0 × 10⁷) = +1.5 × 10⁷ J kg⁻¹", "A positive change means work is done against the gravitational field"], "The change is +1.5 × 10⁷ J kg⁻¹. The positive value shows that the probe gains gravitational potential energy as it moves away.", "interpret gravitational potential from an original spaceflight report")],
  },
  {
    slug: "thermal-storage-log",
    topic: "thermal",
    stem: "Source extract: A thermal-storage log says a vacuum flask keeps molten salt hot because it has a vacuum gap and a shiny inner surface.",
    difficulty: 2,
    parts: [part("Explain how each feature reduces energy transfer.", 3, ["The vacuum reduces conduction and convection because there are few particles", "The shiny surface is a poor emitter and absorber of infrared radiation", "The reduced heat loss keeps the salt at a higher temperature for longer"], "The vacuum gap reduces conduction and convection. The shiny inner surface emits and absorbs little infrared radiation, so less energy is transferred and the molten salt stays hot for longer.", "apply thermal-transfer mechanisms to an original engineering log")],
  },
  {
    slug: "radiotherapy-record",
    topic: "nuclear",
    stem: "Source extract: A radiotherapy record gives a tracer half-life of 8.0 hours and an initial activity of 480 MBq. Treatment imaging occurs 24 hours later.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the activity during imaging and explain why the half-life is selected carefully.", 3, ["24 hours is three half-lives", "Activity = 480 × (1/2)³ = 60 MBq", "The half-life must be long enough for imaging but short enough to limit exposure"], "After three half-lives the activity is 480/8 = 60 MBq. The half-life must allow the tracer to remain detectable while limiting the time that the patient is exposed to radiation.", "apply radioactive decay and risk-benefit reasoning to an original medical record")],
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

export const authenticSourceQuestions: Question[] = [
  ...subjectIds.biology.flatMap((subjectId) => buildQuestions(subjectId, biology)),
  ...subjectIds.chemistry.flatMap((subjectId) => buildQuestions(subjectId, chemistry)),
  ...subjectIds.maths.flatMap((subjectId) => buildQuestions(subjectId, maths)),
  ...subjectIds.physics.flatMap((subjectId) => buildQuestions(subjectId, physics)),
];
