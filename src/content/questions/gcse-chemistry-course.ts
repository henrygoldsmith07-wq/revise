import type { AoCode, Question, QuestionKind } from "@/domain/types";
import { defineQuestions } from "./authoring";

// ---------------------------------------------------------------------------
// GCSE chemistry questions written for the GCSE outline (DfE subject content,
// ../../domain/curriculum/outlines/gcse-chemistry.ts), one for each topic the
// shared templates left without a question once they were placed on it
// (src/content/gcse-question-scope.ts): the Periodic Table, the particle
// model, carbon, nanoparticles, formulae, energy changes, conservation of
// mass, chemical tests, life-cycle assessment, crude oil, metal extraction,
// fertilisers, yield and atom economy, the atmosphere, climate and water;
// and, for the boards the AQA-only packs leave out, atoms and ions,
// electrolysis of solutions and industrial conditions.
//
// Original items; no past-paper text. Each part is tagged to the outline
// statement it tests. Written by Revise and not teacher-reviewed: like every
// reference-tier question they are practice, never proof.
// ---------------------------------------------------------------------------

type Part = { prompt: string; marks: number; scheme: string[]; answer: string; claim: string; point: number; aos?: AoCode[] };
type Item = { slug: string; topic: string; stem: string; parts: Part[]; kind?: QuestionKind; difficulty?: 1 | 2 | 3 };

const p = (prompt: string, marks: number, scheme: string[], answer: string, claim: string, point: number, aos: AoCode[] = ["AO1"]): Part => ({ prompt, marks, scheme, answer, claim, point, aos });

const ITEMS: Item[] = [
  {
    slug: "potassium-water",
    topic: "periodic-table-groups",
    stem: "A small piece of potassium is added to a trough of water. It melts, moves around the surface and burns with a lilac flame.",
    parts: [
      p("Name the two products of the reaction between potassium and water.", 2, ["potassium hydroxide", "hydrogen"], "Potassium reacts with water to give potassium hydroxide, which dissolves to make the water alkaline, and hydrogen gas.", "recall the reaction of a Group 1 metal with water", 5),
      p("Explain why potassium reacts more vigorously with water than sodium does.", 3, ["potassium's outer electron is in a shell further from the nucleus (it has more shells)", "so the outer electron is less strongly attracted to the nucleus", "so it is lost more easily"], "Potassium has one more occupied shell than sodium, so its single outer electron is further from the nucleus and less strongly attracted by it. It is lost more easily, so potassium reacts faster.", "explain the trend in reactivity down Group 1 from the outer shell of electrons", 6),
    ],
  },
  {
    slug: "ethanol-states",
    topic: "states-particle-model",
    stem: "Ethanol melts at −114 °C and boils at 78 °C.",
    parts: [
      p("Predict the state of ethanol at 25 °C, and explain your answer.", 2, ["liquid", "25 °C is above its melting point and below its boiling point"], "Ethanol is a liquid at 25 °C, because 25 °C lies between its melting point (−114 °C) and its boiling point (78 °C).", "use melting and boiling points to predict a state", 4, ["AO2"]),
      p("Explain, in terms of particles, why boiling ethanol is a physical change.", 2, ["the forces between the molecules are overcome so the molecules move apart", "the molecules themselves are unchanged, so no new substance is made"], "When ethanol boils, the forces between its molecules are overcome and the molecules spread out as a gas. The molecules themselves are unchanged and no new substance forms, so the change is physical and can be reversed by cooling.", "distinguish physical from chemical change with the particle model", 1),
    ],
  },
  {
    slug: "diamond-graphite",
    topic: "carbon-structures",
    stem: "Diamond and graphite are both made only of carbon atoms.",
    parts: [
      p("Explain why graphite conducts electricity but diamond does not.", 3, ["in graphite each carbon atom is bonded to three others", "leaving one delocalised electron per atom that is free to move through the structure", "in diamond each carbon atom uses all four outer electrons in covalent bonds, so there are no free electrons"], "In graphite each carbon atom forms three covalent bonds, which leaves one delocalised electron per atom free to move along the layers and carry charge. In diamond every carbon atom forms four covalent bonds, so no electrons are free to move and it does not conduct.", "explain the properties of diamond and graphite from their structures", 3),
      p("State how many covalent bonds a carbon atom can form, and explain why carbon forms so many different compounds.", 2, ["four", "carbon atoms can join to each other in chains and rings, making families of similar compounds"], "A carbon atom can form four covalent bonds. Because carbon atoms can bond to each other in long chains and rings, they make families of similar compounds, so there is a vast number of organic compounds.", "explain why carbon forms families of compounds", 2),
    ],
  },
  {
    slug: "nanocube-ratio",
    topic: "nanoparticles-surface",
    kind: "calculation",
    stem: "A catalyst is made of cube-shaped nanoparticles, each with sides 10 nm long.",
    parts: [
      p("Calculate the surface area to volume ratio of one nanoparticle.", 3, ["surface area = 6 × 10 × 10 = 600 nm²", "volume = 10 × 10 × 10 = 1000 nm³", "surface area to volume ratio = 600 ÷ 1000 = 0.6 per nm"], "Surface area = 6 × 10 × 10 = 600 nm² and volume = 10 × 10 × 10 = 1000 nm³, so surface area to volume ratio = surface area ÷ volume = 600 ÷ 1000 = 0.6 per nm.", "calculate a surface area to volume ratio", 2, ["AO2"]),
      p("Explain why nanoparticles of a catalyst work better than the same mass of larger particles.", 2, ["nanoparticles have a much larger surface area to volume ratio (more surface for the same mass)", "so more reacting particles can collide with the catalyst surface at once"], "Nanoparticles have a much larger surface area to volume ratio, so the same mass of catalyst has far more surface exposed. More reacting particles can meet the surface at once, so the reaction is faster.", "relate the properties of nanoparticles to their uses", 3, ["AO1", "AO2"]),
    ],
  },
  {
    slug: "magnesium-oxide-formulae",
    topic: "formulae-equations",
    stem: "Magnesium burns in oxygen to form magnesium oxide, MgO.",
    parts: [
      p("Write a balanced symbol equation for the reaction.", 2, ["correct formulae: Mg, O₂ and MgO", "2Mg + O₂ → 2MgO"], "2Mg + O₂ → 2MgO. Oxygen is written O₂ because it exists as molecules, so two magnesium atoms are needed for each oxygen molecule.", "write a balanced equation from the conservation of mass", 3, ["AO2"]),
      p("A magnesium ion is Mg²⁺ and a chloride ion is Cl⁻. Write the formula of magnesium chloride and explain how you worked it out.", 2, ["MgCl₂", "two chloride ions (2−) balance the charge of one magnesium ion (2+), so the charges add up to zero"], "The formula is MgCl₂: one Mg²⁺ ion needs two Cl⁻ ions so that the charges add up to zero.", "deduce the formula of an ionic compound from its ions", 4, ["AO2"]),
    ],
  },
  {
    slug: "hydrogen-chloride-bonds",
    topic: "exothermic-endothermic",
    kind: "calculation",
    stem: "Hydrogen reacts with chlorine: H–H + Cl–Cl → 2 H–Cl. Bond energies: H–H 436 kJ/mol, Cl–Cl 243 kJ/mol, H–Cl 432 kJ/mol.",
    parts: [
      p("Calculate the overall energy change for the reaction.", 3, ["energy to break bonds = 436 + 243 = 679 kJ/mol", "energy released making bonds = 2 × 432 = 864 kJ/mol", "energy change = 679 − 864 = −185 kJ/mol"], "Breaking bonds takes in 436 + 243 = 679 kJ/mol and making the two H–Cl bonds releases 2 × 432 = 864 kJ/mol. Energy change = energy to break bonds − energy released making bonds = 679 − 864 = −185 kJ/mol.", "calculate an energy change from bond energies", 4, ["AO2"]),
      p("Describe what happens to the temperature of the surroundings during this reaction, and explain why.", 2, ["the temperature of the surroundings rises", "the reaction is exothermic: it transfers energy to the surroundings"], "The surroundings get warmer, because the reaction is exothermic: more energy is released making bonds than is taken in breaking them, and the difference is transferred to the surroundings.", "distinguish exothermic from endothermic reactions by the temperature change of the surroundings", 1, ["AO1", "AO2"]),
    ],
  },
  {
    slug: "copper-carbonate-heating",
    topic: "mass-conservation-formula-mass",
    stem: "A student heats 5.0 g of copper carbonate in an open test tube: CuCO₃ → CuO + CO₂. The solid left at the end has a mass of 3.2 g. Relative atomic masses: Cu = 63.5, C = 12, O = 16.",
    parts: [
      p("Explain why the mass of the solid decreased, although mass is conserved in the reaction.", 2, ["carbon dioxide gas is produced", "the gas escapes from the open test tube, so it is not weighed with the solid"], "The reaction makes carbon dioxide, a gas, which escapes from the open tube. The total mass of the products still equals the mass of copper carbonate; the missing 1.8 g is the carbon dioxide that left.", "explain mass changes in a non-enclosed system", 2, ["AO1", "AO2"]),
      p("Calculate the relative formula mass, Mr, of copper carbonate.", 2, ["63.5 + 12 + (3 × 16)", "Mr = 123.5"], "Mr = 63.5 + 12 + 3 × 16 = 123.5.", "calculate a relative formula mass", 3, ["AO2"]),
    ],
  },
  {
    slug: "unknown-solution-tests",
    topic: "identifying-gases-ions",
    stem: "A student is identifying the substances in an unknown sample.",
    parts: [
      p("A flame test on the sample gives a lilac flame. Identify the metal ion present.", 1, ["potassium ion (K⁺)"], "A lilac flame shows potassium ions, K⁺.", "interpret a flame test", 4, ["AO2"]),
      p("Adding dilute acid to the sample gives a gas. Describe the test that shows the gas is carbon dioxide, and the result.", 2, ["bubble the gas through limewater", "the limewater turns milky (cloudy)"], "Bubble the gas through limewater: carbon dioxide turns the limewater milky, so the sample contains a carbonate.", "describe the test for carbon dioxide", 1),
    ],
  },
  {
    slug: "bottle-lca",
    topic: "life-cycle-recycling",
    stem: "A drinks company compares glass bottles with plastic bottles using a life-cycle assessment (LCA).",
    parts: [
      p("Describe what a life-cycle assessment measures.", 2, ["the environmental impact of a product (energy, resources, pollution and waste)", "at every stage: raw materials, manufacture, use and disposal"], "An LCA totals a product's environmental impact (the energy and resources it uses and the pollution and waste it makes) at every stage, from extracting raw materials through manufacture and use to disposal.", "describe the principles of a life-cycle assessment", 1),
      p("Explain why recycling glass bottles is worthwhile even though recycling uses energy.", 2, ["melting used glass needs less energy than making new glass from raw materials", "it saves raw materials (sand, limestone) and reduces waste sent to landfill"], "Melting down used glass takes less energy than making new glass from sand and limestone, and recycling saves those raw materials and keeps the bottles out of landfill.", "evaluate the factors in a decision to recycle", 4, ["AO1", "AO3"]),
    ],
  },
  {
    slug: "decane-cracking",
    topic: "crude-oil-cracking",
    stem: "Crude oil is separated into fractions, and some long-chain alkanes are then cracked. Decane is cracked: C₁₀H₂₂ → C₈H₁₈ + X.",
    parts: [
      p("Explain how fractional distillation separates crude oil into fractions.", 3, ["the crude oil is heated until it evaporates (vaporises)", "the column is hot at the bottom and cooler towards the top", "each fraction condenses at the level where the temperature falls below its boiling point"], "The crude oil is heated until it vaporises and the vapour rises up the column, which is hot at the bottom and cooler towards the top. Each fraction condenses and is collected at the level where the temperature is below its boiling point.", "describe the separation of crude oil by fractional distillation", 1),
      p("Give the formula of X and name the homologous series it belongs to.", 2, ["C₂H₄", "alkenes (it is ethene)"], "X is C₂H₄, ethene, an alkene: the carbon and hydrogen atoms left over from C₁₀H₂₂ after C₈H₁₈ are 2 carbons and 4 hydrogens.", "describe the products of cracking", 3, ["AO2"]),
    ],
  },
  {
    slug: "iron-aluminium-extraction",
    topic: "metal-extraction",
    stem: "Iron is extracted by heating iron oxide with carbon. Aluminium is extracted by electrolysis of molten aluminium oxide.",
    parts: [
      p("Explain why iron can be extracted by heating with carbon but aluminium cannot.", 2, ["iron is less reactive than carbon, so carbon can remove the oxygen from (reduce) iron oxide", "aluminium is more reactive than carbon, so carbon cannot reduce aluminium oxide"], "Iron is below carbon in the reactivity series, so carbon takes the oxygen from iron oxide and reduces it to iron. Aluminium is above carbon, so carbon cannot remove its oxygen and electrolysis is used instead.", "explain metal extraction from the position of carbon in the reactivity series", 1, ["AO1", "AO2"]),
      p("Copper can also be extracted by phytoextraction. Give one advantage and one disadvantage of phytoextraction.", 2, ["advantage: it can extract metal from low-grade ores or contaminated land without mining", "disadvantage: it is very slow"], "An advantage is that plants can take copper from low-grade ore or contaminated land that would not be worth mining. A disadvantage is that it is very slow.", "evaluate biological methods of metal extraction", 3, ["AO3"]),
    ],
  },
  {
    slug: "ammonium-nitrate-fertiliser",
    topic: "fertilisers-haber",
    stem: "Ammonium nitrate is a fertiliser made by reacting ammonia with nitric acid. The ammonia comes from the Haber process.",
    parts: [
      p("Explain why farmers add fertilisers containing nitrogen to their fields.", 2, ["plants need nitrogen compounds to grow (to make proteins)", "crops remove nitrogen from the soil, so fertiliser replaces it and increases the yield"], "Plants need nitrogen compounds to make proteins and grow. Each harvest removes nitrogen from the soil, so fertiliser puts it back and the next crop's yield is higher.", "recall the importance of nitrogen compounds in agriculture", 2),
      p("State one way that making ammonium nitrate in a factory differs from making it in a school laboratory.", 2, ["the factory uses a continuous process on a large scale (from raw materials)", "the laboratory makes small batches by titration from ready-made acid and alkali"], "A factory makes it continuously, in large amounts, starting from raw materials. A school laboratory makes a small batch by titrating ammonia solution with nitric acid that was bought ready-made.", "compare industrial and laboratory production of fertilisers", 4, ["AO1", "AO3"]),
    ],
  },
  {
    slug: "lime-yield-economy",
    topic: "yield-atom-economy",
    kind: "calculation",
    stem: "Calcium oxide is made by heating calcium carbonate: CaCO₃ → CaO + CO₂. Relative formula masses: CaCO₃ = 100, CaO = 56, CO₂ = 44.",
    parts: [
      p("Calculate the atom economy for making calcium oxide.", 2, ["atom economy = Mr of desired product ÷ total Mr of reactants × 100", "56 ÷ 100 × 100 = 56%"], "Atom economy = Mr of desired product ÷ total Mr of reactants × 100 = 56 ÷ 100 × 100 = 56%.", "calculate the atom economy of a reaction", 4, ["AO2"]),
      p("Heating 50 g of calcium carbonate produced 21 g of calcium oxide. Calculate the percentage yield.", 3, ["theoretical mass = 50 × 56 ÷ 100 = 28 g", "percentage yield = 21 ÷ 28 × 100", "percentage yield = 75%"], "The most calcium oxide 50 g could give is 50 × 56 ÷ 100 = 28 g. Percentage yield = actual mass ÷ theoretical mass × 100 = 21 ÷ 28 × 100 = 75%.", "calculate a percentage yield", 1, ["AO2"]),
    ],
  },
  {
    slug: "car-exhaust",
    topic: "atmosphere-pollutants",
    stem: "Car engines burn petrol, a mixture of hydrocarbons. The exhaust gases include carbon monoxide.",
    parts: [
      p("Explain how carbon monoxide is formed in an engine and why it is dangerous.", 3, ["it forms by incomplete combustion of the fuel when there is not enough oxygen", "carbon monoxide is toxic", "it combines with haemoglobin in the blood and stops the blood carrying oxygen"], "Carbon monoxide forms when the fuel burns with too little oxygen (incomplete combustion). It is toxic because it combines with the haemoglobin in red blood cells, which then cannot carry oxygen round the body.", "describe the source and effects of carbon monoxide", 3),
      p("Describe how the oxygen in today's atmosphere is thought to have formed.", 2, ["algae and later plants carried out photosynthesis", "photosynthesis takes in carbon dioxide and releases oxygen"], "Algae, and later plants, photosynthesised: they took in carbon dioxide and released oxygen, so over billions of years oxygen built up in the atmosphere.", "describe how an oxygen-rich atmosphere developed", 2),
    ],
  },
  {
    slug: "carbon-dioxide-warming",
    topic: "greenhouse-climate",
    stem: "Since 1900 the concentration of carbon dioxide in the atmosphere and the average global temperature have both risen.",
    parts: [
      p("Explain how carbon dioxide in the atmosphere keeps the Earth warmer.", 3, ["radiation from the Sun passes through the atmosphere and warms the Earth's surface", "the Earth emits infrared radiation", "carbon dioxide absorbs this infrared radiation and re-emits it, warming the atmosphere"], "Radiation from the Sun passes through the atmosphere and warms the surface. The warm Earth emits infrared radiation, and carbon dioxide absorbs some of it and re-emits it in all directions, so the lower atmosphere stays warmer.", "describe the greenhouse effect as radiation interacting with matter", 1),
      p("Explain why this correlation alone does not prove that burning fossil fuels causes climate change.", 2, ["a correlation does not show that one change causes the other", "other factors (such as changes in the Sun's output) could also change the temperature, so other evidence and models are needed"], "Two things rising together does not show that one causes the other: other factors, such as changes in the Sun's output, could affect temperature, so scientists also need other evidence and climate models.", "evaluate the evidence for human causes of climate change", 2, ["AO3"]),
    ],
  },
  {
    slug: "drinking-water",
    topic: "potable-water",
    stem: "In the UK most drinking water comes from rivers, lakes and ground water. Some dry countries make drinking water from sea water.",
    parts: [
      p("Describe how fresh ground water is made potable.", 2, ["it is filtered (through beds of sand and gravel) to remove solids", "it is sterilised with chlorine, ozone or ultraviolet light to kill microbes"], "The water is passed through filter beds of sand and gravel to remove solids, then sterilised with chlorine, ozone or ultraviolet light to kill microbes.", "describe how ground water is made potable", 1),
      p("Explain why sea water is made potable only where fresh water is scarce.", 2, ["distillation or reverse osmosis is needed to remove the dissolved salts", "these processes need a lot of energy, so they are expensive"], "Sea water has dissolved salts that filtering cannot remove, so it must be distilled or passed through reverse osmosis membranes. Both need a lot of energy, so the water costs much more.", "describe how potable water is obtained from salt water", 3, ["AO1", "AO3"]),
    ],
  },
  {
    slug: "magnesium-ion-particles",
    topic: "atoms-isotopes-model",
    stem: "Magnesium has atomic number 12. One isotope of magnesium has mass number 26.",
    parts: [
      p("Give the numbers of protons, neutrons and electrons in an atom of magnesium-26.", 3, ["12 protons", "14 neutrons", "12 electrons"], "It has 12 protons (the atomic number), 26 − 12 = 14 neutrons, and 12 electrons, because an atom has as many electrons as protons.", "calculate numbers of protons, neutrons and electrons in an atom", 5, ["AO2"]),
      p("A magnesium atom loses two electrons to form a magnesium ion, Mg²⁺. Give the number of electrons in the ion, and explain why the ion is positive.", 2, ["10 electrons", "it now has two more protons (positive charges) than electrons (negative charges)"], "The ion has 12 − 2 = 10 electrons. It still has 12 protons, so there are two more positive charges than negative ones and its charge is 2+.", "calculate numbers of electrons in an ion from the relative charges of the particles", 4, ["AO1", "AO2"]),
    ],
  },
  {
    slug: "copper-chloride-electrolysis",
    topic: "electrolysis-ions",
    stem: "A solution of copper chloride, CuCl₂, is electrolysed using inert carbon electrodes.",
    parts: [
      p("Name the product at each electrode.", 2, ["copper at the cathode (negative electrode)", "chlorine at the anode (positive electrode)"], "Copper forms at the cathode and chlorine gas at the anode.", "predict the products of electrolysis using inert electrodes", 2, ["AO2"]),
      p("Water also provides hydrogen ions. Explain why copper, not hydrogen, forms at the cathode.", 2, ["copper is less reactive than hydrogen", "so copper ions gain electrons more readily than hydrogen ions and copper is discharged"], "Copper is less reactive than hydrogen, so copper ions accept electrons more easily than hydrogen ions do, and copper is deposited instead of hydrogen.", "describe competing reactions in the electrolysis of an aqueous solution", 4, ["AO1", "AO2"]),
    ],
  },
  {
    slug: "sulfuric-acid-conditions",
    topic: "industrial-conditions",
    stem: "In the Contact process, sulfur dioxide reacts with oxygen: 2SO₂(g) + O₂(g) ⇌ 2SO₃(g). The forward reaction is exothermic. Factories use about 450 °C, a pressure only a little above atmospheric pressure and a vanadium oxide catalyst.",
    parts: [
      p("Explain why the factory does not use a much lower temperature, although a lower temperature would give a higher equilibrium yield.", 2, ["at a lower temperature the reaction would be too slow", "450 °C is a compromise that gives a fast enough rate with a reasonable yield"], "A lower temperature would favour the exothermic forward reaction, but the rate would be far too slow, so 450 °C is a compromise between a reasonable yield and a fast enough rate.", "explain the trade-off between rate and equilibrium position in an industrial process", 2, ["AO1", "AO2"]),
      p("A higher pressure would increase the yield. Suggest why the factory uses a pressure only a little above atmospheric.", 2, ["the yield at low pressure is already high (the equilibrium already lies far to the right)", "higher pressure would need stronger, more expensive equipment and more energy"], "The yield is already very high at low pressure, so the small gain from a higher pressure would not pay for the stronger plant and the extra energy it needs.", "explain how cost and energy supply decide the conditions used commercially", 3, ["AO3"]),
    ],
  },
];

const BOARDS = ["aqa", "edexcel", "ocr", "wjec"] as const;

/** The pack's id prefix: a question with it was written for the GCSE outline. */
export const GCSE_CHEMISTRY_COURSE_PREFIX = "gcse-chemistry-course-";

const pad = (n: number) => String(n).padStart(2, "0");

export const gcseChemistryCourseQuestions: Question[] = BOARDS.flatMap((board) => {
  const subjectId = `${board}-gcse-chemistry`;
  return defineQuestions(
    ITEMS.map((item) => ({
      slug: `${GCSE_CHEMISTRY_COURSE_PREFIX}${subjectId}-${item.slug}`,
      subjectId,
      topics: [item.topic],
      kind: item.kind ?? "structured",
      stem: item.stem,
      difficulty: item.difficulty ?? 2,
      calculator: true,
      source: "authored",
      verification: "unverified",
      reviewer: null,
      lastChecked: "2026-11-14",
      specVersion: "2024-1.0",
      parts: item.parts.map((part) => ({
        prompt: part.prompt,
        marks: part.marks,
        scheme: part.scheme,
        answer: part.answer,
        aos: part.aos,
        specPointIds: [`${subjectId}.${item.topic}.sp-${pad(part.point)}`],
        learningClaims: [part.claim],
      })),
    })),
  );
});
