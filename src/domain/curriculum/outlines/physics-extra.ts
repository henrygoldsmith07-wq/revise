import type { AoCode } from "../../types";
import type { TopicSpec } from "../helpers";

// Physics topics the shared outline never had, for boards whose specification
// examines them as sections of their own (AQA 7408 first, including its five
// options, of which a student studies one). Each board places them with its
// own references (../board-outline.ts). Authored, unreviewed reference content.

const LAST_CHECKED = "2026-11-06";
const point = (text: string, aos: AoCode[] = ["AO1"]) => ({
  ref: "",
  text,
  aos,
  source: "authored" as const,
  verification: "unverified" as const,
  reviewer: null,
  lastChecked: LAST_CHECKED,
});
const base = { source: "authored" as const, verification: "unverified" as const, lastChecked: LAST_CHECKED, aos: ["AO1", "AO2"] as AoCode[] };

export const PHYSICS_EXTRA_TOPICS: TopicSpec[] = [
  {
    ...base,
    slug: "measurements-errors",
    title: "Measurements and their errors",
    difficulty: 2,
    summary:
      "SI base units and prefixes, random and systematic errors, precision, repeatability, reproducibility, resolution and accuracy, combining uncertainties, and order-of-magnitude estimates.",
    keyPoints: [
      "The six SI base units used are kg, m, s, A, K and mol; every other unit is derived from them.",
      "Random errors scatter readings and are reduced by repeating; systematic errors shift every reading and are not.",
      "Add absolute uncertainties when quantities are added or subtracted; add percentage uncertainties when they are multiplied or divided; multiply the percentage by n for a power n.",
      "Uncertainty in a gradient comes from the steepest and shallowest acceptable lines through the error bars.",
    ],
    commonErrors: [
      "Calling a precise result accurate — precision is about spread, accuracy about closeness to the true value.",
      "Adding absolute uncertainties when two quantities are multiplied.",
      "Quoting a final answer to more significant figures than the data support.",
    ],
    specPoints: [
      point("use SI base and derived units, prefixes and conversions such as kWh and eV"),
      point("distinguish random and systematic errors, precision, repeatability, reproducibility, resolution and accuracy", ["AO1", "AO3"]),
      point("combine absolute, fractional and percentage uncertainties and find uncertainty from graphs", ["AO2", "AO3"]),
      point("estimate approximate values of physical quantities to an order of magnitude", ["AO2"]),
    ],
  },
  {
    ...base,
    slug: "particles",
    title: "Particles",
    difficulty: 3,
    summary:
      "The constituents of the atom and specific charge, stable and unstable nuclei, antiparticles, pair production and annihilation, exchange particles and the four interactions, the classification of hadrons and leptons, quarks, and conservation laws.",
    keyPoints: [
      "Specific charge = charge ÷ mass; the proton's is about 9.6 × 10⁷ C kg⁻¹, the electron's about 1.76 × 10¹¹ C kg⁻¹.",
      "Every particle has an antiparticle of equal rest energy and opposite charge; pair production needs a photon of at least 2 × the rest energy.",
      "Hadrons (baryons qqq, mesons qq̄) feel the strong interaction; leptons do not; the proton is the only stable baryon.",
      "Charge, baryon number and lepton number are conserved in every interaction; strangeness is conserved in strong interactions but can change by ±1 in weak ones.",
    ],
    commonErrors: [
      "Saying a photon alone can create a single electron — pair production makes a particle and its antiparticle.",
      "Treating the electron neutrino and muon neutrino as having the same lepton number.",
      "Classifying the muon as a meson because of its name.",
    ],
    specPoints: [
      point("describe the constituents of the atom, calculate specific charge and use nuclide notation; explain why some nuclei are unstable", ["AO1", "AO2"]),
      point("describe antiparticles, photons, annihilation and pair production and calculate the minimum photon energy for pair production", ["AO1", "AO2"]),
      point("describe the four fundamental interactions and exchange particles, including Feynman diagrams for beta decay and electron capture"),
      point("classify hadrons and leptons and describe the quark composition of protons, neutrons, pions and kaons"),
      point("apply conservation of charge, baryon number, lepton number and strangeness to particle interactions", ["AO2"]),
    ],
  },
  {
    ...base,
    slug: "capacitance",
    title: "Capacitance",
    difficulty: 4,
    summary:
      "Capacitance and the parallel-plate capacitor with a dielectric, the energy stored by a capacitor, and the exponential charge and discharge of a capacitor through a resistor.",
    keyPoints: [
      "C = Q ÷ V; for parallel plates C = A ε₀ εᵣ ÷ d, and a dielectric's polar molecules align to increase the stored charge.",
      "Energy stored E = ½QV = ½CV² = ½Q²/C, the area under a Q–V graph.",
      "Discharge: Q = Q₀ e^(−t/RC); the time constant RC is the time to fall to 37% of the starting value.",
      "Charging: Q = Q₀ (1 − e^(−t/RC)); the time to halve on discharge is 0.69 RC.",
    ],
    commonErrors: [
      "Using E = QV rather than ½QV for the energy stored.",
      "Treating the time constant as the time to discharge completely.",
      "Forgetting that current also decays exponentially during charging.",
    ],
    specPoints: [
      point("define capacitance and use C = Q/V"),
      point("use C = Aε₀εᵣ/d and explain the action of a dielectric", ["AO1", "AO2"]),
      point("calculate the energy stored by a capacitor from the area under a Q–V graph", ["AO2"]),
      point("analyse charge and discharge through a resistor using the time constant and exponential equations", ["AO2", "AO3"]),
    ],
  },
  {
    ...base,
    slug: "astrophysics",
    title: "Option: Astrophysics",
    difficulty: 4,
    summary:
      "Optical and non-optical telescopes, the classification of stars by luminosity, brightness and temperature, stellar evolution on the Hertzsprung–Russell diagram, and cosmology from Doppler shift and Hubble's law.",
    keyPoints: [
      "Angular magnification of a refracting telescope in normal adjustment is fₒ ÷ fₑ; resolving power is about λ ÷ D.",
      "Absolute magnitude is the apparent magnitude at 10 parsecs: m − M = 5 log(d/10).",
      "Wien's law λmax T = 2.9 × 10⁻³ m K; Stefan's law P = σAT⁴.",
      "Hubble's law v = Hd; 1/H estimates the age of the Universe.",
    ],
    commonErrors: [
      "Mixing up apparent and absolute magnitude, or forgetting the scale is reversed (brighter is smaller).",
      "Using Wien's law with temperature in °C.",
      "Treating red shift as motion through space rather than evidence for expansion of the Universe.",
    ],
    specPoints: [
      point("compare refracting, reflecting and non-optical telescopes, including resolving power and CCDs", ["AO1", "AO2"]),
      point("classify stars by apparent and absolute magnitude, distance in parsecs and light years, and black-body radiation", ["AO1", "AO2"]),
      point("describe stellar evolution using the Hertzsprung–Russell diagram, including supernovae, neutron stars and black holes"),
      point("apply Doppler shift and Hubble's law and evaluate evidence for the Big Bang, quasars and exoplanet detection", ["AO2", "AO3"]),
    ],
  },
  {
    ...base,
    slug: "medical-physics",
    title: "Option: Medical physics",
    difficulty: 4,
    summary:
      "The eye and ear as optical and acoustic systems, ECGs, ultrasound and endoscopy, X-ray imaging and CT, and radionuclide imaging and therapy with tracers, gamma cameras and PET.",
    keyPoints: [
      "Lens power P = 1/f in dioptres; myopia is corrected with a diverging lens and hypermetropia with a converging lens.",
      "Intensity level in dB = 10 log(I/I₀) with I₀ = 1.0 × 10⁻¹² W m⁻².",
      "Acoustic impedance Z = ρc; a large mismatch reflects most ultrasound, hence the coupling gel.",
      "Effective half-life: 1/T_E = 1/T_B + 1/T_P.",
    ],
    commonErrors: [
      "Confusing the near point and far point when choosing a correcting lens.",
      "Forgetting the reference intensity I₀ in the decibel equation.",
      "Using physical half-life alone for a radioactive tracer inside the body.",
    ],
    specPoints: [
      point("explain the optics of the eye, its defects and correction, and the structure and response of the ear", ["AO1", "AO2"]),
      point("describe biological measurement with the ECG and non-ionising imaging by ultrasound and endoscopy"),
      point("explain X-ray production, attenuation, image contrast and CT scanning", ["AO1", "AO2"]),
      point("explain radionuclide imaging and therapy, including effective half-life, the gamma camera and PET", ["AO1", "AO2"]),
    ],
  },
  {
    ...base,
    slug: "engineering-physics",
    title: "Option: Engineering physics",
    difficulty: 4,
    summary:
      "Rotational dynamics — moment of inertia, angular motion, torque and angular momentum — and thermodynamics and engines: the first law, p–V diagrams, engine cycles, efficiency and heat pumps.",
    keyPoints: [
      "Torque T = Iα and rotational kinetic energy ½Iω² mirror F = ma and ½mv².",
      "Angular momentum Iω is conserved when no external torque acts.",
      "First law: Q = ΔU + W; work done is the area enclosed by a p–V loop.",
      "Maximum theoretical efficiency is (T_H − T_C) ÷ T_H; a heat pump's coefficient of performance is Q_H ÷ W.",
    ],
    commonErrors: [
      "Using mass instead of moment of inertia in rotational equations.",
      "Using temperatures in °C in efficiency calculations.",
      "Sign errors in the first law: W is the work done by the gas.",
    ],
    specPoints: [
      point("use moment of inertia, rotational kinetic energy and the equations of uniform angular acceleration", ["AO1", "AO2"]),
      point("apply torque and conservation of angular momentum, including work and power in rotating systems", ["AO2"]),
      point("apply the first law of thermodynamics and interpret p–V diagrams of engine cycles", ["AO1", "AO2"]),
      point("calculate engine efficiency and the coefficient of performance of heat pumps and refrigerators", ["AO2"]),
    ],
  },
  {
    ...base,
    slug: "turning-points",
    title: "Option: Turning points in physics",
    difficulty: 4,
    summary:
      "The discovery of the electron and its specific charge, Millikan's oil-drop experiment, the wave–particle duality of light and matter, and Einstein's special relativity with time dilation and length contraction.",
    keyPoints: [
      "Thermionic emission: ½mv² = eV; Thomson measured e/m using crossed electric and magnetic fields.",
      "Millikan's oil drop: at balance, mg = QV/d; charge is quantised in multiples of e.",
      "Newton's corpuscular and Huygens' wave theories of light were tested by Young's slits; the photoelectric effect needed photons.",
      "Time dilation t = t₀ ÷ √(1 − v²/c²); length contraction l = l₀ √(1 − v²/c²).",
    ],
    commonErrors: [
      "Using the dilated time where the proper time is required, or the reverse.",
      "Forgetting that the oil drop's weight must include the upthrust of air in a careful treatment.",
      "Saying Michelson–Morley detected the ether — the null result is the point.",
    ],
    specPoints: [
      point("describe cathode rays, thermionic emission and the determination of the specific charge of the electron", ["AO1", "AO2"]),
      point("explain Millikan's oil-drop experiment and the quantisation of charge", ["AO1", "AO2"]),
      point("explain the development of theories of light and of matter waves, including electron microscopes"),
      point("apply the postulates of special relativity, time dilation, length contraction and mass–energy", ["AO1", "AO2"]),
    ],
  },
  {
    ...base,
    slug: "electronics",
    title: "Option: Electronics",
    difficulty: 4,
    summary:
      "Discrete semiconductor devices, analogue and digital signals, signal processing with LC resonance and operational amplifiers, digital logic and counters, and data communication systems.",
    keyPoints: [
      "MOSFETs, Zener diodes, photodiodes and Hall-effect sensors each have characteristic uses in circuits.",
      "Inverting amplifier gain = −R_f ÷ R_in; non-inverting gain = 1 + R_f ÷ R_1.",
      "An LC circuit resonates at f₀ = 1 ÷ (2π√(LC)); the Q factor measures the sharpness of resonance.",
      "Sampling must be at more than twice the highest signal frequency to reconstruct an analogue signal.",
    ],
    commonErrors: [
      "Forgetting the minus sign (inversion) in the inverting amplifier gain.",
      "Confusing bit rate with sampling rate.",
      "Treating an ideal op-amp as having finite input impedance.",
    ],
    specPoints: [
      point("describe the characteristics and uses of MOSFETs, Zener diodes, photodiodes and Hall-effect sensors"),
      point("compare analogue and digital signals, sampling and quantisation", ["AO1", "AO2"]),
      point("analyse signal processing with LC resonant circuits and operational amplifiers", ["AO2"]),
      point("design digital logic, counters and multiplexers and describe data communication systems", ["AO2", "AO3"]),
    ],
  },
];
