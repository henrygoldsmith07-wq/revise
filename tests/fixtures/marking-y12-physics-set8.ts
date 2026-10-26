// Year 12 Physics answers in a student's own words (pass 82, 2026-10-26).
// Every answer and examiner mark is AUTHOR JUDGEMENT, not a moderated mark.
import type { Y12Case } from "./marking-y12-physics-set";
const Q = "cnt:question:authentic-expansion-wjec-alevel-physics-physics-";
export const y12PhysicsCasesPass82: Y12Case[] = [
  { id: `${Q}electric-resistivity`, kind: "correct", examiner: 2,
    answer: "Area = 0.50e-6 m^2. Resistivity = R A / L = 4.0 x 0.50e-6 / 2.0 = 1.0e-6 ohm m." },
  { id: `${Q}electric-resistivity`, kind: "wrong", examiner: 1,
    answer: "Area = 0.50e-6 m^2. Resistivity = R L / A = 4.0 x 2.0 / 0.50e-6 = 1.6e7 ohm m." },
  { id: `${Q}polarisation`, kind: "correct", examiner: 3,
    answer: "When light passes through a polarising filter it only vibrates in one plane. That can only be done to transverse waves, because they oscillate at right angles to the direction of travel. Longitudinal waves vibrate along the direction of travel so a filter could not polarise them." },
  { id: `${Q}polarisation`, kind: "wrong", examiner: 0,
    answer: "Polarisation shows light is longitudinal because the oscillations are along the direction the light travels." },
  { id: `${Q}resonance-damping`, kind: "correct", examiner: 3,
    answer: "Both curves peak close to the natural frequency. With heavy damping the peak is lower, and the curve is wider and flatter, with the peak a little below the natural frequency." },
  { id: `${Q}resonance-damping`, kind: "wrong", examiner: 1,
    answer: "Both peak near the natural frequency. Heavy damping makes the peak taller and narrower." },
  { id: `${Q}stress-strain`, kind: "correct", examiner: 3,
    answer: "Stress = F / A = 6.0e7 Pa. Strain = 0.0012 / 2.00 = 6.0e-4. Young modulus = stress / strain = 1.0e11 Pa." },
  { id: `${Q}stress-strain`, kind: "wrong", examiner: 2,
    answer: "Stress = F / A = 6.0e7 Pa. Strain = 0.0012 x 2.00 = 2.4e-3. Young modulus = stress / strain = 2.5e10 Pa." },
  { id: `${Q}terminal-speed`, kind: "correct", examiner: 3,
    answer: "As it speeds up the drag grows. At terminal speed the drag has grown until it equals the weight, so the resultant force is zero and by F = ma the acceleration is zero." },
  { id: `${Q}terminal-speed`, kind: "wrong", examiner: 1,
    answer: "The drag gets bigger as it speeds up. Eventually the drag is bigger than the weight so the resultant force is zero and acceleration stops." },
];
