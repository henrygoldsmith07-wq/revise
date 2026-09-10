import type { AoCode, LearningDemand } from "@/domain/types";
import { defineQuestions, type PartSpec, type QuestionSpec } from "./authoring";

const SUBJECT = "wjec-alevel-physics";

const point = (topic: string, index: number) => `${SUBJECT}.${topic}.sp-${String(index).padStart(2, "0")}`;
const capability = (topic: string, index: number) => `phys.${topic}.sp-${String(index).padStart(2, "0")}`;

type QualityPartInput = {
  topic: string;
  point: number;
  demand: LearningDemand;
  family: string;
  context: string;
  prompt: string;
  marks: number;
  scheme: string[];
  answer: string;
  move: string;
  aos?: AoCode[];
  calculationRules?: PartSpec["calculationRules"];
};

/**
 * A quality pass for the eight WJEC Physics extension topics. These are
 * deliberately authored as complete evidence units: each part has one
 * specification statement, one capability, a named reasoning move and a
 * context fingerprint. They are drafts until a human approves every check.
 */
function qualityPart(input: QualityPartInput): PartSpec {
  return {
    prompt: input.prompt,
    marks: input.marks,
    scheme: input.scheme,
    answer: input.answer,
    aos: input.aos ?? (input.demand === "recall" ? ["AO1"] : ["AO2", "AO3"]),
    specPointIds: [point(input.topic, input.point)],
    capabilityIds: [capability(input.topic, input.point)],
    learning: {
      familyId: `physics-quality:${input.family}`,
      contextId: `physics-quality:${input.context}`,
      demand: input.demand,
      reasoningMoves: [input.move],
    },
    ...(input.calculationRules ? { calculationRules: input.calculationRules } : {}),
  };
}

const questions: QuestionSpec[] = [
  {
    slug: "physics-quality-capacitance-clinical-defibrillator",
    subjectId: SUBJECT,
    topics: ["capacitance"],
    kind: "structured",
    stem: "A portable defibrillator charges a capacitor and then discharges it through a controlled load. Use the stated model; show units in every numerical step.",
    difficulty: 4,
    calculator: true,
    source: "generated",
    verification: "unverified",
    parts: [
      qualityPart({ topic: "capacitance", point: 1, demand: "misconception", family: "capacitance:clinical", context: "capacitance:clinical:plate-area", prompt: "The plate separation is halved while the capacitor remains isolated. A student says the stored charge must halve. Explain what actually changes.", marks: 3, scheme: ["For an isolated capacitor charge remains constant", "Halving separation increases capacitance for the parallel-plate geometry", "V = Q/C therefore potential difference and stored energy change (energy falls when Q is fixed)"], answer: "No charge can enter or leave an isolated capacitor, so Q stays constant. Halving the separation increases C. Since V = Q/C, the potential difference falls; with Q fixed, E = Q²/(2C) also falls.", move: "separate the controlled variable from the charge constraint" }),
      qualityPart({ topic: "capacitance", point: 2, demand: "calculation", family: "capacitance:clinical", context: "capacitance:clinical:stored-energy", prompt: "A 180 μF capacitor is charged to 2.4 kV. Calculate the energy stored, showing the SI conversions and giving the answer to two significant figures with its unit.", marks: 3, scheme: ["Use U = ½CV²", "C = 180 × 10⁻⁶ F and V = 2400 V", "U = 518.4 J, giving 5.2 × 10² J to two significant figures"], answer: "U = ½CV². Convert C = 180 × 10⁻⁶ F and V = 2.4 × 10³ V. U = 0.5 × (180 × 10⁻⁶) × 2400² = 518.4 J = 5.2 × 10² J to two significant figures.", move: "carry SI prefixes through a squared voltage calculation" }),
      qualityPart({ topic: "capacitance", point: 3, demand: "transfer", family: "capacitance:clinical", context: "capacitance:clinical:parallel-safety", prompt: "Two identical 120 μF capacitors are placed in parallel to meet a pulse specification. A safety engineer instead proposes series connection. Decide which arrangement stores more energy at the same 2.0 kV supply and justify the decision.", marks: 3, scheme: ["Parallel capacitance is 240 μF; series capacitance is 60 μF", "At fixed supply voltage E = ½CV², so parallel stores four times as much energy", "Series capacitors share the voltage and are not equivalent to adding capacitance"], answer: "In parallel C = 120 + 120 = 240 μF; in series 1/C = 1/120 + 1/120, so C = 60 μF. At 2.0 kV, E is proportional to C, so the parallel bank stores four times the energy. Series connection would also divide the voltage between capacitors.", move: "combine topology, voltage sharing and the energy model" }),
      qualityPart({ topic: "capacitance", point: 4, demand: "synoptic", family: "capacitance:clinical", context: "capacitance:clinical:time-constant", prompt: "During a discharge the measured voltage is 37% of its initial value after 12 ms. The load resistance is 2.0 kΩ. Infer the capacitance and explain why 12 ms is not the time to reach zero voltage.", marks: 3, scheme: ["37% corresponds to one time constant τ = RC", "C = τ/R = 0.012 / 2000 = 6.0 μF", "The exponential approaches zero asymptotically; a time constant is a characteristic scale, not a finish time"], answer: "For a discharge V/V₀ = e^(−t/RC); 0.37 is the value at t = τ. Thus C = τ/R = 0.012/2000 = 6.0 × 10⁻⁶ F. The voltage approaches zero asymptotically, so it does not become exactly zero at 12 ms.", move: "read an exponential datum and connect it to the RC model" }),
    ],
  },
  {
    slug: "physics-quality-alternating-grid-filter",
    subjectId: SUBJECT,
    topics: ["alternating-currents"],
    kind: "structured",
    stem: "A grid-interface filter is tested with a sinusoidal source. Treat the components as ideal unless the question says otherwise.",
    difficulty: 5,
    calculator: true,
    source: "generated",
    verification: "unverified",
    parts: [
      qualityPart({ topic: "alternating-currents", point: 1, demand: "misconception", family: "alternating-currents:grid-filter", context: "alternating-currents:grid-filter:rms", prompt: "A meter reads 230 V on a sinusoidal supply. A student uses 230 V as the peak voltage in a heating calculation. Explain the error and find the peak value.", marks: 2, scheme: ["A normal AC voltmeter reports the rms value, not the peak", "V₀ = √2 Vᵣₘₛ = 325 V (approximately)"], answer: "The 230 V reading is the rms value, which gives the equivalent DC heating effect. The peak is V₀ = √2 × 230 ≈ 325 V.", move: "distinguish the instrument reading from the waveform maximum", aos: ["AO1", "AO2"] }),
      qualityPart({ topic: "alternating-currents", point: 2, demand: "calculation", family: "alternating-currents:grid-filter", context: "alternating-currents:grid-filter:reactance", prompt: "A 47 μF capacitor is connected to a 400 Hz supply. Calculate its capacitive reactance.", marks: 2, scheme: ["Use Xc = 1/(2πfC)", "Xc = 1/(2π × 400 × 47 × 10⁻⁶) = 8.47 Ω"], answer: "Xc = 1/(2πfC) = 1/[2π(400)(47 × 10⁻⁶)] = 8.47 Ω.", move: "substitute frequency and capacitance without losing the micro prefix", calculationRules: [{ kind: "accuracy", label: "Xc", expected: 8.47 }, { kind: "unit", label: "Xc", expected: 8.47, unitAliases: ["Ω"] }] }),
      qualityPart({ topic: "alternating-currents", point: 3, demand: "transfer", family: "alternating-currents:grid-filter", context: "alternating-currents:grid-filter:transmission", prompt: "A transmission line delivers 120 kW to a purely resistive load. Compare the cable loss when the rms voltage at the load is 20 kV and 200 kV, if the total cable resistance is 4.0 Ω. State why I = P/V is valid here.", marks: 4, scheme: ["For fixed power I = P/V", "Currents are 6.0 A and 0.60 A", "P_loss = I²R gives 144 W and 1.44 W", "The load is purely resistive, so current and voltage are in phase and rms values satisfy P = VI"], answer: "At 20 kV, I = 120000/20000 = 6.0 A and loss = 6.0² × 4.0 = 144 W. At 200 kV, I = 0.60 A and loss = 0.60² × 4.0 = 1.44 W. The purely resistive load has current in phase with voltage, so P = V_rms I_rms; the cable resistance is unchanged.", move: "link rms power, transformer action and resistive loss" }),
      qualityPart({ topic: "alternating-currents", point: 4, demand: "synoptic", family: "alternating-currents:grid-filter", context: "alternating-currents:grid-filter:resonance", prompt: "A series RLC filter has a narrow current peak at 1.2 kHz. Adding a resistor lowers and broadens the peak. Explain this observation and identify the role of the resistor.", marks: 3, scheme: ["At resonance inductive and capacitive reactances cancel", "The impedance is then mainly resistive, so current is greatest", "Increasing R increases damping, lowers the peak current and increases bandwidth (reduces selectivity)"], answer: "At resonance XL = XC, so the reactive parts cancel and the series impedance is smallest and mainly R; current is therefore greatest. Adding resistance increases damping, so the maximum current falls and the resonance curve broadens, reducing selectivity.", move: "read a response curve through impedance, cancellation and damping" }),
    ],
  },
  {
    slug: "physics-quality-medical-ultrasound-dose",
    subjectId: SUBJECT,
    topics: ["medical-physics"],
    kind: "structured",
    stem: "A hospital compares imaging methods for locating a suspected vascular blockage. Interpret the measurements and discuss the safety trade-off.",
    difficulty: 4,
    calculator: true,
    source: "generated",
    verification: "unverified",
    parts: [
      qualityPart({ topic: "medical-physics", point: 1, demand: "misconception", family: "medical-physics:vascular", context: "medical-physics:vascular:attenuation", prompt: "A patient is imaged with a higher tube voltage. A student says the image must have higher contrast because every X-ray photon has more energy. Correct the reasoning.", marks: 3, scheme: ["Higher photon energy generally reduces differential attenuation", "Contrast depends on the difference in attenuation between tissues and detector response", "Tube voltage, current and filtration affect both penetration and dose; higher energy does not guarantee higher contrast"], answer: "Increasing tube voltage raises the photon-energy distribution and usually increases penetration, but it can reduce the difference in attenuation between neighbouring tissues. Contrast depends on differential attenuation and detector processing; voltage, current and filtration must be chosen together because dose also changes.", move: "separate photon energy, attenuation contrast and dose" }),
      qualityPart({ topic: "medical-physics", point: 2, demand: "calculation", family: "medical-physics:vascular", context: "medical-physics:vascular:doppler", prompt: "An ultrasound echo returns 0.00040 s after a pulse enters tissue. Take the sound speed as 1540 m s⁻¹. Calculate the reflector depth.", marks: 2, scheme: ["The measured time is a round-trip time", "depth = vt/2 = 1540 × 0.00040 / 2 = 0.308 m"], answer: "The pulse travels to the reflector and back, so depth = vt/2 = 1540(4.0 × 10⁻⁴)/2 = 0.308 m, or 30.8 cm.", move: "recognise the round-trip geometry before substituting", calculationRules: [{ kind: "method", label: "depth", expected: 0.308, method: { operator: "/", operands: ["v", 2] } }, { kind: "accuracy", label: "depth", expected: 0.308 }, { kind: "unit", label: "depth", expected: 0.308, unitAliases: ["m"] }] }),
      qualityPart({ topic: "medical-physics", point: 3, demand: "transfer", family: "medical-physics:vascular", context: "medical-physics:vascular:mri", prompt: "A lesion is bright on a T2-weighted MRI scan but not on a standard X-ray. Explain how the two modalities produce different information and why the MRI result is not evidence of ionising radiation.", marks: 3, scheme: ["MRI detects signals from nuclear spins after radiofrequency excitation in a strong magnetic field", "Tissue relaxation and gradients create contrast", "X-rays are attenuated ionising photons; MRI uses non-ionising radiofrequency pulses and a static magnetic field"], answer: "MRI aligns nuclear spins in a strong field, excites them with radiofrequency pulses and uses relaxation times plus gradients to encode contrast. X-rays form an image through differential attenuation of ionising photons. A bright T2 signal therefore comes from spin relaxation, not from X-ray dose.", move: "transfer the contrast model between two imaging modalities" }),
      qualityPart({ topic: "medical-physics", point: 4, demand: "synoptic", family: "medical-physics:vascular", context: "medical-physics:vascular:tracer", prompt: "A PET tracer has a 110-minute half-life. The scan begins 55 minutes after injection. What fraction of the injected activity remains, and why is a short half-life both useful and limiting?", marks: 4, scheme: ["55 minutes is half a half-life", "Fraction remaining = 2^(-55/110) = 0.707 (about 71%)", "Short half-life reduces the time the patient remains radioactive", "It also limits scan time and requires rapid production, transport and acquisition"], answer: "The remaining fraction is 2^(−55/110) = 2^(−0.5) ≈ 0.707, so about 71% remains. A short half-life reduces the patient's residual dose, but activity falls quickly, leaving less time for transport and image collection and demanding reliable tracer logistics.", move: "combine exponential decay with a clinical decision" }),
    ],
  },
  {
    slug: "physics-quality-sports-impact",
    subjectId: SUBJECT,
    topics: ["sports-physics"],
    kind: "structured",
    stem: "A biomechanics team studies a sprinter's start and landing. Treat the centre of mass as a particle only where that assumption is stated.",
    difficulty: 4,
    calculator: true,
    source: "generated",
    verification: "unverified",
    parts: [
      qualityPart({ topic: "sports-physics", point: 1, demand: "misconception", family: "sports-physics:sprint", context: "sports-physics:sprint:projectile", prompt: "A coach claims that a ball launched at 30° and one launched at 60° must have the same range because sin(2θ) is the same. State the missing condition and explain why air resistance matters.", marks: 3, scheme: ["The equal-range result assumes the same launch speed and launch and landing heights", "It also assumes negligible air resistance", "Drag changes horizontal and vertical components and therefore breaks the simple symmetric result"], answer: "The result R = u²sin(2θ)/g requires equal launch and landing heights, the same launch speed and negligible air resistance. Drag removes horizontal and vertical momentum and couples the components, so complementary angles need not give equal ranges.", move: "identify the model assumptions before applying a remembered result" }),
      qualityPart({ topic: "sports-physics", point: 2, demand: "calculation", family: "sports-physics:sprint", context: "sports-physics:sprint:hip-moment", prompt: "A 650 N ground reaction acts 0.040 m perpendicular to a knee joint. A muscle acts with a 0.025 m moment arm. Calculate the muscle force needed for static balance.", marks: 3, scheme: ["Take moments about the knee", "Ground-reaction moment = 650 × 0.040 = 26.0 N m", "F_muscle = 26.0/0.025 = 1040 N"], answer: "For balance, F_muscle(0.025) = 650(0.040), so F_muscle = 26.0/0.025 = 1.04 × 10³ N.", move: "use perpendicular moment arms and a stated pivot", calculationRules: [{ kind: "method", label: "muscle moment", expected: 26, method: { operator: "*", operands: [650, 0.04] } }, { kind: "accuracy", label: "muscle force", expected: 1040 }, { kind: "unit", label: "muscle force", expected: 1040, unitAliases: ["N"] }] }),
      qualityPart({ topic: "sports-physics", point: 3, demand: "transfer", family: "sports-physics:sprint", context: "sports-physics:sprint:landing", prompt: "A 70 kg athlete's vertical speed changes from −4.0 m s⁻¹ to zero. Compare the average landing force if a mat increases stopping time from 0.05 s to 0.20 s. Include weight in the net-force calculation and take g = 9.81 m s⁻².", marks: 4, scheme: ["Change in momentum is m(0 − (−4.0)) = 280 kg m s⁻¹ upward", "Average net force is Δp/Δt: 5600 N or 1400 N", "The ground force is net force plus weight: about 6290 N or 2090 N", "The longer time reduces the average force and injury risk"], answer: "The upward change in momentum is 70 × 4.0 = 280 kg m s⁻¹. Net average force is 280/0.05 = 5600 N without the mat and 280/0.20 = 1400 N with it. Using g = 9.81 m s⁻², the ground force is net force + mg, giving 6286.7 N and 2086.7 N respectively (about 6290 N and 2090 N). Increasing stopping time reduces the average force.", move: "distinguish net force from contact force in a landing" }),
      qualityPart({ topic: "sports-physics", point: 4, demand: "synoptic", family: "sports-physics:sprint", context: "sports-physics:sprint:drag-test", prompt: "Design a short test to decide whether a new running suit reduces drag. State the measured variables, one control and how the data could distinguish a causal effect from a faster athlete.", marks: 4, scheme: ["Measure force or deceleration at matched speed and posture", "Control air density, suit area, body position, surface and protocol", "Randomise or repeat suit order with the same athlete or matched athletes", "Compare drag against speed with uncertainty; a repeatable difference at the same speed supports causation"], answer: "Use a force balance or coast-down test and record drag force (or deceleration) at several controlled speeds. Keep air density, frontal area, posture, track and equipment constant; randomise suit order and repeat. Plot drag against speed with uncertainty. A consistent difference at the same speed, replicated across runs, supports a suit effect rather than a faster athlete.", move: "turn a performance claim into a controlled causal comparison" }),
    ],
  },
  {
    slug: "physics-quality-energy-storage-claim",
    subjectId: SUBJECT,
    topics: ["energy-environment"],
    kind: "structured",
    stem: "A council compares a wind farm with a battery installation for a winter evening peak. Use energy, power and life-cycle evidence separately.",
    difficulty: 4,
    calculator: true,
    source: "generated",
    verification: "unverified",
    parts: [
      qualityPart({ topic: "energy-environment", point: 1, demand: "misconception", family: "energy-environment:peak", context: "energy-environment:peak:power-energy", prompt: "A report says a 100 MWh battery is a 100 MW source. Explain why the statement is incomplete and give the missing quantity needed for a one-hour peak.", marks: 2, scheme: ["MWh is an energy capacity; MW is a power or rate", "To deliver a one-hour 100 MW peak it needs at least 100 MWh usable energy, allowing for losses and reserve"], answer: "100 MWh describes stored energy, whereas 100 MW describes the rate of delivery. A one-hour 100 MW peak consumes 100 MWh of delivered energy, so extra capacity is needed for conversion losses and reserve.", move: "keep energy capacity and power rating dimensionally separate", aos: ["AO1", "AO2"] }),
      qualityPart({ topic: "energy-environment", point: 2, demand: "calculation", family: "energy-environment:peak", context: "energy-environment:peak:efficiency", prompt: "A storage system takes 240 MWh from the grid and returns 180 MWh. Its stored energy is the same at the start and end of this complete cycle. Calculate the round-trip efficiency and mean returned power over 3.0 h, then account for the energy not returned.", marks: 3, scheme: ["Efficiency = 180/240 = 0.75 = 75%", "Mean returned power = 180 MWh/3.0 h = 60 MW", "The remaining 60 MWh is dissipated to the surroundings; it is not retained because the stored energy returns to its starting value"], answer: "Efficiency = 180/240 = 0.75, or 75%. Mean returned power = 180/3.0 = 60 MW. The 60 MWh difference is transferred to the surroundings, mainly as thermal energy, since there is no net change in stored energy over the cycle.", move: "balance a complete energy cycle before calculating efficiency and mean power" }),
      qualityPart({ topic: "energy-environment", point: 3, demand: "transfer", family: "energy-environment:peak", context: "energy-environment:peak:dispatch", prompt: "The wind farm produces 180 MW at noon but 20 MW at the evening peak. The battery can discharge 80 MW for two hours. Explain what the battery can and cannot solve.", marks: 3, scheme: ["It can shift some energy from a surplus period to the peak", "80 MW for two hours supplies 160 MWh before losses", "It cannot cover a longer or larger deficit and does not remove the need for firm capacity or demand management"], answer: "The battery shifts energy from the midday surplus to the evening. Its maximum discharge contributes 80 MW for two hours, or 160 MWh before losses. It cannot cover deficits exceeding that power or duration, so other generation, interconnection or demand response may still be needed.", move: "apply a storage limit to a time-varying supply" }),
      qualityPart({ topic: "energy-environment", point: 4, demand: "synoptic", family: "energy-environment:peak", context: "energy-environment:peak:lifecycle", prompt: "Two technologies have operational carbon intensities of 10 and 20 g CO₂e kWh⁻¹, but construction adds 40 and 5 g CO₂e kWh⁻¹ respectively. Explain why ranking from operational figures alone can reverse a life-cycle conclusion, and name one uncertainty to report.", marks: 4, scheme: ["Life-cycle intensity includes construction, fuel, operation, decommissioning and recycling", "Totals are 50 and 25 g CO₂e kWh⁻¹ for the stated stages", "Operational-only ranking would choose the first technology but full accounting chooses the second", "Report uncertainty in lifetime output, material quantities, boundaries or emissions factors"], answer: "Adding the stated construction contributions gives 50 g CO₂e kWh⁻¹ for the first technology and 25 g CO₂e kWh⁻¹ for the second. Operational emissions alone would rank them the other way. A defensible comparison states the system boundary and uncertainty, for example lifetime capacity factor or the emissions factor for manufacturing.", move: "combine arithmetic with a declared life-cycle boundary" }),
    ],
  },
  {
    slug: "physics-quality-practical-graph-calibration",
    subjectId: SUBJECT,
    topics: ["practical-investigations"],
    kind: "structured",
    stem: "A student investigates the period of a pendulum while a digital timer has an unknown zero offset. Assess the method from the data, not from the intended theory alone.",
    difficulty: 4,
    calculator: true,
    source: "generated",
    verification: "unverified",
    parts: [
      qualityPart({ topic: "practical-investigations", point: 2, demand: "misconception", family: "practical-investigations:pendulum", context: "practical-investigations:pendulum:repeats", prompt: "A student repeats a timing measurement ten times and says this removes the timer's zero error. Explain which uncertainty repeats reduce and how a zero error should be checked.", marks: 3, scheme: ["Repeats and averaging reduce random uncertainty", "A fixed zero offset is systematic and remains in every result", "Check against a known interval or calibrate/reset the timer and record the correction"], answer: "Repeats reduce random scatter in the measured period but do not remove a fixed zero offset. Compare the timer with a known time signal or calibrate/reset it, then apply and document the correction.", move: "separate random variation from a shared systematic shift" }),
      qualityPart({ topic: "practical-investigations", point: 2, demand: "calculation", family: "practical-investigations:pendulum", context: "practical-investigations:pendulum:uncertainty", prompt: "A pendulum length is 0.800 ± 0.002 m. After correcting any timer zero offset, 20 complete cycles take 35.80 ± 0.20 s. Treat the cycle count as exact. Calculate the measured period, its absolute and percentage uncertainties, and explain whether the length uncertainty belongs in this calculation.", marks: 4, scheme: ["T = 35.80/20 = 1.790 s", "Absolute uncertainty ΔT = 0.20/20 = 0.010 s", "Percentage uncertainty = 100 × 0.010/1.790 = 0.56% (accept 0.6%)", "Length is not used in T = t/20, so its uncertainty does not contribute to this directly measured period"], answer: "T = 35.80/20 = 1.790 s. Dividing by the exact cycle count also divides the absolute uncertainty: ΔT = 0.20/20 = 0.010 s. Thus T = 1.790 ± 0.010 s and the percentage uncertainty is 100 × 0.010/1.790 = 0.56%. The length uncertainty would enter a period predicted from the pendulum equation, or g calculated using length, but not this directly timed period.", move: "propagate only the measured inputs used by the chosen equation" }),
      qualityPart({ topic: "practical-investigations", point: 3, demand: "transfer", family: "practical-investigations:pendulum", context: "practical-investigations:pendulum:linearise", prompt: "The theory predicts T² = (4π²/g)L. State what to plot, what the gradient represents and one check that would reveal a non-zero intercept problem.", marks: 3, scheme: ["Plot T² on the y-axis against L on the x-axis", "Gradient = 4π²/g, so g = 4π²/gradient", "A non-zero intercept or residual pattern indicates a length offset, finite amplitude or other systematic effect"], answer: "Plot T² against L. The gradient should be 4π²/g, so calculate g = 4π²/gradient. Inspect the intercept and residuals: a non-zero intercept or curved/systematic residual pattern would signal a length zero error, amplitude effect or another limitation.", move: "linearise a model and diagnose the intercept rather than forcing the origin" }),
      qualityPart({ topic: "practical-investigations", point: 4, demand: "synoptic", family: "practical-investigations:pendulum", context: "practical-investigations:pendulum:conclusion", prompt: "The fitted value of g is 9.62 ± 0.18 m s⁻² while the accepted comparison is 9.81 m s⁻². Write a conclusion that distinguishes agreement from precision and proposes one targeted improvement.", marks: 3, scheme: ["The accepted value lies outside 9.62 ± 0.18 (difference 0.19)", "The result is not consistent within the quoted uncertainty, though the uncertainty describes precision rather than accuracy", "Use a larger number of cycles, better length reference or calibrated timing to address the dominant limitation"], answer: "The measured value differs from 9.81 by 0.19 m s⁻², just outside the quoted ±0.18 interval, so it is not consistent within the stated uncertainty. The small interval indicates precision, not necessarily accuracy. Calibrating the timer and defining the pivot-to-centre length more carefully would target systematic error; timing more cycles would reduce random uncertainty.", move: "write an uncertainty-aware conclusion with an improvement tied to the cause" }),
    ],
  },
  {
    slug: "physics-quality-orbit-redshift",
    subjectId: SUBJECT,
    topics: ["orbits-universe"],
    kind: "structured",
    stem: "A weather satellite and a distant galaxy are analysed with the same gravitational and measurement models. Keep distances measured from the centre of the attracting body.",
    difficulty: 5,
    calculator: true,
    source: "generated",
    verification: "unverified",
    parts: [
      qualityPart({ topic: "orbits-universe", point: 1, demand: "misconception", family: "orbits-universe:survey", context: "orbits-universe:survey:radius", prompt: "A satellite is 400 km above Earth. A student substitutes 400 km for r in GMm/r². Explain the error and its effect on the predicted gravitational field.", marks: 3, scheme: ["r is the distance from Earth's centre, not height above the surface", "Use r = R_E + 400 km", "Using 400 km makes r far too small and overestimates field strength by the inverse-square relationship"], answer: "The radius in the gravitational equations is measured from Earth's centre, so r = R_E + 400 km. Using only 400 km makes the denominator much too small and therefore greatly overestimates GM/r².", move: "choose the physical reference point before applying an inverse-square law" }),
      qualityPart({ topic: "orbits-universe", point: 2, demand: "calculation", family: "orbits-universe:survey", context: "orbits-universe:survey:period", prompt: "A satellite orbits at r = 7.0 × 10⁶ m around a planet of GM = 3.5 × 10¹³ m³ s⁻². Calculate its period.", marks: 3, scheme: ["Use T = 2π√(r³/GM)", "Substitution gives T = 2π√((7.0 × 10⁶)³/(3.5 × 10¹³))", "T = 1.98 × 10⁴ s, about 5.5 h"], answer: "T = 2π√(r³/GM) = 2π√[(7.0 × 10⁶)³/(3.5 × 10¹³)] = 1.98 × 10⁴ s, approximately 5.5 h.", move: "retain powers of ten in an orbital-period calculation", calculationRules: [{ kind: "accuracy", label: "T", expected: 19800 }, { kind: "unit", label: "T", expected: 19800, unitAliases: ["s"] }] }),
      qualityPart({ topic: "orbits-universe", point: 3, demand: "transfer", family: "orbits-universe:survey", context: "orbits-universe:survey:redshift", prompt: "Two galaxies have the same measured redshift, but one has a large peculiar velocity toward Earth. Explain how this affects a distance inferred from v = H₀d.", marks: 3, scheme: ["Observed recession velocity contains the Hubble component plus peculiar velocity", "The peculiar motion can make the inferred velocity and hence distance too high or too low", "Use a large sample, independent distance indicators or account for the velocity uncertainty"], answer: "The measured redshift reflects both the Hubble recession and the galaxy's peculiar velocity. A motion toward Earth reduces the observed recession speed and would make v/H₀ underestimate the distance; motion away would overestimate it. Use many galaxies or an independent distance ladder to reduce this limitation.", move: "separate a model signal from an unmodelled local velocity" }),
      qualityPart({ topic: "orbits-universe", point: 4, demand: "synoptic", family: "orbits-universe:survey", context: "orbits-universe:survey:geostationary", prompt: "A communications satellite must remain above one longitude while its orbit is viewed from Earth. State the orbital conditions and explain why a polar orbit fails.", marks: 4, scheme: ["Circular orbit in the equatorial plane", "Period equals Earth's rotation and direction is west to east", "Same angular speed keeps the satellite above one longitude", "A polar orbit changes latitude and cannot remain above a fixed equatorial longitude"], answer: "The orbit must be circular, equatorial, west-to-east and have a period equal to Earth's rotation. Matching angular speed keeps the satellite above one longitude. A polar orbit passes over changing latitudes, so its ground track cannot stay fixed above an equatorial point.", move: "combine period, plane and direction constraints into a geometric explanation" }),
    ],
  },
  {
    slug: "physics-quality-induction-wind-turbine",
    subjectId: SUBJECT,
    topics: ["electromagnetic-induction"],
    kind: "structured",
    stem: "A wind turbine generator is connected to a step-up transformer. Use flux linkage and energy conservation to interpret the measured output.",
    difficulty: 5,
    calculator: true,
    source: "generated",
    verification: "unverified",
    parts: [
      qualityPart({ topic: "electromagnetic-induction", point: 1, demand: "misconception", family: "electromagnetic-induction:turbine", context: "electromagnetic-induction:turbine:static-field", prompt: "A coil is held motionless in a strong uniform magnetic field. A student says a large field guarantees a continuous induced emf. Explain why the meter reads zero after the coil settles.", marks: 2, scheme: ["Induced emf depends on the rate of change of flux linkage", "With a stationary coil and constant field the flux linkage is constant, so d(NΦ)/dt = 0"], answer: "Faraday's law uses the rate of change of flux linkage, not the field magnitude alone. Once the stationary coil has constant Φ, d(NΦ)/dt is zero and no continuous emf is induced.", move: "focus on change in flux rather than field size", aos: ["AO1", "AO2"] }),
      qualityPart({ topic: "electromagnetic-induction", point: 2, demand: "calculation", family: "electromagnetic-induction:turbine", context: "electromagnetic-induction:turbine:flux", prompt: "A 400-turn coil has flux per turn changing from 1.8 mWb to 0.30 mWb in 0.015 s. Calculate the mean induced emf magnitude.", marks: 3, scheme: ["Change in flux linkage = 400(1.8 − 0.30) × 10⁻³ = 0.60 Wb turns", "Mean emf = change in flux linkage/time", "ε = 0.60/0.015 = 40 V"], answer: "Δ(NΦ) = 400 × 1.50 × 10⁻³ = 0.60 Wb turns. The mean emf magnitude is |ε| = 0.60/0.015 = 40 V.", move: "multiply the per-turn change before dividing by time", calculationRules: [{ kind: "accuracy", label: "emf", expected: 40 }, { kind: "unit", label: "emf", expected: 40, unitAliases: ["V"] }] }),
      qualityPart({ topic: "electromagnetic-induction", point: 3, demand: "transfer", family: "electromagnetic-induction:turbine", context: "electromagnetic-induction:turbine:generator", prompt: "The turbine speed doubles while the peak flux remains unchanged. Predict the change in the alternating emf and explain the energy source for the extra electrical output.", marks: 3, scheme: ["Doubling rotational frequency doubles the rate of change of flux", "Peak induced emf doubles (for the same coil and field)", "The additional electrical energy comes from extra mechanical work supplied by the turbine; Lenz's law gives the opposing torque"], answer: "With the same flux amplitude, doubling the rotation frequency doubles d(NΦ)/dt and therefore the peak emf. The extra electrical energy is supplied by increased mechanical work from the turbine; the induced current produces an opposing torque, as required by Lenz's law.", move: "connect waveform rate, generator loading and conservation of energy" }),
      qualityPart({ topic: "electromagnetic-induction", point: 4, demand: "synoptic", family: "electromagnetic-induction:turbine", context: "electromagnetic-induction:turbine:transformer", prompt: "The generator output is 11 kV at 180 A. An ideal transformer raises it to 132 kV for the line. Calculate the line current and explain the reduction in cable loss.", marks: 3, scheme: ["Power input = VI = 11 000 × 180 = 1.98 MW", "For an ideal transformer power is conserved, so I₂ = 1.98 × 10⁶/132 000 = 15 A", "Cable loss I²R is reduced by the square of the current ratio, by a factor of 12² = 144"], answer: "The input power is 11 000 × 180 = 1.98 × 10⁶ W. At 132 kV the ideal line current is 1.98 × 10⁶/132 000 = 15 A. Since resistive loss is I²R, the current falls by 12 and the loss falls by 144 for the same cable resistance.", move: "combine transformer power conservation with a loss scaling law" }),
    ],
  },
];

export const wjecPhysicsQualityExpansionQuestions = defineQuestions(questions);
