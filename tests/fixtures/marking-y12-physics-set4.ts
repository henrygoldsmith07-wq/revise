// Year 12 Physics answers in a student's own words (pass 76, 2026-10-25).
// Every answer and examiner mark is AUTHOR JUDGEMENT, not a moderated mark.
import type { Y12Case } from "./marking-y12-physics-set";
const Q = "cnt:question:authentic-expansion-wjec-alevel-physics-";
const CRIT = `${Q}more-alevel-physics-critical-angle`;
const BIND = `${Q}physics-binding-energy`;
const BETA = `${Q}physics-particle-conservation`;
const KE = `${Q}more-alevel-physics-kinetic-energy`;
export const y12PhysicsCasesPass76: Y12Case[] = [
  { id: CRIT, kind: "correct", examiner: 3,
    answer: "sin C = 1 divided by n = 1/1.50 = 0.667 so C = 41.8 degrees. Total internal reflection needs the light to be going from a more dense material like glass into a less dense one like air, and the angle of incidence has to be bigger than the critical angle." },
  { id: CRIT, kind: "wrong", examiner: 1,
    answer: "sin C = n = 1.50 so C = 90 degrees. Total internal reflection happens when light goes from air into glass at an angle smaller than the critical angle." },
  { id: BIND, kind: "correct", examiner: 3,
    answer: "8.2 MeV per nucleon times 56 nucleons = 459.2 MeV. Binding energy is what you would have to put in to pull the nucleus apart into separate nucleons. A reaction only gives out the difference between the total binding energy before and after, not all of it." },
  { id: BIND, kind: "wrong", examiner: 1,
    answer: "8.2 x 56 = 459.2 MeV. Every nuclear reaction releases all of the binding energy of X because the binding energy is the energy released." },
  { id: BETA, kind: "correct", examiner: 3,
    answer: "An electron and an antineutrino come out. The neutron is neutral and turns into a proton (+1) and an electron (-1), which add up to 0 so charge stays the same. The antineutrino has no charge so it does not change the total." },
  { id: BETA, kind: "wrong", examiner: 1,
    answer: "A positron and a neutrino are emitted. The proton has +1 and the positron has +1 so the charge is +2 and conserved." },
  { id: KE, kind: "correct", examiner: 3,
    answer: "Mean kinetic energy = 3/2 kT = 1.5 x 1.38e-23 x 300 = 6.21e-21 J. It is directly proportional to the kelvin temperature so if T doubles the kinetic energy doubles too." },
  { id: KE, kind: "wrong", examiner: 2,
    answer: "KE = 3/2 kT = 1.5 x 1.38e-23 x 300 = 6.21e-21 J. If the temperature doubles the kinetic energy goes up by four times because speed is squared." },
];
