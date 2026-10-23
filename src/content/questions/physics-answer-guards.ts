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
