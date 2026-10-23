// Year 12 Physics answers in a student's own words (pass 62, 2026-10-23).
// Every answer and examiner mark is AUTHOR JUDGEMENT, not a moderated mark.
export interface Y12Case { id: string; kind: "correct" | "wrong"; examiner: number; answer: string }
const Q = "cnt:question:";
export const y12PhysicsCases: Y12Case[] = [
  { id: `${Q}authentic-expansion-wjec-alevel-physics-physics-terminal-speed`, kind: "correct", examiner: 3,
    answer: "The faster it falls the more air resistance there is. Eventually the air resistance is the same size as the weight, so the forces balance, there is no resultant force and so it stops accelerating." },
  { id: `${Q}authentic-expansion-wjec-alevel-physics-physics-terminal-speed`, kind: "wrong", examiner: 0,
    answer: "At terminal speed the object stops moving because the drag is bigger than the weight." },
  { id: `${Q}physics-depth-quantum-sp-01-q-intensity-6`, kind: "correct", examiner: 2,
    answer: "A brighter light has more photons arriving per second so more electrons are emitted, but every photon still has the same energy hf, so the max kinetic energy of each electron stays the same." },
  { id: `${Q}physics-depth-quantum-sp-01-q-intensity-6`, kind: "wrong", examiner: 0,
    answer: "Brighter light gives each photon more energy so the electrons come out with a higher maximum kinetic energy." },
  { id: `${Q}physics-depth-nuclear-sp-03-activity-definition-0`, kind: "correct", examiner: 2,
    answer: "Activity is how many nuclei in the sample decay every second. 1 Bq means one decay per second." },
  { id: `${Q}physics-depth-nuclear-sp-03-activity-definition-0`, kind: "wrong", examiner: 0,
    answer: "Activity is the total number of nuclei in a sample that will decay. A becquerel is one nucleus." },
  { id: `${Q}physics-depth-momentum-sp-04-average-force-definition-1`, kind: "correct", examiner: 2,
    answer: "Average force equals the change in momentum divided by the time taken, F = Δp/Δt. If the same momentum change happens over a longer time the force is smaller." },
  { id: `${Q}physics-depth-momentum-sp-04-average-force-definition-1`, kind: "wrong", examiner: 0,
    answer: "Average force is the change in momentum multiplied by the time, so a longer time gives a bigger force." },
  { id: `${Q}physics-motion-graph-signed-area-definition`, kind: "correct", examiner: 2,
    answer: "You add up the areas between the line and the time axis. Areas above the axis count as positive and areas below count as negative, and the total is the displacement." },
  { id: `${Q}physics-motion-graph-signed-area-definition`, kind: "wrong", examiner: 0,
    answer: "Add all the areas as positive numbers, areas below the axis as well, and this gives displacement." },
  { id: `${Q}physics-depth50-kinematics-dynamics-sp-03-constant-assumption-2`, kind: "correct", examiner: 2,
    answer: "The suvat equations only work if acceleration is constant. The car's acceleration changes as its speed changes, so you can't use one value for the whole trip; you would have to split it into short intervals or use data." },
  { id: `${Q}physics-depth50-kinematics-dynamics-sp-03-constant-assumption-2`, kind: "wrong", examiner: 0,
    answer: "SUVAT works for any motion, including when acceleration changes, so one equation is fine for the whole journey." },
  { id: `${Q}physics-depth50-electric-circuits-sp-03-bridge-balance-10`, kind: "correct", examiner: 2,
    answer: "When balanced R1/R2 = R3/R4. The two sides of the detector are at the same potential so there is no p.d. across it and no current flows through it." },
  { id: `${Q}physics-depth50-electric-circuits-sp-03-bridge-balance-10`, kind: "wrong", examiner: 0,
    answer: "When balanced the detector reads its maximum current because the potentials are as different as possible." },
];
