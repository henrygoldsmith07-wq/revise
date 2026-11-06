import type { BoardUnit } from "../board-outline";

// AQA A-level Physics (7408), section by section, checked against the
// published specification (AQA-7407-7408-SP-2015) on 2026-11-06. Units are the
// specification's sections 3.1–3.8, plus the five options (3.9–3.13) of which
// a student studies one; references are AQA's own numbering.

export const AQA_PHYSICS_SPEC_CHECKED = "2026-11-06";

export const AQA_PHYSICS_UNITS: BoardUnit[] = [
  {
    slug: "section-3-1",
    title: "3.1 Measurements and their errors",
    topics: [{ topic: "measurements-errors", specRef: "3.1", pointRefs: ["3.1.1", "3.1.2", "3.1.2", "3.1.3"] }],
  },
  {
    slug: "section-3-2",
    title: "3.2 Particles and radiation",
    topics: [
      { topic: "particles", specRef: "3.2.1", pointRefs: ["3.2.1.1–3.2.1.2", "3.2.1.3", "3.2.1.4", "3.2.1.5–3.2.1.6", "3.2.1.7"] },
      {
        topic: "quantum",
        title: "Electromagnetic radiation and quantum phenomena",
        specRef: "3.2.2",
        pointRefs: ["3.2.2.1", "3.2.2.1", "3.2.2.1", "3.2.2.4", "3.2.2.4", "3.2.2.3", "3.2.2.2–3.2.2.3"],
      },
    ],
  },
  {
    slug: "section-3-3",
    title: "3.3 Waves",
    topics: [
      {
        topic: "waves",
        title: "Progressive and stationary waves; refraction, diffraction and interference",
        specRef: "3.3.1–3.3.2",
        pointRefs: ["3.3.1.1", "3.3.2.1–3.3.2.2", "3.3.1.3", "3.3.2.3", "3.3.1.2", "3.3.2.3", "3.3.2.1", "3.3.2.2"],
      },
    ],
  },
  {
    slug: "section-3-4",
    title: "3.4 Mechanics and materials",
    topics: [
      {
        topic: "kinematics-dynamics",
        title: "Vectors, moments, motion and Newton's laws",
        specRef: "3.4.1.1–3.4.1.5",
        pointRefs: ["3.4.1.1", "3.4.1.3", "3.4.1.3", "3.4.1.5", "3.4.1.3", "3.4.1.4", "3.4.1.4–3.4.1.5", "3.4.1.6"],
        addPoints: [{ ref: "3.4.1.2", text: "calculate moments, couples and the conditions for equilibrium, including centre of mass", aos: ["AO1", "AO2"] }],
      },
      // 7408 examines conservation of momentum in one dimension only.
      { topic: "momentum", specRef: "3.4.1.6", pointRefs: [undefined, undefined, undefined, undefined, null] },
      { topic: "energy-power", title: "Work, energy and power", specRef: "3.4.1.7–3.4.1.8", pointRefs: ["3.4.1.7", "3.4.1.8", "3.4.1.7", "3.4.1.7", "3.4.1.8", "3.4.1.7–3.4.1.8"] },
      { topic: "materials", title: "Materials", specRef: "3.4.2", pointRefs: ["3.4.2.2", "3.4.2.1", "3.4.2.1", "3.4.2.1", "3.4.2.1–3.4.2.2", "3.4.2.1"] },
    ],
  },
  {
    slug: "section-3-5",
    title: "3.5 Electricity",
    topics: [
      {
        topic: "electric-circuits",
        title: "Current electricity",
        specRef: "3.5.1",
        pointRefs: ["3.5.1.1", "3.5.1.4", "3.5.1.4", "3.5.1.1", "3.5.1.2", "3.5.1.5", "3.5.1"],
        addPoints: [
          { ref: "3.5.1.3", text: "use resistivity, describe how resistance varies with temperature for metals and thermistors, and describe superconductivity", aos: ["AO1", "AO2"] },
          { ref: "3.5.1.6", text: "use emf and internal resistance, including determining them from a graph of terminal pd against current", aos: ["AO2", "AO3"] },
        ],
      },
    ],
  },
  {
    slug: "section-3-6",
    title: "3.6 Further mechanics and thermal physics",
    topics: [
      { topic: "circular-shm", title: "Periodic motion", specRef: "3.6.1", pointRefs: ["3.6.1.1", "3.6.1.1", "3.6.1.2", "3.6.1.2", "3.6.1.3", "3.6.1.2", "3.6.1.4"] },
      { topic: "thermal", title: "Thermal physics", specRef: "3.6.2", pointRefs: ["3.6.2.1", "3.6.2.1", "3.6.2.2", "3.6.2.3", "3.6.2.3", "3.6.2.1–3.6.2.2"] },
    ],
  },
  {
    slug: "section-3-7",
    title: "3.7 Fields and their consequences",
    topics: [
      {
        topic: "fields",
        title: "Gravitational, electric and magnetic fields",
        specRef: "3.7.1–3.7.3, 3.7.5",
        pointRefs: ["3.7.2.1, 3.7.3.1", "3.7.2.2, 3.7.3.2", "3.7.2.3, 3.7.3.3", "3.7.2.4", "3.7.5.1–3.7.5.2", "3.7.5.1–3.7.5.2", "3.7.5.4", "3.7.5.3–3.7.5.4"],
        addPoints: [
          { ref: "3.7.5.5–3.7.5.6", text: "describe alternating currents with peak and rms values, the oscilloscope, and the operation and efficiency of transformers", aos: ["AO1", "AO2"] },
        ],
      },
      { topic: "capacitance", specRef: "3.7.4", pointRefs: ["3.7.4.1", "3.7.4.2", "3.7.4.3", "3.7.4.4"] },
    ],
  },
  {
    slug: "section-3-8",
    title: "3.8 Nuclear physics",
    topics: [
      {
        topic: "nuclear",
        title: "Radioactivity",
        specRef: "3.8.1",
        pointRefs: ["3.8.1.1", "3.8.1.5", "3.8.1.3", "3.8.1.6", "3.8.1.6–3.8.1.7", "3.2.1.5–3.2.1.6", "3.2.1.4"],
        addPoints: [
          { ref: "3.8.1.2", text: "compare the properties of alpha, beta and gamma radiation and apply the inverse-square law to gamma radiation", aos: ["AO1", "AO2"] },
          { ref: "3.8.1.4", text: "use a graph of N against Z to explain nuclear instability and the modes of decay" },
          { ref: "3.8.1.7–3.8.1.8", text: "describe induced fission and the thermal reactor, including moderators, control rods and the safety of radioactive waste", aos: ["AO1", "AO3"] },
        ],
      },
    ],
  },
  {
    slug: "options",
    title: "3.9–3.13 Options (one is studied)",
    topics: [
      { topic: "astrophysics", specRef: "3.9", pointRefs: ["3.9.1", "3.9.2", "3.9.2", "3.9.3"] },
      { topic: "medical-physics", specRef: "3.10", pointRefs: ["3.10.1–3.10.2", "3.10.3–3.10.4", "3.10.5", "3.10.6"] },
      { topic: "engineering-physics", specRef: "3.11", pointRefs: ["3.11.1", "3.11.1", "3.11.2", "3.11.2"] },
      { topic: "turning-points", specRef: "3.12", pointRefs: ["3.12.1", "3.12.1", "3.12.2", "3.12.3"] },
      { topic: "electronics", specRef: "3.13", pointRefs: ["3.13.1", "3.13.2", "3.13.3–3.13.4", "3.13.5–3.13.6"] },
    ],
  },
];
