import type { MarkSchemeReject, Question } from "@/domain/types-questions";

/**
 * "Do not accept" rules for Year 12 Physics questions where a plausible wrong
 * answer in a student's own words kept enough keywords to earn a mark (pass 62;
 * tests/marking-y12-physics.test.ts). Applied after the human-verification
 * ledger, so no question's reviewed fingerprint or status changes. Rules only
 * ever remove credit. Authored by hand, not teacher-reviewed.
 */
const Q = "cnt:question:";
const GUARDS: Record<string, MarkSchemeReject[]> = {
  [`${Q}authentic-expansion-wjec-alevel-physics-physics-terminal-speed`]: [
    { point: 0, phrases: ["drag … bigger than", "drag … greater than", "drag … larger than", "resistance … bigger than", "resistance … greater than"],
      reason: "At terminal speed drag has grown until it equals the weight; it does not exceed it." },
    { point: 1, phrases: ["drag … bigger than", "drag … greater than", "drag … larger than", "resistance … bigger than", "resistance … greater than"],
      reason: "At terminal speed drag equals the weight; if it were bigger the object would still be slowing." },
  ],
  [`${Q}physics-depth-nuclear-sp-03-activity-definition-0`]: [
    { point: 0, phrases: ["total number of nuclei", "total number of atoms", "number of nuclei … in the sample", "number of nuclei … in a sample"],
      except: ["per second", "each second", "every second", "per unit time", "in one second", "rate"],
      reason: "Activity is a rate (decays per unit time), not the number of nuclei present." },
  ],
  [`${Q}physics-motion-graph-signed-area-definition`]: [
    { point: 1, phrases: ["all … positive", "as positive", "areas … positive numbers", "ignore the negative", "ignore the sign"],
      except: ["below … negative", "negative displacement", "contributes negatively", "counts as negative", "count as negative"],
      reason: "Areas below the time axis are negative: adding them as positives gives distance, not displacement." },
  ],
  [`${Q}physics-depth50-kinematics-dynamics-sp-03-constant-assumption-2`]: [
    { point: 0, phrases: ["works for any", "work for any", "suvat … any motion", "suvat … fine", "valid for any", "even when … acceleration changes", "even if … acceleration changes", "one equation is fine"],
      except: ["constant acceleration", "acceleration is constant", "a is constant", "uniform acceleration"],
      reason: "The SUVAT equations are derived for constant acceleration only." },
  ],
  [`${Q}physics-depth-waves-sp-01-transverse-longitudinal-1`]: [
    { point: 0, phrases: ["transverse … parallel", "transverse … along the", "transverse … same direction", "transverse … in line"],
      except: ["not parallel", "transverse … perpendicular", "transverse … right angle"],
      reason: "In a transverse wave the oscillations are perpendicular to the energy transfer; parallel describes a longitudinal wave." },
    { point: 1, phrases: ["longitudinal … perpendicular", "longitudinal … right angle", "longitudinal … at 90"],
      except: ["not perpendicular", "longitudinal … parallel", "longitudinal … along the same", "longitudinal … same direction"],
      reason: "In a longitudinal wave the oscillations are parallel to the energy transfer; perpendicular describes a transverse wave." },
  ],
  [`${Q}physics-depth-circular-shm-sp-01-angular-velocity-definition-0`]: [
    { point: 0, phrases: ["distance travelled per second", "distance per second", "distance travelled each second", "metres per second", "m s-1", "m/s"],
      except: ["angle", "angular displacement", "radian", "rad"],
      reason: "Angular velocity is the rate of change of angle, not distance travelled per second (that is linear speed)." },
    { point: 1, phrases: ["metres per second", "meters per second", "m s-1", "m/s", "ms-1"],
      except: ["radian", "rad"],
      reason: "The SI unit of angular velocity is rad s⁻¹; metres per second is the unit of linear speed." },
  ],
  [`${Q}physics-depth50-thermal-sp-05-zero-celsius-7`]: [
    { point: 0, phrases: ["0 °c is absolute zero", "0°c is absolute zero", "0 c is absolute zero", "zero celsius is absolute zero", "0 °c … stop moving", "0°c … stop moving", "0 °c … no kinetic", "0 °c is 0 k", "0°c is 0 k"],
      except: ["273", "not absolute zero", "not 0 k", "not stop"],
      reason: "0 °C is 273 K; molecules only stop (in the ideal limit) at 0 K." },
    { point: 1, phrases: ["0 °c is absolute zero", "0°c is absolute zero", "0 c is absolute zero", "0 °c … stop moving", "0°c … stop moving", "0 °c is 0 k", "0°c is 0 k"],
      except: ["273", "not absolute zero", "not 0 k", "not stop"],
      reason: "Absolute zero is 0 K (−273 °C), not 0 °C." },
  ],
  [`${Q}physics-depth50-electric-circuits-sp-05-efficiency-1`]: [
    { point: 0, phrases: ["total power in divided by the useful", "total power in divided by useful", "input power divided by the useful", "input divided by useful", "total … divided by … useful output"],
      except: ["useful … divided by … total", "useful … over … total"],
      reason: "Efficiency is useful output divided by total input; the ratio is not inverted." },
    { point: 1, phrases: ["useful output is the heat", "useful output is heat", "useful output is the sound", "useful output is sound"],
      reason: "A motor's useful output is mechanical (kinetic) power; heat and sound are losses." },
  ],
  // pass 66
  [`${Q}physics-depth-momentum-sp-03-elastic-definition-0`]: [
    { point: 1, phrases: ["momentum is not conserved", "momentum isn't conserved", "momentum … not conserved", "momentum … is lost", "momentum … not the same"],
      reason: "Momentum is conserved in every closed collision, elastic or not." },
  ],
  [`${Q}physics-depth-thermal-sp-01-internal-energy-definition-0`]: [
    { point: 0, phrases: ["whole object", "object as it moves", "moves through space", "motion of the whole", "ignoring the molecules"],
      except: ["random", "potential"],
      reason: "Internal energy is the random kinetic plus potential energy of the molecules, not the bulk motion of the object." },
  ],
  [`${Q}physics-depth-kinematics-dynamics-sp-04-acceleration-definition-0`]: [
    { point: 0, phrases: ["rate of change of speed", "change in speed", "change of speed", "speeding up"],
      except: ["velocity"],
      reason: "Acceleration is the rate of change of velocity (a vector), not of speed." },
    { point: 1, phrases: ["cannot be accelerating", "can't be accelerating", "cant be accelerating", "not accelerating", "no acceleration"],
      except: ["circular", "direction", "going round", "turning"],
      reason: "A change in direction is a change in velocity, so constant speed can still be acceleration." },
  ],
  [`${Q}physics-depth-momentum-sp-01-impulse-definition-1`]: [
    { point: 0, phrases: ["force divided by", "force over the time", "divided by the time"],
      except: ["multiplied by", "multiply"],
      reason: "Impulse is force multiplied by the time it acts, not divided by it." },
    { point: 2, phrases: ["change in kinetic energy", "kinetic energy"],
      except: ["momentum"],
      reason: "Impulse equals the change in momentum, not in kinetic energy." },
  ],
  [`${Q}physics-depth50-circular-shm-sp-04-definitions-0`]: [
    { point: 0, phrases: ["acceleration is constant", "constant in size", "constant acceleration", "acceleration … constant"],
      except: ["proportional"],
      reason: "In SHM the acceleration is proportional to displacement, so it is not constant." },
    { point: 1, phrases: ["away from", "points away", "directed away", "away … equilibrium"],
      except: ["towards", "toward"],
      reason: "The acceleration is directed towards the equilibrium position (hence the minus sign)." },
  ],
  [`${Q}physics-depth50-electric-circuits-sp-03-resistance-definition-14`]: [
    { point: 0, phrases: ["current divided by", "current over the p.d.", "current over the voltage", "i/v"],
      except: ["p.d. divided by", "voltage divided by", "v/i"],
      reason: "Resistance is p.d. divided by current (V/I), not current divided by p.d." },
    { point: 1, phrases: ["whatever … temperature", "any temperature", "regardless … temperature", "any component", "every component"],
      except: ["constant temperature", "fixed temperature", "same temperature"],
      reason: "V/I is constant only for an ohmic conductor at constant temperature." },
  ],
  [`${Q}physics-depth-practical-investigations-sp-02-accuracy-precision-definitions-1`]: [
    { point: 0, phrases: ["accuracy is how close repeated", "accuracy is the closeness of repeated", "accuracy … close … each other", "accuracy … repeated readings"],
      reason: "Accuracy is closeness to the true value; closeness of repeats is precision." },
    { point: 1, phrases: ["precision is how close the result", "precision is how close a measurement", "precision is how close a reading", "precision … close … to the true value", "precision … closeness … true value"],
      except: ["repeated readings are", "repeat readings are", "each other"],
      reason: "Precision is the closeness of repeated readings to each other; closeness to the true value is accuracy." },
  ],
  [`${Q}physics-depth-sports-physics-sp-02-moment-definition-1`]: [
    { point: 0, phrases: ["force divided by", "force over the distance", "force / distance"],
      except: ["multiplied", "times", " x ", "×"],
      reason: "A moment is force multiplied by perpendicular distance, not divided by it." },
  ],
  [`${Q}physics-depth-materials-sp-04-energy-area-definition-0`]: [
    { point: 0, phrases: ["gradient of the force", "gradient … force-extension", "slope of the force", "the gradient"],
      except: ["area"],
      reason: "Strain energy is the area under the force-extension graph; the gradient is the stiffness (force constant)." },
  ],
  // pass 69
  [`${Q}physics-depth-kinematics-dynamics-sp-01-kin-resolve-rule-1`]: [
    { point: 0, phrases: ["along the axis is f sin", "along the axis is sin", "parallel … is f sin"],
      reason: "The component along the axis is F cos θ (θ from the axis); sin θ is the perpendicular component." },
    { point: 1, phrases: ["perpendicular to it is f cos", "perpendicular to the axis is f cos", "perpendicular … is f cos", "right angles … is f cos"],
      reason: "The component perpendicular to the axis is F sin θ (θ from the axis)." },
  ],
  [`${Q}physics-depth-momentum-sp-01-momentum-definition-0`]: [
    { point: 0, phrases: ["mass multiplied by acceleration", "mass times acceleration", "mass x acceleration", "mass × acceleration"],
      except: ["velocity"],
      reason: "Momentum is mass multiplied by velocity; mass times acceleration is force." },
    { point: 1, phrases: ["m/s squared", "m s-2", "m s⁻²", "m/s²", "metres per second squared"],
      reason: "The unit of momentum is kg m s⁻¹ (or N s); kg m s⁻² is the newton." },
    { point: 2, phrases: ["is a scalar", "it's a scalar", "no direction", "scalar quantity"],
      except: ["not a scalar", "not scalar", "vector"],
      reason: "Momentum is a vector: its direction matters." },
  ],
  [`${Q}physics-depth-electromagnetic-induction-sp-01-flux-definition-0`]: [
    { point: 0, phrases: ["sin θ", "sinθ", "sin(θ)", "sin theta", "b a sin", "ba sin"],
      except: ["cos"],
      reason: "Flux is BA cos θ with θ measured from the normal; BA sin θ uses the angle to the plane." },
    { point: 2, phrases: ["plane of the surface", "plane of the area", "plane of the coil", "field and the plane", "angle to the plane"],
      except: ["normal"],
      reason: "θ is the angle between the field and the normal to the surface, not the plane." },
  ],
  [`${Q}physics-depth-kinematics-dynamics-sp-02-dt-gradient-rule-1`]: [
    { point: 0, phrases: ["area under", "area beneath"],
      except: ["gradient", "tangent", "slope"],
      reason: "Velocity is the gradient (tangent) of a displacement–time graph; the area under it means nothing here." },
    { point: 1, phrases: ["constant velocity", "steady velocity", "constant speed", "moving at a constant", "uniform velocity"],
      except: ["stationary", "not moving", "at rest", "zero velocity", "velocity is zero"],
      reason: "A horizontal displacement–time line means the position is not changing: the object is stationary." },
  ],
  [`${Q}physics-depth50-materials-sp-02-definitions-0`]: [
    { point: 0, phrases: ["force times", "force multiplied by", "force x", "force ×", "force multiplied"],
      except: ["force divided", "force over"],
      reason: "Stress is force divided by cross-sectional area, not multiplied by it." },
    { point: 1, phrases: ["original length divided by", "original length over", "length divided by extension"],
      except: ["extension divided by", "extension over"],
      reason: "Strain is extension divided by original length, not the other way up." },
    { point: 2, phrases: ["strain divided by stress", "strain over stress", "strain / stress"],
      except: ["stress divided by strain", "stress over strain", "stress / strain"],
      reason: "The Young modulus is stress divided by strain, not the other way up." },
  ],
  [`${Q}physics-depth-practical-investigations-sp-02-random-systematic-definitions-0`]: [
    { point: 0, phrases: ["systematic error makes readings scatter", "systematic error scatters", "systematic uncertainty scatters", "systematic … averaging reduces"],
      reason: "Random uncertainty scatters readings either side of the mean and averaging reduces it; a systematic error shifts them all the same way." },
    { point: 1, phrases: ["random uncertainty moves every", "random error moves every", "random … same way", "random … shifts every"],
      reason: "A systematic error shifts every reading the same way; a random uncertainty scatters them." },
  ],
  [`${Q}physics-depth50-quantum-sp-07-transition-rule-1`]: [
    { point: 0, phrases: ["sum of the", "adding the two", "added together", "total of the two"],
      reason: "The photon energy is the difference between the two levels, not their sum." },
    { point: 1, phrases: ["going up a level emits", "going up emits", "upward … emits", "up a level emits", "going down a level absorbs", "going down absorbs", "downward … absorbs", "down a level absorbs"],
      reason: "A downward transition emits a photon; an upward one absorbs it." },
  ],
  // pass 79
  [`${Q}authentic-expansion-wjec-alevel-physics-physics-ideal-gas`]: [
    { point: 1, phrases: ["rt / pv", "rt/pv", "rt divided by pv", "8.31 x 27 ", "8.31 × 27 ", "8.31 x 27)", "8.31 × 27)"],
      reason: "n = pV / RT with T in kelvin (300 K): that gives 0.963 mol." },
  ],
  [`${Q}authentic-expansion-wjec-alevel-physics-physics-projectile-components`]: [
    { point: 2, phrases: ["horizontal speed gets bigger", "horizontal speed increases", "horizontal speed gets faster", "horizontal speed speeds up", "horizontal speed accelerates", "horizontal velocity increases", "horizontal velocity gets bigger"],
      except: ["does not", "doesn't", "not get", "not increase"],
      reason: "With no horizontal force, the horizontal speed stays constant at 12 m s⁻¹." },
  ],
  [`${Q}authentic-expansion-wjec-alevel-physics-physics-specific-heat`]: [
    { point: 1, phrases: ["12000 x 0.40 x 15", "12000 × 0.40 × 15", "12000 x 0.4 x 15", "12000 × 0.4 × 15"],
      reason: "c = Q / (m ΔT) = 12000 / (0.40 × 15): the energy is divided by mass and temperature rise." },
  ],
  // pass 77
  [`${Q}authentic-expansion-wjec-alevel-physics-physics-radioactive-half-life`]: [
    { point: 1, phrases: ["takes off", "take off", "subtract", "minus 320", "- 960", "which is zero", "reaches zero", "goes to zero"],
      except: ["not subtract"],
      reason: "Activity halves each half-life (exponential decay); it does not fall by a fixed amount, so it never reaches zero after three half-lives." },
  ],
  [`${Q}authentic-expansion-wjec-alevel-physics-physics-momentum-explosion`]: [
    { point: 2, phrases: ["also goes east", "also moves east", "also travels east", "goes east at 7.5", "moves east at 7.5", "east at 7.5"],
      except: ["not east", "not also east"],
      reason: "Total momentum is zero, so the second part must move opposite to the first: 7.5 m s⁻¹ west." },
  ],
  [`${Q}authentic-expansion-wjec-alevel-physics-more-alevel-physics-field-potential`]: [
    { point: 2, phrases: ["potential gets bigger", "potential increases", "potential rises", "potential goes up", "potential gets larger", "potential is higher"],
      except: ["against the field", "opposite to the field", "opposite the field"],
      reason: "Electric potential decreases in the direction of the electric field." },
  ],
  // pass 76
  [`${Q}authentic-expansion-wjec-alevel-physics-more-alevel-physics-kinetic-energy`]: [
    { point: 2, phrases: ["four times", "quadruple", "quadruples", "x4", "× 4", "goes up by 4", "squared"],
      except: ["not four", "not quadruple"],
      reason: "Mean kinetic energy is proportional to absolute temperature (3/2 kT), so doubling T doubles it; it is not squared." },
  ],
  [`${Q}authentic-expansion-wjec-alevel-physics-physics-particle-conservation`]: [
    { point: 0, phrases: ["a positron", "positron and", "and a neutrino", "and neutrino", "plus a neutrino"],
      except: ["antineutrino", "not a positron", "no positron"],
      reason: "Beta-minus decay emits an electron and an electron antineutrino, not a positron or a neutrino." },
    { point: 1, phrases: ["charge is +2", "charge of +2", "charge is 2", "so the charge is +2"],
      reason: "In beta-minus decay the neutron (0) becomes a proton (+1) and an electron (−1): the totals are 0 and 0." },
  ],
  // pass 74
  [`${Q}authentic-expansion-wjec-alevel-physics-physics-polarisation`]: [
    ...[0, 1, 2].map((point) => ({ point, phrases: ["light is longitudinal", "shows … is longitudinal", "shows … light is a longitudinal", "light is a longitudinal"],
      except: ["not longitudinal", "isn't longitudinal", "cannot be longitudinal", "transverse"],
      reason: "Polarisation can only happen for a transverse wave, so it shows light is transverse, not longitudinal." })),
  ],
  [`${Q}authentic-expansion-wjec-alevel-physics-more-alevel-physics-filament-lamp`]: [
    ...[0, 1, 2].map((point) => ({ point, phrases: ["resistance goes down", "resistance decreases", "resistance falls", "resistance drops", "resistance gets lower", "resistance is lower", "resistance gets smaller", "more electrons are freed", "more free electrons", "more electrons to carry"],
      except: ["not go down", "does not decrease", "doesn't fall", "rather than"],
      reason: "The lamp's resistance rises with current: the hotter filament has more lattice-ion vibrations, which scatter more electrons." })),
  ],
  // pass 73
  [`${Q}authentic-expansion-wjec-alevel-physics-physics-resonance-damping`]: [
    { point: 0, phrases: ["damping … narrower", "damping … sharper", "damping … bigger", "damping … larger", "damping … higher peak", "damping … increases"],
      except: ["not narrower", "broader", "wider", "lower", "smaller", "reduce"],
      reason: "Heavier damping lowers and broadens the resonance peak; a bigger, sharper peak is what light damping gives." },
    { point: 1, phrases: ["damping makes the amplitude … bigger", "damping makes the amplitude … larger", "damping … amplitude … bigger", "damping … amplitude … larger", "damping … amplitude … increases", "damping … amplitude … higher"],
      except: ["less damping", "light damping", "lighter damping"],
      reason: "Damping removes energy, so heavy damping reduces the maximum amplitude." },
  ],
  [`${Q}authentic-source-aqa-alevel-physics-planetary-mission-report`]: [
    { point: 0, phrases: ["inversely proportional to the distance", "inversely proportional to r.", "doubling r halves", "doubling the distance halves", "halves g"],
      except: ["squared", "r²", "r^2", "inverse square", "inverse-square"],
      reason: "Gravitational field strength follows an inverse-square law; it is not inversely proportional to the distance." },
    { point: 1, phrases: ["halves g", "halves the field", "g is halved", "g halves", "g is half", "half as much", "half the"],
      except: ["quarter", "four", "÷ 4", "/ 4", "÷4"],
      reason: "Doubling r divides g by four, not two." },
  ],
  [`${Q}authentic-source-wjec-gcse-physics-sensor-circuit-note`]: [
    { point: 0, phrases: ["resistance goes up", "resistance increases", "resistance rises", "resistance is higher", "resistance gets bigger", "resistance gets higher", "resistance is bigger"],
      except: ["resistance goes down", "resistance decreases", "resistance drops", "resistance falls", "resistance is lower", "resistance gets smaller", "resistance gets lower", "resistance reduces"],
      reason: "A thermistor's resistance decreases as it warms." },
    { point: 1, phrases: ["bigger share", "larger share", "greater share", "bigger proportion", "larger proportion", "greater proportion"],
      except: ["smaller share", "smaller proportion", "less"],
      reason: "With the thermistor's resistance falling, its share of the total resistance gets smaller." },
    { point: 2, phrases: ["output rises", "output increases", "output goes up", "output is higher", "output gets bigger", "output gets higher"],
      except: ["output falls", "output decreases", "output goes down", "output drops", "output is lower"],
      reason: "The output across the thermistor falls when the temperature rises." },
  ],
  // pass 71
  [`${Q}physics-depth-waves-sp-07-path-difference-rule-0`]: [
    { point: 0, phrases: ["constructive … odd number", "constructive … antiphase", "constructive … half wavelength"],
      reason: "Constructive interference needs a whole number of wavelengths (waves in phase); an odd number of half wavelengths is destructive." },
    { point: 1, phrases: ["destructive … whole number", "destructive … nλ"],
      except: ["odd number of half wavelengths for destructive", "destructive when it is an odd", "destructive … odd"],
      reason: "Destructive interference needs an odd number of half wavelengths (waves in antiphase), not a whole number." },
    { point: 2, phrases: ["whole number"],
      except: ["n is", "n =", "n=", "integer", "where n", "n can", "n stands"],
      reason: "The point is to say what n is (0, 1, 2, …); saying 'a whole number of wavelengths' names the condition, not n." },
  ],
  [`${Q}physics-depth-capacitance-sp-03-parallel-capacitance-rule-1`]: [
    { point: 0, phrases: ["reciprocal", "1/c = 1/", "1/c1"],
      reason: "Capacitors in parallel simply add; the reciprocal rule is for capacitors in series." },
    { point: 2, phrases: ["smaller than the smallest", "less than the smallest", "below the smallest", "lower than the smallest"],
      except: ["unlike", "in series", "series"],
      reason: "In parallel the total exceeds the largest capacitor; it only falls below the smallest in series." },
  ],
  [`${Q}physics-depth-practical-investigations-sp-03-gradient-units-rule-0`]: [
    { point: 0, phrases: ["multiply the unit", "multiplied by the unit", "times the unit", "unit of the y axis times", "y axis times"],
      except: ["divide"],
      reason: "The gradient's unit is the y-axis unit divided by the x-axis unit." },
    { point: 1, phrases: ["times s which", "× s which", "x s which", "times s gives", "multiplied by s"],
      except: ["divided"],
      reason: "A velocity–time gradient is m s⁻¹ divided by s = m s⁻² (acceleration), not multiplied." },
  ],
  [`${Q}physics-depth-kinematics-dynamics-sp-02-vt-graph-rules-0`]: [
    { point: 0, phrases: ["gradient is the displacement", "gradient is displacement", "gradient = displacement", "gradient represents displacement", "gradient is the distance", "gradient is the velocity"],
      reason: "On a velocity–time graph the gradient is the acceleration." },
    { point: 1, phrases: ["area under it is the acceleration", "area is the acceleration", "area under the graph is the acceleration", "area under the line is the acceleration", "area represents acceleration", "area is acceleration"],
      reason: "On a velocity–time graph the area under the line is the displacement." },
  ],
  [`${Q}physics-depth-electric-circuits-sp-02-divider-unloaded-rule-0`]: [
    { point: 0, phrases: ["vout = vin × r1/", "vout = vin x r1/", "vout = vin r1/", "vout = r1/", "v out = vin × r1/"],
      reason: "The output across the lower resistor is Vin × R₂/(R₁ + R₂), with the resistor you measure across on top." },
    { point: 1, phrases: ["whatever the load", "any load", "even if a low", "large current", "regardless of the load"],
      reason: "The simple divider formula only holds when the output draws negligible current." },
  ],
  [`${Q}physics-depth50-energy-power-sp-06-efficiency-definition-0`]: [
    { point: 0, phrases: ["input divided by useful", "input over useful", "input / useful", "total energy input divided by useful", "total input divided by useful"],
      reason: "Efficiency is useful output divided by total input, not the other way up." },
    { point: 1, phrases: ["over 100%", "more than 100%", "above 100%", "greater than 100%", "exceed 100%"],
      except: ["cannot", "can't", "never", "not be", "not exceed", "no more than"],
      reason: "A passive machine cannot be more than 100% efficient." },
  ],
  [`${Q}physics-depth50-waves-sp-05-definition-0`]: [
    { point: 0, phrases: ["along the direction of travel", "parallel to the direction", "in the direction of travel"],
      except: ["perpendicular", "right angle", "plane"],
      reason: "Polarisation limits the oscillations to a single plane at right angles to the direction of travel." },
    { point: 1, phrases: ["only longitudinal", "longitudinal waves such as sound can be polarised", "sound can be polarised", "longitudinal waves can be polarised"],
      except: ["cannot", "can't", "not"],
      reason: "Only transverse waves can be polarised; longitudinal waves such as sound cannot." },
  ],
  [`${Q}physics-depth50-waves-sp-08-definition-0`]: [
    { point: 0, phrases: ["bouncing back", "bounce back", "bounces back", "reflected back", "reflecting off"],
      except: ["spread", "bend"],
      reason: "Diffraction is the spreading or bending of waves round an obstacle or through a gap; reflection is bouncing back." },
    { point: 1, phrases: ["without spreading", "straight line", "carry on straight", "do not spread", "don't spread", "no spreading"],
      reason: "A narrow gap makes the wavefronts spread into the region behind it." },
  ],
};

export function applyPhysicsAnswerGuards(questions: Question[]): Question[] {
  return questions.map((q) => {
    const rules = GUARDS[q.id];
    if (!rules) return q;
    const part = q.parts[0];
    if (!part) return q;
    const merged = [...(part.rejects ?? []), ...rules.filter((r) => r.point < part.markScheme.length)];
    return { ...q, parts: [{ ...part, rejects: merged }, ...q.parts.slice(1)] };
  });
}
