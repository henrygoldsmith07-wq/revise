// ---------------------------------------------------------------------------
// Offline-marker contradiction regression set (2026-10-11, tenth pass).
//
// Real questions from the bank, each answered three ways: the authored model
// answer, a correct paraphrase, and one or more answers that contradict the
// scheme (opposite term, flipped sign, wrong value, negation). `examiner` is
// the mark a fair examiner would give against the question's own scheme; it
// was written by hand for this set and is NOT a human-moderated mark.
//
// `answer: MODEL` means "use the part's authored model answer".
//
// Cases marked `knownGap` are contradictions the deterministic marker still
// cannot see (they need comprehension, not wording). They stay in the set so
// the numbers in tests/marking-contradictions.test.ts are honest.
// ---------------------------------------------------------------------------

export const MODEL = "__MODEL__";

export type ContradictionCaseKind = "correct" | "paraphrase" | "contradiction";

export interface ContradictionCase {
  questionId: string;
  kind: ContradictionCaseKind;
  answer: string;
  /** The mark a fair examiner would give (hand-judged against the scheme). */
  examiner: number;
  /** Why a contradiction case is still over-credited, when it is. */
  knownGap?: string;
}

const R = "cnt:question:recall-probe-";

export const contradictionCases: ContradictionCase[] = [
  // --- Maths: discriminant -------------------------------------------------
  { questionId: `${R}math-discriminant-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}math-discriminant-recall`, kind: "paraphrase", answer: "Δ = b² − 4ac, and the equation has two distinct real roots if b² − 4ac > 0.", examiner: 2 },
  { questionId: `${R}math-discriminant-recall`, kind: "contradiction", answer: "The discriminant is b² + 4ac. There are two distinct real roots when b² + 4ac > 0.", examiner: 0 },
  { questionId: `${R}math-discriminant-recall`, kind: "contradiction", answer: "The discriminant is b² − 4ac. There are two distinct real roots when b² − 4ac < 0.", examiner: 1 },
  { questionId: `${R}math-discriminant-recall`, kind: "contradiction", answer: "Discriminant = b² − 4ac; two distinct real roots when b² − 4ac = 0.", examiner: 1 },
  // --- Maths: circle -------------------------------------------------------
  { questionId: `${R}math-circle-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}math-circle-recall`, kind: "paraphrase", answer: "General form: (x − a)² + (y − b)² = r². Here the centre is at (3, −2) and the radius is 5.", examiner: 2 },
  { questionId: `${R}math-circle-recall`, kind: "contradiction", answer: "(x − a)² + (y − b)² = r². Centre (−3, 2) and radius 25.", examiner: 1 },
  { questionId: `${R}math-circle-recall`, kind: "contradiction", answer: "(x + a)² + (y + b)² = r². Centre (3, −2) and radius 5.", examiner: 1 },
  // --- Maths: suvat --------------------------------------------------------
  { questionId: `${R}math-suvat-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}math-suvat-recall`, kind: "paraphrase", answer: "v² = u² + 2as. It is only valid if the acceleration stays constant (uniform acceleration).", examiner: 2 },
  { questionId: `${R}math-suvat-recall`, kind: "contradiction", answer: "v² = u² − 2as, and the acceleration must be constant.", examiner: 1 },
  { questionId: `${R}math-suvat-recall`, kind: "contradiction", answer: "v² = u² + 2as, which applies when the acceleration is not constant.", examiner: 1 },
  // --- Maths: double angle -------------------------------------------------
  { questionId: `${R}math-double-angle-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}math-double-angle-recall`, kind: "contradiction", answer: "sin 2θ = 2 sin θ cos θ and cos 2θ = 1 − 2cos²θ.", examiner: 1 },
  // --- Maths: integrals ----------------------------------------------------
  { questionId: `${R}math-integral-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}math-integral-recall`, kind: "contradiction", answer: "∫ xⁿ dx = xⁿ⁺¹/(n − 1) + c, and ∫ (1/x) dx = ln|x| + c.", examiner: 1 },
  // --- Maths: binomial -----------------------------------------------------
  { questionId: `${R}math-binomial-conditions-recall`, kind: "correct", answer: MODEL, examiner: 3 },
  { questionId: `${R}math-binomial-conditions-recall`, kind: "paraphrase", answer: "A fixed number n of trials which are independent; each trial has only two outcomes, success or failure, and the probability p of success is constant. E(X) = np.", examiner: 3 },
  { questionId: `${R}math-binomial-conditions-recall`, kind: "contradiction", answer: "The trials are not independent and the number of trials is not fixed. E(X) = np.", examiner: 1 },
  // --- Maths: quadratic inequality (bank) ----------------------------------
  { questionId: "cnt:question:authentic-expansion-wjec-alevel-maths-maths-quadratic-inequality", kind: "correct", answer: MODEL, examiner: 3 },
  { questionId: "cnt:question:authentic-expansion-wjec-alevel-maths-maths-quadratic-inequality", kind: "contradiction", answer: "It factorises as (x − 2)(x − 3), so the roots are 2 and 3. The quadratic is negative outside the roots: x < 2 or x > 3.", examiner: 2 },

  // --- Biology: pulmonary vein ---------------------------------------------
  { questionId: `${R}bio-pulmonary-vein-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}bio-pulmonary-vein-recall`, kind: "paraphrase", answer: "Blood returns from the lungs in the pulmonary veins and enters the left atrium.", examiner: 2 },
  { questionId: `${R}bio-pulmonary-vein-recall`, kind: "contradiction", answer: "Pulmonary artery, right atrium", examiner: 0 },
  { questionId: `${R}bio-pulmonary-vein-recall`, kind: "contradiction", answer: "The pulmonary vein, into the right atrium.", examiner: 1 },
  { questionId: `${R}bio-pulmonary-vein-recall`, kind: "contradiction", answer: "The vena cava carries it to the left ventricle.", examiner: 0 },
  // --- Biology: insulin ----------------------------------------------------
  { questionId: `${R}bio-insulin-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}bio-insulin-recall`, kind: "paraphrase", answer: "Insulin. It is made by the beta cells in the islets of Langerhans in the pancreas.", examiner: 2 },
  { questionId: `${R}bio-insulin-recall`, kind: "contradiction", answer: "Glucagon, secreted by the α cells of the islets of Langerhans in the pancreas.", examiner: 0 },
  { questionId: `${R}bio-insulin-recall`, kind: "contradiction", answer: "Insulin, secreted by the alpha cells of the islets of Langerhans in the pancreas.", examiner: 1 },
  // --- Biology: semi-conservative ------------------------------------------
  { questionId: `${R}bio-semi-conservative-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}bio-semi-conservative-recall`, kind: "paraphrase", answer: "Each new DNA molecule keeps one original strand from the parent molecule and has one newly synthesised strand.", examiner: 2 },
  { questionId: `${R}bio-semi-conservative-recall`, kind: "contradiction", answer: "Each new DNA molecule contains two newly synthesised strands, and the original molecule is kept whole.", examiner: 0,
    knownGap: "'two new strands' vs 'one original strand' is a counting contradiction the wording check cannot see" },
  // --- Biology: GPP/NPP ----------------------------------------------------
  { questionId: `${R}bio-gpp-npp-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}bio-gpp-npp-recall`, kind: "contradiction", answer: "GPP is the rate at which producers convert light energy into chemical energy in organic molecules by photosynthesis. NPP = GPP + R.", examiner: 1 },
  // --- Biology: alveoli ----------------------------------------------------
  { questionId: `${R}bio-alveoli-diffusion-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}bio-alveoli-diffusion-recall`, kind: "contradiction", answer: "Osmosis. The alveoli have thick walls so the diffusion distance is long.", examiner: 0,
    knownGap: "the one-word point 'Diffusion' is matched by 'diffusion distance'; osmosis is not treated as an opposite of diffusion" },
  // --- Biology: codominance ------------------------------------------------
  { questionId: `${R}bio-codominance-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}bio-codominance-recall`, kind: "contradiction", answer: "In codominance both alleles are not expressed in the phenotype of a heterozygote. An example is blood group AB.", examiner: 1 },
  // --- Biology: haemoglobin affinity (bank) --------------------------------
  { questionId: "cnt:question:unfamiliar-context-wjec-alevel-biology-highland-mammal", kind: "correct", answer: MODEL, examiner: 3 },
  { questionId: "cnt:question:unfamiliar-context-wjec-alevel-biology-highland-mammal", kind: "contradiction", answer: "It loads oxygen effectively when the oxygen partial pressure is high. The dissociation curve is shifted to the right. It may release more oxygen to respiring tissues.", examiner: 0 },
  // --- Biology: fermentation (bank) ----------------------------------------
  { questionId: "cnt:question:unfamiliar-context-wjec-alevel-biology-fermentation-vessel", kind: "correct", answer: MODEL, examiner: 3 },
  { questionId: "cnt:question:unfamiliar-context-wjec-alevel-biology-fermentation-vessel", kind: "contradiction", answer: "The yeast is carrying out aerobic respiration. Glucose is converted to ethanol. Carbon dioxide is also produced.", examiner: 2 },
  // --- Biology: double circulation (bank) ----------------------------------
  { questionId: "cnt:question:bio-transport-animals", kind: "correct", answer: MODEL, examiner: 3 },
  { questionId: "cnt:question:bio-transport-animals", kind: "contradiction", answer: "Blood passes through the heart once per circuit (pulmonary and systemic).", examiner: 0 },

  // --- Chemistry: Brønsted–Lowry -------------------------------------------
  { questionId: `${R}chem-bronsted-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}chem-bronsted-recall`, kind: "paraphrase", answer: "An acid is a proton donor (it donates H⁺). The conjugate base is NH₃.", examiner: 2 },
  { questionId: `${R}chem-bronsted-recall`, kind: "contradiction", answer: "An acid is a proton acceptor. The conjugate base of NH₄⁺ is NH₃.", examiner: 1 },
  { questionId: `${R}chem-bronsted-recall`, kind: "contradiction", answer: "An acid is a proton donor. The conjugate base of NH₄⁺ is NH₂⁻.", examiner: 1 },
  // --- Chemistry: activation energy ----------------------------------------
  { questionId: `${R}chem-activation-energy-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}chem-activation-energy-recall`, kind: "contradiction", answer: "Activation energy is the maximum energy that colliding particles need in order to react. A catalyst provides an alternative pathway with a higher activation energy.", examiner: 0 },
  // --- Chemistry: enthalpy of formation ------------------------------------
  { questionId: `${R}chem-formation-enthalpy-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}chem-formation-enthalpy-recall`, kind: "contradiction", answer: "The enthalpy change when one mole of the compound is broken down into its elements, with everything in its standard state under standard conditions.", examiner: 1,
    knownGap: "'broken down into its elements' reverses 'formed from its elements' without any single opposite word" },
  // --- Chemistry: oxidation number -----------------------------------------
  { questionId: `${R}chem-oxidation-number-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}chem-oxidation-number-recall`, kind: "contradiction", answer: "+7. Oxidation is a decrease in oxidation number.", examiner: 1 },
  { questionId: `${R}chem-oxidation-number-recall`, kind: "contradiction", answer: "Manganese is +6 in MnO₄⁻. Oxidation is an increase in oxidation number.", examiner: 1 },
  // --- Chemistry: ethene + bromine -----------------------------------------
  { questionId: `${R}chem-ethene-bromine-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}chem-ethene-bromine-recall`, kind: "paraphrase", answer: "It is an electrophilic addition and the product is 1,2-dibromoethane.", examiner: 2 },
  { questionId: `${R}chem-ethene-bromine-recall`, kind: "contradiction", answer: "Nucleophilic addition, forming 1,2-dibromoethane.", examiner: 1 },
  { questionId: `${R}chem-ethene-bromine-recall`, kind: "contradiction", answer: "Electrophilic substitution, forming 1,2-dibromoethane.", examiner: 1 },
  // --- Chemistry: dative bond ----------------------------------------------
  { questionId: `${R}chem-dative-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}chem-dative-recall`, kind: "contradiction", answer: "A shared pair of electrons where each atom provides one of the electrons. In NH₄⁺ the nitrogen atom provides its lone pair.", examiner: 1,
    knownGap: "'each atom provides one electron' contradicts 'both electrons from the same atom' through quantifiers, not an opposite word" },
  // --- Chemistry: cell with oxidation/reduction (bank) ---------------------
  { questionId: "cnt:question:authentic-source-wjec-alevel-chemistry-battery-safety-report", kind: "correct", answer: MODEL, examiner: 3 },
  { questionId: "cnt:question:authentic-source-wjec-alevel-chemistry-battery-safety-report", kind: "contradiction", answer: "M is reduced because it gains electrons; N ions are oxidised because they lose electrons; electrons flow through the external circuit from M to the positive electrode.", examiner: 1 },
  { questionId: "cnt:question:authentic-source-wjec-alevel-chemistry-battery-safety-report", kind: "contradiction", answer: "M is oxidised because it loses electrons; N ions are reduced because they gain electrons; electrons flow through the external circuit from M to the negative electrode.", examiner: 2 },
  // --- Chemistry: Le Chatelier (bank) --------------------------------------
  { questionId: "cnt:question:unfamiliar-context-wjec-alevel-chemistry-ammonia-sensor", kind: "correct", answer: MODEL, examiner: 3 },
  { questionId: "cnt:question:unfamiliar-context-wjec-alevel-chemistry-ammonia-sensor", kind: "contradiction", answer: "The forward reaction is exothermic and releases heat. Increasing temperature favours the exothermic direction. More NH₃ forms and the equilibrium shifts away from nitrogen and hydrogen.", examiner: 0 },
  // --- Chemistry: sacrificial protection (bank) ----------------------------
  { questionId: "cnt:question:unfamiliar-context-wjec-alevel-chemistry-corrosion-coating", kind: "correct", answer: MODEL, examiner: 3 },
  { questionId: "cnt:question:unfamiliar-context-wjec-alevel-chemistry-corrosion-coating", kind: "contradiction", answer: "Zinc is reduced and gains electrons more readily than iron. The zinc supplies electrons to the steel. The steel is prevented from oxidising while the zinc remains connected.", examiner: 2 },

  // --- Physics (bank) -------------------------------------------------------
  { questionId: "cnt:question:physics-depth-fields-sp-01-inverse-square-fallacy-3", kind: "correct", answer: MODEL, examiner: 3 },
  { questionId: "cnt:question:physics-depth-fields-sp-01-inverse-square-fallacy-3", kind: "contradiction", answer: "Coulomb's law gives F ∝ 1/r, so doubling r halves the force, and halving the distance doubles the force.", examiner: 0,
    knownGap: "the scheme point itself quotes the wrong form ('1/r², not 1/r'), so '1/r' still matches its wording" },
  { questionId: "cnt:question:authentic-source-wjec-alevel-physics-thermal-storage-log", kind: "correct", answer: MODEL, examiner: 3 },
  { questionId: "cnt:question:authentic-source-wjec-alevel-physics-thermal-storage-log", kind: "contradiction", answer: "The vacuum increases conduction and convection because there are few particles. The shiny surface is a good emitter and absorber of infrared radiation. The salt stays at a lower temperature for longer.", examiner: 0,
    knownGap: "Physics explanations over 15 words keep only Physics' own reversal guards (the general veto misfired on 12 long Physics model answers), so 'increases' for 'reduces' is not caught here" },
];
