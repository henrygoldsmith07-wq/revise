import type { BoardUnit } from "../board-outline";

// AQA A-level Biology (7402), section by section, checked against the
// published specification (AQA-7401-7402-SP-2015) on 2026-11-06. Units are
// the specification's eight sections; references are AQA's own numbering.

export const AQA_BIOLOGY_SPEC_CHECKED = "2026-11-06";

export const AQA_BIOLOGY_UNITS: BoardUnit[] = [
  {
    slug: "section-3-1",
    title: "3.1 Biological molecules",
    topics: [
      {
        topic: "biological-molecules",
        specRef: "3.1.1–3.1.8",
        pointRefs: ["3.1.1", "3.1.2", "3.1.3", "3.1.4.1", "3.1.5.1", "3.1.7"],
        addPoints: [
          { ref: "3.1.6", text: "describe the structure of ATP and its hydrolysis and resynthesis as the immediate energy source of cells" },
          { ref: "3.1.8", text: "describe the roles of hydrogen, iron, sodium and phosphate ions in cells" },
        ],
      },
      // 7402 does not examine Vmax or Km, but an existing question does, so the
      // statement stays and says so rather than claiming a 7402 reference.
      { topic: "enzymes", title: "Enzymes", specRef: "3.1.4.2", pointRefs: [undefined, undefined, undefined, undefined, "Beyond 7402"] },
    ],
  },
  {
    slug: "section-3-2",
    title: "3.2 Cells",
    topics: [
      { topic: "cell-structure", title: "Cell structure", specRef: "3.2.1", pointRefs: ["3.2.1.1–3.2.1.2", "3.2.1.1", "3.2.1.3", "3.2.1.1", "3.2.1.3"] },
      { topic: "cell-cycle", title: "All cells arise from other cells", specRef: "3.2.2" },
      { topic: "membranes-transport", title: "Transport across cell membranes", specRef: "3.2.3" },
      { topic: "immune-system", specRef: "3.2.4" },
    ],
  },
  {
    slug: "section-3-3",
    title: "3.3 Organisms exchange substances with their environment",
    topics: [
      {
        topic: "gas-exchange",
        title: "Surface area to volume ratio and gas exchange",
        specRef: "3.3.1–3.3.2",
        pointRefs: ["3.3.2", "3.3.2", "3.3.2", "3.3.2", "3.3.2"],
        addPoints: [
          { ref: "3.3.1", text: "relate surface area to volume ratio to the size and metabolic rate of an organism and to its adaptations for exchange", aos: ["AO1", "AO2"] },
          { ref: "3.3.2", text: "explain gas exchange in the leaves of dicotyledonous plants and the trade-off with water loss in xerophytes", aos: ["AO1", "AO2"] },
        ],
      },
      { topic: "digestion-absorption", specRef: "3.3.3" },
      { topic: "transport-animals", title: "Mass transport in animals", specRef: "3.3.4.1", pointRefs: ["3.3.4.1", "3.6.1.3", "3.3.4.1", "3.3.4.1", "3.3.4.1"] },
      { topic: "transport-plants", title: "Mass transport in plants", specRef: "3.3.4.2" },
    ],
  },
  {
    slug: "section-3-4",
    title: "3.4 Genetic information, variation and relationships between organisms",
    topics: [
      {
        topic: "nucleic-acids",
        title: "DNA, genes and protein synthesis",
        specRef: "3.1.5.2, 3.4.1–3.4.3",
        pointRefs: ["3.1.5.2", "3.4.2", "3.4.3", "3.2.2, 3.4.3", "3.4.3"],
        addPoints: [
          { ref: "3.4.1", text: "describe DNA in prokaryotic and eukaryotic cells, genes as base sequences coding for polypeptides or functional RNA, and introns and exons" },
        ],
      },
      {
        topic: "biodiversity",
        title: "Genetic diversity, species and biodiversity",
        specRef: "3.4.4–3.4.7",
        pointRefs: ["3.4.5–3.4.6", "3.7.4", "3.4.6", "3.4.4", "3.4.5"],
        addPoints: [
          { ref: "3.4.7", text: "compare genetic diversity using observable characteristics, base sequences of DNA and mRNA, and amino-acid sequences", aos: ["AO1", "AO2"] },
        ],
      },
    ],
  },
  {
    slug: "section-3-5",
    title: "3.5 Energy transfers in and between organisms",
    topics: [
      { topic: "photosynthesis", specRef: "3.5.1" },
      // The respiratory quotient is not in 7402.
      { topic: "respiration", specRef: "3.5.2", pointRefs: [undefined, undefined, undefined, undefined, null] },
      {
        topic: "ecosystems",
        title: "Energy and ecosystems, and nutrient cycles",
        specRef: "3.5.3–3.5.4",
        pointRefs: ["3.5.3", "3.5.3", "3.5.4", "3.7.4", "3.7.4"],
      },
    ],
  },
  {
    slug: "section-3-6",
    title: "3.6 Organisms respond to changes in their internal and external environments",
    topics: [
      { topic: "stimuli-response", specRef: "3.6.1", pointRefs: ["3.6.1.1", "3.6.1.1", "3.6.1.2", "3.6.1.2", "3.6.1.3"] },
      { topic: "nervous-coordination", specRef: "3.6.2–3.6.3", pointRefs: ["3.6.2.1", "3.6.2.1", "3.6.2.2", "3.6.3", "3.6.3"] },
      {
        topic: "homeostasis",
        title: "Homeostasis: blood glucose and water potential",
        specRef: "3.6.4",
        pointRefs: ["3.6.4.1", "3.6.4.2", "3.6.4.3", "3.6.4.3", "3.6.1.1"],
      },
    ],
  },
  {
    slug: "section-3-7",
    title: "3.7 Genetics, populations, evolution and ecosystems",
    topics: [
      { topic: "genetics-inheritance", title: "Inheritance and populations", specRef: "3.7.1–3.7.2", pointRefs: ["3.4.3", "3.7.1", "3.7.1", "3.7.1", "3.7.2"] },
      { topic: "populations-evolution", title: "Evolution, speciation and populations in ecosystems", specRef: "3.7.3–3.7.4", pointRefs: ["3.7.3", "3.7.3", "3.7.4", "3.7.4", "3.7.4"] },
    ],
  },
  {
    slug: "section-3-8",
    title: "3.8 The control of gene expression",
    topics: [
      { topic: "gene-expression", specRef: "3.8.1–3.8.3", pointRefs: ["3.8.1", "3.8.2.1", "3.8.2.2", "3.8.2.3", "3.8.3"] },
      { topic: "gene-technology", specRef: "3.8.4", pointRefs: ["3.8.4.1", "3.8.4.1", "3.8.4.2", "3.8.4.3"] },
    ],
  },
];
