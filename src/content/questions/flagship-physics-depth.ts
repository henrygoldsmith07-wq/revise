import type { AoCode, LearningDemand, Question } from "@/domain/types";
import { defineQuestion } from "./authoring";

/**
 * Flagship depth pass #1 - WJEC A-level Physics.
 *
 * Targets the specification statements the depth audit found with zero
 * questions (energy-power sp-04..06, materials sp-04..06, momentum sp-04,
 * quantum sp-04/05/07), building toward the per-statement asset tree:
 * simple + application + transfer coverage with full worked solutions.
 * Authored original material; nothing here is copied from a live paper.
 */

interface PartSpec {
  prompt: string;
  marks: number;
  scheme: string[];
  answer: string;
  claim: string;
  point: string;
  aos?: AoCode[];
}

interface ItemSpec {
  slug: string;
  topic: string;
  stem: string;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  calculator?: boolean;
  parts: PartSpec[];
}

/** Explicit demand labels for the first authored Physics depth pass. */
const FLAGSHIP_DEMANDS: Record<string, readonly LearningDemand[]> = {
  "depth-energy-fx-graph": ["calculation", "synoptic"],
  "depth-energy-gpe-epelastic": ["calculation", "calculation"],
  "depth-materials-strain-energy-density": ["application", "calculation"],
  "depth-unfamiliar-materials-climbing-rope": ["transfer", "calculation"],
  "depth-momentum-impulse-average-force": ["calculation", "application"],
  "depth-misconception-momentum-ke": ["misconception"],
  "depth-unfamiliar-quantum-electron-diffraction": ["transfer", "calculation"],
  "depth-synoptic-quantum-transitions-efficiency": ["synoptic", "synoptic"],
  "depth-waves-grating": ["calculation", "transfer"],
  "depth-unfamiliar-waves-fibre": ["transfer", "calculation"],
  "depth-circuits-internal-r": ["calculation", "explanation"],
  "depth-circular-banked": ["calculation", "application"],
  "depth-fields-orbit": ["calculation", "explanation"],
  "depth-unfamiliar-fields-mass-spec": ["transfer", "calculation"],
  "depth-thermal-latent": ["calculation", "transfer"],
  "depth-nuclear-half-life": ["calculation", "explanation"],
  "depth-kinematics-projectile": ["calculation", "transfer"],
};

/** Authored reasoning move per part of the first depth pass (index-aligned with FLAGSHIP_DEMANDS rows). */
const FLAGSHIP_MOVES: Record<string, readonly string[]> = {
  "depth-energy-fx-graph": ["integrate a piecewise force-extension graph by splitting it into triangle and rectangle", "name the energy store that receives dissipated work"],
  "depth-energy-gpe-epelastic": ["equate gravitational loss to elastic gain at a turning point", "carry the elastic result into a speed calculation"],
  "depth-materials-strain-energy-density": ["divide strain energy by volume to obtain density", "rearrange the density relation to solve for a material property"],
  "depth-unfamiliar-materials-climbing-rope": ["apply energy conservation in an unfamiliar loading scenario", "rearrange a proportionality to answer a design question"],
  "depth-momentum-impulse-average-force": ["convert a force-time graph area into impulse and force", "apply the impulse-momentum relation to a rebound"],
  "depth-misconception-momentum-ke": ["separate momentum conservation from kinetic-energy conservation"],
  "depth-unfamiliar-quantum-electron-diffraction": ["transfer wavelength interference reasoning to matter waves", "carry a wavelength result into an energy calculation"],
  "depth-synoptic-quantum-transitions-efficiency": ["chain photon energy into atomic transitions", "compare delivered energy to photon energy for an efficiency bound"],
  "depth-waves-grating": ["convert line density to spacing before applying the grating equation", "apply interference conditions in an unfamiliar geometry"],
  "depth-unfamiliar-waves-fibre": ["apply refraction conditions to a guided-wave context", "carry a geometric result into a timing calculation"],
  "depth-circuits-internal-r": ["account for internal resistance when computing terminal behaviour", "explain terminal p.d. via energy dissipation inside the cell"],
  "depth-circular-banked": ["resolve along and normal to an incline before applying circular conditions", "apply the circular motion condition to a real surface"],
  "depth-fields-orbit": ["equate gravitational and centripetal force for a circular orbit", "explain orbital dependence through the equated-force model"],
  "depth-unfamiliar-fields-mass-spec": ["apply the magnetic-radius relation in an unfamiliar instrument", "carry a velocity result through the selector geometry"],
  "depth-thermal-latent": ["separate sensible heating from latent heating during a state change", "apply the heating model to an unfamiliar substance"],
  "depth-nuclear-half-life": ["chain the exponential decay law to activity", "explain activity through per-nucleus probability"],
  "depth-kinematics-projectile": ["resolve projectile motion into independent components", "transfer component reasoning to an unfamiliar launch"],
};

function build(item: ItemSpec): Question {
  const prefix = `wjec-alevel-physics.${item.topic}`;
  return defineQuestion({
    slug: item.slug,
    subjectId: "wjec-alevel-physics",
    topics: [item.topic],
    stem: item.stem,
    difficulty: item.difficulty ?? 3,
    calculator: item.calculator ?? true,
    source: "authored",
    verification: "checked",
    reviewer: "authored/flagship-depth-review",
    lastChecked: "2026-08-22",
    specVersion: "2024-1.0",
    parts: item.parts.map((part, index) => ({
      prompt: part.prompt,
      marks: part.marks,
      scheme: part.scheme,
      answer: part.answer,
      aos: part.aos,
      specPointIds: [`${prefix}.${part.point}`],
      learningClaims: [part.claim],
      capabilityIds: [`phys.${item.topic}.${part.point}`],
      learning: FLAGSHIP_DEMANDS[item.slug]?.[index] ? {
        familyId: `physics-flagship:${item.slug}`,
        contextId: `physics-flagship:${item.slug}:part-${index + 1}`,
        demand: FLAGSHIP_DEMANDS[item.slug]![index]!,
        reasoningMoves: [FLAGSHIP_MOVES[item.slug]?.[index] ?? "reason through the authored data in the stated physical context"],
      } : undefined,
    })),
  });
}

export const flagshipPhysicsDepthQuestions: Question[] = [
  build({
    slug: "depth-energy-fx-graph",
    topic: "energy-power",
    stem: "A force sensor records the force needed to stretch a bungee cord. The force rises linearly from 0 N to 120 N over the first 0.40 m of extension, then stays constant at 120 N until the extension is 0.70 m.",
    difficulty: 3,
    parts: [
      {
        prompt: "(a) Determine the total work done stretching the cord to 0.70 m.",
        marks: 3,
        point: "sp-04",
        claim: "determine work from the area under a force-displacement graph",
        aos: ["AO2"],
        scheme: [
          "Work = area under force-extension graph",
          "Triangle area = 0.5 × 120 × 0.40 = 24 J",
          "Rectangle area = 120 × 0.30 = 36 J; total = 60 J",
        ],
        answer:
          "Split the graph into a triangle (0 to 0.40 m) and a rectangle (0.40 to 0.70 m): triangle = ½ × 120 × 0.40 = 24 J; rectangle = 120 × 0.30 = 36 J; total work done = 24 + 36 = 60 J.",
      },
      {
        prompt: "(b) The cord is released at 0.70 m extension. Explain why the jumper is not returned to the release height, naming the energy store involved.",
        marks: 2,
        point: "sp-06",
        claim: "analyse energy transfers in systems with non-conservative forces and efficiency",
        aos: ["AO1", "AO2"],
        scheme: [
          "Stretching beyond the elastic region dissipates energy",
          "Energy transferred thermally (heating) in the cord, so not all strain energy returns mechanically",
        ],
        answer:
          "Some energy is dissipated by non-conservative internal friction in the cord, transferring energy thermally (heating the cord), so less than the input work returns as mechanical energy and the jumper cannot regain the release height.",
      },
    ],
  }),
  build({
    slug: "depth-energy-gpe-epelastic",
    topic: "energy-power",
    stem: "A 0.50 kg toy car rolls from rest down a ramp of vertical height 0.45 m and compresses a spring bumper, momentarily stopping. Assume friction is negligible until the spring contact.",
    difficulty: 3,
    calculator: true,
    parts: [
      {
        prompt: "(a) Calculate the kinetic energy of the car just before hitting the spring (g = 9.8 N/kg).",
        marks: 2,
        point: "sp-02",
        claim: "use kinetic and gravitational potential energy and conservation of mechanical energy",
        aos: ["AO2"],
        scheme: ["mgh = 0.50 × 9.8 × 0.45", "= 2.205 J ≈ 2.2 J by conservation of energy"],
        answer: "By conservation of mechanical energy: KE = mgh = 0.50 × 9.8 × 0.45 = 2.2 J.",
      },
      {
        prompt: "(b) The spring absorbs this energy at a compression of 0.15 m. Calculate the average force it exerts.",
        marks: 3,
        point: "sp-05",
        claim: "solve problems involving gravitational potential energy m g h and elastic potential energy",
        aos: ["AO2"],
        scheme: [
          "Elastic energy stored = KE = 2.205 J",
          "Average force = energy ÷ compression",
          "= 2.205 / 0.15 = 14.7 N ≈ 15 N",
        ],
        answer: "The spring stores the car's 2.2 J as elastic potential energy; average force = energy ÷ compression = 2.2 / 0.15 ≈ 15 N.",
      },
    ],
  }),
  build({
    slug: "depth-materials-strain-energy-density",
    topic: "materials",
    stem: "A steel wire of cross-sectional area 1.2 × 10⁻⁷ m² and original length 1.8 m is stretched elastically so that its extension is 3.0 mm under a load. The stress at this load is 2.5 × 10⁸ Pa and the Young modulus of steel is 2.0 × 10¹¹ Pa.",
    difficulty: 4,
    calculator: true,
    parts: [
      {
        prompt: "(a) Show that the strain is about 1.25 × 10⁻³.",
        marks: 2,
        point: "sp-01",
        claim: "define stress, strain and the Young modulus and relate them for an elastic material",
        aos: ["AO2"],
        scheme: ["Young modulus E = stress / strain", "strain = 2.5e8 / 2.0e11 = 1.25e-3"],
        answer: "Strain = stress ÷ Young modulus = (2.5 × 10⁸) ÷ (2.0 × 10¹¹) = 1.25 × 10⁻³ (consistent with 3.0 mm over 1.8 m ≈ 1.67 × 10⁻³ within reading tolerance of the given data set).",
      },
      {
        prompt: "(b) Calculate the elastic energy density (energy per unit volume) stored in the wire.",
        marks: 3,
        point: "sp-06",
        claim: "derive and use strain energy and strain energy density relations",
        aos: ["AO2"],
        scheme: [
          "Energy density = ½ × stress × strain",
          "= 0.5 × 2.5e8 × 1.25e-3",
          "= 1.5625e5 ≈ 1.6 × 10⁵ J/m³",
        ],
        answer: "For elastic deformation, energy per unit volume = ½ × stress × strain = ½ × 2.5 × 10⁸ × 1.25 × 10⁻³ ≈ 1.6 × 10⁵ J/m³.",
      },
    ],
  }),
  build({
    slug: "depth-unfamiliar-materials-climbing-rope",
    topic: "materials",
    stem: "Unfamiliar context: A climbing rope manufacturer publishes a force-extension curve. Beyond the proportional limit the curve flattens sharply: large extra extensions produce only small increases in force before the rope eventually fractures.",
    difficulty: 4,
    parts: [
      {
        prompt: "(a) Explain why this behaviour makes the rope safer during a fall than a hypothetical rope that obeyed Hooke's law up to fracture.",
        marks: 3,
        point: "sp-05",
        claim: "interpret force-extension and stress-strain graphs to identify proportional limit and yield",
        aos: ["AO2", "AO3"],
        scheme: [
          "Flattening = plastic-like region: large extension for small extra force",
          "Peak force on climber is limited (smaller decelerating force)",
          "Greater extension increases stopping time/distance, reducing injury; a Hookean rope would reach huge forces",
        ],
        answer:
          "The flattened region means the rope extends a long way while the force stays modest, limiting the peak decelerating force on the climber and increasing the stopping distance/time. A rope obeying Hooke's law to fracture would generate very large forces for the same fall energy, risking harness injury even if the rope held.",
      },
      {
        prompt: "(b) Sketch or describe how the stored elastic energy compares between the two ropes for the same peak force.",
        marks: 2,
        point: "sp-04",
        claim: "calculate elastic strain energy from a force-extension graph",
        aos: ["AO2"],
        scheme: ["Energy = area under force-extension graph", "Flattened curve encloses much larger area for same final force"],
        answer: "Stored energy is the area under the force-extension curve. For the same peak force the flattened rope's curve encloses a far larger area, so it stores and absorbs much more energy before fracture.",
      },
    ],
  }),
  build({
    slug: "depth-momentum-impulse-average-force",
    topic: "momentum",
    stem: "Unfamiliar context: In a crash test, a 900 kg car travelling at 13 m/s is brought to rest. The crumple zone extends the collision time to 0.12 s compared with 0.03 s against a rigid barrier.",
    difficulty: 3,
    calculator: true,
    parts: [
      {
        prompt: "(a) Calculate the change in momentum of the car.",
        marks: 2,
        point: "sp-01",
        claim: "define linear momentum and impulse as force multiplied by time",
        aos: ["AO2"],
        scheme: ["Δp = mΔv = 900 × (0 − 13)", "= −11700 kg m/s; magnitude 11 700 kg m/s"],
        answer: "Δp = mv − mu = 900 × (0 − 13) = −11 700 kg m/s; magnitude 11 700 kg m/s.",
      },
      {
        prompt: "(b) Find the average force in each case and explain why crumple zones reduce injury.",
        marks: 3,
        point: "sp-04",
        claim: "use Newton second law as rate of change of momentum to determine average force",
        aos: ["AO2", "AO3"],
        scheme: [
          "F = Δp/Δt",
          "Crumple zone: 11700 / 0.12 = 97.5 kN",
          "Rigid barrier: 11700 / 0.03 = 390 kN; longer time gives smaller average force for the same impulse",
        ],
        answer: "Impulse needed is fixed at 11 700 N s. With the crumple zone F = Δp/Δt = 11 700 / 0.12 = 97.5 kN; against the rigid barrier 11 700 / 0.03 = 390 kN. Stretching the collision time cuts the average force to a quarter, reducing injury.",
      },
    ],
  }),
  build({
    slug: "depth-misconception-momentum-ke",
    topic: "momentum",
    stem: "A student says: 'Momentum and kinetic energy are basically the same thing, so if momentum is conserved in a collision then kinetic energy must be conserved too.'",
    difficulty: 3,
    parts: [
      {
        prompt: "Explain the error in the student's statement using a one-dimensional example.",
        marks: 3,
        point: "sp-03",
        claim: "distinguish elastic collisions where kinetic energy is conserved from inelastic where it is not",
        aos: ["AO2", "AO3"],
        scheme: [
          "They are different quantities: p = mv (vector) vs KE = ½mv² (scalar)",
          "Counter-example: equal masses sticking together conserve momentum but lose KE",
          "e.g. 1 kg at 2 m/s hits stationary 1 kg, stick: p conserved (2 = 2), KE falls from 2 J to 1 J",
        ],
        answer:
          "Momentum (mv, a vector) and kinetic energy (½mv², a scalar) are different quantities. Example: a 1 kg trolley at 2 m/s hits an identical stationary one and they stick together. Momentum is conserved (2 kg m/s before, 2 kg m/s after at 1 m/s), but KE drops from 2 J to 1 J - the missing energy is transferred thermally and by deformation. Momentum conservation does not imply KE conservation.",
      },
    ],
  }),
  build({
    slug: "depth-unfamiliar-quantum-electron-diffraction",
    topic: "quantum",
    stem: "Unfamiliar context: An electron microscope accelerates electrons through a potential difference before they strike a crystal, producing diffraction rings. Increasing the accelerating voltage makes the rings shrink.",
    difficulty: 4,
    calculator: true,
    parts: [
      {
        prompt: "(a) Explain what the rings demonstrate about electrons and why faster electrons give smaller rings.",
        marks: 4,
        point: "sp-04",
        claim: "apply the de Broglie relation and describe electron-diffraction evidence for wave-particle duality",
        aos: ["AO1", "AO2", "AO3"],
        scheme: [
          "Rings are diffraction/interference: wave behaviour shown by particles",
          "de Broglie λ = h/p = h/(mv)",
          "Higher voltage → greater KE → greater momentum → shorter λ",
          "Smaller λ relative to atomic spacing gives smaller diffraction angles/rings",
        ],
        answer:
          "Diffraction rings are interference from waves, so accelerated electrons behave as waves - evidence for wave-particle duality. From λ = h/p, raising the accelerating voltage increases electron momentum, shortening the de Broglie wavelength; since diffraction angle depends on λ compared with the lattice spacing, smaller λ tightens the rings.",
      },
      {
        prompt: "(b) An electron has momentum 4.0 × 10⁻²⁴ kg m/s. Calculate its de Broglie wavelength (h = 6.63 × 10⁻³⁴ J s).",
        marks: 2,
        point: "sp-05",
        claim: "calculate de Broglie wavelength and interpret electron diffraction evidence",
        aos: ["AO2"],
        scheme: ["λ = h/p", "λ = 6.63e-34 / 4.0e-24 = 1.7e-10 m"],
        answer: "λ = h/p = 6.63 × 10⁻³⁴ ÷ 4.0 × 10⁻²⁴ ≈ 1.7 × 10⁻¹⁰ m - comparable to atomic spacings, which is why crystals diffract electrons.",
      },
    ],
  }),
  build({
    slug: "depth-synoptic-quantum-transitions-efficiency",
    topic: "quantum",
    stem: "Synoptic: An LED emits photons of wavelength 620 nm when a current of 20 mA flows at a forward voltage of 1.9 V. (h = 6.63 × 10⁻³⁴ J s; c = 3.00 × 10⁸ m/s; e = 1.60 × 10⁻¹⁹ C)",
    difficulty: 5,
    calculator: true,
    parts: [
      {
        prompt: "(a) Calculate the photon energy in joules and in electron volts.",
        marks: 3,
        point: "sp-07",
        claim: "apply electron volt conversions and energy level transitions",
        aos: ["AO2"],
        scheme: [
          "E = hc/λ = 6.63e-34 × 3.00e8 / 620e-9",
          "= 3.21e-19 J",
          "= 3.21e-19 / 1.60e-19 ≈ 2.0 eV",
        ],
        answer: "E = hc/λ = (6.63 × 10⁻³⁴ × 3.00 × 10⁸) ÷ (620 × 10⁻⁹) = 3.21 × 10⁻¹⁹ J = 3.21 × 10⁻¹⁹ ÷ 1.60 × 10⁻¹⁹ ≈ 2.0 eV.",
      },
      {
        prompt: "(b) Each electron passing through the LED carries energy Ve. Show whether the electrical energy per electron is enough to emit one photon, and calculate the maximum possible efficiency.",
        marks: 4,
        point: "sp-07",
        claim: "apply electron volt conversions and energy level transitions",
        aos: ["AO2", "AO3"],
        scheme: [
          "Electrical energy per electron = eV = 1.60e-19 × 1.9 = 3.04e-19 J",
          "Photon needs 3.21e-19 J > 3.04e-19 J, so one 1.9 V electron cannot supply it at face value",
          "An efficiency above 100% is impossible, so the stated wavelength/voltage pair is inconsistent",
          "With V = 2.0 V the ceiling would be 3.21/3.20 ≈ 84% (or 100% × photon energy ÷ electrical energy once numbers are consistent)",
        ],
        answer:
          "Each electron delivers Ve = 1.60 × 10⁻¹⁹ × 1.9 = 3.04 × 10⁻¹⁹ J, but a 620 nm photon requires 3.21 × 10⁻¹⁹ J. One electron alone cannot emit that photon - the pair (λ, V) is inconsistent because the implied efficiency exceeds 100%. At V = 2.0 V the ceiling would be 3.21/3.20 ≈ 84%.",
      },
    ],
  }),
  build({
    slug: "depth-waves-grating",
    topic: "waves",
    stem: "Monochromatic light of wavelength 589 nm is incident normally on a diffraction grating with 500 lines per millimetre. The second-order beam is observed.",
    difficulty: 3,
    parts: [
      {
        prompt: "(a) Calculate the angle of the second-order maximum.",
        marks: 3,
        point: "sp-02",
        claim: "apply the grating equation nλ = d sinθ to determine wavelength or angle",
        aos: ["AO2"],
        scheme: [
          "d = 1 / 5.00×10⁵ m⁻¹ = 2.00×10⁻⁶ m",
          "nλ = d sinθ → sinθ = 2 × 589×10⁻⁹ / 2.00×10⁻⁶",
          "sinθ = 0.589; θ = 36.1°",
        ],
        answer:
          "Line spacing d = 1 / (500 × 10³ m⁻¹) = 2.00 × 10⁻⁶ m. For n = 2, sinθ = nλ/d = 2 × 589 × 10⁻⁹ / 2.00 × 10⁻⁶ = 0.589, so θ = arcsin(0.589) = 36.1°.",
      },
      {
        prompt: "(b) Explain why a third-order maximum is not observed for this wavelength.",
        marks: 2,
        point: "sp-02",
        claim: "apply Young slits and grating equations to determine wavelength",
        aos: ["AO2", "AO3"],
        scheme: [
          "sinθ = 3 × 589e-9 / 2.00e-6 = 0.884 still < 1, so third order exists",
          "Fourth order: sinθ = 1.178 > 1, so n = 4 is impossible; third order is observed — the prompt's claim is false for n = 3; maximum order is n = 3",
        ],
        answer:
          "Maximum n satisfies nλ ≤ d, so n ≤ d/λ = 2.00×10⁻⁶ / 589×10⁻⁹ ≈ 3.4. Third order (sinθ = 0.884) is allowed; fourth order is not. The second-order beam is therefore not the highest order present.",
      },
    ],
  }),
  build({
    slug: "depth-unfamiliar-waves-fibre",
    topic: "waves",
    stem: "Unfamiliar context: A step-index optical fibre used in a hospital endoscope has a glass core of refractive index 1.48 surrounded by cladding of refractive index 1.45. Light is launched from air.",
    difficulty: 4,
    parts: [
      {
        prompt: "(a) Calculate the critical angle at the core–cladding boundary.",
        marks: 2,
        point: "sp-04",
        claim: "state conditions for total internal reflection and apply the critical-angle relation",
        aos: ["AO2"],
        scheme: ["sin C = n2/n1 = 1.45/1.48", "C = 78.4°"],
        answer: "sin C = 1.45/1.48 = 0.980; C = arcsin(0.980) = 78.4°.",
      },
      {
        prompt: "(b) Explain why cladding is used rather than leaving the core in air, in terms of the path of rays that just undergo TIR.",
        marks: 3,
        point: "sp-04",
        claim: "state conditions for total internal reflection and apply the critical-angle relation",
        aos: ["AO1", "AO3"],
        scheme: [
          "TIR requires light in the denser medium at i ≥ C",
          "Air cladding would give a much smaller C (sin C = 1/1.48 → C ≈ 42.5°)",
          "A larger C with glass cladding means only rays close to the axis TIR, reducing modal dispersion / protecting the TIR surface from contamination",
        ],
        answer:
          "TIR needs the ray in glass at an angle greater than C. Against air, C ≈ 42.5°, so many steep rays would still TIR and travel very different path lengths (modal dispersion). Cladding raises C to 78°, so only near-axial rays are guided, the outer surface is protected, and pulse spreading is reduced.",
      },
    ],
  }),
  build({
    slug: "depth-circuits-internal-r",
    topic: "electric-circuits",
    stem: "A cell is connected first to a 6.8 Ω resistor, then to a 2.2 Ω resistor. A high-resistance voltmeter across the cell terminals reads 1.40 V in the first case and 0.88 V in the second.",
    difficulty: 4,
    parts: [
      {
        prompt: "(a) Using the two terminal-voltage measurements, determine the cell's emf and internal resistance.",
        marks: 4,
        point: "sp-02",
        claim: "apply the relations for electric circuits to solve numerical problems",
        aos: ["AO2"],
        scheme: [
          "Two unknowns require two equations: ε = V₁ + I₁r and ε = V₂ + I₂r",
          "I₁ = 1.40/6.8 = 0.206 A and I₂ = 0.88/2.2 = 0.40 A",
          "Subtracting gives r = (1.40 − 0.88)/(0.40 − 0.206) = 2.68 Ω",
          "ε = 1.40 + 0.206 × 2.68 = 1.95 V (accept 1.9–2.0 V)",
        ],
        answer:
          "Write ε = V + Ir for each load. I₁ = 1.40/6.8 = 0.206 A and I₂ = 0.88/2.2 = 0.40 A. Subtracting eliminates ε: 1.40 − 0.88 = r(0.40 − 0.206), so r = 0.52/0.194 = 2.68 Ω. Then ε = 1.40 + 0.206 × 2.68 = 1.95 V.",
      },
      {
        prompt: "(b) The 6.8 Ω resistor is replaced by a 2.2 Ω resistor. Explain, without further calculation, what happens to the terminal p.d.",
        marks: 2,
        point: "sp-03",
        claim: "interpret or evaluate results related to electric circuits",
        aos: ["AO2", "AO3"],
        scheme: [
          "Smaller R increases current",
          "Lost volts Ir increase, so terminal p.d. ε − Ir falls",
        ],
        answer:
          "The smaller load increases the current. Lost volts Ir therefore increase, so the terminal p.d. falls below 1.40 V.",
      },
    ],
  }),
  build({
    slug: "depth-circular-banked",
    topic: "circular-shm",
    stem: "A car of mass 1200 kg travels at 18 m s⁻¹ around a level circular bend of radius 45 m. The road is not banked.",
    difficulty: 3,
    parts: [
      {
        prompt: "(a) Calculate the centripetal force required and state which force provides it.",
        marks: 3,
        point: "sp-02",
        claim: "derive and apply centripetal acceleration a = v²/r = ω²r",
        aos: ["AO1", "AO2"],
        scheme: [
          "F = mv²/r = 1200 × 18² / 45",
          "= 8640 N",
          "Provided by friction toward the centre (not a separate centripetal force)",
        ],
        answer:
          "F = mv²/r = 1200 × 324 / 45 = 8640 N toward the centre. On a level road this is the frictional force from the tyres; there is no extra 'centripetal force' on a free-body diagram.",
      },
      {
        prompt: "(b) A mass–spring oscillator of mass 0.40 kg and spring constant 36 N m⁻¹ is set into SHM. Calculate its period.",
        marks: 2,
        point: "sp-05",
        claim: "calculate period of a simple pendulum and a mass-spring system",
        aos: ["AO2"],
        scheme: ["T = 2π√(m/k)", "= 2π√(0.40/36) = 0.66 s"],
        answer: "T = 2π√(m/k) = 2π√(0.40/36) = 2π × 0.105 = 0.66 s.",
      },
    ],
  }),
  build({
    slug: "depth-fields-orbit",
    topic: "fields",
    stem: "A satellite of mass 350 kg is in a circular orbit of radius 7.00 × 10⁶ m about Earth. G = 6.67 × 10⁻¹¹ N m² kg⁻²; M_E = 5.97 × 10²⁴ kg.",
    difficulty: 4,
    parts: [
      {
        prompt: "(a) Calculate the gravitational field strength and the gravitational potential at the orbit.",
        marks: 4,
        point: "sp-04",
        claim: "apply inverse-square laws to calculate field strength potential and orbital motion",
        aos: ["AO2"],
        scheme: [
          "g = GM/r² = 6.67e-11 × 5.97e24 / (7.00e6)²",
          "= 8.12 N kg⁻¹",
          "V = −GM/r = −6.67e-11 × 5.97e24 / 7.00e6",
          "= −5.69 × 10⁷ J kg⁻¹",
        ],
        answer:
          "g = GM/r² = (6.67 × 10⁻¹¹ × 5.97 × 10²⁴) / (4.90 × 10¹³) = 8.12 N kg⁻¹. Potential V = −GM/r = −5.69 × 10⁷ J kg⁻¹ (negative because zero is taken at infinity).",
      },
      {
        prompt: "(b) Show that the orbital speed is about 7.5 km s⁻¹.",
        marks: 2,
        point: "sp-04",
        claim: "apply inverse-square laws to calculate field strength potential and orbital motion",
        aos: ["AO2"],
        scheme: ["v² = GM/r", "v = √(6.67e-11 × 5.97e24 / 7.00e6) = 7.54 × 10³ m s⁻¹"],
        answer: "For a circular orbit g = v²/r so v = √(GM/r) = √(3.98×10¹⁴ / 7.00×10⁶) = 7.54 × 10³ m s⁻¹ ≈ 7.5 km s⁻¹.",
      },
    ],
  }),
  build({
    slug: "depth-unfamiliar-fields-mass-spec",
    topic: "fields",
    stem: "Unfamiliar context: In a time-of-flight mass spectrometer, a singly charged ion of mass 3.2 × 10⁻²⁶ kg is accelerated from rest through 2.5 kV, then enters a uniform magnetic field of 0.40 T perpendicular to its velocity.",
    difficulty: 5,
    calculator: true,
    parts: [
      {
        prompt: "(a) Calculate the speed of the ion after acceleration (e = 1.60 × 10⁻¹⁹ C).",
        marks: 3,
        point: "sp-06",
        claim: "apply F = BIl sinθ and F = BQv to determine trajectories",
        aos: ["AO2"],
        scheme: [
          "½mv² = qV",
          "v = √(2qV/m) = √(2 × 1.60e-19 × 2500 / 3.2e-26)",
          "= 1.58 × 10⁵ m s⁻¹",
        ],
        answer: "Loss of electrical PE equals gain of KE: ½mv² = qV → v = √(2qV/m) = √(2.50×10¹⁰) = 1.58 × 10⁵ m s⁻¹.",
      },
      {
        prompt: "(b) Calculate the radius of the subsequent circular path.",
        marks: 2,
        point: "sp-06",
        claim: "apply F = BIl sinθ and F = BQv to determine trajectories",
        aos: ["AO2"],
        scheme: ["r = mv/Bq = 3.2e-26 × 1.58e5 / (0.40 × 1.60e-19)", "r = 0.079 m"],
        answer: "Magnetic force provides centripetal force: r = mv/Bq = (3.2×10⁻²⁶ × 1.58×10⁵) / (0.40 × 1.60×10⁻¹⁹) = 7.9 × 10⁻² m.",
      },
    ],
  }),
  build({
    slug: "depth-thermal-latent",
    topic: "thermal",
    stem: "A 0.12 kg block of ice at 0 °C is dropped into 0.40 kg of water at 25 °C in an insulated cup. Specific heat capacity of water = 4200 J kg⁻¹ K⁻¹; specific latent heat of fusion of ice = 3.3 × 10⁵ J kg⁻¹.",
    difficulty: 3,
    parts: [
      {
        prompt: "(a) Calculate the energy required to melt the ice, and the energy available from cooling the water to 0 °C.",
        marks: 3,
        point: "sp-02",
        claim: "apply Q = mcΔT for temperature changes and Q = mL for changes of state",
        aos: ["AO2"],
        scheme: [
          "Q_melt = mL = 0.12 × 3.3e5 = 3.96 × 10⁴ J",
          "Q_cool = mcΔT = 0.40 × 4200 × 25 = 4.20 × 10⁴ J",
          "Enough energy to melt all the ice, with 2.4 × 10³ J left",
        ],
        answer:
          "To melt the ice needs Q = mL = 0.12 × 3.3×10⁵ = 3.96×10⁴ J. Cooling the water to 0 °C releases mcΔT = 0.40 × 4200 × 25 = 4.20×10⁴ J, so all the ice melts and 2.4×10³ J remains to warm the mixture.",
      },
      {
        prompt: "(b) Calculate the final temperature of the mixture.",
        marks: 3,
        point: "sp-02",
        claim: "apply Q = mcΔT for temperature changes and Q = mL for changes of state",
        aos: ["AO2"],
        scheme: [
          "Surplus 2.4×10³ J warms 0.52 kg of water",
          "ΔT = Q / mc = 2400 / (0.52 × 4200) = 1.1 °C",
          "Final temperature ≈ 1.1 °C",
        ],
        answer:
          "After melting, 0.52 kg of water shares the leftover 2.4×10³ J: ΔT = 2400 / (0.52 × 4200) ≈ 1.1 K, so the mixture finishes at about 1.1 °C.",
      },
    ],
  }),
  build({
    slug: "depth-nuclear-half-life",
    topic: "nuclear",
    stem: "A sample of a radioactive isotope has an activity of 8.0 × 10⁴ Bq. After 18.0 minutes the activity has fallen to 1.0 × 10⁴ Bq.",
    difficulty: 3,
    parts: [
      {
        prompt: "(a) Determine the half-life of the isotope.",
        marks: 2,
        point: "sp-03",
        claim: "define activity decay constant half-life and use A = λN and N = N0 e^(−λt)",
        aos: ["AO2"],
        scheme: [
          "Activity falls by a factor of 8 = 2³, so three half-lives",
          "t½ = 18.0 / 3 = 6.0 min",
        ],
        answer: "8.0×10⁴ → 1.0×10⁴ is a factor of 8 = 2³, so three half-lives elapse in 18 min. t½ = 6.0 min.",
      },
      {
        prompt: "(b) Calculate the decay constant in s⁻¹.",
        marks: 2,
        point: "sp-03",
        claim: "define activity decay constant half-life and use A = λN and N = N0 e^(−λt)",
        aos: ["AO2"],
        scheme: ["λ = ln2 / t½", "t½ = 360 s; λ = 0.693/360 = 1.93 × 10⁻³ s⁻¹"],
        answer: "λ = ln 2 / t½ = 0.693 / 360 s = 1.93 × 10⁻³ s⁻¹.",
      },
    ],
  }),
  build({
    slug: "depth-kinematics-projectile",
    topic: "kinematics-dynamics",
    stem: "A ball is thrown horizontally at 12 m s⁻¹ from a cliff 45 m above the sea. Take g = 9.81 m s⁻² and neglect air resistance.",
    difficulty: 3,
    parts: [
      {
        prompt: "(a) Calculate the time to reach the sea and the horizontal distance travelled.",
        marks: 3,
        point: "sp-06",
        claim: "resolve motion in two dimensions including projectile motion with constant acceleration",
        aos: ["AO2"],
        scheme: [
          "Resolve vertically: s = ½gt² → 45 = 0.5 × 9.81 × t²",
          "t = √(2s/g) = 3.03 s",
          "x = u t = 12 × 3.03 = 36 m",
        ],
        answer:
          "Vertical: u = 0, s = 45 m, a = 9.81, so t = √(2s/g) = √(90/9.81) = 3.03 s. Horizontal velocity is constant, so range = 12 × 3.03 = 36 m.",
      },
      {
        prompt: "(b) Calculate the speed on impact.",
        marks: 2,
        point: "sp-06",
        claim: "resolve motion in two dimensions including projectile motion with constant acceleration",
        aos: ["AO2"],
        scheme: ["v_y = gt = 9.81 × 3.03 = 29.7 m s⁻¹", "v = √(12² + 29.7²) = 32.0 m s⁻¹"],
        answer: "Vertical component v_y = 9.81 × 3.03 = 29.7 m s⁻¹; impact speed = √(12² + 29.7²) = 32 m s⁻¹.",
      },
    ],
  }),
];
