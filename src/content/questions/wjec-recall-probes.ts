import type { Question } from "@/domain/types";
import { wjecCapabilities } from "../capabilities";
import { defineQuestion } from "./authoring";

// ---------------------------------------------------------------------------
// Recall-level probes for WJEC Maths, Biology and Chemistry topics that had
// none (2026-10-11, ninth pass). Early diagnostics probe recall first and
// escalate to application (diagnostic-intake.ts); without a recall item a
// topic could only be probed at application level, so a recall gap and an
// application gap looked the same.
//
// Topics were chosen in the reviewer portal's priority order
// (buildReviewPriorities), so these sit where teachers look first.
//
// Original practice content, not reproduced board questions or
// examiner-validated material: every item is unverified, has no reviewer,
// and can only become proof-eligible through two independent teacher
// approvals in the reviewer portal. Each mark has a visible answer and an
// explicit capability/spec mapping.
// ---------------------------------------------------------------------------

type Item = {
  slug: string;
  /** Capability node id (wjecCapabilities); supplies subject, topic and spec points. */
  skill: string;
  context: string;
  stem: string;
  prompt: string;
  scheme: string[];
  answer: string;
  move: string;
};

const items: Item[] = [
  // --- Maths ---------------------------------------------------------------
  { slug: "math-discriminant-recall", skill: "math.algebra.sp-02", context: "discriminant-condition",
    stem: "Consider the quadratic equation ax² + bx + c = 0, where a ≠ 0.",
    prompt: "Write down the discriminant of the equation, and state the condition on the discriminant for the equation to have two distinct real roots.",
    scheme: ["Discriminant = b² − 4ac", "Two distinct real roots when b² − 4ac > 0"],
    answer: "The discriminant is b² − 4ac. There are two distinct real roots when b² − 4ac > 0.",
    move: "recall the discriminant and the inequality for two distinct real roots" },
  { slug: "math-integral-recall", skill: "math.integration.sp-01", context: "standard-integrals",
    stem: "Standard indefinite integrals are needed throughout calculus.",
    prompt: "Write down ∫ xⁿ dx for n ≠ −1, and write down ∫ (1/x) dx.",
    scheme: ["∫ xⁿ dx = xⁿ⁺¹/(n + 1) + c", "∫ (1/x) dx = ln|x| + c"],
    answer: "∫ xⁿ dx = xⁿ⁺¹/(n + 1) + c for n ≠ −1, and ∫ (1/x) dx = ln|x| + c.",
    move: "recall the power rule for integration and its n = −1 exception" },
  { slug: "math-double-angle-recall", skill: "math.trigonometry.sp-02", context: "double-angle-identities",
    stem: "Double-angle identities express trigonometric functions of 2θ in terms of θ.",
    prompt: "Write down the identity for sin 2θ, and write cos 2θ in terms of cos θ only.",
    scheme: ["sin 2θ = 2 sin θ cos θ", "cos 2θ = 2cos²θ − 1"],
    answer: "sin 2θ = 2 sin θ cos θ and cos 2θ = 2cos²θ − 1.",
    move: "recall the double-angle identities and choose the cosine-only form" },
  { slug: "math-circle-recall", skill: "math.coordinate-geometry.sp-01", context: "circle-equation",
    stem: "A circle has equation (x − 3)² + (y + 2)² = 25.",
    prompt: "Write down the general equation of a circle with centre (a, b) and radius r, and state the centre and radius of this circle.",
    scheme: ["(x − a)² + (y − b)² = r²", "Centre (3, −2) and radius 5"],
    answer: "(x − a)² + (y − b)² = r². This circle has centre (3, −2) and radius 5.",
    move: "read the centre and radius from the completed-square form of a circle" },
  { slug: "math-binomial-conditions-recall", skill: "math.distributions.sp-01", context: "binomial-conditions",
    stem: "A random variable X is to be modelled as X ~ B(n, p).",
    prompt: "State the conditions needed for this binomial model to be suitable, and write down E(X).",
    scheme: ["A fixed number, n, of independent trials", "Each trial has two outcomes (success or failure) with a constant probability p of success", "E(X) = np"],
    answer: "There is a fixed number n of independent trials, each with only two outcomes and the same probability p of success. E(X) = np.",
    move: "list the binomial modelling conditions before using the mean formula" },
  { slug: "math-suvat-recall", skill: "math.kinematics.sp-01", context: "suvat-conditions",
    stem: "A particle moves in a straight line with initial velocity u, final velocity v and displacement s.",
    prompt: "Write down the constant acceleration equation that links v, u, a and s, and state the condition on the motion for this equation to apply.",
    scheme: ["v² = u² + 2as", "The acceleration must be constant"],
    answer: "v² = u² + 2as, which applies only when the acceleration is constant.",
    move: "recall the time-free constant acceleration equation and its condition" },

  // --- Biology -------------------------------------------------------------
  { slug: "bio-semi-conservative-recall", skill: "bio.nucleic-acids.sp-01", context: "semi-conservative-definition",
    stem: "DNA replication is described as semi-conservative.",
    prompt: "State what is meant by semi-conservative replication.",
    scheme: ["Each new DNA molecule contains one original (parental) strand", "and one newly synthesised strand"],
    answer: "Each daughter DNA molecule is made of one strand from the original molecule and one newly made strand.",
    move: "state what is conserved in each daughter DNA molecule" },
  { slug: "bio-insulin-recall", skill: "bio.homeostasis.sp-02", context: "glucose-hormone-source",
    stem: "After a meal, the concentration of glucose in the blood rises.",
    prompt: "Name the hormone released in response to this rise, and name the cells that secrete it.",
    scheme: ["Insulin", "β (beta) cells of the islets of Langerhans in the pancreas"],
    answer: "Insulin, secreted by the β cells of the islets of Langerhans in the pancreas.",
    move: "match the stimulus to the hormone and its secreting cells" },
  { slug: "bio-pulmonary-vein-recall", skill: "bio.transport-animals.sp-01", context: "heart-vessels",
    stem: "In the mammalian double circulation, oxygenated blood returns from the lungs to the heart.",
    prompt: "Name the blood vessel that carries this blood to the heart, and name the chamber of the heart it enters.",
    scheme: ["Pulmonary vein", "Left atrium"],
    answer: "The pulmonary vein, which delivers blood to the left atrium.",
    move: "trace the pulmonary circuit back into the heart" },
  { slug: "bio-gpp-npp-recall", skill: "bio.ecosystems.sp-02", context: "productivity-definitions",
    stem: "Ecologists measure primary productivity in an ecosystem.",
    prompt: "Define gross primary productivity (GPP), and state how net primary productivity (NPP) is related to it.",
    scheme: ["GPP is the rate at which producers convert light energy into chemical energy in organic molecules by photosynthesis", "NPP = GPP − energy lost in respiration (R)"],
    answer: "GPP is the rate at which plants (producers) store light energy as chemical energy in organic molecules through photosynthesis. NPP = GPP − R, where R is the energy used in respiration.",
    move: "define GPP and subtract respiratory losses to give NPP" },
  { slug: "bio-alveoli-diffusion-recall", skill: "bio.gas-exchange.sp-03", context: "alveolar-exchange",
    stem: "Oxygen moves from the air in the alveoli into the blood in the surrounding capillaries.",
    prompt: "Name the process by which oxygen moves, and state one feature of the alveoli that increases the rate of this process.",
    scheme: ["Diffusion", "Any one of: large surface area; thin walls (one cell thick) giving a short diffusion distance; extensive capillary network maintaining a steep concentration gradient"],
    answer: "Diffusion. The alveoli have a very large surface area (also accept: walls one cell thick so the diffusion distance is short, or a dense capillary network that maintains the concentration gradient).",
    move: "name the transport process and link one alveolar feature to its rate" },
  { slug: "bio-codominance-recall", skill: "bio.genetics-inheritance.sp-03", context: "codominance-definition",
    stem: "Some genes show codominance.",
    prompt: "State what is meant by codominance, and give one example.",
    scheme: ["Both alleles are expressed in the phenotype of a heterozygote", "A correct example, such as the Iᴬ and Iᴮ alleles both expressed in blood group AB"],
    answer: "In codominance both alleles are expressed in the phenotype of a heterozygote, for example blood group AB, where alleles Iᴬ and Iᴮ are both expressed.",
    move: "define codominance through the heterozygote phenotype" },

  // --- Chemistry -----------------------------------------------------------
  { slug: "chem-dative-recall", skill: "chem.bonding.sp-01", context: "dative-bond-definition",
    stem: "Ammonia reacts with a hydrogen ion to form the ammonium ion, NH₄⁺.",
    prompt: "State what is meant by a dative covalent (coordinate) bond, and identify which atom provides the electrons for the new bond in NH₄⁺.",
    scheme: ["A shared pair of electrons in which both electrons are provided by the same atom", "The nitrogen atom (its lone pair)"],
    answer: "A dative covalent bond is a shared pair of electrons where both electrons come from one atom. In NH₄⁺ the nitrogen atom donates its lone pair to H⁺.",
    move: "define a dative bond and locate the donated lone pair" },
  { slug: "chem-bronsted-recall", skill: "chem.acids-bases.sp-01", context: "conjugate-pairs",
    stem: "NH₄⁺(aq) + H₂O(l) ⇌ NH₃(aq) + H₃O⁺(aq)",
    prompt: "State the Brønsted–Lowry definition of an acid, and give the conjugate base of NH₄⁺.",
    scheme: ["An acid is a proton (H⁺) donor", "NH₃"],
    answer: "A Brønsted–Lowry acid is a proton donor. The conjugate base of NH₄⁺ is NH₃.",
    move: "define an acid as a proton donor and remove one proton to find its conjugate base" },
  { slug: "chem-activation-energy-recall", skill: "chem.kinetics.sp-04", context: "activation-energy-catalyst",
    stem: "A catalyst increases the rate of a reaction without being used up.",
    prompt: "Define activation energy, and state how a catalyst increases the rate of a reaction.",
    scheme: ["Activation energy is the minimum energy that colliding particles need in order to react", "A catalyst provides an alternative reaction pathway with a lower activation energy"],
    answer: "Activation energy is the minimum energy colliding particles must have to react. A catalyst provides an alternative route with a lower activation energy, so more collisions have enough energy to react.",
    move: "define activation energy and link a catalyst to an alternative lower-energy pathway" },
  { slug: "chem-formation-enthalpy-recall", skill: "chem.energetics.sp-01", context: "formation-definition",
    stem: "Standard enthalpy changes are defined under stated conditions.",
    prompt: "Define the standard enthalpy change of formation of a compound.",
    scheme: ["The enthalpy change when one mole of the compound is formed from its elements", "with all reactants and products in their standard states under standard conditions"],
    answer: "The enthalpy change when one mole of a compound is formed from its constituent elements, with all substances in their standard states under standard conditions (298 K and a standard pressure).",
    move: "state the one-mole, from-elements and standard-state parts of the definition" },
  { slug: "chem-oxidation-number-recall", skill: "chem.redox.sp-01", context: "permanganate-oxidation-state",
    stem: "Manganate(VII) ions, MnO₄⁻, are used as oxidising agents.",
    prompt: "State the oxidation number of manganese in MnO₄⁻, and define oxidation in terms of oxidation number.",
    scheme: ["+7", "Oxidation is an increase in oxidation number"],
    answer: "Manganese is +7 in MnO₄⁻, since x + 4(−2) = −1. Oxidation is an increase in oxidation number.",
    move: "balance oxidation numbers against the ion's charge" },
  { slug: "chem-ethene-bromine-recall", skill: "chem.hydrocarbons.sp-02", context: "alkene-bromine-test",
    stem: "In an inert organic solvent, ethene reacts with bromine, Br₂, at room temperature.",
    prompt: "Name the type of mechanism for the reaction of ethene with bromine, and name the organic product.",
    scheme: ["Electrophilic addition", "1,2-dibromoethane"],
    answer: "Electrophilic addition, forming 1,2-dibromoethane (CH₂BrCH₂Br).",
    move: "classify the alkene mechanism and name the dihalide product" },
];

export const wjecRecallProbeQuestions: Question[] = items.map((item) => {
  const node = wjecCapabilities.find((n) => n.id === item.skill);
  if (!node) throw new Error(`wjec-recall-probes: unknown capability ${item.skill}`);
  return defineQuestion({
    slug: `recall-probe-${item.slug}`, subjectId: node.subjectId,
    topics: [node.topicId.slice(node.subjectId.length + 1)],
    kind: node.subjectId.endsWith("maths") ? "calculation" : "short",
    stem: item.stem, difficulty: 1,
    source: "authored", verification: "unverified", reviewer: null,
    lastChecked: "2026-10-11", specVersion: "2024-1.0",
    learning: { familyId: item.slug, contextId: item.context, demand: "recall", expectedMinutes: Math.max(1, item.scheme.length * 0.75) },
    parts: [{ prompt: item.prompt, marks: item.scheme.length, scheme: item.scheme, answer: item.answer,
      aos: ["AO1"],
      specPointIds: node.specPointIds, learningClaims: item.scheme, capabilityIds: [node.id],
      learning: { familyId: item.slug, contextId: item.context, demand: "recall", reasoningMoves: [item.move] } }],
  });
});
