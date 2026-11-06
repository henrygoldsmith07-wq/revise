import type { AoCode, Id } from "@/domain/types";
import type { PartSpec, QuestionSpec } from "./authoring";
import { defineQuestions } from "./authoring";

// Exam-style questions for the topics the AQA A-level structures add for
// sections the shared outline never covered (src/domain/curriculum/boards).
// One question per added topic, each part tagged to that topic's own
// statements. Original, authored, not reviewed by a teacher.

const BIO = "aqa-alevel-biology";
const CHEM = "aqa-alevel-chemistry";
const PHYS = "aqa-alevel-physics";

/**
 * The model answer states each mark-scheme point in its own sentence and adds
 * a sentence of the student's own reasoning (`context`): an answer that only
 * recites the scheme is capped below full marks, by an examiner and by the
 * offline marker alike.
 */
function part(prompt: string, scheme: string[], context: string, topic: string, subjectId: Id, points: number[], claims: string[], aos: AoCode[] = ["AO1", "AO2"]): PartSpec {
  return {
    prompt,
    marks: scheme.length,
    scheme,
    answer: [...scheme.map((point) => (/[.!?]$/.test(point) ? point : `${point}.`)), context].join(" "),
    aos,
    specPointIds: points.map((n) => `${subjectId}.${topic}.sp-${String(n).padStart(2, "0")}`),
    learningClaims: claims,
  };
}

function question(subjectId: Id, topic: string, slug: string, stem: string, difficulty: QuestionSpec["difficulty"], parts: PartSpec[]): QuestionSpec {
  return {
    slug: `aqa-board-${slug}`,
    subjectId,
    topics: [topic],
    stem,
    difficulty,
    calculator: true,
    source: "authored",
    verification: "unverified",
    reviewer: null,
    lastChecked: "2026-11-06",
    specVersion: "2024-1.0",
    parts,
  };
}

export const aqaAlevelBoardTopicQuestions = defineQuestions([
  // --- Biology ---------------------------------------------------------------
  question(BIO, "cell-cycle", "bio-mitotic-index", "A student counted 50 cells in a squash of an onion root tip: 40 were in interphase, 6 in prophase, 2 in metaphase, 1 in anaphase and 1 in telophase.", 2, [
    part("Calculate the mitotic index of this sample.", ["Cells in mitosis = 6 + 2 + 1 + 1 = 10", "Mitotic index = 10 ÷ 50 = 0.2"], "Working shown: 10 dividing cells out of a total of 50 counted.", "cell-cycle", BIO, [2], ["calculate a mitotic index"], ["AO2"]),
    part("Explain why a root tip is used, and describe what happens to the chromosomes during anaphase.",
      ["Root tips contain meristem cells that divide frequently", "In anaphase the centromeres divide and sister chromatids separate", "Spindle fibres shorten and pull the chromatids to opposite poles"], "Meristems at the tip are where the root grows, so many cells are caught dividing at any moment.",
      "cell-cycle", BIO, [1], ["describe the stages of mitosis"]),
  ]),
  question(BIO, "immune-system", "bio-vaccination", "A child is vaccinated against measles and later meets the measles virus.", 3, [
    part("Explain how vaccination leads to long-term immunity.",
      ["The vaccine contains antigens from the pathogen", "B cells with complementary receptors undergo clonal selection and divide by mitosis", "Plasma cells secrete antibodies against the antigen", "Memory cells remain, so a later secondary response is faster and larger"], "Because no disease develops, the person gains active immunity without first being ill.",
      "immune-system", BIO, [3, 5], ["explain the humoral response and vaccination"]),
    part("Explain why a vaccine against one strain of influenza may not protect against a later strain.",
      ["Antigenic variability changes the shape of the antigens on the virus", "Memory cells and antibodies are no longer complementary to the new antigen"], "The new strain is therefore treated like a first infection, and the primary response is slow.",
      "immune-system", BIO, [5], ["explain the effect of antigenic variability"]),
  ]),
  question(BIO, "digestion-absorption", "bio-glucose-cotransport", "Glucose is absorbed from the lumen of the ileum into the blood.", 3, [
    part("Explain how glucose is absorbed by co-transport.",
      ["Sodium ions are actively transported out of the epithelial cell into the blood", "This keeps the sodium ion concentration in the epithelial cell low", "Sodium ions diffuse into the cell with glucose through a co-transporter protein", "Glucose then moves into the blood by facilitated diffusion"], "The sodium gradient, not the glucose gradient, provides the energy, so absorption continues even when glucose is more concentrated inside.",
      "digestion-absorption", BIO, [3], ["explain co-transport of glucose with sodium ions"]),
    part("Explain the role of bile salts in the digestion of lipids.",
      ["Bile salts emulsify lipids into smaller droplets", "This increases the surface area for lipase to act on"], "Lipase is water-soluble, so it only reaches lipids at the surface of each droplet.",
      "digestion-absorption", BIO, [2], ["explain the role of bile salts"]),
  ]),
  question(BIO, "stimuli-response", "bio-pacinian-rods", "A Pacinian corpuscle in the skin is pressed with increasing force.", 3, [
    part("Explain how pressure on a Pacinian corpuscle produces a generator potential.",
      ["Pressure deforms the lamellae and stretches the membrane", "Stretch-mediated sodium ion channels open", "Sodium ions diffuse in and depolarise the membrane, producing a generator potential"], "A larger pressure opens more channels, giving a bigger generator potential that may reach the threshold.",
      "stimuli-response", BIO, [3], ["explain the generator potential of a Pacinian corpuscle"]),
    part("Explain why rods are more sensitive to dim light than cones.",
      ["Several rods connect to a single bipolar neurone (summation)", "Small amounts of light from several rods together can reach the threshold"], "Cones each have their own bipolar neurone, so they give better acuity but need brighter light.",
      "stimuli-response", BIO, [4], ["compare the sensitivity of rods and cones"]),
  ]),
  question(BIO, "nervous-coordination", "bio-resting-potential", "The resting potential of a neurone is about −70 mV.", 3, [
    part("Explain how the resting potential is maintained.",
      ["The sodium-potassium pump moves three sodium ions out for every two potassium ions in", "The membrane is more permeable to potassium ions, which diffuse out", "So the inside of the axon is negative relative to the outside"], "This charge difference across the membrane is described as polarised.",
      "nervous-coordination", BIO, [1], ["explain the resting potential"]),
    part("Explain why impulses travel faster along a myelinated axon.",
      ["Myelin insulates the axon so depolarisation occurs only at the nodes of Ranvier", "The impulse jumps from node to node by saltatory conduction"], "Unmyelinated axons must depolarise every section of membrane in turn, which takes longer.",
      "nervous-coordination", BIO, [2], ["explain factors affecting the speed of conduction"]),
  ]),
  question(BIO, "populations-evolution", "bio-snails-speciation", "A student marks and releases 40 pond snails. A later sample of 50 snails contains 8 marked snails.", 3, [
    part("Estimate the size of the snail population.", ["Population = (40 × 50) ÷ 8", "Population = 250 snails"], "This assumes marked snails mix fully with the population and marking does not affect their survival.", "populations-evolution", BIO, [4], ["estimate population size by mark–release–recapture"], ["AO2"]),
    part("Explain how a geographical barrier could lead to two species of snail forming from one population.",
      ["A population is separated by a geographical barrier", "Different selection pressures act on each population", "Allele frequencies change in each population, by selection and genetic drift", "The populations become reproductively isolated and can no longer interbreed to produce fertile offspring"], "Each isolated group accumulates different mutations over many generations.",
      "populations-evolution", BIO, [1, 2], ["explain allopatric speciation"]),
  ]),
  question(BIO, "gene-expression", "bio-oestrogen-methylation", "Oestrogen stimulates transcription of target genes in some breast cells.", 4, [
    part("Explain how oestrogen stimulates transcription of a target gene.",
      ["Oestrogen is lipid-soluble and diffuses through the cell membrane", "It binds to a receptor on a transcription factor, changing its shape and releasing it from an inhibitor", "The transcription factor binds to DNA and stimulates transcription of the gene"], "Only cells with the receptor respond, which is why oestrogen affects some tissues and not others.",
      "gene-expression", BIO, [3], ["explain regulation of transcription by oestrogen"]),
    part("Explain how increased methylation of a tumour suppressor gene can lead to a tumour.",
      ["Methyl groups attach to the gene, preventing transcription", "The tumour suppressor protein is not produced", "Cell division is no longer slowed, so cells divide uncontrollably"], "Hypermethylation silences the gene without altering its base sequence, an epigenetic change.",
      "gene-expression", BIO, [4], ["explain the role of abnormal methylation in tumours"]),
  ]),
  question(BIO, "gene-technology", "bio-pcr", "A scientist amplifies one molecule of a short DNA fragment by the polymerase chain reaction (PCR).", 3, [
    part("Describe how PCR amplifies the fragment.",
      ["The DNA is heated to about 95 °C to separate the strands", "The mixture is cooled to about 55 °C so primers anneal", "It is heated to about 72 °C so Taq DNA polymerase joins nucleotides", "The cycle is repeated, doubling the DNA each cycle"], "Each cycle takes only a few minutes in a thermal cycler, so millions of copies can be made quickly.",
      "gene-technology", BIO, [2], ["explain amplification of DNA by PCR"]),
    part("Calculate the number of copies of the fragment after 10 cycles.", ["2¹⁰ = 1024 copies"], "Doubling ten times multiplies the starting molecule by a factor of two each time.", "gene-technology", BIO, [2], ["explain amplification of DNA by PCR"], ["AO2"]),
  ]),

  // --- Chemistry ---------------------------------------------------------------
  // ΔG = 178 − 298 × 0.161 = +130 kJ mol⁻¹; T = 178 ÷ 0.161 = 1106 K.
  question(CHEM, "thermodynamics", "chem-gibbs-feasibility", "For the decomposition of calcium carbonate, ΔH = +178 kJ mol⁻¹ and ΔS = +161 J K⁻¹ mol⁻¹.", 4, [
    part("Calculate ΔG at 298 K and state whether the reaction is feasible at this temperature.",
      ["ΔS = 0.161 kJ K⁻¹ mol⁻¹", "ΔG = 178 − 298 × 0.161 = +130 kJ mol⁻¹", "ΔG is positive so the reaction is not feasible at 298 K"], "Entropy must be in the same energy unit as enthalpy before the two are combined.",
      "thermodynamics", CHEM, [4], ["calculate ΔG and predict feasibility"], ["AO2"]),
    part("Calculate the minimum temperature at which the reaction becomes feasible.", ["T = ΔH ÷ ΔS = 178 ÷ 0.161", "T = 1106 K"], "Above this temperature the TΔS term outweighs the enthalpy change, so decomposition becomes spontaneous.", "thermodynamics", CHEM, [4], ["calculate the temperature at which a reaction becomes feasible"], ["AO2"]),
  ]),
  question(CHEM, "period-3-oxides", "chem-period3-oxides-water", "Sodium oxide and sulfur dioxide are each added to water.", 3, [
    part("Write an equation for each reaction and give the approximate pH of each solution.",
      ["Na₂O + H₂O → 2NaOH", "The sodium oxide solution is strongly alkaline, pH about 14", "SO₂ + H₂O → H₂SO₃", "The sulfur dioxide solution is acidic, pH about 2–3"], "Sodium oxide is a basic oxide, while sulfur dioxide is an acidic oxide.",
      "period-3-oxides", CHEM, [3], ["write equations for oxides with water and state pH"]),
    part("Explain why sodium oxide has a much higher melting point than sulfur dioxide.",
      ["Na₂O is ionic with strong electrostatic attraction between oppositely charged ions in a giant lattice", "SO₂ is simple molecular with weak intermolecular forces that need less energy to overcome"], "Breaking an ionic lattice requires far more energy than separating small covalent molecules.",
      "period-3-oxides", CHEM, [2], ["explain melting points of Period 3 oxides"]),
  ]),
  question(CHEM, "aqueous-ions", "chem-iron-aqua-ions", "Separate solutions contain [Fe(H₂O)₆]²⁺ and [Fe(H₂O)₆]³⁺ ions.", 4, [
    part("Explain why the solution of [Fe(H₂O)₆]³⁺ is more acidic.",
      ["Fe³⁺ has a higher charge density than Fe²⁺", "It polarises the O–H bonds in the water ligands more strongly", "So the water ligands release H⁺ ions more readily"], "The hydrated Fe³⁺ ion therefore behaves as a weak acid, giving a lower pH.",
      "aqueous-ions", CHEM, [1], ["explain the acidity of metal-aqua ions"]),
    part("State what is observed when sodium hydroxide is added to each solution, and when sodium carbonate is added to the iron(III) solution.",
      ["Fe²⁺ gives a green precipitate of Fe(OH)₂", "Fe³⁺ gives a brown precipitate of Fe(OH)₃", "With sodium carbonate Fe³⁺ gives a brown precipitate and bubbles of carbon dioxide"], "Iron(II) ions instead form a green precipitate of iron(II) carbonate with no gas.",
      "aqueous-ions", CHEM, [2], ["describe reactions of aqua ions with hydroxide and carbonate"]),
  ]),
  question(CHEM, "amino-acids-dna", "chem-glycine-cisplatin", "Glycine, H₂NCH₂COOH, is the simplest amino acid.", 3, [
    part("Give the structure of glycine as a zwitterion, and in strongly acidic and in strongly alkaline solution.",
      ["Glycine exists as a zwitterion, ⁺H₃NCH₂COO⁻", "In acid the species is ⁺H₃NCH₂COOH", "In alkali the species is H₂NCH₂COO⁻"], "The amine group accepts a proton while the carboxylic acid group donates one.",
      "amino-acids-dna", CHEM, [1], ["describe the acid–base properties of amino acids"]),
    part("Explain how cisplatin acts as an anticancer drug.",
      ["Cisplatin bonds to nitrogen atoms on guanine bases in DNA", "This prevents DNA replication so cancer cells cannot divide"], "Healthy cells are also affected, which causes side effects such as hair loss and limits the dose.",
      "amino-acids-dna", CHEM, [4], ["explain the action of cisplatin"]),
  ]),

  // --- Physics -----------------------------------------------------------------
  question(PHYS, "measurements-errors", "phys-wire-uncertainty", "The diameter of a wire is measured as 0.50 ± 0.01 mm with a micrometer.", 2, [
    part("Calculate the percentage uncertainty in the diameter and in the cross-sectional area of the wire.",
      ["Percentage uncertainty in diameter = 0.01 ÷ 0.50 × 100 = 2%", "Area depends on diameter squared", "Percentage uncertainty in area = 2 × 2% = 4%"], "Squaring a quantity doubles its percentage uncertainty.",
      "measurements-errors", PHYS, [3], ["combine percentage uncertainties"], ["AO2"]),
    part("Distinguish between random and systematic errors, giving an example of a systematic error.",
      ["Random errors scatter readings either side of the true value and are reduced by repeating", "Systematic errors shift all readings by the same amount, for example a zero error"], "Repeating measurements and averaging cannot remove a zero error; it must be corrected.",
      "measurements-errors", PHYS, [2], ["distinguish random and systematic errors"]),
  ]),
  question(PHYS, "particles", "phys-pair-production-kaon", "A high-energy photon produces an electron–positron pair. The rest energy of an electron is 0.511 MeV.", 3, [
    part("Calculate the minimum energy of the photon.", ["Two particles each of rest energy 0.511 MeV must be created", "Minimum energy = 2 × 0.511 = 1.022 MeV"], "Any extra photon energy becomes kinetic energy of the pair.", "particles", PHYS, [2], ["calculate the minimum photon energy for pair production"], ["AO2"]),
    part("The positive kaon decays: K⁺ → μ⁺ + ν_μ. Show that charge and muon lepton number are conserved, and identify the interaction responsible.",
      ["Charge is conserved: +1 = +1 + 0", "Muon lepton number is conserved: 0 = −1 + 1", "Strangeness is not conserved, so it is a weak interaction"], "The strange antiquark changes flavour, which only the weak interaction allows.",
      "particles", PHYS, [5], ["apply conservation laws to particle interactions"], ["AO2"]),
  ]),
  // E = ½ × 470×10⁻⁶ × 12² = 0.034 J; RC = 4.7 s; V = 0.37 × 12 = 4.4 V.
  question(PHYS, "capacitance", "phys-capacitor-discharge", "A 470 μF capacitor is charged to 12 V and then discharged through a 10 kΩ resistor.", 3, [
    part("Calculate the energy stored in the capacitor when it is charged.", ["E = ½CV² = ½ × 470 × 10⁻⁶ × 12²", "E = 0.034 J"], "This energy is transferred to the resistor as heat during discharge.", "capacitance", PHYS, [3], ["calculate the energy stored by a capacitor"], ["AO2"]),
    part("Calculate the time constant and the pd across the capacitor one time constant after discharge begins.",
      ["Time constant RC = 10 × 10³ × 470 × 10⁻⁶", "RC = 4.7 s", "After one time constant V = 0.37 × 12 = 4.4 V"], "The time constant is the time for the charge or pd to fall to about 37% of its starting value.",
      "capacitance", PHYS, [4], ["analyse capacitor discharge using the time constant"], ["AO2"]),
  ]),
  // T = 2.9×10⁻³ ÷ 480×10⁻⁹ = 6040 K; d = 7000 ÷ 70 = 100 Mpc.
  question(PHYS, "astrophysics", "phys-wien-hubble", "A star's spectrum peaks at a wavelength of 480 nm. A distant galaxy is receding at 7000 km s⁻¹. Take H₀ = 70 km s⁻¹ Mpc⁻¹ and Wien's constant as 2.9 × 10⁻³ m K.", 3, [
    part("Calculate the surface temperature of the star.", ["T = 2.9 × 10⁻³ ÷ 480 × 10⁻⁹", "T = 6040 K"], "This is close to the Sun's surface temperature, so the star would appear yellow-white.", "astrophysics", PHYS, [2], ["use Wien's law"], ["AO2"]),
    part("Calculate the distance to the galaxy.", ["d = v ÷ H₀ = 7000 ÷ 70", "d = 100 Mpc"], "The red shift of the galaxy's spectrum gives its recession velocity.", "astrophysics", PHYS, [4], ["apply Hubble's law"], ["AO2"]),
  ]),
  question(PHYS, "medical-physics", "phys-effective-half-life", "A radioactive tracer has a physical half-life of 6.0 hours and a biological half-life of 3.0 hours.", 3, [
    part("Calculate the effective half-life of the tracer.", ["1/T_E = 1/6.0 + 1/3.0 = 0.5", "T_E = 2.0 hours"], "The effective half-life is shorter than either, because both processes remove the tracer.", "medical-physics", PHYS, [4], ["calculate effective half-life"], ["AO2"]),
    part("Explain why a coupling gel is used in ultrasound imaging.",
      ["Air and skin have very different acoustic impedances, so most ultrasound would be reflected at the skin", "The gel has an acoustic impedance close to that of skin, so most ultrasound is transmitted into the body"], "Without gel, a thin air gap would reflect almost all of each pulse back.",
      "medical-physics", PHYS, [2], ["describe non-ionising imaging by ultrasound"]),
  ]),
  question(PHYS, "engineering-physics", "phys-flywheel-engine", "A flywheel with a moment of inertia of 0.40 kg m² rotates at 50 rad s⁻¹. A heat engine works between 600 K and 300 K.", 3, [
    part("Calculate the rotational kinetic energy of the flywheel.", ["E = ½Iω² = ½ × 0.40 × 50²", "E = 500 J"], "This stored energy can be released later to smooth out the output of an engine.", "engineering-physics", PHYS, [1], ["calculate rotational kinetic energy"], ["AO2"]),
    part("Calculate the maximum theoretical efficiency of the engine.", ["Maximum efficiency = (T_H − T_C) ÷ T_H", "Efficiency = (600 − 300) ÷ 600 = 0.50"], "Real engines achieve less because of friction and heat losses.", "engineering-physics", PHYS, [4], ["calculate maximum engine efficiency"], ["AO2"]),
  ]),
  // v = √(2 × 1.60×10⁻¹⁹ × 2000 ÷ 9.11×10⁻³¹) = 2.7×10⁷ m s⁻¹; γ = 1/√(1 − 0.99²) = 7.09, t = 15.6 μs.
  question(PHYS, "turning-points", "phys-electron-gun-muon", "Electrons are accelerated from rest through a pd of 2000 V. Separately, muons with a proper lifetime of 2.2 μs travel at 0.99c.", 4, [
    part("Calculate the speed of the electrons. (e = 1.60 × 10⁻¹⁹ C, mₑ = 9.11 × 10⁻³¹ kg)",
      ["½mv² = eV", "v = √(2 × 1.60 × 10⁻¹⁹ × 2000 ÷ 9.11 × 10⁻³¹)", "v = 2.7 × 10⁷ m s⁻¹"], "The kinetic energy gained equals the work done by the field on each electron.",
      "turning-points", PHYS, [1], ["calculate the speed of electrons from an electron gun"], ["AO2"]),
    part("Calculate the lifetime of the muons measured in the laboratory frame.", ["The Lorentz factor γ = 1 ÷ √(1 − 0.99²) = 7.09", "Dilated lifetime t = 7.09 × 2.2 = 15.6 μs"], "Many more muons therefore reach the ground than would without relativity.", "turning-points", PHYS, [4], ["apply time dilation"], ["AO2"]),
  ]),
  question(PHYS, "electronics", "phys-inverting-amplifier", "An inverting amplifier has an input resistor of 10 kΩ and a feedback resistor of 100 kΩ. A digital audio system must carry frequencies up to 20 kHz.", 3, [
    part("Calculate the voltage gain and the output voltage for an input of 0.20 V.", ["Gain = −R_f ÷ R_in = −100 ÷ 10 = −10", "Output = −10 × 0.20 = −2.0 V"], "The minus sign shows the output is inverted relative to the input.", "electronics", PHYS, [3], ["analyse an inverting amplifier"], ["AO2"]),
    part("State the minimum sampling frequency for the audio signal.", ["Sampling frequency must be more than 2 × 20 kHz = 40 kHz"], "Sampling below this rate causes aliasing.", "electronics", PHYS, [2], ["state the sampling requirement"], ["AO2"]),
  ]),
]);
