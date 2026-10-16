// ---------------------------------------------------------------------------
// Offline-marker paraphrase set (2026-10-12, sixteenth pass).
//
// Real flagship questions from the bank (WJEC A-level Maths, Biology,
// Chemistry, Physics), each answered correctly in a student's own words: the
// wording a Year 12 student would plausibly write, not the scheme's wording.
// `examiner` is the mark a fair examiner would give against the question's
// own scheme. Every answer and every mark here is AUTHOR JUDGEMENT, written by
// hand for this set; none is a human-moderated or teacher-reviewed mark, and
// nothing here changes any question's review status.
//
// The set measures under-credit: a correct answer the deterministic marker
// scores below what an examiner would give. tests/marking-paraphrases.test.ts
// asserts the measured state; tightening it is welcome, loosening it is a
// regression.
// ---------------------------------------------------------------------------

export interface ParaphraseCase {
  questionId: string;
  answer: string;
  /**
   * "design": the 50 paraphrases measured BEFORE the equivalent-wording change
   * and used while designing it. "held-out": correct paraphrases written after
   * the change was built and never used to tune it. "wrong": answers that
   * state the opposite IN THE NEW EQUIVALENT WORDING ("goes down" for
   * "rises", "four times bigger" for "one quarter"), which must not gain
   * credit from it.
   */
  set: "design" | "held-out" | "wrong";
  /** The mark a fair examiner would give (author judgement, not moderated). */
  examiner: number;
}

const Q = "cnt:question:";

export const paraphraseCases: ParaphraseCase[] = [
  // --- Physics ---------------------------------------------------------------
  { questionId: `${Q}physics-depth-fields-sp-01-inverse-square-fallacy-3`, examiner: 3, set: "design",
    answer: "That's wrong because Coulomb's law is an inverse square law: the force is inversely proportional to the square of the distance, not just the distance. Doubling the distance makes the force one quarter as big, since 2 squared is 4. If you halved the distance instead, the force would be four times bigger." },
  { questionId: `${Q}physics-depth50-fields-sp-02-inverse-square-2`, examiner: 2, set: "design",
    answer: "The field spreads out equally in all directions over the surface of a sphere, which has area 4πr². The same field is shared over an area that grows with r squared, so the field strength per unit area drops with the square of the distance." },
  { questionId: `${Q}physics-depth50-electric-circuits-sp-05-power-current-4`, examiner: 2, set: "design",
    answer: "Both lamps have the same resistance and P = I²R, so the power depends on the current squared. Doubling the current makes the power four times as big, not half as big." },
  { questionId: `${Q}physics-depth50-thermal-sp-03-pressure-volume-7`, examiner: 2, set: "design",
    answer: "If the temperature stays the same, pressure × volume stays constant (Boyle's law). Making the volume smaller means the molecules hit each unit area of the wall more often, so the pressure goes up, not down." },
  { questionId: `${Q}physics-depth50-materials-sp-03-straight-line-2`, examiner: 3, set: "design",
    answer: "The gradient of the graph is the change in force divided by the change in extension. A straight line has the same gradient all the way along, so F/x stays the same, which means k is constant as long as the spring obeys Hooke's law." },
  { questionId: `${Q}physics-depth50-orbits-universe-sp-03-peculiar-5`, examiner: 2, set: "design",
    answer: "Nearby galaxies have their own peculiar velocity caused by the gravity of galaxies around them, and this can be about as big as their Hubble recession speed. So the redshift we measure is a mix of the expansion of the universe and the galaxy's own local motion." },
  { questionId: `${Q}physics-depth50-kinematics-dynamics-sp-03-constant-assumption-2`, examiner: 2, set: "design",
    answer: "The SUVAT equations only work when the acceleration is constant, because they are derived assuming that. Here the acceleration keeps changing, so one value of a can't describe the whole journey; you would have to split it into small time intervals or use a measured graph." },
  { questionId: `${Q}physics-statement-waves-sp-05-two-filter-test`, examiner: 3, set: "design",
    answer: "A polariser only lets through oscillations in one plane, at right angles to the direction the light travels. When the second filter is turned at right angles to the first there is no part of the oscillation left along its axis, so the light is blocked. Longitudinal waves vibrate parallel to the direction they travel, so there is no perpendicular oscillation to filter and they can't be polarised." },
  { questionId: `${Q}physics-depth50-medical-physics-sp-04-shielding-3`, examiner: 2, set: "design",
    answer: "Moving further away helps because, for a source radiating in all directions, the dose rate drops roughly with the inverse square of the distance. Shielding with lead or concrete absorbs and scatters the gamma photons, so fewer of them reach the staff." },
  { questionId: `${Q}physics-depth50-alternating-currents-sp-04-energy-damping-12`, examiner: 3, set: "design",
    answer: "Losing only 10% per cycle means less energy is lost each cycle, so the damping is lighter. This resonator keeps its energy for more oscillations, so its Q factor is higher and its resonance peak is sharper." },
  { questionId: `${Q}physics-depth-nuclear-sp-03-remaining-fraction-3`, examiner: 3, set: "design",
    answer: "15 years is 3 half-lives. After three halvings ½ × ½ × ½ = 1/8 is left, so 8.0×10¹⁰ ÷ 8 = 1.0×10¹⁰ nuclei remain." },
  { questionId: `${Q}unfamiliar-context-wjec-alevel-physics-airbag-collision`, examiner: 3, set: "design",
    answer: "Force is the change in momentum divided by the time taken. With no airbag F = 900/0.10 = 9000 N. With the airbag F = 900/0.40 = 2250 N, which is four times smaller." },
  { questionId: `${Q}physics-depth50-energy-power-sp-01-buoyancy-8`, examiner: 3, set: "design",
    answer: "Buoyancy does +3600 J of work (900 N × 4.0 m, acting in the direction of motion). The weight does −3600 J because it acts against the motion. The net work done is zero, which fits with the kinetic energy not changing at constant speed." },

  // --- Biology ---------------------------------------------------------------
  { questionId: `${Q}wjec-quality-biology-turgid-equilibrium`, examiner: 3, set: "design",
    answer: "As water enters, the cell contents push on the cell wall, which resists, so the pressure potential goes up. This positive pressure potential cancels out the negative solute potential until the water potential inside equals the water potential outside. Water molecules still move in and out, but there is no net movement at equilibrium." },
  { questionId: `${Q}wjec-quality-biology-plasmolysis`, examiner: 3, set: "design",
    answer: "The sucrose solution has a lower (more negative) water potential than the cell, so the cell loses water by osmosis. As it loses water the vacuole and protoplast shrink. The cell wall is rigid and keeps its shape, so the membrane comes away from it — this is plasmolysis." },
  { questionId: `${Q}wjec-quality-biology-substrate-plateau`, examiner: 2, set: "design",
    answer: "At very high substrate concentration almost all the active sites are occupied, so the number of enzyme active sites available is what limits the rate. Adding even more substrate barely increases the initial rate." },
  { questionId: `${Q}recall-probe-bio-secondary-response-recall`, examiner: 2, set: "design",
    answer: "Memory cells (memory B cells and memory T cells) produced during the first response. When the same antigen comes back they divide quickly, so antibodies are produced faster and in larger amounts." },
  { questionId: `${Q}recall-probe-bio-hydrolysis-recall`, examiner: 2, set: "design",
    answer: "Hydrolysis is when a chemical bond is broken by adding water. Starch is broken down to maltose by amylase." },
  { questionId: `${Q}wjec-quality-biology-mass-direction`, examiner: 3, set: "design",
    answer: "In A, water moves into the tissue so its mass goes up at first. In B, water moves out of the tissue so its mass goes down. Water always moves from a higher (less negative) water potential to a lower (more negative) water potential." },
  { questionId: `${Q}recall-probe-bio-pcr-enzyme-recall`, examiner: 2, set: "design",
    answer: "Taq polymerase, a heat-stable DNA polymerase from a bacterium that lives in hot springs. It doesn't denature at around 95 °C, the temperature used to separate the two DNA strands." },
  { questionId: `${Q}recall-probe-bio-eutrophication-recall`, examiner: 2, set: "design",
    answer: "Nitrate (or phosphate). Decomposer bacteria break down the dead algae and plants and use up the oxygen in aerobic respiration." },
  { questionId: `${Q}repair-depth-bio-inhibitor-recall`, examiner: 2, set: "design",
    answer: "It binds in the active site. Adding more substrate lowers the inhibition because the substrate outcompetes the inhibitor for the active site." },
  { questionId: `${Q}recall-probe-bio-domains-genus-recall`, examiner: 2, set: "design",
    answer: "Bacteria, Archaea and Eukaryota. The next level down from family is genus." },
  { questionId: `${Q}wjec-quality-biology-negative-sign-error`, examiner: 2, set: "design",
    answer: "-0.30 MPa is a higher water potential than -1.0 MPa because it is less negative. So water actually moves into the cell from the solution across the partially permeable membrane, not out of it." },
  { questionId: `${Q}repair-depth-bio-inhibitor-transfer`, examiner: 3, set: "design",
    answer: "It's non-competitive inhibition. Y attaches somewhere other than the active site and lowers the enzyme's activity. Adding more substrate can't outcompete Y because it isn't competing for that separate site." },

  // --- Chemistry -------------------------------------------------------------
  { questionId: `${Q}wjec-quality-chemistry-catalyst-k`, examiner: 3, set: "design",
    answer: "The catalyst gives an alternative route with a lower activation energy for both the forward and the reverse reactions. So equilibrium is reached faster, but the equilibrium composition is the same at that temperature. Kc only depends on temperature, not on whether a catalyst is there." },
  { questionId: `${Q}wjec-quality-chemistry-large-k-fast`, examiner: 2, set: "design",
    answer: "A large Kc just means the equilibrium is product-favoured, lying well to the right. It says nothing about how quickly equilibrium is reached — if the activation energy is high the reaction can still be very slow." },
  { questionId: `${Q}recall-probe-chem-gibbs-recall`, examiner: 2, set: "design",
    answer: "ΔG = ΔH − TΔS. A reaction is feasible when ΔG is zero or negative." },
  { questionId: `${Q}recall-probe-chem-isomer-definitions-recall`, examiner: 2, set: "design",
    answer: "Structural isomers have the same molecular formula but a different structural formula. Stereoisomers have the same structural formula but their atoms are arranged differently in space." },
  { questionId: `${Q}recall-probe-chem-period3-oxides-recall`, examiner: 2, set: "design",
    answer: "Aluminium oxide is amphoteric — it reacts with acids and with bases. Phosphorus(V) oxide is acidic; with water it forms phosphoric acid." },
  { questionId: `${Q}recall-probe-chem-chirality-recall`, examiner: 2, set: "design",
    answer: "A chiral centre is a carbon atom attached to four different groups. The two enantiomers rotate plane-polarised light by the same amount but in opposite directions." },
  { questionId: `${Q}recall-probe-chem-mass-spec-recall`, examiner: 2, set: "design",
    answer: "The M⁺ peak tells you the relative molecular mass (Mr) of the compound. The M and M+2 peaks are in a 3 : 1 ratio." },
  { questionId: `${Q}wjec-quality-chemistry-aliquot-factor`, examiner: 2, set: "design",
    answer: "The amount in the whole flask is 10 times the amount in the aliquot (250.0 ÷ 25.00). This assumes the solution is homogeneous and well mixed and that all of the analyte has dissolved." },
  { questionId: `${Q}wjec-quality-chemistry-equivalence-ratio`, examiner: 2, set: "design",
    answer: "At equivalence n(A)/a = n(B)/b. You can't assume equal amounts because the coefficients a and b in the balanced equation need not be equal." },
  { questionId: `${Q}recall-probe-chem-percentage-uncertainty-recall`, examiner: 2, set: "design",
    answer: "Percentage uncertainty = (uncertainty ÷ measured value) × 100. The titre is ±0.10 cm³ because it combines two burette readings, each ±0.05 cm³." },
  { questionId: `${Q}wjec-quality-chemistry-compression-quotient`, examiner: 2, set: "design",
    answer: "Halving the volume doubles both concentrations, so Qc = (2²/2)Kc = 2Kc. Since Qc is bigger than Kc, the net reaction uses up B and forms A until equilibrium is restored." },
  { questionId: `${Q}wjec-quality-chemistry-reverse-equation`, examiner: 2, set: "design",
    answer: "Reversing A ⇌ 2B gives the reciprocal constant, 1/9. Halving all the coefficients means taking the square root, so Kc = 1/3 (0.33)." },

  // --- Maths -----------------------------------------------------------------
  { questionId: `${Q}wjec-quality-maths-global-candidates`, examiner: 2, set: "design",
    answer: "Solve f'(x) = 0 to find the stationary points inside the interval. Then evaluate f at those points and at the end points a and b; the smallest value is the global minimum." },
  { questionId: `${Q}wjec-quality-maths-normal-rule`, examiner: 2, set: "design",
    answer: "The normal gradient is the negative reciprocal, -1/m. If the tangent is horizontal, the normal is a vertical line (x = constant)." },
  { questionId: `${Q}wjec-quality-maths-boundary-beats-local`, examiner: 3, set: "design",
    answer: "Knowing where the local minimum is doesn't tell you the maximum; you also have to check the endpoints. The only interior stationary point is x = 1, with f(1) = -2, while f(0) = 0 and f(3) = 18. So the global maximum is 18 at x = 3." },
  { questionId: `${Q}wjec-quality-maths-rate-units`, examiner: 2, set: "design",
    answer: "At noon the volume is going down at an instantaneous rate of 12 m³ per hour. The rate may change during the next hour, so working out the total change needs the rate over the whole interval." },
  { questionId: `${Q}wjec-quality-maths-infeasible-root`, examiner: 3, set: "design",
    answer: "x = 20 is outside the feasible interval 0 ≤ x ≤ 12. P'(x) = 40 - 2x is positive for every x in [0,12], so profit increases throughout. So choose x = 12, giving maximum profit P(12) = 336." },
  { questionId: `${Q}wjec-quality-maths-conditioning-formula`, examiner: 2, set: "design",
    answer: "P(A|B) = P(A ∩ B)/P(B), and P(B) must be greater than 0." },
  { questionId: `${Q}wjec-quality-maths-conditional-path`, examiner: 2, set: "design",
    answer: "P(A ∩ B) = P(A)P(B|A). P(B|A) means the probability that B happens given that A has already happened." },
  { questionId: `${Q}wjec-quality-maths-reverse-conditioning`, examiner: 3, set: "design",
    answer: "P(Music|Physics) = 15/50 = 0.30 and P(Physics|Music) = 15/20 = 0.75. They differ because the same 15 students are divided by a different group each time: 50 physics students versus 20 music students." },
  { questionId: `${Q}wjec-quality-maths-replacement-explanation`, examiner: 2, set: "design",
    answer: "Once a blue counter has been taken out there are 4 counters left and 3 of them are red. So the probability is 3/4 instead of the original 3/5." },
  { questionId: `${Q}wjec-quality-maths-disjoint-not-independent`, examiner: 2, set: "design",
    answer: "Because they are mutually exclusive, P(A ∩ B) = 0, so P(A|B) = 0. But P(A) > 0, so P(A|B) is not equal to P(A), which means the events are not independent." },
  { questionId: `${Q}data-expansion-wjec-alevel-maths-iteration-table`, examiner: 2, set: "design",
    answer: "The iterates settle at about 2.236. The gap between consecutive values keeps getting smaller, which shows the iteration is converging." },
  { questionId: `${Q}authentic-expansion-wjec-alevel-maths-maths-geometric-series`, examiner: 2, set: "design",
    answer: "S∞ = a/(1 − r) = 12/(1 − 0.75) = 48. It exists because the common ratio has modulus less than 1, |r| < 1." },
  { questionId: `${Q}repair-depth-math-stationary-probe`, examiner: 2, set: "design",
    answer: "f′(x) = 2x − 6, and setting it to zero gives x = 3. The second derivative f″(x) = 2 is positive, so the stationary point is a minimum." },
  // --- Held out: written after the change, never used to tune it ---------------
  { questionId: `${Q}physics-depth50-electric-circuits-sp-05-transmission-loss-3`, examiner: 3, set: "held-out",
    answer: "I = P/V = 2.0×10⁶ ÷ 20×10³ = 100 A. If the power stays the same and the voltage is doubled, the current is halved. Since the loss is I²R, the cable loss becomes four times smaller." },
  { questionId: `${Q}physics-depth50-medical-physics-sp-04-fluorescence-10`, examiner: 2, set: "held-out",
    answer: "At twice the distance the count rate goes down to roughly a quarter, because of inverse-square spreading. To get a similar number of counts you would have to count for about four times as long, or use a more efficient detector." },
  { questionId: `${Q}physics-depth-materials-sp-01-stress-vs-force-1`, examiner: 3, set: "held-out",
    answer: "A material breaks at a fixed breaking stress, not a fixed force, and the load is spread over the cross-sectional area. The thin wire's area is four times smaller, so the same load gives it four times the stress. Its stress reaches the breaking stress first, so the thinner wire fails first." },
  { questionId: `${Q}physics-depth50-fields-sp-02-height-radius-6`, examiner: 2, set: "held-out",
    answer: "r has to be measured from the centre of the Earth, not from its surface. So use r = Earth's radius + the satellite's altitude." },
  { questionId: `${Q}recall-probe-bio-semi-conservative-recall`, examiner: 2, set: "held-out",
    answer: "Each new DNA molecule is made of one strand from the original molecule and one strand that has just been synthesised." },
  { questionId: `${Q}recall-probe-chem-activation-energy-recall`, examiner: 2, set: "held-out",
    answer: "Activation energy is the minimum energy particles need when they collide in order to react. A catalyst gives a different route for the reaction, an alternative pathway with a lower activation energy." },
  { questionId: `${Q}recall-probe-bio-sliding-filament-recall`, examiner: 2, set: "held-out",
    answer: "The A band stays the same length, but the sarcomere gets shorter." },
  { questionId: `${Q}recall-probe-chem-oxidation-number-recall`, examiner: 2, set: "held-out",
    answer: "Mn is +7. Oxidation is when the oxidation number goes up." },
  { questionId: `${Q}recall-probe-bio-growth-curve-recall`, examiner: 2, set: "held-out",
    answer: "Lag phase, log (exponential) phase, stationary phase and then death phase. The population grows fastest in the log phase." },
  { questionId: `${Q}recall-probe-chem-halide-test-recall`, examiner: 2, set: "held-out",
    answer: "Acidify with dilute nitric acid and then add silver nitrate solution. Chloride gives a white precipitate that dissolves in dilute ammonia." },
  { questionId: `${Q}wjec-quality-maths-negative-reciprocal`, examiner: 2, set: "held-out",
    answer: "The tangent gradient at x = 2 is 4, and perpendicular gradients multiply to give -1, so the normal gradient is -1/4, not -4. The normal is y - 4 = -(x - 2)/4." },
  { questionId: `${Q}wjec-quality-maths-two-child-information`, examiner: 3, set: "held-out",
    answer: "If at least one is a girl, the outcomes left are GG, GB and BG, so the probability is 1/3. If the older child is a girl, only GG and GB are left, so it is 1/2. The two pieces of information remove different outcomes from the ordered sample space." },
  { questionId: `${Q}recall-probe-bio-variables-recall`, examiner: 2, set: "held-out",
    answer: "The independent variable is the one the investigator changes, which here is temperature. A control variable is kept the same so that it does not affect the dependent variable." },

  // --- Wrong, in the new equivalent wording: must not gain credit -------------
  { questionId: `${Q}physics-depth50-electric-circuits-sp-05-transmission-loss-3`, examiner: 2, set: "wrong",
    answer: "I = P/V = 2.0×10⁶/20×10³ = 100 A. For fixed P, doubling V halves I, so the cable loss becomes four times bigger." },
  { questionId: `${Q}physics-depth-fields-sp-01-inverse-square-fallacy-3`, examiner: 0, set: "wrong",
    answer: "The force is inversely proportional to the distance, so doubling the distance halves the force, and halving the distance makes it twice as big." },
  { questionId: `${Q}physics-depth-materials-sp-01-stress-vs-force-1`, examiner: 1, set: "wrong",
    answer: "The breaking stress is fixed, but the load is spread over the cross-sectional area. The thinner wire has four times the area, so the same load produces a quarter of the stress, and the thick wire fails first." },
  { questionId: `${Q}wjec-quality-biology-mass-direction`, examiner: 1, set: "wrong",
    answer: "In A, water moves out of the tissue so its mass goes down at first. In B, water moves into the tissue so its mass goes up. Water moves from the higher, less negative potential to the lower, more negative potential." },
  { questionId: `${Q}recall-probe-chem-gibbs-recall`, examiner: 1, set: "wrong",
    answer: "ΔG = ΔH − TΔS. A reaction is feasible when ΔG is zero or positive." },
  { questionId: `${Q}recall-probe-chem-activation-energy-recall`, examiner: 1, set: "wrong",
    answer: "Activation energy is the minimum energy that colliding particles need in order to react. A catalyst provides an alternative pathway with a higher activation energy." },
  { questionId: `${Q}recall-probe-bio-sliding-filament-recall`, examiner: 0, set: "wrong",
    answer: "The A band gets shorter and the sarcomere gets longer." },
  { questionId: `${Q}recall-probe-chem-oxidation-number-recall`, examiner: 1, set: "wrong",
    answer: "+7. Oxidation is when the oxidation number goes down." },
  { questionId: `${Q}physics-depth50-thermal-sp-03-pressure-volume-7`, examiner: 1, set: "wrong",
    answer: "At constant temperature pV is constant. Making the volume smaller means the molecules hit each unit area of the wall less often, so the pressure goes down." },
  { questionId: `${Q}recall-probe-bio-secondary-response-recall`, examiner: 1, set: "wrong",
    answer: "Memory cells made in the primary response. On re-exposure they divide slowly, so antibodies are made more slowly and in smaller amounts." },
  { questionId: `${Q}physics-depth50-medical-physics-sp-04-fluorescence-10`, examiner: 1, set: "wrong",
    answer: "At twice the distance the count rate goes up fourfold. To get a similar number of counts, count for about four times as long or use a more efficient detector." },
];
