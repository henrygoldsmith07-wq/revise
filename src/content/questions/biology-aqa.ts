// AQA A-level Biology — same authored questions retargeted to AQA spec points (closest to WJEC).
import { defineQuestions } from "./authoring";

const S = "aqa-alevel-biology";

export const biologyAqaQuestions = defineQuestions([
  {
    slug: "bio-enzyme-inhibition-aqa",
    subjectId: S,
    topics: ["enzymes"],
    stem: "An investigation compared the rate of an enzyme-controlled reaction with and without an inhibitor. With the inhibitor present, Vmax was unchanged but a higher substrate concentration was needed to reach it.",
    difficulty: 3,
    verification: "checked",
    reviewer: "authored/WJEC-2024-v1-review",
    lastChecked: "2026-08-01",
    specVersion: "2024-1.0",
    aos: ["AO2"],
    parts: [
      {
        prompt: "Identify the type of inhibition and justify your answer.",
        marks: 3,
        scheme: [
          "Competitive inhibition",
          "Vmax is unchanged because at high substrate concentration the substrate outcompetes the inhibitor",
          "The inhibitor binds to the active site, so more substrate is needed for the same rate",
        ],
        specPointIds: ["aqa-alevel-biology.enzymes.sp-01"],
        learningClaims: ["identify the type of inhibition and justify your answer."],
        answer:
          "This is competitive inhibition. The inhibitor has a similar shape to the substrate and binds to the active site, so substrate and inhibitor compete. At high substrate concentrations the substrate outcompetes the inhibitor, so Vmax is still reached — but a higher substrate concentration is needed to get there.",
      },
      {
        prompt: "Explain why raising the temperature above the optimum decreases the rate of reaction.",
        marks: 3,
        scheme: [
          "Increased vibration breaks the hydrogen and ionic bonds holding the tertiary structure",
          "The active site changes shape so it is no longer complementary to the substrate",
          "Fewer enzyme-substrate complexes form so the rate falls; the enzyme is denatured",
        ],
        specPointIds: ["aqa-alevel-biology.enzymes.sp-01"],
        learningClaims: ["identify the type of inhibition and justify your answer."],
        answer:
          "Above the optimum, molecules vibrate more and the weak hydrogen and ionic interactions maintaining the tertiary structure break. The active site changes shape and is no longer complementary to the substrate, so fewer enzyme–substrate complexes form and the rate falls. The enzyme is denatured and this is not reversible.",
      },
    ],
  },
  {
    slug: "bio-transport-osmosis-aqa",
    subjectId: S,
    topics: ["membranes-transport"],
    stem: "Plant tissue was placed in a series of sucrose solutions of known water potential and the change in mass recorded.",
    difficulty: 3,
    verification: "checked",
    reviewer: "authored/WJEC-2024-v1-review",
    lastChecked: "2026-08-01",
    specVersion: "2024-1.0",
    aos: ["AO2"],
    parts: [
      {
        prompt: "Explain why the tissue gained mass in the most dilute solution.",
        marks: 3,
        scheme: [
          "The solution has a higher (less negative) water potential than the cells",
          "Water moves into the cells by osmosis down a water potential gradient",
          "Water crosses the partially permeable membrane, through aquaporins, so mass increases",
        ],
        specPointIds: ["aqa-alevel-biology.membranes-transport.sp-01"],
        learningClaims: ["explain why the tissue gained mass in the most dilute solution."],
        answer:
          "The dilute solution has a higher (less negative) water potential than the cell contents. Water therefore moves down the water potential gradient into the cells by osmosis, across the partially permeable plasma membrane and through aquaporins, so the tissue gains mass.",
      },
      {
        prompt: "State how the point at which there is no change in mass can be used.",
        marks: 2,
        scheme: [
          "At zero change in mass there is no net movement of water",
          "So the water potential of the solution equals the water potential of the cells",
        ],
        specPointIds: ["aqa-alevel-biology.membranes-transport.sp-01"],
        learningClaims: ["explain why the tissue gained mass in the most dilute solution."],
        answer:
          "Where the mass change is zero there is no net osmosis, so the water potential of the external solution equals the water potential of the cells — reading this value off the graph gives the tissue's water potential.",
      },
    ],
  },
  {
    slug: "bio-respiration-chemiosmosis-aqa",
    subjectId: S,
    topics: ["respiration"],
    stem: "Describe how ATP is synthesised during oxidative phosphorylation.",
    difficulty: 4,
    verification: "checked",
    reviewer: "authored/WJEC-2024-v1-review",
    lastChecked: "2026-08-01",
    specVersion: "2024-1.0",
    aos: ["AO2"],
    parts: [
      {
        prompt: "Give a full account.",
        marks: 6,
        scheme: [
          "Reduced NAD and reduced FAD are oxidised, releasing electrons",
          "Electrons pass along carriers in the inner mitochondrial membrane, losing energy at each transfer",
          "The energy released is used to pump protons from the matrix into the intermembrane space",
          "A proton gradient (electrochemical gradient) is established across the inner membrane",
          "Protons return to the matrix through ATP synthase by chemiosmosis",
          "Oxygen is the final electron acceptor, combining with electrons and protons to form water",
        ],
        specPointIds: ["aqa-alevel-biology.respiration.sp-01"],
        learningClaims: ["state how the point at which there is no change in mass can be used."],
        answer:
          "Reduced NAD and reduced FAD are oxidised at the inner mitochondrial membrane, releasing electrons. These pass along a chain of electron carriers, losing energy at each transfer. That energy pumps protons from the matrix into the intermembrane space, establishing an electrochemical gradient. Protons then diffuse back into the matrix through ATP synthase, and this flow (chemiosmosis) drives the phosphorylation of ADP to ATP. Oxygen acts as the final electron acceptor, combining with electrons and protons to form water.",
      },
    ],
  },
  {
    slug: "bio-genetics-chi-squared-aqa",
    subjectId: S,
    topics: ["genetics-inheritance"],
    stem: "A dihybrid cross between two heterozygous plants produced 160 offspring: 85 tall red, 32 tall white, 29 short red, 14 short white. The expected ratio is 9:3:3:1.",
    difficulty: 4,
    verification: "checked",
    reviewer: "authored/WJEC-2024-v1-review",
    lastChecked: "2026-08-01",
    specVersion: "2024-1.0",
    aos: ["AO2"],
    parts: [
      {
        prompt: "Calculate the expected numbers and the chi-squared value.",
        marks: 4,
        scheme: [
          "Expected values 90, 30, 30, 10",
          "Uses chi-squared = sum of (O - E)^2 / E",
          "Correct individual terms 0.28, 0.13, 0.03, 1.6",
          "Chi-squared = 2.04 (accept 2.0 to 2.1)",
        ],
        specPointIds: ["aqa-alevel-biology.genetics-inheritance.sp-01"],
        learningClaims: ["calculate the expected numbers and the chi-squared value."],
        answer:
          "Expected: 160 × 9/16 = 90, 160 × 3/16 = 30, 30, and 160 × 1/16 = 10. χ² = (85−90)²/90 + (32−30)²/30 + (29−30)²/30 + (14−10)²/10 = 0.28 + 0.13 + 0.03 + 1.60 = 2.04.",
      },
      {
        prompt: "The critical value at p = 0.05 with 3 degrees of freedom is 7.82. State and explain your conclusion.",
        marks: 3,
        scheme: [
          "The calculated value 2.04 is less than the critical value 7.82",
          "So the difference between observed and expected is due to chance",
          "The null hypothesis is not rejected: the results fit the 9:3:3:1 ratio",
        ],
        specPointIds: ["aqa-alevel-biology.genetics-inheritance.sp-01"],
        learningClaims: ["calculate the expected numbers and the chi-squared value."],
        answer:
          "χ² = 2.04 is less than the critical value of 7.82, so the probability that the difference is due to chance alone is greater than 0.05. The null hypothesis is not rejected — the observed results are consistent with a 9:3:3:1 ratio and therefore with independent assortment of the two genes.",
      },
    ],
  },
  {
    slug: "bio-mcq-photosynthesis-aqa",
    subjectId: S,
    topics: ["photosynthesis"],
    stem: "In the light-dependent reactions of photosynthesis, oxygen is produced by:",
    options: [
      "the reduction of NADP",
      "the photolysis of water",
      "the decarboxylation of GP",
      "the oxidation of carbon dioxide",
    ],
    correctIndex: 1,
    difficulty: 2,
    verification: "checked",
    reviewer: "authored/WJEC-2024-v1-review",
    lastChecked: "2026-08-01",
    specVersion: "2024-1.0",
    aos: ["AO2"],
    parts: [
      {
        prompt: "Select the correct option.",
        marks: 1,
        scheme: ["Photolysis of water splits water into protons, electrons and oxygen"],
        specPointIds: ["aqa-alevel-biology.photosynthesis.sp-02"],
        learningClaims: ["explain photolysis of water in light-dependent reactions"],
        answer:
          "Photolysis of water: light energy splits water into protons, electrons and oxygen. The oxygen is a by-product; the electrons replace those lost from chlorophyll.",
      },
    ],
  },
  {
    slug: "bio-homeostasis-adh-aqa",
    subjectId: S,
    topics: ["homeostasis"],
    stem: "A person drinks two litres of water in a short period.",
    difficulty: 3,
    verification: "checked",
    reviewer: "authored/WJEC-2024-v1-review",
    lastChecked: "2026-08-01",
    specVersion: "2024-1.0",
    aos: ["AO2"],
    parts: [
      {
        prompt: "Explain how the body responds to restore normal blood water potential.",
        marks: 5,
        scheme: [
          "Blood water potential rises (becomes less negative)",
          "Detected by osmoreceptors in the hypothalamus",
          "Less ADH is released from the posterior pituitary",
          "Fewer aquaporins are inserted into the collecting duct membrane, so it is less permeable to water",
          "Less water is reabsorbed, so a large volume of dilute urine is produced — an example of negative feedback",
        ],
        specPointIds: ["aqa-alevel-biology.homeostasis.sp-04"],
        learningClaims: ["explain osmoregulation and ADH action in water balance"],
        answer:
          "Blood water potential rises. Osmoreceptors in the hypothalamus detect this, and less ADH is released from the posterior pituitary. With less ADH, fewer aquaporins are inserted into the collecting duct walls, so they are less permeable to water. Less water is reabsorbed, and a large volume of dilute urine is produced, returning water potential toward normal by negative feedback.",
      },
    ],
  },

  {
    slug: "bio-cell-microscopy-aqa",
    subjectId: S,
    topics: ["cell-structure"],
    stem: "A chloroplast is 5.0 μm long and appears 25 mm long in a micrograph.",
    difficulty: 2,
    verification: "checked",
    reviewer: "authored/WJEC-2024-v1-review",
    lastChecked: "2026-08-01",
    specVersion: "2024-1.0",
    aos: ["AO2"],
    parts: [
      {
        prompt: "Calculate the magnification.",
        marks: 2,
        scheme: ["Converts to same units: 25 mm = 25000 μm", "Magnification = 25000/5.0 = 5000×"],
        specPointIds: ["aqa-alevel-biology.cell-structure.sp-03"],
        learningClaims: ["calculate magnification and explain resolution"],
        answer: "25 mm = 25 000 μm. Magnification = image/actual = 25 000/5.0 = 5 000×.",
      },
    ],
  },
  {
    slug: "bio-biodiversity-simpson-aqa",
    subjectId: S,
    topics: ["biodiversity"],
    stem: "A quadrat contains 10 daisies, 5 clovers and 5 buttercups.",
    difficulty: 3,
    verification: "checked",
    reviewer: "authored/WJEC-2024-v1-review",
    lastChecked: "2026-08-01",
    specVersion: "2024-1.0",
    aos: ["AO2"],
    parts: [
      {
        prompt: "Calculate Simpson diversity index D.",
        marks: 3,
        scheme: ["N=20", "Σn(n-1)=90+20+20=130", "D=1−130/(20×19)=1−0.342=0.658"],
        specPointIds: ["aqa-alevel-biology.biodiversity.sp-03"],
        learningClaims: ["calculate Simpson diversity index from quadrat data"],
        answer: "N=20, Σn(n−1)=90+20+20=130, D=1−130/380=0.66.",
      },
    ],
  },
]);
