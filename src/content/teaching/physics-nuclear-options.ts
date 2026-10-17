import type { TeachingBySpecPoint } from "./types";

// WJEC A-level Physics: nuclear and particle physics, capacitance, alternating
// currents, the options, practical skills, orbits and electromagnetic
// induction. 1 u = 931.5 MeV, 1/4πε₀ = 8.99 × 10⁹ N m² C⁻².

export const physicsNuclearOptionsTeaching: TeachingBySpecPoint = {
  "wjec-alevel-physics.nuclear.sp-01": {
    explain: [
      "In **Rutherford scattering**, alpha particles are fired at a very thin gold foil and their deflections are counted.",
      "Most pass straight through: the atom is mostly **empty space**. A few are deflected through large angles and about 1 in 10 000 bounce back: there must be a tiny, dense, **positively charged nucleus** holding most of the mass.",
      "The plum-pudding model (positive charge spread through the atom) could not produce the large deflections, because no region would have a strong enough field.",
      "A head-on alpha particle stops at its distance of closest approach, where its kinetic energy has all become electric potential energy: this gives an upper limit on the nuclear radius.",
    ],
    worked: {
      prompt: "A 5.0 MeV alpha particle (charge +2e) approaches a gold nucleus (charge +79e) head on. Estimate the distance of closest approach.",
      steps: [
        "At closest approach, E_k = electric potential energy: E_k = (1/4πε₀) × (2e)(79e)/d.",
        "E_k = 5.0 × 10⁶ × 1.60 × 10⁻¹⁹ = 8.0 × 10⁻¹³ J.",
        "d = 8.99 × 10⁹ × 2 × 79 × (1.60 × 10⁻¹⁹)² / 8.0 × 10⁻¹³ = 4.5 × 10⁻¹⁴ m.",
      ],
      answer: "About 4.5 × 10⁻¹⁴ m, so the gold nucleus is smaller than this.",
    },
    check: {
      question: "Which observation showed that the positive charge in an atom is concentrated in a tiny nucleus?",
      options: [
        "Most alpha particles passed straight through",
        "A small fraction of alpha particles were deflected through large angles",
        "The foil became radioactive",
        "Alpha particles were absorbed by the foil",
      ],
      correctIndex: 1,
      explanation: "Only a small, concentrated charge produces a field strong enough to turn an alpha particle back; most passing straight through shows the atom is mostly empty.",
    },
    apply: {
      prompt: "Explain why the foil in Rutherford's experiment had to be very thin and the apparatus evacuated.",
      modelAnswer: "A very thin foil makes it likely each alpha particle is scattered by only one nucleus, so the deflections can be interpreted. The vacuum stops the alpha particles being absorbed or deflected by air molecules, since they have a range of only a few cm in air.",
      successCriteria: ["Thin foil: single scattering events", "Vacuum: alphas would be absorbed or scattered by air"],
    },
  },

  "wjec-alevel-physics.nuclear.sp-02": {
    explain: [
      "Nuclear radius depends on the nucleon number A: **r = r₀A^(1/3)**, with r₀ ≈ 1.2 fm (1 fm = 10⁻¹⁵ m).",
      "Since the volume ∝ r³ ∝ A, the volume is proportional to the number of nucleons: nucleons are packed at roughly constant density.",
      "So all nuclei have about the same density, around 10¹⁷ kg m⁻³, vastly greater than ordinary matter.",
    ],
    worked: {
      prompt: "Estimate the radii of aluminium-27 and a nucleus with A = 216.",
      steps: ["r(27) = 1.2 × 27^(1/3) = 1.2 × 3 = 3.6 fm.", "r(216) = 1.2 × 216^(1/3) = 1.2 × 6 = 7.2 fm."],
      answer: "3.6 fm and 7.2 fm: eight times the nucleons gives twice the radius.",
    },
    check: {
      question: "Nucleus Y has eight times as many nucleons as nucleus X. How do their densities compare?",
      options: ["Y is eight times denser", "Y is twice as dense", "They are about the same", "Y is half as dense"],
      correctIndex: 2,
      explanation: "Volume ∝ A and mass ∝ A, so density is independent of A.",
    },
    apply: {
      prompt: "Show that nuclear density is independent of nucleon number, and estimate it (nucleon mass 1.67 × 10⁻²⁷ kg, r₀ = 1.2 fm).",
      modelAnswer: "Mass ≈ A × 1.67 × 10⁻²⁷ kg. Volume = (4/3)πr³ = (4/3)πr₀³A. Density = A × 1.67 × 10⁻²⁷ / ((4/3)π × (1.2 × 10⁻¹⁵)³ × A); A cancels, giving about 2.3 × 10¹⁷ kg m⁻³.",
      successCriteria: ["Mass and volume both ∝ A", "A cancels", "≈ 2 × 10¹⁷ kg m⁻³"],
    },
  },

  "wjec-alevel-physics.nuclear.sp-03": {
    explain: [
      "**Activity** A is the number of decays per second (becquerel, Bq). The **decay constant** λ is the probability per second that a nucleus decays: A = λN.",
      "Decay is random and exponential: N = N₀e^(−λt), and likewise A = A₀e^(−λt).",
      "**Half-life** t½ is the time for N (or A) to halve: t½ = ln 2 / λ. After n half-lives, a fraction (½)ⁿ remains.",
    ],
    worked: {
      prompt: "Technetium-99m has a half-life of 6.0 h. A sample's activity is 400 MBq. Find λ, the activity after 24 h and the number of nuclei at the start.",
      steps: [
        "λ = ln 2 / (6.0 × 3600) = 3.2 × 10⁻⁵ s⁻¹.",
        "24 h = 4 half-lives, so A = 400 / 2⁴ = 25 MBq.",
        "N₀ = A₀/λ = 4.0 × 10⁸ / 3.2 × 10⁻⁵ = 1.2 × 10¹³ nuclei.",
      ],
      answer: "3.2 × 10⁻⁵ s⁻¹; 25 MBq; 1.2 × 10¹³ nuclei.",
    },
    check: {
      question: "A source's activity falls from 800 Bq to 100 Bq in 30 minutes. What is its half-life?",
      options: ["3.75 min", "10 min", "15 min", "30 min"],
      correctIndex: 1,
      explanation: "800 → 400 → 200 → 100 is three half-lives in 30 min, so t½ = 10 min.",
    },
    apply: {
      prompt: "Explain what it means to say radioactive decay is random and spontaneous, and why the half-life is still predictable.",
      modelAnswer: "Random: you cannot predict which nucleus will decay next or when; each has a fixed probability per second, λ. Spontaneous: decay is not affected by external conditions such as temperature or pressure. With very large numbers of nuclei, the fraction decaying per second is reliably λ, so the half-life of a large sample is predictable.",
      successCriteria: ["Random: individual decay unpredictable, constant probability", "Spontaneous: unaffected by conditions", "Large numbers make the statistics reliable"],
    },
    trap: {
      wrong: "Using a half-life in hours with λ in s⁻¹ (or mixing units in e^(−λt)).",
      right: "Keep λ and t in matching units: λt must be dimensionless.",
    },
  },

  "wjec-alevel-physics.nuclear.sp-04": {
    explain: [
      "The mass of a nucleus is **less** than the total mass of its separate protons and neutrons. The difference is the **mass defect** Δm.",
      "**Binding energy** is the energy needed to separate a nucleus completely into its nucleons. It equals the mass defect times c²: ΔE = Δmc².",
      "In atomic mass units, 1 u corresponds to 931.5 MeV, so binding energy (MeV) = Δm (u) × 931.5.",
    ],
    worked: {
      prompt: "A helium-4 nucleus has mass 4.001506 u. Proton mass = 1.007276 u, neutron mass = 1.008665 u. Find its binding energy and binding energy per nucleon.",
      steps: [
        "Mass of separate nucleons = 2 × 1.007276 + 2 × 1.008665 = 4.031882 u.",
        "Mass defect = 4.031882 − 4.001506 = 0.030376 u.",
        "Binding energy = 0.030376 × 931.5 = 28.3 MeV, so 7.07 MeV per nucleon.",
      ],
      answer: "28.3 MeV; 7.1 MeV per nucleon.",
    },
    check: {
      question: "What does a nucleus's binding energy represent?",
      options: [
        "The energy stored in the nucleus that it releases continuously",
        "The energy needed to separate it completely into its individual nucleons",
        "The kinetic energy of its nucleons",
        "The energy of its electrons",
      ],
      correctIndex: 1,
      explanation: "Binding energy is the energy you must supply to pull the nucleus apart; it is equivalent to the mass defect.",
    },
    apply: {
      prompt: "Explain why a nucleus has less mass than its separated nucleons.",
      modelAnswer: "When nucleons bind together, energy is released (work is done by the strong force pulling them together). Since energy and mass are equivalent (ΔE = Δmc²), the bound system has less energy and therefore less mass than the separate nucleons; the missing mass is the mass defect.",
      successCriteria: ["Energy released on binding", "Mass–energy equivalence ΔE = Δmc²"],
    },
  },

  "wjec-alevel-physics.nuclear.sp-05": {
    explain: [
      "The **binding energy per nucleon** curve rises steeply for light nuclei, peaks near iron-56 (about 8.8 MeV per nucleon), then falls slowly for heavy nuclei.",
      "Energy is released when a reaction moves nuclei **towards the peak**, because the products are more tightly bound than the reactants.",
      "**Fusion** joins light nuclei (left of the peak); **fission** splits heavy nuclei (right of the peak). Energy released = total binding energy of products − total binding energy of reactants.",
    ],
    worked: {
      prompt: "Uranium-235 (7.6 MeV per nucleon) absorbs a neutron and splits into two fragments averaging 8.5 MeV per nucleon. Estimate the energy released.",
      steps: [
        "About 236 nucleons are involved.",
        "Gain in binding energy per nucleon ≈ 8.5 − 7.6 = 0.9 MeV.",
        "Energy released ≈ 236 × 0.9 ≈ 210 MeV.",
      ],
      answer: "Around 200 MeV per fission.",
    },
    check: {
      question: "Why does fusion of iron nuclei not release energy?",
      options: [
        "Iron is not radioactive",
        "Iron is at the peak of the binding-energy-per-nucleon curve, so fused products are less tightly bound",
        "Iron nuclei are too large to touch",
        "Iron has no neutrons",
      ],
      correctIndex: 1,
      explanation: "Beyond the peak, larger nuclei have lower binding energy per nucleon, so fusing iron would absorb energy.",
    },
    apply: {
      prompt: "Explain why fusion requires extremely high temperatures but fission does not.",
      modelAnswer: "Fusion needs two positively charged nuclei to get close enough for the strong force to act, so they must have enough kinetic energy to overcome their electrostatic repulsion: this needs temperatures of about 10⁷ K or more. Fission is triggered by absorbing an uncharged neutron, which is not repelled, so it can occur at ordinary temperatures.",
      successCriteria: ["Electrostatic repulsion between nuclei in fusion", "High kinetic energy, so high temperature", "Neutron is uncharged in fission"],
    },
  },

  "wjec-alevel-physics.nuclear.sp-06": {
    explain: [
      "**Hadrons** are made of quarks and feel the strong force. **Baryons** have three quarks (proton uud, neutron udd); **mesons** have a quark and an antiquark (π⁺ = u d̄).",
      "Quark charges: up +⅔e, down −⅓e. Each quark has baryon number ⅓, each antiquark −⅓.",
      "In every interaction, **charge**, **baryon number** and **lepton number** are conserved. Leptons (electron, muon, neutrinos) are not made of quarks.",
    ],
    worked: {
      prompt: "Check the quark structure of the proton (uud) and neutron (udd) gives the right charges.",
      steps: ["Proton: +⅔ + ⅔ − ⅓ = +1.", "Neutron: +⅔ − ⅓ − ⅓ = 0."],
      answer: "+1e and 0, as required.",
    },
    check: {
      question: "Can the reaction p + p → p + π⁺ happen?",
      options: [
        "Yes, all quantities are conserved",
        "No: baryon number is not conserved (2 before, 1 after)",
        "No: charge is not conserved",
        "No: lepton number is not conserved",
      ],
      correctIndex: 1,
      explanation: "Charge: +2 before, +1 + 1 = +2 after (fine). Baryon number: 2 before, 1 after (a pion has baryon number 0), so it is forbidden.",
    },
    apply: {
      prompt: "Classify the π⁰, the neutron and the electron as baryon, meson or lepton, and state how many quarks each contains.",
      modelAnswer: "π⁰ is a meson: one quark and one antiquark (two in total). The neutron is a baryon: three quarks (udd). The electron is a lepton: it contains no quarks, being a fundamental particle.",
      successCriteria: ["Meson: quark + antiquark", "Baryon: three quarks", "Lepton: no quarks"],
    },
  },

  "wjec-alevel-physics.nuclear.sp-07": {
    explain: [
      "In **β⁻ decay** a neutron in the nucleus changes into a proton, emitting an electron and an electron **antineutrino**: n → p + e⁻ + ν̄ₑ.",
      "At quark level, a down quark turns into an up quark (udd → uud); this is a **weak interaction**.",
      "Conservation checks: charge 0 → +1 − 1 + 0; baryon number 1 → 1; lepton number 0 → 0 + 1 − 1. The antineutrino is needed for lepton number (and to carry energy, explaining the spread of beta energies).",
      "The nucleus keeps its nucleon number A, and its proton number Z rises by 1.",
    ],
    worked: {
      prompt: "Carbon-14 undergoes β⁻ decay. Write the equation and identify the daughter nucleus.",
      steps: ["A stays 14; Z goes from 6 to 7, which is nitrogen.", "¹⁴₆C → ¹⁴₇N + e⁻ + ν̄ₑ."],
      answer: "Nitrogen-14.",
    },
    check: {
      question: "Why must an antineutrino (rather than a neutrino) be emitted in β⁻ decay?",
      options: [
        "To conserve charge",
        "To conserve lepton number, since the electron has lepton number +1",
        "To conserve baryon number",
        "To conserve mass",
      ],
      correctIndex: 1,
      explanation: "Lepton number is 0 before; the electron is +1, so an antilepton (−1) is needed to keep the total at 0.",
    },
    apply: {
      prompt: "Explain how the continuous spread of electron energies in β⁻ decay led to the prediction of the neutrino.",
      modelAnswer: "Each decay releases a fixed amount of energy, so if only the electron and nucleus shared it, every electron would have the same kinetic energy. Instead the energies range continuously up to a maximum, so a third, undetected particle (the (anti)neutrino) must carry away the rest of the energy and momentum.",
      successCriteria: ["Fixed decay energy", "Electrons have a range of energies", "A third particle shares the energy"],
    },
  },

  "wjec-alevel-physics.capacitance.sp-01": {
    explain: [
      "**Capacitance** is the charge stored per unit potential difference: C = Q/V. Unit: farad (F = C V⁻¹). Practical values are µF, nF or pF.",
      "For a parallel-plate capacitor: C = ε₀εᵣA/d. Capacitance increases with plate **area** A and the **permittivity** of the dielectric, and decreases with plate **separation** d.",
      "A dielectric increases C because its molecules polarise, reducing the field and p.d. between the plates for the same charge.",
    ],
    worked: {
      prompt: "Two square plates of side 10 cm are 1.0 mm apart in air (ε₀ = 8.85 × 10⁻¹² F m⁻¹). Find the capacitance and the charge at 12 V.",
      steps: [
        "A = 0.10 × 0.10 = 0.010 m².",
        "C = ε₀A/d = 8.85 × 10⁻¹² × 0.010 / 1.0 × 10⁻³ = 8.85 × 10⁻¹¹ F (88.5 pF).",
        "Q = CV = 8.85 × 10⁻¹¹ × 12 = 1.1 × 10⁻⁹ C.",
      ],
      answer: "88.5 pF; 1.1 nC.",
    },
    check: {
      question: "The plate separation of a parallel-plate capacitor is doubled. Its capacitance:",
      options: ["Doubles", "Halves", "Is unchanged", "Quadruples"],
      correctIndex: 1,
      explanation: "C = ε₀εᵣA/d, so doubling d halves C.",
    },
    apply: {
      prompt: "A slab of dielectric with εᵣ = 4.0 fills the gap of an isolated charged capacitor. Explain what happens to its capacitance and to the p.d. across it.",
      modelAnswer: "C = ε₀εᵣA/d, so C becomes 4 times larger. The capacitor is isolated, so Q stays constant; V = Q/C falls to a quarter of its original value.",
      successCriteria: ["C × 4", "Q constant when isolated", "V falls to a quarter"],
    },
  },

  "wjec-alevel-physics.capacitance.sp-02": {
    explain: [
      "Energy stored by a capacitor: **E = ½QV = ½CV² = Q²/2C**.",
      "The ½ appears because the p.d. rises from 0 to V as the charge builds up: the energy is the area under a graph of V against Q, a triangle.",
      "When charging from a battery, the battery supplies QV but the capacitor stores only ½QV: the other half is dissipated in the resistance of the circuit.",
    ],
    worked: {
      prompt: "A 470 µF capacitor is charged to 12 V. How much energy does it store?",
      steps: ["E = ½CV² = ½ × 470 × 10⁻⁶ × 12² = 0.034 J."],
      answer: "0.034 J (34 mJ).",
    },
    check: {
      question: "The p.d. across a capacitor is doubled. The energy stored:",
      options: ["Doubles", "Halves", "Quadruples", "Is unchanged"],
      correctIndex: 2,
      explanation: "E = ½CV², so × 2 in V gives × 4 in E.",
    },
    apply: {
      prompt: "A camera flash capacitor of 220 µF is charged to 300 V and discharged in 1.0 ms. Calculate the energy and the average power of the flash.",
      modelAnswer: "E = ½ × 220 × 10⁻⁶ × 300² = 9.9 J. Average power = 9.9 / 1.0 × 10⁻³ = 9.9 kW.",
      successCriteria: ["9.9 J", "≈ 10 kW"],
    },
    trap: {
      wrong: "Using E = QV for the energy stored by a capacitor.",
      right: "The p.d. rises as charge is added, so the energy is the triangle's area, ½QV.",
    },
  },

  "wjec-alevel-physics.capacitance.sp-03": {
    explain: [
      "Capacitors in **parallel** have the same p.d. and their charges add: C = C₁ + C₂.",
      "Capacitors in **series** carry the same charge and their p.d.s add: 1/C = 1/C₁ + 1/C₂. The total is smaller than the smallest one.",
      "These are the reverse of the resistor rules.",
    ],
    worked: {
      prompt: "Find the combined capacitance of 2.0 µF and 3.0 µF in series and in parallel.",
      steps: ["Series: 1/C = 1/2.0 + 1/3.0 = 5/6, so C = 1.2 µF.", "Parallel: C = 2.0 + 3.0 = 5.0 µF."],
      answer: "1.2 µF in series; 5.0 µF in parallel.",
    },
    check: {
      question: "Two identical capacitors are connected in series. The combined capacitance is:",
      options: ["Twice one capacitor", "The same as one", "Half of one", "A quarter of one"],
      correctIndex: 2,
      explanation: "1/C = 2/C₁, so C = C₁/2.",
    },
    apply: {
      prompt: "A 3.0 V output is needed from a 15 V supply using two capacitors in series, with the output across the larger one, which is 1.0 µF. Find the other capacitance and the charge on each.",
      modelAnswer: "In series both carry the same charge, so V ∝ 1/C and the larger capacitor takes the smaller share: 3.0 V across 1.0 µF gives Q = 1.0 × 10⁻⁶ × 3.0 = 3.0 µC. The other has 15 − 3.0 = 12 V, so C = 3.0 µC / 12 V = 0.25 µF.",
      successCriteria: ["Same charge in series", "Q = 3.0 µC", "C = 0.25 µF"],
    },
  },

  "wjec-alevel-physics.capacitance.sp-04": {
    explain: [
      "Discharging through a resistor: the charge, p.d. and current all fall **exponentially**: Q = Q₀e^(−t/RC).",
      "The **time constant** τ = RC (in seconds when R is in Ω and C in F). After one time constant, Q has fallen to e⁻¹ ≈ 0.37 of its starting value.",
      "Charging: V = V₀(1 − e^(−t/RC)); after τ, the capacitor is about 63% charged. The time to halve during discharge is τ ln 2 ≈ 0.69RC.",
      "A graph of ln V against t during discharge is a straight line with gradient −1/RC.",
    ],
    worked: {
      prompt: "A 470 µF capacitor discharges through 10 kΩ. Find the time constant, the fraction of charge left after one time constant, and the time to halve.",
      steps: ["τ = RC = 10 × 10³ × 470 × 10⁻⁶ = 4.7 s.", "After τ: e⁻¹ ≈ 0.37 of the charge remains.", "Halving time = τ ln 2 = 4.7 × 0.693 = 3.3 s."],
      answer: "4.7 s; 0.37; 3.3 s.",
    },
    check: {
      question: "A student plots ln V against t for a discharging capacitor and finds a straight line of gradient −0.25 s⁻¹. What is RC?",
      options: ["0.25 s", "4.0 s", "−4.0 s", "0.69 s"],
      correctIndex: 1,
      explanation: "ln V = ln V₀ − t/RC, so the gradient is −1/RC: RC = 1/0.25 = 4.0 s.",
    },
    apply: {
      prompt: "Explain why the discharge current falls with time.",
      modelAnswer: "The current I = V/R depends on the capacitor's p.d. As charge flows off, Q and so V = Q/C fall, so the current falls too. The rate of loss of charge is proportional to the charge remaining, which gives exponential decay.",
      successCriteria: ["I = V/R with V = Q/C", "Less charge → smaller current", "Rate ∝ amount remaining: exponential"],
    },
  },

  "wjec-alevel-physics.alternating-currents.sp-01": {
    explain: [
      "An alternating p.d. varies sinusoidally: V = V₀ sin ωt. V₀ is the **peak** value; the peak-to-peak value is 2V₀.",
      "The **rms** value is the steady (d.c.) value that would dissipate the same average power in a resistor. For a sinusoid: V_rms = V₀/√2 and I_rms = I₀/√2.",
      "Mean power in a resistor = V_rms × I_rms = I_rms²R. Mains is quoted as an rms value (230 V in the UK).",
    ],
    worked: {
      prompt: "UK mains is 230 V rms. Find the peak voltage and the peak-to-peak voltage.",
      steps: ["V₀ = √2 × V_rms = 1.414 × 230 = 325 V.", "Peak-to-peak = 2 × 325 = 650 V."],
      answer: "325 V peak; 650 V peak-to-peak.",
    },
    check: {
      question: "An oscilloscope shows a sine wave 6.8 divisions from peak to trough at 2.0 V per division. What is the rms voltage?",
      options: ["13.6 V", "6.8 V", "4.8 V", "9.6 V"],
      correctIndex: 2,
      explanation: "Peak-to-peak = 13.6 V, so V₀ = 6.8 V and V_rms = 6.8/√2 = 4.8 V.",
    },
    apply: {
      prompt: "Explain why the rms value, not the mean value, is used to describe an alternating current.",
      modelAnswer: "The mean of a sinusoidal current over a cycle is zero, which says nothing about its heating effect. Power ∝ I², which is always positive; the rms value is the square root of the mean of I², so it gives the d.c. current with the same average heating effect.",
      successCriteria: ["Mean current is zero", "Power depends on I²", "rms gives the equivalent d.c. heating"],
    },
  },

  "wjec-alevel-physics.alternating-currents.sp-02": {
    explain: [
      "A capacitor's opposition to a.c., its **reactance**, is X_C = 1/(2πfC): it falls as frequency rises. An inductor's is X_L = 2πfL: it rises with frequency.",
      "In a capacitor the current **leads** the p.d. by 90°; in an inductor the current **lags** by 90°. In a resistor they are in phase.",
      "In a series RCL circuit the impedance is Z = √(R² + (X_L − X_C)²), and the current is I_rms = V_rms/Z.",
    ],
    worked: {
      prompt: "Find the reactance of a 10 µF capacitor at 50 Hz and at 500 Hz.",
      steps: ["X_C = 1/(2π × 50 × 10 × 10⁻⁶) = 318 Ω.", "At 500 Hz the frequency is 10 times higher, so X_C = 31.8 Ω."],
      answer: "318 Ω and 32 Ω.",
    },
    check: {
      question: "In a circuit containing only a capacitor, how is the current related to the p.d.?",
      options: ["In phase", "Current leads by 90°", "Current lags by 90°", "Current leads by 180°"],
      correctIndex: 1,
      explanation: "The current is greatest when the p.d. is changing fastest (passing zero), so it peaks a quarter cycle before the p.d.",
    },
    apply: {
      prompt: "Explain how a capacitor in series with a loudspeaker can block low-frequency sound from reaching a small 'tweeter'.",
      modelAnswer: "X_C = 1/(2πfC) is large at low frequency, so the capacitor allows little low-frequency current through, while at high frequency its reactance is small and the current passes easily. The tweeter therefore receives mainly the high frequencies it is designed for.",
      successCriteria: ["X_C large at low frequency", "Small at high frequency", "Acts as a high-pass filter"],
    },
  },

  "wjec-alevel-physics.alternating-currents.sp-03": {
    explain: [
      "A transformer works only with **alternating** current: a changing current in the primary produces a changing flux in the iron core, which induces an emf in the secondary.",
      "Ideal transformer: V_s/V_p = N_s/N_p, and with no losses V_pI_p = V_sI_s.",
      "Power is transmitted at high voltage so the current is low and the cable loss I²R is small. Step-up transformers raise the voltage at power stations; step-down transformers lower it for use.",
    ],
    worked: {
      prompt: "1.0 MW is sent through cables of total resistance 10 Ω. Compare the power lost at 400 kV and at 11 kV.",
      steps: [
        "At 400 kV: I = 1.0 × 10⁶ / 400 × 10³ = 2.5 A; loss = 2.5² × 10 = 62.5 W.",
        "At 11 kV: I = 1.0 × 10⁶ / 11 × 10³ = 91 A; loss = 91² × 10 = 83 kW.",
      ],
      answer: "63 W against 83 kW: the high voltage loses far less.",
    },
    check: {
      question: "Why does a transformer not work with steady d.c.?",
      options: [
        "D.c. cannot flow through a coil",
        "A steady current gives a constant flux, so no emf is induced in the secondary",
        "The core would melt",
        "D.c. has no voltage",
      ],
      correctIndex: 1,
      explanation: "Induction needs a changing flux linkage; a steady current produces a constant flux.",
    },
    apply: {
      prompt: "A transformer steps 230 V down to 12 V. The primary has 2300 turns. How many turns does the secondary need, and what primary current flows when the secondary supplies 2.0 A (assume ideal)?",
      modelAnswer: "N_s = N_p × V_s/V_p = 2300 × 12/230 = 120 turns. Ideal: V_pI_p = V_sI_s, so I_p = 12 × 2.0 / 230 = 0.10 A.",
      successCriteria: ["120 turns", "I_p ≈ 0.10 A"],
    },
  },

  "wjec-alevel-physics.alternating-currents.sp-04": {
    explain: [
      "In a series RCL circuit, X_L and X_C cancel when they are equal. This happens at the **resonant frequency** f₀ = 1/(2π√(LC)), where the impedance is a minimum (just R) and the current is a maximum.",
      "The **bandwidth** is the range of frequencies over which the response stays high (between the points where the power falls to half its peak).",
      "The **Q factor** = f₀/bandwidth measures how sharp the resonance is. More resistance means more damping: a lower, broader peak and a smaller Q.",
      "Tuning circuits in radios use a high Q so they select one station's frequency.",
    ],
    worked: {
      prompt: "A circuit has L = 10 mH and C = 1.0 µF. Find the resonant frequency. If the bandwidth is 80 Hz, find Q.",
      steps: ["f₀ = 1/(2π√(10 × 10⁻³ × 1.0 × 10⁻⁶)) = 1/(2π × 1.0 × 10⁻⁴) = 1590 Hz.", "Q = f₀/bandwidth = 1590/80 = 20."],
      answer: "1.6 kHz; Q ≈ 20.",
    },
    check: {
      question: "Increasing the resistance in a series RCL circuit makes the resonance curve:",
      options: ["Higher and sharper", "Lower and broader", "Shift to a much higher frequency", "Unchanged"],
      correctIndex: 1,
      explanation: "More resistance means more damping: lower peak current, wider bandwidth and a lower Q.",
    },
    apply: {
      prompt: "Explain why a radio tuner needs a circuit with a high Q factor.",
      modelAnswer: "Many stations broadcast on nearby frequencies. A high-Q circuit has a narrow bandwidth, so it responds strongly only to signals very close to its resonant frequency and rejects neighbouring stations.",
      successCriteria: ["High Q → narrow bandwidth", "Selects one station, rejects neighbours"],
    },
  },

  "wjec-alevel-physics.medical-physics.sp-01": {
    explain: [
      "**X-rays** are produced when fast electrons hit a metal target: most energy becomes heat; a small fraction becomes X-rays, a continuous spectrum (braking radiation) plus characteristic lines.",
      "X-rays are **attenuated** exponentially: I = I₀e^(−μx), where μ is the attenuation coefficient. Bone has a much larger μ than soft tissue, giving contrast on a radiograph.",
      "The **half-value thickness** is ln 2/μ. **CT** scans take many X-ray images from different angles and reconstruct cross-sections, giving better soft-tissue contrast but a larger dose.",
    ],
    worked: {
      prompt: "X-rays pass through 3.0 cm of tissue with μ = 0.50 cm⁻¹. What fraction of the intensity gets through, and what is the half-value thickness?",
      steps: ["I/I₀ = e^(−0.50 × 3.0) = e^(−1.5) = 0.22.", "Half-value thickness = ln 2 / 0.50 = 1.4 cm."],
      answer: "22% transmitted; HVT 1.4 cm.",
    },
    check: {
      question: "Why do bones show up clearly on an X-ray image?",
      options: [
        "Bones emit X-rays",
        "Bones attenuate X-rays far more than soft tissue",
        "Bones reflect X-rays",
        "Soft tissue absorbs all X-rays",
      ],
      correctIndex: 1,
      explanation: "Bone has a much larger attenuation coefficient, so fewer X-rays reach the detector behind it.",
    },
    apply: {
      prompt: "Give one advantage and one disadvantage of a CT scan compared with a single X-ray image.",
      modelAnswer: "Advantage: CT gives three-dimensional cross-sectional images with much better soft-tissue contrast. Disadvantage: it involves many exposures, giving the patient a much larger radiation dose (and it is more expensive).",
      successCriteria: ["Advantage: 3D / soft-tissue contrast", "Disadvantage: higher dose or cost"],
    },
  },

  "wjec-alevel-physics.medical-physics.sp-02": {
    explain: [
      "Ultrasound (above 20 kHz, typically MHz) reflects at boundaries between tissues. The fraction reflected depends on the **acoustic impedance** Z = ρc of each tissue: R = ((Z₂ − Z₁)/(Z₂ + Z₁))².",
      "Air and skin have very different Z, so almost all ultrasound would reflect at the skin; a **coupling gel** removes the air gap.",
      "Depth = (speed × echo time)/2, because the pulse travels there and back.",
      "The **Doppler** shift of ultrasound reflected from moving blood gives its speed; the frequency rises if the blood moves towards the probe.",
    ],
    worked: {
      prompt: "An echo returns 65 µs after the pulse is sent. The speed of sound in tissue is 1540 m s⁻¹. How deep is the boundary?",
      steps: ["Distance there and back = 1540 × 65 × 10⁻⁶ = 0.100 m.", "Depth = 0.100 / 2 = 0.050 m."],
      answer: "5.0 cm.",
    },
    check: {
      question: "Why is gel spread on the skin before an ultrasound scan?",
      options: [
        "To cool the skin",
        "To remove air, whose acoustic impedance is very different from skin, so most ultrasound enters the body",
        "To make the probe slide",
        "To absorb harmful radiation",
      ],
      correctIndex: 1,
      explanation: "With air between probe and skin, R ≈ 0.999: almost everything reflects. Gel matches the impedance.",
    },
    apply: {
      prompt: "Explain why ultrasound is preferred to X-rays for scanning a fetus.",
      modelAnswer: "Ultrasound is not ionising, so it does not damage cells or DNA at diagnostic intensities, which matters for rapidly dividing fetal cells. It also shows soft-tissue boundaries well and gives real-time images.",
      successCriteria: ["Non-ionising, so safer", "Good soft-tissue imaging in real time"],
    },
  },

  "wjec-alevel-physics.medical-physics.sp-03": {
    explain: [
      "In **MRI** the patient lies in a very strong magnetic field (about 1.5 T). Hydrogen nuclei (protons) align with it and precess at the **Larmor frequency**, proportional to B (about 42.6 MHz per tesla).",
      "A radio-frequency pulse at the Larmor frequency tips the protons out of alignment. As they **relax** back they emit RF signals that coils detect.",
      "Different tissues have different relaxation times, giving contrast. Gradient fields make the Larmor frequency vary with position, so the signal can be located.",
      "MRI uses no ionising radiation, but the strong field means patients with some metal implants or pacemakers cannot be scanned.",
    ],
    worked: {
      prompt: "Find the Larmor frequency of protons in a 1.5 T scanner.",
      steps: ["f = 42.6 MHz T⁻¹ × 1.5 T = 64 MHz."],
      answer: "About 64 MHz (radio frequency).",
    },
    check: {
      question: "What gives contrast between tissues in an MRI image?",
      options: [
        "Different X-ray attenuation",
        "Different relaxation times of hydrogen nuclei",
        "Different acoustic impedances",
        "Different radioactive uptake",
      ],
      correctIndex: 1,
      explanation: "Tissues relax back to alignment at different rates, so their signals differ.",
    },
    apply: {
      prompt: "Explain why a gradient field is needed in MRI.",
      modelAnswer: "With a uniform field, protons everywhere precess at the same frequency, so the signal could not be located. A gradient field makes B, and so the Larmor frequency, vary with position; the frequency of each signal then tells the scanner where it came from.",
      successCriteria: ["Larmor frequency depends on B", "Gradient makes frequency vary with position", "Frequency locates the signal"],
    },
  },

  "wjec-alevel-physics.medical-physics.sp-04": {
    explain: [
      "In radionuclide imaging, a **tracer** is injected and a gamma camera detects where it collects. A good tracer emits only **gamma** rays (which leave the body) with a half-life of hours, and is chemically suited to the organ.",
      "Technetium-99m is ideal: it emits 140 keV gamma rays and has a 6 h physical half-life.",
      "The **effective half-life** combines physical decay and biological removal: 1/T_eff = 1/T_phys + 1/T_bio. It is always shorter than either.",
      "Dose is kept as low as reasonably achievable: use the smallest activity giving a usable image.",
    ],
    worked: {
      prompt: "Tc-99m has a physical half-life of 6.0 h and a biological half-life of 24 h. Find the effective half-life.",
      steps: ["1/T_eff = 1/6.0 + 1/24 = 5/24.", "T_eff = 4.8 h."],
      answer: "4.8 h.",
    },
    check: {
      question: "Why is a pure gamma emitter used as a medical tracer rather than an alpha emitter?",
      options: [
        "Alpha particles cannot be detected",
        "Gamma rays pass out of the body to the camera and ionise much less along the way",
        "Gamma emitters have longer half-lives",
        "Alpha particles are too fast",
      ],
      correctIndex: 1,
      explanation: "Alpha particles would be absorbed inside the body, delivering a high local dose and never reaching the detector.",
    },
    apply: {
      prompt: "Explain why a tracer with a half-life of a few hours is chosen, rather than seconds or years.",
      modelAnswer: "A half-life of seconds would decay before it could be prepared, injected and imaged. A half-life of years would keep irradiating the patient long after the scan. A few hours lasts long enough for the procedure but decays quickly afterwards, limiting the dose.",
      successCriteria: ["Too short: decays before imaging", "Too long: unnecessary dose", "Hours balances both"],
    },
  },

  "wjec-alevel-physics.sports-physics.sp-01": {
    explain: [
      "Without air resistance a projectile's path is a symmetric parabola, and the range on level ground is greatest at 45°: R = v²/g.",
      "With air resistance, drag acts opposite to the velocity, reducing both components. The path becomes **asymmetric**: steeper on the way down, with a shorter range and lower maximum height.",
      "The best launch angle for a real ball is usually **below 45°**, and spin can create lift (the Magnus effect).",
    ],
    worked: {
      prompt: "A ball is struck at 25 m s⁻¹. Ignoring air resistance, what is its greatest possible range on level ground?",
      steps: ["Maximum range is at 45°: R = v²/g.", "R = 25² / 9.81 = 64 m."],
      answer: "64 m (less in practice because of drag).",
    },
    check: {
      question: "How does air resistance change the path of a struck ball?",
      options: [
        "It makes the path symmetric",
        "It shortens the range and makes the descent steeper than the ascent",
        "It increases the maximum height",
        "It has no effect on the horizontal motion",
      ],
      correctIndex: 1,
      explanation: "Drag removes kinetic energy throughout, reducing horizontal speed especially late in the flight, so the ball falls more steeply.",
    },
    apply: {
      prompt: "A shot-putter releases the shot about 2 m above the ground. Explain why the best release angle is a little below 45°.",
      modelAnswer: "Released 2 m above the ground, the shot falls further than it rises, so it stays in the air longer than a launch from ground level would. That extra flight time favours a larger horizontal velocity, so a lower angle gives more range. Athletes can also release the shot faster at lower angles. Both make the optimum angle below 45° (about 37–40°).",
      successCriteria: ["Release height above the landing point lengthens the flight", "Lower angle gives more horizontal velocity and release speed"],
    },
  },

  "wjec-alevel-physics.sports-physics.sp-02": {
    explain: [
      "The **centre of mass** is the point where the whole weight can be considered to act. An object is stable when its centre of mass is above its base of support.",
      "**Moment** of a force = force × perpendicular distance from the pivot (N m). **Principle of moments**: in equilibrium, clockwise moments = anticlockwise moments about any point.",
      "Muscles often act close to a joint, so they must exert forces many times larger than the load they hold.",
    ],
    worked: {
      prompt: "A forearm is held horizontal holding a 20 N load 35 cm from the elbow. The forearm's weight, 15 N, acts 15 cm from the elbow, and the biceps attaches 4.0 cm from the elbow. Find the biceps force.",
      steps: [
        "Take moments about the elbow: F × 0.040 = 20 × 0.35 + 15 × 0.15.",
        "F × 0.040 = 7.0 + 2.25 = 9.25 N m.",
        "F = 231 N.",
      ],
      answer: "About 230 N, over ten times the load.",
    },
    check: {
      question: "Why does a wrestler crouch with feet apart?",
      options: [
        "To increase their weight",
        "To lower their centre of mass and widen their base, making them harder to topple",
        "To reduce friction",
        "To increase their moment of inertia only",
      ],
      correctIndex: 1,
      explanation: "A lower centre of mass and wider base mean they must be tilted further before the centre of mass passes outside the base.",
    },
    apply: {
      prompt: "Explain why it is easier to hold a heavy bag close to your body than at arm's length.",
      modelAnswer: "The moment of the bag about your shoulder (or lower back) is its weight × perpendicular distance. Held close, the distance is small, so the moment, and the muscle force needed to balance it, is much smaller.",
      successCriteria: ["Moment = force × perpendicular distance", "Smaller distance, smaller moment and muscle force"],
    },
  },

  "wjec-alevel-physics.sports-physics.sp-03": {
    explain: [
      "Impulse = average force × contact time = change in momentum.",
      "**Protective equipment** (helmets, pads, crash mats) works by increasing the time over which the momentum changes, reducing the average force for the same change in momentum.",
      "In hitting a ball, following through keeps contact longer, increasing the impulse and so the ball's speed.",
    ],
    worked: {
      prompt: "A 5.0 kg head moving at 6.0 m s⁻¹ is stopped in 5.0 ms without a helmet and in 20 ms with one. Find the average force in each case.",
      steps: ["Δp = 5.0 × 6.0 = 30 kg m s⁻¹.", "Without: F = 30 / 0.005 = 6000 N.", "With: F = 30 / 0.020 = 1500 N."],
      answer: "6.0 kN without a helmet, 1.5 kN with one.",
    },
    check: {
      question: "A crash mat reduces injury because it:",
      options: [
        "Reduces the gymnast's change in momentum",
        "Increases the stopping time, reducing the average force",
        "Increases the gymnast's speed",
        "Removes all the kinetic energy instantly",
      ],
      correctIndex: 1,
      explanation: "The change in momentum is the same either way; spreading it over a longer time reduces the force.",
    },
    apply: {
      prompt: "Explain why a tennis player who follows through hits the ball faster.",
      modelAnswer: "Following through keeps the racket in contact with the ball for longer. With a similar force, a longer contact time gives a larger impulse, so a bigger change in the ball's momentum and a higher speed.",
      successCriteria: ["Longer contact time", "Larger impulse → larger change in momentum"],
    },
  },

  "wjec-alevel-physics.sports-physics.sp-04": {
    explain: [
      "Drag on an object moving through a fluid at speed v: F_D = ½ρC_DAv², where ρ is the fluid density, A the frontal area and C_D the drag coefficient (shape).",
      "Because drag ∝ v², the power needed to overcome it (F_Dv) rises as v³: going a little faster costs a lot more power.",
      "Streamlining (lower C_D) and a crouched position (smaller A) reduce drag. **Lift** is the force perpendicular to the flow, produced by shaped surfaces (wings, spoilers) or spin.",
    ],
    worked: {
      prompt: "A cyclist with C_DA = 0.30 m² rides at 10 m s⁻¹ in air of density 1.2 kg m⁻³. Find the drag and the power, then repeat at 12 m s⁻¹.",
      steps: [
        "At 10 m s⁻¹: F = ½ × 1.2 × 0.30 × 10² = 18 N; P = Fv = 180 W.",
        "At 12 m s⁻¹: F = ½ × 1.2 × 0.30 × 12² = 26 N; P = 26 × 12 = 311 W.",
        "A 20% speed increase needs about 73% more power.",
      ],
      answer: "18 N and 180 W; 26 N and 310 W.",
    },
    check: {
      question: "If a skier's speed doubles, by what factor does the drag force increase (C_D and A unchanged)?",
      options: ["2", "4", "8", "It does not change"],
      correctIndex: 1,
      explanation: "F_D ∝ v², so doubling v gives four times the drag (and eight times the power).",
    },
    apply: {
      prompt: "Explain why cyclists ride closely behind each other in a race.",
      modelAnswer: "The leading rider pushes the air aside, so the following rider moves through air already moving with them; the relative air speed and turbulence are reduced, so their drag (∝ v² relative to the air) is much lower and they need less power for the same speed.",
      successCriteria: ["Reduced relative air speed behind the leader", "Lower drag and power"],
    },
  },

  "wjec-alevel-physics.energy-environment.sp-01": {
    explain: [
      "Compare energy resources by **efficiency**, **power output**, **reliability** (is it available when needed?) and environmental impact.",
      "**Capacity factor** = actual energy produced over a period ÷ (rated power × time). Wind is typically about 30%; nuclear about 90%.",
      "Wind turbine power: P = ½ρAv³ × efficiency, so power rises with the cube of wind speed and with the swept area (∝ blade length²).",
    ],
    worked: {
      prompt: "A 3.0 MW wind turbine produces 7.9 GWh in a year. Find its capacity factor.",
      steps: [
        "Maximum possible = 3.0 MW × 8760 h = 26 280 MWh = 26.3 GWh.",
        "Capacity factor = 7.9 / 26.3 = 0.30 (30%).",
      ],
      answer: "30%.",
    },
    check: {
      question: "Wind speed doubles. Ideally, by what factor does a turbine's power output increase?",
      options: ["2", "4", "8", "16"],
      correctIndex: 2,
      explanation: "The mass of air per second ∝ v and its kinetic energy per kg ∝ v², so P ∝ v³.",
    },
    apply: {
      prompt: "Explain why a grid cannot rely only on wind and solar power even if their total rated capacity exceeds peak demand.",
      modelAnswer: "Their output depends on the weather and time of day, so their capacity factors are low and output can fall well below demand when it is calm or dark. Supply must match demand at every moment, so the grid also needs dispatchable sources or storage.",
      successCriteria: ["Intermittency / low capacity factor", "Supply must match demand continuously", "Need backup or storage"],
    },
  },

  "wjec-alevel-physics.energy-environment.sp-02": {
    explain: [
      "The Sun (about 5800 K) emits mainly visible and near-infrared radiation, which passes through the atmosphere. **Wien's law**: λ_max T = 2.9 × 10⁻³ m K.",
      "The Earth (about 288 K) re-emits energy as long-wavelength **infrared** (λ_max ≈ 10 µm).",
      "Greenhouse gases (CO₂, H₂O, CH₄) absorb this infrared and re-emit it in all directions, including back to the surface. The surface warms until outgoing and incoming energy balance again: the **greenhouse effect**.",
      "More greenhouse gas strengthens this effect, raising the equilibrium temperature: the enhanced greenhouse effect.",
    ],
    worked: {
      prompt: "Use Wien's law to find the peak wavelengths of the Sun (5800 K) and the Earth (288 K).",
      steps: ["Sun: λ = 2.9 × 10⁻³ / 5800 = 5.0 × 10⁻⁷ m (visible).", "Earth: λ = 2.9 × 10⁻³ / 288 = 1.0 × 10⁻⁵ m (infrared)."],
      answer: "0.50 µm and 10 µm.",
    },
    check: {
      question: "Why does the atmosphere let sunlight in but trap energy radiated by the Earth?",
      options: [
        "The Earth emits more energy than the Sun",
        "Greenhouse gases absorb long-wavelength infrared far more than visible light",
        "The atmosphere reflects all infrared from space",
        "Sunlight has a longer wavelength",
      ],
      correctIndex: 1,
      explanation: "The Earth's emission is long-wavelength infrared, which greenhouse gases absorb; the Sun's shorter wavelengths mostly pass through.",
    },
    apply: {
      prompt: "Explain, in terms of energy balance, why increasing atmospheric CO₂ raises the Earth's average surface temperature.",
      modelAnswer: "More CO₂ absorbs more of the outgoing infrared and re-emits some back to the surface, so less energy escapes to space. The Earth absorbs more than it emits, so it warms until its higher emission restores the balance between incoming and outgoing energy at a higher temperature.",
      successCriteria: ["More infrared absorbed and re-emitted downwards", "Imbalance between incoming and outgoing energy", "New equilibrium at higher temperature"],
    },
  },

  "wjec-alevel-physics.energy-environment.sp-03": {
    explain: [
      "Storage is judged by its **energy capacity** (how much it holds, MWh) and its **power** (how fast it can deliver, MW). They are different: a large reservoir with small turbines stores a lot but delivers slowly.",
      "**Pumped hydroelectric** storage: E = mgh. **Batteries** respond in milliseconds but store less energy per kg and degrade. Other options include compressed air, flywheels and hydrogen.",
      "Round-trip efficiency = energy recovered ÷ energy put in (pumped hydro about 75–80%).",
    ],
    worked: {
      prompt: "A pumped-storage reservoir holds 1.0 × 10⁶ m³ of water, 300 m above the turbines. How much energy does it store?",
      steps: ["Mass = 1.0 × 10⁶ m³ × 1000 kg m⁻³ = 1.0 × 10⁹ kg.", "E = mgh = 1.0 × 10⁹ × 9.81 × 300 = 2.9 × 10¹² J.", "In MWh: 2.9 × 10¹² / 3.6 × 10⁹ = 820 MWh."],
      answer: "2.9 × 10¹² J (about 820 MWh).",
    },
    check: {
      question: "A storage system can deliver 500 MW for 6 hours. What is its energy capacity?",
      options: ["83 MWh", "500 MWh", "3000 MWh", "6 MW"],
      correctIndex: 2,
      explanation: "Energy = power × time = 500 × 6 = 3000 MWh.",
    },
    apply: {
      prompt: "Compare lithium-ion batteries and pumped hydro for balancing a grid.",
      modelAnswer: "Batteries respond almost instantly and can be built anywhere, making them good for short, fast balancing, but their capacity is limited and they degrade over cycles. Pumped hydro stores far more energy for hours at a time and lasts decades, but needs suitable geography, has a high build cost and takes seconds to minutes to respond.",
      successCriteria: ["Battery: fast response, limited energy, degradation", "Pumped hydro: large energy, long life, geography and cost"],
    },
  },

  "wjec-alevel-physics.energy-environment.sp-04": {
    explain: [
      "**Life-cycle analysis** counts the energy use and emissions over a technology's whole life: mining materials, manufacture, transport, operation, maintenance and decommissioning.",
      "Results are usually given per unit of energy produced (for example g CO₂ per kWh), so different technologies can be compared fairly.",
      "Estimates carry **uncertainty** because they depend on assumptions (lifetime, capacity factor, location). Two claims differ meaningfully only if their uncertainty ranges do not overlap.",
    ],
    worked: {
      prompt: "Study A reports 12 ± 5 g CO₂/kWh for wind power; study B reports 20 ± 10 g CO₂/kWh. Do they disagree?",
      steps: ["A: 7 to 17. B: 10 to 30.", "The ranges overlap (10 to 17), so the studies are consistent."],
      answer: "No significant disagreement.",
    },
    check: {
      question: "Why might a solar panel's life-cycle emissions be lower in Spain than in Scotland?",
      options: [
        "Spanish panels are made of different materials",
        "More sunlight gives more energy over its life, spreading the fixed manufacturing emissions over more kWh",
        "Scotland has more wind",
        "Emissions are not counted in Spain",
      ],
      correctIndex: 1,
      explanation: "Manufacturing emissions are roughly fixed; dividing by a larger lifetime output gives fewer emissions per kWh.",
    },
    apply: {
      prompt: "A company claims its electric car has 'zero emissions'. Evaluate this claim using life-cycle thinking.",
      modelAnswer: "There are no exhaust emissions while driving, but manufacture (especially the battery) emits CO₂, and the electricity may come partly from fossil fuels. Over its whole life it may emit less than a petrol car, depending on the grid mix and mileage, but not zero.",
      successCriteria: ["Considers manufacture and electricity source", "Concludes lower but not zero over the life cycle"],
    },
  },

  "wjec-alevel-physics.practical-investigations.sp-01": {
    explain: [
      "Identify the **independent** variable (what you change), the **dependent** variable (what you measure) and the **control** variables (kept constant so the test is fair).",
      "Choose a range and number of readings: at least five or six values over as wide a range as practical, repeated to spot anomalies.",
      "Plan for safety (hazards and precautions) and for accuracy: suitable instruments with enough resolution, and techniques that reduce uncertainty.",
    ],
    worked: {
      prompt: "Plan an investigation into how the resistance of a wire depends on its length.",
      steps: [
        "Independent: length (e.g. 10 cm to 90 cm in 10 cm steps, measured with a metre rule). Dependent: resistance, from V/I readings.",
        "Controls: the same wire (material and diameter), a small current to avoid heating, the same temperature.",
        "Repeat each length, plot R against L and expect a straight line through the origin; the gradient gives ρ/A.",
      ],
      answer: "A plan with clear variables, controls, range, repeats and a graph to analyse.",
    },
    check: {
      question: "In an experiment on how the period of a pendulum depends on its length, which is a control variable?",
      options: ["The length", "The period", "The amplitude of swing", "The time for 20 oscillations"],
      correctIndex: 2,
      explanation: "Length is independent, period dependent; the amplitude should be kept small and the same.",
    },
    apply: {
      prompt: "Explain why a student investigating the heating of a wire should use a small current.",
      modelAnswer: "A large current heats the wire, increasing its resistance during the experiment. That changes a control variable (temperature) and could make the wire hot enough to burn someone. A small current keeps the temperature constant and the experiment safe.",
      successCriteria: ["Heating changes resistance (a control variable)", "Safety"],
    },
  },

  "wjec-alevel-physics.practical-investigations.sp-02": {
    explain: [
      "**Random** errors cause unpredictable scatter about the true value; repeating and averaging reduces their effect.",
      "**Systematic** errors shift every reading the same way (zero error, wrong calibration, reaction time always added). Repeating does not reduce them; they must be found and corrected.",
      "**Precision** describes how close repeated readings are to each other; **accuracy** describes how close the result is to the true value. Results can be precise but inaccurate if there is a systematic error.",
    ],
    worked: {
      prompt: "Four measurements of g are 9.62, 9.68, 9.64 and 9.66 m s⁻². The accepted value is 9.81 m s⁻². Comment on their precision and accuracy.",
      steps: [
        "The readings are close together (spread 0.06): precise.",
        "Their mean (9.65) is well below 9.81: not accurate.",
        "This points to a systematic error, such as measuring the length to the top of the bob instead of its centre.",
      ],
      answer: "Precise but not accurate: suspect a systematic error.",
    },
    check: {
      question: "A balance reads 0.3 g with nothing on it. This causes:",
      options: ["A random error", "A systematic error", "Better precision", "No error"],
      correctIndex: 1,
      explanation: "Every reading is 0.3 g too high: a zero error, which is systematic.",
    },
    apply: {
      prompt: "Explain why timing 20 oscillations, rather than one, improves the measurement of a pendulum's period.",
      modelAnswer: "Human reaction time adds an uncertainty of about 0.1–0.2 s to each timing. Over 20 oscillations this uncertainty is the same, but it is shared by 20 periods, so the percentage uncertainty in the period is about 20 times smaller.",
      successCriteria: ["Reaction-time uncertainty is fixed", "Divided over many periods", "Smaller percentage uncertainty"],
    },
  },

  "wjec-alevel-physics.practical-investigations.sp-03": {
    explain: [
      "Rearrange a relationship into the form **y = mx + c** so the graph is a straight line. For a pendulum, T = 2π√(L/g) becomes T² = (4π²/g)L: plot T² against L.",
      "For a power law y = kxⁿ, take logs: log y = n log x + log k. The gradient of log y against log x is n.",
      "Draw a best-fit line and a worst acceptable line through the error bars. The uncertainty in the gradient ≈ |best gradient − worst gradient|.",
    ],
    worked: {
      prompt: "A graph of T² against L has a best-fit gradient of 4.02 s² m⁻¹ and a worst-fit gradient of 4.18 s² m⁻¹. Find g and its uncertainty.",
      steps: [
        "g = 4π² / gradient = 39.48 / 4.02 = 9.82 m s⁻².",
        "Uncertainty in the gradient = 4.18 − 4.02 = 0.16, which is 4.0%.",
        "So g = 9.8 ± 0.4 m s⁻².",
      ],
      answer: "9.8 ± 0.4 m s⁻².",
    },
    check: {
      question: "Data are thought to follow y = kx³. Which graph should give a straight line?",
      options: ["y against x", "log y against log x", "y against 1/x", "x against y²"],
      correctIndex: 1,
      explanation: "log y = 3 log x + log k: a straight line of gradient 3 (y against x³ would also work).",
    },
    apply: {
      prompt: "The current through a filament lamp is thought to follow I = kVⁿ. Describe how to find n from your data.",
      modelAnswer: "Take logs: ln I = n ln V + ln k. Plot ln I against ln V; if the relationship holds the points lie on a straight line. The gradient is n, and the intercept is ln k.",
      successCriteria: ["Takes logs of both sides", "Plots ln I against ln V", "Gradient = n"],
    },
  },

  "wjec-alevel-physics.practical-investigations.sp-04": {
    explain: [
      "A **conclusion** states the relationship the evidence supports, refers to the graph (straight line through the origin, gradient value) and compares the result with any accepted value using the uncertainty.",
      "An **evaluation** identifies the largest source of uncertainty or error and suggests a specific improvement that targets it. 'Repeat it' or 'be more careful' are not specific improvements.",
      "Good improvements change the method: use a data logger or light gate instead of a stopwatch, measure over a larger range, or use an instrument with better resolution.",
    ],
    worked: {
      prompt: "A student's g from a pendulum is 9.6 ± 0.1 m s⁻². The largest uncertainty was in timing. Write a conclusion and a targeted improvement.",
      steps: [
        "Conclusion: T² is proportional to L, as predicted, but 9.6 ± 0.1 does not include 9.81, so there is a systematic error.",
        "Likely cause: measuring L to the top of the bob, making every L too short.",
        "Improvement: measure L to the centre of the bob, and use a light gate at the equilibrium position to time the oscillations.",
      ],
      answer: "The relationship is supported; a systematic error is identified with a specific fix.",
    },
    check: {
      question: "Which is the most useful improvement for an experiment where timing by hand gave the biggest uncertainty?",
      options: ["Repeat the experiment more carefully", "Use a light gate and data logger to measure the time", "Use a heavier bob", "Measure the length twice"],
      correctIndex: 1,
      explanation: "It directly removes the dominant source of uncertainty (reaction time).",
    },
    apply: {
      prompt: "A student's value for the Young modulus of copper is 1.0 × 10¹¹ Pa; the accepted value is 1.2 × 10¹¹ Pa, and their uncertainty is ±5%. Evaluate the result.",
      modelAnswer: "±5% gives a range of 0.95 to 1.05 × 10¹¹ Pa, which does not include 1.2 × 10¹¹ Pa, so the difference cannot be explained by the stated uncertainty: there is probably a systematic error, or the uncertainty was underestimated. The most likely cause is the diameter (it is squared), for example using an average from too few points or a micrometer zero error; measure the diameter at many points with a zeroed micrometer.",
      successCriteria: ["Compares the range with the accepted value", "Identifies a systematic error", "Gives a targeted improvement"],
    },
  },

  "wjec-alevel-physics.orbits-universe.sp-01": {
    explain: [
      "For a circular orbit, gravity provides the centripetal force: GMm/r² = mv²/r.",
      "So **v = √(GM/r)** and, using v = 2πr/T, **T = 2π√(r³/GM)**.",
      "Neither depends on the satellite's mass. Higher orbits are slower and take longer.",
    ],
    worked: {
      prompt: "The Moon orbits the Earth (mass 5.97 × 10²⁴ kg) at a radius of 3.84 × 10⁸ m. Find its orbital period.",
      steps: [
        "T = 2π√(r³/GM) = 2π√((3.84 × 10⁸)³ / (6.67 × 10⁻¹¹ × 5.97 × 10²⁴)).",
        "T = 2.37 × 10⁶ s = 27.4 days.",
      ],
      answer: "About 27 days.",
    },
    check: {
      question: "A satellite moves to an orbit of larger radius. Its orbital speed:",
      options: ["Increases", "Decreases", "Stays the same", "Becomes zero"],
      correctIndex: 1,
      explanation: "v = √(GM/r): larger r means a lower speed.",
    },
    apply: {
      prompt: "Derive T² = (4π²/GM)r³ for a circular orbit.",
      modelAnswer: "GMm/r² = mv²/r gives v² = GM/r. For a circular orbit v = 2πr/T, so 4π²r²/T² = GM/r. Rearranging: T² = 4π²r³/GM.",
      successCriteria: ["Equates gravitational and centripetal force", "Substitutes v = 2πr/T", "T² = 4π²r³/GM"],
    },
  },

  "wjec-alevel-physics.orbits-universe.sp-02": {
    explain: [
      "**Kepler's laws:** planets move in ellipses with the Sun at one focus; a line from the Sun to a planet sweeps out equal areas in equal times (they move faster when closer); and **T² ∝ r³** for all bodies orbiting the same central mass.",
      "A **geostationary** satellite stays above one point on the equator: it orbits above the equator, in the same direction as the Earth spins (west to east), with a period of one day.",
      "Setting T = 1 day in T² = 4π²r³/GM fixes its radius at about 42 000 km (about 36 000 km above the surface).",
    ],
    worked: {
      prompt: "Find the orbital radius and height of a geostationary satellite (T = 86 400 s, Earth's radius 6370 km).",
      steps: [
        "r³ = GMT²/4π² = 6.67 × 10⁻¹¹ × 5.97 × 10²⁴ × 86 400² / 4π².",
        "r = 4.22 × 10⁷ m.",
        "Height = 4.22 × 10⁷ − 6.37 × 10⁶ = 3.59 × 10⁷ m ≈ 36 000 km.",
      ],
      answer: "r ≈ 42 000 km; about 36 000 km above the surface.",
    },
    check: {
      question: "Which is NOT a condition for a geostationary orbit?",
      options: ["Above the equator", "Period of one day", "Same direction as the Earth's rotation", "Satellite mass of about 1000 kg"],
      correctIndex: 3,
      explanation: "The orbit does not depend on the satellite's mass.",
    },
    apply: {
      prompt: "Mars orbits the Sun at 1.52 times the Earth's orbital radius. Use Kepler's third law to estimate the length of a Martian year.",
      modelAnswer: "T² ∝ r³, so T_Mars = T_Earth × 1.52^(3/2) = 1 year × 1.87 ≈ 1.9 years (about 690 days).",
      successCriteria: ["Uses T ∝ r^(3/2)", "≈ 1.9 years"],
    },
  },

  "wjec-alevel-physics.orbits-universe.sp-03": {
    explain: [
      "Light from a source moving away is shifted to longer wavelengths: **redshift**. For speeds much less than c: z = Δλ/λ = v/c.",
      "**Hubble's law:** the recession speed of a galaxy is proportional to its distance: v = H₀d. Distant galaxies are receding faster, which is evidence that the universe is **expanding**.",
      "Running the expansion backwards gives an estimate of the age of the universe: about 1/H₀ (with H₀ in s⁻¹).",
    ],
    worked: {
      prompt: "A hydrogen line emitted at 656.3 nm is observed at 669.4 nm. Find the galaxy's speed and, with H₀ = 70 km s⁻¹ Mpc⁻¹, its distance.",
      steps: [
        "z = (669.4 − 656.3)/656.3 = 0.0200.",
        "v = zc = 0.0200 × 3.00 × 10⁸ = 6.0 × 10⁶ m s⁻¹ = 6000 km s⁻¹.",
        "d = v/H₀ = 6000/70 = 86 Mpc.",
      ],
      answer: "6000 km s⁻¹; about 86 Mpc.",
    },
    check: {
      question: "What does it mean that almost all galaxies show redshift?",
      options: [
        "They are getting hotter",
        "They are moving away from us, consistent with an expanding universe",
        "They are made of red stars",
        "They are moving towards us",
      ],
      correctIndex: 1,
      explanation: "Redshift means recession; recession speeds increasing with distance mean expansion.",
    },
    apply: {
      prompt: "Estimate the age of the universe from H₀ = 70 km s⁻¹ Mpc⁻¹ (1 Mpc = 3.09 × 10²² m), and state one assumption.",
      modelAnswer: "H₀ = 70 × 10³ / 3.09 × 10²² = 2.27 × 10⁻¹⁸ s⁻¹. Age ≈ 1/H₀ = 4.4 × 10¹⁷ s ≈ 14 billion years. Assumption: the expansion rate has been constant.",
      successCriteria: ["Converts H₀ to s⁻¹", "≈ 14 billion years", "Assumes constant expansion rate"],
    },
  },

  "wjec-alevel-physics.orbits-universe.sp-04": {
    explain: [
      "Astronomical distances are measured indirectly: **parallax** for nearby stars, **standard candles** (objects of known luminosity) further out, and redshift for the most distant galaxies. Each rung depends on the ones below it.",
      "Uncertainties grow up this distance ladder: a calibration error in a nearby step affects everything beyond it (systematic error).",
      "Models simplify: a circular orbit, a point mass, a constant Hubble constant. A good evaluation states which assumption limits the result most.",
    ],
    worked: {
      prompt: "Two measurements of H₀ are 67.4 ± 0.5 and 73.0 ± 1.0 km s⁻¹ Mpc⁻¹. Do they agree?",
      steps: ["Ranges: 66.9 to 67.9, and 72.0 to 74.0.", "They do not overlap, so the disagreement is significant.", "This suggests a systematic error in at least one method, or that the model is incomplete."],
      answer: "No: the ranges do not overlap.",
    },
    check: {
      question: "Why does an error in the distance to nearby standard candles affect estimates of H₀?",
      options: [
        "H₀ is measured only from nearby stars",
        "Distances to far galaxies are calibrated against nearer ones, so the error propagates up the distance ladder",
        "Redshift depends on parallax",
        "It does not affect H₀",
      ],
      correctIndex: 1,
      explanation: "Each step of the distance ladder is calibrated by the one below, so a systematic error carries through.",
    },
    apply: {
      prompt: "Explain why parallax cannot be used to measure distances to other galaxies.",
      modelAnswer: "Parallax angles get smaller as distance increases. For other galaxies, the angle produced by the Earth's orbit is far too small to measure with current instruments, so its uncertainty would exceed the angle itself.",
      successCriteria: ["Parallax angle ∝ 1/distance", "Too small to measure at galactic distances"],
    },
  },

  "wjec-alevel-physics.electromagnetic-induction.sp-01": {
    explain: [
      "**Magnetic flux** Φ = BA cos θ, where θ is the angle between the field and the normal to the area (Φ = BA when the field is perpendicular to the coil). Unit: weber (Wb).",
      "**Flux linkage** = NΦ for a coil of N turns.",
      "Induced emf = rate of change of flux linkage: ε = NΔΦ/Δt. Rotating a coil from facing the field to edge-on changes Φ from BA to 0.",
    ],
    worked: {
      prompt: "A square coil of side 5.0 cm and 50 turns faces a 0.20 T field. It is turned through 90° (until edge-on) in 0.020 s. Find the average emf.",
      steps: [
        "Initial flux per turn = BA = 0.20 × 0.050² = 5.0 × 10⁻⁴ Wb; final = 0.",
        "Change in flux linkage = 50 × 5.0 × 10⁻⁴ = 0.025 Wb turns.",
        "ε = 0.025 / 0.020 = 1.25 V.",
      ],
      answer: "1.3 V.",
    },
    check: {
      question: "A coil lies with its plane parallel to a magnetic field. What is the flux through it?",
      options: ["BA", "Zero", "NBA", "B/A"],
      correctIndex: 1,
      explanation: "With the plane parallel to the field, no field lines pass through the coil (θ = 90° to the normal), so Φ = 0.",
    },
    apply: {
      prompt: "Explain why moving a coil sideways through a uniform field, without rotating it, induces no emf while it is fully inside the field.",
      modelAnswer: "Fully inside a uniform field the flux through the coil, BA, is constant as it moves, so the rate of change of flux linkage is zero and no emf is induced. An emf appears only as it enters or leaves the field, when the flux changes.",
      successCriteria: ["Flux constant inside a uniform field", "emf needs a changing flux linkage"],
    },
  },

  "wjec-alevel-physics.electromagnetic-induction.sp-02": {
    explain: [
      "**Lenz's law:** an induced current flows in the direction that **opposes the change** producing it.",
      "Approaching magnet: the coil's near face becomes the same pole, repelling it. Receding magnet: it becomes the opposite pole, attracting it back.",
      "This is energy conservation: work must be done against the opposing force to generate electrical energy.",
    ],
    worked: {
      prompt: "A magnet is dropped down a vertical copper tube. Explain why it falls much more slowly than through a plastic tube.",
      steps: [
        "As the magnet falls, the flux through each section of copper changes, inducing eddy currents in the tube.",
        "By Lenz's law these currents produce fields that oppose the magnet's motion.",
        "The opposing force grows with speed, so the magnet quickly reaches a low terminal velocity. Plastic does not conduct, so no currents flow.",
      ],
      answer: "Induced eddy currents oppose the fall.",
    },
    check: {
      question: "The north pole of a magnet is pulled away from a coil. The face of the coil nearest the magnet becomes:",
      options: ["A north pole", "A south pole", "Neither", "Alternately north and south"],
      correctIndex: 1,
      explanation: "The current opposes the decrease in flux by attracting the magnet back, so the near face becomes a south pole.",
    },
    apply: {
      prompt: "Explain why Lenz's law is a consequence of conservation of energy.",
      modelAnswer: "If the induced current helped the change instead of opposing it, it would accelerate the magnet, which would increase the current further, producing electrical and kinetic energy from nothing. Because the current opposes the change, work must be done against it, and that work becomes the electrical energy.",
      successCriteria: ["Aiding the change would create energy from nothing", "Work done against the opposition supplies the energy"],
    },
  },

  "wjec-alevel-physics.electromagnetic-induction.sp-03": {
    explain: [
      "A coil rotating at angular speed ω in a field has flux linkage NBA cos ωt, so the induced emf is **ε = BANω sin ωt**: an alternating emf with peak BANω.",
      "**Slip rings** keep each end of the coil connected to the same brush, giving an **alternating** output.",
      "A **split-ring commutator** reverses the connections every half turn, giving a d.c. output that varies in size (pulsating d.c.).",
      "The emf is greatest when the coil's plane is parallel to the field (cutting field lines fastest), and zero when it faces the field.",
    ],
    worked: {
      prompt: "A coil of 200 turns and area 0.010 m² rotates at 50 revolutions per second in a 0.15 T field. Find the peak emf.",
      steps: ["ω = 2π × 50 = 314 rad s⁻¹.", "ε₀ = BANω = 0.15 × 0.010 × 200 × 314 = 94 V."],
      answer: "94 V peak.",
    },
    check: {
      question: "At what position of a rotating coil is the induced emf greatest?",
      options: [
        "When the coil faces the field (maximum flux)",
        "When the coil's plane is parallel to the field (zero flux, changing fastest)",
        "Halfway between",
        "It is constant",
      ],
      correctIndex: 1,
      explanation: "The emf depends on the rate of change of flux, which is greatest when the flux is passing through zero.",
    },
    apply: {
      prompt: "State two ways to increase the peak output of a generator and explain why each works.",
      modelAnswer: "Rotate the coil faster: ω increases, so the flux linkage changes faster and ε₀ = BANω rises. Use more turns (or a larger coil, or a stronger magnet): N, A or B increases, increasing the flux linkage and so the peak emf.",
      successCriteria: ["Two of: faster rotation, more turns, larger area, stronger field", "Each linked to ε₀ = BANω"],
    },
  },

  "wjec-alevel-physics.electromagnetic-induction.sp-04": {
    explain: [
      "Transformer equation: V_s/V_p = N_s/N_p. Ideal: V_pI_p = V_sI_s.",
      "Real transformers lose energy through: **eddy currents** in the core (reduced by laminating it), **resistance** of the coils (thick, low-resistance copper wire), **hysteresis** in magnetising the core (soft iron) and **flux leakage** (coils wound on top of each other).",
      "Efficiency = output power ÷ input power = V_sI_s ÷ V_pI_p.",
    ],
    worked: {
      prompt: "A transformer steps 230 V down to 12 V and supplies 2.0 A. The measured primary current is 0.115 A. Find its efficiency.",
      steps: ["Output power = 12 × 2.0 = 24 W.", "Input power = 230 × 0.115 = 26.5 W.", "Efficiency = 24 / 26.5 = 91%."],
      answer: "91%.",
    },
    check: {
      question: "Why is a transformer core made of thin insulated laminations?",
      options: [
        "To increase the magnetic flux",
        "To reduce eddy currents and the heating they cause",
        "To make it lighter",
        "To increase the number of turns",
      ],
      correctIndex: 1,
      explanation: "The insulation breaks up the paths of induced currents in the core, cutting energy lost as heat.",
    },
    apply: {
      prompt: "A power station transmits 50 MW. Explain, with a calculation, why a step-up transformer to 275 kV is used rather than sending it at 25 kV through cables of resistance 4.0 Ω.",
      modelAnswer: "At 25 kV: I = 50 × 10⁶ / 25 × 10³ = 2000 A, loss = I²R = 2000² × 4.0 = 16 MW (32%). At 275 kV: I = 182 A, loss = 182² × 4.0 = 0.13 MW (0.26%). Stepping up the voltage reduces the current and the I²R loss enormously.",
      successCriteria: ["Currents 2000 A and 182 A", "Losses 16 MW and 0.13 MW", "Higher voltage → lower current → much lower loss"],
    },
  },
};
