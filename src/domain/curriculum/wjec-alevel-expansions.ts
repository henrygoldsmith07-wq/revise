import type { AoCode } from "../types";
import type { TopicSpec, UnitSpec } from "./helpers";

// These additions close the largest content gaps in the WJEC A-level packs.
// They are intentionally written as teachable claims (not copied specification
// prose): each claim becomes a lesson checkpoint, a retrieval card and an
// assessable statement. The official specification is used as the scope
// boundary; the explanations and examples are Revise-authored.

const REVIEW = {
  source: "authored" as const,
  verification: "checked" as const,
  reviewer: "authored/WJEC-2024-v1-expansion",
  lastChecked: "2026-08-01",
  specVersion: "2024-1.0",
};

type Point = { ref: string; text: string; aos: AoCode[] };

function point(ref: string, text: string, aos: AoCode[] = ["AO1"]): Point {
  return { ref, text, aos };
}

function topic(spec: Omit<TopicSpec, keyof typeof REVIEW>): TopicSpec {
  return { ...spec, ...REVIEW };
}

export const wjecBiologyExpansion: UnitSpec[] = [
  {
    slug: "unit2-nutrition",
    title: "Unit 2 extension: Nutrition and adaptation",
    topics: [
      topic({
        slug: "nutrition",
        title: "Adaptations for nutrition",
        specRef: "Unit 2.5",
        difficulty: 3,
        summary:
          "How organisms acquire nutrients, digest polymers, absorb products and use partnerships such as gut microbes and mycorrhizae to solve nutritional problems.",
        keyPoints: [
          "Digestion hydrolyses large insoluble molecules into small soluble molecules that can cross an epithelium; absorption is the movement into blood or lymph, while assimilation is use by cells.",
          "Villi and microvilli give the small intestine a large surface area; a one-cell-thick epithelium, capillary network and lacteals maintain steep gradients for absorption.",
          "Herbivores rely on cellulase-producing microorganisms in a specialised gut; the host supplies a stable habitat and the microbes release short-chain products the host can use.",
          "Plant roots use active transport for mineral ions, and mycorrhizal fungi extend the absorbing surface in exchange for sugars from the plant.",
        ],
        commonErrors: [
          "Calling absorption the chemical breakdown of food rather than movement of products across an epithelium.",
          "Saying mammals digest cellulose themselves; the cellulase is supplied by symbiotic microorganisms.",
          "Describing nitrate uptake as diffusion when ions are moved against an electrochemical gradient using ATP-driven transport proteins.",
        ],
        specPoints: [
          point("Unit 2.5(a)", "explain digestion hydrolysis absorption and assimilation of nutrients", ["AO1", "AO2"]),
          point("Unit 2.5(b)", "relate villi microvilli blood supply and lacteals to efficient absorption", ["AO1", "AO2"]),
          point("Unit 2.5(c)", "explain nutritional adaptations and microbial cellulose digestion in herbivores", ["AO1", "AO2"]),
          point("Unit 2.5(d)", "explain mineral ion uptake and the role of mycorrhizae in plant nutrition", ["AO1", "AO2"]),
        ],
        aos: ["AO1", "AO2"],
      }),
    ],
  },
  {
    slug: "unit3-microbiology-neuro",
    title: "Unit 3 extension: Microbiology and coordination",
    topics: [
      topic({
        slug: "microbiology",
        title: "Microbiology and microbial growth",
        specRef: "Unit 3.5",
        difficulty: 4,
        summary:
          "Growth curves, aseptic technique and fermentation: using microorganisms safely while measuring and explaining changes in population size.",
        keyPoints: [
          "A microbial growth curve has lag, exponential, stationary and death phases; nutrient depletion, toxic waste, pH and oxygen explain the transitions.",
          "Aseptic technique, sterilised media and controlled transfers prevent unwanted organisms from changing the culture or harming the operator.",
          "Serial dilution with viable counts estimates living cells, whereas optical density estimates turbidity and cannot distinguish live from dead cells without another test.",
          "Industrial fermentation controls temperature, pH, oxygen, substrate and mixing so the desired product is made at high yield without contamination.",
        ],
        commonErrors: [
          "Treating the stationary phase as a time when cells stop all metabolism; division and death can be occurring at similar rates.",
          "Assuming a cloudy culture proves every cell is alive.",
          "Sterilising by boiling and then treating the vessel as sterile after it has been opened in an uncontrolled environment.",
        ],
        specPoints: [
          point("Unit 3.5(a)", "interpret microbial growth curves and explain limiting factors", ["AO2", "AO3"]),
          point("Unit 3.5(b)", "explain aseptic technique sterilisation and contamination control", ["AO1", "AO2"]),
          point("Unit 3.5(c)", "use serial dilution viable counts and optical density to measure microbial growth", ["AO2", "AO3"]),
          point("Unit 3.5(d)", "explain how fermentation conditions are controlled for a desired product", ["AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
      topic({
        slug: "nervous-coordination",
        title: "Nervous coordination and synapses",
        specRef: "Unit 3.6",
        difficulty: 4,
        summary:
          "How electrical impulses travel along neurones, cross synapses and produce fast, coordinated responses alongside slower hormonal control.",
        keyPoints: [
          "A resting potential is maintained by ion gradients and selective membrane permeability; reaching threshold opens voltage-gated sodium channels and causes depolarisation.",
          "Repolarisation and the refractory period restore the resting state and make an action potential one-way; myelin allows saltatory conduction between nodes of Ranvier.",
          "At a synapse, calcium entry triggers neurotransmitter release; the transmitter binds receptors on the next cell and its effect is ended by breakdown or reuptake.",
          "A reflex arc routes information through a relay neurone for speed, while hormones travel in blood and usually produce slower, longer-lasting and more widespread effects.",
        ],
        commonErrors: [
          "Saying the action potential gets smaller as it travels; it is regenerated and is all-or-nothing once threshold is reached.",
          "Describing neurotransmitter release as electrical current crossing the synaptic cleft.",
          "Confusing the refractory period with a pause caused by the stimulus being removed.",
        ],
        specPoints: [
          point("Unit 3.6(a)", "explain resting potential threshold depolarisation and repolarisation", ["AO1", "AO2"]),
          point("Unit 3.6(b)", "relate myelination nodes of Ranvier and refractory period to impulse speed and direction", ["AO1", "AO2"]),
          point("Unit 3.6(c)", "describe synaptic transmission including calcium neurotransmitter and receptor action", ["AO1", "AO2"]),
          point("Unit 3.6(d)", "compare reflex nervous coordination with hormonal coordination", ["AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
    ],
  },
  {
    slug: "unit4-reproduction-genetics",
    title: "Unit 4 extension: Reproduction and genetic applications",
    topics: [
      topic({
        slug: "sexual-reproduction",
        title: "Sexual reproduction in humans",
        specRef: "Unit 4.2",
        difficulty: 4,
        summary:
          "Gametogenesis, the ovarian cycle, fertilisation and implantation, with the feedback loops and technologies that control human reproduction.",
        keyPoints: [
          "Meiosis produces haploid gametes; spermatogenesis is continuous after puberty, whereas oogenesis produces a finite sequence of developing ova and polar bodies.",
          "FSH stimulates follicle development and oestrogen secretion; high oestrogen triggers an LH surge, ovulation, and the corpus luteum then secretes progesterone.",
          "Fertilisation restores diploidy and forms a zygote; cleavage produces a blastocyst that implants while the placenta enables exchange without direct blood mixing.",
          "Contraception and assisted reproduction work by changing ovulation, sperm access, fertilisation or implantation; their success and risks must be evaluated in context.",
        ],
        commonErrors: [
          "Putting the LH surge before the rise in oestrogen that triggers positive feedback.",
          "Saying the placenta mixes maternal and fetal blood directly.",
          "Calling the zygote haploid because one gamete has just entered the egg.",
        ],
        specPoints: [
          point("Unit 4.2(a)", "describe spermatogenesis and oogenesis and relate them to meiosis", ["AO1"]),
          point("Unit 4.2(b)", "explain hormonal control of the ovarian cycle including FSH LH oestrogen and progesterone", ["AO1", "AO2"]),
          point("Unit 4.2(c)", "describe fertilisation implantation and placental exchange", ["AO1", "AO2"]),
          point("Unit 4.2(d)", "evaluate contraception and assisted reproductive technologies", ["AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
      topic({
        slug: "plant-reproduction",
        title: "Sexual reproduction in plants",
        specRef: "Unit 4.3",
        difficulty: 3,
        summary:
          "Flower structure, pollination, pollen-tube growth, double fertilisation and the formation, dormancy and germination of seeds.",
        keyPoints: [
          "Anthers produce pollen and stigmas receive it; floral traits such as scent, colour and nectar or light pollen reflect insect or wind pollination.",
          "A pollen grain germinates on a compatible stigma and a pollen tube grows down the style, guided by chemical signals toward the ovule.",
          "In flowering plants one sperm nucleus fuses with the egg and another with the polar nuclei, producing an embryo and a triploid endosperm.",
          "After fertilisation the ovule becomes a seed; dormancy ends when water, oxygen and a suitable temperature allow enzymes and respiration to support germination.",
        ],
        commonErrors: [
          "Calling pollination the fusion of gamete nuclei; it is transfer of pollen to a stigma.",
          "Writing that the endosperm is diploid after double fertilisation.",
          "Saying a seed germinates because it photosynthesises before leaves have developed.",
        ],
        specPoints: [
          point("Unit 4.3(a)", "relate flower structures and adaptations to insect or wind pollination", ["AO1", "AO2"]),
          point("Unit 4.3(b)", "explain pollen germination pollen-tube growth and fertilisation", ["AO1", "AO2"]),
          point("Unit 4.3(c)", "describe double fertilisation and the formation of embryo seed and endosperm", ["AO1"]),
          point("Unit 4.3(d)", "explain seed dormancy and the environmental requirements for germination", ["AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
      topic({
        slug: "genetic-applications",
        title: "Genetic technologies and applications",
        specRef: "Unit 4.5",
        difficulty: 5,
        summary:
          "PCR, electrophoresis, sequencing, recombinant DNA, gene therapy and screening: what each technique does, how to interpret it and where ethical limits arise.",
        keyPoints: [
          "PCR repeatedly denatures DNA, anneals primers and extends new strands; each cycle approximately doubles the target sequence when reagents are not limiting.",
          "Gel electrophoresis separates DNA fragments by size because negatively charged DNA moves through a gel toward the positive electrode; shorter fragments travel further.",
          "Restriction enzymes cut specific sequences and ligase joins compatible ends; a vector delivers recombinant DNA into a host cell for expression or cloning.",
          "Genetic screening and gene therapy can reduce disease risk, but validity, consent, access, off-target effects and the distinction between somatic and germ-line change must be considered.",
        ],
        commonErrors: [
          "Saying PCR copies the whole genome indiscriminately rather than a primer-defined target.",
          "Reversing the direction of DNA migration in electrophoresis.",
          "Treating a risk marker as a diagnosis and ignoring sensitivity, specificity and informed consent.",
        ],
        specPoints: [
          point("Unit 4.5(a)", "explain PCR and interpret the amplification of a target DNA sequence", ["AO1", "AO2"]),
          point("Unit 4.5(b)", "explain gel electrophoresis and use band patterns to compare DNA fragments", ["AO1", "AO2", "AO3"]),
          point("Unit 4.5(c)", "describe restriction enzymes ligase vectors and recombinant DNA", ["AO1", "AO2"]),
          point("Unit 4.5(d)", "evaluate genetic screening gene therapy and ethical implications", ["AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
    ],
  },
  {
    slug: "unit4-options",
    title: "Unit 4 options: Health, movement and behaviour",
    topics: [
      topic({
        slug: "immunity-disease",
        title: "Immunity, disease and therapeutic antibodies",
        specRef: "Unit 4 Option A",
        difficulty: 4,
        summary:
          "Innate barriers, inflammation, clonal selection, vaccination and monoclonal antibodies, including why antimicrobial resistance evolves.",
        keyPoints: [
          "Skin, mucus, cilia, lysozyme, stomach acid and inflammation provide non-specific defence before a pathogen-specific response is established.",
          "Clonal selection activates a lymphocyte with a complementary receptor; B cells form plasma cells and memory cells, while T cells coordinate or destroy infected cells.",
          "Vaccination creates memory without the disease; a faster secondary response explains protection and the population effect of herd immunity.",
          "Monoclonal antibodies bind one target for diagnosis or therapy, while antibiotic overuse selects resistant variants rather than making an individual bacterium deliberately adapt.",
        ],
        commonErrors: [
          "Calling antibodies pathogens or saying they kill every pathogen directly.",
          "Confusing antibodies made by plasma cells with memory cells made for future responses.",
          "Saying vaccination protects only the vaccinated person and ignoring transmission thresholds.",
        ],
        specPoints: [
          point("Unit 4 Option A(a)", "describe non-specific barriers inflammation and phagocytosis", ["AO1"]),
          point("Unit 4 Option A(b)", "explain clonal selection antibody production and T-cell responses", ["AO1", "AO2"]),
          point("Unit 4 Option A(c)", "explain vaccination primary and secondary responses and herd immunity", ["AO2", "AO3"]),
          point("Unit 4 Option A(d)", "explain monoclonal antibody uses and the selection of antimicrobial resistance", ["AO1", "AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
      topic({
        slug: "musculoskeletal",
        title: "Musculoskeletal anatomy and movement",
        specRef: "Unit 4 Option B",
        difficulty: 4,
        summary:
          "Sliding filaments, neuromuscular junctions, antagonistic muscles and levers: how excitation becomes controlled movement.",
        keyPoints: [
          "A sarcomere shortens when myosin heads form cross-bridges with actin, pivot using ATP and pull the thin filaments toward the M line; the filaments themselves do not shorten.",
          "An action potential releases calcium from the sarcoplasmic reticulum; calcium exposes actin binding sites and ATP detaches and re-cocks the myosin head.",
          "Skeletal muscles pull, not push, so joints use antagonistic pairs; bones act as levers and the joint is the pivot while muscle force acts through a moment arm.",
          "Aerobic respiration supports sustained activity, whereas anaerobic glycolysis supplies ATP quickly but leads to lactate accumulation and an oxygen debt for recovery.",
        ],
        commonErrors: [
          "Saying actin and myosin filaments contract rather than slide past each other.",
          "Forgetting calcium's role in moving tropomyosin away from actin binding sites.",
          "Treating fatigue as the muscle running out of ATP completely; ATP production and metabolite effects are the issue.",
        ],
        specPoints: [
          point("Unit 4 Option B(a)", "explain the sliding-filament mechanism of skeletal muscle contraction", ["AO1", "AO2"]),
          point("Unit 4 Option B(b)", "relate action potentials calcium and ATP to the neuromuscular cycle", ["AO1", "AO2"]),
          point("Unit 4 Option B(c)", "apply antagonistic muscle and lever models to movement", ["AO2", "AO3"]),
          point("Unit 4 Option B(d)", "compare aerobic and anaerobic energy supply and explain recovery", ["AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
      topic({
        slug: "neurobiology-behaviour",
        title: "Neurobiology and behaviour",
        specRef: "Unit 4 Option C",
        difficulty: 4,
        summary:
          "The organisation of the nervous system, chemical effects on synapses and the evidence used to explain innate, learned and rhythmic behaviour.",
        keyPoints: [
          "Sensory, relay and motor neurones link receptors to effectors; the central nervous system integrates information while the peripheral system carries signals to and from it.",
          "Drugs can mimic neurotransmitters, block receptors, inhibit reuptake or alter breakdown, so their effects depend on where and how they change synaptic transmission.",
          "Innate behaviour has a genetic component, while learning changes future responses through experience; observations must separate correlation from causation.",
          "Circadian and seasonal rhythms are endogenous but entrained by environmental cues such as light; controlled experiments can identify the biological clock and zeitgeber.",
        ],
        commonErrors: [
          "Assuming every behaviour is either completely genetic or completely learned.",
          "Calling any change in synaptic transmission an increase in impulse speed.",
          "Treating a correlation between a stimulus and a behaviour as proof of a single causal mechanism.",
        ],
        specPoints: [
          point("Unit 4 Option C(a)", "describe nervous system organisation and sensory integration", ["AO1"]),
          point("Unit 4 Option C(b)", "explain how drugs alter neurotransmitter action at synapses", ["AO1", "AO2"]),
          point("Unit 4 Option C(c)", "distinguish innate and learned behaviour and evaluate behavioural evidence", ["AO2", "AO3"]),
          point("Unit 4 Option C(d)", "explain endogenous rhythms entrainment and experimental tests of biological clocks", ["AO1", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
    ],
  },
  {
    slug: "unit4-human-impact",
    title: "Unit 4 extension: Human impact and conservation",
    topics: [
      topic({
        slug: "human-impact",
        title: "Human impact, conservation and sustainability",
        specRef: "Unit 4.4",
        difficulty: 4,
        summary:
          "How land use, pollution and climate change alter ecosystems, and how conservation decisions use evidence to protect biodiversity without ignoring people.",
        keyPoints: [
          "Habitat loss and fragmentation reduce population size, isolate gene pools and create edge effects; corridors and protected areas can reconnect viable populations.",
          "Eutrophication follows nutrient enrichment, algal growth, reduced light, plant death, microbial decomposition and oxygen depletion, which can produce fish kills.",
          "Human-driven climate change changes temperature, rainfall and ocean chemistry; feedbacks such as ice-albedo and carbon-cycle changes can amplify the initial forcing.",
          "Conservation can be in situ or ex situ and should be evaluated using population evidence, genetic diversity, ecosystem services, cost and the needs of local communities.",
        ],
        commonErrors: [
          "Listing pollution as a cause of eutrophication without explaining the oxygen-demanding decomposition sequence.",
          "Treating a protected area as automatically successful without measuring population size, recruitment or genetic diversity.",
          "Calling any correlation between temperature and one species' abundance proof that climate change is the only cause.",
        ],
        specPoints: [
          point("Unit 4.4(e)", "explain how habitat loss fragmentation and pollution reduce biodiversity", ["AO1", "AO2"]),
          point("Unit 4.4(f)", "explain the stages and ecological consequences of eutrophication", ["AO1", "AO2"]),
          point("Unit 4.4(g)", "evaluate climate-change evidence and feedbacks in biological systems", ["AO2", "AO3"]),
          point("Unit 4.4(h)", "compare conservation strategies using biological and social evidence", ["AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
    ],
  },
  {
    slug: "unit5-practical-biology",
    title: "Unit 5 extension: Biological practical skills",
    topics: [
      topic({
        slug: "practical-skills",
        title: "Biological practical skills and data interpretation",
        specRef: "Unit 5",
        difficulty: 4,
        summary:
          "Planning a biological investigation, collecting defensible measurements and turning uncertainty, sampling and statistical tests into a justified conclusion.",
        keyPoints: [
          "A valid plan defines the independent, dependent and controlled variables, chooses a biologically meaningful range and includes repeats with a reasoned sample size.",
          "Random sampling reduces selection bias, while systematic sampling along a transect reveals a spatial gradient; quadrats must be placed and counted consistently.",
          "Magnification is image size divided by actual size; uncertainty, resolution and calibration determine whether a measurement supports the claimed difference.",
          "A statistical test compares evidence with a null model, but a biological conclusion must also discuss effect size, validity, limitations and whether the result is practically meaningful.",
        ],
        commonErrors: [
          "Calling repeated measurements independent replicates when the same specimen or culture was measured repeatedly.",
          "Confusing accuracy with precision or claiming that averaging removes systematic error.",
          "Reporting a significant p-value without stating the null hypothesis, test assumptions or the direction of the biological effect.",
        ],
        specPoints: [
          point("Unit 5(a)", "design safe biological investigations with variables controls repeats and sampling", ["AO2", "AO3"]),
          point("Unit 5(b)", "use quadrats transects calibration magnification and scale bars to quantify observations", ["AO1", "AO2"]),
          point("Unit 5(c)", "calculate uncertainty and select an appropriate statistical test", ["AO2", "AO3"]),
          point("Unit 5(d)", "draw an evidence-based biological conclusion and evaluate validity", ["AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
    ],
  },
];

export const wjecChemistryExpansion: UnitSpec[] = [
  {
    slug: "unit2-thermodynamics",
    title: "Unit 2 extension: Thermodynamics and feasibility",
    topics: [
      topic({
        slug: "entropy-feasibility",
        title: "Entropy, feasibility and free energy",
        specRef: "Unit 2.4",
        difficulty: 5,
        summary:
          "Why reactions can be feasible yet slow: entropy, enthalpy and Gibbs free energy give a thermodynamic test separate from kinetics.",
        keyPoints: [
          "Entropy measures the dispersal of energy and matter; gases and a greater number of particles usually give a larger entropy change than ordered solids or liquids.",
          "Calculate reaction entropy from standard molar entropies: ΔS° = ΣS°(products) − ΣS°(reactants), keeping coefficients and units consistent.",
          "At a stated temperature, ΔG° = ΔH° − TΔS°; a negative value indicates a thermodynamically feasible forward reaction under standard conditions.",
          "Feasibility does not mean a reaction is fast: activation energy and mechanism determine rate, while equilibrium describes the final composition.",
        ],
        commonErrors: [
          "Using degrees Celsius in TΔS; temperature must be in kelvin.",
          "Calling a feasible reaction spontaneous in every concentration and pressure; ΔG° is a standard-state prediction.",
          "Treating a catalyst as changing ΔG or equilibrium rather than lowering activation energy for both directions.",
        ],
        specPoints: [
          point("Unit 2.4(a)", "explain entropy as energy and matter dispersal and predict signs of entropy change", ["AO1", "AO2"]),
          point("Unit 2.4(b)", "calculate standard reaction entropy from tabulated molar entropies", ["AO2"]),
          point("Unit 2.4(c)", "use Gibbs free energy to assess feasibility at a stated temperature", ["AO2", "AO3"]),
          point("Unit 2.4(d)", "distinguish thermodynamic feasibility reaction rate and equilibrium", ["AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
    ],
  },
  {
    slug: "unit3-main-group",
    title: "Unit 3 extension: Main-group and p-block chemistry",
    topics: [
      topic({
        slug: "p-block",
        title: "p-block trends and compounds",
        specRef: "Unit 3.2",
        difficulty: 4,
        summary:
          "Periodic trends across the p-block, the acid–base behaviour of oxides and the links between structure, bonding and reactivity.",
        keyPoints: [
          "Across a period, increasing nuclear charge with similar shielding generally reduces atomic radius and raises first ionisation energy, with small dips where subshell or paired-electron effects intervene.",
          "Period-three oxides change from basic ionic oxides to acidic covalent oxides; their reactions with water and alkalis reveal the trend in bonding and acidity.",
          "Oxidation states and disproportionation are tracked with half-equations and oxidation numbers, not by guessing from the position of an element alone.",
          "The physical properties of p-block substances depend on whether their particles form simple molecules, giant covalent structures or ions in a lattice.",
        ],
        commonErrors: [
          "Explaining every ionisation-energy change using atomic radius alone and ignoring subshell energy or electron pairing.",
          "Calling a covalent oxide basic because the element is on the left of the period without considering the reaction.",
          "Mixing oxidation state with charge on an individual atom in a covalent molecule.",
        ],
        specPoints: [
          point("Unit 3.2(a)", "explain p-block trends in radius ionisation energy and electronegativity", ["AO1", "AO2"]),
          point("Unit 3.2(b)", "relate the acid-base behaviour of period-three oxides to bonding", ["AO2", "AO3"]),
          point("Unit 3.2(c)", "use oxidation numbers and half-equations to analyse p-block redox reactions", ["AO2"]),
          point("Unit 3.2(d)", "relate physical properties of p-block substances to their structures", ["AO1", "AO2"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
    ],
  },
  {
    slug: "unit4-organic-depth",
    title: "Unit 4 extension: Organic structures and synthesis",
    topics: [
      topic({
        slug: "stereoisomerism",
        title: "Stereoisomerism",
        specRef: "Unit 4.2",
        difficulty: 4,
        summary:
          "How restricted rotation and chirality create different three-dimensional molecules with the same structural formula, and why that matters in chemistry and medicine.",
        keyPoints: [
          "E/Z isomerism requires restricted rotation and two different groups on each carbon of a C=C bond; compare the higher-priority groups to assign E or Z.",
          "Optical isomers are non-superimposable mirror images formed at a chiral centre; enantiomers have identical physical properties in achiral conditions but rotate plane-polarised light oppositely.",
          "A racemic mixture contains equal amounts of both enantiomers and has no net optical rotation, even though each molecule is optically active.",
          "Different stereoisomers can bind differently to biological targets, so synthesis, testing and dosage must account for stereochemical composition.",
        ],
        commonErrors: [
          "Calling any pair of structural isomers E/Z isomers without a C=C bond and restricted rotation.",
          "Saying a racemic mixture contains no chiral molecules.",
          "Confusing a plane of symmetry with a C=C double bond when identifying a chiral centre.",
        ],
        specPoints: [
          point("Unit 4.2(a)", "identify and assign E/Z stereoisomers from a structural formula", ["AO1", "AO2"]),
          point("Unit 4.2(b)", "identify chiral centres and draw pairs of optical isomers", ["AO1", "AO2"]),
          point("Unit 4.2(c)", "explain optical activity and the behaviour of racemic mixtures", ["AO1", "AO2"]),
          point("Unit 4.2(d)", "evaluate the importance of stereochemistry in biological and pharmaceutical molecules", ["AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
      topic({
        slug: "amino-acids-proteins",
        title: "Amino acids, peptides and proteins",
        specRef: "Unit 4.8",
        difficulty: 4,
        summary:
          "The acid–base behaviour of amino acids, peptide formation and the structural levels that determine how proteins fold and function.",
        keyPoints: [
          "Amino acids contain acidic carboxyl and basic amino groups, so they can form zwitterions and act as buffers as pH changes.",
          "Condensation between the amino and carboxyl groups forms a peptide bond; hydrolysis breaks it and releases amino acids or shorter peptides.",
          "Primary sequence determines possible hydrogen bonding, ionic interactions, disulfide bridges and hydrophobic interactions that produce secondary and tertiary structure.",
          "Proteins can be identified by hydrolysis and chromatographic or colour tests, but an analytical result must be linked to controls and uncertainty.",
        ],
        commonErrors: [
          "Drawing a peptide bond between two side chains instead of between an amino and carboxyl group.",
          "Calling a zwitterion an ion with only a positive or only a negative charge.",
          "Claiming denaturation always hydrolyses peptide bonds; many denaturants disrupt higher-level interactions instead.",
        ],
        specPoints: [
          point("Unit 4.8(a)", "explain zwitterion formation and acid-base behaviour of amino acids", ["AO1", "AO2"]),
          point("Unit 4.8(b)", "describe peptide formation and hydrolysis", ["AO1"]),
          point("Unit 4.8(c)", "relate amino-acid sequence and intermolecular forces to protein structure", ["AO1", "AO2"]),
          point("Unit 4.8(d)", "interpret tests and analytical evidence for amino acids peptides and proteins", ["AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
      topic({
        slug: "organic-synthesis",
        title: "Organic synthesis and route planning",
        specRef: "Unit 4.11",
        difficulty: 5,
        summary:
          "Planning a multi-step route by tracking functional-group changes, selecting reagents and conditions, then purifying and checking the product.",
        keyPoints: [
          "Retrosynthesis works backwards from the target: identify the final functional-group change, choose a reaction that makes it, then repeat until a practical starting material is reached.",
          "A valid route names reagents and conditions, controls oxidation state and recognises when distillation, reflux, aqueous work-up or anhydrous conditions are required.",
          "Purification uses the physical properties of the product and impurities: filtration, washing, drying, distillation or recrystallisation each solve a different problem.",
          "Yield and atom economy measure different outcomes; a route should also be checked by IR, NMR, mass spectrometry or melting point rather than yield alone.",
        ],
        commonErrors: [
          "Writing a reaction arrow without a reagent, catalyst, solvent or temperature when the conditions determine the product.",
          "Using reflux when the desired volatile product should be distilled off to prevent further oxidation.",
          "Treating a high percentage yield as proof of purity.",
        ],
        specPoints: [
          point("Unit 4.11(a)", "plan retrosynthetic routes using functional-group interconversions", ["AO2", "AO3"]),
          point("Unit 4.11(b)", "select reagents conditions and apparatus for each synthetic step", ["AO2"]),
          point("Unit 4.11(c)", "choose appropriate separation and purification methods", ["AO2", "AO3"]),
          point("Unit 4.11(d)", "evaluate yield atom economy purity and analytical evidence for a synthesis", ["AO2", "AO3"]),
        ],
        aos: ["AO2", "AO3"],
      }),
    ],
  },
  {
    slug: "unit5-practical",
    title: "Unit 5 extension: Practical chemistry and analysis",
    topics: [
      topic({
        slug: "practical-analysis",
        title: "Practical methods, uncertainty and analysis",
        specRef: "Unit 5",
        difficulty: 4,
        summary:
          "Designing reliable investigations, quantifying uncertainty and turning titration, calorimetry, chromatography and spectra into defensible conclusions.",
        keyPoints: [
          "A good plan identifies the independent, dependent and controlled variables, uses a justified range and includes a risk control that changes the procedure safely.",
          "Repeat measurements expose random variation; percentage uncertainty combines instrument limits and measured values, while systematic error must be identified rather than averaged away.",
          "Concordant titres, calibrated apparatus, an insulated calorimeter and a clear end-point improve validity; a rough titre is used only to locate the end point.",
          "An analytical conclusion triangulates evidence: Rf values, IR absorptions, NMR environments, mass fragments or a colour change must agree with the proposed substance.",
        ],
        commonErrors: [
          "Listing a control variable without saying how it will be held constant.",
          "Reporting more decimal places than the apparatus can justify.",
          "Calling a result accurate because repeats agree while ignoring a shared systematic error.",
        ],
        specPoints: [
          point("Unit 5(a)", "design a safe investigation with variables controls repeats and an appropriate range", ["AO2", "AO3"]),
          point("Unit 5(b)", "calculate and evaluate random and systematic uncertainty", ["AO2", "AO3"]),
          point("Unit 5(c)", "explain how titration and calorimetry methods improve validity and precision", ["AO1", "AO2"]),
          point("Unit 5(d)", "combine chromatographic spectroscopic and physical evidence to identify a compound", ["AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
    ],
  },
  {
    slug: "unit2-organic-mechanisms",
    title: "Unit 2/4 extension: Organic mechanisms",
    topics: [
      topic({
        slug: "organic-mechanisms",
        title: "Organic mechanisms and reaction pathways",
        specRef: "Unit 2.6 / 4.4",
        difficulty: 5,
        summary:
          "Following electron pairs through substitution, elimination, addition and aromatic reactions so that reagents, products and conditions can be predicted rather than memorised as isolated equations.",
        keyPoints: [
          "In nucleophilic substitution the nucleophile donates an electron pair to an electron-poor carbon while the leaving group takes the bonding pair; bond polarity and structure affect the rate.",
          "Aqueous hydroxide favours substitution of a primary halogenoalkane, whereas ethanolic hydroxide and heat favour elimination to an alkene; conditions are part of the answer.",
          "Aldehydes and ketones undergo nucleophilic addition because the carbonyl carbon is electron-poor; HCN adds across C=O and NaBH4 reduces it to an alcohol.",
          "Mechanism arrows show electron-pair movement from a lone pair or bond to an electron-poor centre; they must conserve atoms, charge and the number of electrons represented.",
        ],
        commonErrors: [
          "Drawing a curly arrow from a positive atom rather than from a lone pair or bond containing the electron pair.",
          "Using aqueous hydroxide and ethanolic hydroxide as interchangeable conditions when they favour different products.",
          "Adding HCN to oxygen or moving two electrons when the mechanism requires one electron pair and a correctly placed leaving group.",
        ],
        specPoints: [
          point("Unit 2.6(a)", "draw and explain nucleophilic substitution of a halogenoalkane", ["AO1", "AO2"]),
          point("Unit 2.6(b)", "predict elimination products and explain the effect of reagent solvent and temperature", ["AO2", "AO3"]),
          point("Unit 4.4(a)", "explain nucleophilic addition to aldehydes and ketones", ["AO1", "AO2"]),
          point("Unit 4.4(b)", "use curly-arrow conventions to construct valid organic mechanisms", ["AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
    ],
  },
  {
    slug: "unit3-electrochemistry",
    title: "Unit 3 extension: Electrochemical cells",
    topics: [
      topic({
        slug: "electrochemical-cells",
        title: "Electrochemical cells and standard potentials",
        specRef: "Unit 3.1",
        difficulty: 5,
        summary:
          "Using half-cells, standard electrode potentials and cell notation to predict redox feasibility, explain voltage measurements and design a fair electrochemical investigation.",
        keyPoints: [
          "A standard electrode potential compares a reduction half-cell with the standard hydrogen electrode under stated conditions; the more positive value has the greater tendency to be reduced.",
          "E°cell = E°(reduction at the cathode) − E°(reduction at the anode); a positive value predicts a feasible reaction under standard conditions.",
          "The salt bridge completes the ionic circuit and prevents charge build-up while the external wire carries electrons; cell notation identifies the anode, cathode and phase boundaries.",
          "Measured voltage depends on concentration, temperature, resistance and surface condition, so a comparison must control conditions and distinguish equilibrium feasibility from reaction rate.",
        ],
        commonErrors: [
          "Subtracting electrode potentials in the order they are written instead of reduction minus oxidation half-cell.",
          "Saying electrons flow through the salt bridge; ions flow there while electrons use the external circuit.",
          "Treating a positive E°cell as evidence that the reaction is fast or that every non-standard mixture gives the standard voltage.",
        ],
        specPoints: [
          point("Unit 3.1(a)", "define standard electrode potential and describe the standard hydrogen electrode", ["AO1"]),
          point("Unit 3.1(b)", "calculate E cell and predict redox feasibility from electrode potentials", ["AO2", "AO3"]),
          point("Unit 3.1(c)", "explain the roles of half-cells salt bridges and external circuits", ["AO1", "AO2"]),
          point("Unit 3.1(d)", "plan and evaluate a fair measurement of cell potential", ["AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
    ],
  },
];

export const wjecPhysicsExpansion: UnitSpec[] = [
  {
    slug: "unit4-options",
    title: "Unit 4 options: Capacitance and applied physics",
    topics: [
      topic({
        slug: "capacitance",
        title: "Capacitance and RC circuits",
        specRef: "Unit 4.6",
        difficulty: 4,
        summary:
          "Charge storage, energy in a capacitor and the exponential charge/discharge of an RC circuit, including how to read the time constant from data.",
        keyPoints: [
          "Capacitance is charge stored per unit potential difference, C = Q/V; a larger plate area or smaller separation increases capacitance for a parallel-plate capacitor.",
          "The stored energy is E = ½QV = ½CV² = Q²/(2C), so raising voltage has a squared effect on energy.",
          "In a series circuit capacitors share charge and reciprocal capacitances add; in parallel they share potential difference and capacitances add.",
          "During charging or discharging, Q, V and I change exponentially with time constant τ = RC; after one τ, charging reaches about 63% and discharging falls to about 37%.",
        ],
        commonErrors: [
          "Using the resistor-current equation alone and forgetting that capacitor current changes during the transient.",
          "Adding series capacitances as if they were resistors in parallel.",
          "Calling τ the time to reach the final value; it is the characteristic scale, not an instant finish.",
        ],
        specPoints: [
          point("Unit 4.6(a)", "define capacitance and explain factors affecting a parallel-plate capacitor", ["AO1", "AO2"]),
          point("Unit 4.6(b)", "calculate energy stored in a capacitor", ["AO2"]),
          point("Unit 4.6(c)", "calculate equivalent capacitance in series and parallel combinations", ["AO2"]),
          point("Unit 4.6(d)", "interpret charging and discharging curves using the time constant RC", ["AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
      topic({
        slug: "alternating-currents",
        title: "Alternating currents and AC circuits",
        specRef: "Unit 4 Option A",
        difficulty: 5,
        summary:
          "Sinusoidal voltage, rms values, phase and impedance: why capacitors, inductors and transformers behave differently at different frequencies.",
        keyPoints: [
          "For a sinusoidal supply, Vᵣₘₛ = V₀/√2 and Iᵣₘₛ = I₀/√2; rms values give the equivalent DC heating effect.",
          "Capacitive reactance decreases as frequency rises, while inductive reactance increases; phase relationships determine whether current leads or lags voltage.",
          "A transformer changes voltage through the turns ratio; power is approximately conserved, so a step-up voltage reduces current and lowers transmission losses for a fixed power.",
          "Resonance occurs when reactances balance; the response curve and quality factor describe selectivity, bandwidth and the effect of damping.",
        ],
        commonErrors: [
          "Using peak voltage in a mains-power calculation that requires rms voltage.",
          "Saying a transformer changes frequency as well as voltage; the frequency is set by the supply.",
          "Calling resonance the point of minimum current in a series RLC circuit.",
        ],
        specPoints: [
          point("Unit 4 Option A(a)", "use rms and peak values for sinusoidal voltage and current", ["AO1", "AO2"]),
          point("Unit 4 Option A(b)", "explain frequency-dependent reactance and phase in AC circuits", ["AO1", "AO2"]),
          point("Unit 4 Option A(c)", "apply transformer ratios and power transfer to transmission", ["AO2", "AO3"]),
          point("Unit 4 Option A(d)", "explain resonance bandwidth damping and quality factor", ["AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
      topic({
        slug: "medical-physics",
        title: "Medical physics",
        specRef: "Unit 4 Option B",
        difficulty: 4,
        summary:
          "X-ray, ultrasound, MRI and radionuclide imaging: how each modality forms contrast and the safety trade-offs behind a diagnosis.",
        keyPoints: [
          "X-rays are produced when fast electrons decelerate at a target; attenuation depends on thickness, density and atomic number, enabling contrast between tissues.",
          "Ultrasound pulses reflect at boundaries with different acoustic impedances; time-of-flight and Doppler shifts provide structural and blood-flow information without ionising radiation.",
          "MRI uses nuclear magnetic resonance in a strong field; radiofrequency pulses and gradients encode the positions and relaxation properties of tissues.",
          "Radiotracers emit detectable radiation for functional imaging such as gamma cameras or PET, so half-life, dose, shielding and benefit must be balanced.",
        ],
        commonErrors: [
          "Calling ultrasound electromagnetic radiation; it is a mechanical longitudinal wave.",
          "Saying MRI uses X-rays; its signal comes from nuclear spins and radiofrequency pulses.",
          "Assuming higher image contrast is always better when it may require a higher patient dose.",
        ],
        specPoints: [
          point("Unit 4 Option B(a)", "explain X-ray production attenuation radiography and CT contrast", ["AO1", "AO2"]),
          point("Unit 4 Option B(b)", "explain ultrasound reflection Doppler shift and diagnostic use", ["AO1", "AO2"]),
          point("Unit 4 Option B(c)", "describe the principles of MRI and tissue contrast", ["AO1", "AO2"]),
          point("Unit 4 Option B(d)", "evaluate radionuclide imaging with reference to half-life dose and safety", ["AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
      topic({
        slug: "sports-physics",
        title: "The physics of sport",
        specRef: "Unit 4 Option C",
        difficulty: 4,
        summary:
          "Applying mechanics, energy, impulse and fluid ideas to sporting motion while separating a useful model from the messy real system.",
        keyPoints: [
          "Projectile motion is resolved into independent horizontal and vertical components; air resistance couples them and must be modelled or measured when it matters.",
          "The centre of mass and line of action determine balance; moments about a joint explain how posture and lever arms change the required muscle force.",
          "Impulse equals change in momentum, so increasing contact time reduces average force for the same momentum change, as in landing mats or protective equipment.",
          "Lift and drag depend on speed, area, fluid density and shape; experimental data should distinguish a correlation from a causal performance claim.",
        ],
        commonErrors: [
          "Assuming horizontal velocity is constant when drag is significant.",
          "Using the distance from the joint rather than the perpendicular distance to a force line when taking moments.",
          "Confusing impulse with kinetic energy.",
        ],
        specPoints: [
          point("Unit 4 Option C(a)", "model projectile motion and evaluate the effect of air resistance", ["AO2", "AO3"]),
          point("Unit 4 Option C(b)", "apply centre-of-mass and moment ideas to posture and movement", ["AO2", "AO3"]),
          point("Unit 4 Option C(c)", "use impulse and momentum to analyse collisions and protective equipment", ["AO2"]),
          point("Unit 4 Option C(d)", "relate lift drag and fluid variables to sporting performance", ["AO1", "AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
      topic({
        slug: "energy-environment",
        title: "Energy and the environment",
        specRef: "Unit 4 Option D",
        difficulty: 4,
        summary:
          "Comparing energy resources and storage by efficiency, power, emissions, reliability and life-cycle impact rather than by a single headline number.",
        keyPoints: [
          "Efficiency is useful output divided by total input; a complete comparison also reports capacity factor, intermittency, power density and the time scale of demand.",
          "The greenhouse effect is caused by absorption and re-emission of infrared radiation; a budget must distinguish natural greenhouse warming from human-driven changes.",
          "Batteries, pumped storage, hydrogen and thermal storage shift energy through time but introduce losses, material constraints and infrastructure requirements.",
          "Life-cycle analysis includes construction, fuel extraction, operation, decommissioning and waste; uncertainty should be shown rather than hidden in a single ranking.",
        ],
        commonErrors: [
          "Calling an energy source 100% efficient because the fuel is free or renewable.",
          "Treating power and energy as interchangeable.",
          "Counting only operational emissions and ignoring construction or disposal stages.",
        ],
        specPoints: [
          point("Unit 4 Option D(a)", "compare energy resources using efficiency power reliability and capacity factor", ["AO2", "AO3"]),
          point("Unit 4 Option D(b)", "explain the greenhouse effect and energy transfer by infrared radiation", ["AO1", "AO2"]),
          point("Unit 4 Option D(c)", "evaluate energy-storage technologies with energy and power constraints", ["AO2", "AO3"]),
          point("Unit 4 Option D(d)", "use life-cycle analysis and uncertainty to evaluate environmental claims", ["AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
    ],
  },
  {
    slug: "unit5-practical",
    title: "Unit 5 extension: Practical investigation and analysis",
    topics: [
      topic({
        slug: "practical-investigations",
        title: "Practical investigations and data analysis",
        specRef: "Unit 5",
        difficulty: 4,
        summary:
          "Planning, measuring, graphing and evaluating a physics investigation so that a conclusion follows from evidence rather than from a neat-looking line.",
        keyPoints: [
          "A valid investigation changes one independent variable, measures a defined dependent variable and controls quantities that could otherwise explain the result.",
          "Random uncertainty is reduced by repeats and averaging; systematic error shifts every result and needs calibration, a better method or an explicit limitation.",
          "Linearising a relationship makes the gradient and intercept meaningful; units, significant figures and uncertainty must be carried through the calculation.",
          "A conclusion should state the relationship, quote evidence and explain the range of validity; evaluation proposes a specific improvement and predicts its effect.",
        ],
        commonErrors: [
          "Saying repeats remove systematic error.",
          "Drawing a best-fit line through the origin without evidence that the intercept is zero.",
          "Calling a result precise because the graph is smooth while ignoring a large scale uncertainty.",
        ],
        specPoints: [
          point("Unit 5(a)", "plan a safe investigation with variables controls and repeat measurements", ["AO2", "AO3"]),
          point("Unit 5(b)", "distinguish random uncertainty systematic error accuracy and precision", ["AO1", "AO2"]),
          point("Unit 5(c)", "linearise data and determine a gradient intercept and their uncertainties", ["AO2", "AO3"]),
          point("Unit 5(d)", "draw evidence-based conclusions and evaluate a method with targeted improvements", ["AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
    ],
  },
  {
    slug: "unit4-fields-depth",
    title: "Unit 4 extension: Orbits and electromagnetic induction",
    topics: [
      topic({
        slug: "orbits-universe",
        title: "Orbits and the wider universe",
        specRef: "Unit 4.3",
        difficulty: 5,
        summary:
          "Using gravitational fields to explain satellite orbits, then connecting redshift, the Hubble law and standard-candle evidence to an expanding universe.",
        keyPoints: [
          "For a circular orbit gravity supplies the centripetal force, so GMm/r² = mv²/r and v = √(GM/r); a larger orbit has a lower orbital speed.",
          "Kepler's third law follows from the same model: T² = 4π²r³/(GM), so period increases strongly with orbital radius and a synchronous orbit has a chosen period matching the rotation of the body.",
          "A geostationary satellite must be above the equator, move west to east in a circular orbit and have a 24-hour period; these constraints make it appear fixed to an observer on Earth.",
          "Redshift of distant galaxies and the Hubble relationship v = H₀d provide evidence for expansion, but distance calibration, peculiar velocities and uncertainty must be considered.",
        ],
        commonErrors: [
          "Using the radius above the surface instead of distance from the centre of the attracting body.",
          "Saying a satellite needs a continuous tangential force to keep moving in orbit; gravity changes its direction of velocity.",
          "Treating redshift alone as a direct measurement of distance without explaining the Hubble-law model and its uncertainties.",
        ],
        specPoints: [
          point("Unit 4.3(a)", "derive and apply circular-orbit speed and period from gravitational force", ["AO2"]),
          point("Unit 4.3(b)", "explain Kepler relationships and conditions for a geostationary satellite", ["AO1", "AO2"]),
          point("Unit 4.3(c)", "use redshift and the Hubble law as evidence for an expanding universe", ["AO2", "AO3"]),
          point("Unit 4.3(d)", "evaluate uncertainty and model limitations in astronomical measurements", ["AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
      topic({
        slug: "electromagnetic-induction",
        title: "Electromagnetic induction and transformers",
        specRef: "Unit 4.5",
        difficulty: 5,
        summary:
          "Explaining induced emf with magnetic flux, Faraday's law and Lenz's law, then applying the model to generators, transformers and efficient power transmission.",
        keyPoints: [
          "Magnetic flux through a coil is Φ = BA cos θ, and induced emf is proportional to the rate of change of flux linkage NΦ; no change means no induced emf.",
          "Lenz's law gives the direction: the induced current produces a magnetic effect that opposes the change in flux, expressing conservation of energy rather than a mysterious extra force.",
          "A generator changes mechanical work into electrical energy by rotating a coil or magnet; the output waveform and use of slip rings or a commutator depend on the design.",
          "For an ideal transformer Vp/Vs = Np/Ns and power is conserved; step-up transmission reduces current and therefore reduces I²R loss in cables, while real transformers have heating and flux losses.",
        ],
        commonErrors: [
          "Using the magnetic field itself rather than the rate of change of flux when deciding whether an emf is induced.",
          "Quoting Lenz's law as 'the current opposes the motion' without identifying the change in flux it opposes.",
          "Assuming a transformer works with steady direct current; changing magnetic flux is required and the windings must share a changing field.",
        ],
        specPoints: [
          point("Unit 4.5(a)", "calculate magnetic flux and induced emf from a changing flux linkage", ["AO2"]),
          point("Unit 4.5(b)", "use Lenz's law to determine the direction of induced current", ["AO1", "AO2"]),
          point("Unit 4.5(c)", "explain generators and the effect of slip rings or a commutator", ["AO1", "AO2"]),
          point("Unit 4.5(d)", "apply the transformer equation and evaluate transmission losses", ["AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
    ],
  },
];

export const wjecMathsExpansion: UnitSpec[] = [
  {
    slug: "applied-statistics-extension",
    title: "Statistics extension: Models and inference",
    topics: [
      topic({
        slug: "poisson-uniform",
        title: "Poisson and discrete uniform distributions",
        specRef: "Applied 2.2.4",
        difficulty: 4,
        summary:
          "Selecting and using a discrete distribution by checking its assumptions, then interpreting the result as a model of a real process.",
        keyPoints: [
          "A Poisson model counts independent events in a fixed interval at a constant mean rate λ; its mean and variance are both λ.",
          "Use P(X = r) = e⁻λλʳ/r! and cumulative probabilities for ‘at least’, ‘at most’ and interval questions, keeping the parameter tied to the same time or space unit.",
          "A discrete uniform distribution gives equal probability to each listed outcome; do not use a continuous uniform density for a finite set of integers.",
          "Model choice is part of the answer: comment on independence, constant rate, possible clustering and whether the interval or population makes the assumptions credible.",
        ],
        commonErrors: [
          "Changing the interval but forgetting to scale λ.",
          "Using a Poisson model for a fixed number of trials with a constant success probability; that is the binomial setting.",
          "Reporting a probability without stating what the random variable represents.",
        ],
        specPoints: [
          point("Applied 2.2.4(a)", "identify when a Poisson model is appropriate and interpret its parameter", ["AO1", "AO3"]),
          point("Applied 2.2.4(b)", "calculate Poisson probabilities and cumulative probabilities", ["AO2"]),
          point("Applied 2.2.4(c)", "use a discrete uniform distribution for equally likely outcomes", ["AO2"]),
          point("Applied 2.2.4(d)", "critique distribution assumptions in a real context", ["AO2", "AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
      topic({
        slug: "inference-errors",
        title: "Hypothesis testing and decision errors",
        specRef: "Applied 2.2.5",
        difficulty: 4,
        summary:
          "Turning a sample into a cautious decision about a population: hypotheses, significance, critical regions, p-values and the two ways a test can mislead.",
        keyPoints: [
          "H₀ describes the benchmark population model and H₁ the directional or non-directional alternative; the test statistic is compared with a critical region or p-value.",
          "A one-tailed test puts the significance level in one tail, while a two-tailed test splits it; the direction must be chosen before seeing the data.",
          "A Type I error rejects a true H₀, while a Type II error fails to reject a false H₀; changing sample size or significance level changes their probabilities differently.",
          "The conclusion must be in context and should say ‘insufficient evidence to reject H₀’ rather than ‘H₀ is true’ or ‘accept H₀’.",
        ],
        commonErrors: [
          "Choosing a tail after looking at the sample outcome.",
          "Calling the significance level the probability that H₀ is true.",
          "Writing a numerical decision without linking it back to the population claim in the question.",
        ],
        specPoints: [
          point("Applied 2.2.5(a)", "state null and alternative hypotheses and choose a one- or two-tailed test", ["AO1", "AO2"]),
          point("Applied 2.2.5(b)", "use critical regions significance levels and p-values to make a decision", ["AO2"]),
          point("Applied 2.2.5(c)", "interpret Type I and Type II errors in a practical context", ["AO2", "AO3"]),
          point("Applied 2.2.5(d)", "write a contextual conclusion and explain the limitation of sample inference", ["AO3"]),
        ],
        aos: ["AO1", "AO2", "AO3"],
      }),
      topic({
        slug: "continuous-distributions",
        title: "Continuous uniform and Normal distributions",
        specRef: "Applied 2.4.2",
        difficulty: 4,
        summary:
          "Using density, standardisation and inverse Normal calculations to model measurements while checking whether the chosen distribution is plausible.",
        keyPoints: [
          "For a continuous uniform variable on [a,b], probability is area: P(c ≤ X ≤ d) = (d − c)/(b − a) when the interval lies inside the model.",
          "If X ~ N(μ,σ²), standardise with Z = (X − μ)/σ so a calculator or table can give tail and interval probabilities.",
          "Inverse Normal questions work backwards from a percentile to a z-value, then return to the original units with x = μ + zσ.",
          "The Normal model is symmetric and continuous; compare its assumptions with the context and explain any approximation or continuity correction.",
        ],
        commonErrors: [
          "Using variance where standard deviation is required in the z-score.",
          "Forgetting to subtract the lower-tail probability for a two-sided interval.",
          "Treating a Normal model as exact when measurements are bounded, skewed or discrete.",
        ],
        specPoints: [
          point("Applied 2.4.2(a)", "use the continuous uniform distribution to calculate probabilities", ["AO2"]),
          point("Applied 2.4.2(b)", "standardise a Normal variable and calculate interval and tail probabilities", ["AO2"]),
          point("Applied 2.4.2(c)", "use inverse Normal calculations to find a value or percentile", ["AO2"]),
          point("Applied 2.4.2(d)", "select and critique a continuous distribution model in context", ["AO2", "AO3"]),
        ],
        aos: ["AO2", "AO3"],
      }),
      topic({
        slug: "correlation-tests",
        title: "Correlation and Normal-mean tests",
        specRef: "Applied 2.4.3",
        difficulty: 5,
        summary:
          "Testing whether a relationship or a population mean is supported by data, then communicating what the evidence does and does not show.",
        keyPoints: [
          "A correlation coefficient measures the direction and strength of linear association; it does not prove that changing one variable causes the other.",
          "For a correlation test, state hypotheses about the population coefficient ρ, compare the observed statistic with a critical value or p-value and conclude in context.",
          "For a Normal mean with known or assumed variance, the sample mean has standard deviation σ/√n; this sampling distribution is the basis of the test statistic.",
          "A statistically significant result can be practically small, while a non-significant result may reflect low power; report the direction, uncertainty and context.",
        ],
        commonErrors: [
          "Saying a correlation proves causation.",
          "Writing hypotheses about a sample correlation instead of the population parameter ρ.",
          "Using σ instead of σ/√n for a test about a sample mean.",
        ],
        specPoints: [
          point("Applied 2.4.3(a)", "interpret correlation coefficients as measures of linear association", ["AO2"]),
          point("Applied 2.4.3(b)", "conduct and interpret a hypothesis test for population correlation ρ", ["AO2", "AO3"]),
          point("Applied 2.4.3(c)", "conduct a hypothesis test for a Normal population mean using the sampling distribution", ["AO2"]),
          point("Applied 2.4.3(d)", "evaluate statistical and practical significance in context", ["AO3"]),
        ],
        aos: ["AO2", "AO3"],
      }),
    ],
  },
  {
    slug: "applied-modelling-mechanics",
    title: "Modelling extension: Assumptions and statics",
    topics: [
      topic({
        slug: "modelling-assumptions",
        title: "Mathematical modelling and assumptions",
        specRef: "Applied 2.4.1",
        difficulty: 3,
        summary:
          "Translating a real situation into variables and equations, solving the model, then checking whether the answer and assumptions make sense.",
        keyPoints: [
          "Define variables, units and the quantity to be predicted before choosing an equation; a model is a deliberate simplification, not a description of every detail.",
          "State assumptions such as constant rate, negligible air resistance, independent trials or a straight-line relationship, then use them consistently.",
          "Interpret the solution in the original context, reject impossible values and check scale, units and limiting cases before rounding.",
          "Validation compares predictions with observations; residual patterns, sensitivity to parameters and model failure reveal where a refinement is needed.",
        ],
        commonErrors: [
          "Quoting an equation without defining the symbols or units.",
          "Adding a realistic complication halfway through a model without changing the equations consistently.",
          "Accepting a negative time, probability above one or an out-of-range length because the algebra worked.",
        ],
        specPoints: [
          point("Applied 2.4.1(a)", "translate a real context into variables equations and units", ["AO2", "AO3"]),
          point("Applied 2.4.1(b)", "state and apply modelling assumptions consistently", ["AO2", "AO3"]),
          point("Applied 2.4.1(c)", "interpret solutions and reject values that are impossible in context", ["AO3"]),
          point("Applied 2.4.1(d)", "validate a model against data and explain its limitations", ["AO3"]),
        ],
        aos: ["AO2", "AO3"],
      }),
      topic({
        slug: "moments-statics",
        title: "Moments, centres of mass and statics",
        specRef: "Applied 2.4.10",
        difficulty: 4,
        summary:
          "Using perpendicular distance, force balance and moments to decide whether a body is in equilibrium and where it will tip.",
        keyPoints: [
          "The moment of a force about a point is force × perpendicular distance from the point to the line of action; its sign records clockwise or anticlockwise tendency.",
          "A rigid body is in equilibrium when the resultant force and resultant moment are both zero; taking moments about a convenient pivot eliminates unknown reactions.",
          "A system of parallel forces can be replaced by a single resultant acting through a centre of mass chosen to preserve the total moment.",
          "Stability depends on the line of action of the weight remaining inside the base; moving the load changes the reaction forces and may cause tipping.",
        ],
        commonErrors: [
          "Using the distance along the beam rather than the perpendicular distance to the force line.",
          "Balancing moments but forgetting the resultant-force equations.",
          "Taking clockwise moments as positive in one equation and anticlockwise as positive in the next.",
        ],
        specPoints: [
          point("Applied 2.4.10(a)", "calculate moments using perpendicular distance and a stated sign convention", ["AO2"]),
          point("Applied 2.4.10(b)", "apply force and moment equilibrium to a rigid body", ["AO2", "AO3"]),
          point("Applied 2.4.10(c)", "find a resultant force and centre of mass for parallel forces", ["AO2"]),
          point("Applied 2.4.10(d)", "analyse stability and tipping when loads or supports change", ["AO2", "AO3"]),
        ],
        aos: ["AO2", "AO3"],
      }),
    ],
  },
  {
    slug: "applied-probability-context",
    title: "Applied extension: Conditional probability and differential models",
    topics: [
      topic({
        slug: "conditional-probability",
        title: "Conditional probability and independence",
        specRef: "Applied 2.4.1",
        difficulty: 4,
        summary:
          "Representing dependent events with trees, Venn diagrams and two-way tables, then checking independence instead of assuming it from a convenient calculation.",
        keyPoints: [
          "Conditional probability is P(A|B) = P(A ∩ B)/P(B); the condition changes the sample space, so the denominator must match the information already known.",
          "Tree diagrams multiply along a path and add mutually exclusive paths; two-way tables provide the same information as frequencies and conditional percentages.",
          "Events are independent when P(A ∩ B) = P(A)P(B), equivalently P(A|B) = P(A) when P(B) is non-zero; independence is a model claim to check, not a default.",
          "Reverse conditional questions require Bayes' structure: combine the conditional probability with the base rate, then divide by the total probability of the observed event.",
        ],
        commonErrors: [
          "Reversing P(A|B) and P(B|A) because the event names look similar.",
          "Adding probabilities along a tree path instead of multiplying, or multiplying mutually exclusive branches instead of adding them.",
          "Calling events independent because they are mutually exclusive; non-trivial mutually exclusive events are dependent.",
        ],
        specPoints: [
          point("Applied 2.4.1(a)", "calculate conditional probabilities using formulae trees Venn diagrams and tables", ["AO2"]),
          point("Applied 2.4.1(b)", "combine path probabilities and mutually exclusive cases correctly", ["AO2"]),
          point("Applied 2.4.1(c)", "test and interpret independence of events", ["AO2", "AO3"]),
          point("Applied 2.4.1(d)", "use conditional models to evaluate a real decision and its base-rate limitation", ["AO2", "AO3"]),
        ],
        aos: ["AO2", "AO3"],
      }),
      topic({
        slug: "differential-equations-context",
        title: "Differential equations in context",
        specRef: "Applied 2.4.5–2.4.6",
        difficulty: 5,
        summary:
          "Turning rates of change into separable differential equations, solving with an initial condition and checking what the resulting growth or decay model can and cannot claim.",
        keyPoints: [
          "Translate a statement about a rate into dy/dt = f(t,y); proportional growth gives dy/dt = ky and proportional decay gives dy/dt = −ky.",
          "For a separable equation, collect all y terms on one side, all t terms on the other, integrate both sides and use the initial condition to determine the constant.",
          "The solution y = Ae^{kt} has a time scale set by 1/|k|; interpret the sign, units and limiting behaviour before substituting values.",
          "A differential-equation model is conditional on its assumptions; compare predictions with observations and explain when saturation, a changing rate or an external input makes the model fail.",
        ],
        commonErrors: [
          "Integrating dy/dt as if y were constant or forgetting that the variables must be separated before integration.",
          "Using an initial condition to find A but not checking the sign and units of k.",
          "Extrapolating exponential growth indefinitely when the context has a finite resource or carrying capacity.",
        ],
        specPoints: [
          point("Applied 2.4.5(a)", "construct a first-order differential equation from a rate statement in context", ["AO2", "AO3"]),
          point("Applied 2.4.6(b)", "solve a separable differential equation using an initial condition", ["AO2"]),
          point("Applied 2.4.6(c)", "interpret growth decay constants units and limiting behaviour", ["AO2", "AO3"]),
          point("Applied 2.4.6(d)", "evaluate model assumptions and identify when a differential model breaks down", ["AO3"]),
        ],
        aos: ["AO2", "AO3"],
      }),
    ],
  },
];
