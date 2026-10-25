// Year 12 Physics answers in a student's own words (pass 74, 2026-10-25).
// Every answer and examiner mark is AUTHOR JUDGEMENT, not a moderated mark.
import type { Y12Case } from "./marking-y12-physics-set";
const Q = "cnt:question:";
const POL = `${Q}authentic-expansion-wjec-alevel-physics-physics-polarisation`;
const LAMP = `${Q}authentic-expansion-wjec-alevel-physics-more-alevel-physics-filament-lamp`;
const TERM = `${Q}authentic-expansion-aqa-alevel-physics-physics-terminal-speed`;
const SONAR = `${Q}authentic-source-wjec-alevel-physics-sonar-log`;
export const y12PhysicsCasesPass74: Y12Case[] = [
  { id: POL, kind: "correct", examiner: 3,
    answer: "Polarisation means the waves only vibrate in one plane. That can only happen if the vibrations are at right angles to the direction the wave travels, so light must be transverse. A longitudinal wave vibrates along its direction of travel so a filter could not stop it." },
  { id: POL, kind: "wrong", examiner: 0,
    answer: "Polarisation shows light is longitudinal because the oscillations are along the direction of travel and the filter lets the compressions through." },
  { id: LAMP, kind: "correct", examiner: 3,
    answer: "The graph gets flatter so the gradient I over V falls. Resistance is V over I, which is the inverse of that gradient, so resistance goes up. The filament heats up, the positive ions vibrate more and electrons collide with them more often." },
  { id: LAMP, kind: "wrong", examiner: 0,
    answer: "The resistance goes down as the current rises because the filament gets hotter and more electrons are freed to carry charge." },
  { id: TERM, kind: "correct", examiner: 3,
    answer: "As it speeds up the air resistance grows. Eventually drag is the same size as its weight, so the forces balance and the resultant force is zero. With no resultant force there is no acceleration, so it falls at constant speed." },
  { id: TERM, kind: "wrong", examiner: 0,
    answer: "It stops accelerating because gravity stops pulling on it once it is going fast enough, so the weight becomes zero." },
  { id: SONAR, kind: "correct", examiner: 3,
    answer: "wavelength = speed divided by frequency = 1500 / 250000 = 0.006 m. The wavelength is tiny so the waves diffract very little round small objects and details much smaller than that are not lost, so small objects can be told apart." },
  { id: SONAR, kind: "wrong", examiner: 1,
    answer: "wavelength = frequency divided by speed = 250000 / 1500 = 167 m. A long wavelength means it can see small objects." },
];
