import type { CapabilityNode } from "@/domain/capability-graph";
import { wjecMaths } from "@/domain/curriculum/wjec-maths";
import { wjecBiology } from "@/domain/curriculum/wjec-biology";
import { wjecChemistry } from "@/domain/curriculum/wjec-chemistry";

export const wjecDepthCurricula = [wjecMaths, wjecBiology, wjecChemistry];
const namespaces: Record<string, string> = { "wjec-alevel-maths": "math", "wjec-alevel-biology": "bio", "wjec-alevel-chemistry": "chem" };

export function wjecCapabilityForSpecPoint(pointId: string): string | undefined {
  const [subject, topic, point] = pointId.split(".");
  const prefix = subject && namespaces[subject];
  return prefix && topic && point ? `${prefix}.${topic}.${point}` : undefined;
}

/** Proposed conceptual edges with explicit reasons, never inferred from syllabus order.
 * No edge below has a human attestation; trusted diagnosis must not traverse it.
 */
const dependencies: Record<string, Record<string, string>> = {
  "math.differentiation.sp-02": { "math.differentiation.sp-01": "Composite, product and quotient derivatives use the derivatives of their component functions." },
  "math.differentiation.sp-03": { "math.differentiation.sp-01": "Stationary-point classification requires a correct first derivative and sign analysis." },
  "math.differentiation.sp-04": { "math.differentiation.sp-03": "An optimisation candidate must be found and classified before its value is compared with domain boundaries." },
  "math.integration.sp-02": { "math.integration.sp-01": "Evaluating a definite integral requires a correct antiderivative before applying the bounds." },
  "math.conditional-probability.sp-01": { "math.probability.sp-01": "Conditional denominators require identifying the conditioning event and its probability." },
  "math.conditional-probability.sp-04": { "math.conditional-probability.sp-01": "A decision based on a positive test requires conditioning on the observed result, including the base rate." },
  "math.kinematics.sp-04": { "math.differentiation.sp-01": "Velocity and acceleration are derivatives of displacement and velocity respectively." },
  "math.differential-equations-context.sp-02": { "math.integration.sp-01": "Solving a separated rate equation requires integrating both sides before using initial data." },
  "bio.enzymes.sp-03": { "bio.enzymes.sp-01": "Saturation and denaturation explanations rely on active-site binding and enzyme structure." },
  "bio.enzymes.sp-04": { "bio.enzymes.sp-03": "Comparing inhibition models requires understanding the untreated rate response to substrate concentration." },
  "bio.membranes-transport.sp-03": { "bio.membranes-transport.sp-01": "Osmosis requires a selectively permeable membrane; the membrane structure constrains which particles cross." },
  "bio.membranes-transport.sp-04": { "bio.membranes-transport.sp-01": "Temperature-dependent leakage is explained through changes to the bilayer and membrane proteins." },
  "bio.respiration.sp-03": { "bio.membranes-transport.sp-02": "Chemiosmosis depends on movement down a proton gradient and protein-mediated transport across a membrane." },
  "chem.moles.sp-06": { "chem.moles.sp-02": "A titration needs amounts in moles from concentration and volume before a balanced-equation ratio is used." },
  "chem.equilibria.sp-03": { "chem.moles.sp-02": "Kc calculations use equilibrium concentrations, requiring conversion of amounts and vessel volume." },
  "chem.acids-bases.sp-03": { "chem.equilibria.sp-03": "Weak-acid calculations are applications of an equilibrium expression with a justified approximation." },
  "chem.transition-metals.sp-05": { "chem.redox.sp-02": "A redox titration needs the balanced electron-transfer stoichiometry before calculating the analyte amount." },
  "chem.entropy-feasibility.sp-03": { "chem.entropy-feasibility.sp-02": "A Gibbs-energy calculation needs the reaction entropy with consistent energy units." },
};

export const wjecSubjectCapabilities: CapabilityNode[] = wjecDepthCurricula.flatMap((curriculum) => curriculum.topics.flatMap((topic) =>
  (topic.specPoints ?? []).map((point) => {
    const id = wjecCapabilityForSpecPoint(point.id)!;
    const rationales = dependencies[id] ?? {};
    return { id, subjectId: topic.subjectId, topicId: topic.id, label: point.text,
      specPointIds: [point.id], prerequisites: Object.keys(rationales), prerequisiteRationales: rationales,
      explanation: `Demonstrate that you can ${point.text.replace(/[.]$/, "")}. Show the reasoning needed for the stated conditions.` };
  })));
