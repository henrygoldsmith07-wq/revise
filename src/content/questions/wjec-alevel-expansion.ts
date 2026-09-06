import type { AoCode } from "@/domain/types";
import { defineQuestions, type PartSpec, type QuestionSpec } from "./authoring";

type ExpansionPart = Omit<PartSpec, "specPointIds" | "learningClaims" | "aos"> & {
  claim: string;
  aos?: AoCode[];
};

function expansionQuestion(
  subjectId: string,
  topic: string,
  stem: string,
  parts: ExpansionPart[],
  difficulty: 1 | 2 | 3 | 4 | 5 = 4,
): QuestionSpec {
  return {
    slug: `wjec-alevel-expansion-${subjectId.replace("wjec-alevel-", "")}-${topic}`,
    subjectId,
    topics: [topic],
    kind: "structured",
    stem,
    difficulty,
    calculator: true,
    source: "authored",
    verification: "checked",
    reviewer: "authored/WJEC-2024-v1-expansion",
    lastChecked: "2026-08-01",
    specVersion: "2024-1.0",
    aos: ["AO1", "AO2", "AO3"],
    parts: parts.map((part, index) => ({
      ...part,
      aos: part.aos ?? ["AO2"],
      specPointIds: [`${subjectId}.${topic}.sp-${String(index + 1).padStart(2, "0")}`],
      learningClaims: [part.claim],
    })),
  };
}

const biology = "wjec-alevel-biology";
const chemistry = "wjec-alevel-chemistry";
const physics = "wjec-alevel-physics";
const maths = "wjec-alevel-maths";

const questions: QuestionSpec[] = [
  expansionQuestion(
    biology,
    "nutrition",
    "A student compares a herbivore, a carnivore and a plant growing with or without mycorrhizae. Use the evidence to explain how organisms obtain and absorb nutrients.",
    [
      { prompt: "Distinguish digestion, absorption and assimilation.", marks: 3, scheme: ["Digestion hydrolyses large insoluble molecules", "Absorption moves soluble products across an epithelium into blood or lymph", "Assimilation is use of absorbed molecules by cells"], answer: "Digestion is the hydrolysis of large insoluble molecules. Absorption is movement of the soluble products across the gut epithelium into blood or lymph. Assimilation is the use of those absorbed molecules by cells.", claim: "distinguish digestion absorption and assimilation", aos: ["AO1", "AO2"] },
      { prompt: "Explain two adaptations of a small-intestine villus that increase absorption.", marks: 3, scheme: ["Large surface area from villi and microvilli", "Thin epithelium gives a short diffusion path", "Capillaries and lacteals remove products and maintain gradients"], answer: "Villi and microvilli give a large surface area. The epithelium is thin, and capillaries and lacteals carry away absorbed products, maintaining steep concentration gradients.", claim: "relate villus structure to efficient absorption", aos: ["AO2"] },
      { prompt: "Explain why a herbivore can obtain energy from cellulose even though the animal does not produce cellulase.", marks: 3, scheme: ["Microorganisms in a specialised gut produce cellulase", "Cellulose is hydrolysed into soluble products", "The host absorbs and uses products while providing a habitat"], answer: "Microorganisms living in the herbivore's specialised gut secrete cellulase and hydrolyse cellulose. The animal absorbs and uses the products, while the microbes receive a stable habitat and food supply.", claim: "explain microbial cellulose digestion in herbivores", aos: ["AO1", "AO2"] },
      { prompt: "Explain how mycorrhizae can increase plant mineral uptake.", marks: 3, scheme: ["Fungal hyphae extend beyond the root surface", "They increase the soil volume explored and transport mineral ions to the root", "The plant supplies sugars to the fungus"], answer: "Fungal hyphae extend the absorbing surface beyond the root hairs and explore more soil, increasing mineral-ion uptake. The plant supplies the fungus with sugars, so the association is mutualistic.", claim: "explain the role of mycorrhizae in plant nutrition", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    biology,
    "microbiology",
    "A fermenter is sampled over 48 hours. The culture becomes cloudy, then product yield levels off. Explain how the culture is measured and controlled.",
    [
      { prompt: "Describe the four phases of a microbial growth curve and give one reason for the stationary phase.", marks: 4, scheme: ["Lag phase: cells adapt", "Exponential phase: rapid division", "Stationary phase: net population is constant", "Nutrient depletion or toxic waste limits growth"], answer: "During the lag phase cells adapt to the medium. They then divide rapidly in the exponential phase. In the stationary phase division is balanced by death because a nutrient becomes limiting or toxic waste accumulates; the death phase follows if conditions deteriorate further.", claim: "interpret microbial growth phases and limiting factors", aos: ["AO1", "AO2"] },
      { prompt: "Give two aseptic precautions and explain what each prevents.", marks: 3, scheme: ["Sterilise media and apparatus to kill unwanted organisms", "Flame or disinfect the vessel neck and work quickly", "Keep the culture closed to prevent airborne contamination"], answer: "Sterilise the medium and apparatus to remove competing organisms. Disinfect or flame the vessel neck and keep the vessel closed so airborne microbes cannot enter during transfer.", claim: "explain aseptic technique and contamination control", aos: ["AO1", "AO2"] },
      { prompt: "Explain why viable counts and optical density do not measure exactly the same quantity.", marks: 3, scheme: ["Viable counts count colonies formed by living cells", "Optical density measures light scattering or turbidity", "Dead cells can increase turbidity but cannot form colonies"], answer: "A viable count estimates living cells because each viable cell or clump forms a colony. Optical density measures turbidity from light scattering, so dead cells and debris can still increase the reading.", claim: "compare viable counts with optical-density growth measurements", aos: ["AO2", "AO3"] },
      { prompt: "Suggest two variables that should be controlled in a fermentation used to make a product.", marks: 3, scheme: ["Temperature and pH kept near the organism's optimum", "Substrate concentration, oxygen supply or mixing controlled", "Controls maximise product yield and reduce contamination or unwanted pathways"], answer: "Temperature and pH should be controlled near the organism's optimum, and substrate concentration, oxygen supply or mixing should be monitored. This keeps growth and product formation predictable and limits unwanted pathways or contamination.", claim: "select controls for an industrial fermentation", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    biology,
    "nervous-coordination",
    "A learner touches a hot surface and withdraws their hand before consciously describing the pain. Explain the electrical and synaptic stages.",
    [
      { prompt: "Explain how an action potential begins when threshold is reached.", marks: 3, scheme: ["Voltage-gated sodium channels open", "Sodium ions enter and depolarise the membrane", "The response is all-or-nothing once threshold is crossed"], answer: "When threshold is reached, voltage-gated sodium channels open and sodium ions enter. The membrane depolarises, producing an all-or-nothing action potential.", claim: "explain threshold and depolarisation", aos: ["AO1", "AO2"] },
      { prompt: "Explain how myelin and the refractory period help an impulse travel in one direction.", marks: 3, scheme: ["Depolarisation is regenerated at nodes of Ranvier", "The impulse jumps node to node by saltatory conduction", "The previous region is temporarily unresponsive during the refractory period"], answer: "In a myelinated axon, depolarisation is regenerated at the nodes of Ranvier, so the impulse jumps between nodes by saltatory conduction. The region behind it is refractory and cannot immediately fire again, enforcing one-way travel.", claim: "relate myelin and refractory period to impulse speed and direction", aos: ["AO1", "AO2"] },
      { prompt: "Describe transmission across a cholinergic synapse.", marks: 4, scheme: ["Calcium ions enter the presynaptic terminal", "Vesicles release neurotransmitter by exocytosis", "The transmitter diffuses and binds complementary receptors", "An ion channel opens and the signal is ended by breakdown or reuptake"], answer: "Arrival of an action potential opens calcium channels. Calcium causes vesicles to fuse with the presynaptic membrane and release neurotransmitter. It diffuses across the cleft, binds complementary receptors and opens ion channels; enzymes or reuptake then remove the transmitter.", claim: "describe synaptic transmission", aos: ["AO1", "AO2"] },
      { prompt: "Compare the speed and duration of a reflex response with a hormonal response.", marks: 3, scheme: ["Reflexes use neurones and synapses for rapid transmission", "Hormones travel in blood and are usually slower", "Hormonal effects are often longer-lasting and more widespread"], answer: "A reflex is rapid because impulses travel along neurones and a short reflex arc to an effector. Hormones are carried in blood, so the response is usually slower but can last longer and affect many tissues with receptors.", claim: "compare nervous and hormonal coordination", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    biology,
    "sexual-reproduction",
    "A fertility clinic monitors hormone concentrations across an ovarian cycle. Explain the changes and the events that follow fertilisation.",
    [
      { prompt: "Contrast spermatogenesis with oogenesis in terms of timing and products.", marks: 3, scheme: ["Both use meiosis to form haploid cells", "Spermatogenesis produces four functional sperm per primary cell", "Oogenesis produces one large ovum and polar bodies and is limited by a finite supply"], answer: "Both processes use meiosis to make haploid gametes. Spermatogenesis is continuous after puberty and produces four functional sperm from a primary cell. Oogenesis produces one large ovum plus polar bodies and draws on a finite supply of developing cells.", claim: "compare human gametogenesis", aos: ["AO1", "AO2"] },
      { prompt: "Explain how FSH, oestrogen, LH and progesterone coordinate ovulation.", marks: 4, scheme: ["FSH stimulates follicle development", "The growing follicle secretes oestrogen", "High oestrogen causes positive feedback and an LH surge", "LH triggers ovulation and the corpus luteum secretes progesterone"], answer: "FSH stimulates follicle growth, and the follicle releases oestrogen. Sustained high oestrogen switches to positive feedback on the pituitary and causes an LH surge. LH triggers ovulation; the corpus luteum then secretes progesterone to maintain the uterine lining.", claim: "explain hormonal control of the ovarian cycle", aos: ["AO1", "AO2"] },
      { prompt: "Describe implantation and one role of the placenta.", marks: 3, scheme: ["The blastocyst attaches to and embeds in the endometrium", "The placenta forms a large exchange surface", "Nutrients and oxygen cross without direct mixing of maternal and fetal blood"], answer: "The blastocyst attaches to and embeds in the endometrium. The placenta forms a large, thin exchange surface through which oxygen and nutrients pass to the fetus and wastes leave; the two blood supplies remain separated.", claim: "describe implantation and placental exchange", aos: ["AO1", "AO2"] },
      { prompt: "Explain how one contraceptive method prevents pregnancy and give one limitation.", marks: 3, scheme: ["Correct mechanism identified", "Mechanism prevents ovulation, sperm entry, fertilisation or implantation", "A limitation such as adherence, side effects or no STI protection"], answer: "The combined oral contraceptive pill supplies oestrogen and progesterone, maintaining negative feedback so FSH and LH do not produce ovulation. It requires reliable daily use and does not protect against sexually transmitted infections.", claim: "evaluate contraception in context", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    biology,
    "plant-reproduction",
    "A plant breeder wants to produce seed from a controlled cross and then germinate it reliably. Explain the stages.",
    [
      { prompt: "Relate two floral features to insect or wind pollination.", marks: 3, scheme: ["Insect-pollinated flowers advertise with colour scent or nectar and have sticky pollen", "Wind-pollinated flowers expose anthers and have light abundant pollen", "The stigma is positioned to intercept the appropriate pollen"], answer: "Insect-pollinated flowers often have colour, scent or nectar and produce sticky pollen so an insect transfers it. Wind-pollinated flowers expose anthers and feathery stigmas and release abundant, light pollen.", claim: "relate flower structure to pollination method", aos: ["AO1", "AO2"] },
      { prompt: "Describe pollen-tube growth from a compatible stigma to the ovule.", marks: 3, scheme: ["Pollen hydrates and germinates on the stigma", "A tube grows down the style through the transmitting tissue", "It enters the ovule through the micropyle and delivers sperm nuclei"], answer: "On a compatible stigma the pollen grain hydrates and germinates. Its pollen tube grows down the style, enters the ovule through the micropyle and carries the sperm nuclei to the embryo sac.", claim: "describe pollen germination and pollen-tube growth", aos: ["AO1", "AO2"] },
      { prompt: "Explain double fertilisation and identify the ploidy of the embryo and endosperm.", marks: 3, scheme: ["One sperm nucleus fuses with the egg", "A second sperm nucleus fuses with two polar nuclei", "The embryo is diploid and the endosperm is triploid"], answer: "One sperm nucleus fuses with the haploid egg to form a diploid zygote that becomes the embryo. The other fuses with two polar nuclei, producing triploid endosperm that nourishes the embryo.", claim: "explain double fertilisation and seed tissues", aos: ["AO1", "AO2"] },
      { prompt: "Explain why water, oxygen and a suitable temperature are needed for germination.", marks: 3, scheme: ["Water activates enzymes and swells the seed", "Oxygen is needed for aerobic respiration and ATP", "Temperature affects enzyme activity; the optimum supports rapid metabolism"], answer: "Water hydrates the seed and activates hydrolytic enzymes. Oxygen is needed for aerobic respiration and ATP production, while a suitable temperature allows the enzymes controlling mobilisation and growth to work effectively.", claim: "explain environmental requirements for germination", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    biology,
    "genetic-applications",
    "A laboratory compares DNA from a patient and a reference sample before considering a gene-therapy trial. Explain the techniques and safeguards.",
    [
      { prompt: "Outline one PCR cycle and explain why the target sequence increases exponentially.", marks: 4, scheme: ["Heat separates the DNA strands", "Primers anneal to complementary target sequences", "DNA polymerase extends primers with nucleotides", "Each product becomes a template in the next cycle"], answer: "Heating denatures the DNA strands. Cooling allows primers to anneal to complementary sequences, and DNA polymerase extends them using free nucleotides. Each new strand is a template in the next cycle, so the target approximately doubles per cycle while reagents are in excess.", claim: "explain PCR amplification", aos: ["AO1", "AO2"] },
      { prompt: "Explain how gel electrophoresis separates DNA fragments.", marks: 3, scheme: ["DNA is negatively charged", "It moves towards the positive electrode through the gel", "Shorter fragments experience less resistance and travel further"], answer: "DNA carries a negative charge and moves towards the positive electrode. The gel acts as a molecular sieve, so shorter fragments pass through its pores more easily and travel further than longer fragments.", claim: "explain DNA separation by gel electrophoresis", aos: ["AO1", "AO2"] },
      { prompt: "Describe how a restriction enzyme and ligase can make recombinant DNA.", marks: 3, scheme: ["Restriction enzyme cuts a vector and target DNA at a specific sequence", "Complementary sticky ends can base-pair", "Ligase forms covalent bonds to join the fragments"], answer: "A restriction enzyme cuts the vector and target gene at a specific recognition sequence, leaving compatible sticky ends. The ends base-pair and DNA ligase forms covalent bonds to make a recombinant DNA molecule.", claim: "describe recombinant DNA construction", aos: ["AO1", "AO2"] },
      { prompt: "Give two safeguards when offering genetic screening or gene therapy.", marks: 3, scheme: ["Explain validity, sensitivity and specificity and avoid treating a risk marker as certainty", "Obtain informed consent and protect privacy", "Assess off-target effects, access and whether the change is somatic or heritable"], answer: "A screening result must be explained with its sensitivity, specificity and uncertainty, so a risk marker is not presented as a diagnosis. The patient needs informed consent and privacy, and a therapy must be assessed for off-target effects, equitable access and whether changes are somatic or heritable.", claim: "evaluate safeguards and ethics in genetic applications", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    biology,
    "immunity-disease",
    "A vaccination programme reduces infections, but a resistant strain later spreads in a hospital ward. Explain the immune and evolutionary processes.",
    [
      { prompt: "Describe two non-specific defences and explain how they reduce infection.", marks: 3, scheme: ["Barrier such as skin or mucus prevents entry", "Cilia move trapped particles or lysozyme/acid destroys microbes", "Inflammation recruits immune cells and increases local response"], answer: "Skin and mucus form physical barriers that prevent pathogens entering tissues. Cilia move trapped particles out, while lysozyme or stomach acid can destroy microbes; inflammation then recruits phagocytes to an infected site.", claim: "describe non-specific defence", aos: ["AO1", "AO2"] },
      { prompt: "Explain clonal selection and the roles of plasma and memory cells.", marks: 4, scheme: ["An antigen selects a lymphocyte with complementary receptor", "The cell divides by mitosis", "Plasma cells secrete specific antibodies", "Memory cells remain for a faster secondary response"], answer: "An antigen binds to a lymphocyte with a complementary receptor, selecting it. The cell clones by mitosis; plasma cells secrete the specific antibody, while memory cells remain so a later exposure triggers a faster and larger response.", claim: "explain clonal selection and antibody production", aos: ["AO1", "AO2"] },
      { prompt: "Explain why a booster vaccination can protect a population as well as an individual.", marks: 3, scheme: ["Memory cells make the secondary response rapid and large", "Pathogen is removed before symptoms or onward transmission", "High coverage lowers the chance that a susceptible person is exposed"], answer: "A booster expands the memory-cell population, so antibody production is rapid and large after exposure. The pathogen may be removed before transmission, and high coverage reduces the number of susceptible hosts, creating herd protection.", claim: "explain secondary responses and herd immunity", aos: ["AO2", "AO3"] },
      { prompt: "Explain how antibiotic use selects resistance rather than causing bacteria to mutate deliberately.", marks: 3, scheme: ["Random variation means some bacteria already carry resistance", "Antibiotic kills susceptible bacteria", "Resistant bacteria survive, reproduce and pass the allele on"], answer: "Random mutation or gene transfer can mean some bacteria are resistant before treatment. The antibiotic removes susceptible bacteria, leaving resistant cells to reproduce and spread their allele; the population therefore becomes more resistant.", claim: "explain selection for antimicrobial resistance", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    biology,
    "musculoskeletal",
    "A sprinter accelerates, reaches top speed and then reports muscle fatigue. Use the sliding-filament and lever models to explain the movement.",
    [
      { prompt: "Explain how a sarcomere shortens during contraction.", marks: 4, scheme: ["Calcium exposes binding sites on actin", "Myosin heads form cross-bridges", "ATP-driven power strokes pull actin towards the M line", "Actin and myosin filaments do not themselves shorten"], answer: "An action potential releases calcium, which exposes binding sites on actin. Myosin heads form cross-bridges and use ATP for power strokes that pull actin towards the M line. The sarcomere shortens because the filaments slide; the filaments themselves do not shorten.", claim: "explain the sliding-filament mechanism", aos: ["AO1", "AO2"] },
      { prompt: "Explain the role of calcium and ATP in the cross-bridge cycle.", marks: 3, scheme: ["Calcium binds regulatory proteins and exposes actin", "ATP detaches a myosin head and is hydrolysed to re-cock it", "Repeated cycles continue while calcium and ATP are available"], answer: "Calcium binds to regulatory proteins and moves tropomyosin away from actin binding sites. ATP detaches the myosin head and its hydrolysis re-cocks it; repeated cycles continue while calcium and ATP are available.", claim: "relate calcium and ATP to neuromuscular contraction", aos: ["AO1", "AO2"] },
      { prompt: "Explain why a joint requires an antagonistic pair of muscles and how a bone acts as a lever.", marks: 3, scheme: ["Muscles can pull but not push", "One muscle contracts while the antagonist relaxes or lengthens", "The joint is the pivot and the muscle force acts through a moment arm"], answer: "A muscle can shorten and pull but cannot push, so a second muscle must oppose it to reverse the movement. The joint is the pivot, the bone is the lever and the muscle force acts at a distance from the pivot to create a moment.", claim: "apply antagonistic muscles and lever models", aos: ["AO2", "AO3"] },
      { prompt: "Explain why oxygen uptake remains high after intense exercise.", marks: 3, scheme: ["Anaerobic respiration supplied ATP rapidly and produced lactate", "Oxygen is needed to oxidise or remove lactate and restore stores", "Extra ventilation and circulation repay the oxygen debt"], answer: "During intense exercise anaerobic respiration supplies ATP quickly and lactate accumulates. After exercise, extra oxygen is needed to process lactate and restore ATP and oxygen stores, so ventilation and circulation remain elevated.", claim: "explain aerobic and anaerobic energy supply and recovery", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    biology,
    "neurobiology-behaviour",
    "Researchers compare a learned response in two species and test whether light shifts an activity rhythm. Explain how the evidence should be interpreted.",
    [
      { prompt: "Distinguish the roles of the central and peripheral nervous systems.", marks: 3, scheme: ["CNS consists of brain and spinal cord", "CNS integrates information and coordinates responses", "PNS carries sensory and motor signals between CNS and receptors or effectors"], answer: "The central nervous system is the brain and spinal cord and integrates information. The peripheral nervous system carries sensory information to the CNS and motor commands to muscles or glands.", claim: "describe nervous-system organisation", aos: ["AO1"] },
      { prompt: "Explain two ways a drug could increase the effect of a neurotransmitter.", marks: 3, scheme: ["Mimic the transmitter or activate its receptor", "Block reuptake or inhibit breakdown", "More transmitter remains or receptor activation lasts longer"], answer: "A drug could act as an agonist and bind the receptor, or inhibit reuptake or enzyme breakdown. In each case receptor activation lasts longer or occurs more often, increasing the postsynaptic effect.", claim: "explain how drugs alter synaptic transmission", aos: ["AO1", "AO2"] },
      { prompt: "Explain why a learned behaviour cannot automatically be described as non-biological.", marks: 3, scheme: ["Learning changes neural connections or response thresholds", "Genes and development influence the capacity to learn", "Environment and experience provide the specific stimulus"], answer: "A learned behaviour depends on experience, but learning changes neural connections and is constrained by development and genes. The behaviour therefore reflects an interaction between biological capacity and environmental experience.", claim: "evaluate innate and learned behaviour", aos: ["AO2", "AO3"] },
      { prompt: "How could an experiment test whether light is a zeitgeber for a circadian rhythm?", marks: 3, scheme: ["Measure the rhythm under a controlled light-dark cycle", "Shift or remove the light cue while controlling temperature and feeding", "A consistent phase shift or free-running period supports entrainment by light"], answer: "Record the activity rhythm under a normal light-dark cycle, then shift or remove the light cue while keeping temperature and feeding constant. A repeatable phase shift after the light change, or a free-running rhythm without it, provides evidence about light entrainment.", claim: "design a test of endogenous rhythms and entrainment", aos: ["AO2", "AO3"] },
    ],
  ),

  expansionQuestion(
    chemistry,
    "entropy-feasibility",
    "A reaction has ΔH° = −85 kJ mol⁻¹ and ΔS° = −120 J K⁻¹ mol⁻¹. Use thermodynamics to discuss its feasibility and rate.",
    [
      { prompt: "Predict the sign of ΔS° when two moles of gas form one mole of gas at constant temperature.", marks: 2, scheme: ["Particles and accessible arrangements decrease", "Entropy change is negative"], answer: "The number of gas particles falls from two moles to one, so matter is less dispersed and ΔS° is negative.", claim: "predict the sign of entropy change", aos: ["AO1", "AO2"] },
      { prompt: "Calculate ΔG° at 298 K, showing unit conversion.", marks: 3, scheme: ["Convert ΔS to −0.120 kJ K⁻¹ mol⁻¹", "Use ΔG = ΔH − TΔS", "ΔG = −85 − 298(−0.120) = −49.2 kJ mol⁻¹"], answer: "ΔS° = −120 J K⁻¹ mol⁻¹ = −0.120 kJ K⁻¹ mol⁻¹. ΔG° = −85 − 298(−0.120) = −49.2 kJ mol⁻¹.", claim: "calculate Gibbs free energy with consistent units", aos: ["AO2"] },
      { prompt: "State what the negative value of ΔG° means and one condition attached to that conclusion.", marks: 2, scheme: ["The forward reaction is feasible under standard conditions", "It does not mean completion or feasibility at every non-standard composition"], answer: "The negative ΔG° indicates that the forward reaction is thermodynamically feasible under standard conditions. It does not guarantee completion or the same direction at every non-standard concentration or pressure.", claim: "interpret Gibbs free energy and standard-state limits", aos: ["AO2", "AO3"] },
      { prompt: "Explain why a catalyst can make this reaction faster without changing ΔG° or the equilibrium composition.", marks: 3, scheme: ["Catalyst provides a lower-activation-energy pathway", "It speeds forward and reverse reactions", "Thermodynamic energy difference and equilibrium position are unchanged"], answer: "A catalyst provides an alternative pathway with lower activation energy, so more collisions are successful per second. It speeds the forward and reverse reactions and therefore does not change ΔG° or the equilibrium composition.", claim: "distinguish feasibility rate and equilibrium", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    chemistry,
    "p-block",
    "A student compares period-three elements and their oxides. Explain the periodic and structural trends rather than just listing them.",
    [
      { prompt: "Explain the general trend in atomic radius and first ionisation energy across a period.", marks: 3, scheme: ["Nuclear charge increases", "Electrons enter the same principal shell with similar shielding", "Radius generally decreases and ionisation energy increases"], answer: "Across the period nuclear charge increases while added electrons enter the same principal shell, so shielding changes little. The stronger attraction draws the outer shell closer and generally raises first ionisation energy while decreasing radius.", claim: "explain p-block radius and ionisation trends", aos: ["AO1", "AO2"] },
      { prompt: "Explain why a period-three oxide can change from basic to acidic across the period.", marks: 3, scheme: ["Bonding changes from ionic to covalent", "Ionic oxides form alkaline solutions or react with acids", "Covalent oxides form acidic solutions or react with bases"], answer: "The bonding becomes less ionic and more covalent across the period. Ionic oxides such as sodium oxide form alkaline solutions or react with acids, whereas covalent oxides form acidic solutions or react with bases.", claim: "relate oxide acid-base behaviour to bonding", aos: ["AO2", "AO3"] },
      { prompt: "Use oxidation numbers to explain what disproportionation means.", marks: 2, scheme: ["The same element is oxidised and reduced in one reaction", "Its oxidation number increases in one product and decreases in another"], answer: "Disproportionation is a redox reaction in which the same element is both oxidised and reduced. Its oxidation number rises in one product and falls in another.", claim: "analyse p-block disproportionation using oxidation numbers", aos: ["AO1", "AO2"] },
      { prompt: "Explain why a giant covalent p-block substance has a high melting point but may not conduct electricity.", marks: 3, scheme: ["Many strong covalent bonds require a lot of energy to break", "There are no mobile ions or delocalised electrons", "So it is a poor conductor unless a structure has mobile charge carriers"], answer: "A giant covalent lattice has many strong covalent bonds, so melting requires a large energy input. Its electrons are localised in bonds and it has no mobile ions, so it generally does not conduct electricity.", claim: "relate p-block structure to physical properties", aos: ["AO1", "AO2"] },
    ],
  ),
  expansionQuestion(
    chemistry,
    "stereoisomerism",
    "An organic synthesis produces two compounds with the same structural formula but different three-dimensional arrangements. Explain the stereochemistry.",
    [
      { prompt: "State the conditions needed for E/Z isomerism at a C=C bond.", marks: 2, scheme: ["Rotation about the double bond is restricted", "Each carbon has two different groups attached"], answer: "Rotation must be restricted by the C=C bond, and each carbon of the double bond must have two different groups attached.", claim: "identify conditions for E/Z isomerism", aos: ["AO1"] },
      { prompt: "Explain how to assign E or Z using priority.", marks: 3, scheme: ["Assign higher priority on each alkene carbon by atomic number", "Compare the two higher-priority groups", "Same side is Z and opposite sides are E"], answer: "On each alkene carbon assign priority to the attached atoms using atomic number. If the two higher-priority groups are on the same side the isomer is Z; if they are on opposite sides it is E.", claim: "assign E/Z stereoisomers", aos: ["AO1", "AO2"] },
      { prompt: "What makes a carbon atom chiral, and what is an enantiomer?", marks: 3, scheme: ["A chiral carbon is attached to four different groups", "It has no plane of symmetry in that local arrangement", "Enantiomers are non-superimposable mirror images"], answer: "A tetrahedral carbon is chiral when it is attached to four different groups. The resulting pair of non-superimposable mirror images are enantiomers.", claim: "identify chiral centres and enantiomers", aos: ["AO1", "AO2"] },
      { prompt: "Explain why a racemic mixture has no net optical rotation and why stereochemistry matters in medicines.", marks: 3, scheme: ["Equal enantiomers rotate plane-polarised light in opposite directions", "The rotations cancel", "Different enantiomers can bind differently to biological targets"], answer: "A racemic mixture contains equal amounts of enantiomers whose rotations are equal and opposite, so the net rotation is zero. Biological targets are three-dimensional, so one enantiomer may bind more effectively or safely than the other.", claim: "evaluate racemic mixtures and pharmaceutical stereochemistry", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    chemistry,
    "amino-acids-proteins",
    "A peptide is hydrolysed and the products are separated by chromatography. Explain the chemistry of the molecule and the evidence.",
    [
      { prompt: "Explain why an amino acid can form a zwitterion in the solid state.", marks: 2, scheme: ["The carboxyl group donates a proton", "The amino group accepts it, giving NH3+ and COO− in the same molecule"], answer: "A proton transfers from the carboxyl group to the amino group, producing an internal NH₃⁺ and COO⁻. The molecule is therefore a zwitterion with both charges present.", claim: "explain zwitterion formation", aos: ["AO1", "AO2"] },
      { prompt: "Describe peptide-bond formation between two amino acids.", marks: 3, scheme: ["The amino group reacts with a carboxyl group", "Condensation removes water", "A C–N peptide bond forms"], answer: "The amino group of one amino acid reacts with the carboxyl group of another. A molecule of water is eliminated and a C–N peptide bond forms between the residues.", claim: "describe peptide formation", aos: ["AO1"] },
      { prompt: "Link primary structure to tertiary structure in a protein.", marks: 3, scheme: ["Primary structure is the amino-acid sequence", "The sequence determines which side chains are near each other", "Hydrogen bonds ionic interactions disulfide bridges and hydrophobic forces fold the chain"], answer: "Primary structure is the sequence of amino acids. That sequence determines which side chains can interact, so hydrogen bonds, ionic attractions, disulfide bridges and hydrophobic interactions produce the tertiary fold.", claim: "relate amino-acid sequence to protein structure", aos: ["AO1", "AO2"] },
      { prompt: "Explain how chromatography could support the identity of a hydrolysis product.", marks: 3, scheme: ["Run the unknown alongside known standards", "Compare positions or Rf values under the same solvent", "Agreement supports but does not alone prove identity; controls and conditions matter"], answer: "Run the hydrolysate beside known amino-acid standards in the same solvent. Matching spots or Rf values support an identification, but the conclusion also depends on controls and reproducible conditions because different substances can have similar Rf values.", claim: "interpret chromatographic evidence for amino acids", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    chemistry,
    "organic-synthesis",
    "Plan a route from a primary alcohol to a purified carboxylic acid and then evaluate whether the product is the expected compound.",
    [
      { prompt: "Describe a retrosynthetic decision for making a carboxylic acid from a primary alcohol.", marks: 2, scheme: ["Recognise oxidation of a primary alcohol gives an aldehyde then acid", "Choose the oxidation step as the final functional-group change"], answer: "Work backwards from the carboxylic acid to a primary alcohol: the key functional-group change is oxidation, via an aldehyde intermediate. The alcohol is therefore a suitable precursor.", claim: "plan a retrosynthetic functional-group change", aos: ["AO2", "AO3"] },
      { prompt: "State conditions that favour obtaining the carboxylic acid rather than the aldehyde.", marks: 3, scheme: ["Use an oxidising agent such as acidified dichromate", "Heat under reflux", "Reflux prevents the volatile aldehyde being removed before further oxidation"], answer: "Use an oxidising agent such as acidified dichromate and heat under reflux. Reflux condenses the volatile aldehyde back into the flask, allowing oxidation to continue to the carboxylic acid.", claim: "select reagents and conditions for a synthesis", aos: ["AO1", "AO2"] },
      { prompt: "Give a suitable purification sequence for the acid product.", marks: 3, scheme: ["Cool or dilute and remove insoluble impurities by filtration", "Separate or wash the product and dry it", "Use distillation or recrystallisation as appropriate and check purity"], answer: "After the reaction, cool or dilute the mixture and remove insoluble material by filtration. Separate and wash the product, dry it, then distil or recrystallise as appropriate; check purity by a physical constant or spectrum.", claim: "choose separation and purification methods", aos: ["AO2", "AO3"] },
      { prompt: "Why is percentage yield alone not enough to validate the synthesis?", marks: 3, scheme: ["A high yield can include impurities or side products", "Atom economy measures how much reactant becomes desired product", "Spectroscopy or melting point provides identity and purity evidence"], answer: "A high percentage yield only compares the isolated mass with the theoretical mass and may include impurities. Atom economy considers waste in the equation, while IR, NMR, mass spectrometry or melting point checks whether the desired pure compound was made.", claim: "evaluate yield atom economy and analytical evidence", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    chemistry,
    "practical-analysis",
    "A student plans a titration and calorimetry investigation and must report a defensible result with uncertainty.",
    [
      { prompt: "Identify the independent, dependent and one controlled variable in a titration investigation.", marks: 3, scheme: ["Independent variable is the chosen solution or concentration being changed", "Dependent variable is titre or measured volume at the endpoint", "Control apparatus, temperature, indicator or sample volume"], answer: "For example, the concentration of the unknown solution is the independent variable, the titre volume at the endpoint is the dependent measurement, and the pipetted sample volume or temperature is controlled.", claim: "identify variables in a safe investigation", aos: ["AO2", "AO3"] },
      { prompt: "Explain why repeat concordant titres improve precision but do not remove a systematic error.", marks: 3, scheme: ["Repeats reveal random scatter and allow a mean", "Concordant titres show repeatability", "A calibration or endpoint bias shifts every reading in the same direction"], answer: "Repeats reveal random variation, and concordant titres show that the endpoint can be reproduced so a mean is more precise. A systematic error such as a miscalibrated burette affects every reading similarly and is not removed by averaging.", claim: "evaluate random and systematic uncertainty", aos: ["AO2", "AO3"] },
      { prompt: "Give two changes that make a simple calorimetry result more valid.", marks: 2, scheme: ["Insulate or use a lid to reduce heat loss", "Stir and measure temperature with calibrated equipment", "Use a measured mass and record a clear maximum or minimum"], answer: "Use an insulated container with a lid to reduce heat loss, and stir while measuring temperature with calibrated equipment. A measured mass and a clear temperature maximum or minimum make the energy calculation more valid.", claim: "improve calorimetry validity and precision", aos: ["AO1", "AO2"] },
      { prompt: "How would you combine an IR spectrum and an Rf value when identifying an unknown?", marks: 3, scheme: ["Use IR absorptions to identify functional groups", "Compare the Rf with a known standard under the same solvent conditions", "Agreement from independent evidence strengthens the conclusion"], answer: "Use the IR spectrum to identify functional groups such as O–H or C=O. Compare the Rf with a known standard run in the same solvent and conditions. Agreement between the independent results supports the proposed identity more strongly than either result alone.", claim: "combine chromatographic and spectroscopic evidence", aos: ["AO2", "AO3"] },
    ],
  ),

  expansionQuestion(
    physics,
    "capacitance",
    "A 470 μF capacitor is charged through a resistor and then used to deliver energy to a pulse circuit. Analyse its behaviour.",
    [
      { prompt: "Define capacitance and state one geometrical change that increases a parallel-plate capacitor's capacitance.", marks: 2, scheme: ["C = Q/V", "Increase plate area or reduce plate separation"], answer: "Capacitance is charge stored per unit potential difference, C = Q/V. Increasing plate area or reducing the separation increases capacitance.", claim: "define capacitance and explain a geometrical factor", aos: ["AO1", "AO2"] },
      { prompt: "Calculate the energy stored at 12.0 V.", marks: 2, scheme: ["Use E = ½CV²", "E = 0.5 × 470 × 10⁻⁶ × 12² = 0.0338 J"], answer: "E = ½CV² = 0.5 × 470 × 10⁻⁶ × 12.0² = 3.38 × 10⁻² J.", claim: "calculate capacitor energy", aos: ["AO2"] },
      { prompt: "State the equivalent capacitance rules for two capacitors in series and in parallel.", marks: 2, scheme: ["Series: 1/Ctotal = 1/C1 + 1/C2", "Parallel: Ctotal = C1 + C2"], answer: "For series capacitors, 1/Ctotal = 1/C1 + 1/C2. For parallel capacitors, Ctotal = C1 + C2.", claim: "calculate equivalent capacitance", aos: ["AO1", "AO2"] },
      { prompt: "What fraction of the final charge remains after one time constant during discharge?", marks: 2, scheme: ["Discharge follows Q = Q0e^(−t/RC)", "At t = RC, Q/Q0 = e⁻¹ ≈ 0.37"], answer: "The charge is Q = Q₀e^(−t/RC). At one time constant, t = RC, so Q/Q₀ = e⁻¹ ≈ 0.37: about 37% remains.", claim: "interpret an RC discharge using the time constant", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    physics,
    "alternating-currents",
    "A transformer supplies an AC load from a sinusoidal source. Explain rms values, phase and the conditions for resonance.",
    [
      { prompt: "A sinusoidal supply has a peak voltage of 340 V. Calculate its rms voltage.", marks: 2, scheme: ["Use Vrms = V0/√2", "Vrms = 340/√2 = 240 V"], answer: "Vᵣₘₛ = V₀/√2 = 340/√2 = 240 V.", claim: "use rms and peak values", aos: ["AO2"] },
      { prompt: "State how capacitive and inductive reactance change when frequency increases.", marks: 2, scheme: ["Capacitive reactance decreases with frequency", "Inductive reactance increases with frequency"], answer: "Capacitive reactance Xc = 1/(2πfC) decreases as frequency increases, whereas inductive reactance XL = 2πfL increases.", claim: "explain frequency-dependent reactance", aos: ["AO1", "AO2"] },
      { prompt: "Explain why stepping up voltage reduces transmission losses for a fixed power.", marks: 3, scheme: ["P = VI, so higher V means lower I for the same P", "Cable loss is I²R", "Lower current reduces heating loss"], answer: "For fixed transmitted power P = VI, stepping up V reduces I. The power lost in the cables is I²R, so the lower current greatly reduces heating loss.", claim: "apply transformer ratios to power transmission", aos: ["AO2", "AO3"] },
      { prompt: "What is the condition for resonance in a series RLC circuit, and what happens to current?", marks: 2, scheme: ["Inductive and capacitive reactances are equal", "Net reactance is zero, impedance is minimum and current is maximum"], answer: "Resonance occurs when XL = XC. The net reactance is then zero, so impedance is minimum and current is maximum for a fixed supply voltage.", claim: "explain resonance in an AC circuit", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    physics,
    "medical-physics",
    "A hospital chooses between X-ray CT, ultrasound, MRI and a radionuclide scan for different diagnostic questions.",
    [
      { prompt: "Explain why bone and soft tissue can have different contrast in an X-ray image.", marks: 3, scheme: ["X-rays are attenuated by absorption and scattering", "Attenuation depends on thickness, density and atomic number", "Different transmitted intensities create image contrast"], answer: "X-rays are attenuated by absorption and scattering. Tissues with different thickness, density and atomic number remove different fractions of the beam, so the transmitted intensity differs and produces contrast.", claim: "explain X-ray attenuation and contrast", aos: ["AO1", "AO2"] },
      { prompt: "Explain how an ultrasound scanner can determine the depth of a boundary.", marks: 3, scheme: ["A pulse reflects at a change in acoustic impedance", "Measure the echo time", "Depth = speed × time/2 because the pulse travels out and back"], answer: "A pulse reflects when it reaches a boundary with a different acoustic impedance. Measuring the echo time gives the round-trip distance, so depth = speed × time/2.", claim: "explain ultrasound time-of-flight imaging", aos: ["AO1", "AO2"] },
      { prompt: "State the role of a strong magnetic field and radiofrequency pulse in MRI.", marks: 3, scheme: ["Hydrogen nuclei align or precess in the strong field", "RF pulse changes their energy state", "Relaxation signals are detected and gradients encode position"], answer: "Hydrogen nuclei precess in the strong magnetic field. A radiofrequency pulse changes their energy state; as they relax they emit signals, and magnetic-field gradients encode the signal position and tissue contrast.", claim: "describe MRI signal formation", aos: ["AO1", "AO2"] },
      { prompt: "Give two factors that affect the choice of a radionuclide tracer.", marks: 3, scheme: ["Half-life should be long enough for imaging but short enough to limit dose", "Radiation must be detectable and the tracer target the required tissue", "Shielding and patient benefit must be considered"], answer: "The half-life should allow the scan but be short enough to limit dose, and the emitted radiation must be detectable. The tracer should target the required tissue, with shielding and diagnostic benefit weighed against risk.", claim: "evaluate radionuclide imaging and safety", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    physics,
    "sports-physics",
    "A coach analyses a jump, a landing and a ball striking a racket. Use mechanics and fluid ideas to evaluate performance and safety.",
    [
      { prompt: "Explain why horizontal and vertical projectile components can be analysed separately in a simple model.", marks: 3, scheme: ["Gravity acts vertically", "Horizontal acceleration is zero when drag is neglected", "Both components share the same time"], answer: "In the simple model gravity acts vertically and horizontal acceleration is zero, so the components can be solved independently. They are linked by the same time of flight.", claim: "model projectile motion", aos: ["AO2", "AO3"] },
      { prompt: "Explain how moving the centre of mass changes the moment required at a joint.", marks: 3, scheme: ["Moment equals force times perpendicular distance", "Moving the mass changes the distance from the joint", "A larger distance requires a larger balancing muscle force"], answer: "The moment about the joint is force multiplied by perpendicular distance. Moving the centre of mass farther from the joint increases that distance, so a larger muscle force or counter-moment is needed for balance.", claim: "apply centre-of-mass and moment ideas", aos: ["AO2", "AO3"] },
      { prompt: "Why does a landing mat reduce the average force for the same change in momentum?", marks: 2, scheme: ["Impulse equals change in momentum", "Increasing contact time reduces F = Δp/Δt"], answer: "The change in momentum is fixed by the landing. A mat increases the contact time, so the average force F = Δp/Δt is reduced.", claim: "use impulse to analyse protective equipment", aos: ["AO2"] },
      { prompt: "Give two variables that affect drag and explain how experimental data could test their effect.", marks: 3, scheme: ["Speed, area, shape or fluid density affects drag", "Change one variable while controlling the others", "Measure force or terminal speed and compare a graph or fitted relationship"], answer: "Drag depends on variables such as speed, frontal area, shape and fluid density. Change one variable while controlling the others, measure drag force or terminal speed, and use a graph to test the relationship.", claim: "relate drag variables to sporting performance", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    physics,
    "energy-environment",
    "An energy planner compares a wind farm, a gas station and battery storage over a full life cycle. Evaluate the evidence.",
    [
      { prompt: "Distinguish efficiency, power and capacity factor.", marks: 3, scheme: ["Efficiency is useful output energy/input energy", "Power is rate of energy transfer", "Capacity factor compares average output with maximum possible output"], answer: "Efficiency is useful output energy divided by input energy. Power is the rate of energy transfer, measured in watts. Capacity factor is average output divided by the maximum possible output over a period.", claim: "compare energy-resource metrics", aos: ["AO1", "AO2"] },
      { prompt: "Explain the greenhouse effect using infrared radiation.", marks: 3, scheme: ["The surface emits infrared radiation", "Greenhouse gases absorb and re-emit some infrared", "The net effect reduces the rate of energy escaping to space and warms the lower atmosphere"], answer: "The warmed surface emits infrared radiation. Greenhouse gases absorb and re-emit some of it in all directions, reducing the rate at which energy escapes to space and raising the equilibrium temperature of the lower atmosphere.", claim: "explain the greenhouse effect", aos: ["AO1", "AO2"] },
      { prompt: "State one energy and one power constraint on battery storage.", marks: 2, scheme: ["Energy capacity limits how long the store can supply a load", "Power rating limits the rate at which it can charge or discharge"], answer: "The energy capacity determines how long the store can supply a load. Its power rating limits how quickly it can charge or discharge, so a large-energy store may not provide a large peak power.", claim: "evaluate energy storage constraints", aos: ["AO2", "AO3"] },
      { prompt: "Why should a life-cycle comparison include uncertainty rather than one emissions number?", marks: 3, scheme: ["Construction, fuel, operation and disposal contribute different amounts", "Data and future assumptions are uncertain", "Ranges show whether an apparent ranking is robust"], answer: "Construction, fuel extraction, operation and disposal all contribute and may be estimated with different data. Showing a range or uncertainty reveals whether the ranking remains robust instead of implying a false precision.", claim: "use life-cycle analysis and uncertainty", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    physics,
    "practical-investigations",
    "A student investigates how the period of a pendulum depends on length and must justify the graph and conclusion.",
    [
      { prompt: "Identify the independent, dependent and two controlled variables.", marks: 3, scheme: ["Independent variable is length", "Dependent variable is period measured from repeated oscillations", "Control mass and amplitude or use the same apparatus and timing method"], answer: "Length is the independent variable and the period is the dependent measurement, found from the time for several oscillations. Keep the mass, small amplitude, pivot and timing method controlled.", claim: "plan a physics investigation", aos: ["AO2", "AO3"] },
      { prompt: "Why do repeats reduce random uncertainty but not a systematic timing offset?", marks: 2, scheme: ["Averaging reduces random scatter", "A consistent reaction-time or calibration offset remains in every result"], answer: "Repeating and averaging reduce random scatter. A consistent timing or calibration offset is systematic and remains in every measurement, so it needs correction or a different method.", claim: "distinguish random and systematic uncertainty", aos: ["AO1", "AO2"] },
      { prompt: "Which graph would linearise T = 2π√(L/g), and what does its gradient represent?", marks: 3, scheme: ["Square both sides: T² = (4π²/g)L", "Plot T² against L", "Gradient is 4π²/g"], answer: "Squaring gives T² = (4π²/g)L. Plot T² on the vertical axis against L on the horizontal axis; the gradient is 4π²/g, so g = 4π²/gradient.", claim: "linearise a physics relationship and interpret a gradient", aos: ["AO2", "AO3"] },
      { prompt: "Give one evidence-based improvement if the graph has large scatter at short lengths.", marks: 2, scheme: ["Time more oscillations or use a light gate/video method", "This reduces reaction-time uncertainty or improves repeatability"], answer: "Time a larger number of oscillations or use a light gate or video analysis. The measured interval is larger relative to reaction-time uncertainty, so the calculated period becomes more repeatable.", claim: "evaluate an investigation with a targeted improvement", aos: ["AO2", "AO3"] },
    ],
  ),

  expansionQuestion(
    maths,
    "poisson-uniform",
    "A help desk receives an average of 3.2 calls per hour. Model the number of calls and justify the distribution you use.",
    [
      { prompt: "State two assumptions needed for a Poisson model.", marks: 2, scheme: ["Events occur independently", "The mean rate is constant over equal intervals"], answer: "Calls should occur independently and at a constant mean rate over equal intervals. The model also treats events as counts in a fixed interval.", claim: "identify assumptions for a Poisson model", aos: ["AO1", "AO3"] },
      { prompt: "Calculate the probability of exactly two calls in one hour.", marks: 2, scheme: ["Use P(X=r)=e^−λλ^r/r! with λ=3.2 and r=2", "P(X=2)=0.208 (3 s.f.)"], answer: "P(X=2) = e⁻³·²(3.2)²/2! = 0.208 to 3 significant figures.", claim: "calculate a Poisson probability", aos: ["AO2"] },
      { prompt: "If X is the number of calls in a 30-minute interval, what parameter should be used?", marks: 2, scheme: ["Half the time interval halves the mean", "λ = 1.6"], answer: "Thirty minutes is half an hour, so the mean is halved: X ~ Poisson(1.6).", claim: "scale a Poisson parameter to a new interval", aos: ["AO2"] },
      { prompt: "When would a discrete uniform model be more appropriate than Poisson?", marks: 2, scheme: ["Outcomes are a finite list of equally likely integer values", "There is no event-rate process or unequal probabilities"], answer: "A discrete uniform model is appropriate when a finite set of integer outcomes is equally likely, such as a fair die. It would not be appropriate for event counts with a rate and independent arrivals.", claim: "choose between discrete distribution models", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    maths,
    "inference-errors",
    "A manufacturer claims that more than 60% of customers prefer a new design. A sample is used to test the claim at the 5% level.",
    [
      { prompt: "State suitable null and alternative hypotheses for p, the population preference proportion.", marks: 2, scheme: ["H0: p=0.60", "H1: p>0.60"], answer: "H₀: p = 0.60. H₁: p > 0.60, because the claim is directional.", claim: "state hypotheses for a one-tailed proportion test", aos: ["AO1", "AO2"] },
      { prompt: "Explain where the 5% significance level lies in this test.", marks: 2, scheme: ["It is the probability of rejecting H0 when H0 is true", "For a one-tailed test it lies in the upper tail"], answer: "The 5% significance level is the probability of rejecting H₀ when H₀ is true. Because H₁ is p > 0.60, the critical region is in the upper tail.", claim: "interpret significance and a critical region", aos: ["AO1", "AO2"] },
      { prompt: "Define a Type I and a Type II error in this context.", marks: 2, scheme: ["Type I: reject a true claim p=0.60", "Type II: fail to reject p=0.60 when the true preference exceeds 0.60"], answer: "A Type I error rejects H₀ when p really is 0.60, so the company claims evidence for improvement when there is none. A Type II error fails to reject H₀ when the true proportion is greater than 0.60.", claim: "interpret Type I and Type II errors", aos: ["AO2", "AO3"] },
      { prompt: "Write the conclusion if the p-value is 0.083.", marks: 2, scheme: ["0.083 > 0.05, so do not reject H0", "There is insufficient evidence that more than 60% prefer the new design"], answer: "Since 0.083 is greater than 0.05, there is insufficient evidence to reject H₀. The sample does not provide strong enough evidence that more than 60% of customers prefer the new design.", claim: "write a contextual hypothesis-test conclusion", aos: ["AO3"] },
    ],
  ),
  expansionQuestion(
    maths,
    "continuous-distributions",
    "The mass of a component is modelled by a continuous distribution. Use standardisation and model checks to answer the questions.",
    [
      { prompt: "For X uniform on [10,18], calculate P(12≤X≤15).", marks: 2, scheme: ["Use interval length over total length", "P = (15−12)/(18−10) = 3/8"], answer: "P(12 ≤ X ≤ 15) = (15−12)/(18−10) = 3/8 = 0.375.", claim: "use a continuous uniform model", aos: ["AO2"] },
      { prompt: "If X ~ N(72, 6²), standardise X=81.", marks: 1, scheme: ["z=(81−72)/6=1.5"], answer: "z = (81 − 72)/6 = 1.5.", claim: "standardise a Normal variable", aos: ["AO2"] },
      { prompt: "A value is at the 90th percentile of N(72,6²). Explain how to find the value.", marks: 2, scheme: ["Find z with Φ(z)=0.90, about 1.282", "Return to original units x=72+1.282(6)=79.7"], answer: "Use the inverse Normal function to find z with Φ(z)=0.90, giving z ≈ 1.282. Then x = 72 + 1.282×6 ≈ 79.7.", claim: "use inverse Normal calculations", aos: ["AO2"] },
      { prompt: "Give one reason a Normal model might be unsuitable for a bounded, strongly skewed measurement.", marks: 2, scheme: ["Normal distribution is continuous and symmetric", "A bound or skew produces probabilities the model cannot represent well"], answer: "A Normal model is continuous and symmetric, whereas a bounded, strongly skewed measurement is not. It may assign too much probability to impossible values or misrepresent a tail, so another model or transformation may be needed.", claim: "critique a continuous distribution model", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    maths,
    "correlation-tests",
    "A researcher tests whether study time is linearly associated with a population outcome and separately tests a Normal population mean.",
    [
      { prompt: "Interpret r = −0.82 without claiming causation.", marks: 2, scheme: ["Strong negative linear association", "It does not prove that one variable causes the other"], answer: "The sample shows a strong negative linear association: larger study time is associated with a lower measured outcome in this dataset. It does not by itself prove causation.", claim: "interpret a correlation coefficient", aos: ["AO2"] },
      { prompt: "State suitable hypotheses for a test of negative population correlation.", marks: 2, scheme: ["H0: ρ=0", "H1: ρ<0"], answer: "H₀: ρ = 0, meaning no population linear correlation. H₁: ρ < 0, because the research question predicts a negative correlation.", claim: "state hypotheses about population correlation", aos: ["AO1", "AO2"] },
      { prompt: "If X̄ is based on n observations from N(μ,σ²), state the distribution of X̄.", marks: 2, scheme: ["Mean is μ", "Variance is σ²/n, so Xbar ~ N(μ, σ²/n)"], answer: "The sample mean has distribution X̄ ~ N(μ, σ²/n), so its standard deviation is σ/√n.", claim: "use the sampling distribution of a Normal mean", aos: ["AO1", "AO2"] },
      { prompt: "Why should a statistically significant correlation still be discussed cautiously?", marks: 2, scheme: ["Significance addresses evidence against ρ=0, not effect size or causation", "Confounding, sampling and practical importance remain"], answer: "Statistical significance tests evidence against ρ = 0; it does not establish a causal mechanism or practical importance. Confounding variables, sampling bias and the size of the effect still need discussion.", claim: "evaluate statistical versus practical significance", aos: ["AO3"] },
    ],
  ),
  expansionQuestion(
    maths,
    "modelling-assumptions",
    "A school models the number of revision questions completed each week and compares the prediction with observed data.",
    [
      { prompt: "Give two things that should be defined before constructing the model.", marks: 2, scheme: ["Define the variables and their units", "State the quantity or relationship to be predicted"], answer: "Define each variable with a unit and state the quantity to be predicted, such as completed questions per week or the rate of change of that quantity.", claim: "translate a context into variables and units", aos: ["AO2", "AO3"] },
      { prompt: "State one simplifying assumption and explain how it enters the model.", marks: 2, scheme: ["Example: constant rate or independent weeks", "The assumption permits a fixed parameter or repeated probability in the equation"], answer: "For example, assume the average completion rate is constant over the period. That allows one fixed rate parameter to be used rather than a separate value for every week.", claim: "state and apply a modelling assumption", aos: ["AO2", "AO3"] },
      { prompt: "The model predicts −4 completed questions for a week. What should the student do?", marks: 2, scheme: ["Reject the value as impossible in context", "Check sign convention, equation, domain or assumptions"], answer: "A negative number of completed questions is impossible, so it should be rejected. Check the sign convention, algebra, domain and assumptions before reporting a corrected interpretation.", claim: "interpret and reject impossible model solutions", aos: ["AO3"] },
      { prompt: "How could residuals reveal that the model is inadequate?", marks: 2, scheme: ["Plot residuals against the explanatory variable or time", "A systematic pattern indicates missing structure rather than random error"], answer: "Plot residuals against the explanatory variable or time. A systematic curve, trend or changing spread suggests the model misses structure; random scatter around zero would support it more strongly.", claim: "validate a model against data", aos: ["AO3"] },
    ],
  ),
  expansionQuestion(
    maths,
    "moments-statics",
    "A uniform beam is supported at two points and carries a load away from its centre. Determine whether the system remains in equilibrium.",
    [
      { prompt: "Define the moment of a force about a point.", marks: 2, scheme: ["Moment = force × perpendicular distance", "State a clockwise or anticlockwise sign convention"], answer: "The moment about a point is the force multiplied by the perpendicular distance from that point to the line of action of the force. A consistent clockwise or anticlockwise sign convention is required.", claim: "calculate a moment using perpendicular distance", aos: ["AO1", "AO2"] },
      { prompt: "State the two equilibrium conditions for a rigid body.", marks: 2, scheme: ["Resultant force is zero", "Resultant moment about any point is zero"], answer: "For equilibrium the vector resultant force is zero and the resultant moment about any point is zero.", claim: "apply force and moment equilibrium", aos: ["AO1", "AO2"] },
      { prompt: "Explain why taking moments about a support can simplify the calculation of the other reaction.", marks: 2, scheme: ["The support reaction at the chosen pivot has zero perpendicular distance", "Its moment therefore vanishes from the equation"], answer: "If the support is chosen as the pivot, its reaction acts through the pivot and has zero perpendicular distance. Its moment is therefore zero, leaving an equation involving the other forces and the unknown reaction.", claim: "choose a convenient pivot for moments", aos: ["AO2", "AO3"] },
      { prompt: "What condition indicates that a loaded object is about to tip?", marks: 2, scheme: ["The line of action of the weight reaches the edge of the support base", "The contact reaction shifts to the edge and any further shift causes rotation"], answer: "The object is about to tip when the line of action of its weight reaches the edge of the support base. The reaction is then effectively at that edge, and any further shift creates a turning moment.", claim: "analyse stability and tipping", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    biology,
    "human-impact",
    "A river catchment has lost woodland, receives fertiliser runoff and contains a declining salmon population. Use the evidence to evaluate the causes and a conservation plan.",
    [
      { prompt: "Explain how habitat fragmentation can reduce the viability of a population even when the total habitat area is unchanged.", marks: 3, scheme: ["Patches are isolated and movement or gene flow is reduced", "Small populations are more vulnerable to inbreeding and demographic chance", "Edge effects alter conditions and increase exposure to predators or disturbance"], answer: "Fragmentation separates the habitat into smaller isolated patches, so movement and gene flow fall. Each population is smaller and more vulnerable to inbreeding and chance events, while edge effects change temperature, light and predation near the boundary.", claim: "explain ecological effects of habitat fragmentation", aos: ["AO1", "AO2"] },
      { prompt: "Describe the sequence from fertiliser runoff to fish death during eutrophication.", marks: 4, scheme: ["Nitrate or phosphate enrichment increases algal growth", "Algae block light and submerged plants die", "Decomposers respire while breaking down dead material", "Dissolved oxygen falls and fish or aerobic invertebrates die"], answer: "Nitrate or phosphate enrichment causes an algal bloom. The bloom reduces light, so submerged plants die. Decomposers break down the dead biomass and respire, using dissolved oxygen; oxygen depletion then kills fish and other aerobic organisms.", claim: "explain the stages of eutrophication", aos: ["AO1", "AO2"] },
      { prompt: "Give one piece of evidence that would separate a climate effect from a simple correlation with salmon numbers.", marks: 2, scheme: ["Use long-term or replicated measurements of temperature or flow and salmon abundance", "Control or account for confounders such as fishing, pollution and habitat", "A consistent mechanism or time-lagged relationship strengthens the inference"], answer: "Use a long time series or replicated catchments measuring temperature or flow, salmon abundance and confounders such as fishing and pollution. A repeatable relationship with a plausible time lag and mechanism would be stronger evidence than a single correlation.", claim: "evaluate evidence for a climate effect", aos: ["AO2", "AO3"] },
      { prompt: "Compare one in-situ and one ex-situ conservation action for the salmon population and state a limitation of each.", marks: 3, scheme: ["In-situ action such as restoring connected river habitat protects the population in its ecosystem", "Ex-situ action such as a captive-breeding programme can preserve genetic material or boost numbers", "Each has a limitation such as cost, domestication, low genetic diversity or failure to fix the original habitat"], answer: "Restoring connected, shaded river habitat is in-situ conservation and protects salmon in their natural ecosystem, but it is slow and depends on controlling the catchment. A captive-breeding programme is ex-situ and can preserve or increase numbers, but it is costly and may select for captivity or fail if the river remains unsuitable.", claim: "compare conservation strategies using evidence and limitations", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    biology,
    "practical-skills",
    "A student tests how nitrate concentration affects the growth of duckweed and must report a reliable biological conclusion.",
    [
      { prompt: "Identify a suitable independent variable, dependent variable and two controlled variables.", marks: 3, scheme: ["Independent variable is nitrate concentration", "Dependent variable is a defined growth measure such as frond area or dry mass per unit time", "Control light intensity, temperature, starting biomass, volume or pH"], answer: "Nitrate concentration is the independent variable. Measure a defined dependent variable such as change in frond area or dry mass per unit time. Keep light intensity, temperature, starting biomass, solution volume and pH controlled as appropriate.", claim: "plan variables for a biological experiment", aos: ["AO2", "AO3"] },
      { prompt: "Explain why random placement of quadrats or cultures is preferable to choosing convenient positions.", marks: 2, scheme: ["It reduces selection bias", "Every position has a known or equal chance of selection, making the sample more representative"], answer: "Random placement reduces selection bias because the investigator cannot choose sites that already look typical or unusual. Each position has a known or equal chance of selection, making the sample more representative of the population.", claim: "justify random sampling", aos: ["AO1", "AO2"] },
      { prompt: "An image of a cell is 36 mm long at ×600 magnification. Calculate the actual length in micrometres.", marks: 2, scheme: ["Actual size = image size / magnification", "36 mm / 600 = 0.060 mm = 60 μm"], answer: "Actual length = 36 mm ÷ 600 = 0.060 mm. Since 1 mm = 1000 μm, the cell is 60 μm long.", claim: "calculate actual size from magnification", aos: ["AO2"] },
      { prompt: "A result is statistically significant but the mean growth difference is very small. Give two points that belong in the biological conclusion.", marks: 3, scheme: ["State the direction and size of the observed effect", "A p-value addresses evidence against the null, not practical importance", "Discuss uncertainty, sample size, controls and whether the effect matters biologically"], answer: "The conclusion should state the direction and magnitude of the growth difference, not only that p is below the threshold. Statistical significance gives evidence against the null model, but practical importance depends on effect size, uncertainty, sample size and whether the change matters to the plant or ecosystem.", claim: "interpret statistical significance alongside biological importance", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    chemistry,
    "organic-mechanisms",
    "A chemist converts 1-bromopropane into propene or propan-1-ol and then reacts a carbonyl compound with hydrogen cyanide. Explain the mechanisms and conditions.",
    [
      { prompt: "Describe the curly-arrow mechanism for hydroxide substitution of a primary halogenoalkane.", marks: 3, scheme: ["Arrow from a lone pair on hydroxide to the electron-poor carbon", "Arrow from the C–Br bond to bromine", "Products are propan-1-ol and bromide ion with charge and atoms conserved"], answer: "Draw a curly arrow from a lone pair on OH⁻ to the carbon bonded to bromine, and a second arrow from the C–Br bond to Br. The products are propan-1-ol and Br⁻; the arrows represent electron-pair movement and conserve charge.", claim: "draw a nucleophilic substitution mechanism", aos: ["AO1", "AO2"] },
      { prompt: "Explain why ethanolic hydroxide and heat can favour elimination rather than aqueous substitution.", marks: 3, scheme: ["Ethanolic hydroxide acts as a base and removes a hydrogen on a neighbouring carbon", "The C–H electrons form a C=C bond as the leaving group leaves", "Heat and solvent conditions alter the relative likelihood of elimination and substitution"], answer: "In ethanolic conditions hydroxide behaves as a base and removes a hydrogen from a carbon adjacent to the one bearing Br. The C–H electron pair forms a C=C bond as bromide leaves, producing an alkene. Heat and the solvent make elimination more competitive than aqueous substitution.", claim: "predict elimination conditions and product formation", aos: ["AO2", "AO3"] },
      { prompt: "Explain the first electron-pair movements when HCN adds to propanone.", marks: 3, scheme: ["The carbonyl carbon is electron-poor and the oxygen is electron-rich", "A cyanide lone pair attacks the carbonyl carbon", "The C=O pi electrons move onto oxygen, then proton transfer gives a hydroxynitrile"], answer: "The polar C=O bond leaves the carbonyl carbon electron-poor. A lone pair on CN⁻ attacks that carbon while the C=O π pair moves onto oxygen; subsequent proton transfer produces the hydroxynitrile.", claim: "explain nucleophilic addition to a carbonyl", aos: ["AO1", "AO2"] },
      { prompt: "Give two checks that make a drawn organic mechanism chemically valid.", marks: 2, scheme: ["Every arrow starts at an electron pair and ends at an electron-poor atom or bond", "Atoms and overall charge are conserved and the stated reagent or solvent supplies the required species"], answer: "Every curly arrow must start at a lone pair or a bond containing the electron pair and end at an electron-poor atom or bond. Atoms and overall charge must be conserved, and the stated reagent and solvent must supply the nucleophile, base or proton involved.", claim: "self-check organic mechanisms for electron and charge conservation", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    chemistry,
    "electrochemical-cells",
    "A student constructs a zinc–copper cell and compares its measured voltage with standard electrode-potential data.",
    [
      { prompt: "State the standard conditions for measuring a standard electrode potential.", marks: 3, scheme: ["Solutions at 1.00 mol dm−3", "Temperature 298 K", "Gases at 100 kPa and pure solids or liquids in their standard states"], answer: "The standard conditions include 1.00 mol dm⁻³ solutions, a temperature of 298 K and gases at 100 kPa. Pure solids and liquids are used in their standard states, with the electrode connected to the standard hydrogen electrode for comparison.", claim: "state standard electrode-potential conditions", aos: ["AO1"] },
      { prompt: "Given E°(Cu²⁺/Cu) = +0.34 V and E°(Zn²⁺/Zn) = −0.76 V, calculate E°cell and identify the oxidation half-cell.", marks: 3, scheme: ["Copper is the cathode reduction and zinc is the anode oxidation", "E°cell = 0.34 − (−0.76)", "E°cell = +1.10 V; zinc is oxidised"], answer: "Copper has the more positive reduction potential, so it is reduced at the cathode. E°cell = 0.34 − (−0.76) = +1.10 V. Zinc is the oxidation half-cell and supplies electrons.", claim: "calculate cell potential and identify oxidation", aos: ["AO2"] },
      { prompt: "Explain the separate roles of the salt bridge and the external wire.", marks: 3, scheme: ["Electrons travel through the external wire from anode to cathode", "Ions move through the salt bridge to prevent charge build-up", "The bridge completes the ionic circuit without directly mixing the half-cell reactants"], answer: "Electrons flow through the external wire from zinc to copper. Ions move through the salt bridge to prevent charge build-up in each half-cell and complete the ionic circuit; the bridge keeps the main solutions from mixing directly.", claim: "explain how an electrochemical cell completes both circuits", aos: ["AO1", "AO2"] },
      { prompt: "Give two controls or improvements needed when comparing measured cell voltages between two cells.", marks: 2, scheme: ["Control concentration, temperature, electrode area and immersion depth", "Clean electrodes, allow the reading to stabilise and use a high-resistance voltmeter"], answer: "Keep concentration, temperature, electrode area and immersion depth consistent. Clean the electrodes, allow the reading to stabilise and use a high-resistance voltmeter so little current flows while the equilibrium potential is measured.", claim: "plan a fair electrochemical-cell investigation", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    physics,
    "orbits-universe",
    "A satellite is placed into a circular orbit and astronomers use galaxy spectra to estimate the expansion of the universe.",
    [
      { prompt: "Derive the expression v = √(GM/r) for a circular satellite orbit.", marks: 3, scheme: ["Set gravitational force GMm/r² equal to centripetal force mv²/r", "Cancel m and rearrange v² = GM/r", "Take the positive square root for speed"], answer: "For a circular orbit, GMm/r² = mv²/r. Cancelling m and multiplying by r gives v² = GM/r, so the orbital speed is v = √(GM/r).", claim: "derive circular-orbit speed from gravitational force", aos: ["AO2"] },
      { prompt: "State three conditions for a geostationary satellite and explain why each matters.", marks: 3, scheme: ["Circular orbit above the equator", "Period equal to Earth's rotation", "West-to-east direction so it remains above the same longitude"], answer: "It must be in a circular orbit above the equator, have a period equal to Earth's rotation and move west to east. These conditions make its angular speed match Earth's and keep its latitude and longitude fixed for an observer on the ground.", claim: "explain geostationary-orbit conditions", aos: ["AO1", "AO2"] },
      { prompt: "How does the orbital period change when the orbital radius increases?", marks: 2, scheme: ["Kepler relationship T² proportional to r³", "T increases as r^(3/2), while orbital speed decreases"], answer: "Kepler's relationship is T² ∝ r³, so T ∝ r^(3/2). A larger orbit therefore has a longer period and a lower orbital speed.", claim: "apply Kepler's third-law relationship", aos: ["AO2"] },
      { prompt: "Explain why a redshift–distance graph can support an expanding-universe model but cannot by itself give a perfect distance for every galaxy.", marks: 3, scheme: ["Redshift gives recession speed through a Doppler or cosmological model", "The Hubble relationship predicts speed increasing with distance", "Peculiar velocities, calibration uncertainty and measurement error add scatter"], answer: "A redshift can be converted into a recession speed, and a positive relationship v = H₀d supports expansion. Individual galaxies also have peculiar velocities and the distance ladder has calibration uncertainty, so the graph has scatter and does not give a perfect distance from redshift alone.", claim: "evaluate evidence from redshift and the Hubble law", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    physics,
    "electromagnetic-induction",
    "A coil moves through a magnetic field and is then used as part of a generator and transformer system.",
    [
      { prompt: "State the relationship between induced emf and magnetic flux linkage.", marks: 2, scheme: ["Induced emf equals the negative rate of change of flux linkage", "ε = −d(NΦ)/dt or magnitude proportional to the rate of change"], answer: "The induced emf is ε = −d(NΦ)/dt, where NΦ is the flux linkage. A larger or faster change in flux linkage gives a larger magnitude of emf.", claim: "state Faraday's law in terms of flux linkage", aos: ["AO1", "AO2"] },
      { prompt: "Use Lenz's law to determine the direction of the induced current when the magnetic flux into a coil increases.", marks: 2, scheme: ["The induced field opposes the increase in flux", "The coil's near face becomes the same pole as the approaching magnet or field direction requires"], answer: "The induced current produces a magnetic field that opposes the increase in flux. Therefore the face of the coil nearest an approaching north pole becomes north, repelling the approach; the exact current direction follows the right-hand grip rule.", claim: "apply Lenz's law to an induced-current direction", aos: ["AO2"] },
      { prompt: "Explain how a simple generator produces an alternating output.", marks: 3, scheme: ["Mechanical rotation changes the coil's flux linkage", "The rate of change reverses every half-turn", "Slip rings maintain the external connection and the emf reverses direction"], answer: "As the coil rotates, its flux linkage changes and an emf is induced. The rate of change reverses every half-turn, so the emf reverses direction. Slip rings keep the rotating coil connected to the external circuit, producing an alternating output.", claim: "explain alternating emf from a rotating generator", aos: ["AO1", "AO2"] },
      { prompt: "A transformer has 500 primary turns and 50 secondary turns connected to 240 V. Calculate the ideal secondary voltage and explain one transmission advantage of a step-up transformer.", marks: 3, scheme: ["Vs/Vp = Ns/Np", "Vs = 240 × 50/500 = 24 V", "For fixed power a higher voltage means lower current and lower I²R cable loss"], answer: "Vₛ/Vₚ = Nₛ/Nₚ, so Vₛ = 240 × 50/500 = 24 V. A step-up transformer uses the opposite turns ratio: for fixed power, higher voltage means lower current and therefore lower I²R loss in transmission cables.", claim: "apply transformer ratios and transmission losses", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    maths,
    "conditional-probability",
    "A screening test is used in a population where the condition is uncommon. Use conditional probability to interpret the result rather than treating the test result as a diagnosis.",
    [
      { prompt: "Write a formula for P(A|B) and explain what the denominator represents.", marks: 2, scheme: ["P(A|B) = P(A ∩ B)/P(B)", "The denominator is the probability of the information already known, B"], answer: "P(A|B) = P(A ∩ B)/P(B). The denominator P(B) is the probability of the condition or information already known, so it defines the reduced sample space.", claim: "define conditional probability correctly", aos: ["AO1", "AO2"] },
      { prompt: "A test is positive in 95% of affected people and in 5% of unaffected people. If 1% of a population is affected, find P(affected and positive) and P(positive).", marks: 3, scheme: ["P(A ∩ +) = 0.01 × 0.95 = 0.0095", "P(unaffected and +) = 0.99 × 0.05 = 0.0495", "P(+) = 0.0095 + 0.0495 = 0.059"], answer: "P(affected and positive) = 0.01 × 0.95 = 0.0095. P(unaffected and positive) = 0.99 × 0.05 = 0.0495, so P(positive) = 0.0095 + 0.0495 = 0.059.", claim: "combine conditional probabilities with a base rate", aos: ["AO2"] },
      { prompt: "Use the same data to calculate P(affected | positive).", marks: 2, scheme: ["P(A|+) = P(A ∩ +)/P(+)", "P(A|+) = 0.0095/0.059 ≈ 0.161"], answer: "P(affected | positive) = 0.0095/0.059 ≈ 0.161. Only about 16.1% of positive results correspond to an affected person in this population because the condition is uncommon.", claim: "use Bayes structure to interpret a positive test", aos: ["AO2", "AO3"] },
      { prompt: "How could independence be checked for two events A and B, and why are mutually exclusive events usually not independent?", marks: 3, scheme: ["Compare P(A ∩ B) with P(A)P(B), or compare P(A|B) with P(A)", "Mutually exclusive events have P(A ∩ B)=0", "If both have non-zero probability then P(A)P(B)>0, so equality fails"], answer: "Check whether P(A ∩ B) = P(A)P(B), equivalently whether P(A|B) = P(A). If A and B are mutually exclusive, their intersection has probability zero; if both have non-zero probability, P(A)P(B) is positive, so they cannot be independent.", claim: "test independence and distinguish it from mutual exclusion", aos: ["AO2", "AO3"] },
    ],
  ),
  expansionQuestion(
    maths,
    "differential-equations-context",
    "A population grows at a rate proportional to its size for a period, then the model is checked against observations and its assumptions are discussed.",
    [
      { prompt: "Translate the statement 'the rate of increase is proportional to the population' into a differential equation.", marks: 2, scheme: ["Let population be P(t)", "dP/dt = kP for a constant k, with k>0 for growth"], answer: "If the population is P(t), proportional growth is modelled by dP/dt = kP, where k is a constant. Growth requires k > 0; decay would use k < 0.", claim: "form a differential equation from proportional growth", aos: ["AO2", "AO3"] },
      { prompt: "Solve dP/dt = kP with P(0)=P₀.", marks: 3, scheme: ["Separate dP/P = k dt", "Integrate ln P = kt + c", "Use P(0)=P0 to obtain P = P0e^(kt)"], answer: "Separate variables: dP/P = k dt. Integrating gives ln P = kt + c, so P = Ae^(kt). Since P(0) = P₀, A = P₀ and P(t) = P₀e^(kt).", claim: "solve a separable growth differential equation", aos: ["AO2"] },
      { prompt: "What is the doubling time for P(t)=P₀e^(0.04t), where t is measured in years?", marks: 2, scheme: ["Set 2P0 = P0e^(0.04t)", "ln 2 = 0.04t, so t = ln2/0.04 ≈ 17.3 years"], answer: "Set P = 2P₀: 2 = e^(0.04t), so t = ln 2/0.04 ≈ 17.3 years.", claim: "interpret an exponential growth constant as a doubling time", aos: ["AO2"] },
      { prompt: "Give two reasons this model may fail over a long time period and state what evidence would reveal the failure.", marks: 3, scheme: ["Resources or space may become limiting, producing saturation", "The rate constant may change with season, intervention or population structure", "Residuals or a systematic pattern between predictions and observations reveal model failure"], answer: "Resources or space may become limiting, and the rate constant may change with season, disease or intervention. Compare predictions with later observations: systematic residuals, changing growth rates or a plateau would show that the constant-rate exponential model is no longer adequate.", claim: "evaluate assumptions and validate a differential-equation model", aos: ["AO3"] },
    ],
  ),
];

export const wjecAlevelExpansionQuestions = defineQuestions(questions);
