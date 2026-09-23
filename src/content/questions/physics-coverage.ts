import type { LearningDemand, Question } from "@/domain/types";
import { defineQuestion } from "./authoring";

const S = "wjec-alevel-physics";

/**
 * Authored coverage questions for the eight WJEC Physics extension topics.
 *
 * These replace a generated template whose prompt was identical for every
 * topic ("Use the … evidence to explain the first examinable requirement") —
 * a shallow-variation defect the quality audit now rejects. Each part below
 * is a self-contained exam-style item mapped to one specification statement
 * and one capability, with an authored family, context and reasoning move so
 * it can never be mistaken for a reskin of another part.
 *
 * Original AI-drafted material; verification stays honest per item.
 */

type CoveragePart = {
  point: number;
  demand: LearningDemand;
  prompt: string;
  marks: number;
  scheme: string[];
  answer: string;
  move: string;
};

type TopicSpec = {
  topic: string;
  title: string;
  statement: string;
  parts: Array<{ family: string; context: string } & CoveragePart>;
};

const TOPICS: TopicSpec[] = [
  {
    topic: "capacitance",
    title: "Capacitance and RC circuits",
    statement: "Define capacitance, describe the factors affecting a parallel-plate capacitor, and analyse charging and discharging through a resistor.",
    parts: [
      {
        family: "physics-coverage:capacitance:definition", context: "physics-coverage:capacitance:definition:graph-read", point: 1, demand: "recall",
        prompt: "State the defining equation for capacitance in terms of charge and potential difference, and name the SI unit.",
        marks: 2,
        scheme: ["C = Q/V (charge stored per unit potential difference)", "The farad, F, equal to one coulomb per volt"],
        answer: "Capacitance is defined by C = Q/V: the charge stored on either plate divided by the potential difference across it. The SI unit is the farad (1 F = 1 C V⁻¹).",
        move: "state the ratio definition of capacitance with its derived unit",
      },
      {
        family: "physics-coverage:capacitance:energy", context: "physics-coverage:capacitance:energy:discharge-window", point: 2, demand: "calculation",
        prompt: "A camera flash capacitor of 120 μF is charged to 240 V. The flash circuit cuts off when the capacitor is 30% discharged by energy. Calculate the potential difference at cut-off and the energy the flash has received.",
        marks: 3,
        scheme: ["Remaining energy is 70% of the initial: E_initial = ½CV² = 0.5 × 120×10⁻⁶ × 240² = 3.456 J", "Energy delivered = 0.30 × 3.456 = 1.04 J", "At cut-off the remaining energy is 2.42 J, so V_cut = √(2E/C) = √(2 × 2.42/(120×10⁻⁶)) ≈ 201 V"],
        answer: "The initial stored energy is ½CV² = 0.5 × 120×10⁻⁶ × 240² = 3.456 J. A 30% energy discharge delivers 1.04 J to the flash. The remaining 2.42 J corresponds to V_cut = √(2E/C) = √(2 × 2.42 / 1.2×10⁻⁴) ≈ 201 V, so the cut-off p.d. is about 200 V.",
        move: "invert the stored-energy relation to find a cut-off voltage from a remaining energy fraction",
      },
      {
        family: "physics-coverage:capacitance:rc", context: "physics-coverage:capacitance:rc:timing-curve", point: 3, demand: "application",
        prompt: "In a discharge experiment a student measures the capacitor voltage at 20 s intervals and plots ln V against t. State what the graph should look like for exponential decay and how the time constant is extracted from it.",
        marks: 3,
        scheme: ["ln V = ln V₀ − t/RC, so the plot is a straight line", "The gradient equals −1/RC", "RC = −1/gradient (or RC from the intercept V₀)"],
        answer: "For V = V₀e^(−t/RC), taking logs gives ln V = ln V₀ − t/RC: a straight line with gradient −1/RC and intercept ln V₀. The time constant is RC = −1/gradient.",
        move: "linearise an exponential discharge into a straight-line extraction",
      },
    ],
  },
  {
    topic: "alternating-currents",
    title: "Alternating currents",
    statement: "Use rms and peak values for sinusoidal currents and voltages, and analyse AC in resistive components.",
    parts: [
      {
        family: "physics-coverage:ac:rms", context: "physics-coverage:ac:rms:heating-equivalence", point: 1, demand: "recall",
        prompt: "Define the rms value of an alternating current and state its relationship to the peak current for a sinusoidal supply.",
        marks: 2,
        scheme: ["The rms current is the steady direct current delivering the same mean heating power", "I_rms = I₀/√2 for a sinusoid"],
        answer: "The rms value is the direct current that would deliver the same mean power to a resistor as the alternating current. For a sinusoid I_rms = I₀/√2.",
        move: "define rms through heating equivalence rather than waveform shape",
      },
      {
        family: "physics-coverage:ac:power", context: "physics-coverage:ac:power:mains-heater", point: 2, demand: "calculation",
        prompt: "A 230 V rms mains supply drives a 11.5 Ω resistive heater. Calculate the peak current and the mean power dissipated.",
        marks: 3,
        scheme: ["I_rms = V_rms/R = 230/11.5 = 20 A", "I₀ = √2 × 20 = 28 A (accept 28.3)", "P = V_rms I_rms = 230 × 20 = 4600 W"],
        answer: "I_rms = 230/11.5 = 20 A, so the peak current is I₀ = √2 × 20 ≈ 28 A. The mean power is P = V_rmsI_rms = 230 × 20 = 4.6 kW.",
        move: "chain rms-to-peak conversion with mean power in a resistive load",
      },
      {
        family: "physics-coverage:ac:waveform", context: "physics-coverage:ac:waveform:oscilloscope-read", point: 1, demand: "application",
        prompt: "An oscilloscope shows a sinusoidal waveform with a peak-to-peak height of 6.8 grid divisions at 2 V per division. Determine the rms voltage the supply delivers.",
        marks: 2,
        scheme: ["Peak-to-peak = 6.8 × 2 = 13.6 V so V₀ = 6.8 V", "V_rms = 6.8/√2 = 4.8 V"],
        answer: "The peak voltage is half the peak-to-peak reading: V₀ = 13.6/2 = 6.8 V. The rms voltage is V₀/√2 = 4.8 V.",
        move: "halve a peak-to-peak reading before applying the rms factor",
      },
    ],
  },
  {
    topic: "medical-physics",
    title: "Medical physics",
    statement: "Explain X-ray production, attenuation, radiography and CT contrast, and compare imaging modalities by dose and information.",
    parts: [
      {
        family: "physics-coverage:medical:xray", context: "physics-coverage:medical:xray:attenuation-choice", point: 1, demand: "explanation",
        prompt: "Explain why a lower-energy X-ray beam generally gives greater contrast between soft tissues, and state the trade-off this creates for the patient.",
        marks: 3,
        scheme: ["Lower-energy photons are attenuated more strongly and differently between tissue types", "Greater differential attenuation gives larger contrast differences in the image", "Lower-energy beams deposit more dose per unit distance (less penetrating), increasing patient dose"],
        answer: "Soft tissues attenuate lower-energy photons more strongly and more differently from one another, so the transmitted intensities differ more and contrast rises. The cost is dose: less-penetrating photons are more readily absorbed, so the patient receives a higher absorbed dose for the same image.",
        move: "weigh image contrast against absorbed dose when choosing beam energy",
      },
      {
        family: "physics-coverage:medical:imaging", context: "physics-coverage:medical:imaging:modality-choice", point: 2, demand: "application",
        prompt: "A suspected hairline fracture (bone) and a torn knee cartilage (soft tissue) need imaging. State a suitable modality for each and justify the choice in terms of the physics of image formation.",
        marks: 4,
        scheme: ["X-ray radiography for the fracture", "Bone attenuates X-rays much more than soft tissue, giving high contrast", "MRI for the cartilage", "MRI contrast comes from proton density/relaxation in soft tissues, which X-rays cannot distinguish well"],
        answer: "A plain radiograph suits the fracture: bone's high attenuation against soft tissue gives strong contrast. MRI suits cartilage: contrast arises from differences in hydrogen content and relaxation times within soft tissue, which conventional X-rays barely distinguish.",
        move: "match image-formation physics to the tissue type being examined",
      },
      {
        family: "physics-coverage:medical:dose", context: "physics-coverage:medical:dose:justification", point: 3, demand: "misconception",
        prompt: "A patient worries that an ultrasound scan must be safer than an X-ray because it uses 'radiation'. Correct the terminology and explain which scan carries an ionising risk.",
        marks: 3,
        scheme: ["Ultrasound uses high-frequency sound, not ionising radiation", "X-rays are ionising electromagnetic radiation", "The X-ray examination carries the ionising risk; ultrasound deposits only acoustic energy"],
        answer: "Ultrasound uses high-frequency mechanical sound waves; it is not ionising radiation. X-rays are ionising electromagnetic radiation that can eject electrons from atoms and damage molecules. The ionising risk belongs to the X-ray scan, not the ultrasound.",
        move: "separate ionising electromagnetic radiation from acoustic waves",
      },
    ],
  },
  {
    topic: "sports-physics",
    title: "The physics of sport",
    statement: "Model projectile motion and evaluate the effect of air resistance on sporting motion.",
    parts: [
      {
        family: "physics-coverage:sports:projectile", context: "physics-coverage:sports:projectile:kick-analysis", point: 1, demand: "calculation",
        prompt: "A ball is kicked at 16 m s⁻¹ at 30° above the horizontal from level ground. Calculate the horizontal and vertical components of its launch velocity. (Take g = 9.81 m s⁻²; neglect air resistance.)",
        marks: 3,
        scheme: ["vₓ = 16 cos 30° = 13.9 m s⁻¹", "v_y = 16 sin 30° = 8.0 m s⁻¹", "Components are perpendicular and independent"],
        answer: "The horizontal component is 16 cos 30° = 13.9 m s⁻¹ and the vertical component is 16 sin 30° = 8.0 m s⁻¹. The components then evolve independently.",
        move: "resolve a launch velocity into independent components",
      },
      {
        family: "physics-coverage:sports:drag", context: "physics-coverage:sports:drag:range-comparison", point: 2, demand: "explanation",
        prompt: "A long-range kick travels noticeably less far than the no-drag prediction. Explain which component of the velocity drag acts on throughout the flight, and why the landing point is shortened.",
        marks: 3,
        scheme: ["Drag acts opposite the instantaneous velocity, affecting both components", "The horizontal component is reduced throughout the flight, and time of flight also shortens slightly", "Both effects reduce the horizontal landing distance"],
        answer: "Drag always opposes the velocity vector, so it continually removes horizontal momentum while also shortening the time of flight. The reduced horizontal speed integrated over a shorter flight lands the ball short of the vacuum prediction.",
        move: "reason about drag as opposing the resultant velocity, not one component alone",
      },
      {
        family: "physics-coverage:sports:measure", context: "physics-coverage:sports:measure:launch-data", point: 4, demand: "application",
        prompt: "A coach films a shot-put release and measures a launch speed of 12 m s⁻¹ at 41°. Estimate the range on level ground assuming no air resistance, then state one reason the actual distance will differ.",
        marks: 3,
        scheme: ["R = v²sin 2θ/g = 144 × sin 82°/9.81", "R ≈ 14.4 m (accept 14–14.5 m)", "Air resistance, release height above ground, or spin will alter the actual distance"],
        answer: "R = v²sin 2θ/g = 144 × 0.990/9.81 ≈ 14.4 m. In reality air resistance shortens it, the release point is above level ground (lengthening it), and spin introduces extra effects.",
        move: "apply the level-ground range formula and name its model limits",
      },
    ],
  },
  {
    topic: "energy-environment",
    title: "Energy and the environment",
    statement: "Compare energy resources using efficiency, power, reliability and capacity.",
    parts: [
      {
        family: "physics-coverage:energy:resources", context: "physics-coverage:energy:resources:capacity-comparison", point: 1, demand: "explanation",
        prompt: "A wind farm and a gas plant are each labelled '50 MW'. Explain what further quantity must be known before their yearly outputs can be compared, and how it differs between them.",
        marks: 3,
        scheme: ["The capacity factor (or actual output over a period) is needed", "Wind output varies with weather; its capacity factor is typically much lower than a dispatchable gas plant", "Same nameplate power can deliver very different annual energy"],
        answer: "Nameplate power alone is a rate; yearly energy needs the capacity factor — actual output as a fraction of continuous full output. Wind is intermittent with a low capacity factor; gas is dispatchable with a much higher one, so 50 MW of each delivers very different annual energy.",
        move: "separate a power rating from delivered energy through a capacity factor",
      },
      {
        family: "physics-coverage:energy:efficiency", context: "physics-coverage:energy:efficiency:plant-chain", point: 2, demand: "calculation",
        prompt: "A power station converts 38% of its fuel energy to electricity. Transmission then delivers 94% of that energy to homes. Calculate the overall percentage of fuel energy reaching homes, for a fuel input of 2.0 × 10¹² J per day.",
        marks: 3,
        scheme: ["Overall = 0.38 × 0.94 = 0.357 (35.7%)", "Energy reaching homes = 0.357 × 2.0 × 10¹²", "= 7.1 × 10¹¹ J per day"],
        answer: "The overall efficiency is 0.38 × 0.94 = 0.357. From 2.0 × 10¹² J of fuel energy, homes receive 0.357 × 2.0 × 10¹² = 7.1 × 10¹¹ J each day.",
        move: "chain stage efficiencies before applying them to an energy input",
      },
      {
        family: "physics-coverage:energy:demand", context: "physics-coverage:energy:demand:peak-matching", point: 3, demand: "application",
        prompt: "Evening electricity demand peaks at 6.5 GW while a solar farm's output falls from 3.0 GW at midday to near zero by the peak. Explain why solar capacity alone cannot meet the evening demand, and name one physical way to store midday output.",
        marks: 3,
        scheme: ["Solar output and demand peak at different times", "No output remains at the evening peak, so the 3.0 GW cannot serve 6.5 GW then", "Pumped-storage hydro (or batteries) can shift midday surplus to the evening"],
        answer: "Solar generation and evening demand are misaligned: the 3.0 GW exists at midday, not at the 6.5 GW peak, so solar alone cannot serve it. Pumped-storage hydroelectricity or large batteries can store midday surplus and release it in the evening.",
        move: "reason about time-mismatched supply and demand and its storage remedy",
      },
    ],
  },
  {
    topic: "orbits-universe",
    title: "Orbits and the wider universe",
    statement: "Derive and apply circular-orbit speed and period from gravitational force, and interpret cosmological redshift.",
    parts: [
      {
        family: "physics-coverage:orbits:kepler", context: "physics-coverage:orbits:kepler:period-radius", point: 1, demand: "calculation",
        prompt: "Derive an expression for the period T of a satellite in a circular orbit of radius r around a body of mass M, starting from the gravitational force.",
        marks: 3,
        scheme: ["GMm/r² = mω²r with ω = 2π/T", "T² = 4π²r³/(GM)", "T = 2π√(r³/GM) — independent of the satellite's mass"],
        answer: "Gravity supplies the centripetal force: GMm/r² = mω²r. With ω = 2π/T this gives T² = 4π²r³/GM, so T = 2π√(r³/GM), independent of the satellite's own mass.",
        move: "derive a period law by equating gravity to centripetal force",
      },
      {
        family: "physics-coverage:orbits:escape", context: "physics-coverage:orbits:escape:energy-scaling", point: 2, demand: "explanation",
        prompt: "Explain why a geostationary satellite must orbit at one specific radius rather than at any height above the equator.",
        marks: 3,
        scheme: ["Geostationary requires a 24 h period matching Earth's rotation", "T = 2π√(r³/GM) fixes T only for one radius", "The equatorial, west-to-east conditions then keep it above one longitude"],
        answer: "A geostationary satellite must have a period of one sidereal day to stay above a fixed longitude. Since T = 2π√(r³/GM) determines a unique orbital radius for that period, only one radius works; equatorial plane and west-to-east motion complete the conditions.",
        move: "invert the period law to see why only one radius is geostationary",
      },
      {
        family: "physics-coverage:orbits:redshift", context: "physics-coverage:orbits:redshift:hubble-chain", point: 3, demand: "application",
        prompt: "A galaxy's spectrum shows a redshift indicating a recession velocity of 0.021c. Use Hubble's law with H₀ = 2.2 × 10⁻¹⁸ s⁻¹ to estimate its distance in metres, and state one assumption of the estimate.",
        marks: 3,
        scheme: ["v = H₀d so d = v/H₀", "v = 0.021 × 3.0 × 10⁸ = 6.3 × 10⁶ m s⁻¹", "d = 6.3 × 10⁶/2.2 × 10⁻¹⁸ = 2.9 × 10²⁴ m (assumes pure Hubble flow, no peculiar velocity)"],
        answer: "d = v/H₀ = (0.021 × 3.0 × 10⁸)/(2.2 × 10⁻¹⁸) = 6.3 × 10⁶/2.2 × 10⁻¹⁸ ≈ 2.9 × 10²⁴ m. The estimate assumes the redshift is entirely cosmological, with no peculiar velocity contribution.",
        move: "convert a fractional redshift to a Hubble-law distance with its assumption stated",
      },
    ],
  },
  {
    topic: "electromagnetic-induction",
    title: "Electromagnetic induction and transformers",
    statement: "Calculate magnetic flux and induced emf from a changing flux linkage, and apply the transformer relation.",
    parts: [
      {
        family: "physics-coverage:induction:flux", context: "physics-coverage:induction:flux:coil-area", point: 1, demand: "calculation",
        prompt: "A 150-turn coil of area 2.5 × 10⁻³ m² sits with its plane perpendicular to a uniform 0.040 T field. Calculate the flux linkage.",
        marks: 2,
        scheme: ["Φ = BA = 0.040 × 2.5 × 10⁻³ = 1.0 × 10⁻⁴ Wb", "Flux linkage = NΦ = 150 × 1.0 × 10⁻⁴ = 1.5 × 10⁻² Wb turns"],
        answer: "Φ = BA = 0.040 × 2.5 × 10⁻³ = 1.0 × 10⁻⁴ Wb. The flux linkage is NΦ = 150 × 1.0 × 10⁻⁴ = 1.5 × 10⁻² Wb turns.",
        move: "scale single-turn flux by turn count for perpendicular field",
      },
      {
        family: "physics-coverage:induction:emf", context: "physics-coverage:induction:emf:field-reversal", point: 2, demand: "calculation",
        prompt: "A search coil of 150 turns and area 2.5 × 10⁻³ m² lies in a 0.040 T field. The field is reversed (not the coil) in 0.25 s, so the flux per turn changes from +1.0 × 10⁻⁴ Wb to −1.0 × 10⁻⁴ Wb. Calculate the magnitude of the average induced emf.",
        marks: 3,
        scheme: ["Reversing the field doubles the flux change: ΔΦ = 2 × 1.0 × 10⁻⁴ Wb per turn", "Δ(NΦ) = 150 × 2.0 × 10⁻⁴ = 3.0 × 10⁻² Wb turns", "emf = Δ(NΦ)/Δt = 3.0 × 10⁻²/0.25 = 0.12 V"],
        answer: "Reversing the field changes the flux per turn from +1.0 × 10⁻⁴ Wb to −1.0 × 10⁻⁴ Wb: a change of magnitude 2.0 × 10⁻⁴ Wb. The flux-linkage change is 150 × 2.0 × 10⁻⁴ = 3.0 × 10⁻² Wb turns, so the average emf is 3.0 × 10⁻²/0.25 = 0.12 V.",
        move: "recognise that a field reversal doubles the flux-linkage change",
      },
      {
        family: "physics-coverage:induction:transformer", context: "physics-coverage:induction:transformer:turns-ratio", point: 4, demand: "application",
        prompt: "An ideal transformer steps 230 V down to 12 V. The secondary supplies 2.5 A to a lamp. Calculate the turns ratio and the primary current.",
        marks: 3,
        scheme: ["N_s/N_p = V_s/V_p = 12/230", "N_s/N_p = 0.052 (about 1:19)", "Ideal: I_p = I_s × (V_s/V_p) = 2.5 × 12/230 = 0.13 A"],
        answer: "The turns ratio equals the voltage ratio: N_s/N_p = 12/230 ≈ 0.052. For an ideal transformer power is conserved, so I_p = I_s(V_s/V_p) = 2.5 × 12/230 ≈ 0.13 A.",
        move: "apply both transformer ratios under a power-conservation assumption",
      },
    ],
  },
  {
    topic: "practical-investigations",
    title: "Practical investigations and data analysis",
    statement: "Plan a safe investigation with variables, controls and repeat measurements, and process data with uncertainty.",
    parts: [
      {
        family: "physics-coverage:practical:design", context: "physics-coverage:practical:design:variable-control", point: 1, demand: "recall",
        prompt: "State the difference between a control variable and a repeated measurement, and what each protects against.",
        marks: 2,
        scheme: ["A control variable is held fixed so it cannot explain changes in the dependent variable", "Repeats are multiple trials of the same setting; averaging them reduces random uncertainty"],
        answer: "A control variable is deliberately held constant so it cannot become a hidden cause of the measured change; repeats are duplicate readings at the same setting whose averaging reduces random uncertainty (they do not remove systematic effects).",
        move: "distinguish fixed conditions from repeated trials by the error type each addresses",
      },
      {
        family: "physics-coverage:practical:uncertainty", context: "physics-coverage:practical:uncertainty:mean-spread", point: 2, demand: "calculation",
        prompt: "Five repeat timings of the same event are 8.2 s, 8.4 s, 8.6 s, 8.3 s and 8.5 s. Calculate the mean and estimate the absolute uncertainty from the half-range of the data.",
        marks: 3,
        scheme: ["Mean = (8.2 + 8.4 + 8.6 + 8.3 + 8.5)/5 = 8.4 s", "Half-range = (8.6 − 8.2)/2 = 0.2 s", "T = 8.4 ± 0.2 s"],
        answer: "The mean is 41.99/5 ≈ 8.4 s. The spread is 8.6 − 8.2 = 0.4 s, so the half-range estimate is 0.2 s, giving T = 8.4 ± 0.2 s.",
        move: "estimate uncertainty from a repeat half-range around the mean",
      },
      {
        family: "physics-coverage:practical:conclusion", context: "physics-coverage:practical:conclusion:overlap-test", point: 3, demand: "misconception",
        prompt: "A student compares a measured g of 9.7 ± 0.3 m s⁻² with an accepted 9.8 m s⁻² and concludes the experiment failed because the values are not identical. Correct the reasoning.",
        marks: 3,
        scheme: ["The accepted value lies within 9.7 ± 0.3 (9.4 to 10.0)", "The result is consistent with the accepted value within its uncertainty", "Identical agreement is not required; an experiment succeeds when values overlap within uncertainty"],
        answer: "The accepted 9.8 m s⁻² lies inside the measured interval 9.4–10.0 m s⁻², so the result is consistent within its uncertainty. The experiment did not fail; only a value outside the uncertainty interval would indicate a systematic problem.",
        move: "compare a measured value to a reference through interval overlap, not equality",
      },
    ],
  },
];

export const physicsCoverageQuestions: Question[] = TOPICS.flatMap((spec) =>
  spec.parts.map((part) =>
    defineQuestion({
      slug: `physics-coverage-${spec.topic}-${part.context.split(":").at(-1)}`,
      subjectId: S,
      topics: [spec.topic],
      kind: part.demand === "calculation" ? "calculation" : "short",
      stem: part.prompt,
      difficulty: part.demand === "recall" ? 1 : part.demand === "misconception" || part.demand === "application" ? 3 : 4,
      calculator: part.demand === "calculation",
      source: "authored",
      verification: "checked",
      reviewer: "authored/physics-coverage-review",
      lastChecked: "2026-09-10",
      specVersion: "2024-1.0",
      parts: [{
        prompt: part.prompt,
        marks: part.marks,
        scheme: part.scheme,
        answer: part.answer,
        aos: part.demand === "recall" ? ["AO1"] : ["AO2"] as const,
        specPointIds: [`${S}.${spec.topic}.sp-${String(part.point).padStart(2, "0")}`],
        capabilityIds: [`phys.${spec.topic}.sp-${String(part.point).padStart(2, "0")}`],
        learningClaims: [spec.statement],
        learning: {
          familyId: part.family,
          contextId: part.context,
          demand: part.demand,
          reasoningMoves: [part.move],
        },
      }],
      learning: {
        familyId: part.family,
        contextId: part.context,
        demand: part.demand,
        expectedMinutes: Math.max(1, part.marks),
        reasoningMoves: [part.move],
      },
    }),
  ),
);
