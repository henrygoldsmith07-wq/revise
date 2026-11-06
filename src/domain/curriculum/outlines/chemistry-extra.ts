import type { AoCode } from "../../types";
import type { TopicSpec } from "../helpers";

// Chemistry topics the shared outline never had, for boards whose
// specification examines them as sections of their own (AQA 7405 first).
// Each board places them with its own references (../board-outline.ts).
// Authored, unreviewed reference content.

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

export const CHEMISTRY_EXTRA_TOPICS: TopicSpec[] = [
  {
    ...base,
    slug: "thermodynamics",
    title: "Thermodynamics: Born–Haber cycles, entropy and free energy",
    difficulty: 4,
    summary:
      "Lattice enthalpies from Born–Haber cycles, enthalpies of solution and hydration, entropy, and the Gibbs free-energy change that decides whether a reaction is feasible at a given temperature.",
    keyPoints: [
      "Lattice enthalpy of formation is exothermic; lattice dissociation is the same size but endothermic — state which definition you use.",
      "Smaller, more highly charged ions give a more exothermic lattice enthalpy; a perfect ionic model differs from Born–Haber values when the bonding has covalent character.",
      "ΔH(solution) = lattice dissociation enthalpy + sum of hydration enthalpies.",
      "ΔG = ΔH − TΔS, with ΔS converted to kJ K⁻¹ mol⁻¹; a reaction is feasible when ΔG ≤ 0, and the switch-over temperature is T = ΔH ÷ ΔS.",
    ],
    commonErrors: [
      "Forgetting to convert ΔS from J K⁻¹ mol⁻¹ to kJ K⁻¹ mol⁻¹ before using ΔG = ΔH − TΔS.",
      "Getting the sign of electron affinity wrong: the first is exothermic, the second endothermic.",
      "Saying a feasible reaction must happen quickly — feasibility says nothing about rate.",
    ],
    specPoints: [
      point("define the enthalpy changes in a Born–Haber cycle and use the cycle to calculate a lattice enthalpy", ["AO1", "AO2"]),
      point("compare lattice enthalpies from Born–Haber cycles with perfect ionic model values and use enthalpies of solution and hydration", ["AO2", "AO3"]),
      point("explain entropy change in terms of disorder and calculate ΔS from absolute entropies", ["AO1", "AO2"]),
      point("calculate ΔG and use it to predict feasibility and the temperature at which a reaction becomes feasible", ["AO2"]),
    ],
  },
  {
    ...base,
    slug: "period-3-oxides",
    title: "Period 3 elements and their oxides",
    difficulty: 3,
    summary:
      "How sodium to sulfur react with water and oxygen, how the structure and bonding of the Period 3 oxides explain their melting points, and why their acid–base character changes across the period.",
    keyPoints: [
      "Sodium reacts vigorously with cold water to give NaOH (pH 12–14); magnesium reacts only slowly with cold water but burns in steam to give MgO.",
      "Na₂O and MgO are ionic, high-melting and basic; Al₂O₃ is ionic with covalent character and amphoteric; SiO₂ is giant covalent; P₄O₁₀ and SO₂ are simple molecular and acidic.",
      "Basic oxides react with acids and acidic oxides react with bases; Al₂O₃ reacts with both.",
      "SiO₂ is insoluble in water but still acidic: it reacts with hot concentrated NaOH.",
    ],
    commonErrors: [
      "Saying SiO₂ has a high melting point because of strong intermolecular forces — it is giant covalent.",
      "Calling Al₂O₃ basic or acidic only, rather than amphoteric.",
      "Writing equations for oxide reactions with water without the correct product (H₃PO₄, H₂SO₃).",
    ],
    specPoints: [
      point("describe the reactions of sodium and magnesium with water and of Period 3 elements with oxygen, with equations"),
      point("explain the melting points of the Period 3 oxides in terms of structure and bonding", ["AO1", "AO2"]),
      point("explain the trend from basic to acidic oxides and write equations for their reactions with water, acids and bases", ["AO1", "AO2"]),
    ],
  },
  {
    ...base,
    slug: "aqueous-ions",
    title: "Reactions of ions in aqueous solution",
    difficulty: 4,
    summary:
      "Metal-aqua ions of iron, copper and aluminium: why 3+ aqua ions are more acidic than 2+, their hydroxide precipitates with ammonia and sodium hydroxide, and their reactions with carbonate ions.",
    keyPoints: [
      "[M(H₂O)₆]³⁺ is more acidic than [M(H₂O)₆]²⁺: the higher charge density polarises the water ligands, so they lose H⁺ more readily.",
      "With NaOH or a little NH₃: Fe²⁺ gives a green precipitate, Cu²⁺ blue, Fe³⁺ brown, Al³⁺ white.",
      "Al(OH)₃ is amphoteric and redissolves in excess NaOH; Cu(OH)₂ redissolves in excess ammonia to a deep blue solution.",
      "M²⁺ aqua ions give metal carbonate precipitates with Na₂CO₃; M³⁺ ions give the hydroxide and bubbles of CO₂.",
    ],
    commonErrors: [
      "Expecting M³⁺ aqua ions to form carbonates — they are acidic enough to release CO₂.",
      "Mixing up the colours of iron(II) and iron(III) hydroxide precipitates.",
      "Saying excess ammonia redissolves aluminium hydroxide — only excess hydroxide does.",
    ],
    specPoints: [
      point("explain the acidity of metal-aqua ions in terms of charge density and write hydrolysis equations", ["AO1", "AO2"]),
      point("describe and explain the reactions of Fe²⁺, Cu²⁺, Fe³⁺ and Al³⁺ aqua ions with NaOH, NH₃ and Na₂CO₃, including colours", ["AO1", "AO2"]),
      point("explain the amphoteric behaviour of aluminium hydroxide"),
    ],
  },
  {
    ...base,
    slug: "amino-acids-dna",
    title: "Amino acids, proteins and DNA",
    difficulty: 4,
    summary:
      "The acid–base behaviour of amino acids, peptide bonds and protein structure, enzymes as stereospecific catalysts, the structure of DNA, and how the anticancer drug cisplatin acts.",
    keyPoints: [
      "Amino acids exist as zwitterions; in acid they are protonated (NH₃⁺), in alkali deprotonated (COO⁻).",
      "Peptide bonds form by condensation; acid or alkaline hydrolysis breaks them, and amino acids are separated and identified by thin-layer chromatography.",
      "Enzyme active sites are stereospecific, so only one enantiomer of a substrate fits; drugs can be designed to block an active site.",
      "Cisplatin binds to guanine bases in DNA, stopping replication; its toxicity to healthy cells limits the dose.",
    ],
    commonErrors: [
      "Drawing the zwitterion at the wrong pH, or with both groups neutral.",
      "Confusing hydrogen bonding in secondary structure with disulfide bridges in tertiary structure.",
      "Describing cisplatin as binding to DNA 'by hydrogen bonds' rather than replacing chloride ligands with bonds to nitrogen in guanine.",
    ],
    specPoints: [
      point("describe the acid–base properties of amino acids, including zwitterions, and draw the species at different pH", ["AO1", "AO2"]),
      point("explain peptide formation and hydrolysis, the primary to tertiary structure of proteins, and the separation of amino acids by TLC", ["AO1", "AO2"]),
      point("explain the stereospecificity of enzymes and how inhibitor drugs can act on an active site", ["AO1", "AO2"]),
      point("describe the structure of DNA and explain the action and limitations of cisplatin", ["AO1", "AO3"]),
    ],
  },
];
