// Year 12 Physics answers in a student's own words (pass 77, 2026-10-25).
// Every answer and examiner mark is AUTHOR JUDGEMENT, not a moderated mark.
import type { Y12Case } from "./marking-y12-physics-set";
const Q = "cnt:question:authentic-expansion-wjec-alevel-physics-";
const SHM = `${Q}physics-shm-condition`;
const HL = `${Q}physics-radioactive-half-life`;
const EXP = `${Q}physics-momentum-explosion`;
const FP = `${Q}more-alevel-physics-field-potential`;
export const y12PhysicsCasesPass77: Y12Case[] = [
  { id: SHM, kind: "correct", examiner: 2,
    answer: "The acceleration is directly proportional to the displacement from the equilibrium position, and it always points towards equilibrium, in the opposite direction to the displacement, so a = -w squared x." },
  { id: SHM, kind: "wrong", examiner: 0,
    answer: "The force is constant and always points away from the middle, so the mass speeds up as it gets further out." },
  { id: HL, kind: "correct", examiner: 2,
    answer: "6 hours is one half-life and 18 hours is 3 of them, so the activity halves three times: 640 to 320 to 160 to 80 kBq." },
  { id: HL, kind: "wrong", examiner: 1,
    answer: "18 divided by 6 is 3 half-lives. Each half-life takes off 320 kBq so after 3 the activity is 640 - 960 which is zero." },
  { id: EXP, kind: "correct", examiner: 3,
    answer: "The trolley starts at rest so the total momentum is zero and has to stay zero. The second part has mass 0.8 kg. 1.2 x 5.0 = 6.0 east so 0.8 x v = -6.0 and v = -7.5 m s-1, so 7.5 m s-1 west." },
  { id: EXP, kind: "wrong", examiner: 1,
    answer: "Momentum is conserved so 2.0 x 0 = 1.2 x 5.0 + 0.8 x v, which gives v = +7.5 m/s so it also goes east at 7.5 m/s." },
  { id: FP, kind: "correct", examiner: 3,
    answer: "V = E x d = 4.0e4 x 0.030 = 1.2e3 V. Moving along the direction of the field the electric potential falls." },
  { id: FP, kind: "wrong", examiner: 2,
    answer: "V = E x d = 4.0e4 x 0.030 = 1.2e3 V. The potential gets bigger as you go in the direction of the field." },
];
