import { validateCapabilityGraph, type CapabilityNode } from "@/domain/capability-graph";

/** Initial reviewed-in-code skill chains. Exact board-reference verification is still editorial work. */
export const wjecCapabilities: CapabilityNode[] = [
  { id: "bio.active-site", subjectId: "wjec-alevel-biology", topicId: "wjec-alevel-biology.enzymes", label: "Link active-site shape to specificity", specPointIds: ["wjec-alevel-biology.enzymes.sp-01"], prerequisites: [],
    explanation: "The active site's shape and chemical properties are complementary to the substrate. Binding forms an enzyme–substrate complex; enzyme specificity depends on this interaction." },
  { id: "bio.saturation", subjectId: "wjec-alevel-biology", topicId: "wjec-alevel-biology.enzymes", label: "Explain enzyme saturation", specPointIds: ["wjec-alevel-biology.enzymes.sp-03"], prerequisites: ["bio.active-site"],
    explanation: "At fixed enzyme concentration, increasing substrate initially increases the rate. At high substrate concentration almost all active sites are occupied; adding substrate has little further effect." },
  { id: "bio.inhibition", subjectId: "wjec-alevel-biology", topicId: "wjec-alevel-biology.enzymes", label: "Distinguish inhibition using rate evidence", specPointIds: ["wjec-alevel-biology.enzymes.sp-04", "wjec-alevel-biology.enzymes.sp-05"], prerequisites: ["bio.saturation"],
    explanation: "A reversible competitive inhibitor competes for the active site: sufficiently high substrate restores the same maximum rate. In the simple non-competitive model, inhibitor binding elsewhere reduces functional enzyme activity and lowers the maximum rate. A single low-substrate measurement cannot distinguish them." },
  { id: "chem.volume", subjectId: "wjec-alevel-chemistry", topicId: "wjec-alevel-chemistry.moles", label: "Convert solution volumes to dm³", specPointIds: ["wjec-alevel-chemistry.moles.sp-02"], prerequisites: [],
    explanation: "There are 1000 cm³ in 1 dm³. Divide a volume in cm³ by 1000 before multiplying by concentration in mol dm⁻³." },
  { id: "chem.amount", subjectId: "wjec-alevel-chemistry", topicId: "wjec-alevel-chemistry.moles", label: "Calculate amount using concentration and volume", specPointIds: ["wjec-alevel-chemistry.moles.sp-02"], prerequisites: ["chem.volume"],
    explanation: "Use n = cV with V in dm³. The units mol dm⁻³ × dm³ give mol. For example, 0.200 mol dm⁻³ × 0.0250 dm³ = 0.00500 mol." },
  { id: "chem.stoichiometry", subjectId: "wjec-alevel-chemistry", topicId: "wjec-alevel-chemistry.moles", label: "Apply mole ratios in titration calculations", specPointIds: ["wjec-alevel-chemistry.moles.sp-06"], prerequisites: ["chem.amount"],
    explanation: "Write the balanced equation first. Convert the known solution to moles, apply the coefficient ratio, then divide the unknown amount by its volume in dm³. A 1:2 acid:alkali ratio means the acid amount is half the alkali amount. Keep unrounded intermediate values." },
  { id: "phys.resultant", subjectId: "wjec-alevel-physics", topicId: "wjec-alevel-physics.kinematics-dynamics", label: "Find the resultant force with signs", specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-04"], prerequisites: [],
    explanation: "Choose a positive direction and add forces with signs. Forces acting on different objects must not be included in the same resultant. Opposing forces of 12 N and 5 N give 7 N towards the 12 N force." },
  { id: "phys.acceleration", subjectId: "wjec-alevel-physics", topicId: "wjec-alevel-physics.kinematics-dynamics", label: "Connect resultant force to acceleration", specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-04"], prerequisites: ["phys.resultant"],
    explanation: "For constant mass, resultant force = mass × acceleration. Use the resultant of all forces, not just the driving force. Acceleration has the direction of the resultant; it need not have the direction of velocity." },
  { id: "phys.drag", subjectId: "wjec-alevel-physics", topicId: "wjec-alevel-physics.kinematics-dynamics", label: "Explain motion with changing drag", specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-07"], prerequisites: ["phys.acceleration"],
    explanation: "Drag opposes motion and usually increases with speed. As a falling object speeds up, upward drag increases and downward acceleration decreases. At terminal velocity drag balances weight: acceleration is zero while velocity remains non-zero." },
  { id: "math.power", subjectId: "wjec-alevel-maths", topicId: "wjec-alevel-maths.differentiation", label: "Differentiate a power correctly", specPointIds: ["wjec-alevel-maths.differentiation.sp-01"], prerequisites: [],
    explanation: "For x raised to n, multiply by n and reduce the power by one: d(x^n)/dx = n x^(n−1). Differentiate each term separately; a constant differentiates to zero." },
  { id: "math.stationary", subjectId: "wjec-alevel-maths", topicId: "wjec-alevel-maths.differentiation", label: "Find and classify stationary points", specPointIds: ["wjec-alevel-maths.differentiation.sp-04"], prerequisites: ["math.power"],
    explanation: "Solve f′(x) = 0. A positive f″ at the point gives a local minimum and a negative f″ a local maximum. If f″ is zero, check the derivative's sign on both sides." },
  { id: "math.optimisation", subjectId: "wjec-alevel-maths", topicId: "wjec-alevel-maths.differentiation", label: "Optimise a model within its domain", specPointIds: ["wjec-alevel-maths.differentiation.sp-04"], prerequisites: ["math.stationary"],
    explanation: "Use the constraint to write the objective in one variable. State its feasible domain. Differentiate, solve for stationary points, then compare valid candidates with endpoints and justify the optimum in context." },
];

/** Fail content validation early if an author introduces a dangling edge or cycle. */
export const wjecCapabilityGraphErrors = validateCapabilityGraph(wjecCapabilities);
if (wjecCapabilityGraphErrors.length) {
  throw new Error(`Invalid WJEC capability graph: ${wjecCapabilityGraphErrors.join("; ")}`);
}
