import type { TeachingBySpecPoint } from "./types";

// WJEC A-level Physics: momentum, circular motion and SHM, fields, and
// thermal physics. G = 6.67 × 10⁻¹¹ N m² kg⁻², k = 1.38 × 10⁻²³ J K⁻¹,
// R = 8.31 J mol⁻¹ K⁻¹, N_A = 6.02 × 10²³ mol⁻¹.

export const physicsMomentumFieldsThermalTeaching: TeachingBySpecPoint = {
  "wjec-alevel-physics.momentum.sp-01": {
    explain: [
      "**Linear momentum** p = mv. It is a vector (kg m s⁻¹), so its direction matters.",
      "**Impulse** = force × time = FΔt = change in momentum Δp. Its unit, N s, is the same as kg m s⁻¹.",
      "For a bounce, the change in momentum includes the reversal of direction: from +15 to −10 m s⁻¹ is a change of 25 m s⁻¹, not 5.",
    ],
    worked: {
      prompt: "A 0.40 kg ball hits a wall at 15 m s⁻¹ and rebounds at 10 m s⁻¹. Contact lasts 0.050 s. Find the impulse and the average force.",
      steps: [
        "Take the direction towards the wall as positive. p before = 0.40 × 15 = +6.0 kg m s⁻¹; after = 0.40 × (−10) = −4.0 kg m s⁻¹.",
        "Δp = −4.0 − 6.0 = −10 kg m s⁻¹: an impulse of 10 N s away from the wall.",
        "Average force = Δp/Δt = 10 / 0.050 = 200 N away from the wall.",
      ],
      answer: "10 N s; 200 N.",
    },
    check: {
      question: "Which unit is equivalent to kg m s⁻¹?",
      options: ["N m", "N s", "J s", "W s"],
      correctIndex: 1,
      explanation: "1 N = 1 kg m s⁻², so 1 N s = 1 kg m s⁻¹.",
    },
    apply: {
      prompt: "A 60 g tennis ball is served from rest at 50 m s⁻¹. The racket is in contact for 4.0 ms. Calculate the average force on the ball.",
      modelAnswer: "Δp = 0.060 × 50 = 3.0 kg m s⁻¹. F = Δp/Δt = 3.0 / 4.0 × 10⁻³ = 750 N.",
      successCriteria: ["Converts g to kg and ms to s", "750 N"],
    },
    trap: {
      wrong: "Subtracting the speeds when an object bounces back (15 − 10 = 5).",
      right: "Momentum is a vector: the change is from +15 to −10, a change of 25 m s⁻¹ in velocity.",
    },
  },

  "wjec-alevel-physics.momentum.sp-02": {
    explain: [
      "**Conservation of linear momentum:** in a closed system (no external resultant force), the total momentum before an interaction equals the total momentum after.",
      "Choose a positive direction and give every velocity a sign. Then Σmu (before) = Σmv (after).",
      "In an **explosion** starting from rest, the total momentum is zero before and after, so the pieces move apart with equal and opposite momenta.",
    ],
    worked: {
      prompt: "A 2.0 kg trolley moving at 3.0 m s⁻¹ hits a stationary 1.0 kg trolley and they stick together. Find their speed afterwards.",
      steps: ["Momentum before = 2.0 × 3.0 + 1.0 × 0 = 6.0 kg m s⁻¹.", "After: (2.0 + 1.0)v = 6.0, so v = 2.0 m s⁻¹."],
      answer: "2.0 m s⁻¹ in the original direction.",
    },
    check: {
      question: "Two skaters at rest push apart. The 40 kg skater moves off at 1.5 m s⁻¹. How fast does the 60 kg skater move?",
      options: ["1.5 m s⁻¹", "1.0 m s⁻¹", "2.25 m s⁻¹", "0"],
      correctIndex: 1,
      explanation: "Total momentum stays zero: 60v = 40 × 1.5, so v = 1.0 m s⁻¹ in the opposite direction.",
    },
    apply: {
      prompt: "A 0.020 kg bullet at 300 m s⁻¹ embeds itself in a 2.0 kg block resting on ice. Calculate the speed of the block and bullet afterwards.",
      modelAnswer: "Momentum before = 0.020 × 300 = 6.0 kg m s⁻¹. After: (2.0 + 0.020)v = 6.0, so v = 6.0 / 2.02 = 2.97 m s⁻¹ ≈ 3.0 m s⁻¹.",
      successCriteria: ["Uses the combined mass after", "≈ 3.0 m s⁻¹"],
    },
  },

  "wjec-alevel-physics.momentum.sp-03": {
    explain: [
      "Momentum is conserved in **every** collision in a closed system. Kinetic energy is conserved only in an **elastic** collision.",
      "In an **inelastic** collision some kinetic energy is transferred to other forms (heat, sound, deformation). A collision where the objects stick together is the most inelastic possible for that momentum.",
      "To decide, calculate the total kinetic energy before and after. For an elastic collision the relative speed of approach also equals the relative speed of separation.",
    ],
    worked: {
      prompt: "Is the trolley collision above (2.0 kg at 3.0 m s⁻¹ sticking to a stationary 1.0 kg trolley) elastic?",
      steps: [
        "E_k before = ½ × 2.0 × 3.0² = 9.0 J.",
        "E_k after = ½ × 3.0 × 2.0² = 6.0 J.",
        "3.0 J of kinetic energy is lost, so the collision is inelastic.",
      ],
      answer: "Inelastic: 3.0 J transferred to other forms.",
    },
    check: {
      question: "In a perfectly elastic collision, which quantities are conserved?",
      options: ["Momentum only", "Kinetic energy only", "Both momentum and kinetic energy", "Neither"],
      correctIndex: 2,
      explanation: "Momentum is conserved in all collisions; elastic means kinetic energy is conserved as well.",
    },
    apply: {
      prompt: "A gas molecule bounces off a container wall with the same speed it arrived with. State what type of collision this is and what that implies for the gas.",
      modelAnswer: "The speed (and so kinetic energy) is unchanged, so the collision is elastic. If molecular collisions were inelastic, the gas would lose kinetic energy and cool by itself; kinetic theory assumes elastic collisions.",
      successCriteria: ["Identifies the collision as elastic", "Links it to no net loss of molecular kinetic energy"],
    },
  },

  "wjec-alevel-physics.momentum.sp-04": {
    explain: [
      "Newton's second law in full: the resultant force equals the rate of change of momentum, F = Δp/Δt.",
      "Average force during an impact = change in momentum ÷ contact time.",
      "For a steady stream of matter (a water jet, a rocket's exhaust), F = (mass per second) × (change in velocity).",
    ],
    worked: {
      prompt: "A hose delivers 2.0 kg of water per second at 15 m s⁻¹ against a wall, where the water stops. Find the force on the wall.",
      steps: [
        "Each second, momentum 2.0 × 15 = 30 kg m s⁻¹ is destroyed.",
        "F = Δp/Δt = 30 / 1.0 = 30 N.",
      ],
      answer: "30 N.",
    },
    check: {
      question: "A 1200 kg car stops from 20 m s⁻¹ in a crash lasting 0.10 s. What is the average force on it?",
      options: ["2.4 kN", "24 kN", "240 kN", "2.4 MN"],
      correctIndex: 2,
      explanation: "F = Δp/Δt = 1200 × 20 / 0.10 = 2.4 × 10⁵ N.",
    },
    apply: {
      prompt: "Explain why F = ma is a special case of F = Δp/Δt, and give a situation where F = ma cannot be used directly.",
      modelAnswer: "If the mass is constant, Δp/Δt = mΔv/Δt = ma. When the mass changes, for example a rocket burning fuel or a conveyor belt gaining sand, the full form F = Δ(mv)/Δt must be used.",
      successCriteria: ["Shows Δ(mv)/Δt = ma for constant m", "Gives a varying-mass example"],
    },
  },

  "wjec-alevel-physics.momentum.sp-05": {
    explain: [
      "In two dimensions, momentum is conserved **separately** in each of two perpendicular directions.",
      "Resolve every momentum into x and y components, apply conservation in x and in y, then recombine with Pythagoras and trigonometry.",
      "If the target starts at rest, the total y-momentum before is zero, so after the collision the y-components cancel.",
    ],
    worked: {
      prompt: "A 0.20 kg puck at 3.0 m s⁻¹ strikes an identical stationary puck. Afterwards the first puck moves at 2.0 m s⁻¹ at 30° to its original line. Find the second puck's velocity.",
      steps: [
        "x: 0.20 × 3.0 = 0.20 × 2.0 cos 30° + 0.20 v_x, so v_x = 3.0 − 1.73 = 1.27 m s⁻¹.",
        "y: 0 = 0.20 × 2.0 sin 30° + 0.20 v_y, so v_y = −1.0 m s⁻¹.",
        "v = √(1.27² + 1.0²) = 1.6 m s⁻¹, at tan⁻¹(1.0/1.27) = 38° on the other side of the line.",
      ],
      answer: "1.6 m s⁻¹ at 38° to the original line, on the opposite side.",
    },
    check: {
      question: "A ball moving along x hits a stationary ball. Afterwards the first ball has a y-momentum of +0.30 kg m s⁻¹. What is the y-momentum of the second ball?",
      options: ["+0.30 kg m s⁻¹", "−0.30 kg m s⁻¹", "0", "It depends on the masses"],
      correctIndex: 1,
      explanation: "Total y-momentum was zero before, so it must be zero after.",
    },
    apply: {
      prompt: "Explain why momentum can be conserved in each direction separately.",
      modelAnswer: "Momentum is a vector. With no external force, there is no external force component in either perpendicular direction, so the total momentum component in each direction is unchanged independently.",
      successCriteria: ["Momentum is a vector", "No external force component in each direction"],
    },
  },

  "wjec-alevel-physics.momentum.sp-06": {
    explain: [
      "Momentum experiments typically use trolleys or gliders with light gates; velocity = card length ÷ time to pass the gate.",
      "Calculate total momentum before and after, each with its uncertainty. If the ranges (value ± uncertainty) overlap, the data are **consistent** with conservation.",
      "Systematic causes of an apparent loss include friction, a sloping track and the card not being perpendicular to the beam.",
    ],
    worked: {
      prompt: "A student finds momentum before = 0.240 ± 0.008 kg m s⁻¹ and after = 0.228 ± 0.010 kg m s⁻¹. Do the results support conservation?",
      steps: [
        "Range before: 0.232 to 0.248. Range after: 0.218 to 0.238.",
        "The ranges overlap (0.232 to 0.238).",
        "So the results are consistent with conservation within the uncertainties, although the slightly lower value after hints at friction.",
      ],
      answer: "Yes: the uncertainty ranges overlap.",
    },
    check: {
      question: "Which change would reduce the effect of friction in a trolley collision experiment?",
      options: [
        "Use heavier trolleys only",
        "Use an air track or tilt the runway slightly to compensate for friction",
        "Use a shorter card",
        "Measure the mass more precisely",
      ],
      correctIndex: 1,
      explanation: "An air track or a friction-compensated slope removes the external force that changes the total momentum.",
    },
    apply: {
      prompt: "A card 50.0 ± 0.5 mm long passes a light gate in 0.125 ± 0.001 s. Calculate the velocity and its percentage uncertainty.",
      modelAnswer: "v = 0.0500 / 0.125 = 0.400 m s⁻¹. % uncertainty = 0.5/50.0 + 0.001/0.125 = 1.0% + 0.8% = 1.8%, so v = 0.400 ± 0.007 m s⁻¹.",
      successCriteria: ["0.400 m s⁻¹", "Adds percentage uncertainties: 1.8%"],
    },
  },

  "wjec-alevel-physics.circular-shm.sp-01": {
    explain: [
      "**Angular velocity** ω is the angle swept per second, in rad s⁻¹: ω = Δθ/Δt = 2π/T = 2πf.",
      "Every point on a rotating object has the same ω, but the linear speed depends on the radius: **v = ωr**.",
      "One revolution is 2π radians; convert rev min⁻¹ to rad s⁻¹ by × 2π ÷ 60.",
    ],
    worked: {
      prompt: "A bicycle wheel of radius 0.35 m turns at 8.0 revolutions per second. Find ω and the speed of a point on the rim.",
      steps: ["ω = 2πf = 2π × 8.0 = 50 rad s⁻¹.", "v = ωr = 50.3 × 0.35 = 17.6 m s⁻¹."],
      answer: "50 rad s⁻¹ and 18 m s⁻¹.",
    },
    check: {
      question: "Two children sit on a roundabout, one at 1 m and one at 2 m from the centre. Which is true?",
      options: [
        "Same speed, different angular velocity",
        "Same angular velocity; the outer child moves twice as fast",
        "Same speed and angular velocity",
        "The inner child moves faster",
      ],
      correctIndex: 1,
      explanation: "Both turn through the same angle per second (same ω); v = ωr, so doubling r doubles v.",
    },
    apply: {
      prompt: "A hard disk spins at 7200 rpm. Calculate its angular velocity and the speed of a point 4.5 cm from the axis.",
      modelAnswer: "f = 7200/60 = 120 Hz; ω = 2π × 120 = 754 rad s⁻¹. v = ωr = 754 × 0.045 = 34 m s⁻¹.",
      successCriteria: ["Converts rpm to rad s⁻¹: 754 rad s⁻¹", "v ≈ 34 m s⁻¹"],
    },
  },

  "wjec-alevel-physics.circular-shm.sp-02": {
    explain: [
      "An object moving in a circle at constant speed is **accelerating**, because its direction (and so its velocity) keeps changing.",
      "The acceleration points to the **centre**: a = v²/r = ω²r.",
      "A resultant force towards the centre, the **centripetal force** F = mv²/r, is needed. It is not a new kind of force: it is provided by tension, friction, gravity or a contact force.",
    ],
    worked: {
      prompt: "A 1000 kg car rounds a bend of radius 80 m at 20 m s⁻¹. Find its acceleration and the centripetal force. What provides that force?",
      steps: ["a = v²/r = 20² / 80 = 5.0 m s⁻².", "F = ma = 1000 × 5.0 = 5000 N.", "On a level road, friction between the tyres and the road provides it."],
      answer: "5.0 m s⁻² towards the centre; 5.0 kN, provided by friction.",
    },
    check: {
      question: "A ball on a string is whirled in a horizontal circle. The string breaks. Which way does the ball move immediately afterwards?",
      options: ["Towards the centre", "Directly away from the centre", "Along the tangent to the circle", "It keeps circling"],
      correctIndex: 2,
      explanation: "With no centripetal force, it continues in a straight line in the direction it was moving: along the tangent.",
    },
    apply: {
      prompt: "Explain why passengers feel pushed outwards on a fairground ride that spins them in a circle, when the force on them is actually inwards.",
      modelAnswer: "Their bodies tend to continue in a straight line (Newton's first law). The seat or wall must push them inwards to provide the centripetal force. They feel the wall pressing on them and interpret their tendency to move straight on as being thrown outwards; no outward force acts.",
      successCriteria: ["Inertia: tendency to move in a straight line", "The contact force inwards provides the centripetal force"],
    },
    trap: {
      wrong: "Adding a centripetal force to a free-body diagram as an extra force.",
      right: "Draw only the real forces (weight, tension, friction, normal force); their resultant towards the centre is the centripetal force.",
    },
  },

  "wjec-alevel-physics.circular-shm.sp-03": {
    explain: [
      "**Simple harmonic motion** is defined by: the acceleration is **proportional to the displacement** from equilibrium and always **directed towards** the equilibrium position.",
      "As an equation: a = −ω²x. The minus sign shows the acceleration opposes the displacement.",
      "The period of SHM does not depend on the amplitude (it is isochronous), which is why pendulums keep time.",
    ],
    worked: {
      prompt: "An oscillator has acceleration −3.2 m s⁻² at x = 0.020 m and −6.4 m s⁻² at x = 0.040 m. Is this consistent with SHM? Find ω.",
      steps: [
        "Doubling x doubles a, and a is opposite in sign to x: consistent with a = −ω²x.",
        "ω² = 3.2 / 0.020 = 160 s⁻², so ω = 12.6 rad s⁻¹.",
      ],
      answer: "Yes; ω ≈ 13 rad s⁻¹.",
    },
    check: {
      question: "What does the minus sign in a = −ω²x mean?",
      options: [
        "The acceleration is always negative",
        "The acceleration is always opposite to the displacement, towards equilibrium",
        "The object slows down",
        "The amplitude decreases",
      ],
      correctIndex: 1,
      explanation: "When x is positive, a is negative and vice versa: always towards equilibrium.",
    },
    apply: {
      prompt: "Show that a mass on a spring (stiffness k) moves with SHM, and find ω in terms of k and m.",
      modelAnswer: "Displaced by x, the restoring force is F = −kx (Hooke's law). So a = F/m = −(k/m)x. This has the form a = −ω²x, so the motion is SHM with ω² = k/m, ω = √(k/m).",
      successCriteria: ["F = −kx", "a = −(k/m)x matches a = −ω²x", "ω = √(k/m)"],
    },
  },

  "wjec-alevel-physics.circular-shm.sp-04": {
    explain: [
      "Starting from maximum displacement: x = A cos ωt. Velocity v = −Aω sin ωt; acceleration a = −Aω² cos ωt.",
      "Speed at displacement x: v = ±ω√(A² − x²). Maximum speed v_max = ωA at equilibrium; maximum acceleration a_max = ω²A at the extremes.",
      "Period T = 2π/ω. Velocity is a quarter cycle out of phase with displacement; acceleration is in antiphase with displacement.",
    ],
    worked: {
      prompt: "A body oscillates in SHM with amplitude 4.0 cm and frequency 2.5 Hz. Find ω, the maximum speed, the maximum acceleration and the speed at x = 2.0 cm.",
      steps: [
        "ω = 2πf = 15.7 rad s⁻¹.",
        "v_max = ωA = 15.7 × 0.040 = 0.63 m s⁻¹; a_max = ω²A = 15.7² × 0.040 = 9.9 m s⁻².",
        "At x = 0.020 m: v = 15.7 × √(0.040² − 0.020²) = 0.54 m s⁻¹.",
      ],
      answer: "15.7 rad s⁻¹; 0.63 m s⁻¹; 9.9 m s⁻²; 0.54 m s⁻¹.",
    },
    check: {
      question: "Where in its oscillation does a body in SHM have zero acceleration?",
      options: ["At the extremes", "At the equilibrium position", "Halfway to the extreme", "Nowhere"],
      correctIndex: 1,
      explanation: "a = −ω²x, so a = 0 at x = 0, where the speed is maximum.",
    },
    apply: {
      prompt: "The displacement of a body in SHM is x = 0.050 cos(6.0t) m. State the amplitude and period, and calculate the maximum acceleration.",
      modelAnswer: "Amplitude = 0.050 m. ω = 6.0 rad s⁻¹, so T = 2π/6.0 = 1.05 s. a_max = ω²A = 36 × 0.050 = 1.8 m s⁻².",
      successCriteria: ["A = 0.050 m", "T ≈ 1.0 s", "a_max = 1.8 m s⁻²"],
    },
  },

  "wjec-alevel-physics.circular-shm.sp-05": {
    explain: [
      "**Simple pendulum** (small angles, under about 10°): T = 2π√(L/g). It does not depend on the mass or (for small swings) the amplitude.",
      "**Mass on a spring:** T = 2π√(m/k). It does not depend on g, so it has the same period on the Moon.",
      "To measure a period, time many oscillations (say 20) and divide, starting timing as the bob passes the equilibrium position, where it moves fastest.",
    ],
    worked: {
      prompt: "Find the period of a 0.80 m pendulum, and of a 0.50 kg mass on a spring of stiffness 20 N m⁻¹.",
      steps: ["Pendulum: T = 2π√(0.80 / 9.81) = 1.79 s.", "Spring: T = 2π√(0.50 / 20) = 0.99 s."],
      answer: "1.8 s and 0.99 s.",
    },
    check: {
      question: "A pendulum's length is quadrupled. What happens to its period?",
      options: ["It quadruples", "It doubles", "It halves", "It is unchanged"],
      correctIndex: 1,
      explanation: "T ∝ √L, so × 4 in L gives × 2 in T.",
    },
    apply: {
      prompt: "Describe how to determine g using a simple pendulum, including how to process the results.",
      modelAnswer: "Measure the length L from the support to the centre of the bob for several lengths. For each, time 20 small-angle oscillations from the equilibrium position, repeat and average, then divide by 20 to find T. Plot T² against L: T² = (4π²/g)L, so the gradient is 4π²/g and g = 4π²/gradient.",
      successCriteria: ["Times many oscillations at small angles", "Plots T² against L", "g = 4π² ÷ gradient"],
    },
  },

  "wjec-alevel-physics.circular-shm.sp-06": {
    explain: [
      "In undamped SHM the **total energy is constant**; it changes continually between kinetic and potential.",
      "At equilibrium: all kinetic (maximum speed). At the extremes: all potential, momentarily at rest.",
      "For a mass on a spring, total energy E = ½kA² = ½mω²A². The kinetic energy at displacement x is ½k(A² − x²).",
    ],
    worked: {
      prompt: "A 0.50 kg mass on a spring of stiffness 20 N m⁻¹ oscillates with amplitude 0.10 m. Find the total energy and the maximum speed.",
      steps: [
        "E = ½kA² = ½ × 20 × 0.10² = 0.10 J.",
        "At equilibrium all of this is kinetic: ½mv² = 0.10, so v = √(2 × 0.10 / 0.50) = 0.63 m s⁻¹.",
        "Check: ω = √(k/m) = 6.32 rad s⁻¹ and ωA = 0.63 m s⁻¹.",
      ],
      answer: "0.10 J; 0.63 m s⁻¹.",
    },
    check: {
      question: "The amplitude of an undamped oscillator is doubled. What happens to its total energy?",
      options: ["It doubles", "It quadruples", "It halves", "It is unchanged"],
      correctIndex: 1,
      explanation: "E ∝ A², so doubling the amplitude multiplies the energy by 4.",
    },
    apply: {
      prompt: "Describe how the kinetic and potential energies of a pendulum vary during one complete oscillation.",
      modelAnswer: "At one extreme the energy is all gravitational potential and the kinetic energy is zero. As it swings down, potential energy becomes kinetic until, at the lowest point, kinetic energy is maximum and potential minimum. The reverse happens up to the other extreme, and the cycle repeats twice per oscillation; the total stays constant if there is no damping.",
      successCriteria: ["Maximum kinetic at equilibrium, maximum potential at extremes", "Total constant without damping", "Two exchanges per oscillation"],
    },
  },

  "wjec-alevel-physics.circular-shm.sp-07": {
    explain: [
      "**Damping** is the loss of an oscillator's energy to its surroundings, usually through friction or drag, so its amplitude decreases over time. Light damping: slow decay over many cycles. **Critical** damping: returns to equilibrium in the shortest time without oscillating. Heavy damping: returns slowly without oscillating.",
      "A **forced** oscillator is driven at a driving frequency. **Resonance**: when the driving frequency equals the natural frequency, energy is transferred most efficiently and the amplitude is a maximum.",
      "More damping makes the resonance peak **lower** and **broader**, and moves it slightly below the natural frequency.",
    ],
    worked: {
      prompt: "A car's suspension is designed to be critically damped. Explain why, and what would happen if the shock absorbers were worn (damping too light).",
      steps: [
        "Critical damping returns the car to its rest position as quickly as possible after a bump, without bouncing.",
        "With light damping the car would keep oscillating after each bump.",
        "Bumps at the car's natural frequency could also drive it to large-amplitude resonance.",
      ],
      answer: "Critical damping gives the quickest return without oscillation; worn dampers let the car bounce and resonate.",
    },
    check: {
      question: "How does increasing the damping change a resonance curve?",
      options: [
        "The peak becomes higher and sharper",
        "The peak becomes lower and broader",
        "The peak moves to a much higher frequency",
        "The curve is unchanged",
      ],
      correctIndex: 1,
      explanation: "Damping removes energy, limiting the maximum amplitude and spreading the response over a wider frequency range.",
    },
    apply: {
      prompt: "Explain why soldiers are told to break step when crossing a bridge.",
      modelAnswer: "Marching in step applies a periodic driving force. If its frequency matches a natural frequency of the bridge, resonance occurs: energy is transferred efficiently and the amplitude can grow dangerously large. Breaking step removes the single driving frequency.",
      successCriteria: ["Periodic driving force", "Resonance when driving frequency = natural frequency", "Large amplitude"],
    },
  },

  "wjec-alevel-physics.fields.sp-01": {
    explain: [
      "**Newton's law of gravitation:** F = Gm₁m₂/r². **Coulomb's law:** F = Q₁Q₂/(4πε₀r²).",
      "Both are **inverse-square** laws for point masses or charges (or spheres, measured from their centres): doubling r quarters the force.",
      "Differences: gravity is always attractive and acts on mass; the electric force can attract or repel and acts on charge. The electric force between two protons is about 10³⁶ times the gravitational force.",
    ],
    worked: {
      prompt: "Compare the electric and gravitational forces between two protons (Q = 1.60 × 10⁻¹⁹ C, m = 1.67 × 10⁻²⁷ kg, 1/4πε₀ = 8.99 × 10⁹ N m² C⁻²).",
      steps: [
        "The ratio does not depend on r, because both forces ∝ 1/r².",
        "Ratio = (8.99 × 10⁹ × (1.60 × 10⁻¹⁹)²) / (6.67 × 10⁻¹¹ × (1.67 × 10⁻²⁷)²) = 1.2 × 10³⁶.",
      ],
      answer: "The electric force is about 10³⁶ times larger.",
    },
    check: {
      question: "The distance between two point charges is tripled. The force between them becomes:",
      options: ["One third", "One ninth", "Three times larger", "Nine times larger"],
      correctIndex: 1,
      explanation: "F ∝ 1/r², so × 3 in r gives × 1/9 in F.",
    },
    apply: {
      prompt: "State one similarity and two differences between gravitational and electric fields.",
      modelAnswer: "Similarity: both obey an inverse-square law for point sources. Differences: gravitational forces are always attractive while electric forces can repel; gravity acts on mass while the electric force acts on charge (and electric forces are vastly stronger between particles).",
      successCriteria: ["Inverse-square similarity", "Attract only vs attract or repel", "Mass vs charge, or relative strength"],
    },
  },

  "wjec-alevel-physics.fields.sp-02": {
    explain: [
      "**Gravitational field strength** g = force per unit mass = F/m (N kg⁻¹). **Electric field strength** E = force per unit positive charge = F/Q (N C⁻¹).",
      "Field lines show the direction of the force on a test mass or positive test charge; their spacing shows the strength.",
      "Between parallel plates the electric field is uniform: E = V/d.",
    ],
    worked: {
      prompt: "An electron (charge −1.60 × 10⁻¹⁹ C, mass 9.11 × 10⁻³¹ kg) is in a uniform field of 5000 N C⁻¹. Find the force on it and its acceleration.",
      steps: [
        "F = EQ = 5000 × 1.60 × 10⁻¹⁹ = 8.0 × 10⁻¹⁶ N, opposite to the field direction (the electron is negative).",
        "a = F/m = 8.0 × 10⁻¹⁶ / 9.11 × 10⁻³¹ = 8.8 × 10¹⁴ m s⁻².",
      ],
      answer: "8.0 × 10⁻¹⁶ N; 8.8 × 10¹⁴ m s⁻².",
    },
    check: {
      question: "Two parallel plates 2.0 cm apart have a p.d. of 500 V. What is the field strength between them?",
      options: ["10 N C⁻¹", "250 N C⁻¹", "2.5 × 10⁴ N C⁻¹", "1.0 × 10⁴ N C⁻¹"],
      correctIndex: 2,
      explanation: "E = V/d = 500 / 0.020 = 2.5 × 10⁴ V m⁻¹ (= N C⁻¹).",
    },
    apply: {
      prompt: "Explain why the gravitational field near the Earth's surface can be treated as uniform when a ball is thrown, but not for a satellite.",
      modelAnswer: "Over the few metres a ball travels, the distance from the Earth's centre hardly changes compared with the radius (6400 km), so g is effectively constant. A satellite moves hundreds or thousands of km away and around the Earth, so both the strength (inverse square) and direction of g change significantly.",
      successCriteria: ["Height change negligible compared with Earth's radius", "Satellite: strength and direction change"],
    },
  },

  "wjec-alevel-physics.fields.sp-03": {
    explain: [
      "**Potential** at a point is the work done per unit mass (gravitational) or per unit positive charge (electric) in bringing it from infinity to that point.",
      "Gravitational potential V = −GM/r is always negative (zero at infinity, attractive force). Electric potential V = Q/(4πε₀r) has the sign of Q.",
      "Field strength is the negative **potential gradient**: g = −ΔV/Δr, E = −ΔV/Δx. Equipotentials are always perpendicular to field lines; no work is done moving along one.",
    ],
    worked: {
      prompt: "How much energy is needed to move a 1000 kg probe from the Earth's surface (V = −62.5 MJ kg⁻¹) to an orbit where V = −58.1 MJ kg⁻¹?",
      steps: ["ΔV = −58.1 − (−62.5) = +4.4 MJ kg⁻¹.", "Energy = mΔV = 1000 × 4.4 × 10⁶ = 4.4 × 10⁹ J."],
      answer: "4.4 × 10⁹ J (ignoring the kinetic energy needed for orbit).",
    },
    check: {
      question: "Why is gravitational potential always negative?",
      options: [
        "Gravity points downwards",
        "Zero is at infinity, and work must be done against the attraction to get there",
        "Mass can be negative",
        "It is a convention with no reason",
      ],
      correctIndex: 1,
      explanation: "An object anywhere in the field has less potential energy than at infinity, because energy is needed to pull it away.",
    },
    apply: {
      prompt: "The potential falls by 120 V over 0.030 m in a uniform field. Calculate the field strength and state its direction.",
      modelAnswer: "E = −ΔV/Δx = 120 / 0.030 = 4.0 × 10³ V m⁻¹, pointing in the direction in which the potential decreases.",
      successCriteria: ["4.0 × 10³ V m⁻¹", "Direction of decreasing potential"],
    },
  },

  "wjec-alevel-physics.fields.sp-04": {
    explain: [
      "Outside a spherical body, g = GM/r², measured from its **centre**. At twice the distance from the centre, g is a quarter.",
      "For a circular orbit, gravity provides the centripetal force: GMm/r² = mv²/r, so **v = √(GM/r)**. The orbital speed does not depend on the satellite's mass.",
      "Period T = 2πr/v; combining gives T² = (4π²/GM)r³ (Kepler's third law).",
    ],
    worked: {
      prompt: "The ISS orbits 400 km above the Earth (radius 6370 km, mass 5.97 × 10²⁴ kg). Find its speed and period.",
      steps: [
        "r = 6370 + 400 = 6770 km = 6.77 × 10⁶ m.",
        "v = √(GM/r) = √(6.67 × 10⁻¹¹ × 5.97 × 10²⁴ / 6.77 × 10⁶) = 7.67 × 10³ m s⁻¹.",
        "T = 2πr/v = 2π × 6.77 × 10⁶ / 7670 = 5550 s = 92 minutes.",
      ],
      answer: "7.7 km s⁻¹; about 92 minutes.",
    },
    check: {
      question: "g at the Earth's surface is 9.81 N kg⁻¹. What is it at a height equal to one Earth radius above the surface?",
      options: ["4.9 N kg⁻¹", "2.45 N kg⁻¹", "9.81 N kg⁻¹", "1.09 N kg⁻¹"],
      correctIndex: 1,
      explanation: "The distance from the centre doubles (r = 2R), so g falls to 9.81/4 = 2.45 N kg⁻¹.",
    },
    apply: {
      prompt: "Show that the orbital speed of a satellite does not depend on its mass.",
      modelAnswer: "Gravity provides the centripetal force: GMm/r² = mv²/r. The satellite's mass m appears on both sides and cancels, leaving v² = GM/r, which depends only on the planet's mass M and the orbital radius r.",
      successCriteria: ["Equates gravitational and centripetal force", "m cancels", "v = √(GM/r)"],
    },
    trap: {
      wrong: "Using the height above the surface as r.",
      right: "r is measured from the planet's centre: add the planet's radius.",
    },
  },

  "wjec-alevel-physics.fields.sp-05": {
    explain: [
      "A current-carrying conductor in a magnetic field experiences a force, greatest when the current is perpendicular to the field and zero when parallel.",
      "**Fleming's left-hand rule:** First finger = Field, seCond finger = conventional Current, thuMb = Motion (force).",
      "A moving charge also feels a force, perpendicular to both its velocity and the field. Because the force is always perpendicular to the velocity it does no work: the speed is constant and, in a uniform field, the charge moves in a **circle**.",
      "For negative charges (electrons) the conventional current is opposite to their motion: reverse the direction before applying the rule.",
    ],
    worked: {
      prompt: "An electron moves east through a magnetic field pointing vertically upwards. Which way is the force on it?",
      steps: [
        "Conventional current is opposite to electron flow: west.",
        "Field (first finger) up, current (second finger) west.",
        "The thumb gives the force: north.",
      ],
      answer: "North (horizontal).",
    },
    check: {
      question: "Why does a charged particle moving perpendicular to a uniform magnetic field keep a constant speed?",
      options: [
        "The magnetic force is zero",
        "The force is always perpendicular to the velocity, so it does no work",
        "The particle has no mass",
        "The field is uniform",
      ],
      correctIndex: 1,
      explanation: "A force perpendicular to the motion changes direction but not speed; it provides a centripetal force.",
    },
    apply: {
      prompt: "Explain how a simple d.c. motor produces continuous rotation.",
      modelAnswer: "Current in the coil's sides is perpendicular to the field, so equal and opposite forces act on the two sides (Fleming's left-hand rule), giving a turning effect. A split-ring commutator reverses the current every half turn, so the forces keep turning the coil in the same direction.",
      successCriteria: ["Opposite forces on the two sides create a turning effect", "Commutator reverses current each half turn"],
    },
  },

  "wjec-alevel-physics.fields.sp-06": {
    explain: [
      "Force on a wire: **F = BIl sin θ**, where θ is the angle between the current and the field. B is the magnetic flux density (tesla, T).",
      "Force on a moving charge: **F = BQv** (when v ⊥ B).",
      "In a uniform field this force is the centripetal force: BQv = mv²/r, so the radius of the circular path is **r = mv/(BQ)**. Faster or heavier particles curve less; stronger fields curve them more.",
    ],
    worked: {
      prompt: "An electron moves at 2.0 × 10⁷ m s⁻¹ perpendicular to a field of 1.0 mT. Find the radius of its path.",
      steps: ["r = mv/(BQ) = 9.11 × 10⁻³¹ × 2.0 × 10⁷ / (1.0 × 10⁻³ × 1.60 × 10⁻¹⁹).", "r = 0.11 m."],
      answer: "11 cm.",
    },
    check: {
      question: "A 0.25 m wire carries 3.0 A at 30° to a 0.040 T field. What force acts on it?",
      options: ["0.030 N", "0.015 N", "0.026 N", "0.30 N"],
      correctIndex: 1,
      explanation: "F = BIl sin θ = 0.040 × 3.0 × 0.25 × sin 30° = 0.015 N.",
    },
    apply: {
      prompt: "In a mass spectrometer, ions of the same charge and speed enter a magnetic field. Explain how they are separated.",
      modelAnswer: "Each ion moves in a circle of radius r = mv/(BQ). With B, Q and v the same for all ions, r ∝ m, so heavier ions follow wider arcs and land at different positions on the detector.",
      successCriteria: ["r = mv/(BQ)", "Same B, Q, v so r ∝ m", "Different landing positions"],
    },
  },

  "wjec-alevel-physics.fields.sp-07": {
    explain: [
      "**Magnetic flux** Φ = BA (Wb) for a field perpendicular to an area A. **Flux linkage** = NΦ for a coil of N turns.",
      "**Faraday's law:** the induced emf is equal to the rate of change of magnetic flux linkage: ε = −Δ(NΦ)/Δt.",
      "**Lenz's law:** the direction of the induced current is such that it **opposes the change** that produces it. This is energy conservation: you must do work to keep the change going.",
    ],
    worked: {
      prompt: "A magnet is pushed north-pole first into a coil. Which pole does the near end of the coil become, and why?",
      steps: [
        "The flux through the coil is increasing.",
        "By Lenz's law the induced current opposes the increase, so it repels the approaching magnet.",
        "The near end becomes a north pole.",
      ],
      answer: "North pole, repelling the magnet.",
    },
    check: {
      question: "Which change does NOT induce an emf in a coil?",
      options: [
        "Moving a magnet into the coil",
        "Holding a strong magnet stationary inside the coil",
        "Rotating the coil in a field",
        "Switching on a current in a nearby coil",
      ],
      correctIndex: 1,
      explanation: "An emf needs a changing flux linkage. A stationary magnet gives a constant flux, so no emf.",
    },
    apply: {
      prompt: "Explain, using Lenz's law, why it is harder to push a magnet into a coil when the coil is connected to a resistor than when the circuit is open.",
      modelAnswer: "With a complete circuit an induced current flows, and by Lenz's law it produces a field that opposes the magnet's motion, so you must do work against it; that work becomes electrical energy dissipated in the resistor. With an open circuit there is an emf but no current, so no opposing force.",
      successCriteria: ["Current only flows in a complete circuit", "Its field opposes the change", "Work done becomes electrical energy"],
    },
  },

  "wjec-alevel-physics.fields.sp-08": {
    explain: [
      "Induced emf = rate of change of flux linkage: ε = NΔΦ/Δt (magnitude), with ΔΦ = Δ(BA).",
      "Flux can change because B changes, the area changes (a rod moving along rails), or the angle changes (a rotating coil).",
      "For a rod of length l moving at speed v perpendicular to B: ε = Blv. Use Lenz's law (or Fleming's right-hand rule) for the direction.",
    ],
    worked: {
      prompt: "A coil of 200 turns and area 4.0 × 10⁻³ m² lies perpendicular to a 0.50 T field. The field falls to zero in 0.10 s. Find the average induced emf.",
      steps: [
        "Change in flux per turn = 0.50 × 4.0 × 10⁻³ = 2.0 × 10⁻³ Wb.",
        "Change in flux linkage = 200 × 2.0 × 10⁻³ = 0.40 Wb turns.",
        "ε = 0.40 / 0.10 = 4.0 V.",
      ],
      answer: "4.0 V.",
    },
    check: {
      question: "The same flux change happens in half the time. What happens to the induced emf?",
      options: ["It halves", "It doubles", "It is unchanged", "It quadruples"],
      correctIndex: 1,
      explanation: "ε = Δ(NΦ)/Δt: halving Δt doubles the emf.",
    },
    apply: {
      prompt: "An aircraft with a 40 m wingspan flies horizontally at 250 m s⁻¹ where the vertical component of the Earth's field is 4.0 × 10⁻⁵ T. Calculate the emf between the wingtips.",
      modelAnswer: "ε = Blv = 4.0 × 10⁻⁵ × 40 × 250 = 0.40 V.",
      successCriteria: ["Uses ε = Blv with the vertical field component", "0.40 V"],
    },
  },

  "wjec-alevel-physics.thermal.sp-01": {
    explain: [
      "**Internal energy** is the sum of the randomly distributed kinetic and potential energies of all the particles in a body.",
      "Heating raises the **kinetic** part, which we detect as a rise in temperature. During a change of state, the energy supplied increases the **potential** part (breaking bonds), so the temperature stays constant.",
      "Internal energy can be increased by heating or by doing work on the system (first law: ΔU = Q + W, with W the work done on it).",
    ],
    worked: {
      prompt: "Ice at 0 °C is heated and melts into water at 0 °C. What happens to the internal energy, the kinetic energy and the potential energy of its molecules?",
      steps: [
        "Energy is supplied, so internal energy increases.",
        "The temperature is constant, so the mean kinetic energy of the molecules is unchanged.",
        "The increase is all in potential energy, as bonds between molecules are broken or weakened.",
      ],
      answer: "Internal energy rises; kinetic energy unchanged; potential energy rises.",
    },
    check: {
      question: "Which property of a substance is directly related to the mean random kinetic energy of its particles?",
      options: ["Internal energy", "Temperature", "Specific latent heat", "Density"],
      correctIndex: 1,
      explanation: "Temperature measures the mean random kinetic energy; internal energy also includes potential energy.",
    },
    apply: {
      prompt: "Explain why a gas heats up when it is compressed quickly in a bicycle pump.",
      modelAnswer: "Work is done on the gas by the piston. Compressed quickly, there is no time for heat to flow out, so the work done increases the gas's internal energy. For an ideal gas the internal energy is all kinetic, so the temperature rises.",
      successCriteria: ["Work done on the gas", "Little heat escapes", "Internal (kinetic) energy rises, so temperature rises"],
    },
  },

  "wjec-alevel-physics.thermal.sp-02": {
    explain: [
      "Heating without a change of state: **Q = mcΔT**, where c is the specific heat capacity (J kg⁻¹ K⁻¹).",
      "Changing state at constant temperature: **Q = mL**, where L is the specific latent heat of fusion (melting) or vaporisation (boiling) (J kg⁻¹).",
      "Multi-stage problems: add the energy for each stage separately: warm the solid, melt it, warm the liquid.",
    ],
    worked: {
      prompt: "How much energy turns 0.20 kg of ice at −10 °C into water at 30 °C? (c_ice = 2100, c_water = 4200 J kg⁻¹ K⁻¹, L_fusion = 3.34 × 10⁵ J kg⁻¹.)",
      steps: [
        "Warm the ice to 0 °C: 0.20 × 2100 × 10 = 4200 J.",
        "Melt it: 0.20 × 3.34 × 10⁵ = 66 800 J.",
        "Warm the water to 30 °C: 0.20 × 4200 × 30 = 25 200 J.",
        "Total = 96 200 J.",
      ],
      answer: "9.6 × 10⁴ J.",
    },
    check: {
      question: "During melting, the temperature of a solid stays constant even though it is heated. Why?",
      options: [
        "The heater stops working",
        "The energy increases the potential energy of the particles, not their kinetic energy",
        "Heat is lost as fast as it is supplied",
        "The specific heat capacity is zero",
      ],
      correctIndex: 1,
      explanation: "The energy is used to separate particles (latent heat), so the mean kinetic energy and temperature do not change.",
    },
    apply: {
      prompt: "A 2.0 kW kettle starts boiling and is left on for 3.0 minutes. Calculate the mass of water boiled away (L_vap = 2.26 × 10⁶ J kg⁻¹), stating one assumption.",
      modelAnswer: "Energy = 2000 × 180 = 3.6 × 10⁵ J. m = Q/L = 3.6 × 10⁵ / 2.26 × 10⁶ = 0.16 kg. Assumption: all the electrical energy goes into vaporising water (no heat lost to the surroundings).",
      successCriteria: ["Energy = power × time in seconds", "0.16 kg", "States the no-loss assumption"],
    },
  },

  "wjec-alevel-physics.thermal.sp-03": {
    explain: [
      "**Ideal gas equation:** pV = nRT (n in moles) or pV = NkT (N molecules). k = R/N_A.",
      "**T must be in kelvin:** T(K) = θ(°C) + 273. Using °C is the most common error.",
      "For a fixed mass of gas, pV/T is constant, which gives Boyle's law (pV constant at constant T), and the pressure and volume laws.",
    ],
    worked: {
      prompt: "0.020 m³ of gas is at 1.0 × 10⁵ Pa and 20 °C. Find the number of moles, the number of molecules, and the pressure if it is heated to 80 °C at constant volume.",
      steps: [
        "T = 293 K. n = pV/RT = 1.0 × 10⁵ × 0.020 / (8.31 × 293) = 0.82 mol.",
        "N = nN_A = 0.82 × 6.02 × 10²³ = 4.9 × 10²³.",
        "Constant volume: p ∝ T, so p = 1.0 × 10⁵ × 353/293 = 1.2 × 10⁵ Pa.",
      ],
      answer: "0.82 mol; 4.9 × 10²³ molecules; 1.2 × 10⁵ Pa.",
    },
    check: {
      question: "A fixed mass of gas is heated from 27 °C to 327 °C at constant pressure. Its volume:",
      options: ["Increases about 12 times", "Doubles", "Stays the same", "Increases by 300 m³"],
      correctIndex: 1,
      explanation: "Use kelvin: 300 K to 600 K. At constant pressure V ∝ T, so the volume doubles.",
    },
    apply: {
      prompt: "A sealed can of air at 1.0 × 10⁵ Pa and 17 °C is thrown on a fire and reaches 400 °C. Calculate the new pressure and explain why the can may explode.",
      modelAnswer: "Constant volume: p₂ = p₁T₂/T₁ = 1.0 × 10⁵ × 673/290 = 2.3 × 10⁵ Pa. The molecules move faster and hit the walls harder and more often, so the pressure more than doubles; if this exceeds what the can can withstand, it bursts.",
      successCriteria: ["Converts to kelvin", "2.3 × 10⁵ Pa", "Molecular explanation of the pressure rise"],
    },
    trap: {
      wrong: "Putting temperatures in °C into pV = nRT or into p/T ratios.",
      right: "Always convert to kelvin first.",
    },
  },

  "wjec-alevel-physics.thermal.sp-04": {
    explain: [
      "Gas pressure comes from molecules colliding with the walls. Each collision reverses the molecule's momentum perpendicular to the wall, a change of 2mu, so the wall exerts a force on it and it exerts an equal force on the wall.",
      "Assumptions: a very large number of molecules in random motion, negligible molecular volume, elastic collisions, collision time negligible, and no forces between molecules except during collisions.",
      "The result: **pV = ⅓Nm⟨c²⟩**, where ⟨c²⟩ is the mean square speed.",
    ],
    worked: {
      prompt: "Outline the steps from one molecule's collision to pV = ⅓Nm⟨c²⟩ in a cube of side L.",
      steps: [
        "One molecule with velocity component u hits a wall: Δp = 2mu. It returns after time 2L/u, so the average force is 2mu ÷ (2L/u) = mu²/L.",
        "For N molecules the total force is Nm⟨u²⟩/L. Pressure = force/area = Nm⟨u²⟩/L³ = Nm⟨u²⟩/V.",
        "Motion is random in three dimensions, so ⟨u²⟩ = ⅓⟨c²⟩, giving pV = ⅓Nm⟨c²⟩.",
      ],
      answer: "pV = ⅓Nm⟨c²⟩.",
    },
    check: {
      question: "Why does ⅓ appear in pV = ⅓Nm⟨c²⟩?",
      options: [
        "Only a third of the molecules hit the walls",
        "Random motion is shared equally between three perpendicular directions",
        "Collisions are one-third elastic",
        "The container has three pairs of walls",
      ],
      correctIndex: 1,
      explanation: "⟨c²⟩ = ⟨u²⟩ + ⟨v²⟩ + ⟨w²⟩, and for random motion each is equal, so ⟨u²⟩ = ⅓⟨c²⟩.",
    },
    apply: {
      prompt: "Use kinetic theory to explain why the pressure of a gas increases when its volume is reduced at constant temperature.",
      modelAnswer: "At constant temperature the molecules' mean speed is unchanged. In a smaller volume each molecule travels a shorter distance between collisions with the walls, so collisions happen more often (and there are more molecules per unit area of wall). More momentum change per second means a greater force per unit area, so the pressure increases.",
      successCriteria: ["Same mean speed at constant temperature", "More frequent collisions", "More force per unit area"],
    },
  },

  "wjec-alevel-physics.thermal.sp-05": {
    explain: [
      "Combining pV = ⅓Nm⟨c²⟩ with pV = NkT gives **½m⟨c²⟩ = (3/2)kT**: the mean kinetic energy of a molecule is proportional to the **absolute temperature**.",
      "So at the same temperature all ideal gases have the same mean molecular kinetic energy; lighter molecules move faster.",
      "The root-mean-square speed is c_rms = √⟨c²⟩ = √(3kT/m).",
    ],
    worked: {
      prompt: "Find the mean kinetic energy of a gas molecule at 300 K and the rms speed of nitrogen molecules (m = 4.65 × 10⁻²⁶ kg).",
      steps: [
        "Mean E_k = (3/2)kT = 1.5 × 1.38 × 10⁻²³ × 300 = 6.2 × 10⁻²¹ J.",
        "c_rms = √(3kT/m) = √(3 × 1.38 × 10⁻²³ × 300 / 4.65 × 10⁻²⁶) = 517 m s⁻¹.",
      ],
      answer: "6.2 × 10⁻²¹ J; about 520 m s⁻¹.",
    },
    check: {
      question: "The absolute temperature of a gas is doubled. What happens to the rms speed of its molecules?",
      options: ["It doubles", "It increases by √2", "It quadruples", "It is unchanged"],
      correctIndex: 1,
      explanation: "½m⟨c²⟩ ∝ T, so ⟨c²⟩ doubles and c_rms increases by √2.",
    },
    apply: {
      prompt: "Helium and oxygen are at the same temperature. Compare the mean kinetic energies and rms speeds of their molecules.",
      modelAnswer: "The mean kinetic energies are equal, because ½m⟨c²⟩ = (3/2)kT depends only on temperature. Helium molecules are lighter (4 u against 32 u), so their rms speed is greater, by a factor √(32/4) = √8 ≈ 2.8.",
      successCriteria: ["Equal mean kinetic energy", "Lighter helium faster", "Factor √8 ≈ 2.8"],
    },
  },

  "wjec-alevel-physics.thermal.sp-06": {
    explain: [
      "On a **heating curve** (temperature against time for steady heating) the sloping parts are temperature rises (Q = mcΔT); the **flat plateaus** are changes of state (Q = mL).",
      "The plateau for boiling is usually longer than for melting, because the specific latent heat of vaporisation is larger: molecules must be separated completely.",
      "On a **p–V** graph, an isotherm (constant temperature) is a curve with pV constant; hotter isotherms lie further from the origin. The **area under a p–V graph** is the work done by or on the gas.",
    ],
    worked: {
      prompt: "A gas expands at a constant pressure of 1.5 × 10⁵ Pa from 2.0 × 10⁻³ m³ to 5.0 × 10⁻³ m³. How much work does it do?",
      steps: ["The p–V graph is a horizontal line; the area under it is a rectangle.", "W = pΔV = 1.5 × 10⁵ × 3.0 × 10⁻³ = 450 J."],
      answer: "450 J done by the gas.",
    },
    check: {
      question: "On a heating curve for steady heating, the gradient of the liquid section is less steep than that of the solid section. What does this tell you?",
      options: [
        "The liquid has a larger specific heat capacity",
        "The liquid has a larger latent heat",
        "The heater power decreased",
        "The liquid is evaporating",
      ],
      correctIndex: 0,
      explanation: "With the same power, a shallower temperature rise per second means more energy is needed per kelvin: a larger c (for the same mass).",
    },
    apply: {
      prompt: "Explain why the boiling plateau on a heating curve for water is about seven times longer than the melting plateau.",
      modelAnswer: "The plateau length is the time to supply mL at constant power. L_vap (2.26 × 10⁶ J kg⁻¹) is about seven times L_fus (3.34 × 10⁵ J kg⁻¹), because boiling separates the molecules completely and does work pushing back the atmosphere, while melting only loosens the structure.",
      successCriteria: ["Plateau time ∝ latent heat", "L_vap ≈ 7 × L_fus", "Reason: complete separation of molecules"],
    },
  },
};
