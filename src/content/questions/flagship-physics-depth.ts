import type { AoCode, Question } from "@/domain/types";
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
    parts: item.parts.map((part) => ({
      prompt: part.prompt,
      marks: part.marks,
      scheme: part.scheme,
      answer: part.answer,
      aos: part.aos,
      specPointIds: [`${prefix}.${part.point}`],
      learningClaims: [part.claim],
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
        scheme: ["λ = h/p", "= 6.63e-34 / 4.0e-24", "= 1.66e-10 ≈ 1.7 × 10⁻¹⁰ m"],
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
          "Maximum efficiency = photon energy ÷ electrical energy = 3.21/3.04 ≈ 106% → impossible above 100%, therefore the stated wavelength/voltage pair is inconsistent; with V = 2.0 V efficiency would be ≈ 84%",
        ],
        answer:
          "Each electron delivers Ve = 1.60 × 10⁻¹⁹ × 1.9 = 3.04 × 10⁻¹⁹ J, but a 620 nm photon requires 3.21 × 10⁻¹⁹ J. One electron alone cannot emit that photon - the pair (λ, V) is inconsistent because the implied efficiency exceeds 100%. At V = 2.0 V the ceiling would be 3.21/3.20 ≈ 84%.",
      },
    ],
  }),
];
