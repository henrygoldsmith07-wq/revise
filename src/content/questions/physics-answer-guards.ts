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
