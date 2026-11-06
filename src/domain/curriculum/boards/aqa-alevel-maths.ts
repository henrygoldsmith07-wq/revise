import type { BoardUnit } from "../board-outline";

// AQA A-level Mathematics (7357), checked against the published specification
// (AQA-7357-SP-2017) on 2026-11-06. AQA letters its content A–S; units group
// those letters into pure mathematics, statistics and mechanics, and the
// references are AQA's own (B3, OT1 and so on).

export const AQA_MATHS_SPEC_CHECKED = "2026-11-06";

export const AQA_MATHS_UNITS: BoardUnit[] = [
  {
    slug: "pure-a-j",
    title: "Pure mathematics (A–J)",
    topics: [
      { topic: "proof", title: "Proof", specRef: "A", pointRefs: ["A1", "A1", "OT1"] },
      {
        topic: "algebra",
        specRef: "B",
        pointRefs: ["B1–B2", "B3", "B6", "B4", "B5", "B7–B9"],
        addPoints: [
          { ref: "B10", text: "decompose rational functions into partial fractions with linear denominators, including a repeated factor", aos: ["AO1"] },
          { ref: "B11", text: "use functions in modelling and consider their limitations and refinements", aos: ["AO3"] },
        ],
      },
      {
        topic: "coordinate-geometry",
        title: "Coordinate geometry in the (x, y) plane",
        specRef: "C",
        pointRefs: ["C1–C2", "C2", "C1"],
        addPoints: [{ ref: "C3–C4", text: "use parametric equations of curves, convert between Cartesian and parametric forms and model with them", aos: ["AO1", "AO3"] }],
      },
      { topic: "sequences", title: "Sequences and series", specRef: "D", pointRefs: ["D2–D5", "D1", "D6"] },
      {
        topic: "trigonometry",
        specRef: "E",
        pointRefs: ["E1", "E5–E6", "E3, E7", "E2, E6"],
        addPoints: [
          { ref: "E4", text: "use secant, cosecant and cotangent and the inverse trigonometric functions with their graphs and domains" },
          { ref: "E8–E9", text: "construct proofs with trigonometric identities and solve problems in context, including vectors and kinematics", aos: ["AO2", "AO3"] },
        ],
      },
      {
        topic: "exponentials",
        title: "Exponentials and logarithms",
        specRef: "F",
        pointRefs: ["F1–F3", "F4", "F5", "F7"],
        addPoints: [{ ref: "F6", text: "use logarithmic graphs to estimate parameters in relationships of the form y = axⁿ and y = kbˣ", aos: ["AO1", "AO3"] }],
      },
      {
        topic: "differentiation",
        specRef: "G",
        pointRefs: ["G2", "G4", "G3", "G3"],
        addPoints: [
          { ref: "G1", text: "differentiate from first principles and interpret the second derivative as the rate of change of gradient, including convexity" },
          { ref: "G5–G6", text: "differentiate implicitly and parametrically and construct simple differential equations in context", aos: ["AO1", "AO3"] },
        ],
      },
      {
        topic: "integration",
        specRef: "H",
        pointRefs: ["H2", "H3", "H5", "H7–H8"],
        addPoints: [{ ref: "H1, H4, H6", text: "use the fundamental theorem of calculus, integration as the limit of a sum, and integration using partial fractions" }],
      },
      { topic: "numerical", title: "Numerical methods", specRef: "I", pointRefs: ["I1–I2", "I2", "I3"] },
      { topic: "vectors", specRef: "J", pointRefs: ["J1–J2", "J3", "J4–J5"] },
    ],
  },
  {
    slug: "statistics-k-o",
    title: "Statistics (K–O)",
    topics: [
      {
        topic: "statistical-sampling",
        title: "Statistical sampling and data presentation",
        specRef: "K–L",
        pointRefs: ["K1", "K1", "L1"],
        addPoints: [
          { ref: "L2–L4", text: "interpret scatter diagrams, regression lines and correlation, measures of location and spread including standard deviation, and outliers", aos: ["AO1", "AO2"] },
        ],
      },
      {
        topic: "probability",
        specRef: "M",
        pointRefs: ["M1", "M2", "M1"],
        addPoints: [{ ref: "M3", text: "model with probability and critique the assumptions made", aos: ["AO3"] }],
      },
      {
        topic: "distributions",
        specRef: "N–O",
        pointRefs: ["N1", "N2", "O2", "O1"],
        addPoints: [
          { ref: "N3", text: "select an appropriate probability distribution for a context and justify the choice", aos: ["AO3"] },
          { ref: "O3", text: "test a hypothesis about the mean of a Normal distribution with known variance, and about a correlation coefficient", aos: ["AO1", "AO2"] },
        ],
      },
    ],
  },
  {
    slug: "mechanics-p-s",
    title: "Mechanics (P–S)",
    topics: [
      {
        topic: "kinematics",
        title: "Quantities, units and kinematics",
        specRef: "P–Q",
        pointRefs: ["Q1, Q3", "Q2", "Q5", "Q4"],
        addPoints: [{ ref: "P1", text: "use SI base units and derived quantities and units such as velocity, acceleration, force and weight" }],
      },
      { topic: "forces", title: "Forces, Newton's laws and moments", specRef: "R–S", pointRefs: ["R1–R5", "R6", "S1", "Q4"] },
    ],
  },
];
