import { defineMisconceptions } from "./authoring";

const SUBJECT_ID = "wjec-alevel-biology";

export const biologyMisconceptions = defineMisconceptions([
  {
    slug: "peptide-bond-r-groups",
    subjectId: SUBJECT_ID,
    topics: ["biological-molecules"],
    statement: "A peptide bond forms between the R groups of two amino acids.",
    explanation:
      "The peptide bond forms between the carboxyl group (-COOH) of one amino acid and the amine group (-NH2) of the next, releasing water. The R groups vary and are not part of the backbone bond.",
    example: "The student draws the bond joining the two side chains and labels it a peptide bond.",
    correction:
      "Draw the -C(=O)-N- linkage between the carboxyl carbon of one amino acid and the amine nitrogen of the next, with the R groups on the alpha-carbon.",
    tag: "conceptual",
    ao: "AO1",
  },
  {
    slug: "water-has-hydrogen-bonds",
    subjectId: SUBJECT_ID,
    topics: ["biological-molecules"],
    statement: "A water molecule 'has' hydrogen bonds, which is what makes it a good solvent.",
    explanation:
      "Hydrogen bonds form between water molecules, not within one. The polar O-H bonds within each molecule give it the partial charges that form hydrogen bonds with neighbours - and that polarity and cohesion underpin its solvent and thermal properties.",
    example:
      "The student writes that water's hydrogen bonds are inside each molecule, so cannot then explain how they form between molecules.",
    correction:
      "Say: water is polar (the H atoms are delta-positive and the O delta-negative), so hydrogen bonds form between neighbouring molecules, giving cohesion, high specific heat capacity and solvent power.",
    tag: "terminology",
    ao: "AO1",
  },
  {
    slug: "alpha-beta-glucose-polymers",
    subjectId: "aqa-alevel-biology",
    topics: ["biological-molecules"],
    statement: "α-glucose and β-glucose are interchangeable in polysaccharides because both are glucose.",
    explanation:
      "The two isomers differ at carbon 1, and that difference decides the polymer: α-glucose forms starch and glycogen (α-1,4, coiled chains with α-1,6 branches), while β-glucose forms cellulose (β-1,4), whose alternating units give straight chains that hydrogen-bond side by side.",
    example:
      "The student draws cellulose as a coiled chain built from α-glucose and misses the straight β-1,4 structure with cross-chain hydrogen bonds.",
    correction:
      "Match the isomer to its polymer: α-glucose → starch and glycogen (branched, compact); β-glucose → cellulose (straight chains, strong hydrogen bonding between chains).",
    tag: "conceptual",
    ao: "AO1",
  },
  {
    slug: "secondary-structure-disulfide",
    subjectId: "aqa-alevel-biology",
    topics: ["biological-molecules"],
    statement: "The secondary structure of a protein is held together by disulfide bonds.",
    explanation:
      "Secondary structure (α-helix and β-sheet) is stabilised by hydrogen bonds between the backbone -C=O and -NH groups. Disulfide bonds form between cysteine R groups and are a tertiary (or quaternary) interaction — placing them at the secondary level misreads the hierarchy.",
    example: "When asked what stabilises the α-helix, the student answers S–S disulfide bonds rather than backbone hydrogen bonds.",
    correction:
      "Assign each bond to its level: backbone hydrogen bonds → secondary structure; disulfide, ionic and hydrophobic R-group interactions → tertiary structure.",
    tag: "conceptual",
    ao: "AO1",
  },
  // --- AQA GCSE ---------------------------------------------------------
  {
    slug: "gcse-alpha-beta-glucose",
    subjectId: "aqa-gcse-biology",
    topics: ["biological-molecules"],
    statement: "α-glucose and β-glucose are interchangeable in polysaccharides because both are glucose.",
    explanation:
      "The two isomers differ at carbon 1, and that difference decides the polymer: α-glucose forms starch and glycogen (α-1,4, coiled chains with α-1,6 branches), while β-glucose forms cellulose (β-1,4), whose alternating units give straight chains that hydrogen-bond side by side.",
    example:
      "The student draws cellulose as a coiled chain built from α-glucose and misses the straight β-1,4 structure with cross-chain hydrogen bonds.",
    correction:
      "Match the isomer to its polymer: α-glucose → starch and glycogen (branched, compact); β-glucose → cellulose (straight chains, strong hydrogen bonding between chains).",
    tag: "conceptual",
    ao: "AO1",
  },
  {
    slug: "gcse-secondary-structure-disulfide",
    subjectId: "aqa-gcse-biology",
    topics: ["biological-molecules"],
    statement: "The secondary structure of a protein is held together by disulfide bonds.",
    explanation:
      "Secondary structure (α-helix and β-sheet) is stabilised by hydrogen bonds between the backbone -C=O and -NH groups. Disulfide bonds form between cysteine R groups and are a tertiary (or quaternary) interaction — placing them at the secondary level misreads the hierarchy.",
    example: "When asked what stabilises the α-helix, the student answers S–S disulfide bonds rather than backbone hydrogen bonds.",
    correction:
      "Assign each bond to its level: backbone hydrogen bonds → secondary structure; disulfide, ionic and hydrophobic R-group interactions → tertiary structure.",
    tag: "conceptual",
    ao: "AO1",
  },
  {
    slug: "gcse-hydrolysis-builds-bonds",
    subjectId: "aqa-gcse-biology",
    topics: ["biological-molecules"],
    statement: "Hydrolysis builds polymers by adding water to join monomers together.",
    explanation:
      "Hydrolysis uses water to break bonds (a polymer splits into monomers). Condensation is the opposite: it joins monomers and releases a molecule of water. Swapping them reverses the arrow on every reaction you draw.",
    example: "The student writes that digesting starch to glucose is a condensation reaction that builds larger chains.",
    correction:
      "Condensation → join monomers, water released. Hydrolysis → split polymers, water used up.",
    tag: "terminology",
    ao: "AO1",
  },
  {
    slug: "gcse-enzyme-killed",
    subjectId: "aqa-gcse-biology",
    topics: ["enzymes"],
    statement: "A boiled enzyme is 'killed', like a cell, so it no longer functions at all.",
    explanation:
      "Enzymes are proteins, not living things: heat denatures them. Denaturation unwinds the tertiary structure, so the active site changes shape and can no longer fit the substrate — the change is permanent, but it is denaturation, not death.",
    example: "The student writes that boiling 'kills the enzyme', treating the active site as intact but lifeless.",
    correction:
      "Say denatured: heat (or extreme pH) permanently reshapes the active site, so the substrate can no longer bind.",
    tag: "terminology",
    ao: "AO1",
  },
  {
    slug: "gcse-dominant-more-frequent",
    subjectId: "aqa-gcse-biology",
    topics: ["genetics-inheritance"],
    statement: "A dominant allele always appears in more offspring than a recessive allele, because it is 'stronger'.",
    explanation:
      "Dominant means the phenotype appears even with one copy of the allele — a property of how the trait is expressed, not of how common it is. A recessive allele can outnumber a dominant one: allele frequencies come from the gene pool (selection, migration, drift), not from dominance.",
    example: "The student predicts more brown-eyed than blue-eyed children in every cross, regardless of the parents' genotypes.",
    correction:
      "Dominance fixes which phenotype shows when both alleles are present; it never dictates how often an allele occurs. Use a Punnett grid for offspring ratios.",
    tag: "conceptual",
    ao: "AO1",
  },
  // --- Edexcel & OCR boards ----------------------------------------------
  {
    slug: "edexcel-glycolysis-mitochondria",
    subjectId: "edexcel-alevel-biology",
    topics: ["respiration"],
    statement: "All the stages of aerobic respiration happen inside the mitochondrion.",
    explanation:
      "Glycolysis happens in the cytoplasm and needs no oxygen, netting 2 ATP and 2 reduced NAD per glucose. Only the link reaction and Krebs cycle (mitochondrial matrix) and the electron transport chain (inner membrane) are mitochondrial.",
    example: "The student places glycolysis in the matrix on an annotated-diagram question, so the compensation run gets no marks for the cytoplasm.",
    correction:
      "Cytoplasm → glycolysis. Matrix → link reaction and Krebs cycle. Inner mitochondrial membrane → electron transport chain and ATP synthase.",
    tag: "conceptual",
    ao: "AO1",
  },
  {
    slug: "edexcel-hb-affinity-right-shift",
    subjectId: "edexcel-alevel-biology",
    topics: ["transport-animals"],
    statement: "When the oxygen dissociation curve shifts right, haemoglobin's affinity for oxygen has increased.",
    explanation:
      "A right shift means a higher pO₂ is needed for the same percentage saturation — haemoglobin unloads oxygen more readily, so affinity has decreased. High CO₂ at respiring tissue shifts the curve right (the Bohr effect) precisely so more oxygen is released where it is needed.",
    example: "The student writes 'CO₂ increases haemoglobin's affinity' to explain unloading, inverting the Bohr effect.",
    correction:
      "Right shift → lower affinity → more unloading at respiring tissues. Left shift → higher affinity → loads more easily in the lungs.",
    tag: "graph-reading",
    ao: "AO2",
  },
  {
    slug: "ocr-co2-split-photolysis",
    subjectId: "ocr-alevel-biology",
    topics: ["photosynthesis"],
    statement: "In photosynthesis carbon dioxide is split by light to release oxygen.",
    explanation:
      "It is water that is photolysed: light energy on the thylakoid membranes splits water into electrons, protons and O₂. CO₂ never reacts with light directly — it enters the Calvin cycle in the stroma and is fixed onto RuBP.",
    example: "Asked for the source of the oxygen produced, the student writes 'splitting CO₂', when the evidence (tracking H₂¹⁸O) points to water.",
    correction:
      "Photolysis of water on the thylakoid membrane produces the O₂; CO₂ is fixed by RuBP in the stroma during the Calvin cycle.",
    tag: "conceptual",
    ao: "AO1",
  },
  {
    slug: "ocr-adh-reabsorbs-water",
    subjectId: "ocr-alevel-biology",
    topics: ["homeostasis"],
    statement: "ADH reabsorbs water from the collecting duct back into the blood.",
    explanation:
      "ADH is a signalling molecule, not a pump: it binds to receptors on the collecting duct and distal tubule, which inserts aquaporins into the membrane and raises its permeability to water. Water then leaves by osmosis down the medullary gradient the loop of Henle built.",
    example: "The student writes 'ADH pulls water back' and never mentions permeability or aquaporins, dropping the mechanism mark.",
    correction:
      "ADH increases the collecting duct's permeability to water (aquaporins); water is then reabsorbed by osmosis — the hormone itself transports nothing.",
    tag: "conceptual",
    ao: "AO2",
  },
  // --- Edexcel & OCR GCSE -------------------------------------------------
  {
    slug: "edexcel-mag-vs-resolution",
    subjectId: "edexcel-gcse-biology",
    topics: ["cell-structure"],
    statement: "An electron microscope's advantage is its much higher magnification.",
    explanation:
      "The defining advantage is resolution — the minimum distance between two points that can still be distinguished. Electrons have a far shorter wavelength than light, so details that blur together under an optical microscope separate cleanly. Magnification alone would just enlarge a blurry image.",
    example: "The student answers 'magnification' to a question about why organelles like ribosomes were invisible before EM, missing the resolving-power point entirely.",
    correction:
      "Resolution = ability to distinguish two close points; electron micrographs resolve because electrons have a much shorter wavelength. Magnification is how much larger the image is drawn.",
    tag: "terminology",
    ao: "AO1",
  },
  {
    slug: "ocr-water-potential-words",
    subjectId: "ocr-gcse-biology",
    topics: ["membranes-transport"],
    statement: "Water moves by osmosis down its concentration gradient from concentrated to dilute solution.",
    explanation:
      "Osmosis is defined in terms of water potential (Ψ), not solute concentration: water moves from a higher (less negative) to a lower (more negative) water potential. Pure water is 0 kPa; adding solute makes Ψ more negative, so −100 kPa is higher than −200 kPa.",
    example: "The student writes 'water moves from the concentrated salt solution to the dilute one', exactly reversing the direction.",
    correction:
      "Compare water potentials: water moves from the less negative value to the more negative one — dilute solution → concentrated solution across a membrane.",
    tag: "terminology",
    ao: "AO1",
  },
  // --- WJEC GCSE -----------------------------------------------------------
  {
    slug: "wjec-gcse-denature-breaks-peptide",
    subjectId: "wjec-gcse-biology",
    topics: ["enzymes"],
    statement: "Heating an enzyme above its optimum breaks its peptide bonds, which is why it stops working.",
    explanation:
      "Denaturation breaks the weaker bonds holding the tertiary structure together — hydrogen and ionic interactions between R groups. The peptide bonds of the primary sequence stay intact; it is the 3D shape of the active site that is lost, not the amino acid chain.",
    example: "The student writes 'the amino acids separate' at high temperature, when a denatured enzyme is still one polypeptide — just wrongly folded.",
    correction:
      "Heat disrupts tertiary interactions (R-group bonds), so the active site loses its shape. Primary structure and peptide bonds survive.",
    tag: "conceptual",
    ao: "AO1",
  },
  {
    slug: "wjec-gcse-countercurrent-together",
    subjectId: "wjec-gcse-biology",
    topics: ["gas-exchange"],
    statement: "In fish gills, blood and water flow in the same direction to keep the diffusion gradient steady along the lamella.",
    explanation:
      "Counter-current flow means blood and water move in opposite directions: blood low in oxygen meets fresh water leaving the gills, and the gradient is maintained along the whole lamella. Same-direction flow lets the two reach equilibrium partway along, so the gradient — and uptake — falls to zero.",
    example: "The student sketches parallel arrows for blood and water, then cannot explain why gill uptake reaches 80–90% of the water's oxygen.",
    correction:
      "Opposite flows keep blood always meeting water with more oxygen than it holds, maintaining the gradient along the whole lamella.",
    tag: "conceptual",
    ao: "AO2",
  },
  // --- OCR GCSE, wider topics ---------------------------------------------
  {
    slug: "ocr-hardy-weinberg-assumptions",
    subjectId: "ocr-gcse-biology",
    topics: ["genetics-inheritance"],
    statement: "If the population fits p² + 2pq + q² = 1, the model is valid — the equation is its own justification.",
    explanation:
      "The Hardy–Weinberg model rests on stated assumptions: a large population, random mating, and no mutation, selection or migration. Quoting the algebra without them is justification-free — examiners want the premises, then the calculation.",
    example: "Asked 'justify the use of the Hardy–Weinberg model', the student quotes p² + 2pq + q² = 1 and stops — no assumptions, no justification marks.",
    correction:
      "List the assumptions first (large population, random mating, no mutation, selection or migration), then apply p² + 2pq + q² = 1.",
    tag: "method-skipped",
    ao: "AO2",
  },
]);