import type { BoardUnit } from "../board-outline";

// AQA A-level Chemistry (7405), section by section, checked against the
// published specification (AQA-7404-7405-SP-2015) on 2026-11-06. Units are
// the specification's three sections; references are AQA's own numbering.

export const AQA_CHEMISTRY_SPEC_CHECKED = "2026-11-06";

export const AQA_CHEMISTRY_UNITS: BoardUnit[] = [
  {
    slug: "section-3-1",
    title: "3.1 Physical chemistry",
    topics: [
      { topic: "atomic-structure", specRef: "3.1.1", pointRefs: ["3.1.1.1–3.1.1.2", "3.1.1.2", "3.1.1.2", "3.1.1.3", "3.1.1.3"] },
      { topic: "moles", title: "Amount of substance", specRef: "3.1.2", pointRefs: ["3.1.2.2", "3.1.2.2", "3.1.2.3", "3.1.2.4", "3.1.2.5", "3.1.2.5"] },
      { topic: "bonding", specRef: "3.1.3", pointRefs: ["3.1.3.1–3.1.3.3", "3.1.3.6", "3.1.3.7", "3.1.3.5", "3.1.3.4"] },
      { topic: "energetics", title: "Energetics", specRef: "3.1.4", pointRefs: ["3.1.4.1", "3.1.4.3", "3.1.4.3–3.1.4.4", "3.1.4.4", "3.1.4.2"] },
      { topic: "kinetics", title: "Kinetics and rate equations", specRef: "3.1.5, 3.1.9", pointRefs: ["3.1.5.1", "3.1.5.1–3.1.5.4", "3.1.5.2–3.1.5.3", "3.1.5.5", "3.1.9"] },
      { topic: "equilibria", specRef: "3.1.6, 3.1.10", pointRefs: ["3.1.6.1", "3.1.6.1", "3.1.6.2, 3.1.10", "3.1.6.1", "3.1.6.1"] },
      {
        topic: "redox",
        specRef: "3.1.7, 3.1.11",
        pointRefs: ["3.1.7", "3.1.7", "3.1.11.1", "3.1.11.1", "3.1.11.1"],
        addPoints: [
          { ref: "3.1.11.2", text: "describe and evaluate commercial electrochemical cells, including non-rechargeable, rechargeable and fuel cells", aos: ["AO1", "AO3"] },
        ],
      },
      { topic: "thermodynamics", specRef: "3.1.8", pointRefs: ["3.1.8.1", "3.1.8.1", "3.1.8.2", "3.1.8.2"] },
      { topic: "acids-bases", title: "Acids and bases", specRef: "3.1.12", pointRefs: ["3.1.12.1", "3.1.12.2–3.1.12.3", "3.1.12.4", "3.1.12.6", "3.1.12.5"] },
    ],
  },
  {
    slug: "section-3-2",
    title: "3.2 Inorganic chemistry",
    topics: [
      {
        topic: "periodicity",
        title: "Periodicity, Group 2 and the halogens",
        specRef: "3.2.1–3.2.3",
        // 7405 does not examine the thermal stability of Group 2 carbonates and nitrates.
        pointRefs: ["3.2.1.2", "3.2.1.2", "3.2.2–3.2.3", null, "3.2.3.1"],
        addPoints: [
          { ref: "3.2.2", text: "describe the trends in solubility of Group 2 hydroxides and sulfates and the uses of Group 2 compounds", aos: ["AO1", "AO2"] },
          { ref: "3.2.3.2", text: "describe the reactions of chlorine with water and with cold dilute alkali and the use of chlorine in water treatment", aos: ["AO1", "AO3"] },
        ],
      },
      { topic: "period-3-oxides", specRef: "3.2.4" },
      { topic: "transition-metals", specRef: "3.2.5", pointRefs: ["3.2.5.1", "3.2.5.5–3.2.5.6", "3.2.5.2–3.2.5.3", "3.2.5.4", "3.2.5.5"] },
      { topic: "aqueous-ions", specRef: "3.2.6" },
    ],
  },
  {
    slug: "section-3-3",
    title: "3.3 Organic chemistry",
    topics: [
      {
        topic: "organic-basics",
        title: "Introduction to organic chemistry, isomerism and synthesis",
        specRef: "3.3.1, 3.3.7, 3.3.14",
        pointRefs: ["3.3.1.1", "3.3.1.3", "3.3.1.2", "3.3.14", "3.3.14"],
        addPoints: [
          { ref: "3.3.7", text: "explain optical isomerism, identify chiral centres and explain why a racemic mixture forms from a planar intermediate", aos: ["AO1", "AO2"] },
        ],
      },
      {
        topic: "hydrocarbons",
        title: "Alkanes, halogenoalkanes and alkenes",
        specRef: "3.3.2–3.3.4",
        pointRefs: ["3.3.2.2", "3.3.4.2", "3.3.10.2", "3.3.4.2", "3.3.4.2"],
        addPoints: [
          { ref: "3.3.2.3–3.3.2.4", text: "describe combustion of alkanes and its pollutants, and the free-radical substitution of alkanes by chlorine", aos: ["AO1", "AO2"] },
          { ref: "3.3.3", text: "explain nucleophilic substitution and elimination in halogenoalkanes and the role of chlorine radicals in ozone depletion", aos: ["AO1", "AO2"] },
          { ref: "3.3.4.3", text: "describe addition polymers, their repeating units and properties" },
        ],
      },
      {
        topic: "carbonyls-acids",
        title: "Alcohols, aldehydes, ketones and carboxylic acids",
        specRef: "3.3.5, 3.3.8–3.3.9",
        pointRefs: ["3.3.8", "3.3.9.1", "3.3.9.2", "3.3.12.1", "3.3.14"],
        addPoints: [
          { ref: "3.3.5", text: "describe the production of alcohols, their classification, oxidation by acidified dichromate and dehydration to alkenes", aos: ["AO1", "AO2"] },
        ],
      },
      {
        topic: "aromatics-nitrogen",
        title: "Aromatic chemistry, amines and polymers",
        specRef: "3.3.10–3.3.12",
        // 7405 does not examine diazonium salts or azo coupling.
        pointRefs: ["3.3.10.1", "3.3.10.2", "3.3.11.1", "3.3.11.2", null],
        addPoints: [
          { ref: "3.3.12.2", text: "explain the biodegradability of polyesters and polyamides and evaluate methods of polymer disposal", aos: ["AO1", "AO3"] },
        ],
      },
      { topic: "amino-acids-dna", specRef: "3.3.13", pointRefs: ["3.3.13.1", "3.3.13.2", "3.3.13.3", "3.3.13.4–3.3.13.5"] },
      {
        topic: "spectroscopy",
        title: "Organic analysis, NMR and chromatography",
        specRef: "3.3.6, 3.3.15–3.3.16",
        pointRefs: ["3.3.6.2", "3.3.6.3", "3.3.15", "3.3.15", "3.3.16"],
        addPoints: [
          { ref: "3.3.6.1", text: "identify functional groups using test-tube reactions" },
        ],
      },
    ],
  },
];
