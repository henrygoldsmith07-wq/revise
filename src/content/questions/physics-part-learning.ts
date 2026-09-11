import type { Question, QuestionPart } from "@/domain/types";
import { physicsCapabilityIdForSpecPoint } from "../capabilities";

/**
 * Part-level learning metadata for the curated WJEC Physics packs whose parts
 * predate the per-part `learning` contract (data/source/unfamiliar-context/
 * authentic expansions and the original core bank).
 *
 * Keyed by question id so the mapping is stable and auditable: each entry names
 * the smallest skill (capability), the demand, an authored family and context,
 * and the reasoning move(s) the part actually requires — never a restatement of
 * the demand label, which the Physics quality audit rejects as templated.
 *
 * A part keyed here must map to exactly one specification statement and one
 * capability; the audit enforces that after enrichment.
 */
export interface PhysicsPartLearningSpec {
  capabilityId?: string;
  demand: QuestionPart["learning"] extends undefined ? never : NonNullable<QuestionPart["learning"]>["demand"];
  familyId: string;
  contextId: string;
  reasoningMoves: string[];
}

type PartKey = `${string}:${number}`;

export const PHYSICS_PART_LEARNING: Record<string, PhysicsPartLearningSpec> = {
  // --- evidence-expansion (circular-shm practical, fields orbit, third-law MCQ, projectile) ---
  "cnt:question:evidence-wjec-alevel-physics-centripetal-practical-evaluate:0": {
    demand: "application", familyId: "physics-evidence:circular-practical", contextId: "physics-evidence:circular-practical:timing-method",
    reasoningMoves: ["design a many-rotation timing method to reduce random error"] },
  "cnt:question:evidence-wjec-alevel-physics-centripetal-practical-evaluate:1": {
    demand: "explanation", familyId: "physics-evidence:circular-practical", contextId: "physics-evidence:circular-practical:instrument-choice",
    reasoningMoves: ["compare reaction-time uncertainty against the measured interval when choosing an instrument"] },
  "cnt:question:evidence-wjec-alevel-physics-satellite-orbit-synoptic:0": {
    demand: "explanation", familyId: "physics-evidence:satellite-orbit", contextId: "physics-evidence:satellite-orbit:force-balance",
    reasoningMoves: ["equate gravitational and centripetal force to isolate the speed-radius relation"] },
  "cnt:question:evidence-wjec-alevel-physics-satellite-orbit-synoptic:1": {
    demand: "misconception", familyId: "physics-evidence:satellite-orbit", contextId: "physics-evidence:satellite-orbit:higher-faster-claim",
    reasoningMoves: ["separate orbital speed from total energy when evaluating a faster-orbit claim"] },
  "cnt:question:evidence-wjec-alevel-physics-third-law-misconception:0": {
    demand: "misconception", familyId: "physics-evidence:third-law-pairs", contextId: "physics-evidence:third-law-pairs:book-on-table",
    reasoningMoves: ["identify interaction pairs by body and force type rather than by equal magnitude"] },
  "cnt:question:evidence-wjec-alevel-physics-projectile-data-interpretation:0": {
    demand: "calculation", familyId: "physics-evidence:bench-projectile", contextId: "physics-evidence:bench-projectile:flight-time",
    reasoningMoves: ["resolve vertical motion independently to find flight time"] },
  "cnt:question:evidence-wjec-alevel-physics-projectile-data-interpretation:1": {
    demand: "calculation", familyId: "physics-evidence:bench-projectile", contextId: "physics-evidence:bench-projectile:range",
    reasoningMoves: ["carry a flight-time result into uniform horizontal motion"] },
  "cnt:question:evidence-wjec-alevel-physics-projectile-data-interpretation:2": {
    demand: "explanation", familyId: "physics-evidence:bench-projectile", contextId: "physics-evidence:bench-projectile:constant-velocity",
    reasoningMoves: ["justify a constant velocity component from Newton's first law"] },

  // --- massive-authentic physics (24 items, one part each) ---
  "cnt:question:authentic-expansion-wjec-alevel-physics-physics-projectile-components:0": {
    demand: "calculation", familyId: "physics-authentic:projectile-components", contextId: "physics-authentic:projectile-components:platform-launch",
    reasoningMoves: ["chain vertical fall time into horizontal range"] },
  "cnt:question:authentic-expansion-wjec-alevel-physics-physics-terminal-speed:0": {
    demand: "explanation", familyId: "physics-authentic:terminal-speed", contextId: "physics-authentic:terminal-speed:zero-acceleration",
    reasoningMoves: ["balance drag against weight to explain zero acceleration at non-zero speed"] },
  "cnt:question:authentic-expansion-wjec-alevel-physics-physics-efficiency:0": {
    demand: "calculation", familyId: "physics-authentic:motor-efficiency", contextId: "physics-authentic:motor-efficiency:power-ratio",
    reasoningMoves: ["form a useful-to-input power ratio and account for the difference"] },
  "cnt:question:authentic-expansion-wjec-alevel-physics-physics-stress-strain:0": {
    demand: "calculation", familyId: "physics-authentic:young-modulus", contextId: "physics-authentic:young-modulus:wire-data",
    reasoningMoves: ["divide computed stress by computed strain to obtain a material constant"] },
  "cnt:question:authentic-expansion-wjec-alevel-physics-physics-standing-wave:0": {
    demand: "calculation", familyId: "physics-authentic:standing-waves", contextId: "physics-authentic:standing-waves:third-harmonic",
    reasoningMoves: ["count half-wavelengths in a fixed length before applying v = fλ"] },
  "cnt:question:authentic-expansion-wjec-alevel-physics-physics-photoelectric-work-function:0": {
    demand: "calculation", familyId: "physics-authentic:photoelectric-equation", contextId: "physics-authentic:photoelectric-equation:work-function",
    reasoningMoves: ["rearrange the photoelectric balance to isolate the work function"] },
  "cnt:question:authentic-expansion-wjec-alevel-physics-physics-electric-resistivity:0": {
    demand: "calculation", familyId: "physics-authentic:resistivity", contextId: "physics-authentic:resistivity:wire-geometry",
    reasoningMoves: ["convert a cross-sectional area before applying the resistivity relation"] },
  "cnt:question:authentic-expansion-wjec-alevel-physics-physics-internal-resistance:0": {
    demand: "calculation", familyId: "physics-authentic:internal-resistance", contextId: "physics-authentic:internal-resistance:terminal-pd",
    reasoningMoves: ["subtract lost volts from emf to find the terminal potential difference"] },
  "cnt:question:authentic-expansion-wjec-alevel-physics-physics-momentum-explosion:0": {
    demand: "calculation", familyId: "physics-authentic:momentum-explosion", contextId: "physics-authentic:momentum-explosion:zero-initial",
    reasoningMoves: ["conserve zero total momentum to find a recoil velocity"] },
  "cnt:question:authentic-expansion-wjec-alevel-physics-physics-shm-condition:0": {
    demand: "recall", familyId: "physics-authentic:shm-defining-condition", contextId: "physics-authentic:shm-defining-condition:sign-convention",
    reasoningMoves: ["state both the proportionality and the direction condition for SHM"] },
  "cnt:question:authentic-expansion-wjec-alevel-physics-physics-resonance-damping:0": {
    demand: "explanation", familyId: "physics-authentic:resonance-damping", contextId: "physics-authentic:resonance-damping:curve-comparison",
    reasoningMoves: ["compare resonance curves through peak height and bandwidth"] },
  "cnt:question:authentic-expansion-wjec-alevel-physics-physics-orbital-speed:0": {
    demand: "calculation", familyId: "physics-authentic:orbital-derivation", contextId: "physics-authentic:orbital-derivation:force-equality",
    reasoningMoves: ["add the altitude to the planetary radius before applying circular-orbit relations"] },
  "cnt:question:authentic-expansion-wjec-alevel-physics-physics-induced-emf:0": {
    demand: "calculation", familyId: "physics-authentic:induced-emf", contextId: "physics-authentic:induced-emf:flux-linkage-change",
    reasoningMoves: ["divide a total flux-linkage change by the time taken"] },
  "cnt:question:authentic-expansion-wjec-alevel-physics-physics-ideal-gas:0": {
    demand: "calculation", familyId: "physics-authentic:ideal-gas", contextId: "physics-authentic:ideal-gas:amount-from-state",
    reasoningMoves: ["rearrange the ideal gas equation to solve for amount"] },
  "cnt:question:authentic-expansion-wjec-alevel-physics-physics-specific-heat:0": {
    demand: "calculation", familyId: "physics-authentic:specific-heat", contextId: "physics-authentic:specific-heat:block-heating",
    reasoningMoves: ["rearrange Q = mcΔT to isolate a specific heat capacity"] },
  "cnt:question:authentic-expansion-wjec-alevel-physics-physics-radioactive-half-life:0": {
    demand: "calculation", familyId: "physics-authentic:half-life", contextId: "physics-authentic:half-life:activity-decay",
    reasoningMoves: ["count elapsed half-lives before scaling activity"] },
  "cnt:question:authentic-expansion-wjec-alevel-physics-physics-binding-energy:0": {
    demand: "explanation", familyId: "physics-authentic:binding-energy", contextId: "physics-authentic:binding-energy:total-vs-release",
    reasoningMoves: ["distinguish total binding energy from the change that sets released energy"] },
  "cnt:question:authentic-expansion-wjec-alevel-physics-physics-particle-conservation:0": {
    demand: "explanation", familyId: "physics-authentic:beta-conservation", contextId: "physics-authentic:beta-conservation:charge-balance",
    reasoningMoves: ["check conservation laws across a beta decay reaction"] },
  "cnt:question:authentic-expansion-wjec-alevel-physics-physics-polarisation:0": {
    demand: "explanation", familyId: "physics-authentic:polarisation-evidence", contextId: "physics-authentic:polarisation-evidence:transverse-proof",
    reasoningMoves: ["use polarisability as discriminating evidence for transverse waves"] },
  "cnt:question:authentic-expansion-wjec-alevel-physics-physics-de-broglie:0": {
    demand: "calculation", familyId: "physics-authentic:de-broglie", contextId: "physics-authentic:de-broglie:electron-wavelength",
    reasoningMoves: ["compute momentum before applying the de Broglie relation"] },
  "cnt:question:authentic-expansion-wjec-alevel-physics-more-alevel-physics-filament-lamp:0": {
    demand: "explanation", familyId: "physics-authentic:filament-iv", contextId: "physics-authentic:filament-iv:gradient-meaning",
    reasoningMoves: ["interpret a changing I-V gradient through a microscopic scattering model"] },
  "cnt:question:authentic-expansion-wjec-alevel-physics-more-alevel-physics-critical-angle:0": {
    demand: "calculation", familyId: "physics-authentic:critical-angle", contextId: "physics-authentic:critical-angle:glass-air",
    reasoningMoves: ["invert a refractive index before stating the reflection condition"] },
  "cnt:question:authentic-expansion-wjec-alevel-physics-more-alevel-physics-field-potential:0": {
    demand: "calculation", familyId: "physics-authentic:field-potential", contextId: "physics-authentic:field-potential:parallel-plates",
    reasoningMoves: ["relate field strength to potential difference across a plate separation"] },
  "cnt:question:authentic-expansion-wjec-alevel-physics-more-alevel-physics-kinetic-energy:0": {
    demand: "calculation", familyId: "physics-authentic:molecular-energy", contextId: "physics-authentic:molecular-energy:temperature-link",
    reasoningMoves: ["link absolute temperature to mean molecular kinetic energy"] },

  // --- data-expansion physics (11 items) ---
  "cnt:question:data-expansion-wjec-alevel-physics-velocity-time-table:0": {
    demand: "calculation", familyId: "physics-data:velocity-time", contextId: "physics-data:velocity-time:table-gradient",
    reasoningMoves: ["read acceleration as a table gradient across equal intervals"] },
  "cnt:question:data-expansion-wjec-alevel-physics-power-efficiency-data:0": {
    demand: "calculation", familyId: "physics-data:lift-efficiency", contextId: "physics-data:lift-efficiency:energy-rates",
    reasoningMoves: ["compare energy rates as a ratio before accounting for the remainder"] },
  "cnt:question:data-expansion-wjec-alevel-physics-stress-strain-data:0": {
    demand: "calculation", familyId: "physics-data:modulus-comparison", contextId: "physics-data:modulus-comparison:two-wires",
    reasoningMoves: ["compute two quotients and compare stiffness before concluding"] },
  "cnt:question:data-expansion-wjec-alevel-physics-wave-speed-data:0": {
    demand: "application", familyId: "physics-data:wave-speed", contextId: "physics-data:wave-speed:f-lambda-products",
    reasoningMoves: ["test an invariance claim across a product table"] },
  "cnt:question:data-expansion-wjec-alevel-physics-photoelectric-data:0": {
    demand: "calculation", familyId: "physics-data:planck-estimate", contextId: "physics-data:planck-estimate:stopping-potential",
    reasoningMoves: ["form a difference ratio from paired measurements to estimate a constant"] },
  "cnt:question:data-expansion-wjec-alevel-physics-iv-data:0": {
    demand: "application", familyId: "physics-data:iv-ohmic-check", contextId: "physics-data:iv-ohmic-check:ratio-stability",
    reasoningMoves: ["test ratio constancy across a table before labelling behaviour ohmic"] },
  "cnt:question:data-expansion-wjec-alevel-physics-collision-data:0": {
    demand: "calculation", familyId: "physics-data:sticky-collision", contextId: "physics-data:sticky-collision:common-velocity",
    reasoningMoves: ["conserve momentum for a combined mass before classifying the collision"] },
  "cnt:question:data-expansion-wjec-alevel-physics-shm-period-data:0": {
    demand: "calculation", familyId: "physics-data:shm-period", contextId: "physics-data:shm-period:amplitude-independence",
    reasoningMoves: ["divide total time by cycle counts and compare across amplitudes"] },
  "cnt:question:data-expansion-wjec-alevel-physics-gravitational-potential-data:0": {
    demand: "application", familyId: "physics-data:gravitational-potential", contextId: "physics-data:gravitational-potential:radius-scaling",
    reasoningMoves: ["match an inverse-radius law to tabulated potentials"] },
  "cnt:question:data-expansion-wjec-alevel-physics-gas-pressure-data:0": {
    demand: "calculation", familyId: "physics-data:pressure-temperature", contextId: "physics-data:pressure-temperature:proportionality-check",
    reasoningMoves: ["verify a proportionality across a table before extrapolating"] },
  "cnt:question:data-expansion-wjec-alevel-physics-half-life-count-data:0": {
    demand: "calculation", familyId: "physics-data:background-correction", contextId: "physics-data:background-correction:count-rate",
    reasoningMoves: ["subtract an additive background before identifying halving"] },

  // --- unfamiliar-context physics (11 items) ---
  "cnt:question:unfamiliar-context-wjec-alevel-physics-hovercraft-launch:0": {
    demand: "calculation", familyId: "physics-unfamiliar:hovercraft", contextId: "physics-unfamiliar:hovercraft:drive-force",
    reasoningMoves: ["add resistance to a computed resultant before finding the driving force"] },
  "cnt:question:unfamiliar-context-wjec-alevel-physics-wave-buoy:0": {
    demand: "calculation", familyId: "physics-unfamiliar:wave-buoy", contextId: "physics-unfamiliar:wave-buoy:useful-power",
    reasoningMoves: ["apply an efficiency to captured energy before dividing by time"] },
  "cnt:question:unfamiliar-context-wjec-alevel-physics-smart-polymer:0": {
    demand: "calculation", familyId: "physics-unfamiliar:smart-polymer", contextId: "physics-unfamiliar:smart-polymer:modulus-chain",
    reasoningMoves: ["chain stress, strain and modulus from stated geometry"] },
  "cnt:question:unfamiliar-context-wjec-alevel-physics-ultrasound-image:0": {
    demand: "calculation", familyId: "physics-unfamiliar:ultrasound", contextId: "physics-unfamiliar:ultrasound:resolution",
    reasoningMoves: ["relate wavelength to resolvable structure size"] },
  "cnt:question:unfamiliar-context-wjec-alevel-physics-led-threshold:0": {
    demand: "calculation", familyId: "physics-unfamiliar:led-threshold", contextId: "physics-unfamiliar:led-threshold:photon-energy",
    reasoningMoves: ["convert a threshold voltage into a per-photon energy comparison"] },
  "cnt:question:unfamiliar-context-wjec-alevel-physics-wearable-sensor:0": {
    demand: "application", familyId: "physics-unfamiliar:wearable-divider", contextId: "physics-unfamiliar:wearable-divider:thermal-response",
    reasoningMoves: ["predict divider output from a changing sensor resistance"] },
  "cnt:question:unfamiliar-context-wjec-alevel-physics-airbag-collision:0": {
    demand: "calculation", familyId: "physics-unfamiliar:airbag", contextId: "physics-unfamiliar:airbag:stopping-time",
    reasoningMoves: ["hold impulse fixed while comparing forces across stopping times"] },
  "cnt:question:unfamiliar-context-wjec-alevel-physics-space-station-rotation:0": {
    demand: "calculation", familyId: "physics-unfamiliar:rotating-habitat", contextId: "physics-unfamiliar:rotating-habitat:rim-acceleration",
    reasoningMoves: ["convert a rotation period to angular speed before applying a = ω²r"] },
  "cnt:question:unfamiliar-context-wjec-alevel-physics-lunar-transfer:0": {
    demand: "calculation", familyId: "physics-unfamiliar:lunar-transfer", contextId: "physics-unfamiliar:lunar-transfer:potential-change",
    reasoningMoves: ["subtract signed potentials to quantify work done against the field"] },
  "cnt:question:unfamiliar-context-wjec-alevel-physics-insulated-cup:0": {
    demand: "explanation", familyId: "physics-unfamiliar:vacuum-flask", contextId: "physics-unfamiliar:vacuum-flask:transfer-mechanisms",
    reasoningMoves: ["separate the transfer mechanisms a vacuum suppresses from those it cannot"] },
  "cnt:question:unfamiliar-context-wjec-alevel-physics-medical-tracer:0": {
    demand: "calculation", familyId: "physics-unfamiliar:medical-tracer", contextId: "physics-unfamiliar:medical-tracer:scan-activity",
    reasoningMoves: ["scale activity by elapsed half-lives and weigh exposure against imaging"] },

  // --- authentic-source physics (11 items, 12 parts) ---
  "cnt:question:authentic-source-wjec-alevel-physics-tidal-generator-report:0": {
    demand: "calculation", familyId: "physics-source:tidal-generator", contextId: "physics-source:tidal-generator:efficiency",
    reasoningMoves: ["multiply chained stage efficiencies before applying them to an energy input"] },
  "cnt:question:authentic-source-wjec-alevel-physics-cyclist-field-note:0": {
    demand: "explanation", familyId: "physics-source:cyclist-motion", contextId: "physics-source:cyclist-motion:resistive-forces",
    reasoningMoves: ["account for speed-dependent resistance when explaining steady speed"] },
  "cnt:question:authentic-source-wjec-alevel-physics-bridge-materials-report:0": {
    demand: "calculation", familyId: "physics-source:bridge-alloy", contextId: "physics-source:bridge-alloy:modulus",
    reasoningMoves: ["divide reported stress by strain and interpret stiffness"] },
  "cnt:question:authentic-source-wjec-alevel-physics-sonar-log:0": {
    demand: "calculation", familyId: "physics-source:sonar", contextId: "physics-source:sonar:wavelength",
    reasoningMoves: ["apply the wave equation and connect wavelength to resolution"] },
  "cnt:question:authentic-source-wjec-alevel-physics-photodiode-brief:0": {
    demand: "explanation", familyId: "physics-source:photodiode", contextId: "physics-source:photodiode:threshold-model",
    reasoningMoves: ["apply one-photon energy accounting to a below-threshold source"] },
  "cnt:question:authentic-source-wjec-alevel-physics-photodiode-brief:1": {
    demand: "calculation", familyId: "physics-source:photodiode", contextId: "physics-source:photodiode:photon-energy",
    reasoningMoves: ["multiply Planck's constant by a stated frequency with unit retention"] },
  "cnt:question:authentic-source-wjec-alevel-physics-sensor-circuit-note:0": {
    demand: "application", familyId: "physics-source:sensor-divider", contextId: "physics-source:sensor-divider:thermistor-output",
    reasoningMoves: ["track a divider ratio as one resistance changes"] },
  "cnt:question:authentic-source-wjec-alevel-physics-crash-test-report:0": {
    demand: "calculation", familyId: "physics-source:crash-test", contextId: "physics-source:crash-test:restraint-force",
    reasoningMoves: ["invert the impulse relation to find a required stopping time"] },
  "cnt:question:authentic-source-wjec-alevel-physics-centrifuge-log:0": {
    demand: "calculation", familyId: "physics-source:centrifuge", contextId: "physics-source:centrifuge:rim-acceleration",
    reasoningMoves: ["rearrange the circular-acceleration relation to solve for frequency"] },
  "cnt:question:authentic-source-wjec-alevel-physics-planetary-mission-report:0": {
    demand: "calculation", familyId: "physics-source:planetary-mission", contextId: "physics-source:planetary-mission:potential-change",
    reasoningMoves: ["apply an inverse-square scaling to a changed orbital radius"] },
  "cnt:question:authentic-source-wjec-alevel-physics-thermal-storage-log:0": {
    demand: "explanation", familyId: "physics-source:thermal-storage", contextId: "physics-source:thermal-storage:design-features",
    reasoningMoves: ["map each design feature to the transfer mechanism it suppresses"] },
  "cnt:question:authentic-source-wjec-alevel-physics-radiotherapy-record:0": {
    demand: "calculation", familyId: "physics-source:radiotherapy", contextId: "physics-source:radiotherapy:imaging-activity",
    reasoningMoves: ["invert a halving sequence to find a usable imaging window"] },

  // --- extended-responses physics (2 questions, 3 parts) ---
  "cnt:question:extended-response-wjec-alevel-physics-induced-emf-direction:0": {
    demand: "explanation", familyId: "physics-extended:induction-direction", contextId: "physics-extended:induction-direction:lenz",
    reasoningMoves: ["apply Lenz's law to determine an induced polarity"] },
  "cnt:question:extended-response-wjec-alevel-physics-induced-emf-direction:1": {
    demand: "explanation", familyId: "physics-extended:induction-direction", contextId: "physics-extended:induction-direction:rate-link",
    reasoningMoves: ["connect the sign of a rate of change to the induced emf direction"] },
  "cnt:question:extended-response-wjec-alevel-physics-binding-energy-release:0": {
    demand: "synoptic", familyId: "physics-extended:binding-curve", contextId: "physics-extended:binding-curve:fission-fusion",
    reasoningMoves: ["read energy release from a binding-energy-per-nucleon curve"] },

  // --- core physics bank (physics.ts, physics-extra.ts) ---
  "cnt:question:phys-photoelectric:0": {
    demand: "calculation", familyId: "physics-core:photoelectric", contextId: "physics-core:photoelectric:ke-max",
    reasoningMoves: ["convert a work function and apply the photoelectric energy balance"] },
  "cnt:question:phys-photoelectric:1": {
    demand: "explanation", familyId: "physics-core:photoelectric", contextId: "physics-core:photoelectric:intensity-effect",
    reasoningMoves: ["separate photon energy from photon arrival rate"] },
  "cnt:question:phys-shm-pendulum:0": {
    demand: "calculation", familyId: "physics-core:pendulum-period", contextId: "physics-core:pendulum-period:length",
    reasoningMoves: ["apply the pendulum period relation with consistent units"] },
  "cnt:question:phys-shm-pendulum:1": {
    demand: "explanation", familyId: "physics-core:pendulum-period", contextId: "physics-core:pendulum-period:small-angle",
    reasoningMoves: ["justify a small-angle approximation from the restoring-force expression"] },
  "cnt:question:phys-emf-internal:0": {
    demand: "calculation", familyId: "physics-core:internal-resistance", contextId: "physics-core:internal-resistance:current",
    reasoningMoves: ["include internal resistance in the total circuit resistance"] },
  "cnt:question:phys-emf-internal:1": {
    demand: "explanation", familyId: "physics-core:internal-resistance", contextId: "physics-core:internal-resistance:lost-volts",
    reasoningMoves: ["account for energy dissipated inside the cell when explaining terminal p.d."] },
  "cnt:question:phys-momentum-collision:0": {
    demand: "calculation", familyId: "physics-core:rebound-impulse", contextId: "physics-core:rebound-impulse:wall-contact",
    reasoningMoves: ["reverse a velocity sign before computing the momentum change"] },
  "cnt:question:phys-momentum-collision:1": {
    demand: "explanation", familyId: "physics-core:rebound-impulse", contextId: "physics-core:rebound-impulse:elasticity-check",
    reasoningMoves: ["test kinetic-energy conservation to classify a collision"] },
  "cnt:question:phys-mcq-fields:0": {
    demand: "application", familyId: "physics-core:inverse-square-mcq", contextId: "physics-core:inverse-square-mcq:orbit-change",
    reasoningMoves: ["apply an inverse-square scaling to a changed radius"] },
  "cnt:question:phys-nuclear-decay:0": {
    demand: "calculation", familyId: "physics-core:decay-constant", contextId: "physics-core:decay-constant:half-life-conversion",
    reasoningMoves: ["convert a half-life to seconds before computing a decay constant"] },
  "cnt:question:phys-nuclear-decay:1": {
    demand: "calculation", familyId: "physics-core:decay-constant", contextId: "physics-core:decay-constant:activity",
    reasoningMoves: ["multiply a decay constant by a nucleus count to obtain activity"] },
  "cnt:question:phys-kinematics-projectile:0": {
    demand: "calculation", familyId: "physics-core:cliff-projectile", contextId: "physics-core:cliff-projectile:flight-time",
    reasoningMoves: ["solve the vertical equation of motion, then invert a drop-height ratio into duration and range scaling"] },
  "cnt:question:phys-kinematics-projectile:1": {
    demand: "calculation", familyId: "physics-core:cliff-projectile", contextId: "physics-core:cliff-projectile:range",
    reasoningMoves: ["apply constant horizontal velocity over the flight time"] },
  "cnt:question:phys-energy-work:0": {
    demand: "calculation", familyId: "physics-core:incline-friction", contextId: "physics-core:incline-friction:work-done",
    reasoningMoves: ["resolve weight components on an incline before computing friction work"] },
  "cnt:question:phys-materials-young:0": {
    demand: "calculation", familyId: "physics-core:young-modulus", contextId: "physics-core:young-modulus:diameter-uncertainty",
    reasoningMoves: ["compute stress from a diameter-derived area and compare with an accepted value"] },
  "cnt:question:phys-waves-interference:0": {
    demand: "calculation", familyId: "physics-core:grating-angle", contextId: "physics-core:grating-angle:first-order",
    reasoningMoves: ["convert line density to spacing before applying the grating equation"] },
  "cnt:question:phys-thermal-specific-heat:0": {
    demand: "calculation", familyId: "physics-core:specific-heat", contextId: "physics-core:specific-heat:metal-block",
    reasoningMoves: ["rearrange Q = mcΔT to isolate specific heat capacity"] },
  "cnt:question:phys-thermal-ideal-gas:0": {
    demand: "calculation", familyId: "physics-core:ideal-gas", contextId: "physics-core:ideal-gas:amount",
    reasoningMoves: ["rearrange the ideal gas equation with absolute temperature"] },
  "cnt:question:phys-momentum-impulse:0": {
    demand: "calculation", familyId: "physics-core:impulse-force", contextId: "physics-core:impulse-force:rebound",
    reasoningMoves: ["compute a signed momentum change and divide by contact time"] },
  "cnt:question:phys-fields-gravitational:0": {
    demand: "calculation", familyId: "physics-core:surface-g", contextId: "physics-core:surface-g:verification",
    reasoningMoves: ["substitute planetary constants into the inverse-square field expression"] },
  "cnt:question:phys-fields-capacitor:0": {
    demand: "calculation", familyId: "physics-core:capacitor-store", contextId: "physics-core:capacitor-store:charge-energy",
    reasoningMoves: ["chain Q = CV into the stored-energy relation"] },
  "cnt:question:phys-nuclear-binding:0": {
    demand: "calculation", familyId: "physics-core:mass-defect", contextId: "physics-core:mass-defect:per-nucleon",
    reasoningMoves: ["assemble a mass defect from nucleon masses before converting to energy"] },
  "cnt:question:phys-waves-doppler:0": {
    demand: "calculation", familyId: "physics-core:doppler", contextId: "physics-core:doppler:receding-source",
    reasoningMoves: ["apply the receding-source Doppler relation and check the frequency shift direction"] },
  "cnt:question:phys-kinematics-suvat:0": {
    demand: "calculation", familyId: "physics-core:suvat", contextId: "physics-core:suvat:from-rest",
    reasoningMoves: ["select constant-acceleration equations for velocity and displacement"] },
  "cnt:question:phys-circular-banked:0": {
    demand: "calculation", familyId: "physics-core:centripetal-force", contextId: "physics-core:centripetal-force:bend",
    reasoningMoves: ["apply F = mv²/r and state the force's direction"] },
};

/**
 * Apply the authored part-learning metadata to the curated Physics packs.
 *
 * Capability ids are derived from each part's single spec-point mapping (the
 * stable `phys.<topic>.sp-XX` namespace) unless the table names a specific
 * fine-grained capability node (e.g. the circuit-skill chain). Questions whose
 * parts are not in the table pass through unchanged, so the mapping can be
 * extended incrementally without touching pack builders.
 */
export function enrichCuratedPhysicsLearning(questions: readonly Question[]): Question[] {
  return questions.map((question) => {
    if (question.subjectId !== "wjec-alevel-physics") return question;
    let changed = false;
    const parts = question.parts.map((part, index) => {
      const spec = PHYSICS_PART_LEARNING[`${question.id}:${index}` as PartKey];
      if (!spec || part.learning) return part;
      const specPointIds = part.specPointIds ?? [];
      if (specPointIds.length !== 1) return part;
      const capabilityId = spec.capabilityId ?? physicsCapabilityIdForSpecPoint(specPointIds[0]!);
      changed = true;
      return {
        ...part,
        capabilityIds: [capabilityId],
        learning: {
          familyId: spec.familyId,
          contextId: spec.contextId,
          demand: spec.demand,
          reasoningMoves: spec.reasoningMoves,
        },
      };
    });
    return changed ? { ...question, parts } : question;
  });
}
