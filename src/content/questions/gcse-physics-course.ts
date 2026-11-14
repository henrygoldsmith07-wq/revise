import type { AoCode, Question, QuestionKind } from "@/domain/types";
import { defineQuestions } from "./authoring";

// ---------------------------------------------------------------------------
// GCSE physics questions written for the GCSE outline (DfE subject content,
// ../../domain/curriculum/outlines/gcse-physics.ts), one for each topic the
// shared templates left without a question once they were placed on it
// (src/content/gcse-question-scope.ts): pressure, moments, electromagnetic
// waves, colour, mains power, static, magnets, the motor effect,
// transformers, density, latent heat, gas pressure, isotopes, radiation
// hazards, orbits and red-shift.
//
// Original items; no past-paper text. Each part is tagged to the outline
// statement it tests. Written by Revise and not teacher-reviewed: like every
// reference-tier question they are practice, never proof.
// ---------------------------------------------------------------------------

type Part = { prompt: string; marks: number; scheme: string[]; answer: string; claim: string; point: number; aos?: AoCode[] };
type Item = { slug: string; topic: string; stem: string; parts: Part[]; kind?: QuestionKind; difficulty?: 1 | 2 | 3 };

const p = (prompt: string, marks: number, scheme: string[], answer: string, claim: string, point: number, aos: AoCode[] = ["AO2"]): Part => ({ prompt, marks, scheme, answer, claim, point, aos });

const ITEMS: Item[] = [
  {
    slug: "diver-pressure",
    topic: "pressure-fluids",
    kind: "calculation",
    stem: "A diver swims 12 m below the surface of seawater. The density of seawater is 1030 kg/m³. Use g = 9.8 N/kg.",
    parts: [
      p("Calculate the pressure due to the seawater at this depth.", 2, ["pressure = height × density × g", "12 × 1030 × 9.8 = 1.2 × 10⁵ Pa (121 000 Pa)"], "Pressure = height × density × g, so p = 12 × 1030 × 9.8 ≈ 1.2 × 10⁵ Pa.", "calculate the pressure at a depth in a liquid", 4),
      p("Explain why the pressure on the diver increases as she swims deeper.", 2, ["there is a greater height (column) of water above her", "so a greater weight of water acts on each square metre (greater force per unit area)"], "Deeper down there is a taller column of water above her, so a greater weight of water presses on each square metre: the force per unit area is larger.", "explain why pressure in a liquid increases with depth", 3, ["AO1"]),
    ],
  },
  {
    slug: "spanner-moment",
    topic: "moments-levers-gears",
    kind: "calculation",
    stem: "A force of 40 N is applied at right angles to the end of a spanner 0.60 m long to turn a nut.",
    parts: [
      p("Calculate the moment of the force about the nut.", 2, ["moment = force × perpendicular distance from the pivot", "40 × 0.60 = 24 N m"], "Moment = 40 × 0.60 = 24 N m.", "calculate the moment of a force", 2),
      p("Suggest how the same moment could be produced with a smaller force.", 1, ["use a longer spanner, so the force acts further from the nut"], "Use a longer spanner, so the force acts at a greater distance from the nut.", "explain how a lever increases the turning effect of a force", 3, ["AO1"]),
    ],
  },
  {
    slug: "x-ray-imaging",
    topic: "electromagnetic-spectrum",
    stem: "X-rays are used in hospitals to take images of broken bones.",
    parts: [
      p("Explain how X-rays can be used to form an image of a bone.", 2, ["X-rays pass through (are transmitted by) soft tissue", "but are absorbed by bone, so the bone shows up on the detector"], "X-rays pass through soft tissue but are absorbed by bone, so the bone leaves a shadow on the detector.", "describe a practical use of X-rays", 5, ["AO1"]),
      p("Explain why the radiographer stands behind a screen while the X-ray is taken.", 2, ["X-rays are ionising and can damage cells (cause mutations or cancer)", "the radiographer is exposed many times, so the screen absorbs X-rays to reduce their dose"], "X-rays are ionising and can damage cells. A radiographer takes many images each day, so the screen absorbs the X-rays and keeps their total dose low.", "describe the hazardous effects of X-rays on human tissue", 5, ["AO1", "AO2"]),
    ],
  },
  {
    slug: "red-car-colour",
    topic: "lenses-colour-radiation",
    stem: "A car is painted red.",
    parts: [
      p("Explain why the car looks red in white light.", 2, ["the paint reflects red light", "and absorbs the other colours"], "The paint reflects the red part of white light and absorbs the other colours, so only red light reaches the eye.", "explain colour in terms of reflection and absorption", 2, ["AO1"]),
      p("Predict the colour of the car under a blue street lamp, and explain your answer.", 2, ["it looks black (very dark)", "there is no red light to reflect and the blue light is absorbed"], "It looks black: the lamp gives no red light for the paint to reflect, and the blue light is absorbed.", "apply differential absorption and reflection to predict colour", 2),
    ],
  },
  {
    slug: "kettle-power",
    topic: "mains-electricity-power",
    kind: "calculation",
    stem: "A kettle is connected to the 230 V mains supply and takes a current of 10 A.",
    parts: [
      p("Calculate the power of the kettle.", 2, ["power = potential difference × current", "230 × 10 = 2300 W"], "Power = potential difference × current, so P = 230 × 10 = 2300 W.", "calculate power from potential difference and current", 3),
      p("Calculate the energy the kettle transfers in 2 minutes.", 2, ["energy = power × time, with time in seconds (120 s)", "2300 × 120 = 276 000 J"], "E = Pt = 2300 × 120 = 276 000 J.", "calculate energy transferred from power and time", 6),
    ],
  },
  {
    slug: "charged-balloons",
    topic: "static-electricity",
    stem: "A balloon is rubbed on a wool jumper and becomes negatively charged.",
    parts: [
      p("Explain how the balloon becomes negatively charged.", 2, ["electrons are transferred", "from the jumper to the balloon"], "Rubbing transfers electrons from the jumper to the balloon, so the balloon gains extra negative charge.", "explain charging by friction as a transfer of electrons", 3, ["AO1"]),
      p("A second balloon, also negatively charged, is held near the first. Describe and explain what happens.", 2, ["the balloons repel (move apart)", "because like charges repel"], "The balloons push each other apart: both are negative, and like charges repel without touching.", "describe the force between charged objects", 2),
    ],
  },
  {
    slug: "induced-paper-clip",
    topic: "magnets-fields",
    stem: "A steel paper clip is placed near the north pole of a bar magnet.",
    parts: [
      p("Describe the difference between a permanent magnet and an induced magnet.", 2, ["a permanent magnet produces its own magnetic field", "an induced magnet becomes a magnet only when placed in a magnetic field"], "A permanent magnet makes its own magnetic field all the time; an induced magnet is magnetic only while it is in another magnet's field.", "distinguish permanent from induced magnets", 1, ["AO1"]),
      p("Explain why the paper clip is attracted to the magnet.", 2, ["the paper clip becomes an induced magnet", "induced magnetism always causes attraction"], "The magnet's field makes the paper clip an induced magnet, and induced magnetism always causes attraction, so the clip is pulled towards the magnet.", "explain attraction by induced magnetism", 1),
    ],
  },
  {
    slug: "force-on-wire",
    topic: "motor-effect",
    kind: "calculation",
    stem: "A wire carries a current of 3.0 A at right angles to a magnetic field of flux density 0.20 T. A 0.050 m length of the wire is in the field.",
    parts: [
      p("Calculate the force on the wire.", 2, ["force = magnetic flux density × current × length", "0.20 × 3.0 × 0.050 = 0.030 N"], "Force = magnetic flux density × current × length. F = 0.20 × 3.0 × 0.050 = 0.030 N, acting at right angles to both the wire and the field.", "calculate the force on a current-carrying conductor in a magnetic field", 4),
      p("State one change that would reverse the direction of the force.", 1, ["reverse the current (or reverse the direction of the magnetic field)"], "Reverse the direction of the current, or reverse the magnetic field.", "use Fleming's left-hand rule to relate the directions of force, current and field", 3, ["AO1"]),
    ],
  },
  {
    slug: "step-up-transformer",
    topic: "induction-transformers",
    kind: "calculation",
    stem: "A transformer has 200 turns on its primary coil and 4000 turns on its secondary coil. The primary coil is connected to a 12 V a.c. supply.",
    parts: [
      p("Calculate the potential difference across the secondary coil.", 2, ["Vs = Vp × Ns ÷ Np", "12 × 4000 ÷ 200 = 240 V"], "Vs = Vp × Ns/Np = 12 × 4000/200 = 240 V.", "use the transformer turns-ratio equation", 3),
      p("Explain why the transformer would not work with a 12 V d.c. supply.", 2, ["d.c. produces an unchanging magnetic field in the core", "so no potential difference is induced in the secondary coil"], "d.c. produces an unchanging magnetic field in the core, so no potential difference is induced in the secondary coil: only a changing field induces one.", "explain how a transformer depends on a changing magnetic field", 2, ["AO1"]),
    ],
  },
  {
    slug: "stone-density",
    topic: "density-states",
    kind: "calculation",
    stem: "A stone of mass 0.36 kg is lowered into a measuring cylinder. The water level rises from 50 cm³ to 170 cm³.",
    parts: [
      p("Calculate the density of the stone in kg/m³.", 3, ["volume = 170 − 50 = 120 cm³", "= 1.2 × 10⁻⁴ m³", "density = 0.36 ÷ 1.2 × 10⁻⁴ = 3000 kg/m³"], "Volume = 120 cm³ = 1.2 × 10⁻⁴ m³, so density = 0.36 ÷ 1.2 × 10⁻⁴ = 3000 kg/m³.", "calculate density from mass and displaced volume", 3),
      p("Explain why a gas has a much lower density than a solid.", 2, ["the particles in a gas are much further apart", "so there is much less mass in each cubic metre"], "Gas particles are far apart, so a cubic metre of gas contains much less mass than a cubic metre of a solid, whose particles are packed closely.", "explain density differences using the arrangement of particles", 1, ["AO1"]),
    ],
  },
  {
    slug: "melting-ice",
    topic: "internal-energy",
    kind: "calculation",
    stem: "0.50 kg of ice at 0 °C is melted. The specific latent heat of fusion of ice is 334 000 J/kg.",
    parts: [
      p("Calculate the energy needed to melt the ice.", 2, ["energy = mass × specific latent heat", "0.50 × 334 000 = 167 000 J"], "Energy = mass × specific latent heat. E = 0.50 × 334 000 = 167 000 J, all taken in at 0 °C with no rise in temperature.", "calculate the energy for a change of state", 3),
      p("Explain why the temperature of the ice does not rise while it is melting.", 2, ["the energy breaks the bonds (overcomes the forces) between the particles", "so it increases their potential energy, not their kinetic energy (temperature)"], "The energy supplied breaks the bonds holding the particles in the solid, increasing the internal energy without increasing the particles' kinetic energy, so the temperature stays at 0 °C.", "describe how heating can change state without changing temperature", 1, ["AO1"]),
    ],
  },
  {
    slug: "heated-can",
    topic: "gas-pressure",
    stem: "A sealed metal can of gas is heated. The volume of the can does not change.",
    parts: [
      p("Explain, in terms of particles, why the pressure inside the can increases.", 3, ["the particles gain kinetic energy (move faster)", "they collide with the walls more often", "and with more force, so the force on each unit area of the wall increases"], "Heating makes the gas particles move faster. They hit the walls more often and harder, so the force per unit area, the pressure, increases.", "explain the pressure of a gas at constant volume in terms of particle motion", 1, ["AO1", "AO2"]),
    ],
  },
  {
    slug: "carbon-isotopes",
    topic: "atoms-isotopes",
    stem: "Carbon-12 and carbon-14 are isotopes of carbon. The atomic number of carbon is 6.",
    parts: [
      p("State the number of protons and the number of neutrons in a carbon-14 nucleus.", 2, ["6 protons", "8 neutrons"], "6 protons and 14 − 6 = 8 neutrons.", "use atomic and mass numbers to find the particles in a nucleus", 4),
      p("Explain why carbon-12 and carbon-14 are isotopes of the same element.", 2, ["they have the same number of protons (6), so they are the same element", "but different numbers of neutrons"], "Both have 6 protons, which makes them carbon, but they have different numbers of neutrons (6 and 8), so they are isotopes.", "explain what isotopes are", 4, ["AO1"]),
    ],
  },
  {
    slug: "medical-tracer-choice",
    topic: "radiation-uses-hazards",
    stem: "A doctor uses a radioactive tracer to check how well a patient's kidneys are working.",
    parts: [
      p("Explain the difference between irradiation and contamination.", 2, ["irradiation is exposure to radiation from a source outside the body", "contamination is when radioactive material gets onto or into the body"], "Irradiation means being exposed to radiation from a source outside you; contamination means radioactive atoms get onto or into you, so you keep being exposed.", "distinguish irradiation from contamination", 1, ["AO1"]),
      p("The doctor chooses a gamma emitter with a half-life of 6 hours rather than one with a half-life of 6 years. Explain this choice.", 2, ["gamma radiation can pass out of the body to be detected", "a short half-life means the activity falls quickly, so the patient receives a smaller dose"], "Gamma rays pass out of the body to the detector, and with a 6-hour half-life the tracer's activity falls quickly, so the patient is exposed for only a short time.", "explain how half-life affects the hazard of a radioactive source", 2),
    ],
  },
  {
    slug: "satellite-orbit",
    topic: "solar-system-orbits",
    stem: "A satellite moves in a circular orbit around the Earth at a constant speed.",
    parts: [
      p("Explain why the satellite is accelerating even though its speed is constant.", 2, ["its direction keeps changing, so its velocity changes", "acceleration is a change in velocity"], "Its direction is always changing, so its velocity changes; a changing velocity is an acceleration.", "explain how an orbit can have constant speed but changing velocity", 2, ["AO1", "AO2"]),
      p("Name the force that keeps the satellite in its orbit.", 1, ["gravity (the gravitational pull of the Earth)"], "The Earth's gravitational pull.", "identify gravity as the force behind orbital motion", 2, ["AO1"]),
    ],
  },
  {
    slug: "galaxy-red-shift",
    topic: "red-shift-big-bang",
    stem: "Light from a distant galaxy is observed to be red-shifted.",
    parts: [
      p("State what this red-shift tells us about the galaxy.", 1, ["it is moving away from us"], "The galaxy is moving away from us.", "interpret red-shift as evidence that a galaxy is receding", 1, ["AO1"]),
      p("Explain how observations of red-shift support the Big Bang model.", 3, ["more distant galaxies have a greater red-shift", "so they are moving away faster", "so the universe is expanding, as if from a small, dense starting point (the Big Bang)"], "The further away a galaxy is, the greater its red-shift, so the faster it is receding. Everything is moving apart, so the universe is expanding, which fits it having started from a very small, dense region.", "explain how red-shift is evidence for the Big Bang", 3, ["AO1", "AO2"]),
    ],
  },
];

const BOARDS = ["aqa", "edexcel", "ocr", "wjec"] as const;

/** The pack's id prefix: a question with it was written for the GCSE outline. */
export const GCSE_PHYSICS_COURSE_PREFIX = "gcse-physics-course-";

const pad = (n: number) => String(n).padStart(2, "0");

export const gcsePhysicsCourseQuestions: Question[] = BOARDS.flatMap((board) => {
  const subjectId = `${board}-gcse-physics`;
  return defineQuestions(
    ITEMS.map((item) => ({
      slug: `${GCSE_PHYSICS_COURSE_PREFIX}${subjectId}-${item.slug}`,
      subjectId,
      topics: [item.topic],
      kind: item.kind ?? "structured",
      stem: item.stem,
      difficulty: item.difficulty ?? 2,
      calculator: true,
      source: "authored",
      verification: "unverified",
      reviewer: null,
      lastChecked: "2026-11-14",
      specVersion: "2024-1.0",
      parts: item.parts.map((part) => ({
        prompt: part.prompt,
        marks: part.marks,
        scheme: part.scheme,
        answer: part.answer,
        aos: part.aos,
        specPointIds: [`${subjectId}.${item.topic}.sp-${pad(part.point)}`],
        learningClaims: [part.claim],
      })),
    })),
  );
});
