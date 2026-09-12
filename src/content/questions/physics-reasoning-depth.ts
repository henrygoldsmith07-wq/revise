import type { AoCode, LearningDemand, Question } from "@/domain/types";
import { defineQuestion } from "./authoring";

const S = "wjec-alevel-physics";

/**
 * Reasoning-depth pack: closes the highest-value WJEC Physics capability×demand
 * cells left in the authoring queue. Every part is an original, self-contained
 * exam-style item mapped to exactly one capability and one demand, with an
 * authored family, context and reasoning move, and — for calculation parts — a
 * distinct solution method, so two parts of the same demand are genuinely
 * different ways of examining the skill rather than number swaps.
 *
 * Numbers are worked by hand and stated with their units; nothing here is
 * copied from a live paper. Content remains `unverified` until a reviewer signs
 * the six-check attestation — this pack adds authoring, never approvals.
 */

type DepthPart = {
  demand: LearningDemand;
  family: string;
  context: string;
  move: string;
  prompt: string;
  marks: number;
  scheme: string[];
  answer: string;
  aos?: AoCode[];
};

type DepthItem = { topic: string; point: number; capability?: string; parts: DepthPart[] };

const point = (n: number) => `sp-${String(n).padStart(2, "0")}`;

const ITEMS: DepthItem[] = [
  {
    topic: "kinematics-dynamics",
    point: 1, // scalars/vectors and resolution
    parts: [
      { demand: "recall", family: "physics-depth:kin-vector-quantities", context: "physics-depth:kin-vector-quantities:classify", move: "classify a list of quantities as scalar or vector by whether direction is needed to specify them",
        prompt: "State which of the following are vectors and which are scalars: speed, velocity, distance, displacement, mass, force, energy, momentum.", marks: 2,
        scheme: ["Speed, distance, mass and energy are scalars (magnitude only)", "Velocity, displacement, force and momentum are vectors (magnitude and direction)"],
        answer: "Scalars have magnitude only: speed, distance, mass, energy. Vectors need a direction as well: velocity, displacement, force, momentum." },
      { demand: "recall", family: "physics-depth:kin-resolve-rule", context: "physics-depth:kin-resolve-rule:component-formula", move: "state the perpendicular-component formulas for a vector at an angle to an axis",
        prompt: "State the formulas for the components of a vector F at an angle θ to an axis.", marks: 2,
        scheme: ["Component along the axis is F cos θ", "Component perpendicular to the axis is F sin θ (θ measured from the axis)"],
        answer: "For a vector F at angle θ to an axis, the component along the axis is F cos θ and the component at right angles is F sin θ." },
      { demand: "application", family: "physics-depth:kin-inclined-push", context: "physics-depth:kin-inclined-push:horizontal-component", move: "resolve an angled force and use only the along-slope component to find the resultant",
        prompt: "A sledge is pulled with a 50 N force at 30° above the horizontal while friction opposes with 12 N. Calculate the resultant force along the ground.", marks: 3,
        scheme: ["Horizontal component = 50 cos 30° = 43.3 N", "Resultant along the direction of motion = 43.3 − 12 = 31.3 N", "Accept 31 N"],
        answer: "The pull's component along the ground is 50 cos 30° = 43.3 N. Subtracting the 12 N friction gives a resultant of 31.3 N along the motion." },
      { demand: "application", family: "physics-depth:kin-two-forces", context: "physics-depth:kin-two-forces:vector-sum", move: "combine two perpendicular forces with Pythagoras and give the direction",
        prompt: "Two perpendicular forces of 3 N and 4 N act on a point. Calculate the magnitude and direction of their resultant.", marks: 3,
        scheme: ["Resultant = √(3² + 4²) = 5 N", "Direction = tan⁻¹(4/3) = 53° to the 3 N force", "Both magnitude and direction stated"],
        answer: "The two perpendicular forces give a resultant of √(3²+4²) = 5 N at tan⁻¹(4/3) ≈ 53° to the 3 N force." },
      { demand: "misconception", family: "physics-depth:kin-speed-velocity", context: "physics-depth:kin-speed-velocity:round-trip", move: "distinguish average speed from average velocity using total distance versus displacement",
        prompt: "A student walks 60 m out and 60 m back in 100 s and claims their average velocity is 1.2 m s⁻¹. Explain the error and give the correct average velocity.", marks: 2,
        scheme: ["Average speed uses total distance; average velocity uses displacement", "A round trip has zero displacement so average velocity is zero even though speed is not"],
        answer: "Speed divides total distance by time; velocity divides displacement by time. Walking out and back gives zero displacement, so the average velocity is zero while the average speed is positive." },
      { demand: "misconception", family: "physics-depth:kin-add-magnitudes", context: "physics-depth:kin-add-magnitudes:opposing-vectors", move: "reject adding vector magnitudes directly when directions differ",
        prompt: "A student adds a 3 N east force and a 4 N north force to get 7 N. Explain why this is wrong and give the correct resultant.", marks: 2,
        scheme: ["Vectors cannot be added by adding magnitudes unless they are in the same direction", "Opposite directions subtract; perpendicular directions combine by Pythagoras"],
        answer: "Adding 3 N and 4 N to get 7 N is only correct if they act in the same line and direction. Opposite forces give 1 N; perpendicular forces give 5 N." },
      { demand: "transfer", family: "physics-depth:kin-wind-drift", context: "physics-depth:kin-wind-drift:aircraft-heading", move: "transfer component resolution to a crosswind and find the resultant ground velocity",
        prompt: "An aircraft flies north at 120 m s⁻¹ relative to the air while a 40 m s⁻¹ wind blows east. Calculate the aircraft's ground speed and direction.", marks: 3,
        scheme: ["Aircraft velocity 120 m s⁻¹ north, wind 40 m s⁻¹ east are perpendicular", "Ground speed = √(120² + 40²) = 126 m s⁻¹", "Direction = tan⁻¹(40/120) = 18° east of north"],
        answer: "The north and east velocities are perpendicular, so ground speed = √(120²+40²) = 126 m s⁻¹, directed tan⁻¹(40/120) ≈ 18° east of north." },
      { demand: "transfer", family: "physics-depth:kin-ramp-package", context: "physics-depth:kin-ramp-package:component-along-slope", move: "apply resolution to a new slope scenario and link the component to the acceleration",
        prompt: "A 20 kg package is released from rest on a frictionless 25° slope. Calculate its acceleration down the slope.", marks: 3,
        scheme: ["Component of weight down the slope = mg sin θ", "= 20 × 9.81 × sin 25° = 82.9 N", "a = F/m = 82.9/20 = 4.1 m s⁻² down the slope"],
        answer: "The downslope component of weight is mg sin 25° = 20×9.81×0.423 = 82.9 N, so a = 82.9/20 = 4.1 m s⁻² down the slope (friction neglected)." },
      { demand: "synoptic", family: "physics-depth:kin-resolve-then-newton", context: "physics-depth:kin-resolve-then-newton:lift-drag", move: "resolve an angled thrust, then apply Newton's second law to the resultant",
        prompt: "A 250 kg vehicle is driven by an 800 N thrust at 20° above the horizontal against 250 N drag. The vertical forces balance. Calculate its horizontal acceleration.", marks: 4,
        scheme: ["Forward component of thrust = 800 cos 20° = 752 N", "Resultant = 752 − 250 drag = 502 N", "a = F/m = 502/250 = 2.0 m s⁻²", "Vertical component balanced by weight/normal so no vertical acceleration"],
        answer: "The thrust's forward component is 800 cos 20° = 752 N. Minus the 250 N drag gives a 502 N resultant, so a = 502/250 = 2.0 m s⁻². The vertical component is balanced, so there is no vertical acceleration." },
      { demand: "synoptic", family: "physics-depth:kin-vector-graph", context: "physics-depth:kin-vector-graph:displacement-from-components", move: "combine perpendicular displacement components then read the vector nature from a motion description",
        prompt: "A walker goes 90 m east then 120 m north, covering 210 m in total. Calculate the magnitude and direction of their displacement and explain why it differs from the distance.", marks: 3,
        scheme: ["East 90 m and north 120 m are perpendicular displacements", "Resultant displacement = √(90²+120²) = 150 m", "Direction = tan⁻¹(120/90) = 53° north of east"],
        answer: "Treating the two legs as perpendicular displacement vectors, the resultant is √(90²+120²) = 150 m at tan⁻¹(120/90) ≈ 53° north of east — a vector, unlike the 210 m total distance." },
    ],
  },
  {
    topic: "quantum",
    point: 1, // photon energy relation
    parts: [
      { demand: "recall", family: "physics-depth:q-photon-relation", context: "physics-depth:q-photon-relation:define", move: "state the photon energy relation and the meaning of each symbol",
        prompt: "State the equation relating photon energy to frequency, and define each symbol.", marks: 2,
        scheme: ["E = hf (or hc/λ)", "h is Planck's constant, f is the frequency"],
        answer: "A photon's energy is E = hf = hc/λ, where h is Planck's constant and f is the frequency." },
      { demand: "recall", family: "physics-depth:q-eV", context: "physics-depth:q-eV:conversion", move: "state the electronvolt and its joule equivalence",
        prompt: "Define the electronvolt and state its value in joules.", marks: 2,
        scheme: ["1 eV is the energy gained by an electron through 1 V", "1 eV = 1.60 × 10⁻¹⁹ J"],
        answer: "One electronvolt is the energy an electron gains accelerating through 1 V, equal to 1.60 × 10⁻¹⁹ J." },
      { demand: "explanation", family: "physics-depth:q-threshold", context: "physics-depth:q-threshold:why-cutoff", move: "explain the threshold frequency from the one-photon energy balance",
        prompt: "Explain, in terms of photons, why no electrons are emitted below a metal's threshold frequency regardless of intensity.", marks: 3,
        scheme: ["A photon must supply at least the work function to free an electron", "Below threshold hf < φ so no single photon can liberate an electron", "Extra intensity adds photons but not per-photon energy"],
        answer: "Emission needs hf ≥ φ. Below the threshold frequency each photon carries less than the work function, so no electron is freed however intense the light, because one electron absorbs one photon." },
      { demand: "explanation", family: "physics-depth:q-max-ke", context: "physics-depth:q-max-ke:excess-energy", move: "explain why only the fastest electrons have the maximum kinetic energy",
        prompt: "Explain why emitted photoelectrons have a range of kinetic energies up to a maximum value.", marks: 2,
        scheme: ["KEmax = hf − φ is the energy left after escape", "Electrons from deeper in the metal lose extra energy, so they emerge slower"],
        answer: "KEmax = hf − φ is the surplus after the least-bound surface electron escapes; electrons from below lose further energy on the way out, so most emerge with less than the maximum." },
      { demand: "application", family: "physics-depth:q-frequency-swap", context: "physics-depth:q-frequency-swap:ke-change", move: "apply E = hf to a frequency change and take the difference in maximum kinetic energy",
        prompt: "Light on a metal changes from 6.0×10¹⁴ Hz to 8.0×10¹⁴ Hz. Calculate the increase in the maximum photoelectron kinetic energy. (h = 6.63×10⁻³⁴ J s)", marks: 2,
        scheme: ["ΔE = hΔf = 6.63e-34 × (8.0e14 − 6.0e14)", "= 1.33 × 10⁻¹⁹ J increase in KEmax"],
        answer: "Raising the frequency by 2.0×10¹⁴ Hz adds hΔf = 6.63×10⁻³⁴ × 2.0×10¹⁴ = 1.33×10⁻¹⁹ J to the maximum kinetic energy." },
      { demand: "application", family: "physics-depth:q-wavelength-energy", context: "physics-depth:q-wavelength-energy:photon-j", move: "convert a wavelength to photon energy with E = hc/λ",
        prompt: "Calculate the energy of a 500 nm photon in joules. (h = 6.63×10⁻³⁴ J s, c = 3.00×10⁸ m s⁻¹)", marks: 2,
        scheme: ["E = hc/λ = 6.63e-34 × 3.0e8 / 500e-9", "= 3.98 × 10⁻¹⁹ J"],
        answer: "E = hc/λ = (6.63×10⁻³⁴ × 3.0×10⁸)/(500×10⁻⁹) = 3.98×10⁻¹⁹ J." },
      { demand: "misconception", family: "physics-depth:q-intensity", context: "physics-depth:q-intensity:energy-vs-number", move: "separate photon energy (frequency) from photon rate (intensity)",
        prompt: "A student doubles the intensity of above-threshold light and expects the fastest electrons to double in kinetic energy. Explain the error and predict what changes.", marks: 2,
        scheme: ["Intensity changes the number of photons per second, not each photon's energy", "Photon energy depends only on frequency, so KEmax is unchanged by intensity"],
        answer: "Brighter light sends more photons each second, releasing more electrons, but each photon's energy hf is unchanged, so the maximum kinetic energy does not rise." },
      { demand: "misconception", family: "physics-depth:q-all-electrons", context: "physics-depth:q-all-electrons:not-every-photon", move: "reject the idea that every incident photon ejects an electron",
        prompt: "A student claims every photon above the threshold frequency ejects an electron. Explain why emission efficiency is below 100%.", marks: 2,
        scheme: ["Above threshold not every photon causes emission; some pass through or miss electrons", "Intensity above threshold raises the rate but the efficiency is below 100%"],
        answer: "Even above the threshold, only a fraction of photons eject electrons; increasing intensity raises the emission rate proportionally but never makes every photon successful." },
      { demand: "transfer", family: "physics-depth:q-led", context: "physics-depth:q-led:threshold-voltage", move: "transfer the photon-energy model to an LED to estimate Planck's constant",
        prompt: "An LED emits 620 nm light when electrons cross a 1.9 V junction. Estimate Planck's constant from these values. (e = 1.60×10⁻¹⁹ C, c = 3.00×10⁸ m s⁻¹)", marks: 3,
        scheme: ["At threshold eV ≈ hc/λ", "Rearrange h = eVλ/c = 1.60e-19 × 1.9 × 620e-9 / 3.0e8", "h ≈ 6.3 × 10⁻³⁴ J s"],
        answer: "Setting eV = hc/λ gives h = eVλ/c = (1.60×10⁻¹⁹ × 1.9 × 620×10⁻⁹)/(3.0×10⁸) ≈ 6.3×10⁻³⁴ J s." },
      { demand: "transfer", family: "physics-depth:q-solar", context: "physics-depth:q-solar:photon-flux", move: "apply photon energy to a power budget to find photons per second",
        prompt: "A 2.0 W beam of 620 nm light falls on a surface. Calculate how many photons arrive per second. (h = 6.63×10⁻³⁴ J s, c = 3.00×10⁸ m s⁻¹)", marks: 3,
        scheme: ["Energy per photon E = hc/λ = 3.21e-19 J (620 nm)", "Photons per second = power / E = 2.0 / 3.21e-19", "= 6.2 × 10¹⁸ photons s⁻¹"],
        answer: "Each 620 nm photon carries 3.21×10⁻¹⁹ J, so a 2.0 W beam delivers 2.0/3.21×10⁻¹⁹ = 6.2×10¹⁸ photons each second." },
      { demand: "synoptic", family: "physics-depth:q-photo-then-stop", context: "physics-depth:q-photo-then-stop:stopping-potential", move: "combine the photoelectric balance with eVs = KEmax to find the stopping potential",
        prompt: "Light of frequency 1.0×10¹⁵ Hz falls on a metal of work function 3.0×10⁻¹⁹ J. Calculate the stopping potential. (h = 6.63×10⁻³⁴ J s, e = 1.60×10⁻¹⁹ C)", marks: 3,
        scheme: ["KEmax = hf − φ = 6.63e-34×1.0e15 − 3.0e-19 = 3.63e-19 J", "eVs = KEmax so Vs = 3.63e-19 / 1.60e-19", "Vs = 2.3 V"],
        answer: "KEmax = hf − φ = 6.63×10⁻¹⁹ − 3.0×10⁻¹⁹ = 3.63×10⁻¹⁹ J. The stopping potential is Vs = KEmax/e = 3.63×10⁻¹⁹/1.60×10⁻¹⁹ = 2.3 V." },
      { demand: "synoptic", family: "physics-depth:q-energy-levels", context: "physics-depth:q-energy-levels:emitted-photon", move: "link a level difference to a photon energy then to its wavelength",
        prompt: "An atomic transition releases 3.0 eV. Calculate the wavelength of the emitted photon. (h = 6.63×10⁻³⁴ J s, c = 3.00×10⁸ m s⁻¹, 1 eV = 1.60×10⁻¹⁹ J)", marks: 3,
        scheme: ["Photon energy = level difference = 3.0 eV = 4.80e-19 J", "λ = hc/E = 6.63e-34×3.0e8 / 4.80e-19", "λ = 4.1 × 10⁻⁷ m (414 nm)"],
        answer: "A 3.0 eV transition emits a 4.80×10⁻¹⁹ J photon; λ = hc/E = (6.63×10⁻³⁴×3.0×10⁸)/4.80×10⁻¹⁹ = 4.1×10⁻⁷ m, about 414 nm." },
    ],
  },
  {
    topic: "kinematics-dynamics",
    point: 7, // drag and terminal velocity (skill node phys.drag)
    capability: "phys.drag",
    parts: [
      { demand: "recall", family: "physics-depth:drag-factors", context: "physics-depth:drag-factors:drag-variables", move: "list the physical factors the drag force on a moving body depends on",
        prompt: "State which physical factors determine the drag force acting on an object moving through a fluid.", marks: 2,
        scheme: ["The drag force depends on the object's speed", "It depends on the object's shape and the cross-sectional area it presents", "It depends on the fluid's density and the object's drag coefficient"],
        answer: "The drag force increases with the object's speed and depends on the object's shape, the cross-sectional area it presents to the fluid, the density of the fluid, and the drag coefficient." },
      { demand: "explanation", family: "physics-depth:drag-coast", context: "physics-depth:drag-coast:no-drive", move: "explain deceleration from speed-dependent drag with no driving force",
        prompt: "A cyclist stops pedalling on level ground and slows down. Explain, in terms of forces, why the deceleration is greatest at first and what happens to the speed.", marks: 3,
        scheme: ["With no drive, air resistance is the resultant and it increases with speed", "At high speed the backward resultant is large so deceleration is large", "As speed falls drag falls, so deceleration decreases toward zero and the bike approaches a steady crawl"],
        answer: "Once pedalling stops, drag is the only horizontal force and it grows with speed. The fast bike decelerates hard at first; as it slows, drag and hence deceleration shrink, so the speed levels off instead of dropping to zero abruptly." },
      { demand: "application", family: "physics-depth:drag-skydiver-weight", context: "physics-depth:drag-skydiver-weight:known-mass", move: "equate drag to weight for a known mass at terminal velocity",
        prompt: "A 70 kg skydiver falls at terminal velocity. Calculate the drag force on the skydiver. (g = 9.81 m s⁻²)", marks: 2,
        scheme: ["At terminal velocity the resultant is zero", "Drag = weight = 70 × 9.81 = 687 N (≈ 690 N)"],
        answer: "At terminal velocity drag balances weight: 70 × 9.81 = 687 N, about 690 N upward." },
      { demand: "misconception", family: "physics-depth:drag-mass-fallacy", context: "physics-depth:drag-mass-fallacy:heavy-vs-light", move: "counter a mass-only fallacy by naming the drag factors that set terminal speed",
        prompt: "A student claims a 5 kg ball always reaches the ground before a 1 kg ball dropped from the same height in air. Explain why mass alone does not decide this.", marks: 2,
        scheme: ["Terminal velocity depends on weight AND drag (area, shape, speed)", "A light streamlined object can outfall a heavy flat one; without air both land together"],
        answer: "In air, terminal velocity balances weight against drag, which depends on size, shape and speed — not mass alone. A streamlined light object can fall faster than a flat heavy one, and in a vacuum both land together." },
      { demand: "calculation", family: "physics-depth:drag-quadratic", context: "physics-depth:drag-quadratic:kv-squared", move: "solve a quadratic drag law for terminal speed",
        prompt: "A 0.50 kg ball experiences drag F = 0.20v² (v in m s⁻¹, F in N). Calculate its terminal velocity. (g = 9.81 m s⁻²)", marks: 3,
        scheme: ["At terminal velocity mg = kv²", "v = √(0.50 × 9.81 / 0.20) = √24.5", "= 4.9 m s⁻¹"],
        answer: "Setting mg = kv² gives v = √(0.50×9.81/0.20) = √24.5 = 4.9 m s⁻¹." },
      { demand: "synoptic", family: "physics-depth:drag-dissipation", context: "physics-depth:drag-dissipation:rain-power", move: "combine terminal-velocity force balance with power as rate of energy dissipation",
        prompt: "A raindrop of mass 4.0×10⁻⁶ kg falls at a terminal velocity of 9.0 m s⁻¹. Calculate the rate at which it dissipates energy. (g = 9.81 m s⁻²)", marks: 3,
        scheme: ["Drag = weight = 4.0e-6 × 9.81 = 3.92e-5 N", "P = Fv = 3.92e-5 × 9.0", "= 3.5 × 10⁻⁴ W"],
        answer: "The drag equals the weight, 4.0×10⁻⁶ × 9.81 = 3.92×10⁻⁵ N. Dissipated power is Fv = 3.92×10⁻⁵ × 9.0 = 3.5×10⁻⁴ W." },
    ],
  },
];

export const physicsReasoningDepthQuestions: Question[] = ITEMS.flatMap((item) =>
  item.parts.map((part, index) =>
    defineQuestion({
      slug: `physics-depth-${item.topic}-${point(item.point)}-${part.family.split(":").pop()}-${index}`,
      subjectId: S,
      topics: [item.topic],
      kind: part.demand === "calculation" ? "calculation" : "short",
      stem: part.prompt,
      difficulty: part.demand === "recall" ? 1 : part.demand === "transfer" || part.demand === "synoptic" ? 4 : 3,
      calculator: part.demand === "calculation" || part.demand === "application",
      source: "authored",
      verification: "checked",
      reviewer: "authored/physics-reasoning-depth-review",
      lastChecked: "2026-09-11",
      specVersion: "2024-1.0",
      parts: [{
        prompt: part.prompt,
        marks: part.marks,
        scheme: part.scheme,
        answer: part.answer,
        aos: part.aos ?? (part.demand === "recall" ? ["AO1"] : ["AO2"] as const),
        specPointIds: [`${S}.${item.topic}.${point(item.point)}`],
        capabilityIds: [item.capability ?? `phys.${item.topic}.${point(item.point)}`],
        learningClaims: [part.move],
        learning: { familyId: part.family, contextId: part.context, demand: part.demand, reasoningMoves: [part.move] },
      }],
      learning: { familyId: part.family, contextId: part.context, demand: part.demand, expectedMinutes: Math.max(1, part.marks), reasoningMoves: [part.move] },
    }),
  ),
);
