import { defineQuestions } from "./authoring";

const S = "wjec-alevel-chemistry";

export const chemistryQuestions = defineQuestions([
  {
    slug: "chem-titration-moles",
    subjectId: S,
    topics: ["moles"],
    stem: "25.0 cm³ of 0.100 mol dm⁻³ sodium hydroxide was titrated against sulfuric acid. The mean titre was 22.4 cm³.\n\n2NaOH + H₂SO₄ → Na₂SO₄ + 2H₂O",
    difficulty: 3,
    verification: "checked",
    reviewer: "authored/WJEC-2024-v1-review",
    lastChecked: "2026-08-01",
    specVersion: "2024-1.0",
    aos: ["AO2"],
    parts: [
      {
        prompt: "Calculate the concentration of the sulfuric acid in mol dm⁻³.",
        marks: 4,
        scheme: [
          "Moles of NaOH = 0.0250 x 0.100 = 2.50 x 10^-3 mol",
          "Uses the 2:1 ratio to give moles of H2SO4 = 1.25 x 10^-3 mol",
          "Divides by the titre volume in dm^3: 1.25 x 10^-3 / 0.0224",
          "Concentration = 0.0558 mol dm^-3 (3 significant figures)",
        ],
        specPointIds: ["wjec-alevel-chemistry.moles.sp-01"],
        learningClaims: ["calculate the concentration of the sulfuric acid in mol dm⁻³."],
        answer:
          "n(NaOH) = cV = 0.100 × 0.0250 = 2.50 × 10⁻³ mol. From the equation, 2 mol NaOH react with 1 mol H₂SO₄, so n(H₂SO₄) = 1.25 × 10⁻³ mol. c = n/V = 1.25 × 10⁻³ / 0.0224 = 0.0558 mol dm⁻³.",
      },
      {
        prompt: "State one reason why several titrations are carried out and concordant results averaged.",
        marks: 1,
        scheme: ["Improves reliability / reduces the effect of random error"],
        answer:
          "Averaging concordant titres reduces the effect of random error and so improves the reliability of the mean titre.",
      },
    ],
  },
  {
    slug: "chem-equilibrium-lechatelier",
    subjectId: S,
    topics: ["equilibria"],
    stem: "The Haber process reaches equilibrium: N₂(g) + 3H₂(g) ⇌ 2NH₃(g), ΔH = −92 kJ mol⁻¹.",
    difficulty: 3,
    verification: "checked",
    reviewer: "authored/WJEC-2024-v1-review",
    lastChecked: "2026-08-01",
    specVersion: "2024-1.0",
    aos: ["AO2"],
    parts: [
      {
        prompt: "Explain the effect of increasing the temperature on the equilibrium yield of ammonia.",
        marks: 3,
        scheme: [
          "The forward reaction is exothermic",
          "Raising temperature shifts the equilibrium in the endothermic (reverse) direction to oppose the change",
          "So the yield of ammonia decreases and Kp decreases",
        ],
        specPointIds: ["wjec-alevel-chemistry.moles.sp-01"],
        learningClaims: ["calculate the concentration of the sulfuric acid in mol dm⁻³."],
        answer:
          "The forward reaction is exothermic (ΔH negative). By Le Chatelier's principle, raising the temperature shifts the position of equilibrium in the endothermic direction — here the reverse reaction — to oppose the increase. The yield of ammonia therefore decreases, and Kp decreases because only temperature changes the value of the equilibrium constant.",
      },
      {
        prompt: "Explain why a catalyst is used even though it does not increase the equilibrium yield.",
        marks: 2,
        scheme: [
          "A catalyst provides an alternative route of lower activation energy",
          "Equilibrium is reached faster, which makes the process economic at a lower temperature",
        ],
        specPointIds: ["wjec-alevel-chemistry.equilibria.sp-01"],
        learningClaims: ["explain the effect of increasing the temperature on the equilibrium yield of amm"],
        answer:
          "A catalyst provides an alternative reaction pathway with a lower activation energy, so equilibrium is reached more quickly. It speeds forward and reverse reactions equally, so the position of equilibrium is unchanged — but the process becomes economic at a lower temperature, where the yield is higher.",
      },
    ],
  },
  {
    slug: "chem-weak-acid-ph",
    subjectId: S,
    topics: ["acids-bases"],
    stem: "Ethanoic acid has Ka = 1.75 × 10⁻⁵ mol dm⁻³ at 298 K.",
    difficulty: 4,
    verification: "checked",
    reviewer: "authored/WJEC-2024-v1-review",
    lastChecked: "2026-08-01",
    specVersion: "2024-1.0",
    aos: ["AO2"],
    parts: [
      {
        prompt: "Calculate the pH of a 0.100 mol dm⁻³ solution of ethanoic acid.",
        marks: 4,
        scheme: [
          "States Ka = [H+]^2 / [HA] with the usual approximations",
          "[H+] = square root of (1.75 x 10^-5 x 0.100)",
          "[H+] = 1.32 x 10^-3 mol dm^-3",
          "pH = 2.88 (accept 2.9)",
        ],
        specPointIds: ["wjec-alevel-chemistry.acids-bases.sp-01"],
        learningClaims: ["calculate the ph of a 0.100 mol dm⁻³ solution of ethanoic acid."],
        answer:
          "For a weak acid, Ka = [H⁺]²/[HA], assuming [H⁺] = [A⁻] and that dissociation is negligible compared with [HA]. So [H⁺] = √(1.75 × 10⁻⁵ × 0.100) = 1.32 × 10⁻³ mol dm⁻³ and pH = −log₁₀(1.32 × 10⁻³) = 2.88.",
      },
      {
        prompt: "Explain how a buffer made from ethanoic acid and sodium ethanoate resists a decrease in pH when acid is added.",
        marks: 3,
        scheme: [
          "The buffer contains a large reservoir of ethanoate ions",
          "Added H+ ions react with ethanoate ions to form ethanoic acid",
          "The equilibrium shifts to the left so [H+] and hence pH change only slightly",
        ],
        specPointIds: ["wjec-alevel-chemistry.acids-bases.sp-01"],
        learningClaims: ["calculate the ph of a 0.100 mol dm⁻³ solution of ethanoic acid."],
        answer:
          "The solution contains a high concentration of ethanoate ions from the salt. Added H⁺ reacts with these ethanoate ions: CH₃COO⁻ + H⁺ → CH₃COOH. The equilibrium CH₃COOH ⇌ CH₃COO⁻ + H⁺ shifts to the left, so most added H⁺ is removed and [H⁺] — and therefore pH — changes only slightly.",
      },
    ],
  },
  {
    slug: "chem-organic-mechanism",
    subjectId: S,
    topics: ["hydrocarbons"],
    stem: "2-bromopropane reacts with warm aqueous sodium hydroxide.",
    difficulty: 3,
    verification: "checked",
    reviewer: "authored/WJEC-2024-v1-review",
    lastChecked: "2026-08-01",
    specVersion: "2024-1.0",
    aos: ["AO2"],
    parts: [
      {
        prompt: "Name the mechanism and the organic product, and explain the role of the hydroxide ion.",
        marks: 4,
        scheme: [
          "Nucleophilic substitution",
          "The product is propan-2-ol",
          "OH- acts as a nucleophile, donating a lone pair of electrons",
          "It attacks the carbon atom bearing the halogen, which is electron deficient (delta positive)",
        ],
        specPointIds: ["wjec-alevel-chemistry.hydrocarbons.sp-01"],
        learningClaims: ["name the mechanism and the organic product, and explain the role of the hydroxid"],
        answer:
          "The mechanism is nucleophilic substitution and the product is propan-2-ol. The hydroxide ion acts as a nucleophile: it donates a lone pair of electrons to the δ+ carbon atom bonded to bromine, which is electron deficient because bromine is more electronegative. The C–Br bond breaks heterolytically and the bromide ion leaves.",
      },
      {
        prompt: "Explain why 2-iodopropane hydrolyses faster than 2-chloropropane.",
        marks: 2,
        scheme: [
          "The C-I bond enthalpy is lower than the C-Cl bond enthalpy",
          "So the C-I bond breaks more easily, even though C-Cl is more polar",
        ],
        specPointIds: ["wjec-alevel-chemistry.hydrocarbons.sp-01"],
        learningClaims: ["name the mechanism and the organic product, and explain the role of the hydroxid"],
        answer:
          "The C–I bond enthalpy is lower than that of C–Cl, so the C–I bond breaks more easily and the rate is faster. Bond enthalpy, not bond polarity, controls the rate here — C–Cl is the more polar bond but is also the stronger one.",
      },
    ],
  },
  {
    slug: "chem-mcq-electron-config",
    subjectId: S,
    topics: ["atomic-structure"],
    stem: "What is the electron configuration of the Fe²⁺ ion?",
    options: ["1s² 2s² 2p⁶ 3s² 3p⁶ 3d⁴ 4s²", "1s² 2s² 2p⁶ 3s² 3p⁶ 3d⁶", "1s² 2s² 2p⁶ 3s² 3p⁶ 3d⁵ 4s¹", "1s² 2s² 2p⁶ 3s² 3p⁶ 3d⁸"],
    correctIndex: 1,
    difficulty: 3,
    verification: "checked",
    reviewer: "authored/WJEC-2024-v1-review",
    lastChecked: "2026-08-01",
    specVersion: "2024-1.0",
    aos: ["AO2"],
    parts: [
      {
        prompt: "Select the correct option.",
        marks: 1,
        scheme: ["The 4s electrons are removed first, leaving 3d6"],
        specPointIds: ["wjec-alevel-chemistry.atomic-structure.sp-04"],
        learningClaims: ["write electron configurations for transition metal ions"],
        answer:
          "Fe is [Ar] 3d⁶ 4s². The 4s electrons are removed first on ionisation, so Fe²⁺ is 1s² 2s² 2p⁶ 3s² 3p⁶ 3d⁶.",
      },
    ],
  },
  {
    slug: "chem-energetics-hess",
    subjectId: S,
    topics: ["energetics"],
    stem: "Use the standard enthalpies of formation below to calculate the enthalpy change of combustion of methane.\n\nΔHf: CH₄(g) = −74.8, CO₂(g) = −393.5, H₂O(l) = −285.8 kJ mol⁻¹",
    difficulty: 3,
    verification: "checked",
    reviewer: "authored/WJEC-2024-v1-review",
    lastChecked: "2026-08-01",
    specVersion: "2024-1.0",
    aos: ["AO2"],
    parts: [
      {
        prompt: "Calculate ΔHc for methane.",
        marks: 4,
        scheme: [
          "Writes the balanced equation CH4 + 2O2 -> CO2 + 2H2O",
          "Uses Hess's law: sum of products minus sum of reactants",
          "Substitutes: (-393.5 + 2 x -285.8) - (-74.8)",
          "Answer -890.3 kJ mol^-1",
        ],
        specPointIds: ["wjec-alevel-chemistry.energetics.sp-03"],
        learningClaims: ["calculate enthalpy change using Hess law from formation enthalpies"],
        answer:
          "CH₄(g) + 2O₂(g) → CO₂(g) + 2H₂O(l). By Hess's law, ΔH = ΣΔHf(products) − ΣΔHf(reactants) = [−393.5 + 2(−285.8)] − [−74.8 + 0] = −965.1 + 74.8 = −890.3 kJ mol⁻¹. ΔHf of O₂ is zero because it is an element in its standard state.",
      },
    ],
  },

  {
    slug: "chem-bonding-vsepr",
    subjectId: S,
    topics: ["bonding"],
    stem: "Ammonia NH₃ has bond angle 107° while methane CH₄ has 109.5°.",
    difficulty: 3,
    verification: "checked",
    reviewer: "authored/WJEC-2024-v1-review",
    lastChecked: "2026-08-01",
    specVersion: "2024-1.0",
    aos: ["AO1","AO2"],
    parts: [
      {
        prompt: "Explain the difference using VSEPR.",
        marks: 3,
        scheme: ["Both have four electron pairs around N/C", "Lone pair repels more than bonding pair", "So NH₃ is compressed from tetrahedral"],
        specPointIds: ["wjec-alevel-chemistry.bonding.sp-04"],
        learningClaims: ["predict molecular shapes and bond angles using VSEPR"],
        answer: "Both central atoms have four pairs. In NH₃ one is a lone pair which repels more strongly than bonding pairs, compressing the H–N–H angle from 109.5° to 107° (pyramidal). CH₄ has four bonding pairs and is tetrahedral.",
      },
    ],
  },
  {
    slug: "chem-kinetics-maxwell",
    subjectId: S,
    topics: ["kinetics"],
    stem: "Sketch Maxwell–Boltzmann distributions for a gas at 300 K and 400 K on the same axes.",
    difficulty: 3,
    verification: "checked",
    reviewer: "authored/WJEC-2024-v1-review",
    lastChecked: "2026-08-01",
    specVersion: "2024-1.0",
    aos: ["AO2"],
    parts: [
      {
        prompt: "Describe the two differences and explain the effect on reaction rate.",
        marks: 4,
        scheme: ["Higher T: peak lower and broader, shifted to higher energy", "Area under curve same (total molecules)", "More molecules exceed Ea at higher T", "So rate increases even though Maxwell tail is small"],
        specPointIds: ["wjec-alevel-chemistry.kinetics.sp-03"],
        learningClaims: ["interpret Maxwell–Boltzmann distributions for different temperatures"],
        answer: "At 400 K the peak is lower, broader and shifted right; area is unchanged. More of the distribution lies above Ea, so collision frequency above the threshold — and hence rate — increases.",
      },
    ],
  },
]);
