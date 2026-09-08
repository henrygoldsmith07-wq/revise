import { wjecPhysics } from "@/domain/curriculum/wjec-physics";
import { physicsCapabilityIdForSpecPoint } from "@/content/capabilities";
import type { LearningDemand, QuestionPart, Topic } from "@/domain/types";
import { defineQuestions, type QuestionSpec } from "./authoring";

/**
 * Physics depth pack.
 *
 * The curriculum is the source of truth: every WJEC statement receives two
 * different contexts for each of the seven learning demands. The pack is
 * intentionally marked unverified until a reviewer has checked the stem,
 * mark scheme, worked solution and capability mapping. That honest state is
 * consumed by the review queue rather than silently treating generated text as
 * examiner content.
 */
const SUBJECT_ID = "wjec-alevel-physics";
const SPEC_VERSION = "2024-1.0";

type Formula = {
  key: string;
  label: string;
  left: number;
  right: number;
  operator: "*" | "/" | "+" | "-";
  expected: number;
  unit: string;
  equation: string;
  leftLabel: string;
  leftUnit: string;
  rightLabel: string;
  rightUnit: string;
  keywords: string[];
};

/**
 * Calculation items are deliberately tied to the claim vocabulary. A single
 * topic-wide formula made a question about, for example, Hooke's law ask for
 * stress, which is a content error hidden by otherwise valid markup. Each
 * topic therefore has a small catalogue of relationships and each variant
 * changes the data, so the two questions are genuinely different attempts.
 */
const FORMULAS: Record<string, Formula[]> = {
  "kinematics-dynamics": [
    { key: "speed", label: "speed", left: 18, right: 3, operator: "/", expected: 6, unit: "m s^-1", equation: "v = s / t", leftLabel: "distance s", leftUnit: "m", rightLabel: "time t", rightUnit: "s", keywords: ["speed", "velocity", "displacement", "average", "instantaneous"] },
    { key: "acceleration", label: "acceleration", left: 12, right: 4, operator: "/", expected: 3, unit: "m s^-2", equation: "a = delta-v / delta-t", leftLabel: "change in velocity delta-v", leftUnit: "m s^-1", rightLabel: "time interval delta-t", rightUnit: "s", keywords: ["acceleration", "constant-acceleration", "projectile"] },
    { key: "force", label: "resultant force", left: 6, right: 2, operator: "*", expected: 12, unit: "N", equation: "F = m a", leftLabel: "mass m", leftUnit: "kg", rightLabel: "acceleration a", rightUnit: "m s^-2", keywords: ["force", "newton", "drag", "inclined", "terminal"] },
    { key: "impulse", label: "impulse", left: 24, right: 0.25, operator: "*", expected: 6, unit: "N s", equation: "impulse = F delta-t", leftLabel: "average force F", leftUnit: "N", rightLabel: "contact time delta-t", rightUnit: "s", keywords: ["impulse", "force-time", "momentum-time", "area"] },
  ],
  "energy-power": [
    { key: "work", label: "work done", left: 45, right: 0.8, operator: "*", expected: 36, unit: "J", equation: "W = F s", leftLabel: "force F resolved along motion", leftUnit: "N", rightLabel: "displacement s", rightUnit: "m", keywords: ["work", "force", "displacement", "area"] },
    { key: "kinetic-energy", label: "kinetic energy", left: 2, right: 25, operator: "*", expected: 50, unit: "J", equation: "E_k = 0.5 m v^2", leftLabel: "half the mass 0.5m", leftUnit: "kg", rightLabel: "speed squared v^2", rightUnit: "m^2 s^-2", keywords: ["kinetic", "mechanical energy", "energy"] },
    { key: "gravitational-potential", label: "gravitational potential energy", left: 20, right: 3, operator: "*", expected: 60, unit: "J", equation: "delta-E_p = m g h", leftLabel: "m g product", leftUnit: "N", rightLabel: "height change h", rightUnit: "m", keywords: ["gravitational", "potential", "m g h", "energy"] },
    { key: "power", label: "power", left: 600, right: 12, operator: "/", expected: 50, unit: "W", equation: "P = E / t", leftLabel: "energy E", leftUnit: "J", rightLabel: "time t", rightUnit: "s", keywords: ["power"] },
    { key: "efficiency", label: "efficiency", left: 720, right: 900, operator: "/", expected: 0.8, unit: "1", equation: "efficiency = useful / input", leftLabel: "useful output energy", leftUnit: "J", rightLabel: "total input energy", rightUnit: "J", keywords: ["efficiency", "transfer", "non-conservative"] },
  ],
  materials: [
    { key: "stress", label: "stress", left: 120, right: 0.0004, operator: "/", expected: 300000, unit: "Pa", equation: "stress = F / A", leftLabel: "force F", leftUnit: "N", rightLabel: "cross-sectional area A", rightUnit: "m^2", keywords: ["stress", "young modulus", "elastic material"] },
    { key: "strain", label: "strain", left: 0.003, right: 1.5, operator: "/", expected: 0.002, unit: "1", equation: "strain = delta-l / l", leftLabel: "extension delta-l", leftUnit: "m", rightLabel: "original length l", rightUnit: "m", keywords: ["strain", "young modulus"] },
    { key: "spring-constant", label: "spring constant", left: 12, right: 0.03, operator: "/", expected: 400, unit: "N m^-1", equation: "k = F / x", leftLabel: "force F", leftUnit: "N", rightLabel: "extension x", rightUnit: "m", keywords: ["hooke", "spring constant", "force-extension"] },
    { key: "strain-energy", label: "elastic strain energy", left: 60, right: 0.008, operator: "*", expected: 0.48, unit: "J", equation: "E = 0.5 F x", leftLabel: "half the force 0.5F", leftUnit: "N", rightLabel: "extension x", rightUnit: "m", keywords: ["energy", "force-extension", "strain energy", "energy density"] },
  ],
  waves: [
    { key: "wavelength", label: "wavelength", left: 340, right: 500, operator: "/", expected: 0.68, unit: "m", equation: "lambda = v / f", leftLabel: "wave speed v", leftUnit: "m s^-1", rightLabel: "frequency f", rightUnit: "Hz", keywords: ["wave equation", "wavelength", "frequency", "refraction"] },
    { key: "frequency", label: "frequency", left: 12, right: 0.8, operator: "/", expected: 15, unit: "Hz", equation: "f = v / lambda", leftLabel: "wave speed v", leftUnit: "m s^-1", rightLabel: "wavelength lambda", rightUnit: "m", keywords: ["frequency", "refraction"] },
    { key: "grating-spacing", label: "wavelength", left: 2, right: 400000, operator: "/", expected: 5e-6, unit: "m", equation: "lambda = d / n", leftLabel: "grating spacing d", leftUnit: "m", rightLabel: "order n", rightUnit: "1", keywords: ["grating", "interference", "path difference"] },
    { key: "critical-angle", label: "sine of critical angle", left: 1, right: 1.5, operator: "/", expected: 2 / 3, unit: "1", equation: "sin C = 1 / n", leftLabel: "unit numerator", leftUnit: "1", rightLabel: "refractive index n", rightUnit: "1", keywords: ["critical", "total internal", "angle", "sin C"] },
    { key: "node-spacing", label: "node spacing", left: 0.8, right: 2, operator: "/", expected: 0.4, unit: "m", equation: "node spacing = lambda / 2", leftLabel: "wavelength lambda", leftUnit: "m", rightLabel: "half-wavelength factor", rightUnit: "1", keywords: ["stationary", "node", "antinode", "spacing"] },
  ],
  quantum: [
    { key: "photon-energy", label: "photon energy", left: 6.63e-34, right: 5e14, operator: "*", expected: 3.315e-19, unit: "J", equation: "E = h f", leftLabel: "Planck constant h", leftUnit: "J s", rightLabel: "frequency f", rightUnit: "Hz", keywords: ["photon", "photoelectric", "energy relation", "intensity"] },
    { key: "de-broglie", label: "de Broglie wavelength", left: 6.63e-34, right: 4e-24, operator: "/", expected: 1.6575e-10, unit: "m", equation: "lambda = h / p", leftLabel: "Planck constant h", leftUnit: "J s", rightLabel: "momentum p", rightUnit: "kg m s^-1", keywords: ["de broglie", "diffraction", "wave-particle"] },
    { key: "photoelectric-energy", label: "maximum kinetic energy", left: 5e-19, right: 3.2e-19, operator: "-", expected: 1.8e-19, unit: "J", equation: "KEmax = h f - phi", leftLabel: "photon energy h f", leftUnit: "J", rightLabel: "work function phi", rightUnit: "J", keywords: ["photoelectric", "threshold"] },
    { key: "electron-volt", label: "energy in electronvolts", left: 3.2e-19, right: 1.6e-19, operator: "/", expected: 2, unit: "eV", equation: "E_eV = E_J / (1.6e-19 J eV^-1)", leftLabel: "energy E", leftUnit: "J", rightLabel: "joule per eV conversion constant", rightUnit: "J eV^-1", keywords: ["electron volt", "conversion", "energy level", "transition"] },
  ],
  "electric-circuits": [
    { key: "current", label: "current", left: 12, right: 6, operator: "/", expected: 2, unit: "A", equation: "I = V / R", leftLabel: "potential difference V", leftUnit: "V", rightLabel: "resistance R", rightUnit: "ohm", keywords: ["current", "relations", "ohmic", "resistance"] },
    { key: "power", label: "power", left: 12, right: 2, operator: "*", expected: 24, unit: "W", equation: "P = V I", leftLabel: "potential difference V", leftUnit: "V", rightLabel: "current I", rightUnit: "A", keywords: ["power", "efficiency"] },
    { key: "charge", label: "charge", left: 0.002, right: 30, operator: "*", expected: 0.06, unit: "C", equation: "Q = I t", leftLabel: "current I", leftUnit: "A", rightLabel: "time t", rightUnit: "s", keywords: ["charge", "potentiometer", "emf"] },
    { key: "fractional-uncertainty", label: "fractional uncertainty", left: 0.2, right: 10, operator: "/", expected: 0.02, unit: "1", equation: "fractional uncertainty = absolute / measured", leftLabel: "absolute uncertainty", leftUnit: "V", rightLabel: "measured value", rightUnit: "V", keywords: ["uncertainty", "error", "measurement"] },
  ],
  momentum: [
    { key: "impulse", label: "impulse", left: 20, right: 0.3, operator: "*", expected: 6, unit: "N s", equation: "impulse = F t", leftLabel: "average force F", leftUnit: "N", rightLabel: "contact time t", rightUnit: "s", keywords: ["impulse", "force-time", "average force"] },
    { key: "momentum-change", label: "change in momentum", left: 0.06, right: 35, operator: "*", expected: 2.1, unit: "kg m s^-1", equation: "delta-p = m delta-v", leftLabel: "mass m", leftUnit: "kg", rightLabel: "change in velocity delta-v", rightUnit: "m s^-1", keywords: ["momentum", "collision", "explosion"] },
    { key: "average-force", label: "average force", left: 2.1, right: 0.01, operator: "/", expected: 210, unit: "N", equation: "F = delta-p / delta-t", leftLabel: "change in momentum delta-p", leftUnit: "N s", rightLabel: "collision time delta-t", rightUnit: "s", keywords: ["newton", "average force", "uncertainties"] },
    { key: "kinetic-energy", label: "kinetic energy", left: 2, right: 25, operator: "*", expected: 50, unit: "J", equation: "E_k = 0.5 m v^2", leftLabel: "half the mass 0.5m", leftUnit: "kg", rightLabel: "speed squared v^2", rightUnit: "m^2 s^-2", keywords: ["elastic", "inelastic", "kinetic energy"] },
  ],
  "circular-shm": [
    { key: "linear-speed", label: "linear speed", left: 4, right: 0.5, operator: "*", expected: 2, unit: "m s^-1", equation: "v = omega r", leftLabel: "angular speed omega", leftUnit: "rad s^-1", rightLabel: "radius r", rightUnit: "m", keywords: ["angular", "linear", "omega"] },
    { key: "centripetal-force", label: "centripetal force", left: 2, right: 9, operator: "*", expected: 18, unit: "N", equation: "F = m a", leftLabel: "mass m", leftUnit: "kg", rightLabel: "centripetal acceleration a", rightUnit: "m s^-2", keywords: ["centripetal", "circular"] },
    { key: "centripetal-acceleration", label: "centripetal acceleration", left: 16, right: 4, operator: "/", expected: 4, unit: "m s^-2", equation: "a = v^2 / r", leftLabel: "speed squared v^2", leftUnit: "m^2 s^-2", rightLabel: "radius r", rightUnit: "m", keywords: ["acceleration", "simple harmonic", "shm"] },
    { key: "period", label: "period", left: 6.28, right: 4, operator: "/", expected: 1.57, unit: "s", equation: "T = 2 pi / omega", leftLabel: "2 pi factor", leftUnit: "1", rightLabel: "angular frequency omega", rightUnit: "rad s^-1", keywords: ["period", "pendulum", "mass-spring"] },
    { key: "shm-energy", label: "simple harmonic energy", left: 2, right: 0.25, operator: "*", expected: 0.5, unit: "J", equation: "E = 0.5 k A^2", leftLabel: "half the spring constant 0.5k", leftUnit: "N m^-1", rightLabel: "amplitude squared A^2", rightUnit: "m^2", keywords: ["energy", "kinetic", "potential", "interchange", "shm"] },
    { key: "resonance-frequency", label: "frequency", left: 4, right: 6.28, operator: "/", expected: 0.6369426752, unit: "Hz", equation: "f = omega / (2 pi)", leftLabel: "angular frequency omega", leftUnit: "rad s^-1", rightLabel: "2 pi factor", rightUnit: "1", keywords: ["damping", "resonance", "frequency-response"] },
  ],
  fields: [
    { key: "field-strength", label: "field strength", left: 18, right: 3, operator: "/", expected: 6, unit: "N kg^-1", equation: "g = F / m", leftLabel: "force F", leftUnit: "N", rightLabel: "mass m", rightUnit: "kg", keywords: ["field strength", "gravitation", "potential"] },
    { key: "magnetic-force", label: "magnetic force", left: 1.2, right: 0.3, operator: "*", expected: 0.36, unit: "N", equation: "F = B I l", leftLabel: "B I product", leftUnit: "T A", rightLabel: "conductor length l", rightUnit: "m", keywords: ["magnetic", "conductor", "charge"] },
    { key: "induced-emf", label: "induced emf", left: 0.12, right: 0.04, operator: "/", expected: 3, unit: "V", equation: "emf = delta-flux / delta-t", leftLabel: "change in flux linkage", leftUnit: "Wb", rightLabel: "time interval", rightUnit: "s", keywords: ["induction", "faraday", "lenz"] },
    { key: "inverse-square", label: "field strength", left: 18, right: 9, operator: "/", expected: 2, unit: "N kg^-1", equation: "g is proportional to 1 / r^2", leftLabel: "reference field strength", leftUnit: "N kg^-1", rightLabel: "distance-squared factor", rightUnit: "1", keywords: ["inverse-square", "orbital", "gravity"] },
  ],
  thermal: [
    { key: "heating", label: "energy transferred as heat", left: 120, right: 10, operator: "*", expected: 1200, unit: "J", equation: "Q = m c delta-T", leftLabel: "m c product", leftUnit: "J K^-1", rightLabel: "temperature change delta-T", rightUnit: "K", keywords: ["internal energy", "specific heat", "temperature", "heating"] },
    { key: "pressure", label: "pressure", left: 2, right: 0.01, operator: "/", expected: 200, unit: "Pa", equation: "p = F / A", leftLabel: "force F", leftUnit: "N", rightLabel: "area A", rightUnit: "m^2", keywords: ["pressure", "molecular", "momentum"] },
    { key: "molecular-energy", label: "mean molecular kinetic energy", left: 1.5, right: 300, operator: "*", expected: 450, unit: "J", equation: "E = 3/2 k T", leftLabel: "3/2 k", leftUnit: "J K^-1", rightLabel: "temperature T", rightUnit: "K", keywords: ["kinetic", "gas", "temperature"] },
  ],
  nuclear: [
    { key: "decay-constant", label: "decay constant", left: 0.693, right: 12, operator: "/", expected: 0.05775, unit: "s^-1", equation: "lambda = ln 2 / t_half", leftLabel: "ln 2", leftUnit: "1", rightLabel: "half-life t_half", rightUnit: "s", keywords: ["decay", "half-life", "activity"] },
    { key: "mass-energy", label: "mass-energy release", left: 1e-6, right: 9e16, operator: "*", expected: 9e10, unit: "J", equation: "delta-E = delta-m c^2", leftLabel: "mass defect delta-m", leftUnit: "kg", rightLabel: "speed of light squared c^2", rightUnit: "m^2 s^-2", keywords: ["mass-energy", "binding", "fission", "fusion"] },
    { key: "radius-scale", label: "nuclear radius", left: 1.2, right: 3, operator: "*", expected: 3.6, unit: "fm", equation: "r = r_0 A^(1/3)", leftLabel: "nuclear radius constant r_0", leftUnit: "fm", rightLabel: "A^(1/3) factor", rightUnit: "1", keywords: ["radius", "nucleon"] },
  ],
  capacitance: [
    { key: "charge", label: "charge", left: 0.002, right: 12, operator: "*", expected: 0.024, unit: "C", equation: "Q = C V", leftLabel: "capacitance C", leftUnit: "F", rightLabel: "potential difference V", rightUnit: "V", keywords: ["charge", "capacitance"] },
    { key: "capacitor-energy", label: "energy stored", left: 0.012, right: 144, operator: "*", expected: 1.728, unit: "J", equation: "E = 0.5 C V^2", leftLabel: "half the capacitance 0.5C", leftUnit: "F", rightLabel: "voltage squared V^2", rightUnit: "V^2", keywords: ["energy", "stored"] },
    { key: "time-constant", label: "time constant", left: 4700, right: 0.001, operator: "*", expected: 4.7, unit: "s", equation: "tau = R C", leftLabel: "resistance R", leftUnit: "ohm", rightLabel: "capacitance C", rightUnit: "F", keywords: ["time", "charge", "discharge"] },
  ],
  "alternating-currents": [
    { key: "peak-voltage", label: "peak voltage", left: 230, right: 1.414, operator: "*", expected: 325.22, unit: "V", equation: "V_peak = V_rms sqrt 2", leftLabel: "rms voltage V_rms", leftUnit: "V", rightLabel: "square-root-of-two factor", rightUnit: "1", keywords: ["peak", "rms", "voltage"] },
    { key: "rms-current", label: "rms current", left: 4.2, right: 0.707, operator: "*", expected: 2.9694, unit: "A", equation: "I_rms = I_peak / sqrt 2", leftLabel: "peak current I_peak", leftUnit: "A", rightLabel: "one-over-square-root-two factor", rightUnit: "1", keywords: ["current", "rms"] },
  ],
  "medical-physics": [
    { key: "dose", label: "absorbed dose", left: 0.006, right: 2, operator: "/", expected: 0.003, unit: "Gy", equation: "dose = energy / mass", leftLabel: "absorbed energy", leftUnit: "J", rightLabel: "irradiated mass", rightUnit: "kg", keywords: ["dose", "radiation", "energy"] },
    { key: "magnification", label: "image magnification", left: 12, right: 3, operator: "/", expected: 4, unit: "1", equation: "magnification = image / object", leftLabel: "image length", leftUnit: "mm", rightLabel: "object length", rightUnit: "mm", keywords: ["image", "magnification", "ultrasound"] },
  ],
  "sports-physics": [
    { key: "kinetic-energy", label: "kinetic energy", left: 2, right: 25, operator: "*", expected: 50, unit: "J", equation: "E_k = 0.5 m v^2", leftLabel: "half the mass 0.5m", leftUnit: "kg", rightLabel: "speed squared v^2", rightUnit: "m^2 s^-2", keywords: ["kinetic", "energy", "speed"] },
    { key: "power", label: "average power", left: 720, right: 12, operator: "/", expected: 60, unit: "W", equation: "P = W / t", leftLabel: "work done W", leftUnit: "J", rightLabel: "time t", rightUnit: "s", keywords: ["power", "work", "performance"] },
  ],
  "energy-environment": [
    { key: "efficiency", label: "efficiency", left: 720, right: 900, operator: "/", expected: 0.8, unit: "1", equation: "efficiency = useful / input", leftLabel: "useful energy", leftUnit: "J", rightLabel: "input energy", rightUnit: "J", keywords: ["efficiency", "energy"] },
    { key: "energy-intensity", label: "energy per unit mass", left: 1200, right: 30, operator: "/", expected: 40, unit: "J kg^-1", equation: "specific energy = E / m", leftLabel: "energy E", leftUnit: "J", rightLabel: "mass m", rightUnit: "kg", keywords: ["environment", "mass", "energy"] },
  ],
  "practical-investigations": [
    { key: "gradient", label: "graph gradient", left: 8, right: 2, operator: "/", expected: 4, unit: "N m^-1", equation: "gradient = delta-y / delta-x", leftLabel: "change in y delta-y", leftUnit: "N", rightLabel: "change in x delta-x", rightUnit: "m", keywords: ["gradient", "graph", "relationship"] },
    { key: "percentage-uncertainty", label: "fractional uncertainty", left: 0.2, right: 10, operator: "/", expected: 0.02, unit: "1", equation: "fractional uncertainty = absolute / measured", leftLabel: "absolute uncertainty", leftUnit: "V", rightLabel: "measured value", rightUnit: "V", keywords: ["uncertainty", "error", "measurement"] },
  ],
  "orbits-universe": [
    { key: "orbital-speed", label: "orbital speed", left: 3.6e7, right: 6e6, operator: "/", expected: 6, unit: "m s^-1", equation: "v = circumference / period", leftLabel: "orbital circumference", leftUnit: "m", rightLabel: "orbital period", rightUnit: "s", keywords: ["orbit", "speed", "period"] },
    { key: "orbital-field", label: "gravitational field strength", left: 18, right: 3, operator: "/", expected: 6, unit: "N kg^-1", equation: "g = F / m", leftLabel: "gravitational force", leftUnit: "N", rightLabel: "satellite mass", rightUnit: "kg", keywords: ["field", "gravity", "inverse-square"] },
  ],
  "electromagnetic-induction": [
    { key: "induced-emf", label: "induced emf", left: 0.12, right: 0.04, operator: "/", expected: 3, unit: "V", equation: "emf = delta-flux / delta-t", leftLabel: "change in flux linkage", leftUnit: "Wb", rightLabel: "time interval", rightUnit: "s", keywords: ["emf", "faraday", "flux", "induction"] },
    { key: "flux", label: "magnetic flux", left: 0.6, right: 0.02, operator: "*", expected: 0.012, unit: "Wb", equation: "flux = B A", leftLabel: "magnetic flux density B", leftUnit: "T", rightLabel: "area A", rightUnit: "m^2", keywords: ["flux", "magnetic"] },
  ],
};

const DEMANDS: readonly LearningDemand[] = ["recall", "explanation", "application", "misconception", "calculation", "transfer", "synoptic"];
const DIFFICULTY: Record<LearningDemand, 1 | 2 | 3 | 4 | 5> = {
  recall: 1, explanation: 2, application: 3, misconception: 3, calculation: 3, transfer: 4, synoptic: 5,
};
const MARKS: Record<LearningDemand, number> = {
  recall: 1, explanation: 2, application: 2, misconception: 2, calculation: 4, transfer: 3, synoptic: 4,
};

function topicSlug(topicId: string): string {
  return topicId.slice(`${SUBJECT_ID}.`.length);
}

function calculate(left: number, right: number, operator: Formula["operator"]): number {
  switch (operator) {
    case "*": return left * right;
    case "/": return left / right;
    case "+": return left + right;
    case "-": return left - right;
  }
}

function formulaFor(slug: string, claim: string, variant: number): Formula | undefined {
  const options = FORMULAS[slug] ?? [];
  if (!options.length) return undefined;
  const normalised = claim.toLowerCase();
  // Prefer the relationship whose claim vocabulary overlaps most strongly.
  // A first-match rule let a generic word such as "energy" select work for a
  // gravitational-energy statement. Longer, more specific tokens win while
  // declaration order remains the deterministic tie-break.
  const selected = options
    .map((formula, index) => ({
      formula,
      index,
      score: formula.key.split("-").reduce((sum, token) => sum + (normalised.includes(token) ? token.length * 2 : 0), 0) +
        formula.keywords.reduce((sum, keyword) => sum + (normalised.includes(keyword) ? keyword.replace(/[^a-z0-9]/gi, "").length : 0), 0),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]!.formula;
  if (variant === 0) return selected;
  // Change the measured quantity while preserving the relationship. This
  // keeps the paired contexts genuinely different without changing a physical
  // constant such as h, c² or √2. Most relationships vary the right-hand
  // measurement; for formulae whose right operand is a named constant, vary
  // the measured left-hand quantity instead.
  const rightIsConstant = /planck|speed of light|square-root|one-over|ln 2|conversion|half-wavelength|2 pi/i.test(selected.rightLabel);
  const left = rightIsConstant ? selected.left * 1.25 : selected.left;
  const right = rightIsConstant ? selected.right : selected.right * 1.25;
  return { ...selected, left, right, expected: calculate(left, right, selected.operator) };
}

function calculationContext(topicTitle: string, claim: string, formula: Formula, variant: number): string {
  const direction = variant === 0 ? "A measurement" : "A second, independent measurement";
  return `${direction} in ${topicTitle.toLowerCase()} gives ${formula.leftLabel} = ${formula.left} ${formula.leftUnit} and ${formula.rightLabel} = ${formula.right} ${formula.rightUnit}. For the capability “${claim}”, show the equation ${formula.equation}, substitution, result, unit and sensible significant figures.`;
}

const COMMAND_WORDS = /^(state|define|describe|explain|calculate|use|apply|analyse|analyze|identify|relate|distinguish|interpret|evaluate|derive|recall)\s+/i;

function targetPhrase(claim: string): string {
  return claim.replace(COMMAND_WORDS, "").replace(/[.]$/, "");
}

function contextFor(topicTitle: string, demand: LearningDemand, variant: number, claim: string): string {
  const target = targetPhrase(claim).toLowerCase();
  const contexts = variant === 0
    ? {
        recall: `In a one-minute retrieval check on ${topicTitle.toLowerCase()}, state the definition, relationship or condition needed for ${target}.`,
        explanation: `A student is revising ${topicTitle.toLowerCase()}. Explain the physical reasoning behind ${target} and connect it to an observation.`,
        application: `A laboratory technician encounters a new apparatus involving ${topicTitle.toLowerCase()}. Apply the idea of ${target} to predict the outcome.`,
        misconception: `A student makes a claim about ${target} in ${topicTitle.toLowerCase()} that may be wrong. Diagnose the claim and replace it with the correct Physics.`,
        calculation: `A measurement in a ${topicTitle.toLowerCase()} experiment is recorded below. Show a complete calculation using the relevant specification relationship.`,
        transfer: `A design engineer uses an unfamiliar material or instrument involving ${topicTitle.toLowerCase()}. Transfer the idea of ${target} to this new context and justify the result.`,
        synoptic: `A multi-stage investigation links ${target} to another area of ${topicTitle.toLowerCase()}. Combine the ideas and reach a justified conclusion.`,
      }[demand]
    : {
        recall: `Without looking at notes, give a second concise statement that a WJEC examiner could credit for ${target}.`,
        explanation: `Explain how changing one variable in a ${topicTitle.toLowerCase()} scenario changes the measured quantity when ${target} is used.`,
        application: `A field scientist collects a fresh observation related to ${topicTitle.toLowerCase()}. Use ${target} to interpret the observation and state its implication.`,
        misconception: `Two answers about ${target} look plausible. Identify the tempting error, then explain which answer the evidence supports and why.`,
        calculation: `A second data set is collected for ${topicTitle.toLowerCase()}. Set out the equation, substitution, numerical result, unit and sensible precision.`,
        transfer: `A context from electronics, medicine or sport now uses the same ${target} capability. Work through the unfamiliar transfer and explain what stays invariant.`,
        synoptic: `A past-paper style problem combines ${target} with energy, fields, waves or data analysis. Select the links needed and defend your conclusion.`,
      }[demand];
  return contexts;
}

function contentTokens(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((token) => token.length > 3));
}

function groundedPoint(topic: Topic, claim: string): string {
  const claimTokens = contentTokens(claim);
  const candidate = topic.keyPoints
    .map((point) => ({ point, score: [...contentTokens(point)].filter((token) => claimTokens.has(token)).length }))
    .sort((a, b) => b.score - a.score || a.point.localeCompare(b.point))[0];
  return candidate?.point ?? claim;
}

function answerFor(claim: string, demand: LearningDemand, topic: Topic, variant: number): string {
  const topicTitle = topic.title;
  const grounded = groundedPoint(topic, claim);
  const tail = variant === 0 ? "Use the named quantities and the direction or condition stated in the question." : "State the condition, relationship and consequence explicitly.";
  switch (demand) {
    case "recall": return `The required statement is: ${grounded} ${tail}`;
    case "explanation": return `The relevant physical reason is that ${grounded.toLowerCase()}. This connects the capability to the observed change in ${topicTitle.toLowerCase()}. The observation supports this under the stated conditions; it is a causal explanation rather than a definition. A quantitative observation, direction and assumptions should be stated so another marker can reproduce the reasoning.`;
    case "application": return `Apply the statement to the apparatus: ${grounded.toLowerCase()}. This connects the capability to the measured outcome, which follows the stated relationship. The measured change is observable and the prediction is testable with the apparatus. State the units, direction and assumptions so the physical prediction can be checked.`;
    case "misconception": return `The proposed interpretation is incomplete. The tempting error is ${topic.commonErrors[variant % Math.max(1, topic.commonErrors.length)] ?? "a reversed relationship"}. The correct interpretation is that ${grounded.toLowerCase()}. This rejects the misconception and justifies the correction. State the units, direction and assumptions so the correction can be checked.`;
    case "calculation": return `Use the stated relationship for ${topicTitle.toLowerCase()}, show substitution and report the result with a unit and appropriate significant figures.`;
    case "transfer": return `The same capability transfers because ${grounded.toLowerCase()}. This connects the capability to an unfamiliar context and justifies why the governing relationship applies even though the surface details change. The invariant is the physical model, while the new apparatus supplies different observations. State the units, direction and assumptions so the transfer can be checked.`;
    case "synoptic": return `Link the ideas by using ${grounded.toLowerCase()} together with the relevant energy, field, wave or data principle. This links the capability to a second Physics principle, uses both relationships and defends the conclusion. The combined argument must remain dimensionally and physically consistent. State the units, direction and assumptions so the synthesis can be checked.`;
  }
}

function calculationAnswer(formula: Formula): string {
  const rendered = formula.expected.toPrecision(2);
  return [
    `method = ${formula.left} ${formula.operator} ${formula.right} = ${formula.expected}`,
    `value = ${formula.expected}`,
    `unit = ${rendered} ${formula.unit}`,
    `precision = ${rendered}`,
  ].join("\n");
}

function schemeFor(claim: string, demand: LearningDemand, topic: Topic, formula?: Formula): string[] {
  if (demand === "calculation" && formula) {
    return [
      `selects ${formula.equation}`,
      "substitutes the measured values with consistent units",
      `obtains ${formula.expected}`,
      `gives ${formula.unit} to appropriate significant figures`,
    ];
  }
  const marks = MARKS[demand];
  const grounded = groundedPoint(topic, claim);
  if (marks === 1) return [`states that ${grounded.toLowerCase()}`];
  const second = demand === "misconception"
    ? "rejects the tempting misconception and justifies the correction"
    : demand === "application"
      ? "connects the capability to the measured outcome"
      : demand === "explanation"
        ? "connects the capability to the observed change"
        : demand === "transfer"
          ? "connects the capability to an unfamiliar context"
          : demand === "synoptic"
            ? "links the capability to a second Physics principle"
            : "links the statement to the stated observation or conclusion";
  const later = demand === "transfer"
    ? ["justifies why the governing relationship applies"]
    : demand === "synoptic"
      ? ["uses both relationships", "defends the conclusion"]
      : [];
  return [`identifies that ${grounded.toLowerCase()}`, second, ...later].slice(0, marks);
}

function calculationRules(formula: Formula): NonNullable<QuestionPart["calculationRules"]> {
  return [
    { kind: "method", label: "method", expected: formula.expected, method: { operator: formula.operator, operands: [formula.left, formula.right] } },
    { kind: "accuracy", label: "value", expected: formula.expected },
    { kind: "unit", label: "unit", expected: formula.expected, unitAliases: [formula.unit] },
    { kind: "precision", label: "precision", expected: formula.expected, significantFigures: 2 },
  ];
}

function makeSpecs(): QuestionSpec[] {
  const specs: QuestionSpec[] = [];
  for (const topic of wjecPhysics.topics) {
    const slug = topicSlug(topic.id);
    for (const point of topic.specPoints ?? []) {
      const capabilityId = physicsCapabilityIdForSpecPoint(point.id);
      const claim = point.text.replace(/[.]$/, "");
      for (const demand of DEMANDS) {
        for (let variant = 0; variant < 2; variant++) {
          const formula = demand === "calculation" ? formulaFor(slug, claim, variant) : undefined;
          const marks = MARKS[demand];
          const prompt = formula
            ? calculationContext(topic.title, claim, formula, variant)
            : contextFor(topic.title, demand, variant, claim);
          const answer = formula ? calculationAnswer(formula) : answerFor(claim, demand, topic, variant);
          const scheme = schemeFor(claim, demand, topic, formula);
          const calculation = formula ? calculationRules(formula) : undefined;
          specs.push({
            slug: `wjec-physics-depth-${slug}-${point.id.split(".").at(-1)}-${demand}-${variant}`,
            subjectId: SUBJECT_ID,
            topics: [slug],
            kind: demand === "calculation" ? "calculation" : marks > 2 ? "structured" : "short",
            stem: prompt,
            difficulty: DIFFICULTY[demand],
            calculator: demand === "calculation",
            parts: [{
              prompt,
              marks,
              scheme,
              answer,
              aos: point.aos,
              specPointIds: [point.id],
              capabilityIds: [capabilityId],
              ...(calculation ? { calculationRules: calculation } : {}),
            }],
            source: "generated",
            // A generated depth question is useful for coverage immediately,
            // but never masquerades as checked examiner content.
            verification: "unverified",
            reviewer: null,
            lastChecked: null,
            specVersion: SPEC_VERSION,
            specPointIds: [point.id],
            learning: {
              familyId: `physics-depth:${point.id}:${demand}:${variant}`,
              contextId: `physics-context:${slug}:${point.id.split(".").at(-1)}:${demand}:${variant}`,
              demand,
              expectedMinutes: demand === "recall" ? 1 : demand === "calculation" ? 5 : demand === "synoptic" ? 6 : 3,
            },
          });
        }
      }
    }
  }
  return specs;
}

/** Complete per-statement × demand inventory, ready for moderation. */
export const wjecPhysicsDeepQuestions = defineQuestions(makeSpecs());
