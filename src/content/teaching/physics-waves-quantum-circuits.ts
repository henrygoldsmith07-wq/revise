import type { TeachingBySpecPoint } from "./types";

// WJEC A-level Physics: waves and optics, photons, and electric circuits.
// h = 6.63 × 10⁻³⁴ J s, c = 3.00 × 10⁸ m s⁻¹, e = 1.60 × 10⁻¹⁹ C.

export const physicsWavesQuantumCircuitsTeaching: TeachingBySpecPoint = {
  "wjec-alevel-physics.waves.sp-01": {
    explain: [
      "The **wave equation**: v = fλ, wave speed = frequency × wavelength.",
      "The frequency is set by the source. When a wave crosses into a new medium, its **frequency stays the same**; its speed changes, so its wavelength changes in proportion.",
      "Light slows down in glass (v = c/n), so its wavelength gets shorter by the same factor while its frequency (and colour) is unchanged.",
    ],
    worked: {
      prompt: "Light of wavelength 500 nm in air enters glass of refractive index 1.50. Find its speed and wavelength in the glass.",
      steps: [
        "v = c/n = 3.00 × 10⁸ / 1.50 = 2.00 × 10⁸ m s⁻¹.",
        "f is unchanged, so λ scales with v: λ = 500 / 1.50 = 333 nm.",
      ],
      answer: "2.00 × 10⁸ m s⁻¹ and 333 nm.",
    },
    check: {
      question: "A sound wave passes from air into water, where it travels faster. What happens to its frequency and wavelength?",
      options: [
        "Frequency increases, wavelength unchanged",
        "Frequency unchanged, wavelength increases",
        "Both increase",
        "Frequency unchanged, wavelength decreases",
      ],
      correctIndex: 1,
      explanation: "The frequency is fixed by the source; v = fλ, so a higher speed means a longer wavelength.",
    },
    apply: {
      prompt: "Explain why the colour of light does not change when it enters water, even though its wavelength does.",
      modelAnswer: "Colour depends on frequency. At the boundary every wavefront that arrives must leave, so the frequency cannot change. The speed falls, so by v = fλ the wavelength falls in proportion while the colour stays the same.",
      successCriteria: ["Colour is set by frequency", "Frequency is unchanged at the boundary", "Wavelength changes with speed"],
    },
  },

  "wjec-alevel-physics.waves.sp-02": {
    explain: [
      "**Young's double slits:** fringe spacing y = λD/a, where a is the slit separation and D the slit-to-screen distance. Rearranged, λ = ay/D.",
      "Measure across many fringes and divide, so the uncertainty in y is shared over several spacings. D is large (metres) and a small (fractions of a mm).",
      "**Diffraction grating:** d sin θ = nλ, where d is the spacing between lines (d = 1/lines per metre) and n the order.",
      "The highest order you can see is the largest whole number n with nλ/d ≤ 1, because sin θ cannot exceed 1.",
    ],
    worked: {
      prompt: "A grating has 300 lines per mm. Light of wavelength 600 nm falls on it. Find the angle of the first-order maximum and the highest order visible.",
      steps: [
        "d = 1 / (300 × 10³) = 3.33 × 10⁻⁶ m.",
        "First order: sin θ = λ/d = 600 × 10⁻⁹ / 3.33 × 10⁻⁶ = 0.180, so θ = 10.4°.",
        "Highest order: n ≤ d/λ = 5.6, so n = 5.",
      ],
      answer: "10.4°; fifth order.",
    },
    check: {
      question: "In a Young's slits experiment, the slit separation is halved. What happens to the fringe spacing?",
      options: ["It halves", "It doubles", "It stays the same", "It quadruples"],
      correctIndex: 1,
      explanation: "y = λD/a, so halving a doubles y.",
    },
    apply: {
      prompt: "With slits 0.50 mm apart and a screen 1.5 m away, 10 fringe spacings measure 18 mm. Calculate the wavelength and explain why 10 spacings were measured.",
      modelAnswer: "y = 18/10 = 1.8 mm. λ = ay/D = 0.50 × 10⁻³ × 1.8 × 10⁻³ / 1.5 = 6.0 × 10⁻⁷ m (600 nm). Measuring 10 spacings makes the absolute reading uncertainty a smaller fraction of the measurement, reducing the percentage uncertainty in y.",
      successCriteria: ["y = 1.8 mm", "λ = 600 nm", "Explains the reduced percentage uncertainty"],
    },
    trap: {
      wrong: "Using the number of lines per mm as d.",
      right: "d is the line spacing: d = 1 ÷ (lines per metre).",
    },
  },

  "wjec-alevel-physics.waves.sp-03": {
    explain: [
      "A **stationary wave** forms when two waves of the same frequency and amplitude travel in opposite directions and superpose, for example a wave and its reflection on a string.",
      "**Nodes** are points of zero amplitude (permanent destructive interference); **antinodes** are points of maximum amplitude. Adjacent nodes are **λ/2** apart; a node and the next antinode are λ/4 apart.",
      "Unlike a progressive wave, a stationary wave transfers no energy along it, and all points between two adjacent nodes oscillate in phase.",
      "A string fixed at both ends has nodes at each end. Its fundamental has length L = λ/2, so f₁ = v/2L; the harmonics are whole-number multiples of f₁.",
    ],
    worked: {
      prompt: "A string 0.80 m long, fixed at both ends, carries waves at 120 m s⁻¹. Find the fundamental frequency and the second harmonic.",
      steps: ["Fundamental: L = λ/2, so λ = 1.60 m.", "f₁ = v/λ = 120 / 1.60 = 75 Hz.", "Second harmonic: λ = L = 0.80 m, f₂ = 150 Hz."],
      answer: "75 Hz and 150 Hz.",
    },
    check: {
      question: "What is the distance between two adjacent nodes of a stationary wave?",
      options: ["λ/4", "λ/2", "λ", "2λ"],
      correctIndex: 1,
      explanation: "Nodes are half a wavelength apart.",
    },
    apply: {
      prompt: "State two differences between a stationary wave and a progressive wave.",
      modelAnswer: "A progressive wave transfers energy; a stationary wave does not. In a progressive wave all points have the same amplitude; in a stationary wave the amplitude varies from zero at nodes to a maximum at antinodes. (Also: between adjacent nodes all points are in phase, whereas phase varies continuously along a progressive wave.)",
      successCriteria: ["Energy transfer difference", "Amplitude or phase difference"],
    },
  },

  "wjec-alevel-physics.waves.sp-04": {
    explain: [
      "**Total internal reflection** happens only when light travels from a **higher** to a **lower** refractive index **and** the angle of incidence exceeds the **critical angle**.",
      "At the critical angle c the refracted ray runs along the boundary (refraction angle 90°). From Snell's law: sin c = n₂/n₁.",
      "Optical fibres use a core with a slightly higher refractive index than the cladding, so light hitting the boundary at more than c is totally internally reflected along the fibre.",
    ],
    worked: {
      prompt: "Find the critical angle for glass (n = 1.50) to air, and for a fibre core of n = 1.48 inside cladding of n = 1.46.",
      steps: ["Glass to air: sin c = 1.00/1.50 = 0.667, c = 41.8°.", "Core to cladding: sin c = 1.46/1.48 = 0.986, c = 80.6°."],
      answer: "41.8°; 80.6°.",
    },
    check: {
      question: "Which condition is needed for total internal reflection?",
      options: [
        "Light moves into a denser medium at any angle",
        "Light moves into a less dense medium at more than the critical angle",
        "Light hits the boundary along the normal",
        "The two media have equal refractive index",
      ],
      correctIndex: 1,
      explanation: "TIR needs both conditions: from higher to lower n, and incidence above the critical angle.",
    },
    apply: {
      prompt: "Explain why a cladding is used in optical fibres instead of leaving the glass core surrounded by air.",
      modelAnswer: "The cladding protects the core from scratches and stops light crossing to touching fibres. Because its index is only slightly lower, the critical angle is large, so only rays nearly parallel to the axis are guided; this reduces the spread of path lengths (multipath dispersion), so pulses stay sharper.",
      successCriteria: ["Protection / no light leaking to adjacent fibres", "Large critical angle reduces multipath dispersion"],
    },
  },

  "wjec-alevel-physics.waves.sp-05": {
    explain: [
      "In a **transverse** wave the oscillations are perpendicular to the direction of travel; in a **longitudinal** wave they are parallel to it.",
      "**Polarisation** restricts the oscillations to one plane. Only transverse waves can be polarised, because longitudinal oscillations have only one possible direction.",
      "Light passing through a Polaroid filter becomes plane-polarised. A second filter rotated through 360° gives two maxima and two minima of intensity: the wave is blocked when the filters are crossed (at 90°).",
      "So the fact that light can be polarised is evidence that light is a transverse wave. Sound cannot be polarised: it is longitudinal.",
    ],
    worked: {
      prompt: "Unpolarised light passes through two Polaroid filters. The second is rotated slowly through a full turn. Describe what an observer sees.",
      steps: [
        "The first filter passes only oscillations in one plane.",
        "When the second filter's axis is parallel to the first, that light passes: maximum brightness.",
        "At 90° the light is blocked: minimum (ideally zero). This happens twice per full turn.",
      ],
      answer: "Two bright and two dark positions per rotation, 90° apart.",
    },
    check: {
      question: "Which of these waves cannot be polarised?",
      options: ["Light", "Microwaves", "Sound in air", "Waves on a rope"],
      correctIndex: 2,
      explanation: "Sound in air is longitudinal, so its oscillations already lie along one direction and cannot be restricted to a plane.",
    },
    apply: {
      prompt: "Explain how an experiment with microwaves and a metal grille can show that microwaves are transverse.",
      modelAnswer: "Microwaves from the transmitter are plane-polarised. Rotating the grille (or the receiver) between transmitter and receiver makes the received signal rise and fall, dropping to a minimum at one orientation. Only transverse waves can be polarised, so microwaves are transverse.",
      successCriteria: ["Signal varies with orientation", "Only transverse waves can be polarised"],
    },
  },

  "wjec-alevel-physics.waves.sp-06": {
    explain: [
      "**Refraction** is the change of direction when a wave changes speed crossing a boundary at an angle.",
      "**Snell's law:** n₁ sin θ₁ = n₂ sin θ₂, with angles measured from the **normal**. The refractive index n = c/v.",
      "Going into a higher index (slower medium), the ray bends **towards** the normal; into a lower index, it bends away.",
    ],
    worked: {
      prompt: "Light in air strikes water (n = 1.33) at 40° to the normal. Find the angle of refraction.",
      steps: ["1.00 × sin 40° = 1.33 × sin θ₂.", "sin θ₂ = 0.643 / 1.33 = 0.483.", "θ₂ = 28.9°."],
      answer: "29° from the normal.",
    },
    check: {
      question: "Light passes from glass into air at an angle. Which way does it bend?",
      options: ["Towards the normal", "Away from the normal", "It does not bend", "Along the boundary always"],
      correctIndex: 1,
      explanation: "Into a lower refractive index the light speeds up and bends away from the normal.",
    },
    apply: {
      prompt: "A ray enters a glass block at 50° to the normal and refracts at 31°. Calculate the refractive index of the glass and the speed of light in it.",
      modelAnswer: "n = sin 50° / sin 31° = 0.766 / 0.515 = 1.49. v = c/n = 3.00 × 10⁸ / 1.49 = 2.0 × 10⁸ m s⁻¹.",
      successCriteria: ["n ≈ 1.49", "v ≈ 2.0 × 10⁸ m s⁻¹"],
    },
    trap: {
      wrong: "Measuring angles from the surface instead of the normal.",
      right: "Snell's law uses angles between the ray and the normal.",
    },
  },

  "wjec-alevel-physics.waves.sp-07": {
    explain: [
      "Two sources give a stable interference pattern only if they are **coherent**: the same frequency and a constant phase difference.",
      "For sources in phase, **path difference = nλ** gives constructive interference (maximum); **path difference = (n + ½)λ** gives destructive interference (minimum).",
      "The path difference is the difference between the distances from the two sources to the point, not either distance on its own.",
    ],
    worked: {
      prompt: "Two loudspeakers driven in phase emit 680 Hz sound (speed 340 m s⁻¹). A listener is 3.00 m from one and 3.75 m from the other. Is the sound loud or quiet there?",
      steps: [
        "λ = v/f = 340 / 680 = 0.50 m.",
        "Path difference = 3.75 − 3.00 = 0.75 m = 1.5λ.",
        "A half-odd number of wavelengths: destructive interference.",
      ],
      answer: "Quiet (a minimum).",
    },
    check: {
      question: "Two coherent in-phase sources produce a maximum at point P. What could the path difference to P be?",
      options: ["λ/2", "3λ/2", "2λ", "5λ/4"],
      correctIndex: 2,
      explanation: "Whole numbers of wavelengths give constructive interference.",
    },
    apply: {
      prompt: "Explain why light from two separate lamps does not produce a visible interference pattern, but light from one lamp through two slits does.",
      modelAnswer: "Two separate lamps emit light in random, rapidly changing phases, so they are not coherent and the pattern shifts too fast to see. Light from one source through two slits comes from the same wavefront, so the two slits act as coherent sources with a constant phase difference.",
      successCriteria: ["Coherence: constant phase difference", "Two slits are derived from one source"],
    },
  },

  "wjec-alevel-physics.waves.sp-08": {
    explain: [
      "**Diffraction** is the spreading of a wave through a gap or round an obstacle. It is most noticeable when the gap is about the size of the wavelength.",
      "Through a single slit, light forms a wide, bright **central maximum** (twice as wide as the others) with dimmer side maxima. The first minimum is at sin θ = λ/a, where a is the slit width.",
      "A **narrower slit** or a **longer wavelength** gives a **wider** pattern.",
      "In a double-slit experiment each slit also diffracts, so the bright interference fringes are brightest in the middle and fade according to the single-slit pattern (the diffraction envelope).",
    ],
    worked: {
      prompt: "Laser light of 633 nm passes through a slit 0.10 mm wide onto a screen 2.0 m away. Find the width of the central maximum.",
      steps: [
        "First minimum: sin θ ≈ θ = λ/a = 633 × 10⁻⁹ / 0.10 × 10⁻³ = 6.33 × 10⁻³ rad.",
        "Distance from the centre to the first minimum = 2.0 × 6.33 × 10⁻³ = 12.7 mm.",
        "The central maximum spans both sides: 25 mm.",
      ],
      answer: "About 25 mm.",
    },
    check: {
      question: "The slit in a single-slit experiment is made narrower. What happens to the central maximum?",
      options: ["It gets narrower and brighter", "It gets wider", "It disappears", "It is unchanged"],
      correctIndex: 1,
      explanation: "sin θ = λ/a: smaller a gives a larger angle, so the pattern spreads out (and gets dimmer).",
    },
    apply: {
      prompt: "Explain why you can hear someone talking round a doorway but cannot see them.",
      modelAnswer: "A doorway is about 1 m wide. Sound wavelengths are of the order of a metre, similar to the gap, so sound diffracts significantly round it. Light wavelengths are about 5 × 10⁻⁷ m, far smaller than the gap, so light diffracts very little.",
      successCriteria: ["Compares wavelengths with the gap size", "Significant diffraction when they are similar"],
    },
  },

  "wjec-alevel-physics.quantum.sp-01": {
    explain: [
      "Light arrives in **photons**, each with energy E = hf = hc/λ.",
      "In the photoelectric effect one photon gives all its energy to one electron. **Einstein's equation:** hf = φ + E_k(max), where φ is the work function (the minimum energy needed to free an electron from the surface).",
      "Electrons from below the surface need more than φ, so φ gives the **maximum** kinetic energy. Work in joules, or in electronvolts (1 eV = 1.60 × 10⁻¹⁹ J).",
    ],
    worked: {
      prompt: "Light of wavelength 400 nm falls on a metal with work function 2.30 eV. Find the maximum kinetic energy of the photoelectrons.",
      steps: [
        "Photon energy = hc/λ = 6.63 × 10⁻³⁴ × 3.00 × 10⁸ / 400 × 10⁻⁹ = 4.97 × 10⁻¹⁹ J = 3.11 eV.",
        "E_k(max) = hf − φ = 3.11 − 2.30 = 0.81 eV.",
        "In joules: 0.81 × 1.60 × 10⁻¹⁹ = 1.3 × 10⁻¹⁹ J.",
      ],
      answer: "0.81 eV (1.3 × 10⁻¹⁹ J).",
    },
    check: {
      question: "Why is the kinetic energy in Einstein's equation a maximum rather than the energy of every electron?",
      options: [
        "Some photons have less energy than others of the same frequency",
        "Some electrons lose energy escaping from below the surface",
        "The intensity varies across the surface",
        "The work function changes with time",
      ],
      correctIndex: 1,
      explanation: "All photons of one frequency carry the same energy; electrons deeper in the metal need more than φ to escape, so they leave with less.",
    },
    apply: {
      prompt: "Ultraviolet light of frequency 1.2 × 10¹⁵ Hz releases electrons with maximum kinetic energy 2.1 × 10⁻¹⁹ J. Calculate the work function in eV.",
      modelAnswer: "hf = 6.63 × 10⁻³⁴ × 1.2 × 10¹⁵ = 7.96 × 10⁻¹⁹ J. φ = 7.96 × 10⁻¹⁹ − 2.1 × 10⁻¹⁹ = 5.86 × 10⁻¹⁹ J = 5.86 × 10⁻¹⁹ / 1.60 × 10⁻¹⁹ = 3.7 eV.",
      successCriteria: ["Photon energy 7.96 × 10⁻¹⁹ J", "Subtracts the kinetic energy", "Converts to 3.7 eV"],
    },
  },

  "wjec-alevel-physics.quantum.sp-02": {
    explain: [
      "Each electron absorbs **one** photon. If hf is less than the work function, that single photon cannot free the electron, however many photons arrive.",
      "The **threshold frequency** f₀ = φ/h is the minimum frequency that causes emission.",
      "A wave model predicts that bright enough light of any frequency should eventually release electrons. Experiment shows no emission below f₀ at any intensity, and emission is instant above it: evidence for photons.",
    ],
    worked: {
      prompt: "A metal has work function 2.30 eV. Find its threshold frequency.",
      steps: ["φ = 2.30 × 1.60 × 10⁻¹⁹ = 3.68 × 10⁻¹⁹ J.", "f₀ = φ/h = 3.68 × 10⁻¹⁹ / 6.63 × 10⁻³⁴ = 5.55 × 10¹⁴ Hz."],
      answer: "5.6 × 10¹⁴ Hz.",
    },
    check: {
      question: "Red light shining on a metal releases no electrons. What happens if the red light is made ten times brighter?",
      options: [
        "Electrons are released after a delay",
        "Still no electrons are released",
        "Electrons are released with more kinetic energy",
        "Ten times as many electrons are released",
      ],
      correctIndex: 1,
      explanation: "Brighter light means more photons, but each still has too little energy (hf < φ), so none are released.",
    },
    apply: {
      prompt: "Explain why the existence of a threshold frequency supports the photon model and not the wave model of light.",
      modelAnswer: "In the photon model, one photon gives its energy to one electron, so emission depends on whether hf ≥ φ: below the threshold frequency no single photon has enough energy, whatever the intensity. In a wave model energy would build up continuously, so intense light of any frequency should eventually release electrons, which is not observed.",
      successCriteria: ["One photon to one electron", "hf must reach φ", "Wave model predicts emission at any frequency eventually"],
    },
  },

  "wjec-alevel-physics.quantum.sp-03": {
    explain: [
      "**Intensity** is the power per unit area. For light of a fixed frequency, higher intensity means **more photons per second**, not more energy per photon.",
      "So increasing the intensity (above the threshold) increases the **number** of electrons emitted per second (the photocurrent), but not their maximum kinetic energy.",
      "Increasing the **frequency** increases each photon's energy, so it increases E_k(max) but not, by itself, the number of electrons.",
    ],
    worked: {
      prompt: "Blue light releases photoelectrons from a metal. The intensity is doubled at the same frequency. What happens to the photocurrent and the maximum kinetic energy?",
      steps: [
        "Double intensity at the same frequency: twice as many photons per second, each with the same energy.",
        "Twice as many electrons emitted per second: the photocurrent doubles.",
        "Each photon's energy is unchanged, so E_k(max) = hf − φ is unchanged.",
      ],
      answer: "The current doubles; the maximum kinetic energy is unchanged.",
    },
    check: {
      question: "Increasing the frequency of the light (above the threshold) at constant number of photons per second mainly changes what?",
      options: [
        "The number of electrons emitted per second",
        "The maximum kinetic energy of the electrons",
        "The work function",
        "Nothing",
      ],
      correctIndex: 1,
      explanation: "Higher frequency means higher photon energy hf, so E_k(max) = hf − φ increases.",
    },
    apply: {
      prompt: "Sketch-describe how the maximum kinetic energy of photoelectrons varies with frequency, and state what the gradient and intercept represent.",
      modelAnswer: "E_k(max) is zero up to the threshold frequency, then rises in a straight line. The gradient is the Planck constant h; the intercept on the frequency axis is f₀, and extending the line back to the energy axis gives −φ.",
      successCriteria: ["Straight line from f₀", "Gradient = h", "Intercepts give f₀ and −φ"],
    },
  },

  "wjec-alevel-physics.quantum.sp-04": {
    explain: [
      "**De Broglie:** any particle with momentum p has a wavelength λ = h/p = h/mv.",
      "**Electron diffraction** is the evidence: a beam of electrons fired through a thin graphite film produces rings on a screen, a diffraction pattern, which only waves can make.",
      "Diffraction is noticeable because the electrons' wavelength is similar to the spacing between atoms in the graphite (about 10⁻¹⁰ m).",
      "Electrons therefore show **wave–particle duality**: they diffract like waves but are detected as individual particles.",
    ],
    worked: {
      prompt: "An electron travels at 7.3 × 10⁶ m s⁻¹. Find its de Broglie wavelength (m_e = 9.11 × 10⁻³¹ kg).",
      steps: ["p = mv = 9.11 × 10⁻³¹ × 7.3 × 10⁶ = 6.65 × 10⁻²⁴ kg m s⁻¹.", "λ = h/p = 6.63 × 10⁻³⁴ / 6.65 × 10⁻²⁴ = 1.0 × 10⁻¹⁰ m."],
      answer: "1.0 × 10⁻¹⁰ m, similar to atomic spacing.",
    },
    check: {
      question: "In electron diffraction through graphite, the electrons are accelerated to a higher speed. What happens to the rings?",
      options: ["They get larger", "They get smaller", "They disappear", "They do not change"],
      correctIndex: 1,
      explanation: "Higher speed means more momentum and a shorter wavelength, so the electrons diffract less and the rings shrink.",
    },
    apply: {
      prompt: "Explain why a cricket ball shows no observable diffraction although it has a de Broglie wavelength.",
      modelAnswer: "A 0.16 kg ball at 30 m s⁻¹ has p = 4.8 kg m s⁻¹, so λ = h/p ≈ 1.4 × 10⁻³⁴ m. This is vastly smaller than any gap it could pass through, so diffraction is far too small to observe.",
      successCriteria: ["Large momentum → tiny wavelength", "Wavelength far smaller than any gap"],
    },
  },

  "wjec-alevel-physics.quantum.sp-05": {
    explain: [
      "To find an electron's wavelength after acceleration through a p.d. V: kinetic energy E_k = eV, momentum p = √(2mE_k), then λ = h/p.",
      "So λ = h/√(2meV): a larger accelerating voltage gives a shorter wavelength.",
      "Diffraction ring angles follow the grating idea d sin θ ≈ nλ, so measuring ring sizes and knowing λ lets you estimate atomic spacings.",
    ],
    worked: {
      prompt: "Electrons are accelerated through 150 V. Find their de Broglie wavelength.",
      steps: [
        "E_k = eV = 1.60 × 10⁻¹⁹ × 150 = 2.40 × 10⁻¹⁷ J.",
        "p = √(2mE_k) = √(2 × 9.11 × 10⁻³¹ × 2.40 × 10⁻¹⁷) = 6.61 × 10⁻²⁴ kg m s⁻¹.",
        "λ = h/p = 6.63 × 10⁻³⁴ / 6.61 × 10⁻²⁴ = 1.0 × 10⁻¹⁰ m.",
      ],
      answer: "1.0 × 10⁻¹⁰ m.",
    },
    check: {
      question: "The accelerating voltage for an electron beam is multiplied by 4. By what factor does the de Broglie wavelength change?",
      options: ["× 4", "× 2", "× ½", "× ¼"],
      correctIndex: 2,
      explanation: "λ = h/√(2meV) ∝ 1/√V, so × 4 in V gives × ½ in λ.",
    },
    apply: {
      prompt: "Electron diffraction rings get smaller as the accelerating voltage increases. Explain this observation.",
      modelAnswer: "Higher voltage gives the electrons more kinetic energy and momentum, so their de Broglie wavelength h/p is shorter. With a shorter wavelength relative to the atomic spacing they diffract through smaller angles, so the rings are smaller.",
      successCriteria: ["More momentum → shorter λ", "Shorter λ → smaller diffraction angle"],
    },
  },

  "wjec-alevel-physics.quantum.sp-06": {
    explain: [
      "Electrons in atoms can only have certain **discrete energy levels**. Levels are negative, measured from 0 for a freed electron; the lowest is the ground state.",
      "When an electron drops from a higher level to a lower one, a photon is **emitted** with energy equal to the difference: hf = E_upper − E_lower. Only certain differences exist, so a gas emits a **line spectrum**.",
      "An electron can **absorb** a photon only if its energy exactly matches a gap. White light through a cool gas shows **dark absorption lines** at those same frequencies.",
    ],
    worked: {
      prompt: "An atom has levels at −10.4 eV, −5.5 eV and −1.6 eV. How many different photon energies can it emit from the top level, and what are they?",
      steps: [
        "Possible drops: −1.6 → −5.5, −1.6 → −10.4 and −5.5 → −10.4.",
        "Energies: 3.9 eV, 8.8 eV and 4.9 eV.",
      ],
      answer: "Three lines: 3.9 eV, 4.9 eV and 8.8 eV.",
    },
    check: {
      question: "Why does a hot gas produce a line spectrum rather than a continuous one?",
      options: [
        "The gas only reflects certain colours",
        "Electrons can only move between discrete energy levels",
        "The atoms move at one speed",
        "Photons have a fixed wavelength in every atom",
      ],
      correctIndex: 1,
      explanation: "Only the energy differences between allowed levels can be emitted, so only certain photon frequencies appear.",
    },
    apply: {
      prompt: "Explain how the dark lines in the Sun's spectrum are produced.",
      modelAnswer: "The hot interior emits a continuous spectrum. Atoms in the cooler outer layers absorb photons whose energy exactly matches the gaps between their energy levels, exciting their electrons. They re-emit in all directions, so less light of those frequencies travels towards us, leaving dark lines.",
      successCriteria: ["Continuous source behind cooler gas", "Absorption at exact level differences", "Re-emission in all directions"],
    },
  },

  "wjec-alevel-physics.quantum.sp-07": {
    explain: [
      "The **electronvolt** is the energy an electron gains moving through 1 V: 1 eV = 1.60 × 10⁻¹⁹ J. Convert eV → J by multiplying by 1.60 × 10⁻¹⁹; J → eV by dividing.",
      "For a transition, ΔE = E_upper − E_lower (using the signed level values), then λ = hc/ΔE with ΔE in joules.",
      "**Ionisation energy** is the energy to take an electron from the ground state to 0 eV.",
    ],
    worked: {
      prompt: "In hydrogen the n = 3 level is −1.51 eV and the n = 2 level is −3.40 eV. Find the wavelength of the photon emitted when an electron drops from n = 3 to n = 2.",
      steps: [
        "ΔE = −1.51 − (−3.40) = 1.89 eV = 1.89 × 1.60 × 10⁻¹⁹ = 3.02 × 10⁻¹⁹ J.",
        "λ = hc/ΔE = 6.63 × 10⁻³⁴ × 3.00 × 10⁸ / 3.02 × 10⁻¹⁹ = 6.58 × 10⁻⁷ m.",
      ],
      answer: "658 nm (red light).",
    },
    check: {
      question: "The ground state of hydrogen is −13.6 eV. What is its ionisation energy in joules?",
      options: ["13.6 J", "2.18 × 10⁻¹⁸ J", "8.5 × 10¹⁹ J", "−13.6 eV"],
      correctIndex: 1,
      explanation: "13.6 × 1.60 × 10⁻¹⁹ = 2.18 × 10⁻¹⁸ J is needed to raise the electron to 0 eV.",
    },
    apply: {
      prompt: "An electron with 12.5 eV of kinetic energy collides with a hydrogen atom in its ground state (−13.6 eV). Levels are −3.40 eV (n = 2) and −1.51 eV (n = 3). Which levels can the atom be excited to, and how much energy does the electron keep in each case?",
      modelAnswer: "Excitation to n = 2 needs 10.2 eV, leaving the electron 2.3 eV. Excitation to n = 3 needs 12.09 eV, leaving 0.41 eV. The next level, n = 4 at −0.85 eV, would need 12.75 eV, which is more than the electron has, so it cannot be reached.",
      successCriteria: ["Energy gaps 10.2 eV and 12.09 eV", "Electron keeps the remainder (unlike a photon, it can lose part of its energy)"],
    },
  },

  "wjec-alevel-physics.electric-circuits.sp-01": {
    explain: [
      "**Current** is the rate of flow of charge: I = ΔQ/Δt (A = C s⁻¹). **Potential difference** is the energy transferred per unit charge: V = W/Q (V = J C⁻¹).",
      "**Resistance** R = V/I (Ω). **Resistivity** ρ = RA/L (Ω m) is a material property; resistance also depends on the wire's length and area.",
      "**Power** P = IV = I²R = V²/R. **Emf** ε is the energy transferred into electrical form per coulomb by a source.",
      "Series: same current, p.d.s add, R = R₁ + R₂. Parallel: same p.d., currents add, 1/R = 1/R₁ + 1/R₂.",
    ],
    worked: {
      prompt: "A 12 V battery drives a current of 2.0 A for 30 s. How much charge flows and how much energy is transferred?",
      steps: ["Q = It = 2.0 × 30 = 60 C.", "W = QV = 60 × 12 = 720 J."],
      answer: "60 C and 720 J.",
    },
    check: {
      question: "A wire is replaced by one of the same metal, twice as long with twice the cross-sectional area. Its resistance:",
      options: ["Doubles", "Halves", "Stays the same", "Quadruples"],
      correctIndex: 2,
      explanation: "R = ρL/A: doubling both L and A leaves R unchanged.",
    },
    apply: {
      prompt: "Explain the difference between emf and potential difference.",
      modelAnswer: "Emf is the energy transferred into electrical energy per unit charge by a source such as a cell. Potential difference is the energy transferred from electrical energy into other forms per unit charge as it passes through a component. Both are measured in volts (J C⁻¹).",
      successCriteria: ["Emf: energy given to charges by the source", "p.d.: energy taken from charges by a component", "Both per unit charge"],
    },
  },

  "wjec-alevel-physics.electric-circuits.sp-02": {
    explain: [
      "Reduce combinations step by step: work out each parallel group, then add series resistances.",
      "A real source has **internal resistance** r: ε = I(R + r), and the terminal p.d. V = ε − Ir falls as the current rises. The 'lost volts' Ir are wasted inside the source.",
      "In a **potential divider**, the output across R₂ is V_out = V_in × R₂/(R₁ + R₂).",
    ],
    worked: {
      prompt: "A 6.0 Ω and a 3.0 Ω resistor in parallel are in series with a 4.0 Ω resistor across a 12 V supply of negligible internal resistance. Find the current from the supply and in each parallel resistor.",
      steps: [
        "Parallel pair: 1/R = 1/6.0 + 1/3.0, so R = 2.0 Ω. Total = 2.0 + 4.0 = 6.0 Ω.",
        "Supply current = 12 / 6.0 = 2.0 A.",
        "p.d. across the pair = 2.0 × 2.0 = 4.0 V, so 4.0/6.0 = 0.67 A and 4.0/3.0 = 1.33 A.",
      ],
      answer: "2.0 A; 0.67 A through 6 Ω and 1.33 A through 3 Ω.",
    },
    check: {
      question: "A battery of emf 12 V and internal resistance 0.50 Ω is connected to a 5.5 Ω resistor. What is the terminal p.d.?",
      options: ["12 V", "11 V", "1.0 V", "6.0 V"],
      correctIndex: 1,
      explanation: "I = 12 / (5.5 + 0.50) = 2.0 A; V = ε − Ir = 12 − 2.0 × 0.50 = 11 V.",
    },
    apply: {
      prompt: "A potential divider uses a 10 kΩ resistor and a thermistor across 6.0 V, with the output across the thermistor. Explain what happens to the output as the temperature rises.",
      modelAnswer: "A (negative temperature coefficient) thermistor's resistance falls as temperature rises. Its share of the total resistance falls, so V_out = 6.0 × R_T/(R_T + 10 kΩ) falls.",
      successCriteria: ["Thermistor resistance falls with temperature", "Output p.d. is its share of the supply, so it falls"],
    },
  },

  "wjec-alevel-physics.electric-circuits.sp-03": {
    explain: [
      "Measuring the terminal p.d. V of a cell at several currents I lets you find its emf and internal resistance from V = ε − Ir.",
      "Plot V (y) against I (x): a straight line with **gradient −r** and **y-intercept ε**.",
      "When evaluating circuit results, look for points that do not fit the line, consider whether the cell's emf drifted (warming, discharging) and whether meter resolution limits precision.",
    ],
    worked: {
      prompt: "A cell gives a terminal p.d. of 1.42 V at 0.20 A and 1.26 V at 0.60 A. Find its internal resistance and emf.",
      steps: [
        "Gradient = (1.26 − 1.42) / (0.60 − 0.20) = −0.40 V A⁻¹, so r = 0.40 Ω.",
        "ε = V + Ir = 1.42 + 0.20 × 0.40 = 1.50 V.",
      ],
      answer: "r = 0.40 Ω; ε = 1.50 V.",
    },
    check: {
      question: "On a graph of terminal p.d. against current for a cell, what is the y-intercept?",
      options: ["The internal resistance", "The emf", "The maximum current", "The lost volts"],
      correctIndex: 1,
      explanation: "At I = 0 there are no lost volts, so V = ε.",
    },
    apply: {
      prompt: "A student's V–I results for a cell curve at high current. Suggest a reason and how to improve the experiment.",
      modelAnswer: "At high current the cell warms and its chemistry changes, so the internal resistance (or emf) changes during the experiment. Take readings quickly, switch off between readings, and include a fixed resistor to limit the maximum current.",
      successCriteria: ["Links curvature to r or ε changing", "A practical improvement such as switching off between readings or limiting current"],
    },
  },

  "wjec-alevel-physics.electric-circuits.sp-04": {
    explain: [
      "Power dissipated in a resistor: P = IV = I²R = V²/R. Choose the form that uses what you know.",
      "In series (same I) the larger resistor dissipates more power (I²R); in parallel (same V) the smaller resistor dissipates more (V²/R).",
      "**Efficiency** of an electrical device = useful energy output ÷ electrical energy input.",
    ],
    worked: {
      prompt: "A 2.0 kW, 230 V kettle heats 1.0 kg of water from 20 °C to 100 °C in 200 s. Find the current, the element's resistance and the kettle's efficiency (c = 4200 J kg⁻¹ K⁻¹).",
      steps: [
        "I = P/V = 2000 / 230 = 8.7 A; R = V²/P = 230² / 2000 = 26 Ω.",
        "Useful energy = mcΔT = 1.0 × 4200 × 80 = 3.36 × 10⁵ J.",
        "Input = 2000 × 200 = 4.0 × 10⁵ J, so efficiency = 3.36 / 4.0 = 84%.",
      ],
      answer: "8.7 A, 26 Ω, 84%.",
    },
    check: {
      question: "Two resistors, 2 Ω and 4 Ω, are in parallel across a battery. Which dissipates more power?",
      options: ["The 2 Ω resistor", "The 4 Ω resistor", "They are equal", "It depends on the current"],
      correctIndex: 0,
      explanation: "In parallel both have the same p.d., and P = V²/R, so the smaller resistance dissipates more power.",
    },
    apply: {
      prompt: "Explain why electricity is transmitted at high voltage, using P = I²R.",
      modelAnswer: "For a given power P = IV, a higher voltage means a smaller current. The power lost as heat in the cables is I²R, so reducing the current reduces the loss greatly (halving I quarters the loss).",
      successCriteria: ["Higher V → lower I for the same power", "Loss = I²R falls"],
    },
  },

  "wjec-alevel-physics.electric-circuits.sp-05": {
    explain: [
      "An **ohmic conductor** at constant temperature gives a straight-line I–V graph through the origin: constant resistance.",
      "A **filament lamp**'s graph curves and flattens: as the current rises the filament heats up, the metal ions vibrate more, and the resistance increases.",
      "A **diode** conducts in one direction only: almost no current until about 0.6 V forward (silicon), then current rises steeply; in reverse, almost no current.",
      "Resistance at a point is V/I at that point, **not** the gradient of the curve.",
    ],
    worked: {
      prompt: "A lamp carries 0.10 A at 1.0 V and 0.20 A at 4.0 V. Find its resistance at each point and explain the change.",
      steps: [
        "R = V/I: 1.0/0.10 = 10 Ω, and 4.0/0.20 = 20 Ω.",
        "The resistance doubles because the filament is hotter at the higher current: the ions vibrate more and impede the electrons more.",
      ],
      answer: "10 Ω then 20 Ω, rising with temperature.",
    },
    check: {
      question: "How do you find the resistance of a filament lamp at one point on its I–V graph?",
      options: ["The gradient of the tangent at that point", "V/I at that point", "The area under the graph", "1 / gradient of the whole line"],
      correctIndex: 1,
      explanation: "Resistance is defined as V/I at that point; for a curve the gradient gives something different.",
    },
    apply: {
      prompt: "Describe the I–V characteristic of a silicon diode and explain why diodes are used to protect circuits from a battery being connected the wrong way round.",
      modelAnswer: "In forward bias there is almost no current below about 0.6 V, then the current rises steeply. In reverse bias there is almost no current. In series with a circuit, a reversed battery puts the diode in reverse bias, so almost no current flows and the circuit is protected.",
      successCriteria: ["Threshold about 0.6 V forward", "Negligible reverse current", "Applies this to reverse-polarity protection"],
    },
  },

  "wjec-alevel-physics.electric-circuits.sp-06": {
    explain: [
      "A **potentiometer** is a long uniform resistance wire with a steady current from a driver cell, so the p.d. along it is proportional to length.",
      "A test cell is connected through a galvanometer to a sliding contact. At the **balance point** no current flows through the galvanometer, so the cell's p.d. equals the p.d. along that length of wire.",
      "Because no current is drawn at balance, the reading is the cell's **emf** (no lost volts). Comparing two cells: ε₁/ε₂ = l₁/l₂.",
    ],
    worked: {
      prompt: "A standard cell of emf 1.018 V balances at 50.9 cm. An unknown cell balances at 73.5 cm on the same wire. Find its emf.",
      steps: ["ε₂/ε₁ = l₂/l₁.", "ε₂ = 1.018 × 73.5 / 50.9 = 1.470 V."],
      answer: "1.47 V.",
    },
    check: {
      question: "Why does a potentiometer measure emf rather than terminal p.d.?",
      options: [
        "The wire has no resistance",
        "No current flows through the cell at the balance point, so there are no lost volts",
        "The galvanometer is very sensitive",
        "The driver cell has no internal resistance",
      ],
      correctIndex: 1,
      explanation: "With zero current, V = ε − Ir = ε.",
    },
    apply: {
      prompt: "Explain why the driver cell must have a larger emf than the cell being tested.",
      modelAnswer: "The p.d. across the whole wire comes from the driver cell. If the test cell's emf were larger than the p.d. across the full wire, no point on the wire would match it, so no balance point could be found.",
      successCriteria: ["The wire's p.d. must reach the test emf", "Otherwise no balance point exists"],
    },
  },

  "wjec-alevel-physics.electric-circuits.sp-07": {
    explain: [
      "**Random** errors scatter readings either side of the true value (reduce by repeating and averaging). **Systematic** errors shift every reading the same way (a meter zero error, contact resistance); repeating does not remove them.",
      "In electrical work, common issues are meter resolution, zero errors, resistance of leads and contacts, and components heating up during the experiment.",
      "For R = V/I, the percentage uncertainties add: %R = %V + %I.",
    ],
    worked: {
      prompt: "A resistor gives V = 2.40 ± 0.01 V and I = 0.300 ± 0.005 A. Find R and its absolute uncertainty.",
      steps: [
        "R = 2.40 / 0.300 = 8.0 Ω.",
        "%V = 0.01/2.40 = 0.42%; %I = 0.005/0.300 = 1.7%. Total = 2.1%.",
        "Absolute uncertainty = 2.1% of 8.0 Ω = 0.17 Ω.",
      ],
      answer: "8.0 ± 0.2 Ω.",
    },
    check: {
      question: "An ammeter reads 0.02 A before it is connected. What kind of error does this cause?",
      options: ["Random error", "Systematic (zero) error", "Parallax error", "No error"],
      correctIndex: 1,
      explanation: "Every reading is shifted by the same 0.02 A: a zero error, which is systematic. Subtract it from each reading.",
    },
    apply: {
      prompt: "A student measures the resistance of a wire with a large current. Suggest why the result is too high and how to improve the method.",
      modelAnswer: "A large current heats the wire, increasing its resistance while readings are taken. Use a smaller current (add a series resistor or lower the supply), and switch off between readings so the wire stays at room temperature.",
      successCriteria: ["Heating raises the resistance", "Smaller current and switching off between readings"],
    },
  },
};
