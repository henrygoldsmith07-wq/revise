// Year 12 Physics calculation answers in a student's own words (pass 78, 2026-10-25).
// Every answer and examiner mark is AUTHOR JUDGEMENT, not a moderated mark.
import type { Y12Case } from "./marking-y12-physics-set";
const Q = "cnt:question:authentic-expansion-wjec-alevel-physics-";
const EFF = `${Q}physics-efficiency`;
const YM = `${Q}physics-stress-strain`;
const IR = `${Q}physics-internal-resistance`;
const PE = `${Q}physics-photoelectric-work-function`;
export const y12PhysicsCasesPass78: Y12Case[] = [
  { id: EFF, kind: "correct", examiner: 3,
    answer: "The useful power out is 420 W and the power put in is 600 W. Efficiency = useful divided by input = 420/600 = 0.70, so 70%. The wasted power is the difference, 600 - 420 = 180 W." },
  { id: EFF, kind: "wrong", examiner: 1,
    answer: "Useful power is 420 W and input is 600 W. Efficiency = 600/420 = 1.43 so 143%. The wasted power is 420 W." },
  { id: EFF, kind: "wrong", examiner: 2,
    answer: "Efficiency = 420/600 = 0.70 = 70%. Wasted power = 420 + 600 = 1020 W." },
  { id: YM, kind: "correct", examiner: 3,
    answer: "Stress is force over area = 90 / 1.5e-6 = 6.0e7 Pa. Strain is extension over original length = 0.0012 / 2.00 = 6.0e-4. Young modulus = stress divided by strain = 1.0e11 Pa." },
  { id: YM, kind: "wrong", examiner: 1,
    answer: "Strain = 0.0012 / 2.00 = 6.0e-4. Stress = 90 x 1.5e-6 = 1.35e-4 Pa. Young modulus = strain / stress = 4.4e0." },
  { id: YM, kind: "wrong", examiner: 2,
    answer: "Stress = 90 / 1.5e-6 = 6.0e7 Pa. Strain = 1.2 / 2.00 = 0.60. Young modulus = 6.0e7 / 0.60 = 1.0e8 Pa." },
  { id: IR, kind: "correct", examiner: 2,
    answer: "The lost volts are I times r = 0.50 x 0.80 = 0.40 V. The terminal pd is the emf take away the lost volts: 1.50 - 0.40 = 1.10 V." },
  { id: IR, kind: "wrong", examiner: 1,
    answer: "Lost volts = 0.50 x 0.80 = 0.40 V. Terminal pd = 1.50 + 0.40 = 1.90 V." },
  { id: IR, kind: "wrong", examiner: 0,
    answer: "Terminal pd = emf = 1.50 V because the cell gives out its full emf whatever the current." },
  { id: PE, kind: "correct", examiner: 3,
    answer: "The photon energy is hf = 6.63e-34 x 8.0e14 = 5.3e-19 J. The photon energy is shared between the work function and the maximum kinetic energy, so work function = 5.3e-19 - 1.2e-19 = 4.1e-19 J." },
  { id: PE, kind: "wrong", examiner: 2,
    answer: "hf = 6.63e-34 x 8.0e14 = 5.3e-19 J. Work function = 5.3e-19 + 1.2e-19 = 6.5e-19 J." },
  { id: PE, kind: "wrong", examiner: 1,
    answer: "The work function is the maximum kinetic energy, which is 1.2e-19 J." },
  { id: EFF, kind: "correct", examiner: 3,
    answer: "Useful power 420 W, input 600 W. Efficiency = 420 / 600 = 70 %. Power wasted as heat = 180 W." },
  { id: YM, kind: "correct", examiner: 3,
    answer: "stress = 90 / 1.5e-6 = 6.0e7 Pa, strain = 0.0012 / 2.00 = 6.0e-4, E = 6.0e7 / 6.0e-4 = 1.0e11 Pa" },
  { id: IR, kind: "correct", examiner: 2,
    answer: "Ir = 0.4 V so V = 1.50 - 0.4 = 1.1 V" },
  { id: PE, kind: "correct", examiner: 3,
    answer: "E = hf = 5.304e-19 J. hf = phi + KEmax so phi = 5.304e-19 - 1.2e-19 = 4.104e-19 J which is about 2.6 eV." },
];
