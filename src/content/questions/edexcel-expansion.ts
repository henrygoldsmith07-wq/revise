import type { AoCode, Question, QuestionKind } from "@/domain/types";
import { defineQuestions } from "./authoring";

/** Original Edexcel A-level practice, mapped to the Edexcel topic/spec model. */

type EdexcelPart = {
  prompt: string;
  marks: number;
  scheme: string[];
  answer: string;
  claim: string;
  aos?: AoCode[];
};

type EdexcelItem = {
  slug: string;
  topic: string;
  stem: string;
  parts: EdexcelPart[];
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
): EdexcelPart {
  return { prompt, marks, scheme, answer, claim, aos };
}

function buildQuestions(subjectId: string, items: EdexcelItem[]): Question[] {
  return defineQuestions(
    items.map((item) => ({
      slug: `edexcel-expansion-${subjectId}-${item.slug}`,
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
      reviewer: "authored/edexcel-expansion-review",
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

const biology: EdexcelItem[] = [
  {
    slug: "molecule-test",
    topic: "biological-molecules",
    stem: "A student is testing an unknown food sample for biological molecules.",
    kind: "mcq",
    difficulty: 1,
    options: ["Biuret reagent gives a lilac colour for protein", "Iodine gives a brick-red precipitate for reducing sugar", "Benedict's reagent gives blue-black for starch", "Ethanol gives lilac for lipid"],
    correctIndex: 0,
    parts: [part("Select the correct test and positive result.", 1, ["Biuret reagent gives a lilac colour when peptide bonds are present"], "Biuret reagent gives a lilac colour when protein is present.", "identify a biochemical test and its positive result", ["AO1"])],
  },
  {
    slug: "cell-fractionation",
    topic: "cell-structure",
    stem: "A homogenised tissue sample is separated by differential centrifugation.",
    difficulty: 3,
    parts: [part("Explain why the homogenate is filtered and why the centrifuge speed is increased between stages.", 4, ["Filtering removes cell debris and unbroken cells", "The filtrate contains organelles suspended in a buffer", "Larger or denser organelles sediment at lower speeds", "Increasing speed sediments progressively smaller organelles"], "Filtering removes debris and unbroken cells. Organelles remain suspended in a cold isotonic buffer; larger or denser organelles form a pellet first, while higher speeds sediment progressively smaller organelles.", "explain the stages of cell fractionation", ["AO1", "AO2"])],
  },
  {
    slug: "water-potential",
    topic: "membranes-transport",
    stem: "A plant tissue sample has a mass of 5.20 g before immersion and 4.94 g afterwards.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Calculate the percentage change in mass and state the direction of net water movement.", 3, ["Change = −0.26 g", "Percentage change = (−0.26/5.20) × 100 = −5.0%", "Water moved out of the cells by osmosis"], "The percentage change is (4.94 − 5.20)/5.20 × 100 = −5.0%. Water moved out of the tissue because the external solution had lower water potential.", "calculate percentage mass change and interpret osmosis")],
  },
  {
    slug: "enzyme-inhibition",
    topic: "enzymes",
    stem: "An inhibitor leaves Vmax unchanged but increases the substrate concentration needed to reach half Vmax.",
    difficulty: 3,
    parts: [part("Identify the inhibition and explain the effect on the rate curve.", 4, ["The inhibitor is competitive", "It competes with substrate for the active site", "At high substrate concentration the substrate outcompetes the inhibitor", "Vmax is unchanged but apparent Km increases"], "The inhibitor is competitive and competes with substrate for the active site. Increasing substrate concentration outcompetes it, so Vmax is unchanged, but more substrate is needed at intermediate rates and apparent Km increases.", "interpret enzyme-kinetics data for competitive inhibition")],
  },
  {
    slug: "dna-replication",
    topic: "nucleic-acids",
    stem: "DNA replication takes place before a cell divides.",
    kind: "extended",
    difficulty: 3,
    parts: [part("Explain how semi-conservative replication produces two identical DNA molecules.", 4, ["The DNA double helix unwinds and hydrogen bonds break", "Each original strand acts as a template", "Free nucleotides pair by complementary base pairing", "Each new molecule contains one original and one new strand"], "The helix unwinds and hydrogen bonds between bases break. Each original strand acts as a template; free nucleotides pair by complementary base pairing and are joined into a new strand. Each DNA molecule therefore contains one original and one new strand.", "explain semi-conservative DNA replication", ["AO1", "AO2"])],
  },
  {
    slug: "ventilation-pressure",
    topic: "gas-exchange",
    stem: "During inhalation, the external intercostal muscles contract and the diaphragm flattens.",
    parts: [
      part("Explain how these changes cause air to enter the lungs.", 3, ["Thorax volume increases", "Pressure inside the lungs falls below atmospheric pressure", "Air moves into the lungs down the pressure gradient"], "The thorax volume increases, so pressure inside the lungs falls below atmospheric pressure. Air therefore moves into the lungs down the pressure gradient.", "explain pressure changes during ventilation"),
      part("State one adaptation of an alveolus for gas exchange.", 1, ["A thin wall gives a short diffusion distance"], "An alveolus has a wall one cell thick, giving a short diffusion distance.", "identify a gas-exchange adaptation", ["AO1"]),
    ],
  },
  {
    slug: "oxygen-dissociation",
    topic: "transport-animals",
    stem: "Haemoglobin has a lower affinity for oxygen in actively respiring muscle than in the lungs.",
    difficulty: 3,
    parts: [part("Explain how this helps oxygen delivery during exercise.", 3, ["Respiring muscle has a lower pH or higher carbon dioxide concentration", "The haemoglobin dissociation curve shifts to the right", "Haemoglobin releases more oxygen to the muscle at the same partial pressure"], "Carbon dioxide from active respiration lowers pH, causing the dissociation curve to shift right. At a given oxygen partial pressure, haemoglobin has lower affinity and releases more oxygen to the muscle.", "explain the Bohr effect in oxygen transport")],
  },
  {
    slug: "transpiration-rate",
    topic: "transport-plants",
    stem: "A leafy shoot loses 0.42 g of water in 30 minutes. Its total leaf area is 0.70 m².",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the mean water-loss rate per square metre per hour.", 3, ["Water loss rate = 0.42/0.5 = 0.84 g h⁻¹", "Divide by leaf area", "Rate = 0.84/0.70 = 1.2 g m⁻² h⁻¹"], "Thirty minutes is 0.5 hours, so the rate is 0.42/0.5 = 0.84 g h⁻¹. Per square metre, it is 0.84/0.70 = 1.2 g m⁻² h⁻¹.", "calculate transpiration rate normalised to leaf area")],
  },
  {
    slug: "mark-recapture",
    topic: "biodiversity",
    stem: "Researchers mark 40 beetles and release them. In a later sample of 50 beetles, 8 are marked.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Estimate the population size and state one assumption of the method.", 3, ["Estimate = (40 × 50)/8", "Population estimate = 250 beetles", "Marked beetles mix randomly and the mark does not affect survival or recapture"], "The estimate is (40 × 50)/8 = 250 beetles. An assumption is that marked beetles mix randomly with the population and the mark does not affect their chance of recapture.", "use mark-release-recapture and evaluate an assumption")],
  },
  {
    slug: "respiratory-quotient",
    topic: "respiration",
    stem: "A respiring seed consumes 12 units of oxygen and produces 18 units of carbon dioxide in one hour.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the respiratory quotient and identify the likely substrate.", 3, ["RQ = carbon dioxide produced / oxygen consumed", "RQ = 18/12 = 1.5", "A value above 1 suggests lipid or organic-acid metabolism rather than carbohydrate alone"], "RQ = 18/12 = 1.5. An RQ above 1 is consistent with a substrate such as an organic acid, not carbohydrate alone.", "calculate respiratory quotient and interpret its value")],
  },
  {
    slug: "calvin-cycle",
    topic: "photosynthesis",
    stem: "A plant is supplied with carbon dioxide containing a carbon isotope while illuminated.",
    difficulty: 4,
    parts: [part("Explain how the isotope can appear in triose phosphate.", 4, ["Carbon dioxide combines with ribulose bisphosphate", "Rubisco catalyses the fixation reaction", "The unstable six-carbon compound splits into glycerate 3-phosphate", "Glycerate 3-phosphate is reduced to triose phosphate using ATP and reduced NADP"], "Rubisco fixes the labelled carbon dioxide to ribulose bisphosphate. The unstable six-carbon compound splits into glycerate 3-phosphate, which is reduced to triose phosphate using ATP and reduced NADP from the light-dependent reactions.", "explain carbon fixation and reduction in the Calvin cycle")],
  },
  {
    slug: "adrenaline-response",
    topic: "homeostasis",
    stem: "Adrenaline is released when a person perceives danger.",
    difficulty: 2,
    parts: [part("Explain two changes caused by adrenaline that prepare the body for rapid activity.", 3, ["Heart rate and cardiac output increase", "Bronchioles dilate, increasing airflow", "Blood flow is redirected towards skeletal muscle or blood glucose rises"], "Adrenaline increases heart rate and cardiac output, delivering more oxygenated blood to muscles. It also dilates the bronchioles, increasing airflow; it can raise blood glucose to provide respiratory substrate.", "explain an adrenaline response to a stimulus")],
  },
  {
    slug: "dihybrid-inheritance",
    topic: "genetics-inheritance",
    stem: "Two heterozygous parents are crossed for two genes that assort independently: AaBb × AaBb.",
    kind: "calculation",
    difficulty: 4,
    parts: [part("State the expected phenotypic ratio and the probability of an aabb offspring.", 3, ["The phenotypic ratio is 9:3:3:1", "The probability of aa is 1/4", "The probability of bb is 1/4, so aabb is 1/16"], "For independent assortment the expected phenotypic ratio is 9:3:3:1. P(aa) = 1/4 and P(bb) = 1/4, so P(aabb) = 1/16.", "calculate outcomes for a dihybrid cross")],
  },
  {
    slug: "net-primary-productivity",
    topic: "ecosystems",
    stem: "An ecosystem has a gross primary productivity of 24 000 kJ m⁻² year⁻¹ and plant respiratory loss of 9 000 kJ m⁻² year⁻¹.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the net primary productivity and explain its significance.", 3, ["NPP = GPP − respiratory loss", "NPP = 15 000 kJ m⁻² year⁻¹", "NPP is energy stored in new plant biomass available to consumers"], "NPP = 24 000 − 9 000 = 15 000 kJ m⁻² year⁻¹. It is the chemical energy stored in new plant biomass after plant respiration and is available to consumers.", "calculate NPP and relate it to energy available to consumers")],
  },
];

const chemistry: EdexcelItem[] = [
  {
    slug: "isotope-mean",
    topic: "atomic-structure",
    stem: "An element has isotopes of mass 10 and 11 in abundances of 20% and 80%.",
    kind: "calculation",
    difficulty: 1,
    parts: [part("Calculate the relative atomic mass.", 2, ["Use a weighted mean", "(10 × 20 + 11 × 80)/100 = 10.8"], "Relative atomic mass = (10 × 0.20) + (11 × 0.80) = 10.8.", "calculate relative atomic mass from isotope abundance")],
  },
  {
    slug: "titration-moles",
    topic: "moles",
    stem: "20.00 cm³ of 0.150 mol dm⁻³ hydrochloric acid neutralises 25.00 cm³ of sodium hydroxide in a 1:1 reaction.",
    kind: "calculation",
    difficulty: 3,
    calculator: true,
    parts: [part("Calculate the concentration of the sodium hydroxide.", 3, ["Moles HCl = 0.150 × 0.02000 = 0.00300 mol", "The 1:1 equation gives 0.00300 mol NaOH", "Concentration = 0.00300/0.02500 = 0.120 mol dm⁻³"], "n(HCl) = 0.150 × 0.02000 = 0.00300 mol. The ratio is 1:1, so c(NaOH) = 0.00300/0.02500 = 0.120 mol dm⁻³.", "calculate concentration from titration data")],
  },
  {
    slug: "molecular-shape",
    topic: "bonding",
    stem: "The molecules BF₃ and NH₃ both contain three bonds around the central atom.",
    difficulty: 3,
    parts: [part("Explain why BF₃ is trigonal planar and NH₃ is trigonal pyramidal.", 4, ["BF₃ has three bonding pairs and no lone pair", "The bonding pairs repel to give 120° planar angles", "NH₃ has three bonding pairs and one lone pair", "The lone pair repels more strongly, giving a pyramidal shape and approximately 107° bond angles"], "BF₃ has three bonding pairs and no lone pairs, giving a trigonal-planar shape with 120° angles. NH₃ has a lone pair as well as three bonding pairs; stronger lone-pair repulsion gives a trigonal-pyramidal shape with angles of about 107°.", "use electron-pair repulsion to explain molecular shape")],
  },
  {
    slug: "enthalpy-calorimetry",
    topic: "energetics",
    stem: "A reaction heats 50.0 g of solution from 19.0 °C to 27.0 °C. The specific heat capacity is 4.18 J g⁻¹ K⁻¹ and 0.0250 mol reacts.",
    kind: "calculation",
    difficulty: 3,
    calculator: true,
    parts: [part("Calculate the molar enthalpy change, assuming no heat is lost.", 3, ["q = mcΔT = 50.0 × 4.18 × 8.0 = 1672 J", "The reaction is exothermic because the solution warms", "ΔH = −1.672/0.0250 = −66.9 kJ mol⁻¹"], "q = 50.0 × 4.18 × 8.0 = 1672 J. The reaction released heat, so ΔH = −1.672/0.0250 = −66.9 kJ mol⁻¹.", "calculate an enthalpy change from calorimetry")],
  },
  {
    slug: "rate-order",
    topic: "kinetics",
    stem: "Doubling the concentration of A doubles the initial rate, while doubling B has no effect.",
    difficulty: 3,
    parts: [part("State the order with respect to each reactant and write a possible rate equation.", 3, ["The reaction is first order with respect to A", "It is zero order with respect to B", "Rate = k[A]"], "The reaction is first order in A and zero order in B. A possible rate equation is rate = k[A].", "deduce reaction orders from initial-rate data")],
  },
  {
    slug: "equilibrium-constant",
    topic: "equilibria",
    stem: "For H₂(g) + I₂(g) ⇌ 2HI(g), the equilibrium concentrations are [H₂] = 0.20, [I₂] = 0.20 and [HI] = 0.80 mol dm⁻³.",
    kind: "calculation",
    difficulty: 3,
    calculator: true,
    parts: [part("Calculate Kc and state its units.", 3, ["Kc = [HI]²/([H₂][I₂])", "Kc = 0.80²/(0.20 × 0.20) = 16", "There are equal total powers, so Kc has no units"], "Kc = 0.80²/(0.20 × 0.20) = 16. The powers of concentration cancel, so Kc is dimensionless.", "calculate an equilibrium constant")],
  },
  {
    slug: "weak-acid-ph",
    topic: "acids-bases",
    stem: "A strong acid has concentration 0.0100 mol dm⁻³.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate its pH.", 2, ["For a strong monoprotic acid, [H⁺] = 0.0100 mol dm⁻³", "pH = −log₁₀(0.0100) = 2.00"], "[H⁺] = 0.0100 mol dm⁻³, so pH = −log₁₀(0.0100) = 2.00.", "calculate pH from hydrogen-ion concentration")],
  },
  {
    slug: "electrode-potential",
    topic: "redox",
    stem: "The standard electrode potentials are E°(Cu²⁺/Cu) = +0.34 V and E°(Zn²⁺/Zn) = −0.76 V.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Calculate E°cell for a cell made from these half-cells and identify the substance oxidised.", 3, ["E°cell = E°(cathode) − E°(anode)", "E°cell = +0.34 − (−0.76) = +1.10 V", "Zinc is oxidised at the anode"], "E°cell = +0.34 − (−0.76) = +1.10 V. Zinc is oxidised at the anode and copper(II) ions are reduced at the cathode.", "use electrode potentials to predict redox feasibility")],
  },
  {
    slug: "ionisation-energy-trend",
    topic: "periodicity",
    stem: "The first ionisation energy generally increases across a period.",
    difficulty: 2,
    parts: [part("Explain the trend and account for a small drop when an electron enters a higher-energy sub-shell.", 4, ["Nuclear charge increases across the period", "Electrons are added to the same main shell, so shielding changes little", "Attraction between the nucleus and outer electron increases", "An electron in a higher-energy sub-shell is easier to remove, causing a drop"], "Nuclear charge increases while added electrons enter the same main shell, so attraction to the outer electron increases. A small drop occurs when the next electron enters a higher-energy sub-shell, which is further from the nucleus and more shielded.", "explain first-ionisation-energy trends and anomalies")],
  },
  {
    slug: "transition-complex-colour",
    topic: "transition-metals",
    stem: "A transition-metal complex is coloured and changes colour when a ligand is replaced.",
    difficulty: 3,
    parts: [part("Explain why the colour changes.", 3, ["Ligands split the d-orbitals into different energy levels", "Electrons absorb a particular frequency of visible light to move between levels", "Changing the ligand changes the energy gap and therefore the wavelengths absorbed"], "Ligands split the metal d-orbitals. Electrons absorb visible light for d–d transitions; replacing a ligand changes the energy gap and the wavelengths absorbed, so the complementary colour observed changes.", "explain colour in transition-metal complexes")],
  },
  {
    slug: "organic-homologous-series",
    topic: "organic-basics",
    stem: "Ethene and propene belong to the same homologous series.",
    kind: "mcq",
    difficulty: 1,
    options: ["They have the same molecular formula", "They have the same functional group and differ by CH₂ between adjacent members", "They have identical chemical properties in every reaction", "They contain no carbon-carbon double bond"],
    correctIndex: 1,
    parts: [part("Select the statement that defines a homologous series.", 1, ["Members have the same functional group and general formula, with successive members differing by CH₂"], "Members of a homologous series have the same functional group and general formula; successive members differ by CH₂.", "define a homologous series", ["AO1"])],
  },
  {
    slug: "alkene-addition",
    topic: "hydrocarbons",
    stem: "Propene reacts with hydrogen bromide.",
    difficulty: 2,
    parts: [part("Name the reaction type and identify the major product.", 3, ["The reaction is electrophilic addition", "The double bond attacks Hδ⁺ and a carbocation intermediate forms", "2-bromopropane is the major product because the more stable secondary carbocation forms"], "This is electrophilic addition. The major product is 2-bromopropane because addition proceeds through the more stable secondary carbocation.", "explain addition of hydrogen halides to alkenes")],
  },
  {
    slug: "carbonyl-test",
    topic: "carbonyls-acids",
    stem: "An unknown compound contains a carbonyl group but may be an aldehyde or a ketone.",
    difficulty: 2,
    parts: [part("Describe a test that distinguishes the two functional groups and state the observations.", 3, ["Warm the compound with Tollens' reagent", "An aldehyde gives a silver mirror", "A ketone gives no visible reaction"], "Warm the compound with Tollens' reagent. An aldehyde gives a silver mirror, whereas a ketone gives no visible reaction.", "distinguish aldehydes from ketones using chemical tests")],
  },
  {
    slug: "aromatic-nitration",
    topic: "aromatics-nitrogen",
    stem: "Benzene is converted into nitrobenzene using concentrated nitric acid and concentrated sulfuric acid.",
    difficulty: 3,
    parts: [part("Explain the role of sulfuric acid and state the reaction type.", 3, ["Sulfuric acid generates the nitronium ion, NO₂⁺", "The nitronium ion is the electrophile", "The reaction is electrophilic substitution and aromaticity is restored"], "Sulfuric acid reacts with nitric acid to generate NO₂⁺, the electrophile. Benzene undergoes electrophilic substitution and the aromatic ring is restored after loss of H⁺.", "explain nitration of benzene as electrophilic substitution")],
  },
  {
    slug: "ir-spectrum",
    topic: "spectroscopy",
    stem: "An infrared spectrum has a strong absorption at about 1700 cm⁻¹ and no broad absorption around 3200–3600 cm⁻¹.",
    kind: "mcq",
    difficulty: 2,
    options: ["A carbonyl group", "An alcohol hydroxyl group only", "An alkane with no functional group", "An ionic lattice"],
    correctIndex: 0,
    parts: [part("Suggest the functional group shown by the spectrum.", 1, ["An absorption near 1700 cm⁻¹ indicates a C=O bond"], "The spectrum indicates a carbonyl group, C=O.", "identify a carbonyl group from an infrared spectrum", ["AO2"])],
  },
];

const maths: EdexcelItem[] = [
  {
    slug: "sqrt-two-proof",
    topic: "proof",
    stem: "Assume that √2 can be written as p/q in its lowest terms, where p and q are positive integers.",
    kind: "extended",
    difficulty: 4,
    parts: [part("Use proof by contradiction to show that √2 is irrational.", 4, ["Squaring gives p² = 2q², so p² and p are even", "Write p = 2k and substitute to show q² is even", "Therefore p and q are both even", "This contradicts the assumption that p/q is in lowest terms"], "If √2 = p/q, then p² = 2q², so p is even; let p = 2k. Substitution gives q² = 2k², so q is even too. This contradicts p/q being in lowest terms, so √2 is irrational.", "construct a proof by contradiction", ["AO1", "AO2"])],
  },
  {
    slug: "partial-fractions",
    topic: "algebra",
    stem: "The rational function is (5x + 1)/((x − 1)(x + 2)).",
    difficulty: 3,
    parts: [part("Express it in partial fractions.", 3, ["Let (5x + 1)/((x − 1)(x + 2)) = A/(x − 1) + B/(x + 2)", "5x + 1 = A(x + 2) + B(x − 1)", "A = 2 and B = 3"], "Using x = 1 gives A = 2; using x = −2 gives B = 3. The expression is 2/(x − 1) + 3/(x + 2).", "resolve a rational function into partial fractions")],
  },
  {
    slug: "circle-tangent",
    topic: "coordinate-geometry",
    stem: "The circle has centre (2, −1) and passes through (5, 3).",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Find the equation of the circle and the gradient of the tangent at (5, 3).", 4, ["r² = (5 − 2)² + (3 + 1)² = 25", "The circle is (x − 2)² + (y + 1)² = 25", "The radius gradient is 4/3", "The tangent gradient is −3/4"], "The radius is 5, so the circle is (x − 2)² + (y + 1)² = 25. The radius gradient is 4/3, so the tangent gradient is −3/4.", "use circle geometry to find a tangent gradient")],
  },
  {
    slug: "geometric-sequence",
    topic: "sequences",
    stem: "A geometric sequence has first term 6 and common ratio 1.5.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Find the sum of the first eight terms.", 3, ["Use Sₙ = a(rⁿ − 1)/(r − 1)", "S₈ = 6(1.5⁸ − 1)/0.5", "S₈ = 388.8"], "S₈ = 6(1.5⁸ − 1)/(1.5 − 1) = 388.8.", "use the sum formula for a geometric sequence")],
  },
  {
    slug: "trig-identity",
    topic: "trigonometry",
    stem: "For 0 < x < π/2, solve 2sin²x − 1 = 0.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Give the exact value of x.", 3, ["sin²x = 1/2", "sin x = 1/√2 because x is in the first quadrant", "x = π/4"], "sin²x = 1/2, so sin x = 1/√2 in the given interval. Therefore x = π/4.", "solve a trigonometric equation in a restricted interval")],
  },
  {
    slug: "logarithmic-model",
    topic: "exponentials",
    stem: "The model P = 400e⁰·²ᵗ gives the population of a culture after t hours.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Find the time at which the population reaches 1000.", 3, ["1000 = 400e⁰·²ᵗ", "ln(2.5) = 0.2t", "t = ln(2.5)/0.2 = 4.58 hours"], "Taking logarithms gives 0.2t = ln(1000/400) = ln(2.5), so t = 4.58 hours.", "solve an exponential model using logarithms")],
  },
  {
    slug: "stationary-point",
    topic: "differentiation",
    stem: "A curve has equation y = x³ − 6x² + 9x + 2.",
    difficulty: 3,
    parts: [part("Find the stationary points and classify them.", 4, ["dy/dx = 3x² − 12x + 9 = 3(x − 1)(x − 3)", "Stationary points occur at x = 1 and x = 3", "The points are (1, 6) and (3, 2)", "d²y/dx² = 6x − 12 gives a maximum at (1,6) and minimum at (3,2)"], "dy/dx = 3(x − 1)(x − 3), giving x = 1 and 3. The points are (1,6) and (3,2). Since d²y/dx² is −6 at x = 1 and +6 at x = 3, these are a maximum and minimum respectively.", "find and classify stationary points")],
  },
  {
    slug: "area-between-curves",
    topic: "integration",
    stem: "The curves y = x² and y = 2x enclose a finite region.",
    difficulty: 3,
    parts: [part("Calculate the area of the enclosed region.", 3, ["Intersections satisfy x² = 2x, so x = 0 and x = 2", "Area = ∫₀²(2x − x²) dx", "Area = [x² − x³/3]₀² = 4/3"], "The curves meet at x = 0 and 2. The area is ∫₀²(2x − x²)dx = [x² − x³/3]₀² = 4/3 square units.", "find the area between two curves")],
  },
  {
    slug: "vector-collinearity",
    topic: "vectors",
    stem: "The position vectors of A, B and C are a, 3a + 2b and 5a + 6b respectively.",
    difficulty: 3,
    parts: [part("Show that A, B and C are collinear.", 3, ["AB = 2a + 2b", "AC = 4a + 6b", "The vectors are not scalar multiples as written; use BC = 2a + 4b", "This does not prove collinearity, so the claim is false for arbitrary independent a and b"], "AB = 2a + 2b and AC = 4a + 6b. These are not scalar multiples for independent a and b, so the claim is false; the points are not generally collinear.", "test a vector collinearity claim rather than assuming it", ["AO2", "AO3"])],
  },
  {
    slug: "newton-raphson",
    topic: "numerical",
    stem: "Use f(x) = x³ − 5x − 1 and start with x₀ = 2.",
    kind: "calculation",
    difficulty: 4,
    parts: [part("Use one Newton–Raphson iteration to find x₁.", 3, ["f(2) = −3", "f'(x) = 3x² − 5, so f'(2) = 7", "x₁ = 2 − (−3/7) = 2.4286"], "x₁ = x₀ − f(x₀)/f'(x₀) = 2 − (−3/7) = 2.4286.", "apply the Newton–Raphson iteration")],
  },
  {
    slug: "hypothesis-sampling",
    topic: "statistical-sampling",
    stem: "A researcher wants to estimate the mean mass of apples from an orchard containing 800 trees.",
    kind: "extended",
    difficulty: 2,
    parts: [part("Describe a sampling method and explain why a simple random sample may be preferable to choosing the easiest trees to reach.", 3, ["Select trees using a random mechanism from a complete sampling frame", "Take enough apples from selected trees and use a consistent procedure", "Random selection reduces selection bias and improves representativeness"], "Number the trees and use random numbers to select a sufficient sample. Sample apples consistently from those trees; random selection avoids the bias produced by choosing convenient trees.", "design an unbiased sample and justify the method", ["AO2", "AO3"])],
  },
  {
    slug: "conditional-probability",
    topic: "probability",
    stem: "Events A and B satisfy P(A) = 0.4, P(B) = 0.5 and P(A ∩ B) = 0.2.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Find P(A|B) and state whether A and B are independent.", 3, ["P(A|B) = P(A ∩ B)/P(B)", "P(A|B) = 0.2/0.5 = 0.4", "P(A|B) = P(A), so the events are independent"], "P(A|B) = 0.2/0.5 = 0.4. Since this equals P(A), A and B are independent.", "calculate conditional probability and test independence")],
  },
  {
    slug: "binomial-distribution",
    topic: "distributions",
    stem: "The probability that a machine produces an acceptable component is 0.8. Ten components are selected independently.",
    kind: "calculation",
    difficulty: 3,
    calculator: true,
    parts: [part("Find the probability that exactly eight components are acceptable.", 3, ["Use X ~ B(10, 0.8)", "P(X = 8) = ¹⁰C₈(0.8)⁸(0.2)²", "P(X = 8) = 0.302"], "P(X = 8) = ¹⁰C₈(0.8)⁸(0.2)² = 0.302.", "use a binomial distribution for independent trials")],
  },
  {
    slug: "projectile-motion",
    topic: "kinematics",
    stem: "A ball is projected vertically upwards at 14 m s⁻¹. Take g = 9.8 m s⁻².",
    kind: "calculation",
    difficulty: 3,
    calculator: true,
    parts: [part("Calculate the maximum height above the point of projection.", 3, ["At maximum height v = 0", "Use v² = u² + 2as", "0 = 14² − 19.6s, so s = 10.0 m"], "At maximum height v = 0. Using 0 = 14² + 2(−9.8)s gives s = 10.0 m.", "apply constant-acceleration equations to vertical motion")],
  },
  {
    slug: "friction-equilibrium",
    topic: "forces",
    stem: "A crate of weight 500 N rests on a rough horizontal surface. A horizontal force of 120 N is applied and the crate remains at rest.",
    difficulty: 2,
    parts: [part("State the frictional force and explain why the crate does not accelerate.", 2, ["Friction is 120 N opposite the applied force", "The resultant horizontal force is zero, so acceleration is zero"], "The frictional force is 120 N opposite the applied force. The horizontal forces balance, so the resultant is zero and the crate does not accelerate.", "apply equilibrium conditions to a rough surface")],
  },
];

const physics: EdexcelItem[] = [
  {
    slug: "projectile-range",
    topic: "kinematics-dynamics",
    stem: "A particle is projected horizontally at 12 m s⁻¹ from a cliff 20 m high. Take g = 9.8 m s⁻².",
    kind: "calculation",
    difficulty: 3,
    calculator: true,
    parts: [part("Calculate the time to hit the ground and the horizontal distance travelled.", 4, ["20 = ½(9.8)t², so t = 2.02 s", "Horizontal velocity is constant at 12 m s⁻¹", "Range = 12 × 2.02", "Range = 24.2 m"], "Vertically, 20 = ½(9.8)t², giving t = 2.02 s. Horizontally the speed is constant, so the distance is 12 × 2.02 = 24.2 m.", "resolve projectile motion into perpendicular components")],
  },
  {
    slug: "efficiency-power",
    topic: "energy-power",
    stem: "A motor takes 2.4 kJ of electrical energy each second and produces 1.8 kJ of useful mechanical energy each second.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the useful efficiency of the motor.", 2, ["Efficiency = useful power/input power", "Efficiency = 1.8/2.4 = 0.75 = 75%"], "The efficiency is 1.8/2.4 = 0.75, or 75%.", "calculate efficiency from input and useful power")],
  },
  {
    slug: "young-modulus",
    topic: "materials",
    stem: "A wire of length 1.50 m and cross-sectional area 2.0 × 10⁻⁶ m² extends by 0.75 mm under a force of 120 N.",
    kind: "calculation",
    difficulty: 4,
    calculator: true,
    parts: [part("Calculate the Young modulus of the material.", 3, ["Stress = F/A = 120/(2.0 × 10⁻⁶) = 6.0 × 10⁷ Pa", "Strain = extension/original length = 0.00075/1.50 = 5.0 × 10⁻⁴", "Young modulus = stress/strain = 1.2 × 10¹¹ Pa"], "Stress = 6.0 × 10⁷ Pa and strain = 5.0 × 10⁻⁴. Young modulus = 6.0 × 10⁷/(5.0 × 10⁻⁴) = 1.2 × 10¹¹ Pa.", "calculate Young modulus from stress and strain")],
  },
  {
    slug: "double-slit-fringes",
    topic: "waves",
    stem: "In a double-slit experiment, the slit separation is 0.25 mm, the screen is 2.0 m away and the fringe spacing is 4.8 mm.",
    kind: "calculation",
    difficulty: 3,
    calculator: true,
    parts: [part("Calculate the wavelength of the light.", 3, ["Use fringe spacing w = λD/s", "λ = ws/D", "λ = (4.8 × 10⁻³)(2.5 × 10⁻⁴)/2.0 = 6.0 × 10⁻⁷ m"], "λ = ws/D = (4.8 × 10⁻³)(2.5 × 10⁻⁴)/2.0 = 6.0 × 10⁻⁷ m.", "calculate wavelength from double-slit interference")],
  },
  {
    slug: "photoelectric-threshold",
    topic: "quantum",
    stem: "Light of frequency 8.0 × 10¹⁴ Hz ejects electrons from a metal. The work function is 2.5 eV and 1 eV = 1.60 × 10⁻¹⁹ J.",
    kind: "calculation",
    difficulty: 3,
    calculator: true,
    parts: [part("Calculate the maximum kinetic energy of the emitted electrons.", 3, ["Photon energy E = hf = 6.63 × 10⁻³⁴ × 8.0 × 10¹⁴ = 5.30 × 10⁻¹⁹ J", "Work function = 2.5 × 1.60 × 10⁻¹⁹ = 4.00 × 10⁻¹⁹ J", "Kmax = hf − φ = 1.30 × 10⁻¹⁹ J"], "The photon energy is 5.30 × 10⁻¹⁹ J and the work function is 4.00 × 10⁻¹⁹ J. Kmax = 1.30 × 10⁻¹⁹ J.", "apply the photoelectric equation")],
  },
  {
    slug: "internal-resistance",
    topic: "electric-circuits",
    stem: "A cell has emf 1.50 V and internal resistance 0.40 Ω. It supplies a current of 2.0 A.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the terminal potential difference.", 2, ["Use V = ε − Ir", "V = 1.50 − (2.0 × 0.40) = 0.70 V"], "V = ε − Ir = 1.50 − (2.0 × 0.40) = 0.70 V.", "calculate terminal p.d. using internal resistance")],
  },
  {
    slug: "impulse-force",
    topic: "momentum",
    stem: "A 0.20 kg ball changes velocity from 15 m s⁻¹ east to 5.0 m s⁻¹ west in 0.10 s.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Calculate the average force on the ball.", 3, ["Take east as positive: change in velocity = −5 − 15 = −20 m s⁻¹", "Change in momentum = 0.20 × (−20) = −4.0 kg m s⁻¹", "Force = change in momentum/time = −40 N, or 40 N west"], "Taking east as positive, Δv = −20 m s⁻¹ and Δp = −4.0 kg m s⁻¹. F = Δp/Δt = −40 N, so the average force is 40 N west.", "calculate impulse and average force")],
  },
  {
    slug: "simple-harmonic-motion",
    topic: "circular-shm",
    stem: "A particle undergoes simple harmonic motion with angular frequency 4.0 rad s⁻¹ and displacement 0.12 m from equilibrium.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Calculate the magnitude of its acceleration at this displacement.", 2, ["For SHM, a = −ω²x", "Magnitude = 4.0² × 0.12 = 1.92 m s⁻²"], "For SHM, a = −ω²x. The magnitude is 4.0² × 0.12 = 1.92 m s⁻², directed towards equilibrium.", "use the acceleration-displacement relationship for SHM")],
  },
  {
    slug: "gravitational-potential",
    topic: "fields",
    stem: "A 500 kg satellite moves from a point where gravitational potential is −4.0 × 10⁷ J kg⁻¹ to a point where it is −3.0 × 10⁷ J kg⁻¹.",
    kind: "calculation",
    difficulty: 3,
    parts: [part("Calculate the change in gravitational potential energy.", 2, ["Change in potential = +1.0 × 10⁷ J kg⁻¹", "ΔEp = mΔV = 500 × 1.0 × 10⁷ = 5.0 × 10⁹ J"], "The potential increases by 1.0 × 10⁷ J kg⁻¹, so ΔEp = 500 × 1.0 × 10⁷ = 5.0 × 10⁹ J.", "calculate gravitational potential-energy change")],
  },
  {
    slug: "ideal-gas-law",
    topic: "thermal",
    stem: "A gas occupies 0.020 m³ at pressure 1.0 × 10⁵ Pa and temperature 300 K. Use k = 1.38 × 10⁻²³ J K⁻¹.",
    kind: "calculation",
    difficulty: 3,
    calculator: true,
    parts: [part("Calculate the number of gas molecules.", 3, ["Use pV = NkT", "N = pV/(kT)", "N = (1.0 × 10⁵ × 0.020)/(1.38 × 10⁻²³ × 300) = 4.83 × 10²³"], "N = pV/(kT) = (1.0 × 10⁵ × 0.020)/(1.38 × 10⁻²³ × 300) = 4.83 × 10²³ molecules.", "use the molecular form of the ideal-gas equation")],
  },
  {
    slug: "radioactive-activity",
    topic: "nuclear",
    stem: "A radioactive isotope has decay constant 2.0 × 10⁻⁴ s⁻¹ and contains 3.0 × 10¹⁰ undecayed nuclei.",
    kind: "calculation",
    difficulty: 2,
    parts: [part("Calculate the activity of the sample.", 2, ["Use A = λN", "A = 2.0 × 10⁻⁴ × 3.0 × 10¹⁰ = 6.0 × 10⁶ Bq"], "A = λN = (2.0 × 10⁻⁴)(3.0 × 10¹⁰) = 6.0 × 10⁶ Bq.", "calculate activity from decay constant and nuclei")],
  },
];

const subjectIds = {
  biology: "edexcel-alevel-biology",
  chemistry: "edexcel-alevel-chemistry",
  maths: "edexcel-alevel-maths",
  physics: "edexcel-alevel-physics",
} as const;

export const edexcelExpansionQuestions: Question[] = [
  ...buildQuestions(subjectIds.biology, biology),
  ...buildQuestions(subjectIds.chemistry, chemistry),
  ...buildQuestions(subjectIds.maths, maths),
  ...buildQuestions(subjectIds.physics, physics),
];
