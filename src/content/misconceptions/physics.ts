import { defineMisconceptions } from "./authoring";

const SUBJECT_ID = "wjec-alevel-physics";

export const physicsMisconceptions = defineMisconceptions([
  {
    slug: "weight-normal-third-law",
    subjectId: SUBJECT_ID,
    topics: ["kinematics-dynamics"],
    statement:
      "A book resting on a table: its weight and the table's normal contact force are a Newton's third law pair.",
    explanation:
      "A third-law pair is the same type of force acting on different bodies (book pushes table, table pushes book). Weight (Earth pulls book) and the normal force (table pushes book) are two different forces on the same body, so they are not a pair.",
    example: "The student calls the two forces 'equal and opposite reactions', missing that both act on the book.",
    correction:
      "Name the two bodies each force acts on. Weight pairs with the book's gravitational pull on the Earth; the normal force pairs with the book's push down on the table.",
    tag: "conceptual",
    ao: "AO1",
  },
  {
    slug: "terminal-velocity-zero-force",
    subjectId: SUBJECT_ID,
    topics: ["kinematics-dynamics"],
    statement:
      "At terminal velocity the forces on a falling object become zero, so it keeps falling at constant speed.",
    explanation:
      "At terminal velocity the resultant force is zero - weight and drag balance - but each individual force still acts. Zero resultant force means no further acceleration, not that the forces have vanished.",
    example: "The student writes that drag 'disappears' at terminal velocity, when in fact drag has grown to equal weight.",
    correction:
      "State that weight and drag are equal and opposite, so the resultant force is zero and the velocity is constant.",
    tag: "conceptual",
    ao: "AO1",
  },
  {
    slug: "distance-displacement-reversal",
    subjectId: "aqa-alevel-physics",
    topics: ["kinematics-dynamics"],
    statement: "Distance and displacement measure the same thing, so they give the same value even when motion reverses.",
    explanation:
      "Displacement is a vector — the net change in position from start to finish. Distance is the scalar length of the actual path. When motion reverses, the path length and the net change are different numbers.",
    example: "Walking 100 m north then 100 m back south: the student reports displacement 200 m, when the distance is 200 m but the displacement is 0 m.",
    correction:
      "Track the start and end points for displacement; add up every metre actually travelled for distance.",
    tag: "terminology",
    ao: "AO1",
  },
  {
    slug: "projectile-apex-velocity",
    subjectId: "aqa-alevel-physics",
    topics: ["kinematics-dynamics"],
    statement: "At the top of a projectile's path the object stops moving, so its velocity is zero at that instant.",
    explanation:
      "Only the vertical component of velocity is zero at the apex. The horizontal component is constant throughout the flight, so the object keeps moving forward — the velocity as a whole is not zero.",
    example: "The student says the ball 'hangs' at the top of its arc, treating the zero vertical component as the whole velocity.",
    correction:
      "Resolve into components: at the apex the vertical component uᵧ = 0 while the horizontal component uₓ stays constant, so the projectile continues to move horizontally.",
    tag: "conceptual",
    ao: "AO2",
  },
  // --- AQA GCSE ---------------------------------------------------------
  {
    slug: "gcse-vt-area-is-acceleration",
    subjectId: "aqa-gcse-physics",
    topics: ["kinematics-dynamics"],
    statement: "The area under a velocity–time graph is the acceleration.",
    explanation:
      "On a velocity–time graph the gradient is the acceleration, while the area under the curve is the displacement. Swapping the two is the graph-reading error examiners flag every session.",
    example: "From an area of 20 on a v–t graph the student reports 20 m/s² instead of 20 m.",
    correction:
      "v–t graph: gradient → acceleration, area → displacement. On a displacement–time graph the gradient is the velocity.",
    tag: "graph-reading",
    ao: "AO1",
  },
  {
    slug: "gcse-constant-velocity-force",
    subjectId: "aqa-gcse-physics",
    topics: ["kinematics-dynamics"],
    statement: "An object moving at constant velocity needs a resultant force on it to keep moving.",
    explanation:
      "Newton's first law: with zero resultant force an object keeps moving at constant velocity. A resultant force is what changes the velocity, not what maintains it.",
    example: "The student draws a horizontal force on a car cruising at steady speed, forgetting the forces are balanced.",
    correction:
      "Constant velocity means balanced forces — resultant force zero. Unbalanced forces change the velocity (acceleration).",
    tag: "conceptual",
    ao: "AO1",
  },
  {
    slug: "gcse-third-law-any-equal-opposite",
    subjectId: "aqa-gcse-physics",
    topics: ["kinematics-dynamics"],
    statement: "Any two forces that are equal and opposite form a Newton's third law pair, whatever their type.",
    explanation:
      "A third-law pair must be the same type of force acting on different bodies: the book's pull on the Earth pairs with the Earth's pull on the book. Weight and the normal contact force may be equal and opposite, but they act on the same body and are different types.",
    example: "The student pairs the weight of a book with the table's normal force and calls them 'action and reaction'.",
    correction:
      "Check both tests: same type of force, and each force acts on a different body.",
    tag: "conceptual",
    ao: "AO1",
  },
  {
    slug: "gcse-refraction-wavelength",
    subjectId: "aqa-gcse-physics",
    topics: ["waves"],
    statement: "When light refracts into a denser medium its wavelength stays the same and only the direction changes.",
    explanation:
      "Frequency is set by the source and cannot change at a boundary. Speed falls in the denser medium, and since v = fλ with f fixed, the smaller speed forces a shorter wavelength. λ changes; f never does.",
    example: "The student keeps λ constant and concludes the frequency must drop when light enters glass.",
    correction:
      "Across a boundary: f unchanged, v drops entering a denser medium, so λ = v/f must also drop.",
    tag: "conceptual",
    ao: "AO2",
  },
  {
    slug: "gcse-emf-terminal-pd",
    subjectId: "aqa-gcse-physics",
    topics: ["electric-circuits"],
    statement: "The e.m.f. of a cell and the terminal p.d. across it are the same thing, whatever the current.",
    explanation:
      "e.m.f. is the total energy transferred per coulomb of charge through the cell; terminal p.d. is what remains across the terminals once the internal resistance has used some up. V = E − Ir, so the terminal p.d. falls as the current rises and equals E only when I = 0.",
    example: "The student measures 1.5 V across a cell driving a large current and quotes it as the e.m.f., ignoring the Ir drop.",
    correction:
      "Write E = I(R + r) and V = IR. Terminal p.d. V = E − Ir; it equals e.m.f. only at open circuit.",
    tag: "terminology",
    ao: "AO1",
  },
  // --- Edexcel & OCR boards ----------------------------------------------
  {
    slug: "edexcel-brighter-faster-electrons",
    subjectId: "edexcel-alevel-physics",
    topics: ["quantum"],
    statement: "Making the light brighter gives photoelectrons more kinetic energy.",
    explanation:
      "Each photoelectron absorbs a single photon, so its maximum kinetic energy depends only on frequency: hf = φ + ½mv²max. Intensity sets how many photons arrive per second — it changes the count of photoelectrons, not their energy.",
    example: "The student doubles the lamp brightness and predicts a larger stopping voltage, when the stopping voltage is unchanged.",
    correction:
      "Brighter light → more photoelectrons per second at the same maximum kinetic energy. Higher frequency → higher maximum kinetic energy.",
    tag: "conceptual",
    ao: "AO1",
  },
  {
    slug: "edexcel-centripetal-extra-force",
    subjectId: "edexcel-alevel-physics",
    topics: ["circular-shm"],
    statement: "Draw the centripetal force on the free-body diagram as well as the real forces.",
    explanation:
      "Centripetal force is not a separate force — it is the resultant of the real forces (weight, tension, friction, normal contact). Drawing it as well double-counts and breaks Newton's second law.",
    example: "On a cornering car the student draws weight, contact force and 'the centripetal force' as three arrows, when the horizontal component of contact alone provides mv²/r.",
    correction:
      "Draw only real forces, then state which resultant provides the centripetal force and equate it to mv²/r.",
    tag: "conceptual",
    ao: "AO2",
  },
  {
    slug: "ocr-grav-potential-positive",
    subjectId: "ocr-alevel-physics",
    topics: ["fields"],
    statement: "Gravitational potential is positive near a mass and zero at its surface.",
    explanation:
      "Potential is defined as zero at infinity. Gravity attracts, so bringing a mass in from infinity releases energy and the potential falls below zero: V = −GM/r. It rises toward zero as r increases — never above it.",
    example: "The student plots potential climbing above zero close to the planet, then cannot account for the energy needed to escape.",
    correction:
      "V = −GM/r with V = 0 at infinity: negative everywhere, approaching zero from below as r grows.",
    tag: "conceptual",
    ao: "AO1",
  },
  {
    slug: "ocr-total-binding-vs-per-nucleon",
    subjectId: "ocr-alevel-physics",
    topics: ["nuclear"],
    statement: "A nucleus with the largest total binding energy is the most tightly bound, so uranium is more stable than iron.",
    explanation:
      "Stability follows binding energy per nucleon, which peaks near iron-56. Total binding energy grows with nucleon number, so heavy nuclei have more in total while being less tightly bound per nucleon — which is exactly why fission and fusion both release energy moving toward iron.",
    example: "The student compares U-235 (≈1780 MeV total) with Fe-56 (≈492 MeV) and concludes uranium is more stable.",
    correction:
      "Divide total binding energy by the mass number A: Fe-56 ≈ 8.8 MeV per nucleon beats U-235 ≈ 7.6 — energy is released toward the peak at iron.",
    tag: "conceptual",
    ao: "AO2",
  },
  // --- Edexcel & OCR GCSE -------------------------------------------------
  {
    slug: "edexcel-ke-all-collisions",
    subjectId: "edexcel-gcse-physics",
    topics: ["momentum"],
    statement: "Kinetic energy is conserved in every collision, because momentum is.",
    explanation:
      "Momentum is conserved in any collision in a closed system, but kinetic energy is conserved only in elastic collisions. In inelastic collisions some kinetic energy transfers to thermal and sound stores and to deformation — the momentum balance still holds exactly.",
    example: "For two trolleys that couple on impact the student equates ½mv² before and after and finds an impossible speed.",
    correction:
      "Conserve momentum always. Equate kinetic energy only for a stated elastic collision — otherwise the 'missing' KE has been dissipated.",
    tag: "conceptual",
    ao: "AO2",
  },
  {
    slug: "ocr-energy-lost-destroyed",
    subjectId: "ocr-gcse-physics",
    topics: ["energy-power"],
    statement: "A machine that warms up destroys some of the energy put into it.",
    explanation:
      "Energy is never destroyed — it is transferred to less useful stores, usually heating the surroundings. The energy is dissipated (spread out); the machine's efficiency falls because the useful fraction shrinks, not because energy vanished.",
    example: "The student writes '40% of the input energy is lost' and cannot say where it went.",
    correction:
      "Say dissipated to the thermal store of the surroundings. Efficiency = useful output ÷ total input, and total input = useful + wasted, all conserved.",
    tag: "terminology",
    ao: "AO1",
  },
  // --- WJEC GCSE -----------------------------------------------------------
  {
    slug: "wjec-gcse-parallel-add-directly",
    subjectId: "wjec-gcse-physics",
    topics: ["electric-circuits"],
    statement: "Two resistors in parallel have a combined resistance of R₁ + R₂, just like in series.",
    explanation:
      "Adding directly is the series rule. In parallel the current splits, so it is the reciprocals that add: 1/Rₜ = 1/R₁ + 1/R₂ — and the total is always smaller than either resistor alone.",
    example: "For 6 Ω and 3 Ω in parallel the student writes 9 Ω, when the actual total is 2 Ω — smaller than both branches.",
    correction:
      "Series: add resistances. Parallel: add reciprocals; shortcut for two, Rₜ = R₁R₂/(R₁ + R₂).",
    tag: "method-skipped",
    ao: "AO2",
  },
  {
    slug: "wjec-gcse-lambda-is-half-life",
    subjectId: "wjec-gcse-physics",
    topics: ["nuclear"],
    statement: "The decay constant λ is just the half-life written in seconds, so they can be swapped in the decay equations.",
    explanation:
      "λ is the probability of decay per nucleon per second; the half-life is the time for half the nuclei to decay. They are linked by t½ = ln2/λ — different quantities with different units, so you must convert (λ = ln2/t½) before using N = N₀e^(−λt) or A = λN.",
    example: "With t½ = 8.0 days the student substitutes λ = 8.0 into A = λN, ignoring the ln2 factor and the seconds conversion.",
    correction:
      "Convert first: λ = ln2/t½, in s⁻¹ if t½ is in seconds. Then N = N₀e^(−λt) and A = λN give consistent answers.",
    tag: "units",
    ao: "AO2",
  },
  // --- AQA & Edexcel A-level, wider topics ---------------------------------
  {
    slug: "aqa-diameter-in-stress",
    subjectId: "aqa-alevel-physics",
    topics: ["materials"],
    statement: "Stress = F/A, so for a wire of diameter 1.0 mm the area is 1.0 × 10⁻⁶ m².",
    explanation:
      "The cross-section is a circle, so A = πr² = π(d/2)². Squaring the diameter without halving first inflates the area by a factor of 4 — and deflates the calculated Young modulus by the same factor.",
    example: "With d = 1.0 mm the student uses A = π(1.0 × 10⁻³)² instead of π(0.5 × 10⁻³)², and every stress and E value in the table is a quarter of what it should be.",
    correction:
      "Halve the diameter to get the radius, then square: A = π(d/2)². For d = 1.0 mm, A ≈ 7.9 × 10⁻⁷ m².",
    tag: "substitution-slips",
    ao: "AO2",
  },
  {
    slug: "aqa-node-max-displacement",
    subjectId: "aqa-alevel-physics",
    topics: ["waves"],
    statement: "A node on a stationary wave is a point of maximum oscillation, where the amplitude is largest.",
    explanation:
      "It is the opposite: a node is a point of zero amplitude — destructive interference holds it permanently still. Maximum oscillation happens at antinodes, spaced λ/2 apart between nodes.",
    example: "Labeling a stretched-string harmonic, the student marks the fixed ends as antinodes, contradicting the zero displacement a fixed end must have.",
    correction:
      "Nodes: zero amplitude, λ/2 apart (fixed ends are nodes). Antinodes: maximum amplitude, also λ/2 apart, between nodes.",
    tag: "terminology",
    ao: "AO1",
  },
  {
    slug: "edexcel-rebound-sign-impulse",
    subjectId: "edexcel-alevel-physics",
    topics: ["momentum"],
    statement: "A ball of mass m hitting a wall at speed v and rebounding at speed v changes momentum by zero, because the speeds are equal.",
    explanation:
      "Momentum is a vector: taking the initial direction as positive, Δp = (−mv) − (+mv) = −2mv. The magnitude of the impulse is 2mv, not zero — the reversal, not the speed change alone, sets it.",
    example: "The student answers 'zero force on the wall' for a bouncing ball, when the wall actually feels an impulse of 2mv per bounce.",
    correction:
      "Assign a sign convention first, then subtract: a full rebound doubles the momentum change; a ball that stops gives mv.",
    tag: "substitution-slips",
    ao: "AO2",
  },
]);
