import type { LearningDemand, Question } from "@/domain/types";
import { defineQuestion } from "./authoring";

const S = "wjec-alevel-physics";

/**
 * Authored single-part items for the WJEC Physics specification statements
 * that previously had no mapped question part at all (the audit's
 * `missing-mapping` rows). Each item isolates exactly one statement, maps to
 * its capability, and carries family/context/reasoning metadata for review.
 * Metadata alone does not establish that an item is a distinct reasoning family.
 *
 * Original AI-drafted material; no human approval is implied.
 */

type StatementItem = {
  topic: string;
  point: number;
  demand: LearningDemand;
  family: string;
  context: string;
  move: string;
  prompt: string;
  marks: number;
  scheme: string[];
  answer: string;
};

const ITEMS: StatementItem[] = [
  // circular-shm sp-06: energy interchange during SHM
  { topic: "circular-shm", point: 6, demand: "explanation", family: "physics-statements:shm-energy", context: "physics-statements:shm-energy:quarter-cycle", move: "track kinetic and potential energy stores through a quarter-cycle of oscillation",
    prompt: "A mass oscillates on a spring with simple harmonic motion. Describe how its kinetic energy and elastic potential energy vary as it moves from equilibrium to maximum displacement, and state where each store is greatest.",
    marks: 3,
    scheme: ["At equilibrium the speed is greatest, so kinetic energy is maximum", "At maximum displacement the speed is zero, so kinetic energy is zero", "Potential energy is maximum at maximum displacement and minimum at equilibrium; the total remains constant in an ideal system"],
    answer: "At equilibrium the mass moves fastest, so kinetic energy is greatest there and potential energy is least. At maximum displacement the mass is momentarily at rest: kinetic energy is zero and potential energy is greatest. In an ideal (undamped) system the total energy stays constant, continuously exchanging between the two stores." },
  // circular-shm sp-07: damping and resonance
  { topic: "circular-shm", point: 7, demand: "explanation", family: "physics-statements:resonance-peak", context: "physics-statements:resonance-peak:amplitude-response", move: "relate damping to the height and width of a resonance curve",
    prompt: "A washing machine vibrates strongly near one spin speed. Explain what this reveals about the driving frequency, and how increasing damping would change the amplitude-frequency response.",
    marks: 3,
    scheme: ["The strong response occurs when the driving frequency matches (or nears) the natural frequency: resonance", "Damping reduces the maximum amplitude at resonance", "Damping broadens the response over a wider frequency range and shifts the peak slightly below the natural frequency"],
    answer: "The large-amplitude vibration shows the spin speed's driving frequency is close to the machine's natural frequency: resonance. Adding damping lowers the peak amplitude, spreads the response over a wider band of frequencies, and moves the maximum slightly below the natural frequency." },
  // electric-circuits sp-06: potentiometer
  { topic: "electric-circuits", point: 6, demand: "explanation", family: "physics-statements:potentiometer", context: "physics-statements:potentiometer:emf-comparison", move: "explain how a potentiometer compares emfs without drawing current",
    prompt: "State what a potentiometer is and explain why, when correctly balanced, it compares the emfs of two cells without drawing current from them.",
    marks: 3,
    scheme: ["A potentiometer is a variable potential divider: a uniform wire or track across which a known potential gradient is set up", "Balance is reached when the potential difference tapped off equals the cell's emf and the galvanometer reads zero", "At balance no current flows from the cell under test, so its terminal potential difference equals its emf unaffected by internal resistance"],
    answer: "A potentiometer is a variable potential divider: a uniform wire carrying a steady current provides a known potential gradient. The cell under test is connected against a portion of this wire. When the galvanometer reads zero, the potential difference across that portion exactly equals the cell's emf. Because no current flows from the cell at balance, its internal resistance drops no volts, so the comparison measures true emf." },
  // electric-circuits sp-07: experimental errors in electrical measurements
  { topic: "electric-circuits", point: 7, demand: "explanation", family: "physics-statements:electrical-errors", context: "physics-statements:electrical-errors:ammeter-position", move: "identify how instrument placement creates systematic error in a resistance measurement",
    prompt: "An ammeter is in series with a small resistor. A voltmeter is connected across the resistor and ammeter together. Assume the voltmeter draws negligible current, but the ammeter has non-zero resistance. Explain the systematic error in the resistance calculated as V/I and state how it can be corrected.",
    marks: 3,
    scheme: ["The voltmeter measures the potential difference across resistor plus ammeter", "The ammeter's small resistance adds to the measured resistance, making readings systematically too high", "Subtract the known ammeter resistance from V/I, or connect the voltmeter directly across the resistor under the negligible-voltmeter-current assumption"],
    answer: "The measured voltage is I(R + R_A), so V/I overestimates the resistor resistance by the ammeter resistance R_A. Subtract the known R_A from V/I, or measure the voltage directly across the resistor. The latter uses the stated assumption that voltmeter current is negligible." },
  // energy-power sp-03: power and efficiency
  { topic: "energy-power", point: 3, demand: "calculation", family: "physics-statements:pump-power", context: "physics-statements:pump-power:rated-vs-useful", move: "separate rated input power from useful output power through an efficiency",
    prompt: "A pump motor draws 2.5 kW of electrical power and lifts 120 kg of water through a vertical height of 8.0 m every minute. Take g = 9.81 m s⁻². Calculate the useful output power and the pump system's efficiency.",
    marks: 3,
    scheme: ["Useful power = mgh/t = 120 × 9.81 × 8.0 / 60", "Useful power = 157 W", "Efficiency = 157 / 2500 = 0.063 (6.3%)"],
    answer: "The useful mechanical power is mgh/t = 120 × 9.81 × 8.0 / 60 = 157 W. The efficiency is 157 / 2500 ≈ 0.063, or about 6.3% — most of the input energy is dissipated thermally." },
  // kinematics-dynamics sp-08: force-time graphs, impulse as area
  { topic: "kinematics-dynamics", point: 8, demand: "calculation", family: "physics-statements:force-time-area", context: "physics-statements:force-time-area:cushioned-impact", move: "read impulse as the area of a force-time graph before applying momentum change",
    prompt: "In a crash test a seat belt exerts the force-time profile on a 65 kg dummy: the force rises linearly from 0 N to 3900 N over 0.10 s, then falls linearly to zero over the next 0.10 s. Calculate the dummy's change in velocity from the area under the graph.",
    marks: 3,
    scheme: ["Impulse = area = ½ × base × height = ½ × 0.20 × 3900", "Impulse = 390 N s", "Δv = impulse/m = 390/65 = 6.0 m s⁻¹"],
    answer: "The graph forms a triangle with base 0.20 s and height 3900 N. Impulse = ½ × 0.20 × 3900 = 390 N s. This equals the momentum change, so Δv = 390/65 = 6.0 m s⁻¹." },
  // momentum sp-02: conservation in collisions/explosions
  { topic: "momentum", point: 2, demand: "calculation", family: "physics-statements:explosion-recoil", context: "physics-statements:explosion-recoil:firework", move: "conserve total vector momentum in an explosion from rest",
    prompt: "A 0.60 kg firework shell at rest splits into two parts. A 0.40 kg fragment moves east at 15 m s⁻¹. Calculate the velocity of the 0.20 kg fragment, including its direction.",
    marks: 3,
    scheme: ["Total momentum before is zero, so the fragments' momenta must cancel", "0.40 × 15 = 6.0 kg m s⁻¹ east, so the other fragment carries 6.0 kg m s⁻¹ west", "v = 6.0/0.20 = 30 m s⁻¹ west"],
    answer: "Momentum before the split is zero, so the fragments carry equal and opposite momenta. The 0.40 kg fragment has momentum 0.40 × 15 = 6.0 kg m s⁻¹ east, so the 0.20 kg fragment must carry 6.0 kg m s⁻¹ west: its velocity is 6.0/0.20 = 30 m s⁻¹ west." },
  // momentum sp-05: two-dimensional collisions
  { topic: "momentum", point: 5, demand: "calculation", family: "physics-statements:2d-momentum", context: "physics-statements:2d-momentum:glancing-collision", move: "resolve momentum into perpendicular components before conserving each",
    prompt: "A 2.0 kg puck moving at 6.0 m s⁻¹ north strikes a stationary 1.0 kg puck. Afterwards the 2.0 kg puck moves at 3.0 m s⁻¹ at 60° west of north and the 1.0 kg puck moves at 6.0 m s⁻¹ at 30° east of north. Determine whether these data conserve momentum in the east-west direction.",
    marks: 3,
    scheme: ["Initial east-west momentum is zero", "West component: 2.0 × 3.0 × sin 60° = 5.2 kg m s⁻¹; east component: 1.0 × 6.0 × sin 30° = 3.0 kg m s⁻¹", "The components do not cancel (5.2 ≠ 3.0), so the stated after-velocities are inconsistent with momentum conservation in the east-west direction"],
    answer: "The initial east-west momentum is zero. After the collision the west component is 2.0 × 3.0 × sin 60° ≈ 5.2 kg m s⁻¹ and the east component is 1.0 × 6.0 × sin 30° = 3.0 kg m s⁻¹. Since these do not balance, the stated velocities cannot both be correct: momentum would not be conserved in the east-west direction." },
  // momentum sp-06: experimental evidence for momentum conservation
  { topic: "momentum", point: 6, demand: "explanation", family: "physics-statements:momentum-evidence", context: "physics-statements:momentum-evidence:air-track", move: "design an air-track comparison that tests momentum conservation within uncertainty",
    prompt: "Describe how a linear air track could be used to test conservation of momentum for a collision between two riders, and state one source of uncertainty and how its effect is reduced.",
    marks: 3,
    scheme: ["Riders glide on a cushion of air, so friction (the main external horizontal force) is negligible", "Measure each rider's mass and its velocity before and after the collision using light gates, then compare total momentum before with total momentum after", "Uncertainty in velocity timing is reduced by repeating and averaging (or by using a stated card width and multiple timing positions)"],
    answer: "Level the air track so riders float on an air cushion, eliminating friction as a significant horizontal force. Measure masses with a balance and velocities with light gates before and after the riders collide, then compare the total momentum before with the total after. Timing uncertainty is reduced by repeating the collision and averaging, and by using a card of measured width through each gate." },
  // nuclear sp-06: quark classification and conservation laws
  { topic: "nuclear", point: 6, demand: "application", family: "physics-statements:quark-conservation", context: "physics-statements:quark-conservation:pion-decay", move: "apply charge and baryon-number conservation through a decay using quark composition",
    prompt: "A neutral pion (quark content uū, where ū is an anti-up quark) decays into two identical photons. Explain how charge conservation is satisfied and why baryon number is conserved even though no baryon is present.",
    marks: 3,
    scheme: ["The pion has charge +⅔ − ⅓ = 0; photons have charge 0, so charge is conserved", "Mesons have baryon number 0 (quark plus antiquark), so the initial baryon number is 0", "Photons also have baryon number 0, so baryon number is conserved (0 → 0)"],
    answer: "The u quark carries charge +⅔ and the ū antiquark −⅓, so the pion is neutral; photons are also neutral, so charge is conserved. Baryon number is 0 for any quark–antiquark (meson) state and 0 for photons, so baryon number is conserved at 0 throughout the decay." },
  // nuclear sp-07: beta-minus decay with electron and antineutrino
  { topic: "nuclear", point: 7, demand: "explanation", family: "physics-statements:beta-energy-spread", context: "physics-statements:beta-energy-spread:continuous-spectrum", move: "use the continuous beta energy spectrum to argue for the antineutrino",
    prompt: "In beta-minus decay the emitted electrons emerge with a continuous range of energies up to a maximum. Explain why this observation requires an extra undetected particle, and state its name and the conservation law it restores.",
    marks: 3,
    scheme: ["A two-body decay of a nucleus at rest would give the electron a single fixed energy, not a range", "The missing energy (and momentum and angular momentum) must be carried by an undetected particle", "The electron antineutrino restores conservation of energy, momentum and lepton number"],
    answer: "If only the electron and recoiling nucleus were produced, a two-body decay of a stationary nucleus would give the electron one exact energy. The observed continuous spectrum up to a maximum means energy and momentum are shared with a third, undetected particle: the electron antineutrino. Its emission also conserves lepton number (electron and antineutrino carry opposite lepton numbers)." },
  // quantum sp-06: discrete energy levels and spectra
  { topic: "quantum", point: 6, demand: "explanation", family: "physics-statements:emission-lines", context: "physics-statements:emission-lines:hydrogen-lines", move: "link discrete emission lines to differences between quantised energy levels",
    prompt: "A hydrogen discharge lamp emits light only at a few specific wavelengths. Explain what this shows about the energy levels in hydrogen atoms and how each photon is produced.",
    marks: 3,
    scheme: ["Atoms have discrete (quantised) energy levels rather than a continuous range", "An excited electron dropping from a higher to a lower level loses a fixed energy equal to the level difference", "The emitted photon has E = hf matching that difference, so only specific wavelengths appear"],
    answer: "The lamp's line spectrum shows hydrogen atoms can occupy only discrete, quantised energy levels. Excited electrons fall from higher to lower levels, and each transition releases a photon whose energy E = hf equals the exact difference between the two levels. Since only certain differences exist, only certain wavelengths are emitted." },
  // thermal sp-06: p-V and heating curves
  { topic: "thermal", point: 6, demand: "explanation", family: "physics-statements:heating-curve", context: "physics-statements:heating-curve:latent-plateau", move: "interpret a heating-curve plateau as energy input without temperature change",
    prompt: "A substance is heated at a steady rate and its temperature is plotted against time. The graph rises steeply, flattens, then rises again. Explain the flat section in terms of the energy being supplied.",
    marks: 2,
    scheme: ["The flat section occurs while the substance changes state (melting or boiling)", "The supplied energy goes into breaking intermolecular bonds (latent heat) rather than increasing average kinetic energy, so temperature stays constant"],
    answer: "The plateau occurs during a change of state. While melting or boiling, the supplied energy goes into separating molecules — increasing potential energy (latent heat) — not into raising their average kinetic energy, so the temperature remains constant until the state change is complete." },
  // waves sp-05: polarisation evidence
  { topic: "waves", point: 5, demand: "explanation", family: "physics-statements:polarising-filters", context: "physics-statements:polarising-filters:two-filter-test", move: "use the two-filter result as evidence that light oscillates transversely",
    prompt: "Light passing one polarising filter dims. Adding a second filter rotated relative to the first dims the light further, and at one rotation blocks it completely. Explain why this cannot happen for a longitudinal wave.",
    marks: 3,
    scheme: ["A polarising filter transmits only oscillations in one direction perpendicular to travel", "The second filter blocks the light when its axis is perpendicular to the first, since no oscillation component remains along its axis", "Longitudinal waves oscillate along the propagation direction and have no perpendicular oscillation to filter, so they cannot be polarised"],
    answer: "A polarising filter passes only the component of light oscillating along its axis — a direction perpendicular to the travel. A second filter at 90° blocks the light entirely because no oscillation component along its axis remains. Longitudinal waves oscillate parallel to their direction of travel, with nothing perpendicular to select, so no arrangement of filters can polarise them: the observation proves light is transverse." },
  // waves sp-06: single-slit diffraction
  { topic: "waves", point: 6, demand: "explanation", family: "physics-statements:single-slit", context: "physics-statements:single-slit:central-maximum", move: "relate slit width and wavelength to the single-slit pattern",
    prompt: "Light passes through a narrow single slit and produces a pattern with a wide central maximum and fainter side bands. Explain how the central maximum changes when the slit is made narrower, and what happens as the slit width approaches the wavelength.",
    marks: 3,
    scheme: ["Narrower slit widens the central maximum (diffraction angle increases)", "The intensity decreases because less light passes through", "When the slit width is comparable to the wavelength the spreading becomes very large, approaching uniform spreading"],
    answer: "Making the slit narrower increases the diffraction angle, so the central maximum spreads wider, though its intensity falls because less light gets through. As the slit width approaches the wavelength, spreading becomes extreme and the light spreads over a very wide angle." },
  // waves sp-08: two-source interference / path difference (extension list had sp-08 mapped from expansions? verify)
  { topic: "waves", point: 8, demand: "application", family: "physics-statements:path-difference", context: "physics-statements:path-difference:speaker-spacing", move: "predict loud and quiet points from path difference in two-source interference",
    prompt: "Two identical loudspeakers emit 0.68 m wavelength sound in phase. A listener walks along a line 6.0 m from and parallel to the speaker line. State the path difference for the first quiet point and how far apart successive quiet points are along the line.",
    marks: 3,
    scheme: ["Quiet points occur where the path difference is an odd number of half wavelengths", "First quiet point: path difference = λ/2 = 0.34 m", "Successive quiet points are separated by the same geometry as loud points, one wavelength of path difference: 0.68 m apart along the line"],
    answer: "Destructive interference (a quiet point) occurs where the path difference is an odd number of half-wavelengths. The first quiet point therefore has a path difference of 0.34 m. Moving along the line, the path difference changes by one wavelength between successive quiet points, so they occur 0.68 m apart." },
];

export const physicsStatementCoverageQuestions: Question[] = ITEMS.map((item) =>
  defineQuestion({
    slug: `physics-statement-${item.topic}-sp-${String(item.point).padStart(2, "0")}-${item.context.split(":").at(-1)}`,
    subjectId: S,
    topics: [item.topic],
    kind: item.demand === "calculation" ? "calculation" : "short",
    stem: item.prompt,
    difficulty: item.demand === "recall" ? 1 : 3,
    calculator: item.demand === "calculation",
    source: "authored",
    verification: "checked",
    reviewer: "authored/physics-statement-coverage-review",
    lastChecked: "2026-09-10",
    specVersion: "2024-1.0",
    parts: [{
      prompt: item.prompt,
      marks: item.marks,
      scheme: item.scheme,
      answer: item.answer,
      aos: item.demand === "recall" ? ["AO1"] : ["AO2"] as const,
      specPointIds: [`${S}.${item.topic}.sp-${String(item.point).padStart(2, "0")}`],
      capabilityIds: [`phys.${item.topic}.sp-${String(item.point).padStart(2, "0")}`],
      learningClaims: [item.answer.slice(0, 160)],
      learning: {
        familyId: item.family,
        contextId: item.context,
        demand: item.demand,
        reasoningMoves: [item.move],
      },
    }],
    learning: {
      familyId: item.family,
      contextId: item.context,
      demand: item.demand,
      expectedMinutes: Math.max(1, item.marks),
      reasoningMoves: [item.move],
    },
  }),
);
