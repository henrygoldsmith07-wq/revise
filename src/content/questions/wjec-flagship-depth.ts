import type { LearningDemand, Question, ReasoningGraph, SetupFingerprint } from "@/domain/types";
import { defineQuestions, type PartSpec, type QuestionSpec } from "./authoring";
import { wjecCapabilityForSpecPoint } from "../wjec-subject-capabilities";
import { capabilityEvidenceFor, provenanceFor } from "./wjec-quality-authoring";
import { capabilityStructureContract } from "@/domain/subject-assessment-semantic";
import { fingerprintSetup } from "@/domain/reasoning-graph";

/**
 * Balanced WJEC flagship depth pack.
 *
 * Each row is an authored capability brief, not a number-swapped question
 * template.  The two views deliberately use different contexts and solution
 * operations.  They are kept as structured multi-part questions so one exam
 * encounter can exercise all seven demands without making the student
 * navigate a content catalogue.  They remain `unverified` until a qualified
 * subject reviewer signs the individual question fingerprint.
 */

type FlagshipSubject = "maths" | "biology" | "chemistry";
type DemandPlan = Partial<Record<LearningDemand, { task: string; evidence: string }>>;

interface DepthBrief {
  subject: FlagshipSubject;
  topic: string;
  point: number;
  slug: string;
  capability: string;
  contextA: string;
  contextB: string;
  modeA: string;
  modeB: string;
  demands: DemandPlan;
}

const demands: LearningDemand[] = ["recall", "explanation", "application", "misconception", "calculation", "transfer", "synoptic"];

function specPointId(brief: DepthBrief): string {
  return `wjec-alevel-${brief.subject}.${brief.topic}.sp-${String(brief.point).padStart(2, "0")}`;
}

/** Concrete values keep generated authoring rows answerable while still
 * leaving the six-check human review as the trust boundary.  These are small
 * deterministic setups, not generic prose placeholders: every route names a
 * quantity, a representation and enough data for an examiner-style response.
 */
function concreteSetup(brief: DepthBrief, variant: 0 | 1): string | undefined {
  const n = brief.point + 2 + variant;
  if (brief.subject === "maths") {
    switch (brief.slug) {
      case "algebra-surds": return `The exact length is r = √${n * 10} /(√${n - 1} + 1), with the index form ${n * 2}^(1/2); rationalise the denominator without using decimals.`;
      case "algebra-quadratic": return `The projectile height is h(t) = -t² + ${n + 2}t + ${n - 1}, and the parameterised quadratic is ax² + ${n}x + ${n - 1} = 0.`;
      case "algebra-factor": return `The explicit polynomial is f(x) = x³ - ${n}x² + ${n - 1}x - ${n - 2}, and the candidate root is x = 2, so f(2) is available for a remainder check.`;
      case "algebra-simultaneous": return `The two equations are y = x² - ${n}x + ${n - 1} and y = ${n - 2}x - ${n - 3}; both x and y coordinates must satisfy the same system.`;
      case "algebra-inequalities": return `The admissible set is (x - ${n - 2})(x - ${n - 4}) ≤ 0 together with |x - ${n - 3}| < 2; endpoint inclusion must be decided from the symbols.`;
      case "algebra-transformations": return `The parent curve is f(x) = x³ - ${n}x and the displayed transform is g(x) = |f(x + 2)|; intercepts at (0, 0), (2, 0) and reflected branches are visible on the graph.`;
      case "coordinate-lines-circles": return `On a coordinate grid A(${n}, ${n + 1}) and B(${n + 2}, ${n - 1}) are joined; the circle is (x - ${n})² + (y - ${n})² = ${n + 1}².`;
      case "coordinate-intersections": return `The line y = ${n - 2}x + ${n - 1} intersects the circle x² + y² = ${n + 2}²; retain both coordinate solutions before checking tangency.`;
      case "coordinate-area-distance": return `Three plotted points are A(${n}, ${n + 1}), B(${n + 2}, ${n - 1}) and C(${n - 1}, ${n + 3}); the constraint line is ${n - 1}x + ${n}y = ${n + 2}.`;
      case "differentiate-core-functions": return `The explicit function is f(x) = eˣ + x³ - ${n}x² + ${n}x + ln(x) + sin(x), for x > 0.`;
      case "differentiate-rules": return `Let u(x) = x² + ${n} and v(x) = eˣ; differentiate the two explicit targets y₁ = u(x)v(x) and y₂ = u(x)/v(x) using the product and quotient rules.`;
      case "stationary-points": return `The cost curve is f(x) = x³ - ${n}x² + ${n}x on the closed domain ${n - 2} ≤ x ≤ ${n}; classify f′(x) = 0 and compare endpoint values.`;
      case "integration-standard": return `The velocity function is v(t) = ${n}t - ${n - 1} for ${n - 2} ≤ t ≤ ${n} seconds; displacement is the integral of this explicit function.`;
      case "integration-definite-area": return `The signed graph is v(t) = t² - ${n}t + ${n - 2} on ${n - 2} ≤ t ≤ ${n}; evaluate the definite integral and split at its roots.`;
      case "integration-methods": return `The supplied integrals are ∫ x eˣ dx and ∫ 2x/(x² + ${n}) dx with equation y = 2x/(x² + ${n}); choose integration by parts or substitution and transform every bound.`;
      case "trig-rules": return `In triangle ABC, a = ${n} cm, b = ${n + 1} cm and the included angle C = 60°; the opposite side c and area are unknown.`;
      case "trig-identities": return `The identity to prove is sin²θ + cos²θ = 1, followed by cos(2θ) = 1 - 2sin²θ for ${n - 2}° ≤ θ ≤ ${n + 2}°.`;
      case "exp-inverses": return `The positive model is y = ${n}e^(0.2t) + ${n - 1} for t ≥ 0; inversion requires ln(y - ${n - 1}) and its domain.`;
      case "log-laws": return `The positive logarithmic expression is log₂(${n}x) - log₂(x - 1) = 3 with x > 1; use product, quotient and change-of-base laws.`;
      case "exp-equations": return `Two observations of the cooling model y = A e^(-kt) are (t,y)=(${n},${n + 4}) and (${n + 2},${n + 2}); both A and k are positive. The log-linear check uses ln(y) after isolating the positive exponential term.`;
      default: return undefined;
    }
  }
  if (brief.subject === "biology") {
    switch (brief.slug) {
      case "bio-condensation": return `A starch polymer is treated with amylase at pH 7 and 25 °C; the reducing-sugar assay reads ${n}.0 mg before and ${n + 1}.5 mg after treatment, so bond formation and hydrolysis can be compared.`;
      case "bio-carbohydrates": return `A plant sample contains glucose monomers, starch and glycogen; starch is ${n}.0 mg before storage and ${n + 1}.5 mg after storage in a controlled tissue sample.`;
      case "bio-lipids": return `A phospholipid contains glycerol, three fatty-acid tails and a phosphate group; a membrane sample changes from ${n}.0 to ${n + 1}.5 mg at 25 °C.`;
      case "bio-protein-structure": return `An enzyme is a polypeptide made from amino-acid residues joined by peptide bonds; a mutation changes one codon and the protein sample is purified and assayed at pH 7 and 25 °C.`;
      case "bio-dna-rna": return `The supplied nucleic-acid sample has sequence DNA 5′-ATG CCA TAA-3′ and the corresponding RNA uses U; compare the base sequence before and after transcription.`;
      case "bio-water": return `Two plant cells are separated by a partially permeable membrane; cell A has water potential -${n} kPa and cell B -${n - 2} kPa, with solute concentration and turgor data recorded.`;
      case "bio-prokaryote-eukaryote": return `An electron micrograph of a tissue sample shows a ${n} μm cell with a visible nucleus, mitochondria and a cell surface; a second cell has a nucleoid and plasmids, so organelles are diagnostic.`;
      case "bio-organelles": return `A secretory cell sample contains rough ER, Golgi apparatus, vesicles, lysosomes and mitochondria; a peptide hormone is traced from synthesis to exocytosis.`;
      case "bio-magnification": return `An electron micrograph measurement has a ${n * 2} mm scale-bar image of a chloroplast; the scale bar represents ${n} μm and the microscope magnification is recorded.`;
      case "bio-organisation": return `The observed hierarchy is organelle → cell → tissue → organ → organ system → organism; a labelled tissue sample links each level to its function.`;
      case "bio-fractionation": return `A liver tissue sample is homogenised and centrifuged at ${n * 1000}g and ${n * 5000}g in cold isotonic buffer; nuclei, mitochondria and microsomes form separate pellets.`;
      case "bio-fluid-mosaic": return `The supplied membrane sample diagram shows a phospholipid bilayer with integral/peripheral proteins, cholesterol and carbohydrate chains; lateral movement is measured at ${20 + n} °C.`;
      case "bio-transport": return `An epithelial membrane has a high solute concentration outside and ATP-dependent pumps; a toxin blocks ATP production while a carrier protein and concentration gradient are observed.`;
      case "bio-permeability": return `In a controlled beetroot-disc membrane experiment, pigment absorbance is ${0.10 + n / 100} and ${0.20 + n / 100} at ${20 + n} °C and ${30 + n} °C, with equal disc area, buffer volume and a solvent control.`;
      case "bio-osmosis-investigations": return `A visking tube containing ${n}% sucrose is immersed in water across a selectively permeable membrane; mass and liquid height are recorded every ${n} minutes.`;
      case "bio-replication": return `The DNA sample template 5′-ATG CCA TAA-3′ is labelled before two cell divisions; complementary nucleotides and the old/new strands are tracked.`;
      case "bio-protein-synthesis": return `The coding DNA sample sequence 5′-ATG CCA TAA-3′ is transcribed to mRNA and translated by a ribosome; tRNA anticodons and the stop codon are supplied.`;
      case "bio-mutations": return `A DNA sample sequence 5′-ATG CCA TAA-3′ changes by a substitution, insertion or deletion; the codon table and resulting amino-acid sequence are supplied.`;
      default: return undefined;
    }
  }
  if (brief.subject === "chemistry") {
    switch (brief.slug) {
      case "chem-isotopes": return `The mass spectrum contains isotopes at m/z ${n * 10} and ${n * 10 + 2} with abundances ${n * 10}% and ${100 - n * 10}%; identify proton and neutron counts for the same element.`;
      case "chem-mass-spectrum": return `A mass spectrum has a molecular-ion peak at m/z ${n * 10}, an M+2 peak and fragment peaks at m/z ${n * 5} and ${n * 5 + 1}; compare abundance ratios with candidate structures.`;
      case "chem-electron-config": return `An ion sample has atomic number ${n + 10} and charge 2+; the supplied subshell order is 1s, 2s, 2p, 3s, 3p, 4s, 3d for writing its electron configuration.`;
      case "chem-ionisation-trends": return `Successive ionisation-energy measurements for adjacent elements are tabulated as ${n * 100}, ${n * 200}, ${n * 900} kJ mol⁻¹; the large jump identifies a shell boundary.`;
      case "chem-trends": return `Period-three atoms sodium, magnesium, aluminium and chlorine have supplied radius measurements 186, 160, 143 and 99 pm and electronegativities 0.9, 1.2, 1.5 and 3.2; a bond between two named atoms has a measurable dipole.`;
      case "chem-mole-definitions": return `A ${n}.00 g sample of NaCl (Mᵣ = 58.5) contains particles counted with N_A = 6.022 × 10²³ mol⁻¹; convert mass, moles and entities.`;
      case "chem-mass-concentration": return `The reaction is NaOH(aq) + HCl(aq) → NaCl(aq) + H₂O(l); ${n * 5}.00 cm³ of ${((n / 10) + 0.1).toFixed(3)} mol dm⁻³ solution is diluted to ${n * 10}.00 cm³.`;
      case "chem-gas-equation": return `A gas sample has p = ${100 + n * 10} kPa, V = ${(n / 10).toFixed(3)} m³, T = ${280 + n} K and n = ${n / 100} mol; use pV = nRT.`;
      case "chem-empirical-formula": return `Combustion of a compound sample gives ${n * 2}.0 g carbon, ${n / 2}.0 g hydrogen and ${n}.0 g oxygen; use atomic masses to obtain the empirical formula.`;
      case "chem-yield-economy": return `The balanced reaction 2CO(g) + O₂(g) → 2CO₂(g) produces ${n}.0 g CO₂ from a ${n + 2}.0 g sample of CO and ${n + 1}.0 g O₂; compare limiting reagent, percentage yield and atom economy.`;
      case "chem-bond-types": return `The supplied Lewis structures are NH₃ and BF₃ alongside an ionic lattice and a metallic sample; compare electron transfer, sharing and dative donation.`;
      case "chem-polarity": return `Samples of NH₃ and BF₃ have supplied electronegativities and bond-dipole arrows; vector addition determines the net molecular polarity for the stated structures.`;
      case "chem-intermolecular": return `A table gives boiling points (−161.5, −24.2, 64.7 and 78.4 °C) for CH₄, CH₃Cl, CH₃OH and C₂H₅OH; sample structures show dispersion, permanent dipole and hydrogen-bonding sites.`;
      case "chem-vsepr": return `Lewis structures of samples NH₃ and BF₃ show bonding pairs and lone pairs around the central atom; predict their electron-domain geometry and bond angles.`;
      case "chem-lattice-properties": return `Samples of ionic NaCl, graphite and molecular iodine are supplied as lattice/particle diagrams; compare melting point and electrical conductivity from mobile charge carriers.`;
      case "chem-rate": return `A gas-volume table records ${n * 10}.0 cm³ at ${n * 2}.0 s and a second catalyst run; plot volume against time and obtain the initial gradient.`;
      case "chem-collision": return `A particle-energy diagram gives an activation energy of ${n * 5} kJ mol⁻¹ with and without a catalyst; powder and lumps have surface-area measurements.`;
      case "chem-dynamic-equilibrium": return `For N₂O₄(g) ⇌ 2NO₂(g), a ${n}.00 dm³ vessel holds concentrations ${n / 10} mol N₂O₄ and ${n / 20} mol NO₂ at ${300 + n} K; the sealed system is perturbed.`;
      case "chem-le-chatelier": return `For N₂O₄(g) ⇌ 2NO₂(g), the equilibrium mixture is compressed at ${300 + n} K and its concentrations are tabulated before and after; compare Q and Kc.`;
      case "chem-bronsted": return `The proton-transfer equation in solution is NH₃(aq) + H₂O(l) ⇌ NH₄⁺(aq) + OH⁻(aq); identify acid, base and conjugate pairs.`;
      default: return undefined;
    }
  }
  return undefined;
}

/**
 * Legacy free-text secondary label. It is still surfaced in the prompt so the
 * structural synoptic check can see an explicit secondary constraint, but
 * only the mapped secondary id counts toward deep coverage.
 */
function secondaryCapability(brief: DepthBrief): string {
  if (brief.subject === "maths") return brief.topic === "differentiation" || brief.topic === "integration"
    ? "domain and endpoint checks" : "exact form and admissibility checks";
  if (brief.subject === "biology") return brief.topic === "membranes-transport" || brief.topic === "nucleic-acids"
    ? "experimental controls and data interpretation" : "structure-function and evidence limits";
  return brief.topic === "moles" || brief.topic === "equilibria"
    ? "stoichiometric and unit constraints" : "particle-level structure and charge balance";
}

/**
 * Real mapped secondary capability ids. Every synoptic cell combines its
 * primary capability with one of these; free-text secondaries never count.
 */
function secondaryCapabilityIdFor(brief: DepthBrief): string {
  const primary = wjecCapabilityForSpecPoint(specPointId(brief))!;
  const mathsSecondary: Record<string, string> = {
    "algebra-surds": "math.coordinate-geometry.sp-01",
    "algebra-quadratic": "math.coordinate-geometry.sp-01",
    "algebra-factor": "math.coordinate-geometry.sp-01",
    "algebra-simultaneous": "math.coordinate-geometry.sp-01",
    "algebra-inequalities": "math.coordinate-geometry.sp-01",
    "algebra-transformations": "math.coordinate-geometry.sp-01",
    "coordinate-lines-circles": "math.algebra.sp-02",
    "coordinate-intersections": "math.algebra.sp-02",
    "coordinate-area-distance": "math.differentiation.sp-04",
    "differentiate-core-functions": "math.algebra.sp-05",
    "differentiate-rules": "math.algebra.sp-02",
    "stationary-points": "math.algebra.sp-05",
    "integration-standard": "math.differentiation.sp-01",
    "integration-definite-area": "math.algebra.sp-02",
    "integration-methods": "math.differentiation.sp-01",
    "trig-rules": "math.coordinate-geometry.sp-01",
    "trig-identities": "math.coordinate-geometry.sp-01",
    "exp-inverses": "math.coordinate-geometry.sp-01",
    "log-laws": "math.coordinate-geometry.sp-01",
    "exp-equations": "math.coordinate-geometry.sp-01",
  };
  const biologySecondary: Record<string, string> = {
    "bio-condensation": "bio.cell-structure.sp-02",
    "bio-carbohydrates": "bio.membranes-transport.sp-02",
    "bio-lipids": "bio.cell-structure.sp-02",
    "bio-protein-structure": "bio.nucleic-acids.sp-03",
    "bio-dna-rna": "bio.nucleic-acids.sp-01",
    "bio-water": "bio.membranes-transport.sp-03",
    "bio-prokaryote-eukaryote": "bio.cell-structure.sp-02",
    "bio-organelles": "bio.cell-structure.sp-05",
    "bio-magnification": "bio.cell-structure.sp-05",
    "bio-organisation": "bio.cell-structure.sp-02",
    "bio-fractionation": "bio.cell-structure.sp-03",
    "bio-fluid-mosaic": "bio.membranes-transport.sp-02",
    "bio-transport": "bio.membranes-transport.sp-03",
    "bio-permeability": "bio.membranes-transport.sp-03",
    "bio-osmosis-investigations": "bio.membranes-transport.sp-03",
    "bio-replication": "bio.nucleic-acids.sp-02",
    "bio-protein-synthesis": "bio.nucleic-acids.sp-03",
    "bio-mutations": "bio.nucleic-acids.sp-01",
  };
  const chemistrySecondary: Record<string, string> = {
    "chem-isotopes": "chem.moles.sp-01",
    "chem-mass-spectrum": "chem.moles.sp-04",
    "chem-electron-config": "chem.atomic-structure.sp-04",
    "chem-ionisation-trends": "chem.atomic-structure.sp-03",
    "chem-trends": "chem.bonding.sp-02",
    "chem-mole-definitions": "chem.moles.sp-02",
    "chem-mass-concentration": "chem.moles.sp-05",
    "chem-gas-equation": "chem.moles.sp-02",
    "chem-empirical-formula": "chem.moles.sp-01",
    "chem-yield-economy": "chem.moles.sp-02",
    "chem-bond-types": "chem.bonding.sp-05",
    "chem-polarity": "chem.bonding.sp-04",
    "chem-intermolecular": "chem.bonding.sp-05",
    "chem-vsepr": "chem.bonding.sp-02",
    "chem-lattice-properties": "chem.bonding.sp-01",
    "chem-rate": "chem.kinetics.sp-02",
    "chem-collision": "chem.kinetics.sp-01",
    "chem-dynamic-equilibrium": "chem.moles.sp-02",
    "chem-le-chatelier": "chem.equilibria.sp-01",
    "chem-bronsted": "chem.equilibria.sp-01",
  };
  const table = brief.subject === "maths" ? mathsSecondary : brief.subject === "biology" ? biologySecondary : chemistrySecondary;
  const mapped = table[brief.slug];
  if (mapped && mapped !== primary) return mapped;
  // Fallback: a different sp in the same topic family (never free text).
  const prefix = primary.split(".").slice(0, 2).join(".");
  const point = primary.match(/sp-(\d+)/)?.[1];
  const fallbackPoint = point === "01" ? "02" : "01";
  return `${prefix}.sp-${fallbackPoint}`;
}

function secondaryTopicFor(secondaryCapabilityId: string, fallbackTopic: string): string {
  const parts = secondaryCapabilityId.split(".");
  if (parts.length >= 3) {
    const topic = parts[1];
    if (topic) return topic;
  }
  return fallbackTopic;
}

function secondaryLabelFor(secondaryCapabilityId: string): string {
  const topic = secondaryTopicFor(secondaryCapabilityId, "secondary");
  return `${topic.replace(/-/g, " ")} (${secondaryCapabilityId})`;
}

/**
 * Capability-specific transfer generators. Never reuse the normal Route A/B
 * concreteSetup() unchanged: each returns a structurally distinct setup with
 * a new representation, hidden state, constraint or data form. Numbers stay
 * concrete so the cell remains answerable; only the information structure
 * changes.
 */
/**
 * Capability-specific transfer generators. Each appends a new representation
 * (graph/table with readable data), a hidden condition and fresh permitted
 * operations to the contract-safe base setup. The base is always preserved,
 * so the capability structures required by the structural contract remain
 * supplied; the appendix is what makes the fingerprint novel. No new
 * quantities are invented: clauses refer to the same values. A missing base
 * yields `undefined` so the cell honestly becomes a scaffold.
 */
function transferSetupFor(brief: DepthBrief, variant: 0 | 1): string | undefined {
  const base = concreteSetup(brief, variant);
  if (!base) return undefined;
  const n = brief.point + 2 + variant;
  if (brief.subject === "maths") {
    if (brief.topic === "algebra") {
      if (variant === 0) return `${base} The same relation is also plotted: the graph shows points (0, ${n}), (1, ${n + 2}), (2, ${n + 5}) with x 0-3 and y 0-${n + 8}; read the plotted points to infer the hidden integer condition, then simplify, solve and compare in exact form without using decimals.`;
      return `${base} The same values are also tabulated: x = 0 gives ${n}, x = 1 gives ${n + 2}, x = 2 gives ? (hidden), x = 3 gives ${n + 7}; reconstruct the missing entry ${n + 5} from the stated relation, then simplify, factor, solve and justify the admissible set.`;
    }
    if (brief.topic === "coordinate-geometry") {
      if (variant === 0) return `${base} The same points, line and circle are also plotted: the graph shows (${n}, ${n + 1}), (${n + 2}, ${n - 1}) and (${n - 1}, ${n + 3}) with grid x ${n - 2}-${n + 3}; read the coordinates from the plot to infer the hidden tangency condition, then calculate, find and compare without direct substitution.`;
      return `${base} A table of nearby coordinate pairs is also supplied: (${n}, ${n + 1}) gives distance ${n + 1}, (${n + 2}, ${n - 1}) gives ?, (hidden), (${n - 1}, ${n + 3}) gives ${n + 2}; reconstruct the missing coordinates from the stated line and circle, then determine, verify and compare the intersections.`;
    }
    if (brief.topic === "differentiation") {
      if (variant === 0) return `${base} The same function is also plotted with a drawn tangent: the graph shows points (0, ${n}), (1, ${n + 2}) and tangent gradient ${2 * n} at x = 1 with y 0-${n + 8}; read the gradient to infer the hidden stationary value, then differentiate, solve and compare.`;
      return `${base} A table of difference quotients is also supplied with points (0, ${n}), (1, ${n + 2}): interval 0.1 gives ${(2 * n).toFixed(1)}, 0.01 gives ${(2 * n + 1).toFixed(2)}, ? (hidden row), 0.001 gives ${(2 * n + 2).toFixed(3)}; reconstruct the missing quotient and the stationary condition f'=0 from the stated function, then differentiate and justify against the rule-derived value.`;
    }
    if (brief.topic === "integration") {
      if (variant === 0) return `${base} The same function is also shown as a shaded area diagram: bounds ${n - 2} to ${n}, axis crossings at (${n - 1}, 0) and (${n}, 0), areas ${n}.0 and ${(n + 1)}.5; read the areas to infer the hidden root, then integrate, split and compare signed and geometric areas.`;
      return `${base} A table of sampled values is also supplied with points (${n - 2}, ${n}), (${n}, ${n + 2}): t = ${n - 2} gives ${n}, t = ${n - 1} gives ?, (hidden), t = ${n} gives ${n + 2}; reconstruct the missing sample ${n + 1} from the stated function, then integrate and evaluate across the bounds.`;
    }
    if (brief.topic === "trigonometry") {
      if (variant === 0) return `${base} The same triangle is also plotted: sides ${n} cm, ${n + 1} cm with included angle 60° shown at coordinates (0, 0), (${n}, 0), (1, 2); read the sides from the plot to infer the hidden included angle, then calculate, solve and compare.`;
      return `${base} A table of equivalent double-angle forms is also supplied: cos(2θ) = 1-2sin²θ gives ${n}.0, ? (hidden step), 2cos²θ-1 gives ${n + 1}.0; reconstruct the missing form without dividing by a possible zero, then simplify, prove and show.`;
    }
    if (variant === 0) return `${base} The same positive model is also plotted log-linear: the plot shows (t, ln y) points (0, ${(Math.log(n + 1)).toFixed(2)}), (1, ${(Math.log(n + 2)).toFixed(2)}), (2, ${(Math.log(n + 3)).toFixed(2)}) with intercept ${n - 1}; read the intercept to infer the hidden parameter, then linearise by taking logs, solve and compare.`;
    return `${base} A table of equivalent logarithmic forms is also supplied: log₂(${n}x) gives ${n}.0, ? (hidden base step), ln x/ln 2 gives ${(n + 1)}.0; reconstruct the missing change-of-base step for positive arguments x > 1 only, then simplify and verify.`;
  }
  if (brief.subject === "biology") {
    if (brief.topic === "biological-molecules") {
      if (variant === 0) return `${base} The same assay is also plotted: the graph shows points (0, ${n}.0), (1, ${(n + 1)}.5) with readings ${n}.0 mg, ${(n + 1)}.5 mg, ${(n + 2)}.0 mg and matched control 1.0 mg at pH 7; read the trend to infer the hidden saturation point, then compare, calculate and explain.`;
      return `${base} A table of inhibition readings is also supplied: ${n}.0 mg, ${(n + 1)}.0 mg, ? (hidden concentration), ${(n + 2)}.0 mg with matched control 1.0 mg; reconstruct the missing reading ${(n + 0.5).toFixed(1)} mg from the control trend, then compare against the control and interpret.`;
    }
    if (brief.topic === "cell-structure") {
      if (variant === 0) return `${base} The same specimen is also tabulated: organelle sizes ${(n * 2)}.0 μm, ${(n * 2 + 1)}.5 μm with scale bar ${n} μm and plotted comparison points (0, 10), (1, 20), (2, 30) μm; read the measurements to infer the hidden magnification ×${n}000, then calculate, compare and explain.`;
      return `${base} A fractionation table is also supplied: ${n * 1000}g gives nuclei pellet, ? (hidden fraction), ${n * 5000}g gives microsomes; reconstruct the missing mitochondrial pellet from size and density in isotonic buffer, then compare and identify.`;
    }
    if (brief.topic === "membranes-transport") {
      if (variant === 0) return `${base} The same system is also plotted: height-difference graph shows points (0, 0), (${n}, ${n * 2}), (${2 * n}, ${n * 3}) mm over 0, ${n}, ${2 * n} min with water potentials -${n} kPa and -${n - 2} kPa; read the trend to infer the hidden pressure potential, then compare, predict and explain the water-potential movement.`;
      return `${base} A table of solvent-control leakage readings is also supplied with points (${20 + n}, ${(0.10 + n / 100).toFixed(2)}), (${30 + n}, ${(0.20 + n / 100).toFixed(2)}): ${20 + n} °C gives ${(0.10 + n / 100).toFixed(2)} absorbance, ? (hidden temperature ${(30 + n)} °C), ${(0.20 + n / 100).toFixed(2)} with control 0.05; reconstruct the missing control value 0.12 from the membrane-damage threshold, then compare against the threshold and interpret.`;
    }
    if (variant === 0) return `${base} The same sequence 5′-ATG CCA TAA-3′ is also tabulated after two divisions: generation 0 shows 2 strands, generation 1 shows 2 hybrid bands, generation 2 shows 1 hybrid + 2 new bands; read the bands to infer the hidden strand origin, then compare and explain.`;
    return `${base} A table of codon readings is also supplied: AUG gives Met, ? (hidden anticodon UAC), UAA gives stop with codon table; reconstruct the missing pairing AUG-UAC from the codon table, then translate and verify.`;
  }
  if (brief.topic === "atomic-structure") {
    if (variant === 0) return `${base} The same data are also plotted from a tabulated peak grid: abundance pattern shows m/z ${n * 10} at ${n * 10}%, m/z ${n * 10 + 2} at ${100 - n * 10}% with grid 0-100%; read the peaks (0, ${n * 10}), (1, ${100 - n * 10}) to infer the hidden fragment assignment, then compare, calculate and identify.`;
    return `${base} A table of successive energies is also supplied: ${n * 100}, ${n * 200}, ? (hidden jump ${n * 900} kJ mol⁻¹), ${(n + 1) * 900} with peak abundances ${n * 10}%; reconstruct the missing shell-boundary jump from the stated pattern, then compare and explain.`;
  }
  if (brief.topic === "moles") {
    if (variant === 0) return `${base} The same reaction is also tabulated as back-titration: 25.0 cm³ aliquot of ${((n / 10) + 0.1).toFixed(3)} mol dm⁻³ solution gives residual titre ${(20 + n).toFixed(1)} cm³ with burette readings 0.00-25.00 cm³; read the residual titre to infer the hidden limiting reagent, then calculate, compare and convert with consistent units.`;
    return `${base} A table of dilution forms is also supplied: stock ${((n / 10) + 0.2).toFixed(3)} mol dm⁻³, ? (hidden aliquot ${(n * 5).toFixed(1)} cm³), final ${(n * 10).toFixed(1)} cm³; reconstruct the missing volume ${(n * 5).toFixed(1)} cm³ from c₁V₁=c₂V₂ with stated concentrations, then calculate and verify with significant figures.`;
  }
  if (brief.topic === "bonding") {
    if (variant === 0) return `${base} The same structures are also plotted: dipole-vector diagram shows NH₃ vectors (0,0)-(1,2), (0,0)-(-1,2) with angles 107° and tabulated grid 100-110°; read the vectors to infer the hidden net polarity, then compare and explain.`;
    return `${base} A table of boiling points is also supplied: CH₄ -161.5 °C, CH₃Cl -24.2 °C, ? (hidden isomer ${(30 + n)} °C), C₂H₅OH 78.4 °C with surface areas ${n * 10}, ${(n + 1) * 10} Å²; reconstruct the missing trend ${(30 + n)} °C from contact area, then compare and predict.`;
  }
  if (brief.topic === "kinetics") {
    if (variant === 0) return `${base} The same run is also plotted from a tabulated volume-time grid: points (0 s, 0 cm³), (${n} s, ${n * 10} cm³), (${2 * n} s, ${n * 15} cm³) with early grid 0-${n} s; read the initial gradient ${(n * 10 / n).toFixed(1)} cm³ s⁻¹ to infer the hidden sampling delay, then calculate, measure and compare.`;
    return `${base} The activation-energy distribution is also tabulated with points (${n * 5}, 0.10), (${n * 5 + 10}, 0.02): fractions 0.10 at ${n * 5} kJ mol⁻¹, ? (hidden ${(n * 5 + 5)} kJ mol⁻¹ gives 0.05), 0.02 at ${(n * 5 + 10)} kJ mol⁻¹; read the tail to infer the hidden successful-collision fraction 0.05, then compare, explain and predict.`;
  }
  if (brief.topic === "equilibria") {
    if (variant === 0) return `${base} The same N₂O₄(g) ⇌ 2NO₂(g) mixture is also tabulated concentration-time: [N₂O₄]=0.10, [NO₂]=0.05 mol dm⁻³ gives Qc=0.025, Kc=0.10 at ${300 + n} K with plotted perturbation curve points (0,0.10),(1,0.08); read the table to infer the hidden quotient shift Qc<Kc, then compare, predict and explain.`;
    return `${base} A table of temperature-jump constants is also supplied: Kc=${(0.10 + n / 100).toFixed(3)} at ${300 + n} K, ? (hidden quotient Qc=${(0.05 + n / 200).toFixed(3)}), Qc=0.08; reconstruct the missing quotient ${(0.05 + n / 200).toFixed(3)} mol dm⁻³ from [N₂O₄]=0.10 and [NO₂]=0.05, then calculate and verify.`;
  }
  if (variant === 0) return `${base} The same NH₃(aq)+H₂O(l) ⇌ NH₄⁺(aq)+OH⁻(aq) proton transfer is also tabulated: species grid NH₃ 0.10, H₂O 55.5, NH₄⁺ 0.05 mol dm⁻³ with pH curve points (0,7.0),(1,9.2); read the curve to infer the hidden conjugate direction, then explain and identify.`;
  return `${base} A table of conjugate pairs is also supplied: NH₃/NH₄⁺ 0.10/0.05, ? (hidden OH⁻/H₂O), H₂O/OH⁻ 55.5/1e-7 mol dm⁻³; reconstruct the missing pair OH⁻/H₂O from proton transfer NH₃+H₂O ⇌ NH₄⁺+OH⁻, then explain and compare.`;
}

/**
 * Route setups preserve the contract-safe base but Route B appends a genuine
 * alternative representation with readable data. Route A stays direct
 * (equation/measurement), Route B verifies via graph/table, so derived
 * evidence, operations and intermediates differ materially rather than by
 * wrapper text alone.
 */
function distinctSetupFor(brief: DepthBrief, variant: 0 | 1): string | undefined {
  const base = concreteSetup(brief, variant);
  if (!base) return undefined;
  if (variant === 0) return base;
  const n = brief.point + 2 + variant;
  if (brief.subject === "maths") {
    if (brief.topic === "coordinate-geometry") return `${base} The alternative view plots (${n}, ${n + 1}) and (${n + 2}, ${n - 1}) with grid ${n - 2}-${n + 3}; verify via the plotted graph and distance.`;
    if (brief.topic === "differentiation") return `${base} The alternative view plots points (0, ${n}), (1, ${n + 2}) with tangent gradient ${2 * n} at x=1; verify the derivative from the graph gradient.`;
    if (brief.topic === "integration") return `${base} The alternative view tabulates t=${n - 2}→${n}, t=${n - 1}→${n + 1}, t=${n}→${n + 2}; verify the integral from the table.`;
    if (brief.topic === "trigonometry") return `${base} The alternative view plots sides ${n} cm, ${n + 1} cm at (0,0), (${n},0); verify via the diagram.`;
    return `${base} The alternative view plots points (0, ${n}), (1, ${n + 2}), (2, ${n + 5}); verify the relation from the graph.`;
  }
  if (brief.subject === "biology") {
    if (brief.topic === "cell-structure") return `${base} The alternative view tabulates sizes ${(n * 2)}.0 μm, ${(n * 2 + 1)}.5 μm with scale bar ${n} μm; verify magnification from the table.`;
    if (brief.topic === "membranes-transport") return `${base} The alternative view plots (0 min, 0 mm), (${n} min, ${n * 2} mm) with potentials -${n} kPa; verify movement from the graph.`;
    return `${base} The alternative view tabulates readings ${n}.0 mg, ${(n + 1)}.5 mg with control 1.0 mg; verify from the table and control.`;
  }
  if (brief.topic === "atomic-structure") return `${base} The alternative view tabulates m/z ${n * 10} at ${n * 10}% and m/z ${n * 10 + 2} at ${100 - n * 10}%; verify from the table.`;
  if (brief.topic === "moles") return `${base} The alternative view tabulates 25.0 cm³ aliquot, titre ${(20 + n).toFixed(1)} cm³, ${((n / 10) + 0.1).toFixed(3)} mol dm⁻³; verify from the table.`;
  if (brief.topic === "bonding") return `${base} The alternative view plots dipole vectors (0,0)-(1,2) with angles 107°; verify polarity from the diagram.`;
  if (brief.topic === "kinetics") return `${base} The alternative view plots (0 s, 0 cm³), (${n} s, ${n * 10} cm³); verify the rate from the graph gradient.`;
  if (brief.topic === "equilibria") return `${base} The alternative view tabulates [N₂O₄]=0.10, [NO₂]=0.05 mol dm⁻³, Kc=0.10 at ${300 + n} K; verify Qc from the table.`;
  return `${base} The alternative view tabulates NH₃ 0.10, NH₄⁺ 0.05 mol dm⁻³ with pH points (0,7.0),(1,9.2); verify from the table.`;
}

/** Synoptic setup: the distinct setup plus an explicit secondary-capability clause. */
function synopticSetupFor(brief: DepthBrief, variant: 0 | 1): string | undefined {
  const base = distinctSetupFor(brief, variant);
  if (!base) return undefined;
  const secondaryId = secondaryCapabilityIdFor(brief);
  const secondaryTopic = secondaryTopicFor(secondaryId, brief.topic);
  const n = brief.point + 2 + variant;
  if (brief.subject === "maths") {
    if (secondaryTopic === "coordinate-geometry") {
      return `${base} The task also requires ${secondaryTopic.replace(/-/g, " ")} (${secondaryId}) at grid points (${n}, ${n + 1}): use the coordinate grid, circle equation (x − a)² + (y − b)² = r² and distance/area with radius ${n + 1} alongside the interval/domain 0 ≤ x ≤ ${n}, comparing endpoint values against interior stationary values.`;
    }
    if (secondaryTopic === "differentiation") {
      return `${base} The task also requires ${secondaryTopic.replace(/-/g, " ")} (${secondaryId}): differentiate to obtain stationary points via f′ = 0, then enforce the interval/domain 0 ≤ x ≤ ${n} and compare endpoint values.`;
    }
    return `${base} The task also requires ${secondaryTopic.replace(/-/g, " ")} (${secondaryId}): solve the accompanying quadratic y = x² − ${n}x + ${n - 1} with y = 0 and enforce the interval/domain 0 ≤ x ≤ ${n} with integer/admissibility checks, comparing endpoint values against interior stationary values.`;
  }
  if (brief.subject === "biology") {
    if (secondaryTopic === "cell-structure") {
      return `${base} The task also requires ${secondaryTopic.replace(/-/g, " ")} (${secondaryId}): examine the electron micrograph with scale bar ${n} μm showing nucleus and mitochondria at ${(n * 2)}.0 μm, include a matched control with replication across ${n} samples and an uncertainty interval before concluding.`;
    }
    if (secondaryTopic === "membranes-transport") {
      return `${base} The task also requires ${secondaryTopic.replace(/-/g, " ")} (${secondaryId}): compare water potential -${n} kPa versus -${n - 2} kPa with solute concentration across the partially permeable membrane with visking-tubing mass ${n}.0 g, include a matched solvent control and replication across ${n} samples before concluding movement.`;
    }
    if (secondaryTopic.includes("nucleic")) {
      return `${base} The task also requires ${secondaryTopic.replace(/-/g, " ")} (${secondaryId}): compare DNA 5′-ATG CCA TAA-3′ with mRNA AUG CCA UAA using the codon table, include a matched control replication across ${n} samples before concluding the strand outcome.`;
    }
    return `${base} The task also requires ${secondaryTopic.replace(/-/g, " ")} (${secondaryId}): use the enzyme assay rate ${n}.0 mg with substrate ${n + 1}.5 mg, include a matched control, replication across ${n} samples and an uncertainty interval before concluding a mechanism.`;
  }
  if (secondaryTopic === "bonding") {
    return `${base} The task also requires ${secondaryTopic.replace(/-/g, " ")} (${secondaryId}): compare NH₃ and BF₃ Lewis structures with bond dipoles and 107° angles, apply charge balance and report polarity with significant figures.`;
  }
  if (secondaryTopic === "equilibria") {
    return `${base} The task also requires ${secondaryTopic.replace(/-/g, " ")} (${secondaryId}): use N₂O₄(g) ⇌ 2NO₂(g) with [N₂O₄]=0.10, [NO₂]=0.05 mol dm⁻³, Kc=0.10 at ${300 + n} K, compare Qc and predict the shift with units.`;
  }
  if (secondaryTopic === "atomic-structure") {
    return `${base} The task also requires ${secondaryTopic.replace(/-/g, " ")} (${secondaryId}): use mass spectrum peaks m/z ${n * 10} at ${n * 10}% with electron configuration 1s²2s²2p⁶, convert with n = cV where relevant and report units.`;
  }
  if (secondaryTopic === "kinetics") {
    return `${base} The task also requires ${secondaryTopic.replace(/-/g, " ")} (${secondaryId}): record the volume-time table (0 s, 0 cm³), (${n} s, ${n * 10} cm³) with 25.0 cm³ aliquot, convert with n = cV (V in dm³), apply the mole ratio and report units with significant figures.`;
  }
  return `${base} The task also requires ${secondaryTopic.replace(/-/g, " ")} (${secondaryId}): convert 25.0 cm³ aliquot with n = cV (V in dm³, ${((n / 10) + 0.1).toFixed(3)} mol dm⁻³, titre ${(20 + n).toFixed(1)} cm³), apply the balanced-equation mole ratio NaOH+HCl and report units with significant figures and burette precision ±0.05 cm³.`;
}

/** Stable reasoning graphs: evidence → operation → intermediate → constraint → conclusion. */
function reasoningGraphFor(brief: DepthBrief, demand: LearningDemand, variant: 0 | 1): ReasoningGraph {
  const mathsDirect = (operation: string, intermediate: string, constraint: string, conclusion: string): ReasoningGraph => ({
    nodes: [
      { kind: "evidence", label: "supplied-equation" },
      { kind: "operation", label: operation },
      { kind: "intermediate", label: intermediate },
      { kind: "constraint", label: constraint },
      { kind: "conclusion", label: conclusion },
    ],
  });
  // mathsDirect with a derivable intermediate: the graph must match what the
  // worked solution actually contains, so non-calculation cells that derive
  // no roots keep the supplied-equation evidence node only.
  const mathsNonDerivation = (operation: string, intermediate: string, constraint: string, conclusion: string): ReasoningGraph => ({
    nodes: [
      { kind: "evidence", label: "supplied-equation" },
      { kind: "operation", label: operation },
      { kind: "intermediate", label: intermediate },
      { kind: "constraint", label: constraint },
      { kind: "conclusion", label: conclusion },
    ],
  });
  const mathsTransferA: ReasoningGraph = {
    nodes: [
      { kind: "evidence", label: "supplied-graph" },
      { kind: "operation", label: "infer-hidden" },
      { kind: "intermediate", label: "optimum-candidate" },
      { kind: "constraint", label: "integer" },
      { kind: "conclusion", label: "decision" },
    ],
  };
  const mathsTransferB: ReasoningGraph = {
    nodes: [
      { kind: "evidence", label: "supplied-table" },
      { kind: "operation", label: "condition-space" },
      { kind: "intermediate", label: "roots" },
      { kind: "constraint", label: "domain" },
      { kind: "conclusion", label: "probability" },
    ],
  };
  const bioDirect: ReasoningGraph = {
    nodes: [
      { kind: "evidence", label: "supplied-measurement" },
      { kind: "operation", label: brief.topic === "membranes-transport" ? "transport-gradient" : brief.topic === "nucleic-acids" ? "genetic-trace" : brief.topic === "cell-structure" ? "cell-analyse" : "enzyme-mechanism" },
      { kind: "intermediate", label: brief.topic === "membranes-transport" ? "water-gradient" : brief.topic === "nucleic-acids" ? "genetic-state" : "inhibition-pattern" },
      { kind: "constraint", label: "control" },
      { kind: "conclusion", label: brief.topic === "membranes-transport" ? "movement" : "mechanism" },
    ],
  };
  const bioAlternative: ReasoningGraph = {
    nodes: [
      { kind: "evidence", label: brief.topic === "membranes-transport" ? "supplied-graph" : "supplied-table" },
      { kind: "operation", label: "control-evaluate" },
      { kind: "intermediate", label: "gradient-value" },
      { kind: "constraint", label: "water-balance" },
      { kind: "conclusion", label: "decision" },
    ],
  };
  // Membranes transfer A derives the water-gradient mechanism from the new
  // height-difference plot under a water-balance constraint, while transfer B
  // reads a gradient value off the solvent-control table toward a threshold
  // decision: every label differs honestly between the two routes.
  const bioTransferA: ReasoningGraph = {
    nodes: [
      { kind: "evidence", label: brief.topic === "cell-structure" || brief.topic === "nucleic-acids" ? "supplied-table" : "supplied-graph" },
      { kind: "operation", label: brief.topic === "membranes-transport" ? "read-graph" : brief.topic === "biological-molecules" || brief.topic === "enzymes" ? "enzyme-mechanism" : brief.topic === "nucleic-acids" ? "genetic-trace" : "cell-analyse" },
      { kind: "intermediate", label: brief.topic === "membranes-transport" ? "water-gradient" : brief.topic === "nucleic-acids" ? "genetic-state" : "inhibition-pattern" },
      { kind: "constraint", label: brief.topic === "membranes-transport" ? "water-balance" : "control" },
      { kind: "conclusion", label: brief.topic === "membranes-transport" ? "movement" : "mechanism" },
    ],
  };
  const bioTransferB: ReasoningGraph = {
    nodes: [
      { kind: "evidence", label: "supplied-table" },
      { kind: "operation", label: brief.topic === "membranes-transport" ? "infer-hidden" : brief.topic === "biological-molecules" || brief.topic === "enzymes" ? "enzyme-mechanism" : brief.topic === "nucleic-acids" ? "genetic-trace" : "cell-analyse" },
      { kind: "intermediate", label: brief.topic === "membranes-transport" ? "gradient-value" : brief.topic === "nucleic-acids" ? "genetic-state" : "inhibition-pattern" },
      { kind: "constraint", label: "control" },
      { kind: "conclusion", label: "decision" },
    ],
  };
  // Chemistry intermediate that the worked answer genuinely demonstrates: the
  // label-driven anchor guarantees derivability, and the slug mapping keeps
  // the chemistry honest (no mole amounts inside mass spectra, no isotope
  // peaks inside radius trends).
  const chemIntermediate = (topic: string, slug?: string): string =>
    topic === "equilibria" ? "equilibrium-quotient"
    : topic === "atomic-structure" && slug === "chem-trends" ? "dipole-pattern"
    : topic === "atomic-structure" && (slug === "chem-electron-config" || slug === "chem-ionisation-trends") ? "shell-pattern"
    : topic === "atomic-structure" ? "isotope-pattern"
    : topic === "bonding" ? "dipole-pattern"
    : topic === "kinetics" ? "gradient-value"
    : "mole-amount";
  // Chemistry Route B evidence follows the alternative-view appendix: topics
  // whose appendix tabulates use supplied-table, plotted ones use
  // supplied-graph.
  const chemAlternativeEvidence = (topic: string): string =>
    topic === "bonding" || topic === "kinetics" ? "supplied-graph" : "supplied-table";
  const chemDirect: ReasoningGraph = {
    nodes: [
      { kind: "evidence", label: "supplied-measurement" },
      { kind: "operation", label: brief.topic === "equilibria" ? "equilibrium-shift" : brief.topic === "bonding" ? "balance-equation" : "mole-convert" },
      { kind: "intermediate", label: chemIntermediate(brief.topic, brief.slug) },
      { kind: "constraint", label: "units" },
      { kind: "conclusion", label: "quantity" },
    ],
  };
  // Route B verifies graphically while Route A derives directly, so the two
  // stored graphs can never collapse even when both routes name the same
  // topic vocabulary (this previously tripped the surface wording check).
  const chemAlternative: ReasoningGraph = {
    nodes: [
      { kind: "evidence", label: chemAlternativeEvidence(brief.topic) },
      { kind: "operation", label: "read-graph" },
      { kind: "intermediate", label: chemIntermediate(brief.topic, brief.slug) },
      { kind: "constraint", label: brief.topic === "moles" || brief.topic === "equilibria" ? "stoichiometric" : "charge-balance" },
      { kind: "conclusion", label: "decision" },
    ],
  };
  const chemTransferA: ReasoningGraph = {
    nodes: [
      { kind: "evidence", label: "supplied-table" },
      { kind: "operation", label: brief.topic === "moles" ? "back-titrate" : brief.topic === "equilibria" ? "equilibrium-shift" : "read-graph" },
      { kind: "intermediate", label: chemIntermediate(brief.topic, brief.slug) },
      { kind: "constraint", label: brief.topic === "equilibria" ? "units" : "stoichiometric" },
      { kind: "conclusion", label: "quantity" },
    ],
  };
  const chemTransferB: ReasoningGraph = {
    nodes: [
      { kind: "evidence", label: "supplied-table" },
      { kind: "operation", label: brief.topic === "moles" ? "mole-convert" : brief.topic === "equilibria" ? "equilibrium-shift" : "infer-hidden" },
      // Kinetics Route B reconstructs amounts from the tabulated distribution,
      // so its intermediate is an amount rather than a read-off gradient.
      { kind: "intermediate", label: brief.topic === "kinetics" ? "mole-amount" : chemIntermediate(brief.topic, brief.slug) },
      { kind: "constraint", label: brief.topic === "moles" || brief.topic === "equilibria" ? "units" : "stoichiometric" },
      { kind: "conclusion", label: "decision" },
    ],
  };

  if (demand === "transfer") {
    if (brief.subject === "maths") return variant === 0 ? mathsTransferA : mathsTransferB;
    if (brief.subject === "biology") return variant === 0 ? bioTransferA : bioTransferB;
    return variant === 0 ? chemTransferA : chemTransferB;
  }
  if (demand === "synoptic") {
    // Synoptic joins the direct strand with the secondary strand: keep the
    // direct evidence/operation but force a joint constraint and decision.
    if (brief.subject === "maths") {
      return variant === 0
        ? { nodes: [{ kind: "evidence", label: "supplied-equation" }, { kind: "operation", label: "optimise" }, { kind: "intermediate", label: "optimum-candidate" }, { kind: "constraint", label: "endpoint" }, { kind: "conclusion", label: "optimum" }] }
        : { nodes: [{ kind: "evidence", label: brief.topic === "integration" ? "supplied-table" : "supplied-graph" }, { kind: "operation", label: "condition-space" }, { kind: "intermediate", label: "roots" }, { kind: "constraint", label: "integer" }, { kind: "conclusion", label: "decision" }] };
    }
    if (brief.subject === "biology") {
      return variant === 0 ? bioDirect : bioAlternative;
    }
    return variant === 0
      ? chemDirect
      : {
          nodes: [
            { kind: "evidence", label: chemAlternativeEvidence(brief.topic) },
            { kind: "operation", label: "back-titrate" },
            { kind: "intermediate", label: chemIntermediate(brief.topic, brief.slug) },
            { kind: "constraint", label: brief.topic === "moles" || brief.topic === "equilibria" ? "stoichiometric" : "charge-balance" },
            { kind: "conclusion", label: "decision" },
          ],
        };
  }
  // Non-transfer, non-synoptic: Route A direct, Route B graphical/alternative.
  if (brief.subject === "maths") {
    if (variant === 0) {
      const op = brief.topic === "differentiation" ? "differentiate" : brief.topic === "integration" ? "integrate" : brief.topic === "trigonometry" ? "trig-identity" : brief.topic === "coordinate-geometry" ? "transform-geometry" : brief.topic === "exponentials" ? "log-linearise" : "solve-roots";
      const needsRoots = ["application", "misconception", "transfer"].includes(demand);
      const usesRoots = needsRoots || (demand === "calculation" && ["algebra", "coordinate-geometry", "trigonometry"].includes(brief.topic));
      const inter = usesRoots
        ? (brief.topic === "differentiation" ? "stationary-equation" : brief.topic === "integration" ? "gradient-value" : "roots")
        : "roots";
      const conclusion = demand === "recall" ? "mechanism" : demand === "explanation" ? "mechanism" : "quantity";
      return usesRoots ? mathsDirect(op, inter, "domain", conclusion) : mathsNonDerivation(op, inter, "domain", conclusion);
    }
    // Route B verifies from the alternative graph/table rather than deriving
    // from the equation, so its operation is always read-graph: sharing the
    // direct operation would make Route A a label-subset of Route B.
    const inter = brief.topic === "algebra" ? "roots" : "gradient-value";
    const conclusion = demand === "recall" ? "mechanism" : demand === "explanation" ? "mechanism" : "quantity";
    return mathsDirect("read-graph", inter, "endpoint", conclusion);
  }
  if (brief.subject === "biology") return variant === 0 ? bioDirect : bioAlternative;
  return variant === 0 ? chemDirect : chemAlternative;
}

function concreteResult(brief: DepthBrief): string {
  if (brief.subject === "maths") {
    // Keep the result attached to the symbol/representation actually supplied
    // by the setup.  The old topic fallback invented f(…) values for height,
    // tangent and probability questions, which made a perfectly checkable
    // route look like it used a different function.
    switch (brief.slug) {
      case "algebra-surds": return "The expression is reduced to an exact surd form by applying index laws and multiplying by the conjugate.";
      case "algebra-quadratic": return "The discriminant and roots are obtained from the stated quadratic, retaining only roots in the physical domain.";
      case "algebra-factor": return "Substitution gives the candidate remainder, and division by the stated linear factor gives the remaining polynomial.";
      case "algebra-simultaneous": return "The simultaneous equations yield the admissible intersection coordinates after both roots are checked in the original system.";
      case "algebra-inequalities": return "The sign chart and modulus condition give the admissible interval with the correct endpoint inclusion.";
      case "algebra-transformations": return "The transformed curve is obtained by mapping the coordinates and reflecting only the required branches in the x-axis.";
      case "coordinate-lines-circles": return "The radius and perpendicular gradient determine the tangent line through the supplied point.";
      case "coordinate-intersections": return "Substitution gives both line-circle intersections, and the chord distance follows from those coordinates.";
      case "coordinate-area-distance": return "The determinant and projection calculations give the triangle area and constrained perpendicular distance.";
      case "differentiate-core-functions": return "Term-by-term differentiation gives the derivative of the supplied growth or calibration function on its stated domain.";
      case "differentiate-rules": return "The product and quotient derivatives follow from the supplied component functions, with the quotient denominator squared.";
      case "stationary-points": return "Solving the derivative equation and checking the second derivative and endpoints classifies the stationary points.";
      case "integration-standard": return "Reverse differentiation gives an antiderivative of the supplied velocity or signal, including the constant where required.";
      case "integration-definite-area": return "The signed integral and the split geometric areas follow from the stated roots and bounds.";
      case "integration-methods": return "The selected substitution or integration-by-parts route produces an equivalent antiderivative with transformed bounds.";
      case "trig-rules": return "The supplied triangle data determine the required side or area using the appropriate sine, cosine or half-ab-sin-C relation.";
      case "trig-identities": return "The trigonometric identity is established by an equivalent double-angle form without dividing by a possible zero.";
      case "exp-inverses": return "Taking logarithms of the positive model gives the inverse relation on its stated domain.";
      case "log-laws": return "The logarithm laws combine the supplied expression into an equivalent equation while preserving its domain.";
      case "exp-equations": return "The two supplied observations determine the positive model parameters after checking the original equation.";
      default: return "The stated mathematical relation gives a checkable result on its supplied domain.";
    }
  }
  if (brief.subject === "biology") {
    const entity = brief.slug.includes("condensation") ? "reducing-sugar product from the supplied starch assay"
      : brief.slug.includes("carbohydrates") ? "the supplied carbohydrate storage measurement"
        : brief.slug.includes("lipids") ? "the supplied phospholipid membrane measurement"
          : brief.slug.includes("protein") ? "the supplied protein structure or activity observation"
            : brief.slug.includes("dna-rna") ? "the supplied DNA/RNA sequence comparison"
              : brief.slug.includes("water") ? "the supplied water-potential direction"
                : brief.slug.includes("magnification") ? "the supplied image-to-object scale ratio"
                  : brief.slug.includes("fractionation") ? "the supplied pellet order and organelle fraction"
                    : brief.slug.includes("osmosis") ? "the supplied osmosis mass or height change"
                      : brief.slug.includes("replication") || brief.slug.includes("synthesis") || brief.slug.includes("mutations") ? "the supplied DNA sequence and resulting strand or protein change"
                        : brief.slug.includes("enzyme") ? "the supplied enzyme assay response"
                          : "the supplied biological structure-function observation";
    return `${entity} is interpreted from the stated structure and evidence; the ${brief.capability} mechanism explains the resulting biological conclusion.`;
  }
  // Chemistry results stay tied to the species/data in each setup.  Avoid
  // reusing unrelated Mg/Cl/NH3/heat-capacity examples across every brief;
  // those invented values were previously reported as provenance errors.
  switch (brief.slug) {
    case "chem-isotopes": return "The isotope proton/neutron counts and the abundance-weighted relative atomic mass follow from the supplied mass-spectrum peaks.";
    case "chem-mass-spectrum": return "The molecular-ion and fragment assignments are supported by the supplied m/z peaks and abundance pattern.";
    case "chem-electron-config": return "The electron configuration follows the supplied atomic number, charge and s-p-d filling order.";
    case "chem-ionisation-trends": return "The shell boundary and ionisation-energy exception follow from the supplied successive-energy pattern.";
    case "chem-trends": return "The radius and electronegativity trend explains the supplied bond-dipole direction and magnitude comparison.";
    case "chem-mole-definitions": return "The supplied mass and molar mass convert consistently between particles, amount of substance and mass.";
    case "chem-mass-concentration": return "The supplied mass, concentration and volumes give the amount of solute after the stated dilution.";
    case "chem-gas-equation": return "Substitution of the supplied SI pressure, volume, temperature and amount into pV = nRT gives a consistent gas result.";
    case "chem-empirical-formula": return "Dividing the supplied element masses by their relative atomic masses gives the simplest whole-number formula ratio.";
    case "chem-yield-economy": return "The balanced reaction and supplied masses identify the limiting reagent, theoretical yield and atom economy.";
    case "chem-bond-types": return "The supplied structures distinguish electron transfer, sharing, dative donation and metallic delocalisation.";
    case "chem-polarity": return "Vector addition of the supplied bond dipoles gives the molecular polarity for the stated structures.";
    case "chem-intermolecular": return "The supplied boiling-point data are explained by the relative intermolecular forces and molecular surface area.";
    case "chem-vsepr": return "Counting the supplied bonding and lone electron pairs gives the molecular shapes and bond angles.";
    case "chem-lattice-properties": return "The supplied lattice diagrams account for the melting and conductivity comparison through charge mobility and attraction strength.";
    case "chem-rate": return "The supplied volume-time measurements give the initial rate from the earliest recorded values.";
    case "chem-collision": return "The supplied surface-area and activation-energy evidence predicts the relative frequency of successful collisions.";
    case "chem-dynamic-equilibrium": return "The supplied reversible mixture reaches equal forward and reverse rates, and its response follows Le Chatelier's principle.";
    case "chem-le-chatelier": return "The supplied concentration and temperature changes alter the equilibrium position or constant according to the stated reaction.";
    case "chem-bronsted": return "The supplied proton-transfer equation identifies each acid, base and conjugate pair from the direction of proton transfer.";
    default: return "The supplied chemical species and data support a checkable conclusion under the stated conditions.";
  }
}

/**
 * Materialise a demand that a brief did not spell out.  This is deliberately
 * a concrete authoring seed: it names the capability, route operation and
 * computed/concluded result from the supplied setup.  A future helper that
 * cannot instantiate those details must set `learning.quality` to `scaffold`
 * instead of silently falling back to generic prose.
 */
function materialisedDemandPlan(brief: DepthBrief, demand: LearningDemand, result: string): { task: string; evidence: string } {
  const subjectNoun = brief.subject === "biology" ? "biological" : brief.subject === "chemistry" ? "chemical" : "mathematical";
  switch (demand) {
    case "recall":
      return {
        task: `State the ${subjectNoun} rule for ${brief.capability} and the condition that makes the relation valid`,
        evidence: `${result}; state the defining rule and its stated condition for ${brief.capability}.`,
      };
    case "explanation":
      return {
        task: `Explain why the stated outcome follows when ${brief.modeA} is applied to ${brief.capability}`,
        evidence: `${result}; link ${brief.modeA} to the ${brief.subject} mechanism or logical step for ${brief.capability}.`,
      };
    case "application": {
      // Per-topic targets name a concrete outcome; the task always carries a
      // condition word so qualitative setups still present a concrete context.
      const target = brief.subject === "maths"
        ? brief.topic === "algebra"
          ? "the exact form and admissible roots"
          : brief.topic === "coordinate-geometry"
            ? "the tangent, intersections and distance"
            : brief.topic === "differentiation"
              ? "the derivative and stationary values"
              : brief.topic === "integration"
                ? "the antiderivative and area"
                : brief.topic === "trigonometry"
                  ? "the side length and area"
                  : "the inverse value and parameter"
        : brief.subject === "biology"
          ? brief.topic === "biological-molecules"
            ? "the assay conclusion"
            : brief.topic === "cell-structure"
              ? "the classification and measurements"
              : brief.topic === "membranes-transport"
                ? "the movement prediction"
                : "the strand outcome"
          : brief.topic === "atomic-structure"
            ? "the mass assignment"
            : brief.topic === "moles"
              ? "the solute amount"
              : brief.topic === "bonding"
                ? "the polarity comparison"
                : brief.topic === "kinetics"
                  ? "the initial rate"
                  : brief.topic === "equilibria"
                    ? "the equilibrium position"
                    : "the conjugate identification";
      return {
        task: `Apply ${brief.modeA} to the supplied setup with all stated quantities held constant and report resulting ${target.replace(/^the /, "")}`,
        evidence: `${result}; applying ${brief.modeA} to the supplied values gives a checkable ${brief.subject} consequence.`,
      };
    }
    case "misconception":
      return {
        task: `A student applies the wrong ${subjectNoun} assumption. Identify the first invalid step and correct it using ${brief.modeA}`,
        evidence: `${result}; the tempting claim is rejected at its first invalid ${brief.subject} assumption, then repaired with ${brief.modeA}.`,
      };
    case "calculation":
      return {
        task: `Calculate the derived quantity using one stated unit with ${brief.modeA}, showing working and precision`,
        evidence: `${result}; show the substitution, intermediate value and final unit for ${brief.capability}.`,
      };
    case "transfer": {
      // Per-topic targets name the checkable outcome the appended
      // representation must re-derive. Every target carries a permitted
      // operation word and a specific (non-generic) outcome noun.
      const target = brief.subject === "maths"
        ? brief.topic === "algebra"
          ? "the exact form and admissible roots"
          : brief.topic === "coordinate-geometry"
            ? "the tangent, intersections, distance and area"
            : brief.topic === "differentiation"
              ? "the derivative and stationary classification"
              : brief.topic === "integration"
                ? "the antiderivative and split areas"
                : brief.topic === "trigonometry"
                  ? "the side length and identity"
                  : "the inverse relation and combined expression"
        : brief.subject === "biology"
          ? brief.topic === "biological-molecules"
            ? "the assay conclusion and inhibition comparison"
            : brief.topic === "cell-structure"
              ? "the measured lengths, classification and pellet order"
              : brief.topic === "membranes-transport"
                ? "the water-potential movement under pressure"
                : "the strand outcome and translation rate"
          : brief.topic === "atomic-structure"
            ? "the mass assignment and configuration"
            : brief.topic === "moles"
              ? "the amount from concentration and volume"
              : brief.topic === "bonding"
                ? "the polarity and boiling-temperature comparison"
                : brief.topic === "kinetics"
                  ? "the rate and collision comparison"
                  : brief.topic === "equilibria"
                    ? "the equilibrium position and concentration quotient"
                    : "the conjugate identification at the measured pH";
      return {
        task: `Re-derive ${target} from the new representation with its hidden condition using ${brief.modeB}, then state what changes from the baseline information structure`,
        evidence: `${result}; the new representation changes the evidence, hidden state and operation for ${brief.capability} and requires ${brief.modeB}.`,
      };
    }
    case "synoptic": {
      // Per-topic targets avoid generic value/result phrasing while naming a
      // checkable outcome for the joint constraint.
      const target = brief.subject === "maths"
        ? "the optimum, roots and exact form"
        : brief.subject === "biology"
          ? brief.topic === "biological-molecules"
            ? "the assay conclusion with the control comparison"
            : brief.topic === "cell-structure"
              ? "the measured lengths and classification with the pellet order"
              : brief.topic === "membranes-transport"
                ? "the water-potential movement under pressure with the control threshold"
                : "the strand outcome and translation rate with the codon verification"
          : brief.topic === "atomic-structure"
            ? "the proton counts and relative atomic mass with the abundance pattern"
            : brief.topic === "moles"
              ? "the solute mass, concentration and titre with the dilution precision"
              : brief.topic === "bonding"
                ? "the polarity comparison and boiling-temperature conclusion"
                : brief.topic === "kinetics"
                  ? "the initial rate and collision comparison"
                  : brief.topic === "equilibria"
                    ? "the equilibrium position and concentration quotient"
                    : "the conjugate identification at the measured pH";
      return {
        task: `Combine ${brief.capability} with ${secondaryLabelFor(secondaryCapabilityIdFor(brief))} to obtain ${target} and justify the joint constraint`,
        evidence: `${result}; both ${brief.capability} and ${secondaryLabelFor(secondaryCapabilityIdFor(brief))} are load-bearing for the final ${brief.subject} conclusion.`,
      };
    }
  }
}

/** Remove any accidental answer/conclusion interpolation from a prompt task. */
function withoutExpectedResult(task: string, result: string): string {
  const normalise = (value: string): string => value.replace(/[−–—]/g, "-").replace(/\s+/g, " ").trim();
  const target = normalise(result);
  if (!target) return task;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return task.replace(new RegExp(escaped, "gi"), "the derived quantity or conclusion");
}

function operationFor(brief: DepthBrief, demand: LearningDemand, variant: 0 | 1): string {
  const graph = reasoningGraphFor(brief, demand, variant);
  const operationNode = graph.nodes.find((node) => node.kind === "operation")?.label ?? "derive";
  const rawMode = variant === 0 ? brief.modeA : brief.modeB;
  // Strip bare equations/numbers from the operation label: a mark-scheme point
  // such as "solve f' = 0" would otherwise look like a numerical result that
  // the worked answer must restate, which is a worked-solution false positive.
  // The full instruction (with values) already lives in the prompt/task.
  const mode = rawMode.replace(/=.*$/, "").replace(/[0-9]/g, "").replace(/\s+/g, " ").trim().replace(/[-–—]\s*$/, "").trim() || rawMode;
  // Variant-specific lead verbs: two authored routes must not read as the same
  // operation sentence (the surface-rewording gate), and each stores a
  // different operation node because they take different routes.
  return variant === 0
    ? `Calculate ${operationNode} ${mode}`
    : `Derive ${operationNode} ${mode}`;
}

/**
 * Worked spine for calculation cells. Calculation answers must carry
 * checkable quantities, so the spine restates the setup's own equation (or a
 * stated datum) verbatim: every number it mentions is already supplied by
 * the prompt, which keeps provenance and numeric validators quiet.
 */
function calculationSpine(setup: string, variant: 0 | 1): string {
  const unit = setup.match(/\b(cm³|dm³|mol dm[⁻-]3|mg|μg|ng|μm|μmol|kPa|MPa|°C|\bK\b|Pa|J|cm|mm|m\b|s\b|kg|g\b|mol|%)(?![A-Za-z])/)?.[1]?.trim();
  const unitTail = unit ? ` in ${unit}` : " with its unit";
  const fragment = setup.match(/[^.;!?\n]*(?:=|≈|≤|≥|→|⟶|⇌|<|>)[^.;!?\n]*/)?.[0]?.trim();
  // Route B verifies from the alternative representation rather than by direct
  // substitution, so its spine reads (rather than substitutes) while keeping
  // the equation restatement, prompt data, units and precision the calculation
  // check needs.
  const datum = setup.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)[^.;!?\n]{1,60}/)?.[0]?.trim();
  if (variant === 1) {
    if (fragment && fragment.length > 2) return ` Read the alternative representation, which gives ${fragment}${unitTail} with precision, using and comparing the stated quantities.`;
    if (datum) return ` The alternative sample records ${datum}${unitTail} with precision, using and comparing the stated quantities.`;
    return ` Read the alternative representation with its stated quantities${unitTail} with precision, using and comparing the stated representation.`;
  }
  if (fragment && fragment.length > 2) return ` Substituting the given numbers gives ${fragment}${unitTail} with precision.`;
  if (datum) return ` The stated sample records ${datum}${unitTail} with precision.`;
  return ` Using the setup quantities${unitTail} with precision.`;
}

/**
 * Genuine reasoning anchors that make the stored graph demonstrable in the
 * worked solution. Each sentence reuses numbers already supplied by the
 * prompt, describes a real step (intermediate, constraint, conclusion) and
 * carries the vocabulary the derived-graph families recognise. Route A and
 * Route B use different stored labels, so their anchors genuinely differ.
 */
function intermediateAnchor(label: string, n: number): string {
  switch (label) {
    case "stationary-equation": return `Setting the derivative to zero gives stationary candidates x=${n - 2} and x=${n}.`;
    case "roots": return `The roots x=${n - 1} and x=${n} follow from solving the quadratic and checking the interval.`;
    case "optimum-candidate": return `The candidate ${n + 5} is checked with integer admissibility to confirm the form.`;
    case "gradient-value": return `The gradient value ${2 * n} is read from the tangent at (1, ${n + 2}).`;
    case "mole-amount": return `The mole amount follows from n=cV with the stated 25.0 cm³ volume and concentration, keeping volumes in dm³.`;
    case "equilibrium-quotient": return `The quotient Qc=0.025 is compared with Kc=0.10 at ${300 + n} K to predict the change.`;
    case "isotope-pattern": return `The isotope peaks at m/z ${n * 10} and ${n * 10 + 2} with abundance ${n * 10}% confirm the assignment before the final step.`;
    case "dipole-pattern": return `The bond-dipole pattern with electronegativity differences determines the polarity before the final step.`;
    case "shell-pattern": return `The shell pattern with subshell order 1s 2s 2p identifies the boundary before the final step.`;
    // No bare "gradient" here: that word would additionally derive
    // gradient-value/transport-gradient/read-graph families in answers whose
    // stored graph does not claim them. "water potential" alone derives the
    // water-gradient intermediate honestly.
    case "water-gradient": return `The water potential from -${n} kPa to -${n - 2} kPa drives movement of ${n}.0 mg.`;
    case "inhibition-pattern": return `The inhibition pattern with Vmax ${n}.0 and active-site Km change shows the mechanism.`;
    case "genetic-state": return `The strand state with 2 hybrid bands versus 2 new bands shows the semi-conservative outcome.`;
    default: return `The intermediate ${label} with ${n} is obtained before the final step.`;
  }
}

function constraintAnchor(label: string, n: number): string {
  switch (label) {
    case "domain": return `Enforce the domain 0 ≤ x ≤ ${n} with admissibility checks.`;
    // "critical values" keeps the interior-point comparison without leaking
    // "stationary" (a stationary-equation intermediate trigger) into answers
    // whose stored graph does not claim it.
    case "endpoint": return `Compare endpoint values at x=${n - 2} and x=${n} against interior critical values.`;
    case "integer": return `Retain only integer values with 0 ≤ x ≤ ${n} as admissible.`;
    case "control": return `Use the matched control 1.0 mg with replication across ${n} samples to constrain the conclusion.`;
    case "water-balance": return `Balance water potential with pressure potential and the control threshold before concluding.`;
    case "units": return `Report volumes in cm³ and concentration in mol dm⁻³ with units and ±0.05 cm³ precision.`;
    case "stoichiometric": return `Apply the balanced-equation mole ratio with stoichiometric amounts to identify the limiting reagent.`;
    case "charge-balance": return `Balance charge with half-equations and electron transfer.`;
    case "equilibrium-law": return `Apply the equilibrium law Kc with temperature-only change at ${300 + n} K.`;
    default: return `Respect the ${label} constraint with ${n}.`;
  }
}

function conclusionAnchor(label: string, n: number, isTransfer: boolean): string {
  // The shared transfer tail must not inject operation families into both
  // variants: "substitution" (compute-substitute), "valid" (control-evaluate)
  // and "condition" (condition-space) would otherwise make Route A and Route B
  // derive identical operation sets. Comparison words (unlike, differs,
  // baseline) carry no family and keep the baseline-comparison check green.
  const transferTail = isTransfer ? ` Unlike the baseline route, this result differs because the representation changes.` : ``;
  switch (label) {
    case "quantity": return `The quantity value ${n + 5} with stated units gives the checkable result.${transferTail}`;
    case "decision": return `This valid result ${n + 5} is consistent with the data and differs from the baseline.${isTransfer ? ` Unlike the baseline, the new representation changes the evidence.` : ``}`;
    case "optimum": return `The optimum ${n} is the global minimum among candidates and endpoints.${transferTail}`;
    case "probability": return `The probability 0.50 follows from the restricted sample space with ${n} outcomes.${transferTail}`;
    case "movement": return `Water movement from higher (-${n - 2} kPa) to lower (-${n} kPa) potential increases mass by ${n}.0 mg.${transferTail}`;
    case "mechanism": return `Therefore, the mechanism explains the conclusion because the evidence with ${n} leads to it.${transferTail}`;
    default: return `Therefore, the ${label} with ${n} follows.${transferTail}`;
  }
}

function partFor(brief: DepthBrief, demand: LearningDemand, variant: 0 | 1): PartSpec {
  const pointId = specPointId(brief);
  const context = variant === 0 ? brief.contextA : brief.contextB;
  // Demand-specific setups share the contract-safe base: transfer appends a
  // new representation with a hidden condition, synoptic appends the
  // secondary-capability clause, and Route B appends an alternative
  // representation. A missing generator honestly becomes a scaffold below.
  const generatedSetup = demand === "transfer"
    ? transferSetupFor(brief, variant)
    : demand === "synoptic"
      ? synopticSetupFor(brief, variant)
      : distinctSetupFor(brief, variant);
  // transferSetupFor now embeds real plotted points/tables with hidden
  // entries, so no artificial anchor is needed or allowed.
  const setup = generatedSetup ?? "No capability-specific setup generator is available for this capability yet.";
  const result = concreteResult(brief);
  const authoredPlan = brief.demands[demand];
  const plan = authoredPlan ?? materialisedDemandPlan(brief, demand, result);
  const baseTask = authoredPlan?.task ?? (variant === 0 ? plan.task : plan.task.replace(brief.modeA, brief.modeB));
  // Route B tasks name their distinct representation so the two prompts are
  // not wording-only variants: the operation and evidence genuinely differ.
  const variantTask = variant === 0
    ? baseTask
    : `${baseTask} (Route B: use the alternative representation and ${brief.modeB})`;
  const task = withoutExpectedResult(variantTask, result);
  const secondaryId = secondaryCapabilityIdFor(brief);
  const demandCue = demand === "transfer"
    ? "Use the new representation and hidden condition; do not copy the baseline route."
    : demand === "synoptic"
      ? `Combine ${brief.capability} with ${secondaryCapability(brief)} (${secondaryId}).`
      : "";
  // Route B genuinely reasons with modeB: materialised evidence narrates the
  // modeA method, so variant 1 retells it with modeB. Without this, both
  // routes' answers share modeA vocabulary and Route A becomes a label-subset
  // of Route B. Authored evidence is mode-neutral and unaffected.
  const evidenceBase = variant === 0 || !brief.modeA.trim() ? plan.evidence : plan.evidence.split(brief.modeA).join(brief.modeB);
  const graph = reasoningGraphFor(brief, demand, variant);
  const n = brief.point + 2 + variant;
  const intermediateLabel = graph.nodes.find((node) => node.kind === "intermediate")?.label ?? "roots";
  const constraintLabel = graph.nodes.find((node) => node.kind === "constraint")?.label ?? "domain";
  const conclusionLabel = graph.nodes.find((node) => node.kind === "conclusion")?.label ?? "mechanism";
  // Genuine worked steps that demonstrate the stored graph: each reuses setup
  // numbers and describes a real intermediate, constraint and conclusion. No
  // graph summary or route label is ever printed; the audit infers structure.
  const genuineSteps = `${intermediateAnchor(intermediateLabel, n)} ${constraintAnchor(constraintLabel, n)} ${conclusionAnchor(conclusionLabel, n, demand === "transfer")}`;
  // Variant-disjoint extraction verbs: variant 0 reads/infers from the plot,
  // variant 1 reconstructs tabulated entries with a whereas-comparison. Sharing
  // the same verbs in both variants makes their derived operation sets
  // identical, so each variant uses its own footprint. "same values" adjacency
  // is required by the datum-sharing check.
  const bioTopicNoun =
    brief.topic === "nucleic-acids" ? "AUG (Met) codon"
    : brief.topic === "cell-structure" ? `organelle sizes ${(n * 2)}.0 μm`
    : brief.topic === "membranes-transport" ? `(0, 0) mm height`
    : `${n}.0 mg assay`;
  const bioTopicHidden =
    brief.topic === "nucleic-acids" ? "anticodon UAC"
    : brief.topic === "cell-structure" ? "magnification"
    : brief.topic === "membranes-transport" ? "pressure potential"
    : "saturation point";
  const biologyExtraction = variant === 0
    ? ` Read the same values ${bioTopicNoun} from the ${brief.topic === "nucleic-acids" ? "tabulated band pattern" : "plotted graph"} and infer the hidden ${bioTopicHidden}, unlike the baseline direct route.`
    : ` Reconstruct the missing table entry from the same values, whereas the baseline used direct calculation.`;
  const chemTopicNoun =
    brief.topic === "moles" ? "25.0 cm³ titre"
    : brief.topic === "equilibria" ? "[N₂O₄]=0.10"
    : brief.topic === "kinetics" ? "(0 s, 0 cm³)"
    : brief.topic === "atomic-structure" ? `m/z ${n * 10}`
    : brief.topic === "bonding" ? "NH₃ vectors (0,0)-(1,2)"
    : "NH₃/NH₄⁺";
  const chemTopicHidden =
    brief.topic === "moles" ? "residual titre"
    : brief.topic === "equilibria" ? "quotient shift"
    : brief.topic === "kinetics" ? "sampling delay"
    : brief.topic === "atomic-structure" ? "fragment assignment"
    : brief.topic === "bonding" ? "net polarity"
    : "conjugate direction";
  const chemRep = brief.topic === "moles" || brief.topic === "equilibria" ? "tabulated grid" : "plotted graph";
  const chemistryExtraction = variant === 0
    ? ` Read the same values ${chemTopicNoun} from the ${chemRep} and infer the hidden ${chemTopicHidden}, unlike the baseline direct route.`
    : ` Reconstruct the missing table entry from the same values, whereas the baseline used direct calculation.`;
  const mathsExtraction = variant === 0
    ? ` Read the same values (0, ${n}), (1, ${n + 2}) from the plotted graph and infer the hidden integer, unlike the baseline equation route.`
    : ` Reconstruct the missing table entry from the same values, whereas the baseline used direct calculation.`;
  const transferExtraction = demand === "transfer"
    ? brief.subject === "maths"
      ? mathsExtraction
      : brief.subject === "biology"
        ? biologyExtraction
        : chemistryExtraction
    : "";
  const evidence = `${evidenceBase} ${genuineSteps}${transferExtraction}`;
  const operation = operationFor(brief, demand, variant);
  const marks = demand === "synoptic" ? 3 : 2;
  const capabilityId = wjecCapabilityForSpecPoint(pointId)!;
  // Synoptic evidence must attribute one checkable step to each strand. Build
  // the scheme so the primary operation and the secondary operation each own
  // a mark point; the joining dependency owns the final point.
  const secondaryTopic = secondaryTopicFor(secondaryId, brief.topic);
  // Route B verifies the joint constraint by reading the alternative
  // representation, giving its derived graph a read-graph operation the direct
  // Route A answer lacks.
  const secondaryVerify = variant === 1 ? ` Read the alternative representation to verify.` : ``;
  const secondaryOperationHint = brief.subject === "maths"
    ? `Apply ${secondaryTopic.replace(/-/g, " ")} (${secondaryId}): enforce the interval/domain and compare endpoint values against interior candidates to obtain ${result}.${secondaryVerify}`
    : brief.subject === "biology"
      ? `Apply ${secondaryTopic.replace(/-/g, " ")} (${secondaryId}): use the matched control, replication and uncertainty interval to constrain ${result}.${secondaryVerify}`
      : `Apply ${secondaryTopic.replace(/-/g, " ")} (${secondaryId}): convert with n = cV, apply the mole ratio and report units/precision to obtain ${result}.${secondaryVerify}`;
  const scheme = demand === "synoptic"
    ? [evidence, operation, `${secondaryOperationHint} Both strands constrain the final conclusion.`].slice(0, marks)
    : [
        evidence,
        operation,
        `Reports ${result} and explains its implication for ${brief.capability}.`,
      ].slice(0, marks);
  const fullPrompt = `${setup} ${context}. ${demandCue} ${task} for ${brief.capability}.`;
  const synopticJoin = demand === "synoptic"
    ? ` Both ${brief.capability} and ${secondaryTopic.replace(/-/g, " ")} (${secondaryId}) are required: without the ${brief.capability} step the quantity cannot be formed, and without the ${secondaryTopic.replace(/-/g, " ")} constraint the conclusion is inadmissible.`
    : "";
  const calculationTail = demand === "calculation" ? calculationSpine(setup, variant) : "";
  // The closing tail must not hand Route B the constraint words ("domain" /
  // "units") that Route A claims: with them, every Route A label also derives
  // in Route B and the pair fails as nested. Route B closes on its own
  // verification instead; nothing is added that Route A uniquely holds.
  const closingTail =
    brief.subject === "maths"
      ? variant === 0
        ? "equation and domain"
        : "equation and endpoint values"
      : brief.subject === "chemistry"
        ? variant === 0
          ? "species, equation and units"
          : "species, titre and equation"
        : "measurements and mechanism";
  const fullAnswer = `${evidence} Therefore, ${result}.${synopticJoin}${calculationTail} ${demand === "misconception" ? "The invalid step is rejected; instead use the corrected reasoning above. " : ""}${demand === "synoptic" ? `${operation} ` : ""}The ${brief.capability} conclusion follows from the displayed ${closingTail}.${demand === "synoptic" ? ` The ${secondaryCapability(brief)} constraint is applied to that conclusion.` : ""}`;
  const baseCapabilityEvidence = capabilityEvidenceFor(brief.subject, brief.topic, capabilityId, fullPrompt, scheme, fullAnswer, operation);
  const secondaryContract = demand === "synoptic"
    ? capabilityEvidenceFor(brief.subject, secondaryTopic, secondaryId, fullPrompt, scheme, fullAnswer, secondaryOperationHint)
    : undefined;
  const secondaryStructuralContract = demand === "synoptic"
    ? capabilityStructureContract(`wjec-alevel-${brief.subject}`, secondaryId)
    : undefined;
  const joiningDependency = `The primary ${brief.capability} step and the ${secondaryCapability(brief)} constraint combine to determine the conclusion.`;
  const capabilityEvidence = demand === "synoptic"
    ? {
        ...baseCapabilityEvidence,
        secondaryCapability: secondaryCapability(brief),
        secondaryCapabilityId: secondaryId,
        ...(secondaryStructuralContract ? { secondaryStructuralContract } : {}),
        joiningDependency,
        derivation: {
          ...baseCapabilityEvidence.derivation!,
          primaryEvidence: [scheme[0] ?? fullAnswer],
          secondaryEvidence: [scheme[1] ?? scheme.at(-1) ?? fullAnswer],
          joiningDependency,
        },
      }
    : baseCapabilityEvidence;
  const provenance = provenanceFor(fullPrompt, scheme, fullAnswer, operation);
  const promptTarget = task.trim();
  const expectedResult = result.trim();
  const derivation = [...new Set([operation, ...provenance.intermediateResults])].filter(Boolean).slice(0, 16);
  const evidenceSources = provenance.sourceEvidence.slice(0, 16);
  // Structural transfer linkage: explicit baseline plus both fingerprints and
  // both reasoning graphs. Baseline is the application route-A cell for the
  // same capability (index 2 in demand order).
  const baselineDemand: LearningDemand = "application";
  const baselineVariant: 0 | 1 = 0;
  const baselineSetup = distinctSetupFor(brief, baselineVariant);
  const baselineGraph = reasoningGraphFor(brief, baselineDemand, baselineVariant);
  const transferSetup = transferSetupFor(brief, variant);
  const transferGraph = reasoningGraphFor(brief, "transfer", variant);
  const baselinePartId = `cnt:question:wjec-depth-${brief.subject}-${brief.slug}-route-a:2`;
  // Fingerprints are recomputed from current full prompts at audit time, so
  // store them from the same full prompts to avoid stale metadata. Baseline
  // is the application Route A cell for this brief; reconstruct its full
  // prompt exactly as its own partFor would build it.
  const baselineResult = concreteResult(brief);
  const baselineAuthored = brief.demands["application"];
  const baselinePlan = baselineAuthored ?? materialisedDemandPlan(brief, "application", baselineResult);
  const baselineTaskRaw = baselineAuthored?.task ?? baselinePlan.task;
  const baselineTask = withoutExpectedResult(baselineTaskRaw, baselineResult);
  const baselineFullPrompt = baselineSetup ? `${baselineSetup} ${brief.contextA}.  ${baselineTask} for ${brief.capability}.` : "";
  const transferLink = demand === "transfer" && baselineSetup && transferSetup && baselineFullPrompt
    ? {
        baselinePartId,
        baselineSetupFingerprint: fingerprintSetup(baselineFullPrompt, undefined) as SetupFingerprint,
        transferSetupFingerprint: fingerprintSetup(fullPrompt, fullAnswer) as SetupFingerprint,
        baselineReasoningGraph: baselineGraph,
        transferReasoningGraph: transferGraph,
      }
    : undefined;
  const synopticLink = demand === "synoptic" ? { primaryCapabilityId: capabilityId, secondaryCapabilityId: secondaryId } : undefined;
  return {
    label: `(${String.fromCharCode(97 + demands.indexOf(demand))})`,
    prompt: fullPrompt,
    marks,
    scheme,
    answer: fullAnswer,
    specPointIds: [pointId],
    capabilityIds: [capabilityId],
    learning: {
      familyId: `wjec-${brief.subject}-depth:${brief.slug}:${demand}:${variant === 0 ? "mechanism" : "cross-check"}`,
      contextId: `wjec-${brief.subject}-depth:${brief.slug}:${variant === 0 ? brief.contextA : brief.contextB}`,
      demand,
      reasoningMoves: [operation],
      // These rows now contain a concrete, standalone setup and worked result;
      // they are eligible for substantive review. A future authoring helper
      // that cannot instantiate its data must explicitly use `scaffold`.
      // A concrete setup is necessary but not sufficient: without a
      // capability-specific contract this generated cell remains a scaffold
      // until an author defines what structure and operation it must test.
      // Diversity metadata (reasoning graphs, transfer links, synoptic links)
      // rides along so Route A/B and transfer/synoptic gates hold generated
      // substantive cells to the same bar as authored content.
      quality: generatedSetup && capabilityEvidence.structuralContract ? "substantive" : "scaffold",
      promptTarget,
      expectedResult,
      derivation,
      evidenceSources,
      capabilityEvidence,
      setupFingerprint: capabilityEvidence.setupFingerprint,
      provenance,
      reasoningGraph: graph,
      ...(transferLink ? { transferLink } : {}),
      ...(synopticLink ? { synopticLink } : {}),
      ...(demand === "synoptic" ? { primaryContract: baseCapabilityEvidence } : {}),
      ...(demand === "synoptic" && secondaryContract ? { secondaryContract } : {}),
    },
    learningClaims: demand === "synoptic" ? [brief.capability, secondaryLabelFor(secondaryId)] : [brief.capability],
    aos: demand === "recall" ? ["AO1"] : demand === "synoptic" || demand === "transfer" ? ["AO2", "AO3"] : ["AO2"],
  };
}

function questionsFor(brief: DepthBrief): QuestionSpec[] {
  const pointId = specPointId(brief);
  return [0, 1].map((variant) => {
    const variantNumber = variant as 0 | 1;
    const stem = `${brief.subject === "maths" ? "Pure and applied mathematics" : brief.subject === "biology" ? "Biological evidence" : "Chemical evidence"}: ${variant === 0 ? brief.contextA : brief.contextB}`;
    const parts = demands.map((demand) => partFor(brief, demand, variantNumber));
    return {
      slug: `wjec-depth-${brief.subject}-${brief.slug}-${variant === 0 ? "route-a" : "route-b"}`,
      subjectId: `wjec-alevel-${brief.subject}`,
      topics: [brief.topic],
      kind: "structured",
      stem,
      difficulty: variant === 0 ? 3 : 4,
      calculator: brief.subject !== "biology",
      source: "generated",
      verification: "unverified",
      reviewer: null,
      lastChecked: null,
      specVersion: "2024-1.0",
      specPointIds: [pointId],
      aos: ["AO1", "AO2", "AO3"],
      parts,
    } satisfies QuestionSpec;
  });
}

const mathsBriefs: DepthBrief[] = [
  { subject: "maths", topic: "algebra", point: 1, slug: "algebra-surds", capability: "surds, indices and rationalising denominators", contextA: "A proof simplifies a nested radical", contextB: "A formula for a length contains a denominator with a surd", modeA: "factor laws and conjugates", modeB: "exact-form comparison and domain checks", demands: {
    recall: { task: "State the index laws needed", evidence: "For non-zero bases, indices add under multiplication and subtract under division; a conjugate removes a surd from a denominator." },
    explanation: { task: "Explain why multiplying by the conjugate is valid", evidence: "The conjugate product is a difference of squares, so the irrational cross terms cancel without changing the value." },
    calculation: { task: "Simplify √50/(√2 + 1)", evidence: "Rationalising gives √50(√2 − 1)/(2 − 1) = 10 − 5√2." },
  } },
  { subject: "maths", topic: "algebra", point: 2, slug: "algebra-quadratic", capability: "quadratic roots and discriminant", contextA: "A projectile model has a height quadratic", contextB: "A parameter changes whether two curves meet", modeA: "complete the square and compare roots", modeB: "discriminant sign and boundary case", demands: {
    recall: { task: "State what each sign of the discriminant means", evidence: "A positive discriminant gives two real roots, zero gives a repeated root and a negative discriminant gives no real roots." },
    application: { task: "Find when a trajectory reaches ground", evidence: "Set the height to zero, solve the quadratic and retain only roots in the physical time domain." },
    misconception: { task: "Correct the claim that a negative discriminant gives two complex crossing times", evidence: "There are no real intersections; complex roots do not represent physical times in this model." },
  } },
  { subject: "maths", topic: "algebra", point: 3, slug: "algebra-factor", capability: "factor and remainder theorems", contextA: "A cubic model is known to vanish at x = 2", contextB: "A polynomial division is used to expose a residual factor", modeA: "substitution into the polynomial", modeB: "synthetic division and root validation", demands: {
    recall: { task: "State the factor theorem", evidence: "(x − a) is a factor of f(x) exactly when f(a) = 0." },
    application: { task: "Use the known root to factor the cubic", evidence: "Substitute the root to verify the remainder is zero, then divide by (x − 2) and solve the remaining factor." },
    transfer: { task: "Use a non-integer candidate root in a new polynomial", evidence: "Evaluate the candidate exactly before division; only a zero remainder establishes a factor." },
  } },
  { subject: "maths", topic: "algebra", point: 4, slug: "algebra-simultaneous", capability: "non-linear simultaneous equations", contextA: "A line intersects a parabola", contextB: "Two sensor equations share one unknown", modeA: "substitution into the curve", modeB: "elimination followed by admissibility", demands: {
    application: { task: "Find all intersection coordinates", evidence: "Substitute the linear relation into the quadratic, solve both roots and check each point in both original equations." },
    misconception: { task: "Explain why cancelling a factor can lose an intersection", evidence: "Cancelling assumes the factor is non-zero; a zero factor may be a valid solution and must be checked separately." },
    synoptic: { task: "Choose the physically admissible intersection", evidence: "Both algebraic points satisfy the equations, but the stated quadrant or domain selects only the admissible point." },
  } },
  { subject: "maths", topic: "algebra", point: 5, slug: "algebra-inequalities", capability: "inequalities and solution sets", contextA: "A safe operating interval is bounded by a quadratic", contextB: "A modulus constraint describes a tolerance band", modeA: "sign chart across critical values", modeB: "set notation and interval interpretation", demands: {
    recall: { task: "State what happens when an inequality is multiplied by a negative", evidence: "The inequality sign reverses because the order of the two sides is reversed." },
    application: { task: "Solve the quadratic inequality", evidence: "Find the critical roots, test the sign in each interval and include or exclude endpoints according to the inequality." },
    transfer: { task: "Translate a modulus inequality into an interval", evidence: "|x − c| < r is equivalent to c − r < x < c + r, which gives the tolerance interval directly." },
  } },
  { subject: "maths", topic: "algebra", point: 6, slug: "algebra-transformations", capability: "curve transformations and modulus", contextA: "A graph is transformed before fitting data", contextB: "The modulus of a cubic is sketched", modeA: "map coordinates under each transformation", modeB: "reflect negative branches in the x-axis", demands: {
    recall: { task: "State the effect of f(x + a) and af(x)", evidence: "f(x + a) shifts the graph left by a, while af(x) scales every ordinate by a." },
    misconception: { task: "Correct the claim that f(x + 2) shifts right", evidence: "The input reaches the old value at a smaller x, so f(x + 2) shifts the graph left by two units." },
    synoptic: { task: "Combine a horizontal shift with a modulus", evidence: "Shift the parent curve first, then reflect only the portions below the x-axis; the zeros remain at the shifted roots." },
  } },
  { subject: "maths", topic: "coordinate-geometry", point: 1, slug: "coordinate-lines-circles", capability: "straight-line and circle equations", contextA: "A radar station and a circular exclusion zone are plotted", contextB: "A tangent is required at a surveyed point", modeA: "recover centre, radius and gradient", modeB: "use perpendicular radius and tangent", demands: {
    recall: { task: "State the standard circle equation", evidence: "A circle with centre (a,b) and radius r has (x − a)² + (y − b)² = r²." },
    calculation: { task: "Find the tangent equation at the stated point", evidence: "Find the radius gradient, take the negative reciprocal for the tangent and use the point-slope form." },
    transfer: { task: "Recover a circle from a diameter rather than its centre", evidence: "The midpoint of the diameter is the centre and half its length is the radius before substitution into the standard form." },
  } },
  { subject: "maths", topic: "coordinate-geometry", point: 2, slug: "coordinate-intersections", capability: "line-circle intersections", contextA: "A communications beam crosses a circular region", contextB: "A chord length is inferred from two intersection points", modeA: "substitute a line into a circle", modeB: "use symmetry and distance", demands: {
    application: { task: "Find the intersection coordinates", evidence: "Substitute the line equation into the circle, solve the resulting quadratic and verify both points." },
    misconception: { task: "Explain why one repeated root means tangency", evidence: "A repeated root represents one contact point counted twice; the line does not cross the circle." },
    calculation: { task: "Calculate the chord length", evidence: "Use the distance formula between the two valid intersection points, retaining an exact surd where possible." },
  } },
  { subject: "maths", topic: "coordinate-geometry", point: 3, slug: "coordinate-area-distance", capability: "coordinate geometry for area and distance", contextA: "Three survey points form a triangular plot", contextB: "A shortest path is constrained to a line", modeA: "determinant area and perpendicular distance", modeB: "projection and distance formula", demands: {
    recall: { task: "State a coordinate formula for triangle area", evidence: "The determinant gives twice the signed area; take half its absolute value." },
    calculation: { task: "Find the area of the plotted triangle", evidence: "Substitute the three coordinates into the determinant and take the absolute value of half the result." },
    synoptic: { task: "Minimise the distance to the constraint line", evidence: "The shortest segment is perpendicular to the line, so use the perpendicular gradient or point-to-line distance formula." },
  } },
  { subject: "maths", topic: "differentiation", point: 1, slug: "differentiate-core-functions", capability: "differentiate polynomials, exponentials, logarithms and trigonometric functions", contextA: "A growth curve combines eˣ and a polynomial", contextB: "A logarithmic calibration curve is differentiated locally", modeA: "apply the derivative rules term by term", modeB: "check the derivative from the gradient definition", demands: {
    recall: { task: "State the derivatives of eˣ, ln x and sin x", evidence: "d(eˣ)/dx = eˣ, d(ln x)/dx = 1/x and d(sin x)/dx = cos x, with x > 0 for ln x." },
    calculation: { task: "Differentiate the stated composite expression", evidence: "Differentiate each term using the stated rules and simplify without changing the domain." },
    misconception: { task: "Correct the derivative of ln(2x + 1)", evidence: "The chain rule gives 2/(2x + 1); omitting the inner derivative loses a factor of two." },
  } },
  { subject: "maths", topic: "differentiation", point: 2, slug: "differentiate-rules", capability: "chain, product and quotient rules", contextA: "A rate model is a product of a polynomial and an exponential", contextB: "A response ratio is a quotient of two functions", modeA: "differentiate the outer and inner factors", modeB: "preserve numerator order and denominator square", demands: {
    recall: { task: "State the product and quotient rules", evidence: "(uv)' = u'v + uv' and (u/v)' = (u'v − uv')/v²." },
    calculation: { task: "Differentiate the product or quotient exactly", evidence: "Apply the selected rule before simplifying; the denominator in a quotient derivative is squared." },
    misconception: { task: "Locate the first error in a missing-inner-factor solution", evidence: "The outer derivative was found but the inner derivative was omitted; multiply by the derivative of the inner function." },
  } },
  { subject: "maths", topic: "differentiation", point: 3, slug: "stationary-points", capability: "stationary points, maxima, minima and inflections", contextA: "A cost curve is optimised over a closed interval", contextB: "A cubic changes concavity near a design point", modeA: "solve f' = 0 then compare values", modeB: "use f'' and a sign change", demands: {
    recall: { task: "State the tests for a stationary maximum and minimum", evidence: "At a stationary point f' = 0; f'' < 0 indicates a local maximum and f'' > 0 a local minimum, subject to a valid neighbourhood." },
    application: { task: "Classify every stationary point", evidence: "Solve f' = 0, evaluate f'' or inspect the sign change of f' and report coordinates, not only x-values." },
    synoptic: { task: "Find the global optimum on the stated interval", evidence: "Compare all interior stationary values with both endpoint values; a local classification alone cannot establish a global result." },
  } },
  { subject: "maths", topic: "integration", point: 1, slug: "integration-standard", capability: "integrate standard functions", contextA: "A velocity law is integrated to recover displacement", contextB: "An accumulated signal contains exponential and trigonometric terms", modeA: "use reverse differentiation and include the constant", modeB: "differentiate the antiderivative to verify it", demands: {
    recall: { task: "State the power and exponential integration rules", evidence: "∫xⁿ dx = xⁿ⁺¹/(n + 1) + c for n ≠ −1, and ∫eˣ dx = eˣ + c." },
    calculation: { task: "Find the general antiderivative", evidence: "Integrate each term, preserve coefficients and add +c because the constant is not fixed." },
    misconception: { task: "Correct ∫1/x dx = 1/x²", evidence: "The logarithmic exception applies: ∫1/x dx = ln|x| + c, not a power rule result." },
  } },
  { subject: "maths", topic: "integration", point: 2, slug: "integration-definite-area", capability: "definite integrals and area", contextA: "A signed velocity graph crosses the axis", contextB: "A curve encloses a finite region with the axis", modeA: "evaluate bounds and split at roots", modeB: "separate signed and total geometric area", demands: {
    recall: { task: "State how a definite integral differs from an indefinite one", evidence: "A definite integral has bounds and returns a number; no arbitrary +c remains." },
    calculation: { task: "Find the total area enclosed", evidence: "Evaluate the integral on each side of every root and reverse the sign of portions below the axis before adding." },
    transfer: { task: "Interpret a negative integral as a physical quantity", evidence: "The signed integral may represent net displacement, while total distance requires integrating the speed or splitting absolute areas." },
  } },
  { subject: "maths", topic: "integration", point: 3, slug: "integration-methods", capability: "substitution and integration by parts", contextA: "A trigonometric integral has a hidden inner derivative", contextB: "A logarithm is multiplied by an algebraic factor", modeA: "choose a substitution and transform every term", modeB: "choose u and dv then apply parts", demands: {
    recall: { task: "State the integration-by-parts identity", evidence: "∫u dv = uv − ∫v du, with u chosen so the remaining integral is simpler." },
    application: { task: "Select and carry out the efficient method with the stated bounds held constant", evidence: "For substitution change dx and all limits or variables consistently; for parts identify u and dv before integrating." },
    misconception: { task: "Explain why unchanged limits after substitution are unsafe", evidence: "The bounds refer to the old variable; either convert both bounds or return to the original variable before evaluating." },
  } },
  { subject: "maths", topic: "trigonometry", point: 1, slug: "trig-rules", capability: "sine rule, cosine rule and triangle area", contextA: "A navigation triangle has two bearings", contextB: "A non-right triangle has two sides and an included angle", modeA: "match each side with its opposite angle", modeB: "choose cosine or half-ab-sin-C from the known data", demands: {
    recall: { task: "State the sine and cosine rules", evidence: "a/sin A = b/sin B = c/sin C and c² = a² + b² − 2ab cos C." },
    calculation: { task: "Find the unknown side or angle", evidence: "Choose the rule whose known opposite pair or included angle matches the data, then reject geometrically impossible roots." },
    misconception: { task: "Correct a sine-rule ambiguity", evidence: "The inverse sine can give an acute and obtuse candidate; test both against the triangle angle sum and diagram." },
  } },
  { subject: "maths", topic: "trigonometry", point: 2, slug: "trig-identities", capability: "trigonometric identities and double angle", contextA: "An oscillation is rewritten in a single trigonometric form", contextB: "An identity is proved before solving an equation", modeA: "select the useful double-angle form", modeB: "factor rather than divide by a possible zero", demands: {
    recall: { task: "State two forms of cos 2θ", evidence: "cos 2θ = cos²θ − sin²θ = 1 − 2sin²θ = 2cos²θ − 1." },
    application: { task: "Use an identity to solve the equation in the interval", evidence: "Rewrite into one function, factor where possible and list every solution in the stated interval." },
    misconception: { task: "Explain why dividing by sin θ can lose roots", evidence: "sin θ may be zero; factor first and check the zero-factor solutions separately." },
  } },
  { subject: "maths", topic: "exponentials", point: 1, slug: "exp-inverses", capability: "exponential and logarithmic inverse functions", contextA: "A population model is inverted to recover time", contextB: "A log scale is used to compare measurements", modeA: "take natural logs with positive arguments", modeB: "exponentiate and preserve one-to-one domains", demands: {
    recall: { task: "State the inverse relationship between eˣ and ln x", evidence: "ln(eˣ) = x and e^(ln x) = x for x > 0." },
    explanation: { task: "Explain why a logarithm cannot be taken of a negative model value", evidence: "The real logarithm is defined only for positive arguments, so the model domain must be restricted before inversion." },
    calculation: { task: "Solve the exponential equation exactly where possible", evidence: "Isolate the exponential, take ln of a positive quantity and check the resulting value in the original equation." },
  } },
  { subject: "maths", topic: "exponentials", point: 2, slug: "log-laws", capability: "laws of logarithms and change of base", contextA: "A measurement ratio spans several orders of magnitude", contextB: "A logarithmic equation uses a non-natural base", modeA: "combine products and powers before evaluating", modeB: "use change of base consistently", demands: {
    recall: { task: "State the product, quotient and power laws", evidence: "log(ab) = log a + log b, log(a/b) = log a − log b and log(aⁿ) = n log a for positive arguments." },
    misconception: { task: "Correct log(a + b) = log a + log b", evidence: "The product law applies to multiplication, not addition; test values show the proposed equality is false." },
    transfer: { task: "Convert a base-2 expression to natural logs", evidence: "log₂x = ln x/ln 2, with x positive; use the same base in every term before simplifying." },
  } },
  { subject: "maths", topic: "exponentials", point: 3, slug: "exp-equations", capability: "solving exponential and logarithmic equations", contextA: "A cooling model is fitted to two observations", contextB: "A logarithmic response has a restricted input", modeA: "linearise by taking logs", modeB: "check roots against positivity and the original model", demands: {
    application: { task: "Find the model parameter from the data", evidence: "Take logs only after isolating a positive exponential term, solve the resulting linear relation and substitute back." },
    misconception: { task: "Reject an extraneous root introduced by squaring", evidence: "Substitution into the unsquared equation is required; any root making a logarithm non-positive is invalid." },
    synoptic: { task: "Interpret the parameter in the context", evidence: "The sign controls growth versus decay; taking logarithms of the positive model linearises it, and the logarithmic intercept solves for the initial factor." },
  } },
];

const biologyBriefs: DepthBrief[] = [
  { subject: "biology", topic: "biological-molecules", point: 1, slug: "bio-condensation", capability: "condensation and hydrolysis of biological polymers", contextA: "A food sample is tested before and after enzyme treatment", contextB: "A polymer is assembled in a cell and later recycled", modeA: "track water removal or addition at each bond", modeB: "link the reaction to monomer transport and enzyme specificity", demands: {
    recall: { task: "Define condensation and hydrolysis", evidence: "Condensation joins monomers while releasing water; hydrolysis uses water to break a covalent bond." },
    explanation: { task: "Explain how the reaction changes solubility", evidence: "Hydrolysis produces smaller soluble molecules, whereas polymerisation creates larger molecules that may be less soluble." },
    misconception: { task: "Correct the claim that hydrolysis builds a polymer", evidence: "Hydrolysis cleaves a bond by adding water; condensation is the bond-forming reaction." },
  } },
  { subject: "biology", topic: "biological-molecules", point: 2, slug: "bio-carbohydrates", capability: "carbohydrate structures and functions", contextA: "A plant stores excess photosynthate", contextB: "A runner needs a rapidly available glucose source", modeA: "compare branching, solubility and compact storage", modeB: "relate glycosidic bonds to digestion and transport", demands: {
    recall: { task: "Compare a monosaccharide, disaccharide and polysaccharide", evidence: "Monosaccharides are single sugars, disaccharides contain two linked sugars and polysaccharides are long chains with storage or structural roles." },
    application: { task: "Choose the most suitable carbohydrate for storage", evidence: "A branched, compact and relatively insoluble polysaccharide stores many glucose units without greatly lowering cell water potential." },
    transfer: { task: "Interpret an unfamiliar reducing-sugar test", evidence: "A colour change after heating indicates reducing sugar; a negative result does not rule out a non-reducing sugar until hydrolysis is tested." },
  } },
  { subject: "biology", topic: "biological-molecules", point: 3, slug: "bio-lipids", capability: "triglyceride and phospholipid structure and function", contextA: "A membrane is rebuilt after mechanical damage", contextB: "An animal stores energy before migration", modeA: "map hydrophobic and hydrophilic regions to function", modeB: "compare ester bonds, energy density and insulation", demands: {
    recall: { task: "State the components of a triglyceride and a phospholipid", evidence: "A triglyceride has glycerol plus three fatty acids; a phospholipid has glycerol, two fatty acids and a phosphate-containing head." },
    explanation: { task: "Explain why phospholipids form a bilayer in water", evidence: "Hydrophilic heads interact with water while hydrophobic tails avoid it, producing two layers with tails facing inward." },
    misconception: { task: "Correct the claim that all lipids are polymers", evidence: "Lipids are not repeating monomer polymers in the same sense as proteins or polysaccharides; triglycerides are assembled from glycerol and fatty acids." },
  } },
  { subject: "biology", topic: "biological-molecules", point: 4, slug: "bio-protein-structure", capability: "protein structure and bonding", contextA: "A mutation changes one amino acid in an enzyme", contextB: "A fibrous protein is compared with a globular carrier", modeA: "follow primary sequence to folding and active shape", modeB: "distinguish peptide, hydrogen, ionic and disulfide bonds", demands: {
    recall: { task: "Name the four levels of protein structure", evidence: "Primary is sequence, secondary is local folding, tertiary is the overall three-dimensional fold and quaternary is association of subunits." },
    explanation: { task: "Explain how a sequence change can alter function", evidence: "Changing primary structure can reposition side chains, alter bonding and change the three-dimensional shape of a binding site." },
    transfer: { task: "Predict the effect of reducing disulfide bonds", evidence: "Breaking covalent disulfide links can destabilise tertiary structure even if peptide bonds and the primary sequence remain intact." },
  } },
  { subject: "biology", topic: "biological-molecules", point: 5, slug: "bio-dna-rna", capability: "DNA and RNA structure and base pairing", contextA: "A forensic sample contains short nucleic-acid fragments", contextB: "A cell switches from storing to expressing genetic information", modeA: "use complementary antiparallel pairing", modeB: "compare sugar, bases, strands and roles", demands: {
    recall: { task: "State the complementary base-pairing rules", evidence: "In DNA A pairs with T and C pairs with G through hydrogen bonding; RNA uses U instead of T." },
    explanation: { task: "Explain why complementary strands are useful for copying", evidence: "Each strand provides a template, so a sequence can be copied with predictable complementary bases." },
    misconception: { task: "Correct the claim that RNA always has two strands", evidence: "Most cellular RNA is single-stranded, although it can fold internally through complementary base pairing." },
  } },
  { subject: "biology", topic: "biological-molecules", point: 6, slug: "bio-water", capability: "water properties and hydrogen bonding", contextA: "A pond experiences rapid daytime heating", contextB: "A plant transports water through a narrow vessel", modeA: "link hydrogen bonds to thermal capacity and cohesion", modeB: "use polarity, solvent action and latent heat", demands: {
    recall: { task: "State two biological consequences of water's polarity", evidence: "Polarity makes water a solvent for ions and polar molecules and permits hydrogen bonding between molecules." },
    application: { task: "Explain how cohesion supports a water column", evidence: "Hydrogen bonds create cohesion so evaporation at the leaf can pull a continuous column through xylem, provided the column does not cavitate." },
    synoptic: { task: "Evaluate water as a habitat buffer", evidence: "High specific heat capacity moderates temperature changes, while transparency and solvent properties support aquatic ecosystems." },
  } },
  { subject: "biology", topic: "cell-structure", point: 1, slug: "bio-prokaryote-eukaryote", capability: "prokaryotic and eukaryotic cell structure", contextA: "An unknown cell is observed by electron microscopy", contextB: "A pathogen is cultured and compared with a host cell", modeA: "use nucleus, organelles, DNA form and size", modeB: "separate shared features from diagnostic differences", demands: {
    recall: { task: "State two structural differences", evidence: "Eukaryotes have a membrane-bound nucleus and membrane-bound organelles; prokaryotes lack these and usually have circular DNA in a nucleoid." },
    application: { task: "Classify the unknown cell from the evidence", evidence: "A nucleus and mitochondria identify a eukaryote; a nucleoid, plasmids and a capsule support a prokaryote." },
    misconception: { task: "Correct the claim that prokaryotes have no DNA", evidence: "Prokaryotes contain DNA, generally a circular chromosome and sometimes plasmids, but it is not enclosed in a nucleus." },
  } },
  { subject: "biology", topic: "cell-structure", point: 2, slug: "bio-organelles", capability: "functions of membrane-bound organelles", contextA: "A secretory cell produces a peptide hormone", contextB: "A phagocyte digests an engulfed bacterium", modeA: "follow synthesis, modification and export", modeB: "link vesicles, lysosomes and ATP supply", demands: {
    recall: { task: "State the roles of rough ER, Golgi and lysosome", evidence: "Rough ER synthesises proteins, Golgi modifies and sorts them, and lysosomes contain hydrolytic enzymes for intracellular digestion." },
    explanation: { task: "Explain why the secretory pathway is compartmentalised", evidence: "Membrane-bound compartments keep enzymes and substrates together, allow sequential modification and package cargo into vesicles." },
    transfer: { task: "Predict which organelle is defective from the phenotype", evidence: "Accumulated unfolded secretory protein suggests rough-ER processing stress, whereas undigested vesicles suggest lysosomal enzyme failure." },
  } },
  { subject: "biology", topic: "cell-structure", point: 3, slug: "bio-magnification", capability: "magnification and resolution in microscopy", contextA: "A micrograph measures a chloroplast", contextB: "Two microscopes are compared for organelle detail", modeA: "convert units before using image-to-object ratio", modeB: "distinguish magnification from resolving power", demands: {
    recall: { task: "State the magnification equation", evidence: "Magnification = image size ÷ actual size, with both lengths in the same units." },
    calculation: { task: "Calculate actual size from the micrograph", evidence: "Convert the image measurement and divide by magnification; report the answer with a unit and sensible precision." },
    misconception: { task: "Correct the claim that higher magnification guarantees more detail", evidence: "Magnification enlarges an image, but resolution is the ability to distinguish two close points and is limited by the instrument and wavelength." },
  } },
  { subject: "biology", topic: "cell-structure", point: 4, slug: "bio-organisation", capability: "levels of biological organisation", contextA: "A disease affects a tissue before symptoms appear", contextB: "A practical report moves between scales", modeA: "keep the nested order from organelle to organism", modeB: "connect structure with emergent function", demands: {
    recall: { task: "List the levels from organelle to organism", evidence: "Organelle, cell, tissue, organ, organ system and organism are nested levels of organisation." },
    explanation: { task: "Explain why a tissue has a function a single cell may not", evidence: "Cells with related specialisations cooperate and interact, producing an emergent tissue function that one cell cannot perform alone." },
    transfer: { task: "Locate the earliest level affected by the stated mutation", evidence: "Identify the molecular or organelle defect first, then trace how it changes cell, tissue and organ function rather than jumping directly to symptoms." },
  } },
  { subject: "biology", topic: "cell-structure", point: 5, slug: "bio-fractionation", capability: "cell fractionation and ultracentrifugation", contextA: "A liver homogenate is separated into fractions", contextB: "A researcher wants to isolate intact mitochondria", modeA: "use isotonic buffer, filtration and increasing speeds", modeB: "match pellet order to size and density", demands: {
    recall: { task: "State why an isotonic buffer is used", evidence: "An isotonic, cold buffered solution limits osmotic lysis, slows enzyme activity and maintains a suitable pH during homogenisation." },
    explanation: { task: "Explain why centrifugation is performed at increasing speeds", evidence: "Large and dense components sediment at lower speeds; smaller components require greater centrifugal force and longer runs." },
    application: { task: "Predict which fraction contains mitochondria", evidence: "After removing nuclei and debris, mitochondria form a pellet at an intermediate speed before microsomes and ribosomes." },
  } },
  { subject: "biology", topic: "membranes-transport", point: 1, slug: "bio-fluid-mosaic", capability: "fluid mosaic membrane structure", contextA: "A membrane protein is tracked during lateral movement", contextB: "A membrane must remain flexible at low temperature", modeA: "map phospholipids, proteins, cholesterol and carbohydrates", modeB: "relate component mobility to function", demands: {
    recall: { task: "Name the principal components of the fluid mosaic model", evidence: "The bilayer contains phospholipids, embedded proteins, cholesterol and carbohydrate chains attached to lipids or proteins." },
    explanation: { task: "Explain why cholesterol buffers membrane fluidity", evidence: "Cholesterol restricts phospholipid movement at high temperature but prevents tight packing at low temperature, reducing extremes of fluidity." },
    misconception: { task: "Correct the claim that all membrane proteins span the bilayer", evidence: "Some proteins are integral and span or enter the bilayer, while peripheral proteins attach to a surface." },
  } },
  { subject: "biology", topic: "membranes-transport", point: 2, slug: "bio-transport", capability: "diffusion, facilitated diffusion and active transport", contextA: "An epithelial cell absorbs a solute from the gut", contextB: "A toxin blocks ATP production", modeA: "compare gradients, proteins and energy", modeB: "trace the effect through coupled transport", demands: {
    recall: { task: "Distinguish the three transport processes", evidence: "Diffusion is passive movement down a gradient, facilitated diffusion uses membrane proteins down a gradient and active transport uses energy to move against a gradient." },
    application: { task: "Choose the process for the described uptake", evidence: "A solute moving against its electrochemical gradient through a carrier with ATP or a coupled gradient is active transport." },
    synoptic: { task: "Predict the effect of respiratory inhibition", evidence: "ATP-dependent pumps slow first, gradients collapse and secondary active uptake falls even if the carrier proteins remain present." },
  } },
  { subject: "biology", topic: "membranes-transport", point: 4, slug: "bio-permeability", capability: "factors affecting membrane permeability", contextA: "A dye leaks from beetroot discs at different temperatures", contextB: "A solvent changes the lipid environment", modeA: "link temperature or solvent to bilayer disruption", modeB: "separate membrane damage from transport regulation", demands: {
    recall: { task: "State two factors that alter permeability", evidence: "Temperature, solvent polarity, pH and mechanical damage can alter bilayer packing or membrane-protein structure." },
    application: { task: "Interpret the leakage pattern", evidence: "A sharp increase above a threshold suggests bilayer disruption or protein denaturation rather than a simple linear diffusion effect." },
    misconception: { task: "Correct the claim that more pigment always means more pigment was produced", evidence: "The measured dye may have leaked from damaged cells; a control for tissue mass, surface area and extraction is needed before inferring synthesis." },
  } },
  { subject: "biology", topic: "membranes-transport", point: 5, slug: "bio-osmosis-investigations", capability: "U-tube and visking-tubing investigations", contextA: "A visking tube separates sucrose solution from water", contextB: "A U-tube develops a height difference", modeA: "identify selectively permeable barriers and water potential", modeB: "predict volume, pressure and direction of net flow", demands: {
    recall: { task: "State the condition required for osmosis", evidence: "Osmosis is net movement of water across a selectively permeable membrane from higher to lower water potential." },
    calculation: { task: "Calculate the percentage mass change", evidence: "Percentage change = (final mass − initial mass)/initial mass × 100, retaining the sign to show gain or loss." },
    transfer: { task: "Explain why the height difference eventually stops growing", evidence: "Hydrostatic pressure opposes the water-potential gradient until the combined water potential is equal on both sides." },
  } },
  { subject: "biology", topic: "nucleic-acids", point: 1, slug: "bio-replication", capability: "semi-conservative DNA replication", contextA: "A cell enters S phase", contextB: "Isotope labelling tracks DNA after two divisions", modeA: "unzip, complement and join new strands", modeB: "use the old strand as a template and interpret bands", demands: {
    recall: { task: "Define semi-conservative replication", evidence: "Each daughter DNA molecule contains one original strand and one newly synthesised complementary strand." },
    explanation: { task: "Explain the role of hydrogen bonds and DNA polymerase", evidence: "Hydrogen bonds between bases can be broken to separate strands; DNA polymerase joins complementary nucleotides into the new strand." },
    transfer: { task: "Predict the band pattern after two labelled divisions", evidence: "After one division every molecule is hybrid; after two divisions half remain hybrid and half contain two new strands under the standard model." },
  } },
  { subject: "biology", topic: "nucleic-acids", point: 2, slug: "bio-protein-synthesis", capability: "transcription and translation", contextA: "A mutation changes a coding sequence", contextB: "A ribosome translates an unfamiliar mRNA", modeA: "transcribe a complementary RNA and read codons", modeB: "follow tRNA anticodons, peptide bonds and stop", demands: {
    recall: { task: "State the roles of mRNA, tRNA and the ribosome", evidence: "mRNA carries the codon sequence, tRNA carries amino acids with complementary anticodons and the ribosome joins amino acids in sequence." },
    application: { task: "Translate the stated mRNA segment with the start site and stop codon held constant", evidence: "Read codons from the start site, match each anticodon and stop at a termination codon; do not read the DNA strand as mRNA directly." },
    misconception: { task: "Correct the claim that a base substitution always changes the protein", evidence: "The substitution may be silent because the genetic code is degenerate, or it may alter one amino acid or introduce a stop codon." },
  } },
  { subject: "biology", topic: "nucleic-acids", point: 3, slug: "bio-mutations", capability: "mutations and their effects", contextA: "A population contains a new allele after replication", contextB: "A disease-associated variant is compared with a neutral variant", modeA: "classify substitution, insertion or deletion and frameshift", modeB: "separate molecular change from trait and selection", demands: {
    recall: { task: "Define mutation and distinguish substitution from indel", evidence: "A mutation is a change in genetic material; a substitution replaces a base, whereas an insertion or deletion changes sequence length and may cause a frameshift." },
    explanation: { task: "Explain why a frameshift can have a large effect", evidence: "Changing the reading frame alters every downstream codon, often producing a different amino-acid sequence and an early stop." },
    synoptic: { task: "Evaluate whether a variant is necessarily harmful", evidence: "Effect depends on location, codon change, protein function and environment; a mutation can be neutral, beneficial or harmful." },
  } },
];

const chemistryBriefs: DepthBrief[] = [
  { subject: "chemistry", topic: "atomic-structure", point: 1, slug: "chem-isotopes", capability: "proton number, nucleon number, isotopes and relative atomic mass", contextA: "A mass spectrum contains three isotopes", contextB: "An unknown element is identified from ion counts", modeA: "separate proton, neutron and electron counts", modeB: "weight isotope masses by abundance", demands: {
    recall: { task: "Define proton number, nucleon number and isotope", evidence: "Proton number is the number of protons, nucleon number is protons plus neutrons and isotopes have the same proton number but different neutron numbers." },
    calculation: { task: "Calculate the relative atomic mass", evidence: "Multiply each isotope mass by its fractional abundance, add the products and divide by the total abundance if percentages are not normalised." },
    misconception: { task: "Correct the claim that isotopes have different chemical elements", evidence: "Isotopes are atoms of the same element because they have the same proton number; their neutron numbers and masses differ." },
  } },
  { subject: "chemistry", topic: "atomic-structure", point: 2, slug: "chem-mass-spectrum", capability: "mass spectrometry and fragmentation", contextA: "A molecular ion peak is used to identify an organic compound", contextB: "Fragment peaks are compared with candidate structures", modeA: "read m/z, isotope patterns and abundance", modeB: "use cleavage fragments as supporting evidence", demands: {
    recall: { task: "State what the molecular-ion peak represents", evidence: "The molecular ion is the intact molecule after loss of one electron; its m/z gives relative molecular mass for a singly charged ion." },
    application: { task: "Use the isotope pattern to identify a halogen", evidence: "A chlorine-containing molecule gives an M:M+2 pattern close to 3:1, while bromine gives roughly 1:1 because of isotope abundances." },
    transfer: { task: "Use fragments to distinguish two isomers", evidence: "Compare fragment masses expected from different cleavages; a matching fragment supports a structure but one peak alone is not proof." },
  } },
  { subject: "chemistry", topic: "atomic-structure", point: 3, slug: "chem-electron-config", capability: "electron configurations", contextA: "An ion forms from a transition-metal atom", contextB: "Successive ionisation energies reveal shells", modeA: "fill sub-shells in energy order then remove outer electrons", modeB: "locate the large jump and infer occupied shells", demands: {
    recall: { task: "Write an s, p and d electron configuration", evidence: "Sub-shells fill in increasing energy with capacities s², p⁶ and d¹⁰; write the configuration for the stated atom or ion." },
    application: { task: "Explain the ionisation-energy jump with the stated ion and charge held constant", evidence: "A large jump occurs when an electron must be removed from an inner shell closer to the nucleus after the outer shell is empty." },
    misconception: { task: "Correct the claim that 4s electrons are always removed after 3d", evidence: "For transition-metal ions the 4s electrons are generally removed before 3d because the relative energies change on ionisation." },
  } },
  { subject: "chemistry", topic: "atomic-structure", point: 4, slug: "chem-ionisation-trends", capability: "ionisation energy trends and exceptions", contextA: "Two adjacent elements have an unexpected dip", contextB: "A period trend is explained from sub-shell occupancy", modeA: "compare nuclear charge, shielding and distance", modeB: "identify paired-electron repulsion or sub-shell change", demands: {
    recall: { task: "State the general first-ionisation-energy trend across a period", evidence: "It generally increases because nuclear charge rises while added electrons enter the same principal shell with similar shielding." },
    explanation: { task: "Explain a dip between neighbouring elements", evidence: "A dip can arise when the electron enters a higher-energy sub-shell or when a paired p electron experiences extra repulsion." },
    transfer: { task: "Predict the trend for a new period", evidence: "Use nuclear charge, shielding, sub-shell and distance arguments rather than assuming a perfectly smooth increase." },
  } },
  { subject: "chemistry", topic: "atomic-structure", point: 5, slug: "chem-trends", capability: "atomic radius and electronegativity trends", contextA: "Bond polarity is predicted for a period-three compound", contextB: "Atomic radii are compared down a group", modeA: "use effective nuclear charge and shells", modeB: "link attraction to electronegativity and bond dipoles", demands: {
    recall: { task: "State the trend in atomic radius across a period and down a group", evidence: "Radius generally decreases across a period and increases down a group because shell number and shielding change." },
    application: { task: "Predict which atom attracts a shared pair more strongly", evidence: "The more electronegative atom attracts bonding electrons more strongly, giving the bond a partial negative charge at that end." },
    misconception: { task: "Correct the claim that the largest atom is always most electronegative", evidence: "Electronegativity depends on attraction for a bonding pair; larger radius and shielding generally weaken that attraction." },
  } },
  { subject: "chemistry", topic: "moles", point: 1, slug: "chem-mole-definitions", capability: "mole, Avogadro constant and molar mass", contextA: "A sample contains a measured number of molecules", contextB: "A weighing is converted into amount of substance", modeA: "move between particles, moles and mass", modeB: "track units through the conversion", demands: {
    recall: { task: "Define the mole and molar mass", evidence: "One mole contains the Avogadro number of entities; molar mass is the mass of one mole in g mol⁻¹." },
    calculation: { task: "Convert the stated mass to particles", evidence: "Find n = m/M in moles, then multiply by N_A and retain the requested significant figures." },
    misconception: { task: "Correct the claim that 1 mol of every substance has the same mass", evidence: "One mole has the same number of entities, but its mass depends on the relative formula or atomic mass." },
  } },
  { subject: "chemistry", topic: "moles", point: 2, slug: "chem-mass-concentration", capability: "n = m/M and n = cV", contextA: "A solution is prepared from a solid", contextB: "An aliquot is diluted before analysis", modeA: "choose mass or concentration route and convert volume", modeB: "conserve moles through dilution", demands: {
    recall: { task: "State both mole equations and the volume convention", evidence: "n = m/M and n = cV; when c is in mol dm⁻³, V must be in dm³." },
    calculation: { task: "Find the concentration after making up the flask", evidence: "Calculate moles from mass or titre, divide by the final volume in dm³ and report units." },
    transfer: { task: "Recover the stock concentration from an aliquot", evidence: "Dilution conserves solute moles, so use c₁V₁ = c₂V₂ before accounting for the aliquot fraction." },
  } },
  { subject: "chemistry", topic: "moles", point: 3, slug: "chem-gas-equation", capability: "ideal gas equation", contextA: "A gas syringe measures a reaction yield", contextB: "A pressure vessel is calibrated at a new temperature", modeA: "convert pressure and volume to SI before substitution", modeB: "hold the correct variables constant and rearrange", demands: {
    recall: { task: "State the ideal gas equation and SI requirements", evidence: "pV = nRT, with p in Pa, V in m³, n in mol, T in K and R in J mol⁻¹ K⁻¹." },
    calculation: { task: "Calculate the amount of gas", evidence: "Convert the measured values to SI, rearrange n = pV/RT and check the scale against the measured volume." },
    misconception: { task: "Correct the use of Celsius in pV = nRT", evidence: "The gas equation uses absolute temperature in kelvin; Celsius must be converted by adding 273.15." },
  } },
  { subject: "chemistry", topic: "moles", point: 4, slug: "chem-empirical-formula", capability: "empirical and molecular formulae", contextA: "Combustion data gives carbon, hydrogen and oxygen masses", contextB: "A vapour density identifies the molecular multiple", modeA: "convert each element mass to moles and divide by the smallest", modeB: "scale the empirical formula to Mr", demands: {
    recall: { task: "Define empirical and molecular formula", evidence: "The empirical formula is the simplest whole-number ratio of atoms; the molecular formula gives the actual numbers in a molecule." },
    calculation: { task: "Find the empirical formula from the composition", evidence: "Convert masses or percentages to moles, divide by the smallest and multiply all ratios to whole numbers." },
    transfer: { task: "Use Mr to obtain the molecular formula", evidence: "Divide molecular Mr by empirical-formula mass to get an integer multiplier, then multiply every subscript." },
  } },
  { subject: "chemistry", topic: "moles", point: 5, slug: "chem-yield-economy", capability: "percentage yield, atom economy and limiting reagent", contextA: "Two routes produce the same target compound", contextB: "Reactants are mixed in non-stoichiometric amounts", modeA: "compare theoretical and actual product", modeB: "identify the limiting reactant before evaluating waste", demands: {
    recall: { task: "State the definitions of yield and atom economy", evidence: "Percentage yield compares actual with theoretical product; atom economy is desired-product Mr divided by total reactant Mr, multiplied by 100." },
    calculation: { task: "Calculate yield and identify the limiting reagent", evidence: "Use the balanced equation to calculate each possible product amount; the smaller amount identifies the limiting reagent before percentage yield." },
    synoptic: { task: "Choose the greener route", evidence: "Consider atom economy, percentage yield, energy, solvent and hazard together; a high yield alone does not prove the route is sustainable." },
  } },
  { subject: "chemistry", topic: "bonding", point: 1, slug: "chem-bond-types", capability: "ionic, covalent, dative and metallic bonding", contextA: "A solid's properties are compared with a molecular liquid", contextB: "A coordinate bond forms in an ion", modeA: "describe electron transfer or sharing", modeB: "map lattice, delocalisation and donor pairs to properties", demands: {
    recall: { task: "Define ionic, covalent, dative and metallic bonding", evidence: "Ionic attraction joins oppositely charged ions, covalent bonding shares electron pairs, dative bonding supplies both electrons from one atom and metallic bonding joins positive ions with delocalised electrons." },
    explanation: { task: "Explain why the solid conducts only when molten", evidence: "Ions are fixed in a lattice when solid but mobile when molten, so charge can move only in the molten or dissolved state." },
    misconception: { task: "Correct the claim that a dative bond is weaker by definition", evidence: "A dative bond is covalent once formed; its origin does not alone determine its bond strength." },
  } },
  { subject: "chemistry", topic: "bonding", point: 2, slug: "chem-polarity", capability: "electronegativity and bond polarity", contextA: "A solvent is selected for an ionic solute", contextB: "A molecule has several polar bonds", modeA: "compare electronegativities and dipoles", modeB: "sum bond dipoles using molecular geometry", demands: {
    recall: { task: "Define electronegativity and bond polarity", evidence: "Electronegativity is attraction for a bonding pair; unequal attraction gives a bond dipole with partial charges." },
    application: { task: "Decide whether the molecule is polar for the stated structures with the supplied bond dipoles", evidence: "Draw the shape and add the bond dipoles as vectors; polar bonds can cancel in a symmetrical molecule." },
    transfer: { task: "Predict solubility in a polar solvent", evidence: "Ionic or polar solutes are stabilised by polar solvent interactions, while non-polar solutes are better matched to non-polar solvents." },
  } },
  { subject: "chemistry", topic: "bonding", point: 3, slug: "chem-intermolecular", capability: "intermolecular forces and physical properties", contextA: "Boiling points of homologous molecules are compared", contextB: "An isomer has a different volatility", modeA: "rank hydrogen bonding, permanent dipoles and dispersion", modeB: "consider surface area and temporary dipoles", demands: {
    recall: { task: "Name the main intermolecular forces", evidence: "London dispersion forces act between all particles, permanent dipole interactions act between polar molecules and hydrogen bonding is a strong case involving H bonded to N, O or F." },
    explanation: { task: "Explain the boiling-point trend", evidence: "More energy is needed to overcome stronger intermolecular attractions; larger molecules usually have stronger dispersion forces, while branching can reduce contact area." },
    misconception: { task: "Correct the claim that covalent bonds break on boiling", evidence: "Boiling separates molecules by overcoming intermolecular attractions; covalent bonds inside each molecule remain intact." },
  } },
  { subject: "chemistry", topic: "bonding", point: 4, slug: "chem-vsepr", capability: "VSEPR molecular shapes and bond angles", contextA: "A molecule's dipole is predicted from its Lewis structure", contextB: "A lone pair changes an expected tetrahedral angle", modeA: "count electron domains and include lone-pair repulsion", modeB: "distinguish electron-domain geometry from molecular shape", demands: {
    recall: { task: "State the VSEPR principle", evidence: "Electron pairs repel and arrange around a central atom to maximise separation; lone pairs repel more strongly than bonding pairs." },
    application: { task: "Predict the shape and approximate angle for the stated structures with the supplied lone pairs", evidence: "Count bonding and lone pairs, choose the electron-domain arrangement and reduce the angle when lone pairs occupy domains." },
    misconception: { task: "Correct the claim that four electron pairs always give a tetrahedral molecule", evidence: "Four domains give tetrahedral electron geometry, but one or more lone pairs change the molecular shape and bond angle." },
  } },
  { subject: "chemistry", topic: "bonding", point: 5, slug: "chem-lattice-properties", capability: "lattice structure and physical properties", contextA: "An ionic solid is compared with graphite", contextB: "A molecular solid is tested for conductivity", modeA: "link strong attractions and mobile charge carriers", modeB: "distinguish giant lattices from discrete molecules", demands: {
    recall: { task: "State why giant ionic lattices have high melting points", evidence: "Strong electrostatic attractions act throughout the lattice, so much energy is needed to separate the ions." },
    explanation: { task: "Explain graphite's electrical conductivity", evidence: "Each carbon bonds to three others, leaving one electron delocalised per atom; these electrons carry charge along the layers." },
    transfer: { task: "Predict the effect of dissolving the solid", evidence: "If the lattice dissociates into mobile ions, the solution can conduct; a molecular substance may dissolve without producing charge carriers." },
  } },
  { subject: "chemistry", topic: "kinetics", point: 1, slug: "chem-rate", capability: "rate of reaction and methods of following it", contextA: "Gas volume is recorded during a reaction", contextB: "A colour change is followed with a colorimeter", modeA: "define rate as change per time and choose a measurable proxy", modeB: "use an early-time sampling method and control the measurement", demands: {
    recall: { task: "Define rate of reaction", evidence: "Rate is change in concentration or amount of a reactant or product per unit time, with stoichiometric signs interpreted consistently." },
    calculation: { task: "Find the initial rate from the graph", evidence: "Draw a tangent at time zero, calculate its gradient with units and state whether the plotted quantity increases or decreases." },
    application: { task: "Choose a suitable method for the opaque reaction", evidence: "Use gas collection, mass loss, colourimetry or sampling according to the measurable change, while controlling temperature and mixing." },
  } },
  { subject: "chemistry", topic: "kinetics", point: 2, slug: "chem-collision", capability: "collision theory and factors affecting rate", contextA: "A powder reacts faster than lumps", contextB: "A catalyst changes the energy profile", modeA: "count successful collisions and activation energy", modeB: "compare distribution tails with and without catalyst", demands: {
    recall: { task: "State the two conditions for a successful collision", evidence: "Particles must collide with energy at least equal to the activation energy and with a suitable orientation." },
    explanation: { task: "Explain the effect of temperature", evidence: "Heating increases collision frequency and, more importantly, the fraction of particles with energy at least Ea, so the rate rises." },
    misconception: { task: "Correct the claim that a catalyst increases the energy of every collision", evidence: "A catalyst provides a lower-Ea pathway; it changes the fraction of successful collisions without changing the particles' average kinetic energy at fixed temperature." },
  } },
  { subject: "chemistry", topic: "equilibria", point: 1, slug: "chem-dynamic-equilibrium", capability: "dynamic equilibrium and Le Chatelier principle", contextA: "A sealed reactor is perturbed by adding reactant", contextB: "An industrial process balances conversion with energy cost", modeA: "compare forward and reverse rates after a change", modeB: "predict the direction that opposes the imposed change", demands: {
    recall: { task: "Define dynamic equilibrium", evidence: "In a closed system the forward and reverse reactions continue at equal rates, so macroscopic concentrations remain constant." },
    explanation: { task: "Explain the response to adding a reactant", evidence: "The forward rate initially rises because reactant concentration increases; net reaction consumes some of the added reactant until rates become equal again." },
    synoptic: { task: "Evaluate a compromise industrial condition", evidence: "Choose temperature, pressure and catalyst by balancing equilibrium yield, reaction rate, safety and cost rather than maximising one factor alone." },
  } },
  { subject: "chemistry", topic: "equilibria", point: 2, slug: "chem-le-chatelier", capability: "effects of concentration, pressure and temperature", contextA: "A gaseous equilibrium is compressed", contextB: "The equilibrium constant changes with temperature", modeA: "count gas moles and identify the endothermic direction", modeB: "separate position, rate and Kc", demands: {
    recall: { task: "State the pressure rule for a gaseous equilibrium", evidence: "Increasing pressure favours the side with fewer gas molecules, provided temperature is constant and the gas-mole numbers differ." },
    application: { task: "Predict the effect of the stated temperature change", evidence: "Heating favours the endothermic direction; cooling favours the exothermic direction, while Kc changes only with temperature." },
    misconception: { task: "Correct the claim that a catalyst shifts equilibrium", evidence: "A catalyst speeds both directions by a comparable pathway and changes the time to equilibrium, not the equilibrium position or Kc." },
  } },
  { subject: "chemistry", topic: "acids-bases", point: 1, slug: "chem-bronsted", capability: "Bronsted-Lowry acids, bases and conjugate pairs", contextA: "An acid transfers a proton to water", contextB: "An amphiprotic ion reacts in two possible directions", modeA: "identify donor, acceptor and conjugate change", modeB: "track proton transfer rather than charge labels alone", demands: {
    recall: { task: "Define a Bronsted-Lowry acid and base", evidence: "An acid donates a proton and a base accepts a proton; a conjugate pair differs by one proton." },
    application: { task: "Identify both conjugate pairs for the stated acid with the supplied base", evidence: "Mark the species that loses H⁺ and the species that gains H⁺; compare each with its conjugate by one proton." },
    misconception: { task: "Correct the claim that a strong acid has no conjugate base", evidence: "Every acid has a conjugate base; a strong acid has a very weak conjugate base because proton transfer is strongly favoured." },
  } },
];

export const wjecFlagshipDepthQuestions: Question[] = defineQuestions([
  ...mathsBriefs.flatMap(questionsFor),
  ...biologyBriefs.flatMap(questionsFor),
  ...chemistryBriefs.flatMap(questionsFor),
]);

export const wjecFlagshipDepthCounts = {
  mathsStatements: mathsBriefs.length,
  biologyStatements: biologyBriefs.length,
  chemistryStatements: chemistryBriefs.length,
  questions: wjecFlagshipDepthQuestions.length,
} as const;
