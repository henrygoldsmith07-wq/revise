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
