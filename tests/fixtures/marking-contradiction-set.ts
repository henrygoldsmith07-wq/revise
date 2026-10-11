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

  // --- Eleventh pass: the 40 new recall probes ------------------------------
  // One plainly wrong answer per probe (examiner 0), every model answer, and
  // paraphrases for the points whose credit leans on numbers or formulae.
  { questionId: `${R}math-contradiction-proof-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}math-contradiction-proof-recall`, kind: "paraphrase", answer: "Suppose √2 is rational. Then √2 = p/q with p and q integers, q ≠ 0, and the fraction in its lowest terms.", examiner: 2 },
  { questionId: `${R}math-contradiction-proof-recall`, kind: "contradiction", answer: "Assume that √2 is irrational, so √2 cannot be written as a fraction.", examiner: 0,
    knownGap: "the second point is matched on its notation (√2, ≠ 0) alone, and that structured-notation path is left as it was; the first point is now vetoed (rational/irrational)" },
  { questionId: `${R}math-vector-magnitude-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}math-vector-magnitude-recall`, kind: "contradiction", answer: "|xi + yj + zk| = x + y + z, so |a| = 5.", examiner: 0 },
  { questionId: `${R}math-newton-raphson-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}math-newton-raphson-recall`, kind: "paraphrase", answer: "Use xₙ₊₁ = xₙ − f(xₙ)/f′(xₙ); it breaks down if f′(xₙ) = 0.", examiner: 2 },
  { questionId: `${R}math-newton-raphson-recall`, kind: "contradiction", answer: "xₙ₊₁ = xₙ + f(xₙ)/f′(xₙ). It fails when f(xₙ) = 1.", examiner: 0,
    knownGap: "'f(xₙ) = 1' for 'f′(xₙ) = 0' changes both the function and the value, so no single check sees one swapped term; the sign slip in the formula is now caught" },
  { questionId: `${R}math-probability-rules-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}math-probability-rules-recall`, kind: "contradiction", answer: "P(A ∪ B) = P(A) × P(B) and P(A ∩ B) = P(A) + P(B).", examiner: 0 },
  { questionId: `${R}math-friction-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}math-friction-recall`, kind: "contradiction", answer: "F ≥ μR, and F = μR whenever the box is at rest.", examiner: 0 },
  { questionId: `${R}math-poisson-conditions-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}math-poisson-conditions-recall`, kind: "contradiction", answer: "The emails arrive in groups that depend on each other, at a changing rate. The mean is λ and the variance is λ².", examiner: 0,
    knownGap: "'the variance is λ²' sits beside 'the mean is λ' and the point is a chain of equalities the relation check does not split" },
  { questionId: `${R}math-error-types-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}math-error-types-recall`, kind: "contradiction", answer: "A Type I error is accepting H₀ when H₀ is false. A Type II error is rejecting H₀ when H₀ is true.", examiner: 0,
    knownGap: "Type I and Type II definitions swapped: every word of both points is present, only their pairing is wrong" },
  { questionId: `${R}math-standardise-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}math-standardise-recall`, kind: "contradiction", answer: "Z = (X + μ)/σ² and Z ~ N(1, 0).", examiner: 0 },
  { questionId: `${R}math-correlation-hypotheses-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}math-correlation-hypotheses-recall`, kind: "paraphrase", answer: "Null hypothesis H₀: ρ = 0; alternative hypothesis H₁: ρ > 0.", examiner: 2 },
  { questionId: `${R}math-correlation-hypotheses-recall`, kind: "contradiction", answer: "H₀: ρ = 1 and H₁: ρ < 0.", examiner: 0 },
  { questionId: `${R}math-particle-string-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}math-particle-string-recall`, kind: "paraphrase", answer: "The block is treated as having negligible size, so its mass acts at a single point. The string's mass is negligible, so the tension is equal all along it.", examiner: 2 },
  { questionId: `${R}math-particle-string-recall`, kind: "contradiction", answer: "A particle has a large size so its mass is spread out. A light string means the tension is different at each end.", examiner: 0 },
  { questionId: `${R}math-moment-definition-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}math-moment-definition-recall`, kind: "contradiction", answer: "Moment = force × time. The unit is the joule.", examiner: 0 },
  { questionId: `${R}math-decay-de-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}math-decay-de-recall`, kind: "paraphrase", answer: "dm/dt = −km, and solving gives m = Ae^(−kt).", examiner: 2 },
  { questionId: `${R}math-decay-de-recall`, kind: "contradiction", answer: "dm/dt = km, so m = Ae^(kt).", examiner: 0 },
  { questionId: `${R}bio-xylem-cohesion-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}bio-xylem-cohesion-recall`, kind: "contradiction", answer: "Phloem. Adhesion to the cell walls.", examiner: 0 },
  { questionId: `${R}bio-domains-genus-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}bio-domains-genus-recall`, kind: "contradiction", answer: "Plants, Animals and Fungi. Order.", examiner: 0 },
  { questionId: `${R}bio-glycolysis-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}bio-glycolysis-recall`, kind: "paraphrase", answer: "It happens in the cytoplasm and the net gain is 2 ATP per glucose.", examiner: 2 },
  { questionId: `${R}bio-glycolysis-recall`, kind: "contradiction", answer: "In the mitochondrial matrix, with a net gain of 38 ATP.", examiner: 0 },
  { questionId: `${R}bio-hydrolysis-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}bio-hydrolysis-recall`, kind: "contradiction", answer: "Joining two molecules by removing water. Lipase.", examiner: 0 },
  { questionId: `${R}bio-growth-curve-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}bio-growth-curve-recall`, kind: "contradiction", answer: "Death, stationary, lag, log. Fastest growth is in the stationary phase.", examiner: 0,
    knownGap: "phases in the wrong order and 'stationary' for 'log' are not opposite words" },
  { questionId: `${R}bio-resting-potential-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}bio-resting-potential-recall`, kind: "contradiction", answer: "About +40 mV. Potassium ions diffuse in.", examiner: 0 },
  { questionId: `${R}bio-fertilisation-site-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}bio-fertilisation-site-recall`, kind: "contradiction", answer: "In the ovary, and the blastocyst implants in the cervix.", examiner: 0 },
  { questionId: `${R}bio-double-fertilisation-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}bio-double-fertilisation-recall`, kind: "contradiction", answer: "Both male nuclei fuse with the antipodal cells to form the seed coat.", examiner: 0,
    knownGap: "'antipodal cells' and 'seed coat' are wrong structures, not opposites, and the shared words still reach the coverage threshold" },
  { questionId: `${R}bio-pcr-enzyme-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}bio-pcr-enzyme-recall`, kind: "contradiction", answer: "DNA ligase, because it joins the primers together at 20 °C.", examiner: 0 },
  { questionId: `${R}bio-secondary-response-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}bio-secondary-response-recall`, kind: "contradiction", answer: "Red blood cells, which carry more oxygen to the infection.", examiner: 0 },
  { questionId: `${R}bio-sliding-filament-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}bio-sliding-filament-recall`, kind: "contradiction", answer: "The A band shortens and the sarcomere gets longer.", examiner: 0,
    knownGap: "'shortens' is in the answer (about the A band), so the clause-level check cannot tell which structure it describes" },
  { questionId: `${R}bio-innate-behaviour-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}bio-innate-behaviour-recall`, kind: "contradiction", answer: "Innate behaviour is learned through experience, for example habituation.", examiner: 0 },
  { questionId: `${R}bio-eutrophication-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}bio-eutrophication-recall`, kind: "contradiction", answer: "Sodium ions. Fish respiring.", examiner: 0 },
  { questionId: `${R}bio-variables-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}bio-variables-recall`, kind: "contradiction", answer: "The independent variable is the one that is measured, here the rate. A control variable is the one that is changed.", examiner: 0,
    knownGap: "'measured' for 'changes' is not an opposite pair the marker knows" },
  { questionId: `${R}chem-halide-test-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}chem-halide-test-recall`, kind: "contradiction", answer: "Add hydrochloric acid then barium chloride. A yellow precipitate forms that does not dissolve in ammonia.", examiner: 0 },
  { questionId: `${R}chem-transition-definition-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}chem-transition-definition-recall`, kind: "contradiction", answer: "A transition element is any metal. Zinc is not one because Zn²⁺ has a partially filled 3d sub-shell.", examiner: 0,
    knownGap: "'any metal' is wrong, but the zinc sentence supplies 'partially filled d sub-shell' to the first point" },
  { questionId: `${R}chem-isomer-definitions-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}chem-isomer-definitions-recall`, kind: "paraphrase", answer: "Structural isomers share a molecular formula but have different structural formulae; stereoisomers have the same structural formula with a different arrangement of atoms in space.", examiner: 2 },
  { questionId: `${R}chem-isomer-definitions-recall`, kind: "contradiction", answer: "Structural isomers have different molecular formulae. Stereoisomers have different structural formulae.", examiner: 0,
    knownGap: "the scheme points themselves contain both 'same' and 'different', so the same/different check cannot apply" },
  { questionId: `${R}chem-hcn-addition-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}chem-hcn-addition-recall`, kind: "contradiction", answer: "Electrophilic substitution, giving propanoic acid.", examiner: 0 },
  { questionId: `${R}chem-nitration-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}chem-nitration-recall`, kind: "contradiction", answer: "Dilute hydrochloric acid. The electrophile is NO₃⁻.", examiner: 0 },
  { questionId: `${R}chem-mass-spec-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}chem-mass-spec-recall`, kind: "paraphrase", answer: "The molecular ion peak gives the relative molecular mass, and the M and M+2 peaks are 3 : 1.", examiner: 2 },
  { questionId: `${R}chem-mass-spec-recall`, kind: "contradiction", answer: "The M⁺ peak gives the number of carbon atoms. M : M+2 = 1 : 1.", examiner: 0 },
  { questionId: `${R}chem-gibbs-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}chem-gibbs-recall`, kind: "contradiction", answer: "ΔG = ΔH + TΔS, and the reaction is feasible when ΔG > 0.", examiner: 0 },
  { questionId: `${R}chem-period3-oxides-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}chem-period3-oxides-recall`, kind: "paraphrase", answer: "Al₂O₃ is amphoteric because it reacts with both acids and bases, and P₄O₁₀ is acidic, reacting with water to give phosphoric acid.", examiner: 2 },
  { questionId: `${R}chem-period3-oxides-recall`, kind: "contradiction", answer: "Al₂O₃ is basic only. P₄O₁₀ is basic and forms a hydroxide.", examiner: 0 },
  { questionId: `${R}chem-chirality-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}chem-chirality-recall`, kind: "contradiction", answer: "A carbon with a double bond. Both enantiomers rotate light in the same direction.", examiner: 0 },
  { questionId: `${R}chem-zwitterion-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}chem-zwitterion-recall`, kind: "paraphrase", answer: "An ion that has both a positive charge and a negative charge, so it is neutral overall: H₃N⁺CH₂COO⁻.", examiner: 2 },
  { questionId: `${R}chem-zwitterion-recall`, kind: "contradiction", answer: "An ion with an overall positive charge, H₂NCH₂COOH.", examiner: 0,
    knownGap: "'overall positive charge' for 'no overall charge' needs comprehension of the quantifier" },
  { questionId: `${R}chem-recrystallisation-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}chem-recrystallisation-recall`, kind: "contradiction", answer: "Fractional distillation, then check that the solid melts over a wide range.", examiner: 0 },
  { questionId: `${R}chem-percentage-uncertainty-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}chem-percentage-uncertainty-recall`, kind: "contradiction", answer: "Percentage uncertainty = measured value ÷ uncertainty. The titre uncertainty is ±0.05 cm³.", examiner: 0,
    knownGap: "the reversed division keeps every word, and ±0.05 is matched through the shared 'cm³' superscript" },
  { questionId: `${R}chem-halogenoalkane-substitution-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}chem-halogenoalkane-substitution-recall`, kind: "contradiction", answer: "Elimination, giving ethene.", examiner: 0 },
  { questionId: `${R}chem-electrode-potential-recall`, kind: "correct", answer: MODEL, examiner: 2 },
  { questionId: `${R}chem-electrode-potential-recall`, kind: "contradiction", answer: "The voltage of a battery measured against a copper electrode at 373 K and 10 mol dm⁻³ acid.", examiner: 0,
    knownGap: "the conditions point is numeric and matches on shared unit notation (dm⁻³) despite every value being wrong" },
];
