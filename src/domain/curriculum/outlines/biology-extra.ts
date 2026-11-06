import type { AoCode } from "../../types";
import type { TopicSpec } from "../helpers";

// Biology topics the shared outline never had, for boards whose specification
// examines them as sections of their own (AQA 7402 first). Each board places
// them with its own references (see ../board-outline.ts); the `ref` left blank
// here is filled from that placement. Authored, unreviewed reference content.

const LAST_CHECKED = "2026-11-06";
const point = (text: string, aos: AoCode[] = ["AO1"]) => ({
  ref: "",
  text,
  aos,
  source: "authored" as const,
  verification: "unverified" as const,
  reviewer: null,
  lastChecked: LAST_CHECKED,
});
const base = { source: "authored" as const, verification: "unverified" as const, lastChecked: LAST_CHECKED, aos: ["AO1", "AO2"] as AoCode[] };

export const BIOLOGY_EXTRA_TOPICS: TopicSpec[] = [
  {
    ...base,
    slug: "cell-cycle",
    title: "The cell cycle, mitosis and binary fission",
    difficulty: 2,
    summary:
      "How eukaryotic cells divide by mitosis within the cell cycle, how prokaryotes divide by binary fission, why viruses replicate only inside host cells, and how uncontrolled division leads to cancer.",
    keyPoints: [
      "Interphase (G1, S, G2) is when DNA replicates and organelles are made; mitosis is prophase, metaphase, anaphase, telophase, then cytokinesis.",
      "Mitosis gives two genetically identical daughter cells, used for growth, repair and asexual reproduction.",
      "Mitotic index = cells in mitosis ÷ total cells counted.",
      "Prokaryotes divide by binary fission: the circular DNA and plasmids replicate, then the cytoplasm divides; viruses are not cells and replicate only by hijacking a host cell.",
    ],
    commonErrors: [
      "Saying DNA replicates during prophase rather than during the S phase of interphase.",
      "Calling binary fission a form of mitosis — prokaryotes have no spindle or nucleus.",
      "Describing cancer as 'cells dividing too fast' without linking it to mutated genes that control the cell cycle.",
    ],
    specPoints: [
      point("describe the stages of the cell cycle and of mitosis and the behaviour of chromosomes in each"),
      point("calculate a mitotic index and identify mitotic stages in prepared root-tip slides", ["AO2", "AO3"]),
      point("describe binary fission in prokaryotes and the replication of viruses inside host cells"),
      point("explain how uncontrolled cell division can lead to tumours and how some cancer treatments act on the cell cycle", ["AO1", "AO2"]),
    ],
  },
  {
    ...base,
    slug: "immune-system",
    title: "Cell recognition and the immune system",
    difficulty: 3,
    summary:
      "How antigens let the body tell self from non-self, phagocytosis, the cellular and humoral responses of T and B lymphocytes, antibodies, vaccination and immunity, HIV, and the use of monoclonal antibodies.",
    keyPoints: [
      "Antigens are molecules (often proteins) on cell surfaces that trigger an immune response; they identify pathogens, abnormal cells, toxins and transplanted cells.",
      "Phagocytes engulf a pathogen, digest it in a phagolysosome with lysozymes and present its antigens; helper T cells then activate cytotoxic T cells and B cells.",
      "Clonal selection: the B cell with a complementary antibody divides into plasma cells (secrete antibody) and memory cells, so the secondary response is faster and larger.",
      "An antibody is four polypeptide chains with two identical antigen-binding sites; antigen–antibody complexes cause agglutination.",
    ],
    commonErrors: [
      "Writing that antibodies kill pathogens directly rather than binding to antigens and causing agglutination or marking them for phagocytosis.",
      "Confusing active immunity (own antibodies and memory cells) with passive immunity (antibodies given, no memory).",
      "Saying antigenic variability makes a pathogen 'immune' to vaccines rather than meaning memory cells no longer recognise it.",
    ],
    specPoints: [
      point("explain how antigens allow cells to be recognised as self or non-self, including pathogens, toxins and transplanted cells"),
      point("describe phagocytosis and the destruction of a pathogen within a phagolysosome"),
      point("explain the cellular response by T lymphocytes and the humoral response by B lymphocytes, plasma cells and memory cells", ["AO1", "AO2"]),
      point("describe antibody structure and the formation of antigen–antibody complexes"),
      point("distinguish active and passive immunity and explain vaccination, herd immunity and the effect of antigenic variability", ["AO1", "AO2"]),
      point("describe the structure and replication of HIV and why antibiotics do not affect viruses; evaluate uses of monoclonal antibodies including ELISA", ["AO1", "AO3"]),
    ],
  },
  {
    ...base,
    slug: "digestion-absorption",
    title: "Digestion and absorption",
    difficulty: 2,
    summary:
      "How carbohydrates, lipids and proteins are hydrolysed into small molecules in the mammalian gut, and how those products are absorbed across the ileum epithelium.",
    keyPoints: [
      "Amylase hydrolyses starch to maltose; membrane-bound disaccharidases (maltase, sucrase, lactase) finish the job to monosaccharides.",
      "Lipase hydrolyses triglycerides to monoglycerides and fatty acids; bile salts emulsify lipids into droplets and form micelles.",
      "Endopeptidases cut within a protein chain, exopeptidases remove terminal amino acids, membrane-bound dipeptidases split dipeptides.",
      "Glucose and amino acids are absorbed by co-transport with sodium ions; micelles release monoglycerides and fatty acids, which form chylomicrons in epithelial cells.",
    ],
    commonErrors: [
      "Saying bile salts digest fats — they emulsify, increasing the surface area for lipase.",
      "Describing glucose absorption as simple diffusion only, missing sodium co-transport against its gradient.",
      "Forgetting that the final hydrolysis of disaccharides and dipeptides happens on the epithelial cell membrane.",
    ],
    specPoints: [
      point("describe the hydrolysis of carbohydrates, lipids and proteins by the enzymes of the mammalian digestive system"),
      point("explain the roles of bile salts and micelles in the digestion and absorption of lipids"),
      point("explain the absorption of monosaccharides and amino acids by co-transport with sodium ions", ["AO1", "AO2"]),
    ],
  },
  {
    ...base,
    slug: "stimuli-response",
    title: "Stimuli, receptors and responses",
    difficulty: 3,
    summary:
      "How organisms detect and respond to stimuli: taxes and kineses, plant growth responses controlled by IAA, simple reflexes, receptors such as the Pacinian corpuscle and the rods and cones of the retina, and control of heart rate.",
    keyPoints: [
      "A taxis is a directional movement towards or away from a stimulus; a kinesis is a non-directional change in speed or turning rate.",
      "In shoots IAA accumulates on the shaded side and stimulates cell elongation, so the shoot bends towards light; in roots IAA inhibits elongation.",
      "A Pacinian corpuscle converts pressure into a generator potential when stretch-mediated sodium channels open.",
      "Rods give high sensitivity (summation, several rods to one bipolar cell) but low acuity; cones give high acuity and colour vision.",
    ],
    commonErrors: [
      "Saying light 'destroys' IAA rather than causing it to move to the shaded side.",
      "Describing rods as giving colour vision.",
      "Stating that the SAN sends impulses down the bundle of His directly, skipping the AVN delay.",
    ],
    specPoints: [
      point("describe taxes and kineses and the growth responses of plants controlled by IAA"),
      point("describe a simple reflex arc and explain its importance"),
      point("explain how a Pacinian corpuscle produces a generator potential", ["AO1", "AO2"]),
      point("compare the sensitivity and visual acuity of rods and cones in the retina", ["AO1", "AO2"]),
      point("explain myogenic stimulation of the heart and control of heart rate by the autonomic nervous system, chemoreceptors and pressure receptors", ["AO1", "AO2"]),
    ],
  },
  {
    ...base,
    slug: "nervous-coordination",
    title: "Nervous coordination and muscle contraction",
    difficulty: 4,
    summary:
      "Resting and action potentials, factors affecting the speed of conduction, synaptic transmission and summation, and how skeletal muscle contracts by the sliding-filament mechanism.",
    keyPoints: [
      "Resting potential is about −70 mV, maintained by the sodium–potassium pump (3 Na⁺ out, 2 K⁺ in) and more K⁺ leakage.",
      "An action potential follows the all-or-nothing principle; the refractory period makes impulses discrete and one-way.",
      "Myelination (saltatory conduction), larger axon diameter and higher temperature increase conduction speed.",
      "In contraction Ca²⁺ binds troponin, tropomyosin moves, myosin heads bind actin and pull it using ATP; the I band and H zone shorten, the A band does not.",
    ],
    commonErrors: [
      "Saying the sodium–potassium pump depolarises the membrane — depolarisation is sodium diffusing in through voltage-gated channels.",
      "Writing that a bigger stimulus gives a bigger action potential rather than a higher frequency of impulses.",
      "Stating that the A band shortens during muscle contraction.",
    ],
    specPoints: [
      point("explain the resting potential and the generation and propagation of an action potential", ["AO1", "AO2"]),
      point("explain the factors that affect the speed of conduction of a nerve impulse"),
      point("describe transmission across cholinergic synapses, including spatial and temporal summation and inhibition", ["AO1", "AO2"]),
      point("describe the structure of a sarcomere and explain contraction by the sliding-filament mechanism"),
      point("compare fast and slow skeletal muscle fibres and the roles of ATP and phosphocreatine", ["AO1", "AO2"]),
    ],
  },
  {
    ...base,
    slug: "populations-evolution",
    title: "Populations, evolution and speciation",
    difficulty: 3,
    summary:
      "How allele frequencies change in populations through selection and genetic drift, how new species arise, and how populations in ecosystems are sized, interact and change through succession and conservation.",
    keyPoints: [
      "Stabilising selection favours the average phenotype; directional selection shifts it towards one extreme; disruptive selection favours both extremes.",
      "Allopatric speciation follows geographical isolation; sympatric speciation happens without it, through reproductive isolation such as behavioural or genetic changes.",
      "Genetic drift changes allele frequencies by chance and matters most in small populations.",
      "Carrying capacity is set by abiotic factors and by interspecific and intraspecific competition and predation.",
    ],
    commonErrors: [
      "Saying individuals evolve — populations evolve as allele frequencies change.",
      "Writing that organisms mutate 'in order to' survive rather than mutation being random and selection acting on it.",
      "Confusing a niche with a habitat.",
    ],
    specPoints: [
      point("explain how variation, selection pressure and differential reproductive success change allele frequencies, including stabilising, directional and disruptive selection", ["AO1", "AO2"]),
      point("explain allopatric and sympatric speciation and the role of genetic drift"),
      point("explain how population size is determined by carrying capacity, competition and predation", ["AO1", "AO2"]),
      point("estimate population size using quadrats, transects and mark–release–recapture", ["AO2", "AO3"]),
      point("describe succession and evaluate the conflict between conservation and human needs", ["AO1", "AO3"]),
    ],
  },
  {
    ...base,
    slug: "gene-expression",
    title: "Control of gene expression",
    difficulty: 4,
    summary:
      "How gene mutations alter proteins, how stem cells become specialised, and how transcription, translation and epigenetic changes regulate which genes are expressed — and how loss of that control leads to cancer.",
    keyPoints: [
      "Substitution, addition, deletion, duplication, inversion and translocation of bases change DNA; frameshifts usually change every codon after the mutation.",
      "Totipotent cells can become any cell type; pluripotent, multipotent and unipotent cells progressively less; iPS cells are made by switching key genes back on.",
      "Transcription factors move into the nucleus and bind DNA to switch genes on or off; oestrogen acts by releasing a transcription factor from an inhibitor.",
      "Increased DNA methylation and decreased histone acetylation condense chromatin and silence genes; siRNA can block translation of an mRNA.",
    ],
    commonErrors: [
      "Saying every mutation changes the protein — the genetic code is degenerate, so some substitutions are silent.",
      "Confusing tumour suppressor genes (inactivated in cancer) with proto-oncogenes (activated to oncogenes).",
      "Saying epigenetic changes alter the base sequence of DNA.",
    ],
    specPoints: [
      point("describe types of gene mutation and explain how they may alter the encoded protein", ["AO1", "AO2"]),
      point("describe totipotent, pluripotent, multipotent and unipotent stem cells and evaluate their therapeutic use", ["AO1", "AO3"]),
      point("explain the regulation of transcription by transcription factors, oestrogen and epigenetic changes, and of translation by RNA interference", ["AO1", "AO2"]),
      point("explain the roles of oncogenes, tumour suppressor genes and abnormal methylation in the development of tumours"),
      point("describe genome projects and the difficulty of translating the genome of complex organisms into its proteome"),
    ],
  },
  {
    ...base,
    slug: "gene-technology",
    title: "Gene technologies",
    difficulty: 4,
    summary:
      "Producing DNA fragments, amplifying them in vitro by PCR and in vivo with vectors, and using gene probes, DNA hybridisation and genetic fingerprinting in medicine, forensics and agriculture.",
    keyPoints: [
      "Fragments come from reverse transcriptase (mRNA → cDNA), restriction endonucleases (sticky ends) or a gene machine.",
      "PCR cycles: denature at about 95 °C, anneal primers at about 55 °C, extend with Taq polymerase at about 72 °C; the DNA doubles each cycle.",
      "In vivo cloning inserts the fragment into a plasmid with DNA ligase, transforms host cells and uses marker genes to find transformed ones.",
      "Genetic fingerprinting separates VNTR fragments by gel electrophoresis; labelled DNA probes find specific alleles by hybridisation.",
    ],
    commonErrors: [
      "Saying restriction enzymes 'cut DNA anywhere' rather than at specific recognition sequences.",
      "Forgetting that primers are needed in PCR and why Taq polymerase must be heat-stable.",
      "Mixing up genetic fingerprinting (VNTRs) with screening for a specific mutation (probes).",
    ],
    specPoints: [
      point("describe how DNA fragments are produced using reverse transcriptase, restriction endonucleases and a gene machine"),
      point("explain amplification of DNA fragments by PCR and by in vivo cloning with vectors and marker genes", ["AO1", "AO2"]),
      point("describe the use of labelled DNA probes and hybridisation to screen for alleles, and evaluate genetic screening and personalised medicine", ["AO1", "AO3"]),
      point("explain genetic fingerprinting and its uses", ["AO1", "AO2"]),
    ],
  },
];
