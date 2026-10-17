import type { TeachingBySpecPoint } from "./types";

// WJEC A-level Physics: motion, energy and materials checkpoints.
// g is taken as 9.81 N kg⁻¹ throughout.

export const physicsMechanicsTeaching: TeachingBySpecPoint = {
  "wjec-alevel-physics.kinematics-dynamics.sp-01": {
    explain: [
      "A **scalar** has size only: mass, distance, speed, time, energy. A **vector** has size and direction: displacement, velocity, acceleration, force, momentum. Two forces of 10 N in different directions are different vectors.",
      "To **resolve** a vector F that makes an angle θ with the horizontal, replace it by two perpendicular components that add back to F: horizontal F cos θ and vertical F sin θ.",
      "Use cos for the component next to (adjacent to) the angle and sin for the component opposite it. If the angle is measured from the vertical, the roles swap.",
      "Perpendicular components act independently: a horizontal force cannot change vertical motion. Resolving turns one two-dimensional problem into two one-dimensional ones.",
    ],
    worked: {
      prompt: "A rope pulls a sledge with a force of 50 N at 30° above the horizontal. Find the horizontal and vertical components of the pull.",
      steps: [
        "Horizontal component (adjacent to the 30° angle): 50 cos 30° = 50 × 0.866 = 43.3 N.",
        "Vertical component (opposite the angle): 50 sin 30° = 50 × 0.500 = 25.0 N.",
        "Check by recombining: √(43.3² + 25.0²) = √(1875 + 625) = √2500 = 50 N.",
      ],
      answer: "43 N horizontally and 25 N vertically upwards.",
    },
    check: {
      question: "A car drives once round a circular track at constant speed and stops where it started. Which quantity is zero for the whole lap?",
      options: ["Its average speed", "Its displacement", "The distance it travelled", "Its kinetic energy at the end"],
      correctIndex: 1,
      explanation: "It finishes where it started, so its displacement (a vector) is zero. Distance and average speed are scalars and are not zero.",
    },
    apply: {
      prompt: "A force of 12 N acts at 40° above the horizontal on a box. Calculate its vertical component and explain why only that component affects how much the box is lifted.",
      modelAnswer: "Vertical component = 12 sin 40° = 12 × 0.643 = 7.7 N. The horizontal component is perpendicular to vertical motion, so it cannot raise the box; only the vertical component acts against the weight.",
      successCriteria: ["Uses sin for the component opposite the angle: 7.7 N", "States that perpendicular components act independently"],
    },
    trap: {
      wrong: "Using cos for the vertical component whatever the angle is measured from.",
      right: "Use cos for the side adjacent to the given angle. If θ is measured from the vertical, the vertical component is F cos θ.",
    },
  },

  "wjec-alevel-physics.kinematics-dynamics.sp-02": {
    explain: [
      "On a **displacement–time** graph the gradient is the velocity. A straight line means constant velocity; a curve means the velocity is changing.",
      "On a **velocity–time** graph the gradient is the acceleration and the **area under the line** is the displacement.",
      "For a curved graph, the instantaneous value is the gradient of the **tangent** at that time, not the gradient of a chord from the origin.",
      "Area below the time axis on a v–t graph is displacement in the opposite direction, so it is subtracted when you want the overall displacement.",
    ],
    worked: {
      prompt: "A cyclist accelerates uniformly from rest to 12 m s⁻¹ in 4.0 s, then rides at 12 m s⁻¹ for 6.0 s. Find the acceleration and the total distance travelled.",
      steps: [
        "Acceleration = gradient of the first section = (12 − 0) / 4.0 = 3.0 m s⁻².",
        "Distance in the first 4 s = area of the triangle = ½ × 4.0 × 12 = 24 m.",
        "Distance in the next 6 s = area of the rectangle = 6.0 × 12 = 72 m.",
        "Total = 24 + 72 = 96 m.",
      ],
      answer: "3.0 m s⁻² and 96 m.",
    },
    check: {
      question: "What does the area under a velocity–time graph give?",
      options: ["The acceleration", "The displacement", "The average speed", "The rate of change of velocity"],
      correctIndex: 1,
      explanation: "Area = velocity × time = displacement. The gradient, not the area, gives the acceleration.",
    },
    apply: {
      prompt: "The displacement–time graph of a falling ball curves upwards. Describe how you would find the ball's velocity at t = 0.50 s from the graph, and explain why the line is curved.",
      modelAnswer: "Draw a tangent to the curve at t = 0.50 s and calculate its gradient (change in displacement ÷ change in time) using a large triangle. The line curves because the ball accelerates: its velocity, the gradient, increases with time.",
      successCriteria: ["Uses the gradient of a tangent at that instant", "Links the curvature to changing velocity (acceleration)"],
    },
    trap: {
      wrong: "Reading the velocity straight off a displacement–time graph as the y-value.",
      right: "Velocity is the gradient of a displacement–time graph; the y-value is the displacement.",
    },
  },

  "wjec-alevel-physics.kinematics-dynamics.sp-03": {
    explain: [
      "The equations of motion apply only when the **acceleration is constant**: v = u + at, s = ½(u + v)t, s = ut + ½at² and v² = u² + 2as.",
      "Each equation leaves out one of the five quantities s, u, v, a, t. List the three you know and the one you want, then pick the equation that leaves out the fifth.",
      "Choose a positive direction first and keep it. For an object thrown upwards with up positive, a = −9.81 m s⁻².",
      "At the top of a vertical throw the velocity is zero for an instant, but the acceleration is still 9.81 m s⁻² downwards.",
    ],
    worked: {
      prompt: "A car moving at 8.0 m s⁻¹ accelerates uniformly at 2.5 m s⁻² for 6.0 s. Find its final speed and the distance it covers.",
      steps: [
        "Known: u = 8.0 m s⁻¹, a = 2.5 m s⁻², t = 6.0 s.",
        "v = u + at = 8.0 + 2.5 × 6.0 = 23 m s⁻¹.",
        "s = ut + ½at² = 8.0 × 6.0 + ½ × 2.5 × 6.0² = 48 + 45 = 93 m.",
        "Check with v² = u² + 2as: 64 + 2 × 2.5 × 93 = 529 = 23².",
      ],
      answer: "23 m s⁻¹ and 93 m.",
    },
    check: {
      question: "A ball is thrown vertically upwards. Taking up as positive, what is its acceleration at the highest point?",
      options: ["0", "+9.81 m s⁻²", "−9.81 m s⁻²", "It depends on how hard it was thrown"],
      correctIndex: 2,
      explanation: "Only gravity acts, so the acceleration is 9.81 m s⁻² downwards throughout, including at the top where the velocity is momentarily zero.",
    },
    apply: {
      prompt: "A ball is thrown vertically upwards at 15 m s⁻¹. Ignoring air resistance, calculate the maximum height and the time taken to reach it.",
      modelAnswer: "At the top v = 0. v² = u² + 2as gives 0 = 15² − 2 × 9.81 × s, so s = 225 / 19.62 = 11.5 m. v = u + at gives 0 = 15 − 9.81t, so t = 1.53 s.",
      successCriteria: ["Uses v = 0 at the highest point", "Takes a = −9.81 m s⁻² with up positive", "11.5 m and 1.53 s"],
    },
    trap: {
      wrong: "Using the equations of motion when the acceleration changes, for example with significant air resistance.",
      right: "The equations hold only for constant acceleration; otherwise use graphs or energy.",
    },
  },

  "wjec-alevel-physics.kinematics-dynamics.sp-04": {
    explain: [
      "**First law:** an object stays at rest or moves at constant velocity unless a resultant force acts on it.",
      "**Second law:** the resultant force equals the rate of change of momentum, F = Δ(mv)/Δt. When the mass is constant this becomes F = ma.",
      "**Third law:** if body A exerts a force on body B, then B exerts an equal and opposite force on A. The two forces are the same type and act on **different** bodies, so they never cancel each other.",
      "A **free-body diagram** shows only the forces acting on one object, each drawn from that object with its direction and label (weight, normal contact, tension, drag, friction).",
    ],
    worked: {
      prompt: "A 1200 kg car has a driving force of 3000 N and resistive forces of 600 N. Find its acceleration.",
      steps: [
        "Draw the free-body diagram: 3000 N forwards, 600 N backwards, weight and normal contact force balancing vertically.",
        "Resultant force = 3000 − 600 = 2400 N forwards.",
        "a = F / m = 2400 / 1200 = 2.0 m s⁻².",
      ],
      answer: "2.0 m s⁻² forwards.",
    },
    check: {
      question: "A book rests on a table. Which force forms a Newton's-third-law pair with the Earth's gravitational pull on the book?",
      options: [
        "The table's upward push on the book",
        "The book's gravitational pull on the Earth",
        "The book's downward push on the table",
        "The table's weight",
      ],
      correctIndex: 1,
      explanation: "A third-law pair is the same type of force acting on the two different bodies. The table's push on the book is a contact force on the same body, so it is not the pair.",
    },
    apply: {
      prompt: "A skydiver of mass 70 kg falls at a steady speed. State the size of the drag force and explain your answer using Newton's laws.",
      modelAnswer: "The drag is 70 × 9.81 = 687 N upwards. At constant velocity the acceleration is zero, so by the first (or second) law the resultant force is zero and drag balances the weight.",
      successCriteria: ["Drag equals weight, about 690 N", "Constant velocity means zero resultant force"],
    },
    trap: {
      wrong: "Calling weight and the normal contact force a third-law pair because they are equal and opposite.",
      right: "They act on the same body and are different types of force. The pair of the book's weight is the book's pull on the Earth.",
    },
  },

  "wjec-alevel-physics.kinematics-dynamics.sp-05": {
    explain: [
      "**Displacement** is the distance moved in a stated direction (a vector). **Velocity** is the rate of change of displacement. **Acceleration** is the rate of change of velocity.",
      "**Average** velocity = total displacement ÷ total time. **Average** speed = total distance ÷ total time. They can differ greatly: one lap of a track gives zero average velocity.",
      "**Instantaneous** velocity is the velocity at one moment: the gradient of the tangent to the displacement–time graph at that time.",
      "A speedometer shows instantaneous speed; a journey time from a timetable gives an average.",
    ],
    worked: {
      prompt: "A runner completes one 400 m lap of a track in 50 s and finishes at the start line. Find the average speed and the average velocity.",
      steps: [
        "Average speed = distance ÷ time = 400 / 50 = 8.0 m s⁻¹.",
        "The runner ends where they started, so the displacement is 0.",
        "Average velocity = displacement ÷ time = 0 / 50 = 0.",
      ],
      answer: "Average speed 8.0 m s⁻¹; average velocity zero.",
    },
    check: {
      question: "How do you find the instantaneous velocity at t = 3 s from a curved displacement–time graph?",
      options: [
        "Divide the displacement at 3 s by 3 s",
        "Find the gradient of the tangent at t = 3 s",
        "Find the area under the graph up to 3 s",
        "Read the displacement at t = 3 s",
      ],
      correctIndex: 1,
      explanation: "Dividing the reading by the time gives the average from t = 0, not the value at that instant.",
    },
    apply: {
      prompt: "A train travels 30 km east in 20 minutes, then 10 km west in 10 minutes. Calculate its average speed and its average velocity in m s⁻¹.",
      modelAnswer: "Total distance = 40 km = 40 000 m; total time = 30 min = 1800 s. Average speed = 40 000 / 1800 = 22 m s⁻¹. Displacement = 20 km east = 20 000 m, so average velocity = 20 000 / 1800 = 11 m s⁻¹ east.",
      successCriteria: ["Converts to metres and seconds", "Speed 22 m s⁻¹, velocity 11 m s⁻¹ with a direction"],
    },
    trap: {
      wrong: "Giving a velocity without a direction.",
      right: "Velocity and displacement are vectors: state the direction, or a sign with a defined positive direction.",
    },
  },

  "wjec-alevel-physics.kinematics-dynamics.sp-06": {
    explain: [
      "A projectile moves under gravity alone. Treat its motion as two independent parts: **horizontally** the velocity is constant (no horizontal force); **vertically** the acceleration is g downwards.",
      "Resolve the launch velocity first: horizontal u cos θ and vertical u sin θ.",
      "**Time links the two directions.** Use the vertical motion to find the time of flight, then horizontal distance = horizontal velocity × time.",
      "At the top of the path the vertical velocity is zero but the horizontal velocity is unchanged.",
    ],
    worked: {
      prompt: "A ball is thrown horizontally at 12 m s⁻¹ from the top of a 20 m cliff. Find the time to reach the ground and how far from the foot of the cliff it lands.",
      steps: [
        "Vertically: u = 0, a = 9.81 m s⁻² down, s = 20 m. s = ½at² gives t = √(2 × 20 / 9.81) = 2.02 s.",
        "Horizontally the velocity stays 12 m s⁻¹, so distance = 12 × 2.02 = 24.2 m.",
        "(The vertical velocity on landing is 9.81 × 2.02 = 19.8 m s⁻¹, which does not change the horizontal answer.)",
      ],
      answer: "2.0 s and 24 m.",
    },
    check: {
      question: "Ignoring air resistance, which quantity stays constant during a projectile's flight?",
      options: ["Its speed", "Its vertical velocity", "Its horizontal velocity", "Its kinetic energy"],
      correctIndex: 2,
      explanation: "No horizontal force acts, so the horizontal velocity is constant. Gravity changes the vertical velocity, so the speed and kinetic energy change.",
    },
    apply: {
      prompt: "A ball is kicked at 20 m s⁻¹ at 30° above level ground. Ignoring air resistance, calculate the time of flight and the range.",
      modelAnswer: "Vertical u = 20 sin 30° = 10 m s⁻¹; horizontal = 20 cos 30° = 17.3 m s⁻¹. It lands when the vertical displacement is zero: 0 = 10t − ½ × 9.81 × t², so t = 2 × 10 / 9.81 = 2.04 s. Range = 17.3 × 2.04 = 35 m.",
      successCriteria: ["Resolves the launch velocity", "Finds the time from the vertical motion: 2.04 s", "Range = horizontal velocity × time ≈ 35 m"],
    },
    trap: {
      wrong: "Using the whole launch speed (20 m s⁻¹) in the vertical equations.",
      right: "Resolve first: only u sin θ belongs in the vertical equations and only u cos θ in the horizontal.",
    },
  },

  "wjec-alevel-physics.kinematics-dynamics.sp-07": {
    explain: [
      "On a slope at angle θ, resolve the weight mg **parallel** to the slope (mg sin θ, down the slope) and **perpendicular** to it (mg cos θ, into the slope).",
      "The normal contact force balances the perpendicular component, so on a smooth slope N = mg cos θ. Friction acts along the slope, opposing motion.",
      "**Drag** opposes motion and increases with speed. A falling object speeds up until drag equals its weight; the resultant force is then zero and it falls at **terminal velocity**.",
      "Opening a parachute increases the drag at the same speed, so the resultant force is upwards: the skydiver decelerates until a new, lower terminal velocity is reached.",
    ],
    worked: {
      prompt: "A 5.0 kg block slides down a smooth slope inclined at 30° to the horizontal. Find its acceleration and the normal contact force.",
      steps: [
        "Component of weight down the slope = mg sin θ = 5.0 × 9.81 × sin 30° = 24.5 N.",
        "With no friction this is the resultant force, so a = 24.5 / 5.0 = 4.9 m s⁻² down the slope.",
        "Normal force = mg cos θ = 5.0 × 9.81 × cos 30° = 42.5 N.",
      ],
      answer: "4.9 m s⁻² down the slope; normal force 42 N.",
    },
    check: {
      question: "Why does a falling object eventually reach terminal velocity?",
      options: [
        "Its weight decreases as it falls",
        "Drag increases with speed until it equals the weight",
        "Gravity stops acting at high speed",
        "Drag becomes larger than the weight",
      ],
      correctIndex: 1,
      explanation: "When drag equals weight the resultant force is zero, so the acceleration is zero and the velocity stays constant.",
    },
    apply: {
      prompt: "Describe and explain how the velocity of a skydiver changes from jumping until landing with an opened parachute.",
      modelAnswer: "At first only weight acts, so she accelerates at g. As speed increases, drag increases, so the resultant force and acceleration decrease until drag equals weight and she reaches terminal velocity. Opening the parachute increases drag above her weight, so she decelerates; drag falls as she slows until it equals her weight again at a lower terminal velocity, at which she lands.",
      successCriteria: ["Drag increases with speed", "Terminal velocity when drag = weight", "Parachute: drag > weight, deceleration to a lower terminal velocity"],
    },
    trap: {
      wrong: "Saying an object at terminal velocity has no forces acting on it.",
      right: "Forces still act; they balance, so the resultant force is zero.",
    },
  },

  "wjec-alevel-physics.kinematics-dynamics.sp-08": {
    explain: [
      "**Impulse** = force × time for which it acts = change in momentum. Its unit is N s, equal to kg m s⁻¹.",
      "When the force varies, the impulse is the **area under the force–time graph**.",
      "On a **momentum–time** graph the gradient is the resultant force, because F = Δp/Δt.",
      "The same change in momentum spread over a longer time needs a smaller average force: that is how crumple zones, airbags and bending your knees on landing work.",
    ],
    worked: {
      prompt: "A bat's force on a 0.16 kg ball rises steadily from 0 to 400 N in 0.010 s and falls steadily back to 0 in the next 0.010 s. The ball starts at rest. Find the impulse and the ball's speed afterwards.",
      steps: [
        "The force–time graph is a triangle with base 0.020 s and height 400 N.",
        "Impulse = area = ½ × 0.020 × 400 = 4.0 N s.",
        "Change in momentum = 4.0 kg m s⁻¹, so v = 4.0 / 0.16 = 25 m s⁻¹.",
      ],
      answer: "4.0 N s; 25 m s⁻¹.",
    },
    check: {
      question: "What does the gradient of a momentum–time graph represent?",
      options: ["Impulse", "Resultant force", "Kinetic energy", "Acceleration"],
      correctIndex: 1,
      explanation: "Gradient = Δp/Δt, which by Newton's second law is the resultant force.",
    },
    apply: {
      prompt: "Explain, using impulse, why a gymnast bends her knees when landing.",
      modelAnswer: "Her change in momentum on landing is fixed by her mass and landing speed. Bending her knees increases the time over which she stops. Since impulse F × t equals the change in momentum, a longer time means a smaller average force on her legs.",
      successCriteria: ["Change in momentum is the same either way", "Longer stopping time gives a smaller average force"],
    },
  },

  "wjec-alevel-physics.energy-power.sp-01": {
    explain: [
      "**Work done** = force × displacement **in the direction of the force**: W = Fs cos θ, where θ is the angle between the force and the displacement. Unit: joule (1 J = 1 N m).",
      "Work done is energy transferred. A force perpendicular to the motion (θ = 90°) does no work, which is why the normal force on a level road does none.",
      "If the force opposes the motion (θ = 180°) the work done by it is negative: it takes energy out of the object, as friction does.",
    ],
    worked: {
      prompt: "A traveller pulls a suitcase 25 m along level ground with a force of 60 N in a handle at 35° to the horizontal. How much work does the pull do?",
      steps: [
        "Only the component along the motion does work: 60 cos 35° = 49.2 N.",
        "W = 49.2 × 25 = 1230 J.",
      ],
      answer: "About 1.2 kJ.",
    },
    check: {
      question: "A satellite moves in a circular orbit at constant speed. How much work does gravity do on it during one orbit?",
      options: ["Its weight × the circumference", "Zero", "Its kinetic energy", "Its weight × the orbital radius"],
      correctIndex: 1,
      explanation: "Gravity always acts at 90° to the velocity in a circular orbit, so cos θ = 0 and no work is done; the speed stays constant.",
    },
    apply: {
      prompt: "A 20 N force pushes a crate 3.0 m across a floor while friction of 14 N acts. Calculate the work done by each force and the crate's gain in kinetic energy.",
      modelAnswer: "Work done by the push = 20 × 3.0 = 60 J. Work done by friction = −14 × 3.0 = −42 J (42 J transferred to thermal energy). The net work, 60 − 42 = 18 J, is the gain in kinetic energy.",
      successCriteria: ["60 J by the push", "Friction removes 42 J", "Gain in kinetic energy 18 J"],
    },
    trap: {
      wrong: "Multiplying the full force by the distance when the force is at an angle to the motion.",
      right: "Use only the component along the motion: W = Fs cos θ.",
    },
  },

  "wjec-alevel-physics.energy-power.sp-02": {
    explain: [
      "Kinetic energy E_k = ½mv². Gravitational potential energy change ΔE_p = mgΔh near the Earth's surface.",
      "**Conservation of energy:** energy cannot be created or destroyed, only transferred. With no friction or air resistance, mechanical energy (E_k + E_p) stays constant.",
      "For a falling object: loss of E_p = gain of E_k, so mgh = ½mv² and v = √(2gh). The mass cancels: all objects reach the same speed from the same height without air resistance.",
    ],
    worked: {
      prompt: "A ball is dropped from 5.0 m. Ignoring air resistance, find its speed just before it hits the ground.",
      steps: [
        "Loss of E_p = gain of E_k: mgh = ½mv².",
        "v = √(2gh) = √(2 × 9.81 × 5.0) = √98.1 = 9.9 m s⁻¹.",
      ],
      answer: "9.9 m s⁻¹.",
    },
    check: {
      question: "Two balls of mass 1 kg and 2 kg are dropped from the same height. Ignoring air resistance, how do their landing speeds compare?",
      options: ["The 2 kg ball is faster", "The 1 kg ball is faster", "They are the same", "The 2 kg ball is √2 times faster"],
      correctIndex: 2,
      explanation: "From mgh = ½mv², v = √(2gh): the mass cancels.",
    },
    apply: {
      prompt: "A roller-coaster car starts from rest at the top of a 32 m drop. Assuming no energy losses, calculate its speed at the bottom. State one reason the real speed is lower.",
      modelAnswer: "v = √(2gh) = √(2 × 9.81 × 32) = 25 m s⁻¹. In practice friction and air resistance transfer some energy to thermal energy, so less becomes kinetic energy.",
      successCriteria: ["Equates mgh to ½mv²", "25 m s⁻¹", "Names a resistive force transferring energy away"],
    },
  },

  "wjec-alevel-physics.energy-power.sp-03": {
    explain: [
      "**Power** is the rate of doing work or transferring energy: P = W/t = E/t. Unit: watt (1 W = 1 J s⁻¹).",
      "For a force F moving something at constant speed v, P = Fv.",
      "**Efficiency** = useful energy (or power) output ÷ total energy (or power) input, often × 100%. It is always less than 100% because some energy is dissipated, usually as heat.",
    ],
    worked: {
      prompt: "An electric motor lifts a 40 kg load through 12 m in 15 s. The motor's electrical input power is 500 W. Find the useful output power and the efficiency.",
      steps: [
        "Useful work = mgh = 40 × 9.81 × 12 = 4710 J.",
        "Useful power = 4710 / 15 = 314 W.",
        "Efficiency = 314 / 500 = 0.63 = 63%.",
      ],
      answer: "314 W; 63%.",
    },
    check: {
      question: "A car moves at a constant 25 m s⁻¹ against a total resistive force of 800 N. What power is the engine delivering to the wheels?",
      options: ["32 W", "800 W", "20 kW", "40 kW"],
      correctIndex: 2,
      explanation: "At constant speed the driving force equals the resistance, so P = Fv = 800 × 25 = 20 000 W.",
    },
    apply: {
      prompt: "A 75 kg climber gains 300 m of height in 20 minutes. Calculate her average useful power output. Her body is 20% efficient at this; calculate her total power use.",
      modelAnswer: "Useful energy = 75 × 9.81 × 300 = 2.21 × 10⁵ J. Time = 1200 s, so useful power = 184 W. Total power = 184 / 0.20 = 920 W.",
      successCriteria: ["Converts minutes to seconds", "Useful power ≈ 180 W", "Divides by the efficiency for the input: ≈ 920 W"],
    },
  },

  "wjec-alevel-physics.energy-power.sp-04": {
    explain: [
      "Work done = **area under a force–displacement graph** between the start and end positions.",
      "For a constant force the area is a rectangle (F × s). For a force that rises steadily from zero it is a triangle (½ × F_max × s).",
      "For a curved graph, count squares (or split into strips): each square is worth (force per square) × (displacement per square) joules.",
    ],
    worked: {
      prompt: "The force needed to stretch a spring rises steadily from 0 to 30 N as it extends by 0.20 m. How much work is done stretching it?",
      steps: ["The graph is a triangle.", "W = ½ × 30 × 0.20 = 3.0 J."],
      answer: "3.0 J.",
    },
    check: {
      question: "On a force–displacement graph, one grid square is 2 N by 0.1 m. The area under the curve is 45 squares. What is the work done?",
      options: ["4.5 J", "9.0 J", "45 J", "90 J"],
      correctIndex: 1,
      explanation: "Each square = 2 × 0.1 = 0.2 J, so 45 × 0.2 = 9.0 J.",
    },
    apply: {
      prompt: "Explain why the work done stretching a rubber band cannot be found with W = Fs using its final force and extension.",
      modelAnswer: "W = Fs assumes a constant force. The force on a rubber band changes with extension (and not in proportion), so the work is the area under the force–extension graph, found by counting squares.",
      successCriteria: ["Recognises the force is not constant", "Uses the area under the graph"],
    },
  },

  "wjec-alevel-physics.energy-power.sp-05": {
    explain: [
      "Gravitational potential energy gained = mgΔh for height changes small compared with the Earth's radius.",
      "Elastic potential energy stored in a spring obeying Hooke's law: E = ½Fx = ½kx², where x is the extension or compression.",
      "In launch problems, stored elastic energy becomes kinetic energy and then gravitational potential energy: ½kx² = ½mv² = mgh (ignoring losses).",
    ],
    worked: {
      prompt: "A toy spring of stiffness 800 N m⁻¹ is compressed by 0.050 m and launches a 0.020 kg ball vertically. Ignoring losses, how high does the ball rise?",
      steps: [
        "Elastic energy = ½kx² = ½ × 800 × 0.050² = 1.0 J.",
        "All of this becomes E_p at the top: mgh = 1.0 J.",
        "h = 1.0 / (0.020 × 9.81) = 5.1 m.",
      ],
      answer: "5.1 m.",
    },
    check: {
      question: "The compression of a spring is doubled. By what factor does its stored elastic energy change?",
      options: ["½", "2", "4", "It does not change"],
      correctIndex: 2,
      explanation: "E = ½kx², so doubling x multiplies the energy by 2² = 4.",
    },
    apply: {
      prompt: "A 60 kg trampolinist is momentarily at rest 0.40 m below the trampoline's resting surface, then rises to 1.5 m above it. Assuming no losses, how much elastic energy did the trampoline store at the lowest point?",
      modelAnswer: "She rises from 0.40 m below the rest surface to 1.5 m above it, a height change of 1.9 m. Elastic energy = mgΔh = 60 × 9.81 × 1.9 = 1.1 × 10³ J.",
      successCriteria: ["Includes the 0.40 m sag in the height change", "≈ 1.1 kJ"],
    },
    trap: {
      wrong: "Using E = Fx (without the ½) for a spring.",
      right: "The force rises from zero, so the energy is the triangle's area: ½Fx = ½kx².",
    },
  },

  "wjec-alevel-physics.energy-power.sp-06": {
    explain: [
      "**Non-conservative** forces such as friction and air resistance transfer mechanical energy to thermal energy, so E_k + E_p is no longer constant.",
      "Energy balance: initial energy = final energy + work done against resistive forces.",
      "Work done against a resistive force = average force × distance, so the average resistive force = energy lost ÷ distance.",
    ],
    worked: {
      prompt: "An 80 kg cyclist freewheels from rest down a hill 8.0 m high and reaches 10 m s⁻¹ at the bottom. The road down the hill is 100 m long. Find the energy dissipated and the average resistive force.",
      steps: [
        "E_p lost = 80 × 9.81 × 8.0 = 6280 J.",
        "E_k gained = ½ × 80 × 10² = 4000 J.",
        "Energy dissipated = 6280 − 4000 = 2280 J.",
        "Average resistive force = 2280 / 100 = 23 N.",
      ],
      answer: "2.3 kJ dissipated; average resistance 23 N.",
    },
    check: {
      question: "A box slides to a stop on a rough floor. Where does its kinetic energy go?",
      options: [
        "It is destroyed by friction",
        "Mostly into thermal energy of the box and floor",
        "Into gravitational potential energy",
        "Into the normal contact force",
      ],
      correctIndex: 1,
      explanation: "Friction does work transferring the kinetic energy to the internal (thermal) energy of the surfaces; energy is conserved overall.",
    },
    apply: {
      prompt: "A 0.50 kg ball dropped from 2.0 m rebounds to 1.4 m. Calculate the energy dissipated in the bounce and the fraction of energy kept.",
      modelAnswer: "Energy at the start = 0.50 × 9.81 × 2.0 = 9.8 J; at the top of the rebound = 0.50 × 9.81 × 1.4 = 6.9 J. Energy dissipated = 2.9 J. Fraction kept = 1.4 / 2.0 = 0.70 (70%).",
      successCriteria: ["Compares potential energies at the two heights", "2.9 J dissipated", "70% kept"],
    },
  },

  "wjec-alevel-physics.materials.sp-01": {
    explain: [
      "**Stress** σ = force ÷ cross-sectional area = F/A (unit Pa). **Strain** ε = extension ÷ original length = x/L (no unit).",
      "The **Young modulus** E = stress ÷ strain = FL/(Ax) (unit Pa). It is a property of the material, not of one sample: a thicker or longer wire of the same steel has the same E.",
      "E applies in the region where stress is proportional to strain. A large E means a stiff material.",
    ],
    worked: {
      prompt: "A steel wire 2.0 m long and 0.50 mm in diameter extends by 2.5 mm under a 50 N load. Find the stress, strain and Young modulus.",
      steps: [
        "A = π(0.25 × 10⁻³)² = 1.96 × 10⁻⁷ m².",
        "Stress = 50 / 1.96 × 10⁻⁷ = 2.55 × 10⁸ Pa.",
        "Strain = 2.5 × 10⁻³ / 2.0 = 1.25 × 10⁻³.",
        "E = 2.55 × 10⁸ / 1.25 × 10⁻³ = 2.0 × 10¹¹ Pa.",
      ],
      answer: "E ≈ 2.0 × 10¹¹ Pa.",
    },
    check: {
      question: "A second wire of the same steel has twice the length. Under the same load, what happens?",
      options: [
        "Same extension and same Young modulus",
        "Twice the extension, same Young modulus",
        "Twice the extension and twice the Young modulus",
        "Half the extension, same Young modulus",
      ],
      correctIndex: 1,
      explanation: "Same stress gives the same strain; doubling L doubles x = εL. E belongs to the material, so it is unchanged.",
    },
    apply: {
      prompt: "Explain why the diameter of the wire must be measured at several points and in different directions when determining the Young modulus.",
      modelAnswer: "The area depends on diameter squared, so a small error in the diameter doubles as a percentage error in A and in E. The wire may not be perfectly round or uniform, so averaging several readings reduces the random uncertainty.",
      successCriteria: ["Area ∝ d², so the percentage uncertainty doubles", "Averaging deals with non-uniformity"],
    },
    trap: {
      wrong: "Using the diameter instead of the radius in A = πr², or forgetting to convert mm to m.",
      right: "A = π(d/2)² with d in metres.",
    },
  },

  "wjec-alevel-physics.materials.sp-02": {
    explain: [
      "**Hooke's law:** the extension of a spring is proportional to the force applied, F = kx, up to the limit of proportionality.",
      "k is the **spring constant** (stiffness), in N m⁻¹: the force per unit extension. It belongs to that spring; a different spring of the same metal can have a different k.",
      "Springs in **parallel** share the load: k_total = k₁ + k₂. In **series** each carries the full load and the extensions add: 1/k_total = 1/k₁ + 1/k₂.",
    ],
    worked: {
      prompt: "A spring extends 4.0 cm under a 6.0 N load. Find k, and the extension under 6.0 N for two such springs in series and in parallel.",
      steps: [
        "k = F/x = 6.0 / 0.040 = 150 N m⁻¹.",
        "Series: each spring extends 4.0 cm, so the total is 8.0 cm (k = 75 N m⁻¹).",
        "Parallel: each carries 3.0 N and extends 2.0 cm (k = 300 N m⁻¹).",
      ],
      answer: "150 N m⁻¹; 8.0 cm in series; 2.0 cm in parallel.",
    },
    check: {
      question: "A spring obeys Hooke's law. The load is tripled (staying within the limit). What happens to the extension?",
      options: ["It stays the same", "It triples", "It increases nine-fold", "It increases by a third"],
      correctIndex: 1,
      explanation: "F = kx: extension is proportional to force within the limit of proportionality.",
    },
    apply: {
      prompt: "Describe how to test whether a spring obeys Hooke's law and how to find k from your results.",
      modelAnswer: "Hang known masses in steps, measuring the extension each time from the unloaded length with a fixed ruler and eye level to avoid parallax. Plot force against extension. A straight line through the origin shows Hooke's law; k is the gradient.",
      successCriteria: ["Measures extension from the original length", "Plots F against x", "k = gradient of the straight-line region"],
    },
  },

  "wjec-alevel-physics.materials.sp-03": {
    explain: [
      "**Limit of proportionality:** beyond it, extension is no longer proportional to force.",
      "**Elastic limit:** the largest stress after which the material still returns to its original length when unloaded. Deformation up to here is **elastic**.",
      "Beyond the elastic limit the deformation is **plastic**: the material keeps a permanent extension. Ductile metals such as copper show large plastic deformation before **fracture**; brittle materials such as glass fracture with little or no plastic deformation.",
    ],
    worked: {
      prompt: "A copper wire is loaded until it has a permanent extension of 5 mm, then unloaded. What has happened, and how would the unloading line look on a force–extension graph?",
      steps: [
        "A permanent extension means it was loaded beyond its elastic limit: plastic deformation occurred.",
        "On unloading, the line is straight and parallel to the original elastic line.",
        "It meets the extension axis at 5 mm, the permanent extension.",
      ],
      answer: "Plastic deformation; the unloading line is parallel to the loading line and ends at 5 mm.",
    },
    check: {
      question: "Which describes a brittle material?",
      options: [
        "It shows large plastic deformation before breaking",
        "It fractures with little or no plastic deformation",
        "It never obeys Hooke's law",
        "It has a low Young modulus",
      ],
      correctIndex: 1,
      explanation: "Brittle means little plastic deformation before fracture. Glass is brittle yet stiff (high Young modulus).",
    },
    apply: {
      prompt: "Explain the difference between the limit of proportionality and the elastic limit.",
      modelAnswer: "Beyond the limit of proportionality, force and extension are no longer proportional, but the material may still return to its original length. Beyond the elastic limit, it no longer returns: it keeps a permanent (plastic) extension.",
      successCriteria: ["Proportionality is about F ∝ x", "Elastic limit is about returning to the original length"],
    },
  },

  "wjec-alevel-physics.materials.sp-04": {
    explain: [
      "The work done stretching a material is stored as **elastic strain energy**, provided it stays within its elastic limit.",
      "Elastic strain energy = **area under the force–extension graph**. For a straight line through the origin, E = ½Fx.",
      "If the material is loaded beyond the elastic limit, some of the work is dissipated as heat and is not recovered on unloading: the area between the loading and unloading lines is that energy.",
    ],
    worked: {
      prompt: "A spring of stiffness 150 N m⁻¹ is stretched by 4.0 cm. Find the stored energy.",
      steps: ["Force at 4.0 cm: F = kx = 150 × 0.040 = 6.0 N.", "E = ½Fx = ½ × 6.0 × 0.040 = 0.12 J."],
      answer: "0.12 J.",
    },
    check: {
      question: "A rubber band is stretched and released. The unloading curve lies below the loading curve. What does the area between them represent?",
      options: [
        "Energy stored at the end",
        "Energy dissipated as heat in one cycle",
        "The Young modulus",
        "The work done by gravity",
      ],
      correctIndex: 1,
      explanation: "More work goes in on loading than comes back out on unloading; the difference (the hysteresis loop area) is transferred to thermal energy.",
    },
    apply: {
      prompt: "A climbing rope extends 1.2 m when stopping a fall, with the force rising steadily to 4.0 kN. Calculate the energy it absorbs and suggest why a stretchy rope is safer than a stiff one.",
      modelAnswer: "E = ½Fx = ½ × 4000 × 1.2 = 2400 J. A stretchy rope absorbs the climber's energy over a longer extension (and time), so the maximum force on the climber is smaller.",
      successCriteria: ["2.4 kJ from the triangle area", "Larger extension → smaller maximum force"],
    },
  },

  "wjec-alevel-physics.materials.sp-05": {
    explain: [
      "On a **stress–strain** graph the initial straight-line gradient is the **Young modulus**. The line ends at the limit of proportionality.",
      "The **yield point** is where the material suddenly extends a lot with little extra stress: plastic flow begins. The **ultimate tensile stress** (UTS) is the maximum stress on the curve.",
      "A stress–strain graph describes the material; a force–extension graph describes one particular sample (it depends on the sample's length and area).",
      "Comparing curves: steeper line = stiffer; higher peak = stronger; longer plastic region = more ductile; ending soon after the straight line = brittle.",
    ],
    worked: {
      prompt: "On a stress–strain graph, material A's straight line reaches 300 MPa at a strain of 0.0015 and it fractures soon after. Material B reaches 200 MPa at 0.0020 and then extends plastically to a strain of 0.30. Compare them.",
      steps: [
        "E_A = 300 × 10⁶ / 0.0015 = 2.0 × 10¹¹ Pa; E_B = 200 × 10⁶ / 0.0020 = 1.0 × 10¹¹ Pa, so A is stiffer.",
        "A fractures soon after its straight line: it is brittle.",
        "B extends plastically to a large strain before breaking: it is ductile.",
      ],
      answer: "A is stiffer and brittle; B is less stiff and ductile.",
    },
    check: {
      question: "What does the gradient of the straight-line part of a stress–strain graph give?",
      options: ["The spring constant", "The Young modulus", "The ultimate tensile stress", "The strain energy"],
      correctIndex: 1,
      explanation: "Gradient = stress/strain = E. The spring constant is the gradient of a force–extension graph.",
    },
    apply: {
      prompt: "Explain why two wires of the same metal but different thicknesses give different force–extension graphs but the same stress–strain graph.",
      modelAnswer: "Force–extension depends on the sample: a thicker wire needs a larger force for the same extension. Stress divides by area and strain divides by length, removing the sample's dimensions, so both wires give the same stress–strain graph for the material.",
      successCriteria: ["Force–extension depends on dimensions", "Stress and strain normalise for area and length"],
    },
  },

  "wjec-alevel-physics.materials.sp-06": {
    explain: [
      "Elastic strain energy stored = ½Fx for a sample obeying Hooke's law.",
      "**Strain energy density** (energy per unit volume) = ½ × stress × strain = ½σε, in J m⁻³. It is the area under the stress–strain graph.",
      "Derivation: ½Fx ÷ (AL) = ½(F/A)(x/L) = ½σε. Multiply the density by the volume AL to get the total energy.",
    ],
    worked: {
      prompt: "The steel wire above (2.0 m long, area 1.96 × 10⁻⁷ m²) carries 50 N at a strain of 1.25 × 10⁻³. Find the strain energy density and the energy stored.",
      steps: [
        "Stress = 2.55 × 10⁸ Pa.",
        "Energy density = ½ × 2.55 × 10⁸ × 1.25 × 10⁻³ = 1.6 × 10⁵ J m⁻³.",
        "Volume = AL = 1.96 × 10⁻⁷ × 2.0 = 3.93 × 10⁻⁷ m³; energy = 1.6 × 10⁵ × 3.93 × 10⁻⁷ = 0.063 J.",
        "Check: ½Fx = ½ × 50 × 2.5 × 10⁻³ = 0.063 J.",
      ],
      answer: "1.6 × 10⁵ J m⁻³; 0.063 J.",
    },
    check: {
      question: "What are the units of strain energy density?",
      options: ["J", "J m⁻³", "N m⁻¹", "Pa m"],
      correctIndex: 1,
      explanation: "It is energy per unit volume (J m⁻³), which is equivalent to Pa because strain has no unit.",
    },
    apply: {
      prompt: "Show that the strain energy per unit volume of a material obeying Hooke's law is ½σε.",
      modelAnswer: "Energy stored = ½Fx. Volume = AL. Energy per unit volume = ½Fx/(AL) = ½ × (F/A) × (x/L) = ½ × stress × strain = ½σε.",
      successCriteria: ["Starts from ½Fx", "Divides by volume AL", "Identifies F/A as stress and x/L as strain"],
    },
  },
};
