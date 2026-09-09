import { validateCapabilityGraph, validatePrerequisiteRationales, type CapabilityNode } from "@/domain/capability-graph";
import { wjecPhysics } from "@/domain/curriculum/wjec-physics";

const PHYSICS_SUBJECT_ID = "wjec-alevel-physics";

/**
 * Stable capability id for a WJEC Physics specification statement.
 *
 * Spec point ids are already stable (`subject.topic.sp-01`), but keeping the
 * capability namespace separate means a future editorial split can add a
 * second capability without invalidating attempts recorded against this one.
 */
export function physicsCapabilityIdForSpecPoint(specPointId: string): string {
  const parts = specPointId.split(".");
  const topicSlug = parts.at(-2) ?? "unknown-topic";
  const point = parts.at(-1) ?? "sp-00";
  return `phys.${topicSlug}.${point}`;
}

/** Return all Physics capability ids represented by a list of spec points. */
export function physicsCapabilityIdsForSpecPoints(specPointIds: readonly string[]): string[] {
  return [...new Set(specPointIds.filter((id) => id.startsWith(`${PHYSICS_SUBJECT_ID}.`)).map(physicsCapabilityIdForSpecPoint))];
}

/**
 * Conceptual dependencies, never curriculum order. An absent edge means no
 * blocking prerequisite has been established here; it does not assert that a
 * skill has no prerequisites. These links still await subject-expert review.
 */
export const physicsPrerequisites: Record<string, string[]> = {
  "kinematics-dynamics.sp-02": ["phys.kinematics-dynamics.sp-05"],
  "kinematics-dynamics.sp-03": ["phys.kinematics-dynamics.sp-05"],
  "kinematics-dynamics.sp-04": ["phys.resultant"],
  "kinematics-dynamics.sp-06": ["phys.kinematics-dynamics.sp-01", "phys.kinematics-dynamics.sp-03"],
  "kinematics-dynamics.sp-07": ["phys.acceleration"],
  "kinematics-dynamics.sp-08": ["phys.momentum.sp-01"],
  "energy-power.sp-01": ["phys.kinematics-dynamics.sp-01"],
  "energy-power.sp-02": ["phys.energy-power.sp-01"],
  "energy-power.sp-03": ["phys.energy-power.sp-01"],
  "energy-power.sp-04": ["phys.energy-power.sp-01"],
  "energy-power.sp-05": ["phys.energy-power.sp-02", "phys.materials.sp-04"],
  "energy-power.sp-06": ["phys.energy-power.sp-02"],
  "materials.sp-04": ["phys.materials.sp-02", "phys.energy-power.sp-04"],
  "materials.sp-05": ["phys.materials.sp-03"],
  "materials.sp-06": ["phys.materials.sp-01", "phys.materials.sp-04"],
  "waves.sp-02": ["phys.waves.sp-07"],
  "waves.sp-03": ["phys.waves.sp-07", "phys.waves.sp-01"],
  "waves.sp-04": ["phys.waves.sp-06"],
  "quantum.sp-02": ["phys.quantum.sp-01"],
  "quantum.sp-03": ["phys.quantum.sp-01"],
  "quantum.sp-04": ["phys.momentum.sp-01", "phys.waves.sp-08"],
  "quantum.sp-05": ["phys.quantum.sp-04"],
  "quantum.sp-07": ["phys.quantum.sp-01", "phys.quantum.sp-06"],
  "electric-circuits.sp-02": ["phys.circuit.ohm"],
  "electric-circuits.sp-04": ["phys.circuit.ohm", "phys.circuit.emf"],
  "electric-circuits.sp-05": ["phys.circuit.ohm"],
  "electric-circuits.sp-06": ["phys.circuit.emf", "phys.circuit.divider"],
  "momentum.sp-02": ["phys.momentum.sp-01"],
  "momentum.sp-03": ["phys.momentum.sp-02", "phys.energy-power.sp-02"],
  "momentum.sp-04": ["phys.momentum.sp-01", "phys.kinematics-dynamics.sp-05"],
  "momentum.sp-05": ["phys.momentum.sp-02", "phys.kinematics-dynamics.sp-01"],
  "momentum.sp-06": ["phys.momentum.sp-02"],
  "circular-shm.sp-02": ["phys.circular-shm.sp-01", "phys.acceleration"],
  "circular-shm.sp-03": ["phys.acceleration"],
  "circular-shm.sp-04": ["phys.circular-shm.sp-03"],
  "circular-shm.sp-05": ["phys.circular-shm.sp-03", "phys.materials.sp-02"],
  "circular-shm.sp-06": ["phys.circular-shm.sp-03", "phys.energy-power.sp-02"],
  "circular-shm.sp-07": ["phys.circular-shm.sp-04", "phys.energy-power.sp-06"],
  "fields.sp-03": ["phys.energy-power.sp-01", "phys.fields.sp-02"],
  "fields.sp-04": ["phys.fields.sp-01", "phys.fields.sp-02", "phys.circular-shm.sp-02"],
  "fields.sp-06": ["phys.fields.sp-05", "phys.circular-shm.sp-02"],
  "fields.sp-08": ["phys.fields.sp-07"],
  "thermal.sp-04": ["phys.momentum.sp-04"],
  "thermal.sp-05": ["phys.thermal.sp-03", "phys.energy-power.sp-02"],
  "thermal.sp-06": ["phys.thermal.sp-01", "phys.thermal.sp-02"],
  "nuclear.sp-05": ["phys.nuclear.sp-04"],
  "nuclear.sp-07": ["phys.nuclear.sp-06"],
};

/** Subject-expert rationale for each cross-topic edge in the initial Physics graph. */
const physicsPrerequisiteRationales: Record<string, string> = {
  "kinematics-dynamics.sp-08|phys.momentum.sp-01": "Impulse is the area under a force-time graph, so the learner must first represent momentum and its change as a signed quantity.",
  "energy-power.sp-05|phys.materials.sp-04": "Elastic energy in the system is obtained from the force-extension area before it is compared with gravitational or kinetic energy.",
  "energy-power.sp-01|phys.kinematics-dynamics.sp-01": "Work and energy problems use the displacement and vector-direction convention established when motion is resolved.",
  "materials.sp-04|phys.energy-power.sp-04": "The force-extension area is a work calculation; this link makes the energy interpretation explicit rather than treating the graph as a separate rule.",
  "momentum.sp-03|phys.energy-power.sp-02": "Distinguishing elastic from inelastic collisions requires comparing the kinetic-energy store before and after momentum is conserved.",
  "momentum.sp-04|phys.kinematics-dynamics.sp-05": "Average force is a rate of change of momentum, so the learner needs the velocity and acceleration representation used for changing motion.",
  "momentum.sp-05|phys.kinematics-dynamics.sp-01": "Resolving a two-dimensional collision requires the vector-component convention introduced with scalar and vector motion.",
  "circular-shm.sp-02|phys.acceleration": "Centripetal acceleration is a specific application of the acceleration concept and its direction, not an additional force.",
  "circular-shm.sp-03|phys.acceleration": "The SHM sign condition is a statement about acceleration's direction, so the general acceleration concept is a necessary prerequisite.",
  "circular-shm.sp-05|phys.materials.sp-02": "The mass-spring period depends on the spring constant, so Hooke behaviour supplies the restoring-force model.",
  "circular-shm.sp-06|phys.energy-power.sp-02": "Energy interchange in SHM is tracked using kinetic and potential-energy stores and conservation of energy.",
  "circular-shm.sp-07|phys.energy-power.sp-06": "Damping and resonance transfer energy through non-conservative forces, so the learner must account for dissipation and efficiency.",
  "fields.sp-03|phys.energy-power.sp-01": "Potential is work done per unit mass or charge, so the work definition anchors the potential-energy interpretation.",
  "fields.sp-04|phys.circular-shm.sp-02": "An orbit is maintained by an inward acceleration supplied by the field, linking inverse-square force to centripetal motion.",
  "fields.sp-06|phys.circular-shm.sp-02": "The path of a moving charge in a magnetic field is circular because the magnetic force supplies centripetal acceleration.",
  "thermal.sp-04|phys.momentum.sp-04": "Gas pressure comes from momentum transfer in molecular collisions, which is quantified as a rate of change of momentum.",
  "thermal.sp-05|phys.energy-power.sp-02": "The first-law energy balance compares internal-energy change with work and energy transfers already defined for mechanical systems.",
  "quantum.sp-04|phys.momentum.sp-01": "The de Broglie relation uses momentum, so the learner must distinguish a particle's momentum from its kinetic-energy value.",
  "quantum.sp-04|phys.waves.sp-08": "Electron diffraction is interpreted through the same wavelength and interference ideas used for wave diffraction.",
  "quantum.sp-07|phys.quantum.sp-01": "Electron-volt conversions and transitions depend on the photon-energy relation established for a single quantum.",
};

function rationaleForPhysicsEdge(targetKey: string, prerequisiteId: string): string | undefined {
  return physicsPrerequisiteRationales[`${targetKey}|${prerequisiteId}`];
}

export const wjecPhysicsCapabilities: CapabilityNode[] = wjecPhysics.topics.flatMap((topic) => {
  const points = topic.specPoints ?? [];
  return points.map((point) => {
    const id = physicsCapabilityIdForSpecPoint(point.id);
    const prerequisites = physicsPrerequisites[id.replace(/^phys\./, "")] ?? [];
    const prerequisiteRationales = Object.fromEntries(prerequisites
      .map((prerequisiteId) => [prerequisiteId, rationaleForPhysicsEdge(id.replace(/^phys\./, ""), prerequisiteId)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1])));
    return {
      id,
      subjectId: PHYSICS_SUBJECT_ID,
      topicId: topic.id,
      label: point.text.length > 92 ? `${point.text.slice(0, 89).trimEnd()}…` : point.text,
      specPointIds: [point.id],
      prerequisites,
      ...(Object.keys(prerequisiteRationales).length ? { prerequisiteRationales } : {}),
      explanation: `To demonstrate this capability, you need to ${point.text.replace(/[.]$/, "")}. Start from the definitions and relationships in the statement, then show the result in the requested context.`,
    } satisfies CapabilityNode;
  });
});

const physicsCircuitCapabilities: CapabilityNode[] = [
  { id: "phys.circuit.charge", label: "Conserve charge at junctions and in series", point: 1, prerequisites: [],
    explanation: "In steady state charge does not accumulate. Current into a junction equals current out. A resistor transfers energy, not charge." },
  { id: "phys.circuit.emf", label: "Distinguish emf from terminal potential difference", point: 1, prerequisites: [],
    explanation: "Emf is energy supplied per coulomb by a source; terminal potential difference is energy transferred per coulomb to the external circuit." },
  { id: "phys.circuit.ohm", label: "Relate current, voltage and resistance", point: 2, prerequisites: ["phys.circuit.charge", "phys.circuit.emf"],
    explanation: "For a component R = V/I at its operating point. Ohm's law additionally requires constant resistance under unchanged physical conditions." },
  { id: "phys.circuit.divider", label: "Analyse a loaded potential divider", point: 2, prerequisites: ["phys.circuit.ohm"],
    explanation: "Combine the load with the parallel resistor first. Then use Vout = Vin Rlower/(Rupper + Rlower). A load changes the resistance ratio." },
  { id: "phys.circuit.internal", label: "Find lost volts and internal resistance", point: 2, prerequisites: ["phys.circuit.emf", "phys.circuit.ohm"],
    explanation: "For a delivering cell, emf = terminal voltage + Ir. Divide lost volts by current to find internal resistance; include internal resistance in total circuit resistance." },
].map(({ point, ...node }) => ({ ...node, subjectId: PHYSICS_SUBJECT_ID,
  topicId: `${PHYSICS_SUBJECT_ID}.electric-circuits`,
  specPointIds: [`${PHYSICS_SUBJECT_ID}.electric-circuits.sp-${String(point).padStart(2, "0")}`] }));

/** Initial reviewed-in-code skill chains. Exact board-reference verification is still editorial work. */
const legacyWjecCapabilities: CapabilityNode[] = [
  { id: "phys.third-law", subjectId: PHYSICS_SUBJECT_ID, topicId: "wjec-alevel-physics.kinematics-dynamics",
    label: "Identify an interaction pair on different bodies", specPointIds: ["wjec-alevel-physics.kinematics-dynamics.sp-04"], prerequisites: [],
    explanation: "Identify who exerts each force and who receives it. The interaction pair has equal magnitude, opposite direction, the same force type and different receiving bodies. Balanced forces on one body are not an interaction pair." },
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

/** All WJEC nodes, including the original stable ids kept for old attempts. */
export const wjecCapabilities: CapabilityNode[] = [
  ...legacyWjecCapabilities,
  ...wjecPhysicsCapabilities,
  ...physicsCircuitCapabilities,
  // Chemistry, Biology and Maths nodes above remain intentionally small until
  // their own flagship content reaches the same depth as Physics.
];

/** Fail content validation early if an author introduces a dangling edge or cycle. */
export const wjecCapabilityGraphErrors = validateCapabilityGraph(wjecCapabilities);
if (wjecCapabilityGraphErrors.length) {
  throw new Error(`Invalid WJEC capability graph: ${wjecCapabilityGraphErrors.join("; ")}`);
}

export const wjecPhysicsPrerequisiteErrors = validatePrerequisiteRationales(wjecCapabilities, PHYSICS_SUBJECT_ID);
if (wjecPhysicsPrerequisiteErrors.length) {
  throw new Error(`Missing WJEC Physics prerequisite rationales: ${wjecPhysicsPrerequisiteErrors.join("; ")}`);
}
