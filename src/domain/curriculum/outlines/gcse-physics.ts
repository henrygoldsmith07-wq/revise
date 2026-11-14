import type { UnitSpec } from "../helpers";

// ---------------------------------------------------------------------------
// The GCSE physics outline. The GCSE physics specifications of the boards
// that examine in England (AQA, Pearson Edexcel, OCR, and WJEC as Eduqas) are
// built on the DfE "GCSE subject content: biology, chemistry and physics"
// (2014, updated May 2019, pages 33-38). WJEC's GCSE for Wales is regulated
// separately and is not built on it, though most of its physics is the same. The statements below are that document's physics bullets,
// lightly condensed, under its own headings; they are not any one board's
// numbering or topic order, and the subject pages say so.
//
// Until this outline, every GCSE physics subject was built from the WJEC
// A-level outline (photons, simple harmonic motion, gravitational potential),
// so its lessons and flashcards were A-level material. Slugs here never
// match an A-level slug: seed cards are keyed by topic id and an installed
// card is never rewritten, so a shared slug would leave A-level text in
// place. The A-level cards a learner already has are retired from review
// instead (retiredSeedCard in ../../card-retirement.ts).
//
// The key points and common errors were written by Revise and are not
// teacher-reviewed.
// ---------------------------------------------------------------------------

// specVersion is the app's spec-manifest version, as on every outline; the
// source document is named in each statement's ref.
const SOURCE = { source: "authored", verification: "unverified", lastChecked: "2026-11-14", specVersion: "2024-1.0" } as const;
const ref = (area: string) => `DfE physics: ${area}`;

/** Each topic's assessment objectives: those of its statements. */
function withTopicAos(units: UnitSpec[]): UnitSpec[] {
  return units.map((unit) => ({
    ...unit,
    topics: unit.topics.map((topic) => ({
      ...topic,
      aos: [...new Set((topic.specPoints ?? []).flatMap((point) => point.aos ?? []))].sort(),
    })),
  }));
}

export const GCSE_PHYSICS_OUTLINE: UnitSpec[] = withTopicAos([
  {
    slug: "gcse-energy",
    title: "Energy",
    topics: [
      {
        slug: "energy-stores-transfers",
        title: "Energy stores, transfers and power",
        specRef: ref("Energy"),
        difficulty: 2,
        summary: "The energy stored by moving, stretched and raised objects, how heating, forces and currents change a system's stores, and power as the rate of transfer.",
        keyPoints: [
          "Kinetic energy = 0.5 × mass × speed²; gravitational potential energy = mass × g × height; elastic potential energy = 0.5 × spring constant × extension².",
          "Power is the rate at which energy is transferred: power = energy transferred ÷ time, measured in watts (1 W = 1 J/s).",
          "Energy transfers: energy moves from one store to another by heating, by a force doing work, or by a current doing work.",
          "An appliance with a higher power rating transfers more energy in the same time.",
        ],
        commonErrors: [
          "Forgetting to square the speed when calculating kinetic energy.",
          "Using time in minutes or hours instead of seconds when calculating power.",
          "Describing energy as being 'used up' rather than transferred to another store.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Energy", text: "calculate the amounts of energy associated with a moving body, a stretched spring, and an object raised above ground level", aos: ["AO1", "AO2"] },
          { ref: "DfE physics: Energy", text: "describe and calculate the changes in energy involved when a system is changed by heating (in terms of temperature change and specific heat capacity), by work done by forces and by work done when a current flows", aos: ["AO1", "AO2"] },
          { ref: "DfE physics: Energy", text: "explain, with reference to examples, the definition of power as the rate at which energy is transferred", aos: ["AO1"] },
          { ref: "DfE physics: Energy", text: "describe all the changes involved in the way energy is stored when a system changes, for common situations such as an object projected upwards, a moving object hitting an obstacle, a vehicle slowing down or water brought to the boil in a kettle", aos: ["AO1"] },
          { ref: "DfE physics: Energy", text: "describe, with examples, the relationship between the power ratings for domestic electrical appliances and the changes in stored energy when they are in use", aos: ["AO1"] },
          { ref: "DfE physics: Energy", text: "make calculations of the energy changes associated with changes in a system, recalling or selecting the relevant equations for mechanical, electrical and thermal processes", aos: ["AO2"] },
        ],
      },
      {
        slug: "energy-conservation-resources",
        title: "Conservation, dissipation and energy resources",
        specRef: ref("Energy"),
        difficulty: 2,
        summary: "Energy is conserved in a closed system but dissipated into less useful stores; efficiency, reducing unwanted transfers, and the energy resources used on Earth.",
        keyPoints: [
          "In a closed system the total energy never changes; it is only transferred between stores.",
          "Efficiency = useful output energy transfer ÷ total input energy transfer, which can never be more than 1 (100%).",
          "Lubrication reduces friction; thermal insulation and thicker walls of low thermal conductivity reduce the rate of cooling.",
          "Renewable resources (wind, hydro-electricity, tides, the Sun, bio-fuel) are replenished as they are used; fossil fuels and nuclear fuel are not.",
        ],
        commonErrors: [
          "Giving an efficiency greater than 100%, usually by dividing input by output.",
          "Saying wasted energy is destroyed rather than dissipated to the surroundings.",
          "Calling nuclear fuel renewable because it produces no carbon dioxide.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Energy", text: "describe with examples where there are energy transfers in a system, that there is no net change to the total energy of a closed system (qualitative only)", aos: ["AO1"] },
          { ref: "DfE physics: Energy", text: "describe, with examples, how in all system changes, energy is dissipated, so that it is stored in less useful ways", aos: ["AO1"] },
          { ref: "DfE physics: Energy", text: "explain ways of reducing unwanted energy transfer, for example through lubrication and thermal insulation, and describe the effects of the thickness and thermal conductivity of a building's walls on its rate of cooling (qualitative only)", aos: ["AO1"] },
          { ref: "DfE physics: Energy", text: "calculate energy efficiency for any energy transfer, and describe ways to increase efficiency", aos: ["AO1", "AO2"] },
          { ref: "DfE physics: Energy", text: "describe the main energy sources available for use on Earth (fossil fuels, nuclear fuel, bio-fuel, wind, hydro-electricity, the tides and the Sun), compare the ways in which they are used and distinguish between renewable and non-renewable sources", aos: ["AO1"] },
          { ref: "DfE physics: Energy", text: "explain patterns and trends in the use of energy resources", aos: ["AO3"] },
        ],
      },
    ],
  },
  {
    slug: "gcse-forces",
    title: "Forces",
    topics: [
      {
        slug: "forces-interactions",
        title: "Forces, weight and stretching",
        specRef: ref("Forces"),
        difficulty: 2,
        summary: "Contact and non-contact forces, weight and gravitational field strength, resultant forces and free body diagrams, stretching springs and work done by a force.",
        keyPoints: [
          "Weight = mass × gravitational field strength (W = mg); on Earth g is about 9.8 N/kg.",
          "The resultant force is the single force with the same effect as all the forces together; balanced forces give a resultant of zero.",
          "For a spring within its limit of proportionality, force = spring constant × extension (F = ke).",
          "Work done = force × distance moved along the line of action of the force; 1 N m = 1 J.",
        ],
        commonErrors: [
          "Confusing mass (in kg) with weight (a force in N).",
          "Using the total length of a spring instead of its extension.",
          "Using a distance that is not along the line of the force when calculating work done.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Forces", text: "recall examples of ways in which objects interact: by gravity, electrostatics, magnetism and by contact (including normal contact force and friction), and represent the forces in each interacting pair as vectors", aos: ["AO1"] },
          { ref: "DfE physics: Forces", text: "define weight, describe how it is measured and describe the relationship between the weight of a body and the gravitational field strength", aos: ["AO1", "AO2"] },
          { ref: "DfE physics: Forces", text: "describe, using free body diagrams, examples where several forces lead to a resultant force on an object, and the special case of balanced forces when the resultant force is zero", aos: ["AO1"] },
          { ref: "DfE physics: Forces", text: "use vector diagrams to illustrate resolution of forces, a net force and equilibrium situations (scale drawings only)", aos: ["AO2"] },
          { ref: "DfE physics: Forces", text: "explain, with examples, that to stretch, bend or compress an object, more than one force has to be applied", aos: ["AO1"] },
          { ref: "DfE physics: Forces", text: "describe the difference between elastic and inelastic distortions, and between linear and non-linear relationships between force and extension; calculate a spring constant in linear cases and the work done in stretching", aos: ["AO1", "AO2"] },
          { ref: "DfE physics: Forces", text: "use the relationship between work done, force and distance moved along the line of action of the force, describe the energy transfer involved, and convert between newton-metres and joules", aos: ["AO2"] },
        ],
      },
      {
        slug: "pressure-fluids",
        title: "Pressure in fluids",
        specRef: ref("Forces"),
        difficulty: 3,
        summary: "Pressure as force per unit area, atmospheric pressure and height, pressure in liquids with depth and density, upthrust, floating and sinking.",
        keyPoints: [
          "Pressure = force normal to a surface ÷ area of that surface, measured in pascals (1 Pa = 1 N/m²).",
          "Atmospheric pressure falls with height because there is less air above, and the air is less dense.",
          "Pressure in a liquid = height of column × density × g, so it increases with depth and with density.",
          "Upthrust: the pressure on the bottom of a submerged object is greater than on its top, so the liquid pushes it upwards; it floats when upthrust equals its weight.",
        ],
        commonErrors: [
          "Using an area in cm² with a force in N and quoting the answer in pascals.",
          "Saying pressure in a liquid acts only downwards; it acts in all directions.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Forces", text: "recall that the pressure in fluids causes a force normal to any surface, and use the relationship between the force, the pressure and the area in contact", aos: ["AO1", "AO2"] },
          { ref: "DfE physics: Forces", text: "describe a simple model of the Earth's atmosphere and of atmospheric pressure, and explain why atmospheric pressure varies with height above the surface", aos: ["AO1"] },
          { ref: "DfE physics: Forces", text: "explain why pressure in a liquid varies with depth and density and how this leads to an upwards force on a partially submerged object; describe the factors which influence floating and sinking", aos: ["AO1", "AO2"] },
          { ref: "DfE physics: Forces", text: "calculate the differences in pressure at different depths in a liquid", aos: ["AO2"] },
        ],
      },
      {
        slug: "moments-levers-gears",
        title: "Moments, levers and gears",
        specRef: ref("Forces"),
        difficulty: 2,
        summary: "Forces that cause rotation, the moment of a force, and how levers and gears transmit rotational effects.",
        keyPoints: [
          "Moment of a force = force × perpendicular distance from the pivot to the line of action of the force.",
          "Principle of moments: for a balanced object, the total clockwise moment about a pivot equals the total anticlockwise moment.",
          "Levers and gears: a long lever, or a small gear driving a larger one, lets a small force produce a larger moment.",
        ],
        commonErrors: [
          "Measuring the distance along the lever to the force rather than the perpendicular distance to its line of action.",
          "Forgetting to convert centimetres to metres when the moment is required in N m.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Forces", text: "describe examples in which forces cause rotation", aos: ["AO1"] },
          { ref: "DfE physics: Forces", text: "define and calculate the moment of a force in such examples", aos: ["AO1", "AO2"] },
          { ref: "DfE physics: Forces", text: "explain how levers and gears transmit the rotational effects of forces", aos: ["AO1"] },
        ],
      },
      {
        slug: "speed-acceleration",
        title: "Speed, velocity and acceleration",
        specRef: ref("Forces and motion"),
        difficulty: 2,
        summary: "Distance and displacement, speed and velocity, typical everyday speeds, acceleration, and distance-time and velocity-time graphs.",
        keyPoints: [
          "Speed = distance ÷ time; velocity is speed in a given direction, so it is a vector.",
          "Acceleration = change in velocity ÷ time taken; for uniform acceleration, v² − u² = 2as.",
          "Distance-time graph: its gradient is the speed, and a horizontal line means the object is stationary.",
          "Velocity-time graph: its gradient is the acceleration, and the area under it is the distance travelled.",
          "An object moving in a circle at constant speed is accelerating because its direction, and so its velocity, keeps changing.",
        ],
        commonErrors: [
          "Reading the speed straight off a distance-time graph instead of finding its gradient.",
          "Treating speed and velocity as the same quantity when the direction changes.",
          "Forgetting that a negative gradient on a velocity-time graph is a deceleration.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Forces and motion", text: "explain the vector-scalar distinction as it applies to displacement, distance, velocity and speed", aos: ["AO1"] },
          { ref: "DfE physics: Forces and motion", text: "recall typical speeds for wind, sound, walking, running, cycling and other transport; recall the acceleration in free fall and estimate the magnitudes of everyday accelerations", aos: ["AO1"] },
          { ref: "DfE physics: Forces and motion", text: "explain with examples that motion in a circular orbit involves constant speed but changing velocity (qualitative only)", aos: ["AO1"] },
          { ref: "DfE physics: Forces and motion", text: "make measurements of distances and times, calculate speeds, and make and use graphs of these to determine the speeds and accelerations involved", aos: ["AO2", "AO3"] },
          { ref: "DfE physics: Forces and motion", text: "relate changes in motion to distance-time and velocity-time graphs, interpreting lines, slopes and the areas enclosed by velocity-time graphs", aos: ["AO2"] },
          { ref: "DfE physics: Forces and motion", text: "apply formulae relating distance, time and speed for uniform motion and for motion with uniform acceleration, and calculate average speed for non-uniform motion", aos: ["AO2"] },
        ],
      },
      {
        slug: "newtons-laws-momentum",
        title: "Newton's laws and momentum",
        specRef: ref("Forces and motion"),
        difficulty: 3,
        summary: "Newton's three laws, resultant force and acceleration, inertial mass, and momentum in collisions.",
        keyPoints: [
          "Newton's first law: an object's velocity stays the same unless a resultant force acts on it.",
          "Newton's second law: resultant force = mass × acceleration (F = ma).",
          "Newton's third law: when two objects interact, they exert equal and opposite forces of the same type on each other.",
          "Momentum = mass × velocity; in a collision with no external forces, the total momentum before equals the total momentum after.",
        ],
        commonErrors: [
          "Using one force rather than the resultant force in F = ma.",
          "Treating an object's weight and the normal contact force on it as a Newton's third law pair.",
          "Dropping the direction (sign) of a velocity when adding momenta in a collision.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Forces and motion", text: "apply Newton's First Law to explain the motion of objects moving with uniform velocity and of objects whose speed and/or direction change", aos: ["AO1"] },
          { ref: "DfE physics: Forces and motion", text: "apply Newton's Second Law in calculations relating forces, masses and accelerations", aos: ["AO2"] },
          { ref: "DfE physics: Forces and motion", text: "explain that inertial mass is a measure of how difficult it is to change the velocity of an object, and that it is defined as the ratio of force over acceleration", aos: ["AO1"] },
          { ref: "DfE physics: Forces and motion", text: "recall Newton's Third Law and apply it to examples of equilibrium situations", aos: ["AO1"] },
          { ref: "DfE physics: Forces and motion", text: "define momentum and describe examples of momentum in collisions", aos: ["AO1", "AO2"] },
        ],
      },
      {
        slug: "stopping-road-safety",
        title: "Stopping distances and road safety",
        specRef: ref("Forces and motion"),
        difficulty: 2,
        summary: "Reaction times, thinking and braking distances, how speed affects stopping distance, and the forces involved in large decelerations.",
        keyPoints: [
          "Stopping distance: the sum of the thinking distance (travelled during the driver's reaction time) and the braking distance.",
          "Thinking distance depends on speed and reaction time; tiredness, alcohol, drugs and distractions increase reaction time.",
          "Braking distance increases with speed (roughly with its square) and with poor road or tyre conditions.",
          "Increasing the time over which a vehicle or passenger stops, as crumple zones, seat belts and airbags do, reduces the force for the same change in momentum.",
        ],
        commonErrors: [
          "Saying that reaction time affects braking distance rather than thinking distance.",
          "Assuming that doubling the speed doubles the braking distance.",
          "Saying a crumple zone reduces the change in momentum rather than spreading it over a longer time.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Forces and motion", text: "explain methods of measuring human reaction times and recall typical results", aos: ["AO1"] },
          { ref: "DfE physics: Forces and motion", text: "explain the factors which affect the distance required for road vehicles to come to rest in emergencies, and the implications for safety", aos: ["AO1"] },
          { ref: "DfE physics: Forces and motion", text: "estimate how the distance required for a road vehicle to stop in an emergency varies over a range of typical speeds", aos: ["AO2"] },
          { ref: "DfE physics: Forces and motion", text: "explain the dangers caused by large decelerations and estimate the forces involved in typical situations on a public road", aos: ["AO2"] },
        ],
      },
    ],
  },
  {
    slug: "gcse-waves",
    title: "Waves",
    topics: [
      {
        slug: "wave-properties",
        title: "Wave properties and sound",
        specRef: ref("Waves in matter"),
        difficulty: 2,
        summary: "Amplitude, wavelength, frequency and period, the wave equation, transverse and longitudinal waves, waves at boundaries and using waves to explore hidden structures.",
        keyPoints: [
          "Wave speed = frequency × wavelength (v = fλ); period = 1 ÷ frequency.",
          "In a transverse wave the vibrations are at right angles to the direction of travel; in a longitudinal wave, such as sound, they are along it.",
          "A wave transfers energy, not the material it travels through.",
          "At a boundary a wave can be reflected, transmitted or absorbed; echoes from boundaries let ultrasound and seismic waves reveal hidden structures.",
        ],
        commonErrors: [
          "Measuring wavelength from a peak to a trough instead of between two neighbouring peaks.",
          "Saying the frequency of a wave changes when it passes into a new medium; it is the speed and wavelength that change.",
          "Forgetting that an echo time covers the journey there and back.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Waves", text: "describe wave motion in terms of amplitude, wavelength, frequency and period; define wavelength and frequency and apply the relationship between these and the wave velocity", aos: ["AO1", "AO2"] },
          { ref: "DfE physics: Waves", text: "describe the difference between transverse and longitudinal waves", aos: ["AO1"] },
          { ref: "DfE physics: Waves", text: "describe how ripples on water are transverse and sound waves in air are longitudinal, how the speed of each may be measured, and the evidence that it is the wave and not the water or air that travels", aos: ["AO1", "AO3"] },
          { ref: "DfE physics: Waves", text: "describe the effects of reflection, transmission and absorption of waves at material interfaces", aos: ["AO1"] },
          { ref: "DfE physics: Waves", text: "describe processes which convert between sound waves and vibrations in solids, explain why they only work over a limited frequency range, and the relevance of this to human hearing", aos: ["AO1"] },
          { ref: "DfE physics: Waves", text: "explain, in qualitative terms, how differences in velocity, absorption and reflection between types of wave can be used to detect and explore structures hidden from direct observation, in our bodies, in the Earth's core and in deep water", aos: ["AO2"] },
          { ref: "DfE physics: Waves", text: "show how changes in velocity, frequency and wavelength are inter-related when sound passes from one medium to another", aos: ["AO2"] },
        ],
      },
      {
        slug: "electromagnetic-spectrum",
        title: "Electromagnetic waves",
        specRef: ref("Light and electromagnetic waves"),
        difficulty: 2,
        summary: "The electromagnetic spectrum in order of wavelength and frequency, how matter absorbs, transmits, refracts and reflects it, its uses and its hazards.",
        keyPoints: [
          "All electromagnetic waves are transverse and travel at the same speed in a vacuum, about 3 × 10⁸ m/s.",
          "In order of increasing frequency (decreasing wavelength): radio, microwave, infrared, visible, ultraviolet, X-rays, gamma rays.",
          "Hazards of ultraviolet, X-rays and gamma rays: they carry the most energy and can damage cells; ultraviolet can cause skin cancer, and X-rays and gamma rays can cause mutations.",
          "Refraction happens because a wave's speed changes as it passes from one substance into another.",
        ],
        commonErrors: [
          "Saying that different electromagnetic waves travel at different speeds in a vacuum.",
          "Putting the spectrum in the wrong order, for example infrared after visible light on the high-frequency side.",
          "Saying that radio waves are sound waves.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Light and electromagnetic waves", text: "recall that light is an electromagnetic wave, that electromagnetic waves are transverse, all travel at the same speed through space, and transfer energy from source to absorber", aos: ["AO1"] },
          { ref: "DfE physics: Light and electromagnetic waves", text: "describe the main groupings of the spectrum (radio, microwave, infra-red, visible, ultra-violet, X-rays and gamma rays) from long to short wavelength and low to high frequency, and that our eyes detect only a limited range", aos: ["AO1"] },
          { ref: "DfE physics: Light and electromagnetic waves", text: "recall that substances may absorb, transmit, refract or reflect electromagnetic waves in ways that vary with wavelength, and explain how some effects relate to differences in wave velocity", aos: ["AO1"] },
          { ref: "DfE physics: Light and electromagnetic waves", text: "recall that radio waves can be produced by, or can induce, oscillations in electrical circuits, and that changes in atoms and nuclei can generate and absorb radiation over a wide frequency range", aos: ["AO1"] },
          { ref: "DfE physics: Light and electromagnetic waves", text: "give examples of practical uses of each region of the spectrum and describe how ultra-violet, X-rays and gamma rays can have hazardous effects on human tissue", aos: ["AO1"] },
          { ref: "DfE physics: Light and electromagnetic waves", text: "apply the relationships between frequency and wavelength across the electromagnetic spectrum", aos: ["AO2"] },
        ],
      },
      {
        slug: "lenses-colour-radiation",
        title: "Lenses, colour and black body radiation",
        specRef: ref("Light and electromagnetic waves"),
        difficulty: 3,
        summary: "Ray diagrams for reflection, refraction and lenses, why objects have colour, and how the temperature of a body depends on the radiation it absorbs and emits.",
        keyPoints: [
          "Convex and concave lenses: a convex (converging) lens brings parallel rays together at a focus, while a concave (diverging) lens spreads them out.",
          "An object looks a colour because it reflects or transmits that colour and absorbs the others.",
          "Every object emits radiation; a hotter object emits more radiation, with more at shorter wavelengths.",
          "An object's temperature stays constant when it absorbs radiation at the same rate as it emits it.",
        ],
        commonErrors: [
          "Drawing rays that bend away from the normal when light enters a denser material.",
          "Saying that a red object absorbs red light.",
          "Saying that only hot objects emit infrared radiation.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Light and electromagnetic waves", text: "use ray diagrams to illustrate reflection, refraction and the similarities and differences between convex and concave lenses (qualitative only)", aos: ["AO1", "AO2"] },
          { ref: "DfE physics: Light and electromagnetic waves", text: "explain how colour is related to differential absorption, transmission, specular reflection and scattering", aos: ["AO1"] },
          { ref: "DfE physics: Light and electromagnetic waves", text: "explain that all bodies emit radiation and that the intensity and wavelength distribution of the emission depend on temperature", aos: ["AO1"] },
          { ref: "DfE physics: Light and electromagnetic waves", text: "explain how the temperature of a body is related to the balance between radiation absorbed and radiation emitted, including the factors which determine the temperature of the Earth", aos: ["AO2"] },
        ],
      },
    ],
  },
  {
    slug: "gcse-electricity",
    title: "Electricity",
    topics: [
      {
        slug: "current-pd-resistance",
        title: "Current, potential difference and resistance",
        specRef: ref("Electricity"),
        difficulty: 2,
        summary: "Charge and current, potential difference and resistance, current-voltage graphs for components, and series and parallel circuits.",
        keyPoints: [
          "Two circuit equations: charge flow = current × time (Q = It), and potential difference = current × resistance (V = IR).",
          "Series circuit rules: the current is the same everywhere, the potential differences add up to the supply, and the total resistance is the sum of the resistances.",
          "Adding a resistor in parallel decreases the total resistance, because the current has an extra path.",
          "A fixed resistor at constant temperature has a straight-line I-V graph; a filament lamp's resistance rises as it heats up; a diode lets current flow one way only.",
        ],
        commonErrors: [
          "Connecting a voltmeter in series or an ammeter in parallel.",
          "Thinking current is used up as it goes round a series circuit.",
          "Adding resistances in parallel as if they were in series.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Electricity", text: "recall that current is a rate of flow of charge, that a source of potential difference and a closed circuit are needed for charge to flow, and that current is the same at any point in a single loop; use the relationship between charge, current and time", aos: ["AO1", "AO2"] },
          { ref: "DfE physics: Electricity", text: "recall and apply the relationship between current, resistance and potential difference, and explain that for some components resistance is constant while for others it changes with current; explain the design and use of circuits to explore this for lamps, diodes, thermistors and LDRs", aos: ["AO1", "AO2", "AO3"] },
          { ref: "DfE physics: Electricity", text: "describe the difference between series and parallel circuits, and explain why two resistors in series increase the net resistance while two in parallel decrease it (qualitative only)", aos: ["AO1"] },
          { ref: "DfE physics: Electricity", text: "calculate currents, potential differences and resistances in d.c. series circuits, explain the design and use of such circuits for measurement and testing, and use standard circuit symbols", aos: ["AO2"] },
          { ref: "DfE physics: Electricity", text: "use graphs to explore whether circuit elements are linear or non-linear and relate the curves to their function and properties", aos: ["AO2", "AO3"] },
        ],
      },
      {
        slug: "mains-electricity-power",
        title: "Mains electricity, power and the National Grid",
        specRef: ref("Electricity"),
        difficulty: 2,
        summary: "Alternating and direct potential difference, the live, neutral and earth wires, electrical power and energy, and the National Grid.",
        keyPoints: [
          "UK mains is alternating at 50 Hz and about 230 V; a battery supplies direct potential difference.",
          "The live wire is at about 230 V, the neutral wire is near 0 V, and the earth wire carries current only if there is a fault.",
          "Power = potential difference × current = current² × resistance; energy transferred = power × time = charge × potential difference.",
          "The National Grid uses step-up transformers to transmit at high voltage, so the current is low and less energy is lost heating the cables.",
        ],
        commonErrors: [
          "Saying an appliance is safe whenever its switch is off; the live wire can still be at a high potential.",
          "Saying transmission at high voltage reduces power rather than current.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Electricity", text: "recall that the UK domestic supply is a.c. at 50 Hz and about 230 V, and explain the difference between direct and alternating voltage", aos: ["AO1"] },
          { ref: "DfE physics: Electricity", text: "recall the functions of the live, neutral and earth wires and the potential differences between them, and explain why a live wire may be dangerous even when a switch is open", aos: ["AO1"] },
          { ref: "DfE physics: Electricity", text: "explain how the power transfer in a circuit device is related to the potential difference across it, the current, and the energy transferred in a given time", aos: ["AO1", "AO2"] },
          { ref: "DfE physics: Electricity", text: "describe how, in different domestic devices, energy is transferred from batteries and the a.c. mains to motors or heating devices", aos: ["AO1"] },
          { ref: "DfE physics: Electricity", text: "explain how the National Grid transfers power at high voltage and then at lower voltage for domestic use, and why this is an efficient way to transfer energy", aos: ["AO1"] },
          { ref: "DfE physics: Electricity", text: "apply the equations relating potential difference, current, charge, resistance, power, energy and time", aos: ["AO2"] },
        ],
      },
      {
        slug: "static-electricity",
        title: "Static electricity and electric fields",
        specRef: ref("Electricity"),
        difficulty: 2,
        summary: "Charging by friction through the transfer of electrons, forces between charges, sparking, and electric fields.",
        keyPoints: [
          "Rubbing two insulators together transfers electrons from one to the other; the one that gains electrons becomes negatively charged.",
          "Like charges repel and unlike charges attract, without the objects touching.",
          "A charged object has an electric field around it, which is stronger closer to the object; a strong enough field can cause a spark.",
        ],
        commonErrors: [
          "Saying positive charges (protons) move when an object is charged by friction.",
          "Saying a charged object only affects objects it touches.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Electricity", text: "describe the production of static electricity, and sparking, by rubbing surfaces", aos: ["AO1"] },
          { ref: "DfE physics: Electricity", text: "describe evidence that charged objects exert forces of attraction or repulsion on one another when not in contact", aos: ["AO1"] },
          { ref: "DfE physics: Electricity", text: "explain how the transfer of electrons between objects can explain the phenomena of static electricity", aos: ["AO1", "AO2"] },
          { ref: "DfE physics: Electricity", text: "explain the concept of an electric field and how it helps to explain the phenomena of static electricity", aos: ["AO1"] },
        ],
      },
    ],
  },
  {
    slug: "gcse-magnetism",
    title: "Magnetism and electromagnetism",
    topics: [
      {
        slug: "magnets-fields",
        title: "Magnets and magnetic fields",
        specRef: ref("Magnetism and electromagnetism"),
        difficulty: 1,
        summary: "Poles, permanent and induced magnets, magnetic field patterns and the Earth's magnetic field.",
        keyPoints: [
          "Forces between magnetic poles: like poles repel and unlike poles attract, without the magnets touching.",
          "An induced magnet is magnetic only while it is in a magnetic field, and is always attracted to the magnet.",
          "Magnetic field lines: they point from north to south, and the field is strongest where the lines are closest, near the poles.",
          "A compass points along the Earth's magnetic field, which is evidence that the Earth's core is magnetic.",
        ],
        commonErrors: [
          "Saying an induced magnet can be repelled.",
          "Drawing field lines that cross or that run from south to north outside the magnet.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Magnetism and electromagnetism", text: "describe attraction and repulsion between poles of permanent magnets, and the difference between permanent and induced magnets", aos: ["AO1"] },
          { ref: "DfE physics: Magnetism and electromagnetism", text: "describe the magnetic field of a magnet, showing how strength and direction change from one point to another", aos: ["AO1"] },
          { ref: "DfE physics: Magnetism and electromagnetism", text: "explain how the behaviour of a magnetic compass is evidence that the core of the Earth must be magnetic", aos: ["AO1"] },
        ],
      },
      {
        slug: "motor-effect",
        title: "Electromagnets and the motor effect",
        specRef: ref("Magnetism and electromagnetism"),
        difficulty: 3,
        summary: "The magnetic field of a current, solenoids, the force on a current-carrying wire, Fleming's left-hand rule and electric motors.",
        keyPoints: [
          "A current in a wire produces circular magnetic field lines around it; the field is stronger for a larger current and closer to the wire.",
          "A solenoid concentrates the field; an iron core makes it stronger.",
          "Force on a wire at right angles to a field = magnetic flux density × current × length (F = BIl).",
          "Fleming's left-hand rule: first finger field, second finger current, thumb motion (force).",
        ],
        commonErrors: [
          "Using the right hand for the motor effect.",
          "Forgetting that there is no force when the wire is parallel to the field.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Magnetism and electromagnetism", text: "describe how to show that a current creates a magnetic effect and the direction of the field around a wire; recall that its strength depends on the current and the distance from the wire", aos: ["AO1"] },
          { ref: "DfE physics: Magnetism and electromagnetism", text: "explain how a solenoid enhances the magnetic effect of a current", aos: ["AO1"] },
          { ref: "DfE physics: Magnetism and electromagnetism", text: "describe the force between a magnet and a current-carrying conductor and use Fleming's left-hand rule for the directions of force, current and field", aos: ["AO1"] },
          { ref: "DfE physics: Magnetism and electromagnetism", text: "apply the equation linking the force on a conductor to the magnetic flux density, the current and the length of conductor", aos: ["AO2"] },
          { ref: "DfE physics: Magnetism and electromagnetism", text: "explain how this force is used to cause rotation in electric motors", aos: ["AO1"] },
        ],
      },
      {
        slug: "induction-transformers",
        title: "Induction, generators and transformers",
        specRef: ref("Magnetism and electromagnetism"),
        difficulty: 3,
        summary: "Electromagnetic induction, alternators and dynamos, transformers and the turns ratio, microphones and loudspeakers.",
        keyPoints: [
          "Moving a wire through a magnetic field, or changing the field around a coil, induces a potential difference; its current produces a field that opposes the change.",
          "An alternator produces alternating current; a dynamo uses a split-ring commutator to produce direct current.",
          "Transformer equations: Vp ÷ Vs = Np ÷ Ns, and for an ideal transformer Vp × Ip = Vs × Is.",
          "A microphone turns the pressure variations of sound into a varying current; a loudspeaker does the reverse.",
        ],
        commonErrors: [
          "Saying a transformer works with direct current.",
          "Inverting the turns ratio, so a step-up transformer appears to reduce the voltage.",
          "Saying a transformer increases power as well as voltage.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Magnetism and electromagnetism", text: "recall that a changing magnetic field around a conductor induces a potential difference that opposes the change, and explain how this is used in an alternator to generate a.c. and in a dynamo to generate d.c.", aos: ["AO1"] },
          { ref: "DfE physics: Magnetism and electromagnetism", text: "explain how transformers work and how the ratio of the potential differences depends on the ratio of the numbers of turns", aos: ["AO1"] },
          { ref: "DfE physics: Magnetism and electromagnetism", text: "apply the transformer equations linking potential differences, numbers of turns, currents and power, and relate them to the advantages of transmitting power at high voltage", aos: ["AO2"] },
          { ref: "DfE physics: Magnetism and electromagnetism", text: "explain how a microphone converts the pressure variations of sound into a varying current, and the reverse effect in loudspeakers and headphones", aos: ["AO1"] },
        ],
      },
    ],
  },
  {
    slug: "gcse-particle-model",
    title: "Particle model of matter",
    topics: [
      {
        slug: "density-states",
        title: "Density and changes of state",
        specRef: ref("Particle model of matter"),
        difficulty: 2,
        summary: "Density and the arrangement of particles in solids, liquids and gases, and changes of state as reversible physical changes in which mass is conserved.",
        keyPoints: [
          "Density = mass ÷ volume; solids are usually densest because their particles are packed most closely.",
          "Melting, freezing, evaporating, condensing and sublimating are physical changes: mass is conserved and the substance gets its original properties back if the change is reversed.",
          "Volume of an irregular solid: measure the volume of water it displaces, for example in a measuring cylinder or a eureka can.",
        ],
        commonErrors: [
          "Mixing units, such as a mass in grams with a volume in m³.",
          "Saying that mass is lost when a substance evaporates in a sealed container.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Particle model of matter", text: "define density and explain the differences in density between the states of matter in terms of the arrangement of particles", aos: ["AO1"] },
          { ref: "DfE physics: Particle model of matter", text: "describe how mass is conserved when substances melt, freeze, evaporate, condense or sublimate, and how these physical changes differ from chemical changes", aos: ["AO1"] },
          { ref: "DfE physics: Particle model of matter", text: "apply the relationship between density, mass and volume to changes where mass is conserved", aos: ["AO2"] },
        ],
      },
      {
        slug: "internal-energy",
        title: "Internal energy, specific heat and latent heat",
        specRef: ref("Particle model of matter"),
        difficulty: 3,
        summary: "Internal energy, specific heat capacity, specific latent heat, and how heating changes temperature or state.",
        keyPoints: [
          "Internal energy is the total kinetic and potential energy of the particles in a system.",
          "Change in thermal energy = mass × specific heat capacity × temperature change (ΔE = mcΔθ).",
          "Energy for a change of state = mass × specific latent heat (E = mL); the temperature stays constant during the change.",
          "Specific heat capacity is the energy to raise 1 kg by 1 °C; specific latent heat is the energy to change the state of 1 kg with no temperature change.",
        ],
        commonErrors: [
          "Using the final temperature instead of the temperature change in ΔE = mcΔθ.",
          "Saying the temperature rises while a substance is melting or boiling.",
          "Confusing specific heat capacity with specific latent heat.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Particle model of matter", text: "describe how heating a system changes the energy stored within it and raises its temperature or produces changes of state", aos: ["AO1"] },
          { ref: "DfE physics: Particle model of matter", text: "define specific heat capacity and distinguish it from specific latent heat", aos: ["AO1"] },
          { ref: "DfE physics: Particle model of matter", text: "calculate the energy change from mass, specific heat capacity and temperature change, and the energy for a change of state from mass and specific latent heat", aos: ["AO2"] },
        ],
      },
      {
        slug: "gas-pressure",
        title: "Particle model and gas pressure",
        specRef: ref("Particle model of matter"),
        difficulty: 3,
        summary: "How the motion of gas particles explains pressure, and how pressure changes with temperature, volume and work done on the gas.",
        keyPoints: [
          "Gas pressure is caused by particles colliding with the walls of the container, producing a force at right angles to the walls.",
          "Heating a gas at constant volume makes its particles move faster, so they collide more often and harder, and the pressure rises.",
          "At constant temperature, increasing the volume of a gas decreases its pressure (pV = constant).",
          "Doing work on a gas, as when pumping a bicycle tyre, increases its internal energy and so its temperature.",
        ],
        commonErrors: [
          "Saying the particles themselves get bigger or hotter when a gas is heated.",
          "Saying pressure rises because there are more particles, when the amount of gas is fixed.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Particle model of matter", text: "explain how the motion of gas molecules is related to temperature and pressure, and hence the relation between the temperature of a gas and its pressure at constant volume (qualitative only)", aos: ["AO1"] },
          { ref: "DfE physics: Particle model of matter", text: "recall that gases can be compressed or expanded by pressure changes and that gas pressure produces a net force at right angles to any surface", aos: ["AO1"] },
          { ref: "DfE physics: Particle model of matter", text: "explain how increasing the volume of a gas at constant temperature can lead to a decrease in pressure", aos: ["AO1"] },
          { ref: "DfE physics: Particle model of matter", text: "explain how doing work on a gas can increase its temperature, for example in a bicycle pump", aos: ["AO1"] },
        ],
      },
    ],
  },
  {
    slug: "gcse-atomic-structure",
    title: "Atomic structure",
    topics: [
      {
        slug: "atoms-isotopes",
        title: "Atoms, nuclei and isotopes",
        specRef: ref("Atomic structure"),
        difficulty: 2,
        summary: "The nuclear model of the atom and how it developed, the size of atoms, protons, neutrons and isotopes, and electrons moving between energy levels.",
        keyPoints: [
          "An atom is about 1 × 10⁻¹⁰ m across; its nucleus is about 10 000 times smaller but holds almost all of its mass.",
          "Isotopes of an element have the same number of protons but different numbers of neutrons.",
          "Rutherford's alpha-scattering experiment replaced the plum pudding model with a small, dense, positive nucleus.",
          "Electrons move to a higher energy level when they absorb electromagnetic radiation and fall back when they emit it; an atom that loses an outer electron becomes a positive ion.",
        ],
        commonErrors: [
          "Saying isotopes have different numbers of protons.",
          "Saying most alpha particles bounced back in the scattering experiment; most passed straight through.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Atomic structure", text: "describe the atom as a positively charged nucleus surrounded by negatively charged electrons, with the nuclear radius much smaller than the atom and almost all the mass in the nucleus", aos: ["AO1"] },
          { ref: "DfE physics: Atomic structure", text: "recall the typical size (order of magnitude) of atoms and small molecules", aos: ["AO1"] },
          { ref: "DfE physics: Atomic structure", text: "describe how and why the atomic model has changed over time", aos: ["AO1"] },
          { ref: "DfE physics: Atomic structure", text: "recall that nuclei contain protons and neutrons, that each element's nucleus has a characteristic positive charge, and that isotopes of an element differ in their number of neutrons; relate isotopes to their conventional symbols", aos: ["AO1"] },
          { ref: "DfE physics: Atomic structure", text: "recall that electrons are arranged at different distances from the nucleus, that the arrangement may change with absorption or emission of electromagnetic radiation, and that atoms become ions by losing outer electrons", aos: ["AO1"] },
        ],
      },
      {
        slug: "radioactive-decay",
        title: "Radioactive decay and half-life",
        specRef: ref("Atomic structure"),
        difficulty: 3,
        summary: "Alpha, beta and gamma emission, decay equations, penetration, the random nature of decay and half-life.",
        keyPoints: [
          "Alpha decay emits a helium nucleus (mass number −4, atomic number −2); beta decay emits an electron as a neutron becomes a proton (atomic number +1); gamma emission changes neither.",
          "Alpha is stopped by paper, beta by a few millimetres of aluminium, and gamma is reduced by thick lead or concrete.",
          "Radioactive decay is random: you cannot predict when a particular nucleus will decay.",
          "The half-life is the time for the number of unstable nuclei, or the count rate, to halve; after n half-lives the activity is (½)ⁿ of the start.",
        ],
        commonErrors: [
          "Saying that after two half-lives the sample has completely decayed.",
          "Forgetting to subtract the background count before finding the half-life.",
          "Balancing a decay equation by mass number but not by atomic number.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Atomic structure", text: "recall that some nuclei are unstable and may emit alpha particles, beta particles, neutrons or gamma rays, and relate these emissions to changes in the mass or charge of the nucleus", aos: ["AO1"] },
          { ref: "DfE physics: Atomic structure", text: "use names and symbols of common nuclei and particles to write balanced equations that represent radioactive decay", aos: ["AO2"] },
          { ref: "DfE physics: Atomic structure", text: "explain the concept of half-life and how it is related to the random nature of radioactive decay", aos: ["AO1", "AO2"] },
          { ref: "DfE physics: Atomic structure", text: "calculate the net decline, expressed as a ratio, in a radioactive emission after a given number of half-lives", aos: ["AO2"] },
          { ref: "DfE physics: Atomic structure", text: "recall the differences in the penetration properties of alpha particles, beta particles and gamma rays", aos: ["AO1"] },
        ],
      },
      {
        slug: "radiation-uses-hazards",
        title: "Uses and hazards of radiation, fission and fusion",
        specRef: ref("Atomic structure"),
        difficulty: 3,
        summary: "Contamination and irradiation, how half-life affects hazard, medical uses of radiation, nuclear fission and chain reactions, and nuclear fusion.",
        keyPoints: [
          "Irradiation is exposure to radiation from outside; contamination is radioactive material getting on to or into an object or person.",
          "A medical tracer uses a gamma emitter with a short half-life, so it can be detected outside the body and soon stops emitting.",
          "In fission a large nucleus absorbs a neutron and splits, releasing energy and more neutrons that can cause a chain reaction.",
          "In fusion two light nuclei join to form a heavier nucleus, and some mass is converted into energy.",
        ],
        commonErrors: [
          "Saying an irradiated object becomes radioactive.",
          "Confusing fission (splitting) with fusion (joining).",
          "Choosing an alpha emitter as a medical tracer, when alpha cannot leave the body.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Atomic structure", text: "recall the differences between contamination and irradiation, and compare the hazards associated with each", aos: ["AO1"] },
          { ref: "DfE physics: Atomic structure", text: "explain why the hazards associated with radioactive material differ according to the half-life involved", aos: ["AO2"] },
          { ref: "DfE physics: Atomic structure", text: "describe the uses of nuclear radiation for exploring internal organs and for controlling or destroying unwanted tissue", aos: ["AO1"] },
          { ref: "DfE physics: Atomic structure", text: "recall that some nuclei may split, and relate this to the radiation emitted, the energy transferred to other particles and the possibility of chain reactions", aos: ["AO1"] },
          { ref: "DfE physics: Atomic structure", text: "describe the process of nuclear fusion and recall that some of the mass may be converted into the energy of radiation", aos: ["AO1"] },
        ],
      },
    ],
  },
  {
    slug: "gcse-space",
    title: "Space physics",
    topics: [
      {
        slug: "solar-system-orbits",
        title: "The solar system and orbits",
        specRef: ref("Space physics"),
        difficulty: 2,
        summary: "The planets, moons and artificial satellites of the solar system, circular orbits, and how the Sun formed and stays stable.",
        keyPoints: [
          "The solar system has one star (the Sun), eight planets, dwarf planets, natural moons and artificial satellites.",
          "Gravity provides the force that keeps planets and satellites in orbit; in a circular orbit the speed is constant but the velocity changes.",
          "Orbit speed and radius: if an object's speed in a stable orbit changes, the radius of its orbit must change too, and a smaller orbit needs a higher speed.",
          "The Sun formed from a cloud of dust and gas pulled together by gravity; it is stable while the outward pressure from fusion balances gravity.",
        ],
        commonErrors: [
          "Saying there is no gravity acting on an orbiting satellite.",
          "Saying a satellite in a circular orbit is not accelerating because its speed is constant.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Space physics", text: "recall the main features of our solar system, including the similarities and distinctions between the planets, their moons and artificial satellites", aos: ["AO1"] },
          { ref: "DfE physics: Space physics", text: "explain for circular orbits how the force of gravity can change the velocity of a planet but not its speed, and how for a stable orbit the radius must change if the speed changes (qualitative only)", aos: ["AO1"] },
          { ref: "DfE physics: Space physics", text: "recall that the Sun formed from dust and gas drawn together by gravity, and explain how this led to fusion and to an equilibrium between gravitational collapse and expansion", aos: ["AO1"] },
        ],
      },
      {
        slug: "red-shift-big-bang",
        title: "Red-shift and the Big Bang",
        specRef: ref("Space physics"),
        difficulty: 3,
        summary: "The red-shift of light from distant galaxies, the expanding universe and the evidence for the Big Bang.",
        keyPoints: [
          "Light from galaxies moving away from us is shifted towards longer wavelengths: red-shift.",
          "Distance and red-shift: more distant galaxies show greater red-shift, so they are moving away faster and the universe is expanding.",
          "The Big Bang: an expanding universe suggests it began from a very small, hot, dense region.",
        ],
        commonErrors: [
          "Saying red-shift means the galaxy turns red.",
          "Saying the galaxies are moving away from the Earth in particular, rather than everything moving apart.",
        ],
        ...SOURCE,
        specPoints: [
          { ref: "DfE physics: Space physics", text: "explain the red-shift of light from galaxies which are receding (qualitative only)", aos: ["AO1"] },
          { ref: "DfE physics: Space physics", text: "explain that the change of each galaxy's speed with distance is evidence of an expanding universe", aos: ["AO1", "AO2"] },
          { ref: "DfE physics: Space physics", text: "explain the link between the evidence of an expanding universe and the Big Bang model", aos: ["AO1", "AO2"] },
        ],
      },
    ],
  },
]);
