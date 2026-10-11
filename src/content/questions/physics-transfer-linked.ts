import type { Question, QuestionPart, SetupFingerprint } from "@/domain/types";
import { fingerprintSetup, reasoningGraphForPart } from "@/domain/reasoning-graph";
import { defineQuestion } from "./authoring";
import { physicsCapacitorEnergyQuestions } from "./physics-capacitors.generated";
import { physicsDepth50CircuitsFieldsQuestions } from "./physics-depth-50-circuits-fields";
import { physicsDepth50MechanicsQuestions } from "./physics-depth-50-mechanics";
import { physicsDepthCompletionCircuitsMechanicsQuestions } from "./physics-depth-completion-circuits-mechanics";
import { physicsReasoningDepthQuestions } from "./physics-reasoning-depth";

// ---------------------------------------------------------------------------
// WJEC A-level Physics transfer items with an explicit, real baseline.
//
// Physics has 234 parts labelled "transfer" with no baseline link, so none of
// them can be approved as transfer (review gate
// `transfer-label-without-transfer`) and no statement meets the core bar.
// These are new, separately authored transfer items for statements
// `npm run wjec:authoring:plan -- physics` ranks first: alternating currents
// sp-01 and sp-03 (first batch), then capacitance sp-01..03 and circular
// motion / SHM sp-01..06 (second batch). A drafted sp-02 item (series RC
// crossover) was withheld: the repo's structural-novelty comparison rated it
// too close to its baseline, and an item that would fail the stricter check
// should not count here. Every item here passes that comparison against its
// baseline (`compareTransferStructures` on verified graphs). Each one:
//   - links to an EXISTING application/calculation part of the same
//     capability and statement (looked up below; the module throws if the
//     baseline ever disappears, so a link can never point at nothing);
//   - changes what is known and what is unknown (an inverse problem in an
//     unfamiliar setting), so the setup fingerprint differs from its baseline;
//   - has a worked answer and a point-per-mark scheme with checked numbers.
//
// Provenance is honest: `source: "generated"` (authored by an AI agent, so the
// gate warns the reviewer to confirm correctness and realism) and
// `verification: "unverified"`. Nothing here is approved; two independent
// teacher approvals are still required before any of it counts as proof.
// ---------------------------------------------------------------------------

const S = "wjec-alevel-physics";

function baselinePart(questions: readonly Question[], questionId: string, partIndex = 0): QuestionPart {
  const question = questions.find((q) => q.id === questionId);
  const part = question?.parts[partIndex];
  if (!question || !part) throw new Error(`Physics transfer baseline ${questionId} part ${partIndex} does not exist.`);
  return part;
}

interface LinkedTransfer {
  slug: string;
  topic: string;
  point: string;
  baseline: QuestionPart;
  family: string;
  context: string;
  move: string;
  prompt: string;
  scheme: string[];
  answer: string;
}

function linkedTransferQuestion(spec: LinkedTransfer): Question {
  const specPoint = `${S}.${spec.topic}.${spec.point}`;
  const capability = `phys.${spec.topic}.${spec.point}`;
  if (spec.baseline.capabilityIds?.length !== 1 || spec.baseline.capabilityIds[0] !== capability ||
    spec.baseline.specPointIds?.[0] !== specPoint ||
    (spec.baseline.learning?.demand !== "application" && spec.baseline.learning?.demand !== "calculation")) {
    throw new Error(`Physics transfer ${spec.slug}: baseline ${spec.baseline.id} is not an application/calculation part of ${capability}.`);
  }
  const draft: QuestionPart = {
    id: "draft", label: "", prompt: spec.prompt, marks: spec.scheme.length, markScheme: spec.scheme, modelAnswer: spec.answer,
    specPointIds: [specPoint], capabilityIds: [capability],
    learning: { familyId: spec.family, contextId: spec.context, demand: "transfer", reasoningMoves: [spec.move] },
  };
  const transferLink = {
    baselinePartId: spec.baseline.id,
    baselineSetupFingerprint: fingerprintSetup(spec.baseline.prompt) as SetupFingerprint,
    transferSetupFingerprint: fingerprintSetup(spec.prompt, spec.answer) as SetupFingerprint,
    baselineReasoningGraph: reasoningGraphForPart(spec.baseline, S),
    transferReasoningGraph: reasoningGraphForPart(draft, S),
  };
  return defineQuestion({
    slug: spec.slug,
    subjectId: S,
    topics: [spec.topic],
    kind: "calculation",
    stem: spec.prompt,
    difficulty: 4,
    calculator: true,
    source: "generated",
    verification: "unverified",
    reviewer: null,
    // Date the author checked the numbers and specification mapping. It is
    // not a review: reviewer stays null and verification stays unverified.
    lastChecked: "2026-10-10",
    specVersion: "2024-1.0",
    parts: [{
      prompt: spec.prompt,
      marks: spec.scheme.length,
      scheme: spec.scheme,
      answer: spec.answer,
      aos: ["AO2", "AO3"],
      specPointIds: [specPoint],
      capabilityIds: [capability],
      learningClaims: [spec.move],
      learning: { familyId: spec.family, contextId: spec.context, demand: "transfer", reasoningMoves: [spec.move], transferLink },
    }],
    learning: { familyId: spec.family, contextId: spec.context, demand: "transfer", expectedMinutes: 5, reasoningMoves: [spec.move] },
  });
}

export const physicsTransferLinkedQuestions: Question[] = [
  // sp-01 rms and peak values. Baseline: 230 V rms supply, 1.0 kW heater ->
  // rms and peak current. Transfer: only the peak voltage and an energy meter
  // reading are known; the learner must convert peak to rms and energy to
  // power before inverting P = VI and V = IR.
  linkedTransferQuestion({
    slug: "physics-transfer-ac-sp-01-logger-heater",
    topic: "alternating-currents",
    point: "sp-01",
    baseline: baselinePart(physicsReasoningDepthQuestions, "cnt:question:physics-depth-alternating-currents-sp-01-mains-bulb-power-4"),
    family: "physics-transfer:ac-rms-from-energy-log",
    context: "physics-transfer:ac-rms-from-energy-log:data-logger-heater",
    move: "convert a logged peak voltage and metered energy into rms current and resistance",
    prompt: "A data logger shows that the voltage across a resistive heating element is a sinusoid with a peak value of 170 V. A joulemeter in the circuit records 54 kJ transferred to the element in 60 s. Determine the rms current in the element and its resistance.",
    scheme: [
      "V_rms = V₀/√2 = 170/√2 = 120 V",
      "Mean power P = E/t = 54 000/60 = 900 W",
      "I_rms = P/V_rms = 900/120 = 7.5 A",
      "R = V_rms/I_rms (or V_rms²/P) = 16 Ω",
    ],
    answer: "Mean power uses rms values, so first V_rms = 170/√2 = 120.2 V. The meter gives P = 54 000 J/60 s = 900 W. Then I_rms = P/V_rms = 900/120.2 = 7.5 A, and R = V_rms/I_rms = 120.2/7.49 = 16 Ω. As a check, V_rms²/P = 14 450/900 also gives 16 Ω.",
  }),
  // sp-03 transformer ratios and transmission. Baseline: known power, voltage
  // and resistance -> cable loss. Transfer: the loss limit is given and the
  // learner must work back to the minimum transmission voltage and the
  // step-up turns ratio.
  linkedTransferQuestion({
    slug: "physics-transfer-ac-sp-03-wind-farm-line",
    topic: "alternating-currents",
    point: "sp-03",
    baseline: baselinePart(physicsDepth50CircuitsFieldsQuestions, "cnt:question:physics-depth50-alternating-currents-sp-03-transmission-current-8"),
    family: "physics-transfer:ac-minimum-transmission-voltage",
    context: "physics-transfer:ac-minimum-transmission-voltage:wind-farm",
    move: "work back from a permitted cable loss to the minimum transmission voltage and the step-up turns ratio",
    prompt: "A wind farm sends 2.0 MW into a transmission line of total resistance 5.0 Ω. The operator allows no more than 0.50% of this power to be lost in the line. The turbines generate at 690 V rms and an ideal step-up transformer feeds the line. Calculate the minimum transmission voltage and the turns ratio Ns/Np this requires.",
    scheme: [
      "Maximum loss = 0.0050 × 2.0×10⁶ = 1.0×10⁴ W",
      "I²R ≤ 1.0×10⁴ so I ≤ √(1.0×10⁴/5.0) = 45 A",
      "V = P/I = 2.0×10⁶/44.7 = 4.5×10⁴ V (45 kV)",
      "Ns/Np = Vs/Vp = 44 700/690 ≈ 65",
    ],
    answer: "The permitted loss is 0.0050 × 2.0 MW = 10 kW. Since P_loss = I²R, I ≤ √(10 000/5.0) = 44.7 A. Sending 2.0 MW at that current needs V = P/I = 2.0×10⁶/44.7 = 4.5×10⁴ V, about 45 kV, as a minimum. For an ideal transformer Ns/Np = Vs/Vp = 44 700/690 ≈ 65.",
  }),
  // ---- Second batch (2026-10-10, fourth pass): capacitance and circular
  // motion / SHM, the next statements `wjec:authoring:plan -- physics` ranks.
  // Every number below was recomputed in code before it was written down.

  // capacitance sp-01. Baseline: compare two plate capacitances by A/d ratio.
  // Transfer: C is not given; it must be found from a coulombmeter reading,
  // then inverted through C = ε₀A/d, then a dielectric applied.
  linkedTransferQuestion({
    slug: "physics-transfer-capacitance-sp-01-coulombmeter-plates",
    topic: "capacitance",
    point: "sp-01",
    baseline: baselinePart(physicsReasoningDepthQuestions, "cnt:question:physics-depth-capacitance-sp-01-plate-capacitance-compare-3"),
    family: "physics-transfer:capacitance-separation-from-charge",
    context: "physics-transfer:capacitance-separation-from-charge:coulombmeter",
    move: "find a capacitance from measured charge and p.d., invert C = ε₀A/d for the plate separation, then predict the effect of a dielectric",
    prompt: "Two square metal plates, each of area 0.040 m², are held parallel in air and connected to a 2.0 kV supply. A coulombmeter shows that 0.35 μC of charge is stored. Determine the separation of the plates. A sheet of polythene of relative permittivity 2.3 is then slid in to fill the gap while the supply stays connected. Calculate the charge now stored. (ε₀ = 8.85×10⁻¹² F m⁻¹)",
    scheme: [
      "C = Q/V = 0.35×10⁻⁶/2000 = 1.75×10⁻¹⁰ F",
      "d = ε₀A/C = 8.85×10⁻¹² × 0.040/1.75×10⁻¹⁰",
      "d = 2.0×10⁻³ m (2.0 mm)",
      "Dielectric multiplies C by 2.3 at the same V, so Q = 2.3 × 0.35 μC = 0.81 μC",
    ],
    answer: "The capacitance follows from the measurement: C = Q/V = 0.35×10⁻⁶ C / 2000 V = 1.75×10⁻¹⁰ F (175 pF). For a parallel-plate capacitor in air C = ε₀A/d, so d = ε₀A/C = (8.85×10⁻¹² × 0.040)/1.75×10⁻¹⁰ = 2.0×10⁻³ m, about 2.0 mm. Filling the gap with polythene multiplies the capacitance by εᵣ = 2.3; the supply holds V at 2.0 kV, so Q = CV rises by the same factor to 2.3 × 0.35 μC = 0.81 μC.",
  }),
  // capacitance sp-02. Baseline: C from the gradient of a U-against-V² line.
  // Transfer: a charge-p.d. record instead; the energy is the area under the
  // line (not a gradient), and the learner then works back from a fraction of
  // that energy to the remaining p.d. (The defibrillator ½CV² part was the
  // obvious baseline, but the baseline-integrity check flags its "two
  // significant figures" wording as a leak, so it was not used.)
  linkedTransferQuestion({
    slug: "physics-transfer-capacitance-sp-02-charge-pd-record",
    topic: "capacitance",
    point: "sp-02",
    baseline: baselinePart(physicsCapacitorEnergyQuestions, "cnt:question:physics-energy-infer-capacitance-from-slope"),
    family: "physics-transfer:capacitance-energy-from-q-v-area",
    context: "physics-transfer:capacitance-energy-from-q-v-area:charging-record",
    move: "use the area under a charge-p.d. line as stored energy, then work back from a fraction of that energy to the remaining p.d.",
    prompt: "While a capacitor is charged, a student records that the charge on it rises in direct proportion to the p.d. across it, reaching 6.0 mC when the p.d. is 12 V. Use the area under the charge-p.d. line to find the energy stored at 12 V, and find the capacitance. The capacitor then releases half of this stored energy to a motor. Calculate the p.d. across the capacitor afterwards.",
    scheme: [
      "Energy = area under Q-V line = ½QV = ½ × 6.0×10⁻³ × 12 = 0.036 J",
      "C = Q/V = 6.0×10⁻³/12 = 5.0×10⁻⁴ F (500 μF)",
      "Remaining energy 0.018 J = ½CV², so V² = 2 × 0.018/5.0×10⁻⁴ = 72",
      "V = 8.5 V (equivalently 12/√2, since E ∝ V²)",
    ],
    answer: "The work done charging is the area under the straight Q-V line, a triangle: E = ½QV = ½ × 6.0×10⁻³ C × 12 V = 0.036 J. The gradient gives C = Q/V = 6.0×10⁻³/12 = 5.0×10⁻⁴ F (500 μF). After half the energy is released, 0.018 J remains, so ½CV² = 0.018 gives V² = 2 × 0.018/5.0×10⁻⁴ = 72 V² and V = 8.5 V. Because stored energy is proportional to V², halving the energy divides the p.d. by √2 (12/√2 = 8.5 V), not by 2.",
  }),
  // capacitance sp-03. Baseline: two given capacitors in series, find C, Q
  // and each p.d. Transfer: a design problem — choose the arrangement of
  // identical rated capacitors that meets both a capacitance and a voltage
  // constraint, then the energy stored.
  linkedTransferQuestion({
    slug: "physics-transfer-capacitance-sp-03-rated-bank-design",
    topic: "capacitance",
    point: "sp-03",
    baseline: baselinePart(physicsReasoningDepthQuestions, "cnt:question:physics-depth-capacitance-sp-03-series-combo-calc-6"),
    family: "physics-transfer:capacitance-rated-bank-design",
    context: "physics-transfer:capacitance-rated-bank-design:pulse-bank",
    move: "design a series-parallel bank from identical rated capacitors to meet both a capacitance and a working-voltage constraint",
    prompt: "A pulse circuit needs a capacitor bank of total capacitance 6.0 μF that will be charged to 400 V. The only capacitors available are identical 4.0 μF capacitors, each rated at a maximum of 250 V. The bank must be built as identical series strings connected in parallel. Determine the smallest number of capacitors needed and how they are arranged, and calculate the energy stored in the bank at 400 V.",
    scheme: [
      "400 V across a string with each capacitor ≤ 250 V needs at least 2 in series (200 V each)",
      "A string of two 4.0 μF in series has C = 2.0 μF",
      "6.0 μF needs 3 such strings in parallel: 6 capacitors in total",
      "E = ½CV² = ½ × 6.0×10⁻⁶ × 400² = 0.48 J",
    ],
    answer: "The voltage rule fixes the strings: one capacitor would see 400 V, above its 250 V rating, so each string needs at least two in series, sharing 200 V each. Two equal 4.0 μF capacitors in series give 1/C = 1/4.0 + 1/4.0, so C = 2.0 μF per string. Parallel strings add, so 6.0 μF needs three strings: 3 × 2 = 6 capacitors. The bank stores E = ½CV² = ½ × 6.0×10⁻⁶ F × (400 V)² = 0.48 J.",
  }),
  // circular-shm sp-01. Baseline: rev min⁻¹ and radius -> ω and tip speed.
  // Transfer: ω must be built from a pulse count, and the unknown is the
  // radius, found from an independently measured linear speed.
  linkedTransferQuestion({
    slug: "physics-transfer-circular-shm-sp-01-cycle-sensor",
    topic: "circular-shm",
    point: "sp-01",
    baseline: baselinePart(physicsReasoningDepthQuestions, "cnt:question:physics-depth-circular-shm-sp-01-omega-from-revs-3"),
    family: "physics-transfer:circular-radius-from-pulse-count",
    context: "physics-transfer:circular-radius-from-pulse-count:cycle-computer",
    move: "build an angular velocity from a sensor pulse count, then use v = ωr in reverse to infer a radius",
    prompt: "A bicycle wheel carries 4 magnets equally spaced around it, and a fixed sensor gives one pulse each time a magnet passes. Riding at a steady speed, the cycle computer counts 40 pulses in 4.0 s while a GPS unit shows the bicycle moving at 5.3 m s⁻¹. Assuming the tyre does not slip, determine the angular velocity of the wheel and the radius of the wheel.",
    scheme: [
      "Revolutions per second f = (40/4)/4.0 = 2.5 s⁻¹",
      "ω = 2πf = 2π × 2.5 = 16 rad s⁻¹ (15.7)",
      "No slip: v = ωr, so r = v/ω",
      "r = 5.3/15.7 = 0.34 m",
    ],
    answer: "Four pulses make one revolution, so 40 pulses is 10 revolutions in 4.0 s: f = 2.5 revolutions per second. The angular velocity is ω = 2πf = 2π × 2.5 = 15.7 rad s⁻¹ (16 rad s⁻¹ to 2 s.f.). Without slipping, the bicycle's speed equals the tyre's rim speed, v = ωr, so r = v/ω = 5.3/15.7 = 0.34 m.",
  }),
  // circular-shm sp-02. Baseline: friction provides the centripetal force on
  // a flat bend. Transfer: the normal reaction provides it and friction must
  // hold the weight, so the inequality runs the other way (a minimum ω).
  linkedTransferQuestion({
    slug: "physics-transfer-circular-shm-sp-02-rotor-ride",
    topic: "circular-shm",
    point: "sp-02",
    baseline: baselinePart(physicsReasoningDepthQuestions, "cnt:question:physics-depth-circular-shm-sp-02-corner-acceleration-3"),
    family: "physics-transfer:circular-minimum-rate-wall-ride",
    context: "physics-transfer:circular-minimum-rate-wall-ride:rotor",
    move: "identify the normal reaction as the centripetal force and friction as the support against weight, then find the minimum angular velocity",
    prompt: "In a fairground 'rotor', riders stand against the inside wall of a vertical cylinder of radius 2.5 m. The cylinder spins and then the floor drops away. The coefficient of friction between a rider and the wall is 0.40. Find the minimum angular velocity, and the minimum rotation rate in revolutions per minute, for which riders do not slide down. (g = 9.81 m s⁻²)",
    scheme: [
      "The wall's normal reaction provides the centripetal force: N = mω²r",
      "Friction must support the weight: μN ≥ mg, so μmω²r ≥ mg",
      "ω ≥ √(g/(μr)) = √(9.81/(0.40 × 2.5)) = 3.1 rad s⁻¹",
      "Rate = 3.13/(2π) × 60 = 30 rev min⁻¹",
    ],
    answer: "The wall pushes inwards on the rider, so the normal reaction is the centripetal force: N = mω²r. Friction acts upwards and can be at most μN, and it must at least balance the weight: μmω²r ≥ mg. The mass cancels, giving ω ≥ √(g/(μr)) = √(9.81/(0.40 × 2.5)) = 3.13 rad s⁻¹ (3.1 rad s⁻¹). That is 3.13/(2π) = 0.50 revolutions per second, about 30 rev min⁻¹. Spinning faster increases N and so the friction available; the mass of the rider does not matter.",
  }),
  // circular-shm sp-03. Baseline: one (a, x) pair -> ω and T. Transfer: a
  // table of readings must be tested against the defining condition (a ∝ −x
  // with the same constant) before ω and f are extracted.
  linkedTransferQuestion({
    slug: "physics-transfer-circular-shm-sp-03-buoy-readings",
    topic: "circular-shm",
    point: "sp-03",
    baseline: baselinePart(physicsReasoningDepthQuestions, "cnt:question:physics-depth-circular-shm-sp-03-omega-from-measurements-6"),
    family: "physics-transfer:shm-test-defining-condition",
    context: "physics-transfer:shm-test-defining-condition:buoy-logger",
    move: "test a data table against a = −ω²x (sign and constant ratio) before extracting ω and the frequency",
    prompt: "An accelerometer inside a bobbing buoy logs its vertical displacement x from equilibrium and its acceleration a at three instants: x = +0.020 m, a = −0.79 m s⁻²; x = −0.010 m, a = +0.39 m s⁻²; x = +0.030 m, a = −1.18 m s⁻². Show that these readings are consistent with simple harmonic motion, and determine the frequency of the oscillation.",
    scheme: [
      "a/x = −39.5, −39.0 and −39.3 s⁻²: the same constant each time",
      "a is always opposite in sign to x and proportional to it, so a = −ω²x (SHM)",
      "ω² ≈ 39.3 s⁻², so ω = 6.3 rad s⁻¹",
      "f = ω/(2π) = 6.27/(2π) = 1.0 Hz",
    ],
    answer: "Dividing each acceleration by its displacement gives a/x = −0.79/0.020 = −39.5 s⁻², +0.39/−0.010 = −39.0 s⁻² and −1.18/0.030 = −39.3 s⁻². The ratio is the same within reading precision and always negative, so the acceleration is proportional to the displacement and directed towards equilibrium: a = −ω²x, the defining condition for SHM. Taking ω² ≈ 39.3 s⁻² gives ω = 6.27 rad s⁻¹, and f = ω/(2π) = 1.0 Hz.",
  }),
  // circular-shm sp-04. Baseline: A and T -> maximum speed. Transfer: only
  // the measured maxima of speed and acceleration are known; ω, T and A must
  // all be recovered from their ratio.
  linkedTransferQuestion({
    slug: "physics-transfer-circular-shm-sp-04-sensor-maxima",
    topic: "circular-shm",
    point: "sp-04",
    baseline: baselinePart(physicsDepth50MechanicsQuestions, "cnt:question:physics-depth50-circular-shm-sp-04-amplitude-speed-4"),
    family: "physics-transfer:shm-recover-from-maxima",
    context: "physics-transfer:shm-recover-from-maxima:motion-sensor",
    move: "recover ω, the period and the amplitude from measured maximum speed and maximum acceleration",
    prompt: "A motion sensor and an accelerometer are attached to a glider oscillating with simple harmonic motion. The largest speed recorded is 0.60 m s⁻¹ and the largest acceleration is 4.8 m s⁻². Neither the amplitude nor the period was measured directly. Determine the angular frequency, the period and the amplitude of the motion.",
    scheme: [
      "v_max = ωA and a_max = ω²A, so ω = a_max/v_max",
      "ω = 4.8/0.60 = 8.0 rad s⁻¹",
      "T = 2π/ω = 2π/8.0 = 0.79 s",
      "A = v_max/ω = 0.60/8.0 = 0.075 m",
    ],
    answer: "In SHM the maximum speed is v_max = ωA and the maximum acceleration is a_max = ω²A, so their ratio removes the amplitude: ω = a_max/v_max = 4.8/0.60 = 8.0 rad s⁻¹. The period is T = 2π/ω = 2π/8.0 = 0.79 s. The amplitude follows from A = v_max/ω = 0.60/8.0 = 0.075 m (check: ω²A = 64 × 0.075 = 4.8 m s⁻²).",
  }),
  // circular-shm sp-05. Baseline: mass and period -> spring constant.
  // Transfer: an unfamiliar context (no weight in orbit) where the unknown is
  // a mass, recovered from two periods and a calibration mass.
  linkedTransferQuestion({
    slug: "physics-transfer-circular-shm-sp-05-orbit-mass-chair",
    topic: "circular-shm",
    point: "sp-05",
    baseline: baselinePart(physicsDepthCompletionCircuitsMechanicsQuestions, "cnt:question:physics-depth50-circular-shm-sp-05-spring-period-5"),
    family: "physics-transfer:shm-mass-from-two-periods",
    context: "physics-transfer:shm-mass-from-two-periods:orbit-mass-chair",
    move: "calibrate a spring from a known mass and period, then invert T = 2π√(m/k) to find an unknown mass where weighing is impossible",
    prompt: "On a space station, bathroom scales cannot measure an astronaut's mass, so a chair mounted on springs is used instead. The empty chair, of mass 12 kg, oscillates with period 0.90 s. With an astronaut strapped in, the period is 2.2 s. Explain why scales do not work in orbit, and calculate the astronaut's mass.",
    scheme: [
      "Astronaut and scales are in free fall together, so there is no contact force to read (apparent weightlessness)",
      "k = 4π²m/T² = 4π² × 12/0.90² = 585 N m⁻¹",
      "Total mass = kT²/(4π²) = 585 × 2.2²/(4π²) = 72 kg",
      "Astronaut's mass = 72 − 12 = 60 kg",
    ],
    answer: "Scales read the contact force needed to support you; in orbit the astronaut and the scales are both in free fall, so there is no supporting force and the reading is zero. A mass-spring oscillator depends on inertia, not weight: T = 2π√(m/k). The empty chair calibrates the springs: k = 4π²m/T² = 4π² × 12/0.90² = 585 N m⁻¹. With the astronaut, the total mass is kT²/(4π²) = 585 × 2.2²/(4π²) = 71.7 kg, so the astronaut's mass is 71.7 − 12 = 60 kg.",
  }),
  // circular-shm sp-06. Baseline: speed at one displacement from k, A and m.
  // Transfer: k and A are both unknown; two (x, v) readings and energy
  // conservation determine them.
  linkedTransferQuestion({
    slug: "physics-transfer-circular-shm-sp-06-two-readings",
    topic: "circular-shm",
    point: "sp-06",
    baseline: baselinePart(physicsDepthCompletionCircuitsMechanicsQuestions, "cnt:question:physics-depth50-circular-shm-sp-06-speed-4"),
    family: "physics-transfer:shm-energy-two-readings",
    context: "physics-transfer:shm-energy-two-readings:trolley-springs",
    move: "use conservation of kinetic plus elastic potential energy between two readings to find an unknown spring constant and amplitude",
    prompt: "A 0.50 kg trolley held between springs oscillates horizontally with negligible friction. A light gate shows its speed is 0.30 m s⁻¹ when it is 0.040 m from equilibrium and 0.10 m s⁻¹ when it is 0.080 m from equilibrium. Using the conservation of energy, determine the effective spring constant and the amplitude of the oscillation.",
    scheme: [
      "Total energy is constant: ½mv₁² + ½kx₁² = ½mv₂² + ½kx₂²",
      "k = m(v₁² − v₂²)/(x₂² − x₁²) = 0.50 × 0.080/0.0048 = 8.3 N m⁻¹",
      "At the amplitude all energy is elastic: ½kA² = ½mv₁² + ½kx₁²",
      "A² = 0.040² + 0.50 × 0.30²/8.33 = 0.0070 m², so A = 0.084 m",
    ],
    answer: "With no friction, kinetic plus elastic potential energy is constant, so ½mv₁² + ½kx₁² = ½mv₂² + ½kx₂². Rearranging, k = m(v₁² − v₂²)/(x₂² − x₁²) = 0.50 × (0.090 − 0.010)/(0.0064 − 0.0016) = 0.040/0.0048 = 8.3 N m⁻¹. At the amplitude the trolley is momentarily at rest, so ½kA² = ½mv₁² + ½kx₁², giving A² = 0.040² + 0.50 × 0.30²/8.33 = 0.0016 + 0.0054 = 0.0070 m² and A = 0.084 m. The second reading gives the same value (0.0064 + 0.0006 = 0.0070 m²), confirming it.",
  }),
  // ---- Third batch (2026-10-10, fifth pass): electric circuits and
  // electromagnetic induction, the next statements `wjec:authoring:plan --
  // physics` ranks. Every number below was recomputed in code first.

  // electric-circuits sp-02. Baseline: known resistor network -> currents.
  // Transfer: the unknown is a component (a thermistor) found from a logged
  // p.d., then the loading effect of a low-resistance voltmeter is predicted.
  linkedTransferQuestion({
    slug: "physics-transfer-circuits-sp-02-sensor-loading",
    topic: "electric-circuits",
    point: "sp-02",
    baseline: baselinePart(physicsReasoningDepthQuestions, "cnt:question:physics-depth-electric-circuits-sp-02-resistor-network-solve-3"),
    family: "physics-transfer:circuits-divider-inverse-and-loading",
    context: "physics-transfer:circuits-divider-inverse-and-loading:thermistor-sensor",
    move: "work back from a measured divider output to an unknown resistance, then predict how a meter's own resistance changes the reading",
    prompt: "A temperature sensor uses a 9.0 V battery of negligible internal resistance, a fixed 2.2 kΩ resistor and a thermistor in series. A data logger of very high resistance connected across the fixed resistor reads 3.3 V. Determine the resistance of the thermistor. The logger is then replaced by a cheap voltmeter whose resistance is 2.2 kΩ. Calculate the reading on the voltmeter.",
    scheme: [
      "Current I = V/R = 3.3/2200 = 1.5×10⁻³ A (same through the thermistor)",
      "Thermistor p.d. = 9.0 − 3.3 = 5.7 V, so R = 5.7/1.5×10⁻³ = 3.8 kΩ",
      "Voltmeter in parallel with 2.2 kΩ gives 1.1 kΩ; total resistance = 1.1 + 3.8 = 4.9 kΩ",
      "Reading = 9.0 × 1.1/4.9 = 2.0 V (the meter loads the circuit)",
    ],
    answer: "The logger draws no current, so the series current is I = 3.3 V/2200 Ω = 1.5×10⁻³ A. The thermistor takes the rest of the emf, 9.0 − 3.3 = 5.7 V, so its resistance is 5.7/1.5×10⁻³ = 3800 Ω = 3.8 kΩ. A 2.2 kΩ voltmeter across the 2.2 kΩ resistor makes a parallel combination of 1.1 kΩ, so the circuit totals 1.1 + 3.8 = 4.9 kΩ and the meter reads 9.0 × 1.1/4.9 = 2.0 V, well below 3.3 V, because the meter itself has changed the circuit.",
  }),
  // electric-circuits sp-04 was drafted (fixed 40 W from a 12 V, 0.80 Ω
  // battery: P = ε²R/(R + r)² gives R = 1.6 Ω or 0.40 Ω, chosen on
  // efficiency) and withheld. The structural-novelty comparison rated it not
  // novel against its baseline (internal-loss-8): on Physics the derived
  // reasoning graphs are almost empty, because the graph families are
  // word-based, so the comparison cannot see the quadratic inverse step. An
  // item that fails the check does not count here, and it was not reworded
  // to satisfy the heuristic.
  // electromagnetic-induction sp-01. Baseline: known B, N, A and time ->
  // mean emf and charge. Transfer: B is the unknown, found from the charge a
  // search coil drives (Q = NΔΦ/R, independent of time), then a 180° turn.
  linkedTransferQuestion({
    slug: "physics-transfer-induction-sp-01-search-coil",
    topic: "electromagnetic-induction",
    point: "sp-01",
    baseline: baselinePart(physicsReasoningDepthQuestions, "cnt:question:physics-depth-electromagnetic-induction-sp-01-coil-pullout-emf-6"),
    family: "physics-transfer:induction-field-from-search-coil-charge",
    context: "physics-transfer:induction-field-from-search-coil-charge:magnet-gap",
    move: "infer a magnetic flux density from the charge a search coil drives when its flux linkage changes, and explain why the charge does not depend on time",
    prompt: "To measure the field between the poles of a magnet, a 400-turn search coil of area 1.2×10⁻⁴ m² is placed with its plane perpendicular to the field and connected to a charge meter. The total resistance of the circuit is 60 Ω. When the coil is pulled quickly out of the field, the meter records 64 μC. Determine the magnetic flux density. Explain why the speed of removal does not affect the reading, and calculate the charge recorded if the coil had instead been turned through 180° while staying in the field.",
    scheme: [
      "Mean emf = NΔΦ/Δt and I = emf/R, so Q = IΔt = NΔΦ/R (Δt cancels)",
      "ΔΦ = BA, so B = QR/(NA) = 64×10⁻⁶ × 60/(400 × 1.2×10⁻⁴)",
      "B = 0.080 T",
      "A 180° turn reverses the flux: ΔΦ = 2BA, so Q = 2 × 64 = 128 μC (1.3×10⁻⁴ C)",
    ],
    answer: "The induced emf is the rate of change of flux linkage, ε = NΔΦ/Δt, and drives I = ε/R. The charge is Q = IΔt = NΔΦ/R: the time cancels, so a faster pull gives a bigger current for a shorter time but the same charge. Removing the coil changes its flux by BA, so B = QR/(NA) = (64×10⁻⁶ × 60)/(400 × 1.2×10⁻⁴) = 3.84×10⁻³/0.048 = 0.080 T. Turning the coil through 180° takes its flux from +BA to −BA, a change of 2BA, so the meter would record twice the charge, 128 μC (1.3×10⁻⁴ C).",
  }),
];
