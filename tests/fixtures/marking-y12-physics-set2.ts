// Year 12 Physics answers in a student's own words (pass 73, 2026-10-24).
// Every answer and examiner mark is AUTHOR JUDGEMENT, not a moderated mark.
import type { Y12Case } from "./marking-y12-physics-set";
const Q = "cnt:question:";
export const y12PhysicsCasesPass73: Y12Case[] = [
  { id: `${Q}depth-misconception-momentum-ke`, kind: "correct", examiner: 3,
    answer: "Momentum is a vector, p = mv, but kinetic energy ½mv² is a scalar, so they are different quantities. Two equal masses that stick together keep their momentum, for example 1 kg at 2 m/s hitting a stationary 1 kg gives 2 before and 2 after, but the kinetic energy falls from 2 J to 1 J." },
  { id: `${Q}depth-misconception-momentum-ke`, kind: "wrong", examiner: 0,
    answer: "Momentum and kinetic energy are the same thing so if one is conserved the other must be, because both depend on mass and speed." },
  { id: `${Q}authentic-expansion-wjec-alevel-physics-physics-resonance-damping`, kind: "correct", examiner: 3,
    answer: "Both graphs peak close to the natural frequency. With heavy damping the peak is much lower, the curve is wider and the peak sits slightly below the natural frequency." },
  { id: `${Q}authentic-expansion-wjec-alevel-physics-physics-resonance-damping`, kind: "wrong", examiner: 0,
    answer: "Heavy damping makes the amplitude at resonance bigger and the peak narrower and sharper." },
  { id: `${Q}authentic-source-wjec-alevel-physics-thermal-storage-log`, kind: "correct", examiner: 3,
    answer: "The vacuum has hardly any particles so there is almost no conduction or convection. The shiny surface is a bad emitter and absorber of infrared so little is radiated. Less heat is lost so the salt stays hot for longer." },
  { id: `${Q}authentic-source-wjec-alevel-physics-thermal-storage-log`, kind: "wrong", examiner: 0,
    answer: "The vacuum stops radiation by absorbing it and the shiny surface stops conduction, which makes the salt cool faster." },
  { id: `${Q}authentic-source-aqa-alevel-physics-planetary-mission-report`, kind: "correct", examiner: 3,
    answer: "Gravitational field strength obeys an inverse square law, g is proportional to 1/r². Doubling the distance makes g four times smaller, so the probe weighs a quarter of what it did at R." },
  { id: `${Q}authentic-source-aqa-alevel-physics-planetary-mission-report`, kind: "wrong", examiner: 0,
    answer: "Field strength is inversely proportional to the distance, so doubling r halves g and the weight is half as much." },
  { id: `${Q}authentic-source-ocr-alevel-physics-crash-test-report`, kind: "correct", examiner: 3,
    answer: "t = change in momentum divided by force = 1200/3000 = 0.40 s. So the restraint must take at least 0.40 s, which is over three times longer than the 0.12 s without it." },
  { id: `${Q}authentic-source-ocr-alevel-physics-crash-test-report`, kind: "wrong", examiner: 1,
    answer: "t = force divided by change in momentum = 3000/1200 = 2.5 s, which is much longer than 0.12 s." },
  { id: `${Q}authentic-source-wjec-gcse-physics-sensor-circuit-note`, kind: "correct", examiner: 3,
    answer: "When it gets hotter the thermistor's resistance drops. That makes its share of the total resistance smaller, so the potential difference across it falls and the output goes down." },
  { id: `${Q}authentic-source-wjec-gcse-physics-sensor-circuit-note`, kind: "wrong", examiner: 0,
    answer: "The thermistor's resistance goes up when it gets hotter so it takes a bigger share of the voltage and the output rises." },
];
