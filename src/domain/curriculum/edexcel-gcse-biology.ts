import { GCSE_BOUNDARIES, buildUnits } from "./helpers";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// Pearson Edexcel GCSE Biology (1BI0).
// areas; check the current AQA spec for exact assessment objectives.
const SUBJECT_ID = "edexcel-gcse-biology";

const { units, topics } = buildUnits(SUBJECT_ID, [
  {
    slug: "basic-biochemistry",
    title: "Basic Biochemistry and Cell Organisation",
    topics: [
      {
        slug: "biological-molecules",
        title: "Biological molecules",
        specRef: "Unit 1.1",
        difficulty: 2,
        summary:
          "Water, carbohydrates, lipids, proteins and nucleic acids: their structure, the bonds that build them, and how structure determines function.",
        keyPoints: [
          "Condensation forms a bond and releases water; hydrolysis uses water to break it.",
          "Glycosidic bonds join monosaccharides, peptide bonds join amino acids, ester bonds join glycerol and fatty acids.",
          "Water is a polar molecule with hydrogen bonding — hence high specific heat capacity, cohesion and its role as a solvent.",
          "Protein structure runs primary → secondary (H bonds) → tertiary (ionic, disulfide, hydrophobic) → quaternary.",
        ],
        commonErrors: [
          "Describing a peptide bond as forming between R groups rather than the amine and carboxyl groups.",
          "Saying water 'has' hydrogen bonds rather than forming them between molecules.",
          "Confusing the α and β glucose isomers and so the starch/cellulose distinction.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Unit 1.1(a)", text: "describe condensation and hydrolysis for biological polymers", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 1.1(b)", text: "compare structures and functions of monosaccharides disaccharides and polysaccharides", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 1.1(c)", text: "describe triglyceride and phospholipid structure and relate to function", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 1.1(d)", text: "explain primary through quaternary protein structure and bonding", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 1.1(e)", text: "describe DNA and RNA structure including base pairing", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 1.1(f)", text: "explain water properties hydrogen bonding and biological importance", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "cell-structure",
        title: "Cell structure and organisation",
        specRef: "Unit 1.2",
        difficulty: 2,
        summary:
          "Prokaryotic and eukaryotic ultrastructure, organelle function, microscopy and magnification, and the levels of organisation from organelle to organism.",
        keyPoints: [
          "Magnification = image size ÷ actual size; keep units consistent (1 mm = 1000 μm).",
          "Electron microscopes resolve far better than light microscopes because electrons have a much shorter wavelength.",
          "Prokaryotes lack membrane-bound organelles and have 70S ribosomes and a nucleoid.",
          "Cells with high secretory activity are rich in rough ER and Golgi.",
        ],
        commonErrors: [
          "Mixing up magnification and resolution.",
          "Unit conversion slips in magnification calculations.",
          "Claiming prokaryotes have no ribosomes rather than smaller ones.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Unit 1.2(a)", text: "compare prokaryotic and eukaryotic cell structure", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 1.2(b)", text: "describe functions of membrane-bound organelles", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 1.2(c)", text: "calculate magnification and explain resolution of light and electron microscopy", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 1.2(d)", text: "describe levels of organisation from organelle to organism", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 1.2(e)", text: "explain cell fractionation and ultracentrifugation", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "membranes-transport",
        title: "Cell membranes and transport",
        specRef: "Unit 1.3",
        difficulty: 3,
        summary:
          "The fluid mosaic model, and the mechanisms moving substances across membranes: diffusion, facilitated diffusion, osmosis, active transport, endocytosis and exocytosis.",
        keyPoints: [
          "Passive processes need no ATP and follow the concentration gradient; active transport uses ATP and carrier proteins against it.",
          "Osmosis is the movement of water from a higher (less negative) to a lower water potential.",
          "Water potential of pure water is 0 kPa; solutes make it negative.",
          "Rate of diffusion rises with surface area, gradient and temperature, and falls with distance (Fick's law).",
        ],
        commonErrors: [
          "Saying water moves 'down its concentration gradient' instead of using water potential.",
          "Describing facilitated diffusion as requiring ATP.",
          "Forgetting that water potential values are negative, so −200 kPa is lower than −100 kPa.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Unit 1.3(a)", text: "describe fluid mosaic model of membrane structure", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 1.3(b)", text: "explain diffusion facilitated diffusion and active transport", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 1.3(c)", text: "describe osmosis and water potential", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 1.3(d)", text: "explain factors affecting membrane permeability", aos: ["AO2","AO3"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 1.3(e)", text: "interpret U-tube and visking tubing investigations", aos: ["AO2","AO3"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "enzymes",
        title: "Enzymes and biological reactions",
        specRef: "Unit 1.4",
        difficulty: 3,
        summary:
          "Enzymes as catalysts lowering activation energy, the induced-fit model, factors affecting rate, and competitive versus non-competitive inhibition.",
        keyPoints: [
          "Enzymes lower activation energy; they do not change the equilibrium position.",
          "Above the optimum, bonds holding the tertiary structure break, the active site changes shape and the enzyme denatures.",
          "Competitive inhibitors bind the active site and are outcompeted at high substrate concentration; non-competitive inhibitors bind elsewhere and are not.",
          "Vmax is unchanged by a competitive inhibitor but reduced by a non-competitive one.",
        ],
        commonErrors: [
          "Saying an enzyme is 'killed' rather than denatured.",
          "Claiming denaturation breaks peptide bonds (it breaks the weaker tertiary interactions).",
          "Stating that enzymes 'make reactions happen' instead of speeding up reactions that are already thermodynamically possible.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Unit 1.4(a)", text: "describe enzyme structure including active site and specificity", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 1.4(b)", text: "explain induced fit and lock and key models", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 1.4(c)", text: "explain effects of temperature pH and substrate concentration on rate", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 1.4(d)", text: "distinguish competitive and non-competitive inhibition", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 1.4(e)", text: "interpret enzyme kinetics graphs including Vmax and Km", aos: ["AO2","AO3"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "nucleic-acids",
        title: "Nucleic acids and protein synthesis",
        specRef: "Unit 1.5",
        difficulty: 4,
        summary:
          "DNA and RNA structure, semi-conservative replication, transcription, translation, the genetic code and the effect of mutations.",
        keyPoints: [
          "DNA is antiparallel with complementary base pairing: A–T (2 H bonds), C–G (3 H bonds).",
          "Replication is semi-conservative: each new molecule keeps one parental strand.",
          "Transcription makes mRNA in the nucleus; translation occurs at ribosomes with tRNA carrying amino acids.",
          "The genetic code is degenerate, non-overlapping and universal.",
        ],
        commonErrors: [
          "Writing 'uracil pairs with thymine'.",
          "Confusing codons (mRNA) with anticodons (tRNA).",
          "Saying every mutation changes the protein — degeneracy means many are silent.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Unit 1.5(a)", text: "describe DNA replication including semi-conservative mechanism", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 1.5(b)", text: "describe transcription and translation including role of mRNA tRNA and ribosomes", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 1.5(c)", text: "explain how mutations arise and their effects", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 1.5(d)", text: "describe cell cycle mitosis and meiosis", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 1.5(e)", text: "explain significance of crossing over and independent assortment", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
    ],
  },
  {
    slug: "biodiversity-physiology",
    title: "Biodiversity and Physiology of Body Systems",
    topics: [
      {
        slug: "gas-exchange",
        title: "Adaptations for gas exchange",
        specRef: "Unit 2.2",
        difficulty: 3,
        summary:
          "Gas exchange surfaces in single-celled organisms, insects, fish and mammals, and the ventilation mechanisms that maintain steep diffusion gradients.",
        keyPoints: [
          "Efficient exchange surfaces are large in area, thin, moist and well ventilated or perfused.",
          "Fish gills use a counter-current flow so a diffusion gradient exists along the whole lamella.",
          "Insects use tracheae and tracheoles delivering air directly to tissues; spiracles limit water loss.",
          "Surface area to volume ratio falls as an organism gets larger, which is why large organisms need specialised systems.",
        ],
        commonErrors: [
          "Describing counter-current flow as 'the blood and water flow together'.",
          "Forgetting that alveoli need a rich capillary network to maintain the gradient.",
          "Confusing ventilation with gas exchange itself.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Unit 2.1(a)", text: "describe structure of mammalian gaseous exchange system", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 2.1(b)", text: "explain mechanism of ventilation including pressure changes", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 2.1(c)", text: "describe gas exchange at the alveoli including diffusion gradients", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 2.1(d)", text: "describe structure and function of insect tracheal system and fish gills", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 2.1(e)", text: "compare counter-current and concurrent exchange", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "transport-animals",
        title: "Transport in animals",
        specRef: "Unit 2.3",
        difficulty: 3,
        summary:
          "The mammalian heart and circulation, the cardiac cycle, haemoglobin's oxygen dissociation curve, the Bohr effect and tissue fluid formation.",
        keyPoints: [
          "The cardiac cycle: atrial systole → ventricular systole → diastole, with valves opening on pressure differences.",
          "The oxygen dissociation curve is sigmoid because of cooperative binding.",
          "The Bohr effect: higher CO₂ shifts the curve right, so more oxygen unloads at respiring tissue.",
          "Tissue fluid forms when hydrostatic pressure exceeds oncotic pressure at the arteriole end.",
        ],
        commonErrors: [
          "Saying valves open because of muscle contraction rather than pressure differences.",
          "Describing a right shift as haemoglobin having 'more' affinity.",
          "Omitting the direction of pressure change when explaining tissue fluid return.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Unit 2.2(a)", text: "describe structure of mammalian heart including cardiac cycle", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 2.2(b)", text: "explain regulation of heart rate including ECG", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 2.2(c)", text: "describe structure and function of blood vessels and blood", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 2.2(d)", text: "explain tissue fluid formation and lymphatic return", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 2.2(e)", text: "describe transport of oxygen by haemoglobin including Bohr effect", aos: ["AO2","AO3"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "transport-plants",
        title: "Transport in plants",
        specRef: "Unit 2.4",
        difficulty: 3,
        summary:
          "Xylem and phloem structure, the cohesion–tension theory of water transport, transpiration and its measurement, and the mass-flow hypothesis of translocation.",
        keyPoints: [
          "Water moves up xylem by transpiration pull, with cohesion between water molecules and adhesion to the walls.",
          "Transpiration rate rises with temperature, light and air movement, and falls with humidity.",
          "Translocation moves assimilates from source to sink by active loading at the source creating a hydrostatic pressure gradient.",
          "A potometer measures water uptake, which approximates but does not equal transpiration.",
        ],
        commonErrors: [
          "Claiming a potometer measures transpiration directly.",
          "Saying water is 'pushed' up the stem from the roots in most conditions.",
          "Forgetting that phloem transport is bidirectional overall while xylem is one-way.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Unit 2.3(a)", text: "describe xylem and phloem structure and distribution", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 2.3(b)", text: "explain transpiration cohesion-tension and factors affecting rate", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 2.3(c)", text: "describe translocation including mass flow hypothesis", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 2.3(d)", text: "explain uptake of water and mineral ions", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "biodiversity",
        title: "Classification and biodiversity",
        specRef: "Unit 2.1",
        difficulty: 2,
        summary:
          "Taxonomic hierarchy, the three-domain system, species concepts, measuring biodiversity with the index of diversity, and adaptation to habitat.",
        keyPoints: [
          "Hierarchy: domain, kingdom, phylum, class, order, family, genus, species.",
          "A species is a group of organisms that can interbreed to give fertile offspring.",
          "Simpson's index of diversity accounts for both species richness and evenness.",
          "Phylogenetic classification reflects evolutionary relationships, increasingly from DNA and protein sequence data.",
        ],
        commonErrors: [
          "Confusing species richness with diversity.",
          "Ignoring 'fertile' in the species definition.",
          "Reversing the taxonomic order.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Unit 2.4(a)", text: "define species biodiversity and genetic diversity", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 2.4(b)", text: "describe sampling techniques including quadrats and transects", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 2.4(c)", text: "calculate Simpson diversity index", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 2.4(d)", text: "explain natural selection including antibiotic resistance", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 2.4(e)", text: "describe classification systems and phylogeny", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
    ],
  },
  {
    slug: "energy-homeostasis",
    title: "Energy, Homeostasis and the Environment",
    topics: [
      {
        slug: "respiration",
        title: "Respiration",
        specRef: "Unit 3.1",
        difficulty: 4,
        summary:
          "Glycolysis, the link reaction, the Krebs cycle and oxidative phosphorylation, chemiosmosis, anaerobic pathways and respiratory substrates.",
        keyPoints: [
          "Glycolysis occurs in the cytoplasm, needs no oxygen and nets 2 ATP and 2 reduced NAD per glucose.",
          "The link reaction and Krebs cycle occur in the mitochondrial matrix; the electron transport chain is on the inner membrane.",
          "Chemiosmosis: electron transport pumps protons into the intermembrane space and ATP synthase uses the gradient.",
          "Oxygen is the final electron acceptor; without it the chain backs up and NAD cannot be regenerated aerobically.",
        ],
        commonErrors: [
          "Placing glycolysis inside the mitochondrion.",
          "Saying ATP is made 'by' the electron transport chain rather than by ATP synthase using the proton gradient.",
          "Forgetting that anaerobic respiration's purpose is regenerating NAD, not making ATP directly.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Unit 3.1(a)", text: "describe structure of mitochondria and the stages of respiration", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 3.1(b)", text: "explain glycolysis link reaction and Krebs cycle", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 3.1(c)", text: "describe oxidative phosphorylation including chemiosmosis", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 3.1(d)", text: "explain anaerobic respiration and its products", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 3.1(e)", text: "calculate respiratory quotient and efficiency", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "photosynthesis",
        title: "Photosynthesis",
        specRef: "Unit 3.2",
        difficulty: 4,
        summary:
          "Light-dependent and light-independent reactions, photophosphorylation, the Calvin cycle, limiting factors and chromatography of photosynthetic pigments.",
        keyPoints: [
          "Light-dependent reactions occur on the thylakoid membranes and produce ATP, reduced NADP and oxygen from photolysis.",
          "The Calvin cycle occurs in the stroma: CO₂ + RuBP → 2 GP, reduced to TP using ATP and reduced NADP.",
          "Limiting factors: light intensity, CO₂ concentration and temperature — the plateau identifies which one is limiting.",
          "Rf value = distance moved by pigment ÷ distance moved by solvent front.",
        ],
        commonErrors: [
          "Writing that CO₂ is 'split' in photosynthesis (it is water that is photolysed).",
          "Reversing GP and RuBP when a limiting factor changes.",
          "Reading a limiting-factor graph without naming the factor at the plateau.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Unit 3.2(a)", text: "describe chloroplast structure and photosynthetic pigments", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 3.2(b)", text: "explain light-dependent reactions including photolysis", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 3.2(c)", text: "explain Calvin cycle including carbon fixation", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 3.2(d)", text: "explain limiting factors of photosynthesis", aos: ["AO2","AO3"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 3.2(e)", text: "interpret investigations into photosynthetic rate", aos: ["AO2","AO3"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "homeostasis",
        title: "Homeostasis and the kidney",
        specRef: "Unit 3.4",
        difficulty: 3,
        summary:
          "Negative feedback, thermoregulation, blood glucose control by insulin and glucagon, nephron structure, ultrafiltration, selective reabsorption and osmoregulation by ADH.",
        keyPoints: [
          "Negative feedback: receptor detects deviation → coordinator → effector → correction back toward the set point.",
          "Ultrafiltration is driven by high hydrostatic pressure in the glomerulus; the basement membrane retains proteins.",
          "The loop of Henle establishes a medullary salt gradient by counter-current multiplication.",
          "ADH increases collecting-duct permeability by inserting aquaporins, concentrating urine.",
        ],
        commonErrors: [
          "Describing insulin as 'turning glucose into glycogen' without naming glycogenesis or the receptor mechanism.",
          "Saying ADH 'reabsorbs water' rather than increasing membrane permeability to it.",
          "Confusing negative and positive feedback.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Unit 3.3(a)", text: "explain negative feedback and the role of receptors and effectors", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 3.3(b)", text: "describe control of blood glucose by insulin and glucagon", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 3.3(c)", text: "describe kidney structure including nephron and ultrafiltration", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 3.3(d)", text: "explain water balance including ADH and osmoregulation", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 3.3(e)", text: "describe nervous coordination including reflex arcs", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "genetics-inheritance",
        title: "Inheritance and variation",
        specRef: "Unit 4.1",
        difficulty: 4,
        summary:
          "Meiosis, monohybrid and dihybrid crosses, sex linkage, codominance, the chi-squared test, and the Hardy–Weinberg principle.",
        keyPoints: [
          "Meiosis generates variation by independent assortment and crossing over, and halves the chromosome number.",
          "Use a Punnett square and always state the genotypes and phenotypes with a ratio.",
          "χ² = Σ (O − E)²/E; compare with the critical value at p = 0.05 with (categories − 1) degrees of freedom.",
          "Hardy–Weinberg: p + q = 1 and p² + 2pq + q² = 1, assuming no selection, mutation, migration, random mating and a large population.",
        ],
        commonErrors: [
          "Forgetting to state the Hardy–Weinberg assumptions when asked to justify the model.",
          "Using observed totals as expected values in χ².",
          "Omitting the parental phenotypes when setting out a genetic diagram.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Unit 4.1(a)", text: "describe meiosis and genetic variation", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 4.1(b)", text: "perform monohybrid and dihybrid crosses including linkage", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 4.1(c)", text: "explain codominance sex linkage and epistasis", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 4.1(d)", text: "perform chi-squared tests for inheritance", aos: ["AO2","AO3"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 4.1(e)", text: "explain Hardy Weinberg equilibrium and calculations", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "ecosystems",
        title: "Ecosystems, energy flow and nutrient cycles",
        specRef: "Unit 4.4",
        difficulty: 3,
        summary:
          "Energy transfer through trophic levels, productivity, succession, the carbon and nitrogen cycles, and sampling techniques for populations.",
        keyPoints: [
          "Only ~10% of energy transfers between trophic levels; the rest is lost as heat, in respiration and in indigestible material.",
          "Net primary productivity = gross primary productivity − respiratory losses.",
          "Nitrogen cycle: nitrogen fixation, ammonification, nitrification, denitrification — each with its bacteria.",
          "Succession runs from pioneer species through seral stages to a climax community, with each stage changing the abiotic conditions.",
        ],
        commonErrors: [
          "Saying energy is 'lost' without naming respiration/heat as the route.",
          "Mixing up nitrification and denitrification.",
          "Describing succession as species simply 'replacing' each other without the abiotic change that drives it.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Unit 4.4(a)", text: "describe energy flow through ecosystems including 10 percent rule", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 4.4(b)", text: "explain productivity including NPP and GPP", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 4.4(c)", text: "describe carbon and nitrogen cycles including microbial roles", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 4.4(d)", text: "describe succession from pioneer to climax community", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Unit 4.4(e)", text: "interpret population sampling and mark-release-recapture", aos: ["AO2","AO3"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
    ],
  },
]);

export const aqaBiology: CurriculumModule = registerSubject({
  subject: {
    id: SUBJECT_ID,
    qualificationId: "edexcel-gcse",
    name: "Biology",
    specCode: "1BI0",
        papers: [
      { id: `${SUBJECT_ID}.p1`, name: "Paper 1", weight: 0.35, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p2`, name: "Paper 2", weight: 0.35, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p3`, name: "Paper 3", weight: 0.30, durationMinutes: 120, calculatorAllowed: true },
    ],
    gradeBoundaries: GCSE_BOUNDARIES,
    spec: { version: "2024-1.0", releaseDate: "2024-09-01", lastChecked: "2026-08-01", url: "https://qualifications.pearson.com/en/qualifications/edexcel-gcses/sciences-2016.html" },
  },
  units,
  topics,
});
