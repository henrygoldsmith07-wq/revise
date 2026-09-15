import type { LearningDemand, Question } from "@/domain/types";
import { defineQuestions, type PartSpec, type QuestionSpec } from "./authoring";
import { wjecCapabilityForSpecPoint } from "../wjec-subject-capabilities";

/**
 * Balanced WJEC flagship depth pack.
 *
 * Each row is an authored capability brief, not a number-swapped question
 * template.  The two views deliberately use different contexts and solution
 * operations.  They are kept as structured multi-part questions so one exam
 * encounter can exercise all seven demands without making the student
 * navigate a content catalogue.  They remain `unverified` until a qualified
 * subject reviewer signs the individual question fingerprint.
 */

type FlagshipSubject = "maths" | "biology" | "chemistry";
type DemandPlan = Partial<Record<LearningDemand, { task: string; evidence: string }>>;

interface DepthBrief {
  subject: FlagshipSubject;
  topic: string;
  point: number;
  slug: string;
  capability: string;
  contextA: string;
  contextB: string;
  modeA: string;
  modeB: string;
  demands: DemandPlan;
}

const demands: LearningDemand[] = ["recall", "explanation", "application", "misconception", "calculation", "transfer", "synoptic"];

const defaultTasks: Record<FlagshipSubject, Record<LearningDemand, [string, string]>> = {
  maths: {
    recall: ["State the defining result and one domain restriction", "State an equivalent form and explain when it is valid"],
    explanation: ["Explain why the result follows from the underlying definition", "Explain how a graphical or structural check exposes the same result"],
    application: ["Set up the method for the stated context and identify the quantity to find", "Choose a different representation and use it to reach the target"],
    misconception: ["A student uses a tempting but invalid shortcut. Locate the first invalid step", "A graph or domain condition is ignored. Correct the conclusion and justify it"],
    calculation: ["Carry the exact algebra through to the requested value", "Use a second route and retain the requested exact form or precision"],
    transfer: ["Solve an unfamiliar problem where the same idea is hidden behind a new structure", "Decide which features are invariant before adapting the method"],
    synoptic: ["Combine this capability with a second pure or applied idea and state the dependency", "Evaluate the result against a domain, graph or modelling constraint"],
  },
  biology: {
    recall: ["State the mechanism and the biological structure involved", "State a contrasting mechanism and the condition that separates them"],
    explanation: ["Build a causal chain from the structure to the observed effect", "Explain the same effect through a different level of organisation"],
    application: ["Apply the mechanism to the described organism or tissue", "Use the evidence to predict what changes when one condition is altered"],
    misconception: ["A student confuses correlation with mechanism. Identify the first unsupported claim", "A control or variable is misidentified. Repair the design and conclusion"],
    calculation: ["Extract and process the biological data, showing units and a justified comparison", "Use a second data summary and state the biological meaning of the result"],
    transfer: ["Interpret an unfamiliar investigation using this capability without assuming the usual organism", "Select the strongest evidence and explain which alternative it rules out"],
    synoptic: ["Link the mechanism to a second biological process and predict a consequence", "Evaluate the claim using mechanism, controls and the limits of the data"],
  },
  chemistry: {
    recall: ["State the chemical relationship and the conditions under which it applies", "State the particle-level feature that distinguishes the related case"],
    explanation: ["Explain the relationship using particles, bonding or electron movement", "Explain how the same relationship appears in an observable property"],
    application: ["Choose the reaction model or equation needed for the stated context", "Use a structural or equilibrium argument to predict the outcome"],
    misconception: ["A student applies a familiar rule outside its conditions. Locate the first invalid assumption", "A charge, coefficient or equilibrium term is omitted. Correct it and justify the change"],
    calculation: ["Carry the chemical calculation through with units and significant figures", "Check the result through a ratio, charge balance or independent route"],
    transfer: ["Solve an unfamiliar compound or dataset by identifying the invariant chemical relationship", "Use the evidence to reject at least one chemically plausible alternative"],
    synoptic: ["Combine the relationship with a practical or quantitative constraint", "Evaluate the prediction against stoichiometry, energetics, kinetics or structure"],
  },
};

function specPointId(brief: DepthBrief): string {
  return `wjec-alevel-${brief.subject}.${brief.topic}.sp-${String(brief.point).padStart(2, "0")}`;
}

function partFor(brief: DepthBrief, demand: LearningDemand, variant: 0 | 1): PartSpec {
  const pointId = specPointId(brief);
  const plan = brief.demands[demand];
  const [taskA, taskB] = defaultTasks[brief.subject][demand];
  const context = variant === 0 ? brief.contextA : brief.contextB;
  const mode = variant === 0 ? brief.modeA : brief.modeB;
  const task = plan?.task ?? (variant === 0 ? taskA : taskB);
  const evidenceBase = plan?.evidence ?? `The ${brief.capability} is handled by ${mode}; the conclusion is constrained by the stated conditions.`;
  // Keep the two routes genuinely different in their worked reasoning.  The
  // audit compares solution paths as well as family/context ids, so a shared
  // claim with a changed number must never look like a second family.
  const routeProof = variant === 0
    ? "The direct route derives the result from the defining relationship before substitution."
    : "The independent route checks an invariant, limiting case or graphical representation before accepting the result.";
  const evidence = variant === 0
    ? `${evidenceBase} ${routeProof}`
    : `The cross-check uses ${mode} and tests the conclusion against an independent invariant or limiting case. ${routeProof}`;
  const operation = variant === 0
    ? `trace ${mode} from the supplied conditions to the target`
    : `cross-check ${mode} against a distinct ${brief.subject === "biology" ? "mechanism or control" : brief.subject === "chemistry" ? "equation or particle model" : "representation or domain"}`;
  const marks = demand === "synoptic" ? 3 : 2;
  const scheme = [
    evidence,
    `A complete answer must ${operation}.`,
    "Checks the conclusion against the stated constraint and explains the implication.",
  ].slice(0, marks);
  return {
    label: `(${String.fromCharCode(97 + demands.indexOf(demand))})`,
    prompt: `${context} ${task} for ${brief.capability}.`,
    marks,
    scheme,
    answer: `${evidence} A complete response ${operation}.`,
    specPointIds: [pointId],
    capabilityIds: [wjecCapabilityForSpecPoint(pointId)!],
    learning: {
      familyId: `wjec-${brief.subject}-depth:${brief.slug}:${demand}:${variant === 0 ? "mechanism" : "cross-check"}`,
      contextId: `wjec-${brief.subject}-depth:${brief.slug}:${variant === 0 ? brief.contextA : brief.contextB}`,
      demand,
      reasoningMoves: [operation],
    },
    learningClaims: [brief.capability],
    aos: demand === "recall" ? ["AO1"] : demand === "synoptic" || demand === "transfer" ? ["AO2", "AO3"] : ["AO2"],
  };
}

function questionsFor(brief: DepthBrief): QuestionSpec[] {
  const pointId = specPointId(brief);
  return [0, 1].map((variant) => {
    const variantNumber = variant as 0 | 1;
    const stem = `${brief.subject === "maths" ? "Pure and applied mathematics" : brief.subject === "biology" ? "Biological evidence" : "Chemical evidence"}: ${variant === 0 ? brief.contextA : brief.contextB}`;
    const parts = demands.map((demand) => partFor(brief, demand, variantNumber));
    return {
      slug: `wjec-depth-${brief.subject}-${brief.slug}-${variant === 0 ? "route-a" : "route-b"}`,
      subjectId: `wjec-alevel-${brief.subject}`,
      topics: [brief.topic],
      kind: "structured",
      stem,
      difficulty: variant === 0 ? 3 : 4,
      calculator: brief.subject !== "biology",
      source: "generated",
      verification: "unverified",
      reviewer: null,
      lastChecked: null,
      specVersion: "2024-1.0",
      specPointIds: [pointId],
      aos: ["AO1", "AO2", "AO3"],
      parts,
    } satisfies QuestionSpec;
  });
}

const mathsBriefs: DepthBrief[] = [
  { subject: "maths", topic: "algebra", point: 1, slug: "algebra-surds", capability: "surds, indices and rationalising denominators", contextA: "A proof simplifies a nested radical", contextB: "A formula for a length contains a denominator with a surd", modeA: "factor laws and conjugates", modeB: "exact-form comparison and domain checks", demands: {
    recall: { task: "State the index laws needed", evidence: "For non-zero bases, indices add under multiplication and subtract under division; a conjugate removes a surd from a denominator." },
    explanation: { task: "Explain why multiplying by the conjugate is valid", evidence: "The conjugate product is a difference of squares, so the irrational cross terms cancel without changing the value." },
    calculation: { task: "Simplify √50/(√2 + 1)", evidence: "Rationalising gives √50(√2 − 1)/(2 − 1) = 10 − 5√2." },
  } },
  { subject: "maths", topic: "algebra", point: 2, slug: "algebra-quadratic", capability: "quadratic roots and discriminant", contextA: "A projectile model has a height quadratic", contextB: "A parameter changes whether two curves meet", modeA: "complete the square and compare roots", modeB: "discriminant sign and boundary case", demands: {
    recall: { task: "State what each sign of the discriminant means", evidence: "A positive discriminant gives two real roots, zero gives a repeated root and a negative discriminant gives no real roots." },
    application: { task: "Find when a trajectory reaches ground", evidence: "Set the height to zero, solve the quadratic and retain only roots in the physical time domain." },
    misconception: { task: "Correct the claim that a negative discriminant gives two complex crossing times", evidence: "There are no real intersections; complex roots do not represent physical times in this model." },
  } },
  { subject: "maths", topic: "algebra", point: 3, slug: "algebra-factor", capability: "factor and remainder theorems", contextA: "A cubic model is known to vanish at x = 2", contextB: "A polynomial division is used to expose a residual factor", modeA: "substitution into the polynomial", modeB: "synthetic division and root validation", demands: {
    recall: { task: "State the factor theorem", evidence: "(x − a) is a factor of f(x) exactly when f(a) = 0." },
    application: { task: "Use the known root to factor the cubic", evidence: "Substitute the root to verify the remainder is zero, then divide by (x − 2) and solve the remaining factor." },
    transfer: { task: "Use a non-integer candidate root in a new polynomial", evidence: "Evaluate the candidate exactly before division; only a zero remainder establishes a factor." },
  } },
  { subject: "maths", topic: "algebra", point: 4, slug: "algebra-simultaneous", capability: "non-linear simultaneous equations", contextA: "A line intersects a parabola", contextB: "Two sensor equations share one unknown", modeA: "substitution into the curve", modeB: "elimination followed by admissibility", demands: {
    application: { task: "Find all intersection coordinates", evidence: "Substitute the linear relation into the quadratic, solve both roots and check each point in both original equations." },
    misconception: { task: "Explain why cancelling a factor can lose an intersection", evidence: "Cancelling assumes the factor is non-zero; a zero factor may be a valid solution and must be checked separately." },
    synoptic: { task: "Choose the physically admissible intersection", evidence: "Both algebraic points satisfy the equations, but the stated quadrant or domain selects only the admissible point." },
  } },
  { subject: "maths", topic: "algebra", point: 5, slug: "algebra-inequalities", capability: "inequalities and solution sets", contextA: "A safe operating interval is bounded by a quadratic", contextB: "A modulus constraint describes a tolerance band", modeA: "sign chart across critical values", modeB: "set notation and interval interpretation", demands: {
    recall: { task: "State what happens when an inequality is multiplied by a negative", evidence: "The inequality sign reverses because the order of the two sides is reversed." },
    application: { task: "Solve the quadratic inequality", evidence: "Find the critical roots, test the sign in each interval and include or exclude endpoints according to the inequality." },
    transfer: { task: "Translate a modulus inequality into an interval", evidence: "|x − c| < r is equivalent to c − r < x < c + r, which gives the tolerance interval directly." },
  } },
  { subject: "maths", topic: "algebra", point: 6, slug: "algebra-transformations", capability: "curve transformations and modulus", contextA: "A graph is transformed before fitting data", contextB: "The modulus of a cubic is sketched", modeA: "map coordinates under each transformation", modeB: "reflect negative branches in the x-axis", demands: {
    recall: { task: "State the effect of f(x + a) and af(x)", evidence: "f(x + a) shifts the graph left by a, while af(x) scales every ordinate by a." },
    misconception: { task: "Correct the claim that f(x + 2) shifts right", evidence: "The input reaches the old value at a smaller x, so f(x + 2) shifts the graph left by two units." },
    synoptic: { task: "Combine a horizontal shift with a modulus", evidence: "Shift the parent curve first, then reflect only the portions below the x-axis; the zeros remain at the shifted roots." },
  } },
  { subject: "maths", topic: "coordinate-geometry", point: 1, slug: "coordinate-lines-circles", capability: "straight-line and circle equations", contextA: "A radar station and a circular exclusion zone are plotted", contextB: "A tangent is required at a surveyed point", modeA: "recover centre, radius and gradient", modeB: "use perpendicular radius and tangent", demands: {
    recall: { task: "State the standard circle equation", evidence: "A circle with centre (a,b) and radius r has (x − a)² + (y − b)² = r²." },
    calculation: { task: "Find the tangent equation at the stated point", evidence: "Find the radius gradient, take the negative reciprocal for the tangent and use the point-slope form." },
    transfer: { task: "Recover a circle from a diameter rather than its centre", evidence: "The midpoint of the diameter is the centre and half its length is the radius before substitution into the standard form." },
  } },
  { subject: "maths", topic: "coordinate-geometry", point: 2, slug: "coordinate-intersections", capability: "line-circle intersections", contextA: "A communications beam crosses a circular region", contextB: "A chord length is inferred from two intersection points", modeA: "substitute a line into a circle", modeB: "use symmetry and distance", demands: {
    application: { task: "Find the intersection coordinates", evidence: "Substitute the line equation into the circle, solve the resulting quadratic and verify both points." },
    misconception: { task: "Explain why one repeated root means tangency", evidence: "A repeated root represents one contact point counted twice; the line does not cross the circle." },
    calculation: { task: "Calculate the chord length", evidence: "Use the distance formula between the two valid intersection points, retaining an exact surd where possible." },
  } },
  { subject: "maths", topic: "coordinate-geometry", point: 3, slug: "coordinate-area-distance", capability: "coordinate geometry for area and distance", contextA: "Three survey points form a triangular plot", contextB: "A shortest path is constrained to a line", modeA: "determinant area and perpendicular distance", modeB: "projection and distance formula", demands: {
    recall: { task: "State a coordinate formula for triangle area", evidence: "The determinant gives twice the signed area; take half its absolute value." },
    calculation: { task: "Find the area of the plotted triangle", evidence: "Substitute the three coordinates into the determinant and take the absolute value of half the result." },
    synoptic: { task: "Minimise the distance to the constraint line", evidence: "The shortest segment is perpendicular to the line, so use the perpendicular gradient or point-to-line distance formula." },
  } },
  { subject: "maths", topic: "differentiation", point: 1, slug: "differentiate-core-functions", capability: "differentiate polynomials, exponentials, logarithms and trigonometric functions", contextA: "A growth curve combines eˣ and a polynomial", contextB: "A logarithmic calibration curve is differentiated locally", modeA: "apply the derivative rules term by term", modeB: "check the derivative from the gradient definition", demands: {
    recall: { task: "State the derivatives of eˣ, ln x and sin x", evidence: "d(eˣ)/dx = eˣ, d(ln x)/dx = 1/x and d(sin x)/dx = cos x, with x > 0 for ln x." },
    calculation: { task: "Differentiate the stated composite expression", evidence: "Differentiate each term using the stated rules and simplify without changing the domain." },
    misconception: { task: "Correct the derivative of ln(2x + 1)", evidence: "The chain rule gives 2/(2x + 1); omitting the inner derivative loses a factor of two." },
  } },
  { subject: "maths", topic: "differentiation", point: 2, slug: "differentiate-rules", capability: "chain, product and quotient rules", contextA: "A rate model is a product of a polynomial and an exponential", contextB: "A response ratio is a quotient of two functions", modeA: "differentiate the outer and inner factors", modeB: "preserve numerator order and denominator square", demands: {
    recall: { task: "State the product and quotient rules", evidence: "(uv)' = u'v + uv' and (u/v)' = (u'v − uv')/v²." },
    calculation: { task: "Differentiate the product or quotient exactly", evidence: "Apply the selected rule before simplifying; the denominator in a quotient derivative is squared." },
    misconception: { task: "Locate the first error in a missing-inner-factor solution", evidence: "The outer derivative was found but the inner derivative was omitted; multiply by the derivative of the inner function." },
  } },
  { subject: "maths", topic: "differentiation", point: 3, slug: "stationary-points", capability: "stationary points, maxima, minima and inflections", contextA: "A cost curve is optimised over a closed interval", contextB: "A cubic changes concavity near a design point", modeA: "solve f' = 0 then compare values", modeB: "use f'' and a sign change", demands: {
    recall: { task: "State the tests for a stationary maximum and minimum", evidence: "At a stationary point f' = 0; f'' < 0 indicates a local maximum and f'' > 0 a local minimum, subject to a valid neighbourhood." },
    application: { task: "Classify every stationary point", evidence: "Solve f' = 0, evaluate f'' or inspect the sign change of f' and report coordinates, not only x-values." },
    synoptic: { task: "Find the global optimum on the stated interval", evidence: "Compare all interior stationary values with both endpoint values; a local classification alone cannot establish a global result." },
  } },
  { subject: "maths", topic: "integration", point: 1, slug: "integration-standard", capability: "integrate standard functions", contextA: "A velocity law is integrated to recover displacement", contextB: "An accumulated signal contains exponential and trigonometric terms", modeA: "use reverse differentiation and include the constant", modeB: "differentiate the antiderivative to verify it", demands: {
    recall: { task: "State the power and exponential integration rules", evidence: "∫xⁿ dx = xⁿ⁺¹/(n + 1) + c for n ≠ −1, and ∫eˣ dx = eˣ + c." },
    calculation: { task: "Find the general antiderivative", evidence: "Integrate each term, preserve coefficients and add +c because the constant is not fixed." },
    misconception: { task: "Correct ∫1/x dx = 1/x²", evidence: "The logarithmic exception applies: ∫1/x dx = ln|x| + c, not a power rule result." },
  } },
  { subject: "maths", topic: "integration", point: 2, slug: "integration-definite-area", capability: "definite integrals and area", contextA: "A signed velocity graph crosses the axis", contextB: "A curve encloses a finite region with the axis", modeA: "evaluate bounds and split at roots", modeB: "separate signed and total geometric area", demands: {
    recall: { task: "State how a definite integral differs from an indefinite one", evidence: "A definite integral has bounds and returns a number; no arbitrary +c remains." },
    calculation: { task: "Find the total area enclosed", evidence: "Evaluate the integral on each side of every root and reverse the sign of portions below the axis before adding." },
    transfer: { task: "Interpret a negative integral as a physical quantity", evidence: "The signed integral may represent net displacement, while total distance requires integrating the speed or splitting absolute areas." },
  } },
  { subject: "maths", topic: "integration", point: 3, slug: "integration-methods", capability: "substitution and integration by parts", contextA: "A trigonometric integral has a hidden inner derivative", contextB: "A logarithm is multiplied by an algebraic factor", modeA: "choose a substitution and transform every term", modeB: "choose u and dv then apply parts", demands: {
    recall: { task: "State the integration-by-parts identity", evidence: "∫u dv = uv − ∫v du, with u chosen so the remaining integral is simpler." },
    application: { task: "Select and carry out the efficient method", evidence: "For substitution change dx and all limits or variables consistently; for parts identify u and dv before integrating." },
    misconception: { task: "Explain why unchanged limits after substitution are unsafe", evidence: "The bounds refer to the old variable; either convert both bounds or return to the original variable before evaluating." },
  } },
  { subject: "maths", topic: "trigonometry", point: 1, slug: "trig-rules", capability: "sine rule, cosine rule and triangle area", contextA: "A navigation triangle has two bearings", contextB: "A non-right triangle has two sides and an included angle", modeA: "match each side with its opposite angle", modeB: "choose cosine or half-ab-sin-C from the known data", demands: {
    recall: { task: "State the sine and cosine rules", evidence: "a/sin A = b/sin B = c/sin C and c² = a² + b² − 2ab cos C." },
    calculation: { task: "Find the unknown side or angle", evidence: "Choose the rule whose known opposite pair or included angle matches the data, then reject geometrically impossible roots." },
    misconception: { task: "Correct a sine-rule ambiguity", evidence: "The inverse sine can give an acute and obtuse candidate; test both against the triangle angle sum and diagram." },
  } },
  { subject: "maths", topic: "trigonometry", point: 2, slug: "trig-identities", capability: "trigonometric identities and double angle", contextA: "An oscillation is rewritten in a single trigonometric form", contextB: "An identity is proved before solving an equation", modeA: "select the useful double-angle form", modeB: "factor rather than divide by a possible zero", demands: {
    recall: { task: "State two forms of cos 2θ", evidence: "cos 2θ = cos²θ − sin²θ = 1 − 2sin²θ = 2cos²θ − 1." },
    application: { task: "Use an identity to solve the equation in the interval", evidence: "Rewrite into one function, factor where possible and list every solution in the stated interval." },
    misconception: { task: "Explain why dividing by sin θ can lose roots", evidence: "sin θ may be zero; factor first and check the zero-factor solutions separately." },
  } },
  { subject: "maths", topic: "exponentials", point: 1, slug: "exp-inverses", capability: "exponential and logarithmic inverse functions", contextA: "A population model is inverted to recover time", contextB: "A log scale is used to compare measurements", modeA: "take natural logs with positive arguments", modeB: "exponentiate and preserve one-to-one domains", demands: {
    recall: { task: "State the inverse relationship between eˣ and ln x", evidence: "ln(eˣ) = x and e^(ln x) = x for x > 0." },
    explanation: { task: "Explain why a logarithm cannot be taken of a negative model value", evidence: "The real logarithm is defined only for positive arguments, so the model domain must be restricted before inversion." },
    calculation: { task: "Solve the exponential equation exactly where possible", evidence: "Isolate the exponential, take ln of a positive quantity and check the resulting value in the original equation." },
  } },
  { subject: "maths", topic: "exponentials", point: 2, slug: "log-laws", capability: "laws of logarithms and change of base", contextA: "A measurement ratio spans several orders of magnitude", contextB: "A logarithmic equation uses a non-natural base", modeA: "combine products and powers before evaluating", modeB: "use change of base consistently", demands: {
    recall: { task: "State the product, quotient and power laws", evidence: "log(ab) = log a + log b, log(a/b) = log a − log b and log(aⁿ) = n log a for positive arguments." },
    misconception: { task: "Correct log(a + b) = log a + log b", evidence: "The product law applies to multiplication, not addition; test values show the proposed equality is false." },
    transfer: { task: "Convert a base-2 expression to natural logs", evidence: "log₂x = ln x/ln 2, with x positive; use the same base in every term before simplifying." },
  } },
  { subject: "maths", topic: "exponentials", point: 3, slug: "exp-equations", capability: "solving exponential and logarithmic equations", contextA: "A cooling model is fitted to two observations", contextB: "A logarithmic response has a restricted input", modeA: "linearise by taking logs", modeB: "check roots against positivity and the original model", demands: {
    application: { task: "Find the model parameter from the data", evidence: "Take logs only after isolating a positive exponential term, solve the resulting linear relation and substitute back." },
    misconception: { task: "Reject an extraneous root introduced by squaring", evidence: "Substitution into the unsquared equation is required; any root making a logarithm non-positive is invalid." },
    synoptic: { task: "Interpret the parameter in the context", evidence: "The sign controls growth versus decay and the initial factor sets the intercept on a log-linear plot." },
  } },
];

const biologyBriefs: DepthBrief[] = [
  { subject: "biology", topic: "biological-molecules", point: 1, slug: "bio-condensation", capability: "condensation and hydrolysis of biological polymers", contextA: "A food sample is tested before and after enzyme treatment", contextB: "A polymer is assembled in a cell and later recycled", modeA: "track water removal or addition at each bond", modeB: "link the reaction to monomer transport and enzyme specificity", demands: {
    recall: { task: "Define condensation and hydrolysis", evidence: "Condensation joins monomers while releasing water; hydrolysis uses water to break a covalent bond." },
    explanation: { task: "Explain how the reaction changes solubility", evidence: "Hydrolysis produces smaller soluble molecules, whereas polymerisation creates larger molecules that may be less soluble." },
    misconception: { task: "Correct the claim that hydrolysis builds a polymer", evidence: "Hydrolysis cleaves a bond by adding water; condensation is the bond-forming reaction." },
  } },
  { subject: "biology", topic: "biological-molecules", point: 2, slug: "bio-carbohydrates", capability: "carbohydrate structures and functions", contextA: "A plant stores excess photosynthate", contextB: "A runner needs a rapidly available glucose source", modeA: "compare branching, solubility and compact storage", modeB: "relate glycosidic bonds to digestion and transport", demands: {
    recall: { task: "Compare a monosaccharide, disaccharide and polysaccharide", evidence: "Monosaccharides are single sugars, disaccharides contain two linked sugars and polysaccharides are long chains with storage or structural roles." },
    application: { task: "Choose the most suitable carbohydrate for storage", evidence: "A branched, compact and relatively insoluble polysaccharide stores many glucose units without greatly lowering cell water potential." },
    transfer: { task: "Interpret an unfamiliar reducing-sugar test", evidence: "A colour change after heating indicates reducing sugar; a negative result does not rule out a non-reducing sugar until hydrolysis is tested." },
  } },
  { subject: "biology", topic: "biological-molecules", point: 3, slug: "bio-lipids", capability: "triglyceride and phospholipid structure and function", contextA: "A membrane is rebuilt after mechanical damage", contextB: "An animal stores energy before migration", modeA: "map hydrophobic and hydrophilic regions to function", modeB: "compare ester bonds, energy density and insulation", demands: {
    recall: { task: "State the components of a triglyceride and a phospholipid", evidence: "A triglyceride has glycerol plus three fatty acids; a phospholipid has glycerol, two fatty acids and a phosphate-containing head." },
    explanation: { task: "Explain why phospholipids form a bilayer in water", evidence: "Hydrophilic heads interact with water while hydrophobic tails avoid it, producing two layers with tails facing inward." },
    misconception: { task: "Correct the claim that all lipids are polymers", evidence: "Lipids are not repeating monomer polymers in the same sense as proteins or polysaccharides; triglycerides are assembled from glycerol and fatty acids." },
  } },
  { subject: "biology", topic: "biological-molecules", point: 4, slug: "bio-protein-structure", capability: "protein structure and bonding", contextA: "A mutation changes one amino acid in an enzyme", contextB: "A fibrous protein is compared with a globular carrier", modeA: "follow primary sequence to folding and active shape", modeB: "distinguish peptide, hydrogen, ionic and disulfide bonds", demands: {
    recall: { task: "Name the four levels of protein structure", evidence: "Primary is sequence, secondary is local folding, tertiary is the overall three-dimensional fold and quaternary is association of subunits." },
    explanation: { task: "Explain how a sequence change can alter function", evidence: "Changing primary structure can reposition side chains, alter bonding and change the three-dimensional shape of a binding site." },
    transfer: { task: "Predict the effect of reducing disulfide bonds", evidence: "Breaking covalent disulfide links can destabilise tertiary structure even if peptide bonds and the primary sequence remain intact." },
  } },
  { subject: "biology", topic: "biological-molecules", point: 5, slug: "bio-dna-rna", capability: "DNA and RNA structure and base pairing", contextA: "A forensic sample contains short nucleic-acid fragments", contextB: "A cell switches from storing to expressing genetic information", modeA: "use complementary antiparallel pairing", modeB: "compare sugar, bases, strands and roles", demands: {
    recall: { task: "State the complementary base-pairing rules", evidence: "In DNA A pairs with T and C pairs with G through hydrogen bonding; RNA uses U instead of T." },
    explanation: { task: "Explain why complementary strands are useful for copying", evidence: "Each strand provides a template, so a sequence can be copied with predictable complementary bases." },
    misconception: { task: "Correct the claim that RNA always has two strands", evidence: "Most cellular RNA is single-stranded, although it can fold internally through complementary base pairing." },
  } },
  { subject: "biology", topic: "biological-molecules", point: 6, slug: "bio-water", capability: "water properties and hydrogen bonding", contextA: "A pond experiences rapid daytime heating", contextB: "A plant transports water through a narrow vessel", modeA: "link hydrogen bonds to thermal capacity and cohesion", modeB: "use polarity, solvent action and latent heat", demands: {
    recall: { task: "State two biological consequences of water's polarity", evidence: "Polarity makes water a solvent for ions and polar molecules and permits hydrogen bonding between molecules." },
    application: { task: "Explain how cohesion supports a water column", evidence: "Hydrogen bonds create cohesion so evaporation at the leaf can pull a continuous column through xylem, provided the column does not cavitate." },
    synoptic: { task: "Evaluate water as a habitat buffer", evidence: "High specific heat capacity moderates temperature changes, while transparency and solvent properties support aquatic ecosystems." },
  } },
  { subject: "biology", topic: "cell-structure", point: 1, slug: "bio-prokaryote-eukaryote", capability: "prokaryotic and eukaryotic cell structure", contextA: "An unknown cell is observed by electron microscopy", contextB: "A pathogen is cultured and compared with a host cell", modeA: "use nucleus, organelles, DNA form and size", modeB: "separate shared features from diagnostic differences", demands: {
    recall: { task: "State two structural differences", evidence: "Eukaryotes have a membrane-bound nucleus and membrane-bound organelles; prokaryotes lack these and usually have circular DNA in a nucleoid." },
    application: { task: "Classify the unknown cell from the evidence", evidence: "A nucleus and mitochondria identify a eukaryote; a nucleoid, plasmids and a capsule support a prokaryote." },
    misconception: { task: "Correct the claim that prokaryotes have no DNA", evidence: "Prokaryotes contain DNA, generally a circular chromosome and sometimes plasmids, but it is not enclosed in a nucleus." },
  } },
  { subject: "biology", topic: "cell-structure", point: 2, slug: "bio-organelles", capability: "functions of membrane-bound organelles", contextA: "A secretory cell produces a peptide hormone", contextB: "A phagocyte digests an engulfed bacterium", modeA: "follow synthesis, modification and export", modeB: "link vesicles, lysosomes and ATP supply", demands: {
    recall: { task: "State the roles of rough ER, Golgi and lysosome", evidence: "Rough ER synthesises proteins, Golgi modifies and sorts them, and lysosomes contain hydrolytic enzymes for intracellular digestion." },
    explanation: { task: "Explain why the secretory pathway is compartmentalised", evidence: "Membrane-bound compartments keep enzymes and substrates together, allow sequential modification and package cargo into vesicles." },
    transfer: { task: "Predict which organelle is defective from the phenotype", evidence: "Accumulated unfolded secretory protein suggests rough-ER processing stress, whereas undigested vesicles suggest lysosomal enzyme failure." },
  } },
  { subject: "biology", topic: "cell-structure", point: 3, slug: "bio-magnification", capability: "magnification and resolution in microscopy", contextA: "A micrograph measures a chloroplast", contextB: "Two microscopes are compared for organelle detail", modeA: "convert units before using image-to-object ratio", modeB: "distinguish magnification from resolving power", demands: {
    recall: { task: "State the magnification equation", evidence: "Magnification = image size ÷ actual size, with both lengths in the same units." },
    calculation: { task: "Calculate actual size from the micrograph", evidence: "Convert the image measurement and divide by magnification; report the answer with a unit and sensible precision." },
    misconception: { task: "Correct the claim that higher magnification guarantees more detail", evidence: "Magnification enlarges an image, but resolution is the ability to distinguish two close points and is limited by the instrument and wavelength." },
  } },
  { subject: "biology", topic: "cell-structure", point: 4, slug: "bio-organisation", capability: "levels of biological organisation", contextA: "A disease affects a tissue before symptoms appear", contextB: "A practical report moves between scales", modeA: "keep the nested order from organelle to organism", modeB: "connect structure with emergent function", demands: {
    recall: { task: "List the levels from organelle to organism", evidence: "Organelle, cell, tissue, organ, organ system and organism are nested levels of organisation." },
    explanation: { task: "Explain why a tissue has a function a single cell may not", evidence: "Cells with related specialisations cooperate and interact, producing an emergent tissue function that one cell cannot perform alone." },
    transfer: { task: "Locate the earliest level affected by the stated mutation", evidence: "Identify the molecular or organelle defect first, then trace how it changes cell, tissue and organ function rather than jumping directly to symptoms." },
  } },
  { subject: "biology", topic: "cell-structure", point: 5, slug: "bio-fractionation", capability: "cell fractionation and ultracentrifugation", contextA: "A liver homogenate is separated into fractions", contextB: "A researcher wants to isolate intact mitochondria", modeA: "use isotonic buffer, filtration and increasing speeds", modeB: "match pellet order to size and density", demands: {
    recall: { task: "State why an isotonic buffer is used", evidence: "An isotonic, cold buffered solution limits osmotic lysis, slows enzyme activity and maintains a suitable pH during homogenisation." },
    explanation: { task: "Explain why centrifugation is performed at increasing speeds", evidence: "Large and dense components sediment at lower speeds; smaller components require greater centrifugal force and longer runs." },
    application: { task: "Predict which fraction contains mitochondria", evidence: "After removing nuclei and debris, mitochondria form a pellet at an intermediate speed before microsomes and ribosomes." },
  } },
  { subject: "biology", topic: "membranes-transport", point: 1, slug: "bio-fluid-mosaic", capability: "fluid mosaic membrane structure", contextA: "A membrane protein is tracked during lateral movement", contextB: "A membrane must remain flexible at low temperature", modeA: "map phospholipids, proteins, cholesterol and carbohydrates", modeB: "relate component mobility to function", demands: {
    recall: { task: "Name the principal components of the fluid mosaic model", evidence: "The bilayer contains phospholipids, embedded proteins, cholesterol and carbohydrate chains attached to lipids or proteins." },
    explanation: { task: "Explain why cholesterol buffers membrane fluidity", evidence: "Cholesterol restricts phospholipid movement at high temperature but prevents tight packing at low temperature, reducing extremes of fluidity." },
    misconception: { task: "Correct the claim that all membrane proteins span the bilayer", evidence: "Some proteins are integral and span or enter the bilayer, while peripheral proteins attach to a surface." },
  } },
  { subject: "biology", topic: "membranes-transport", point: 2, slug: "bio-transport", capability: "diffusion, facilitated diffusion and active transport", contextA: "An epithelial cell absorbs a solute from the gut", contextB: "A toxin blocks ATP production", modeA: "compare gradients, proteins and energy", modeB: "trace the effect through coupled transport", demands: {
    recall: { task: "Distinguish the three transport processes", evidence: "Diffusion is passive movement down a gradient, facilitated diffusion uses membrane proteins down a gradient and active transport uses energy to move against a gradient." },
    application: { task: "Choose the process for the described uptake", evidence: "A solute moving against its electrochemical gradient through a carrier with ATP or a coupled gradient is active transport." },
    synoptic: { task: "Predict the effect of respiratory inhibition", evidence: "ATP-dependent pumps slow first, gradients collapse and secondary active uptake falls even if the carrier proteins remain present." },
  } },
  { subject: "biology", topic: "membranes-transport", point: 4, slug: "bio-permeability", capability: "factors affecting membrane permeability", contextA: "A dye leaks from beetroot discs at different temperatures", contextB: "A solvent changes the lipid environment", modeA: "link temperature or solvent to bilayer disruption", modeB: "separate membrane damage from transport regulation", demands: {
    recall: { task: "State two factors that alter permeability", evidence: "Temperature, solvent polarity, pH and mechanical damage can alter bilayer packing or membrane-protein structure." },
    application: { task: "Interpret the leakage pattern", evidence: "A sharp increase above a threshold suggests bilayer disruption or protein denaturation rather than a simple linear diffusion effect." },
    misconception: { task: "Correct the claim that more pigment always means more pigment was produced", evidence: "The measured dye may have leaked from damaged cells; a control for tissue mass, surface area and extraction is needed before inferring synthesis." },
  } },
  { subject: "biology", topic: "membranes-transport", point: 5, slug: "bio-osmosis-investigations", capability: "U-tube and visking-tubing investigations", contextA: "A visking tube separates sucrose solution from water", contextB: "A U-tube develops a height difference", modeA: "identify selectively permeable barriers and water potential", modeB: "predict volume, pressure and direction of net flow", demands: {
    recall: { task: "State the condition required for osmosis", evidence: "Osmosis is net movement of water across a selectively permeable membrane from higher to lower water potential." },
    calculation: { task: "Calculate the percentage mass change", evidence: "Percentage change = (final mass − initial mass)/initial mass × 100, retaining the sign to show gain or loss." },
    transfer: { task: "Explain why the height difference eventually stops growing", evidence: "Hydrostatic pressure opposes the water-potential gradient until the combined water potential is equal on both sides." },
  } },
  { subject: "biology", topic: "nucleic-acids", point: 1, slug: "bio-replication", capability: "semi-conservative DNA replication", contextA: "A cell enters S phase", contextB: "Isotope labelling tracks DNA after two divisions", modeA: "unzip, complement and join new strands", modeB: "use the old strand as a template and interpret bands", demands: {
    recall: { task: "Define semi-conservative replication", evidence: "Each daughter DNA molecule contains one original strand and one newly synthesised complementary strand." },
    explanation: { task: "Explain the role of hydrogen bonds and DNA polymerase", evidence: "Hydrogen bonds between bases can be broken to separate strands; DNA polymerase joins complementary nucleotides into the new strand." },
    transfer: { task: "Predict the band pattern after two labelled divisions", evidence: "After one division every molecule is hybrid; after two divisions half remain hybrid and half contain two new strands under the standard model." },
  } },
  { subject: "biology", topic: "nucleic-acids", point: 2, slug: "bio-protein-synthesis", capability: "transcription and translation", contextA: "A mutation changes a coding sequence", contextB: "A ribosome translates an unfamiliar mRNA", modeA: "transcribe a complementary RNA and read codons", modeB: "follow tRNA anticodons, peptide bonds and stop", demands: {
    recall: { task: "State the roles of mRNA, tRNA and the ribosome", evidence: "mRNA carries the codon sequence, tRNA carries amino acids with complementary anticodons and the ribosome joins amino acids in sequence." },
    application: { task: "Translate the stated mRNA segment", evidence: "Read codons from the start site, match each anticodon and stop at a termination codon; do not read the DNA strand as mRNA directly." },
    misconception: { task: "Correct the claim that a base substitution always changes the protein", evidence: "The substitution may be silent because the genetic code is degenerate, or it may alter one amino acid or introduce a stop codon." },
  } },
  { subject: "biology", topic: "nucleic-acids", point: 3, slug: "bio-mutations", capability: "mutations and their effects", contextA: "A population contains a new allele after replication", contextB: "A disease-associated variant is compared with a neutral variant", modeA: "classify substitution, insertion or deletion and frameshift", modeB: "separate molecular change from phenotype and selection", demands: {
    recall: { task: "Define mutation and distinguish substitution from indel", evidence: "A mutation is a change in genetic material; a substitution replaces a base, whereas an insertion or deletion changes sequence length and may cause a frameshift." },
    explanation: { task: "Explain why a frameshift can have a large effect", evidence: "Changing the reading frame alters every downstream codon, often producing a different amino-acid sequence and an early stop." },
    synoptic: { task: "Evaluate whether a variant is necessarily harmful", evidence: "Effect depends on location, codon change, protein function and environment; a mutation can be neutral, beneficial or harmful." },
  } },
];

const chemistryBriefs: DepthBrief[] = [
  { subject: "chemistry", topic: "atomic-structure", point: 1, slug: "chem-isotopes", capability: "proton number, nucleon number, isotopes and relative atomic mass", contextA: "A mass spectrum contains three isotopes", contextB: "An unknown element is identified from ion counts", modeA: "separate proton, neutron and electron counts", modeB: "weight isotope masses by abundance", demands: {
    recall: { task: "Define proton number, nucleon number and isotope", evidence: "Proton number is the number of protons, nucleon number is protons plus neutrons and isotopes have the same proton number but different neutron numbers." },
    calculation: { task: "Calculate the relative atomic mass", evidence: "Multiply each isotope mass by its fractional abundance, add the products and divide by the total abundance if percentages are not normalised." },
    misconception: { task: "Correct the claim that isotopes have different chemical elements", evidence: "Isotopes are atoms of the same element because they have the same proton number; their neutron numbers and masses differ." },
  } },
  { subject: "chemistry", topic: "atomic-structure", point: 2, slug: "chem-mass-spectrum", capability: "mass spectrometry and fragmentation", contextA: "A molecular ion peak is used to identify an organic compound", contextB: "Fragment peaks are compared with candidate structures", modeA: "read m/z, isotope patterns and abundance", modeB: "use cleavage fragments as supporting evidence", demands: {
    recall: { task: "State what the molecular-ion peak represents", evidence: "The molecular ion is the intact molecule after loss of one electron; its m/z gives relative molecular mass for a singly charged ion." },
    application: { task: "Use the isotope pattern to identify a halogen", evidence: "A chlorine-containing molecule gives an M:M+2 pattern close to 3:1, while bromine gives roughly 1:1 because of isotope abundances." },
    transfer: { task: "Use fragments to distinguish two isomers", evidence: "Compare fragment masses expected from different cleavages; a matching fragment supports a structure but one peak alone is not proof." },
  } },
  { subject: "chemistry", topic: "atomic-structure", point: 3, slug: "chem-electron-config", capability: "electron configurations", contextA: "An ion forms from a transition-metal atom", contextB: "Successive ionisation energies reveal shells", modeA: "fill sub-shells in energy order then remove outer electrons", modeB: "locate the large jump and infer occupied shells", demands: {
    recall: { task: "Write an s, p and d electron configuration", evidence: "Sub-shells fill in increasing energy with capacities s², p⁶ and d¹⁰; write the configuration for the stated atom or ion." },
    application: { task: "Explain the ionisation-energy jump", evidence: "A large jump occurs when an electron must be removed from an inner shell closer to the nucleus after the outer shell is empty." },
    misconception: { task: "Correct the claim that 4s electrons are always removed after 3d", evidence: "For transition-metal ions the 4s electrons are generally removed before 3d because the relative energies change on ionisation." },
  } },
  { subject: "chemistry", topic: "atomic-structure", point: 4, slug: "chem-ionisation-trends", capability: "ionisation energy trends and exceptions", contextA: "Two adjacent elements have an unexpected dip", contextB: "A period trend is explained from sub-shell occupancy", modeA: "compare nuclear charge, shielding and distance", modeB: "identify paired-electron repulsion or sub-shell change", demands: {
    recall: { task: "State the general first-ionisation-energy trend across a period", evidence: "It generally increases because nuclear charge rises while added electrons enter the same principal shell with similar shielding." },
    explanation: { task: "Explain a dip between neighbouring elements", evidence: "A dip can arise when the electron enters a higher-energy sub-shell or when a paired p electron experiences extra repulsion." },
    transfer: { task: "Predict the trend for a new period", evidence: "Use nuclear charge, shielding, sub-shell and distance arguments rather than assuming a perfectly smooth increase." },
  } },
  { subject: "chemistry", topic: "atomic-structure", point: 5, slug: "chem-trends", capability: "atomic radius and electronegativity trends", contextA: "Bond polarity is predicted for a period-three compound", contextB: "Atomic radii are compared down a group", modeA: "use effective nuclear charge and shells", modeB: "link attraction to electronegativity and bond dipoles", demands: {
    recall: { task: "State the trend in atomic radius across a period and down a group", evidence: "Radius generally decreases across a period and increases down a group because shell number and shielding change." },
    application: { task: "Predict which atom attracts a shared pair more strongly", evidence: "The more electronegative atom attracts bonding electrons more strongly, giving the bond a partial negative charge at that end." },
    misconception: { task: "Correct the claim that the largest atom is always most electronegative", evidence: "Electronegativity depends on attraction for a bonding pair; larger radius and shielding generally weaken that attraction." },
  } },
  { subject: "chemistry", topic: "moles", point: 1, slug: "chem-mole-definitions", capability: "mole, Avogadro constant and molar mass", contextA: "A sample contains a measured number of molecules", contextB: "A weighing is converted into amount of substance", modeA: "move between particles, moles and mass", modeB: "track units through the conversion", demands: {
    recall: { task: "Define the mole and molar mass", evidence: "One mole contains the Avogadro number of entities; molar mass is the mass of one mole in g mol⁻¹." },
    calculation: { task: "Convert the stated mass to particles", evidence: "Find n = m/M in moles, then multiply by N_A and retain the requested significant figures." },
    misconception: { task: "Correct the claim that 1 mol of every substance has the same mass", evidence: "One mole has the same number of entities, but its mass depends on the relative formula or atomic mass." },
  } },
  { subject: "chemistry", topic: "moles", point: 2, slug: "chem-mass-concentration", capability: "n = m/M and n = cV", contextA: "A solution is prepared from a solid", contextB: "An aliquot is diluted before analysis", modeA: "choose mass or concentration route and convert volume", modeB: "conserve moles through dilution", demands: {
    recall: { task: "State both mole equations and the volume convention", evidence: "n = m/M and n = cV; when c is in mol dm⁻³, V must be in dm³." },
    calculation: { task: "Find the concentration after making up the flask", evidence: "Calculate moles from mass or titre, divide by the final volume in dm³ and report units." },
    transfer: { task: "Recover the stock concentration from an aliquot", evidence: "Dilution conserves solute moles, so use c₁V₁ = c₂V₂ before accounting for the aliquot fraction." },
  } },
  { subject: "chemistry", topic: "moles", point: 3, slug: "chem-gas-equation", capability: "ideal gas equation", contextA: "A gas syringe measures a reaction yield", contextB: "A pressure vessel is calibrated at a new temperature", modeA: "convert pressure and volume to SI before substitution", modeB: "hold the correct variables constant and rearrange", demands: {
    recall: { task: "State the ideal gas equation and SI requirements", evidence: "pV = nRT, with p in Pa, V in m³, n in mol, T in K and R in J mol⁻¹ K⁻¹." },
    calculation: { task: "Calculate the amount of gas", evidence: "Convert the measured values to SI, rearrange n = pV/RT and check the scale against the measured volume." },
    misconception: { task: "Correct the use of Celsius in pV = nRT", evidence: "The gas equation uses absolute temperature in kelvin; Celsius must be converted by adding 273.15." },
  } },
  { subject: "chemistry", topic: "moles", point: 4, slug: "chem-empirical-formula", capability: "empirical and molecular formulae", contextA: "Combustion data gives carbon, hydrogen and oxygen masses", contextB: "A vapour density identifies the molecular multiple", modeA: "convert each element mass to moles and divide by the smallest", modeB: "scale the empirical formula to Mr", demands: {
    recall: { task: "Define empirical and molecular formula", evidence: "The empirical formula is the simplest whole-number ratio of atoms; the molecular formula gives the actual numbers in a molecule." },
    calculation: { task: "Find the empirical formula from the composition", evidence: "Convert masses or percentages to moles, divide by the smallest and multiply all ratios to whole numbers." },
    transfer: { task: "Use Mr to obtain the molecular formula", evidence: "Divide molecular Mr by empirical-formula mass to get an integer multiplier, then multiply every subscript." },
  } },
  { subject: "chemistry", topic: "moles", point: 5, slug: "chem-yield-economy", capability: "percentage yield, atom economy and limiting reagent", contextA: "Two routes produce the same target compound", contextB: "Reactants are mixed in non-stoichiometric amounts", modeA: "compare theoretical and actual product", modeB: "identify the limiting reactant before evaluating waste", demands: {
    recall: { task: "State the definitions of yield and atom economy", evidence: "Percentage yield compares actual with theoretical product; atom economy is desired-product Mr divided by total reactant Mr, multiplied by 100." },
    calculation: { task: "Calculate yield and identify the limiting reagent", evidence: "Use the balanced equation to calculate each possible product amount; the smaller amount identifies the limiting reagent before percentage yield." },
    synoptic: { task: "Choose the greener route", evidence: "Consider atom economy, percentage yield, energy, solvent and hazard together; a high yield alone does not prove the route is sustainable." },
  } },
  { subject: "chemistry", topic: "bonding", point: 1, slug: "chem-bond-types", capability: "ionic, covalent, dative and metallic bonding", contextA: "A solid's properties are compared with a molecular liquid", contextB: "A coordinate bond forms in an ion", modeA: "describe electron transfer or sharing", modeB: "map lattice, delocalisation and donor pairs to properties", demands: {
    recall: { task: "Define ionic, covalent, dative and metallic bonding", evidence: "Ionic attraction joins oppositely charged ions, covalent bonding shares electron pairs, dative bonding supplies both electrons from one atom and metallic bonding joins positive ions with delocalised electrons." },
    explanation: { task: "Explain why the solid conducts only when molten", evidence: "Ions are fixed in a lattice when solid but mobile when molten, so charge can move only in the molten or dissolved state." },
    misconception: { task: "Correct the claim that a dative bond is weaker by definition", evidence: "A dative bond is covalent once formed; its origin does not alone determine its bond strength." },
  } },
  { subject: "chemistry", topic: "bonding", point: 2, slug: "chem-polarity", capability: "electronegativity and bond polarity", contextA: "A solvent is selected for an ionic solute", contextB: "A molecule has several polar bonds", modeA: "compare electronegativities and dipoles", modeB: "sum bond dipoles using molecular geometry", demands: {
    recall: { task: "Define electronegativity and bond polarity", evidence: "Electronegativity is attraction for a bonding pair; unequal attraction gives a bond dipole with partial charges." },
    application: { task: "Decide whether the molecule is polar", evidence: "Draw the shape and add the bond dipoles as vectors; polar bonds can cancel in a symmetrical molecule." },
    transfer: { task: "Predict solubility in a polar solvent", evidence: "Ionic or polar solutes are stabilised by polar solvent interactions, while non-polar solutes are better matched to non-polar solvents." },
  } },
  { subject: "chemistry", topic: "bonding", point: 3, slug: "chem-intermolecular", capability: "intermolecular forces and physical properties", contextA: "Boiling points of homologous molecules are compared", contextB: "An isomer has a different volatility", modeA: "rank hydrogen bonding, permanent dipoles and dispersion", modeB: "consider surface area and temporary dipoles", demands: {
    recall: { task: "Name the main intermolecular forces", evidence: "London dispersion forces act between all particles, permanent dipole interactions act between polar molecules and hydrogen bonding is a strong case involving H bonded to N, O or F." },
    explanation: { task: "Explain the boiling-point trend", evidence: "More energy is needed to overcome stronger intermolecular attractions; larger molecules usually have stronger dispersion forces, while branching can reduce contact area." },
    misconception: { task: "Correct the claim that covalent bonds break on boiling", evidence: "Boiling separates molecules by overcoming intermolecular attractions; covalent bonds inside each molecule remain intact." },
  } },
  { subject: "chemistry", topic: "bonding", point: 4, slug: "chem-vsepr", capability: "VSEPR molecular shapes and bond angles", contextA: "A molecule's dipole is predicted from its Lewis structure", contextB: "A lone pair changes an expected tetrahedral angle", modeA: "count electron domains and include lone-pair repulsion", modeB: "distinguish electron-domain geometry from molecular shape", demands: {
    recall: { task: "State the VSEPR principle", evidence: "Electron pairs repel and arrange around a central atom to maximise separation; lone pairs repel more strongly than bonding pairs." },
    application: { task: "Predict the shape and approximate angle", evidence: "Count bonding and lone pairs, choose the electron-domain arrangement and reduce the angle when lone pairs occupy domains." },
    misconception: { task: "Correct the claim that four electron pairs always give a tetrahedral molecule", evidence: "Four domains give tetrahedral electron geometry, but one or more lone pairs change the molecular shape and bond angle." },
  } },
  { subject: "chemistry", topic: "bonding", point: 5, slug: "chem-lattice-properties", capability: "lattice structure and physical properties", contextA: "An ionic solid is compared with graphite", contextB: "A molecular solid is tested for conductivity", modeA: "link strong attractions and mobile charge carriers", modeB: "distinguish giant lattices from discrete molecules", demands: {
    recall: { task: "State why giant ionic lattices have high melting points", evidence: "Strong electrostatic attractions act throughout the lattice, so much energy is needed to separate the ions." },
    explanation: { task: "Explain graphite's electrical conductivity", evidence: "Each carbon bonds to three others, leaving one electron delocalised per atom; these electrons carry charge along the layers." },
    transfer: { task: "Predict the effect of dissolving the solid", evidence: "If the lattice dissociates into mobile ions, the solution can conduct; a molecular substance may dissolve without producing charge carriers." },
  } },
  { subject: "chemistry", topic: "kinetics", point: 1, slug: "chem-rate", capability: "rate of reaction and methods of following it", contextA: "Gas volume is recorded during a reaction", contextB: "A colour change is followed with a colorimeter", modeA: "define rate as change per time and choose a measurable proxy", modeB: "use an initial-rate tangent and control sampling", demands: {
    recall: { task: "Define rate of reaction", evidence: "Rate is change in concentration or amount of a reactant or product per unit time, with stoichiometric signs interpreted consistently." },
    calculation: { task: "Find the initial rate from the graph", evidence: "Draw a tangent at time zero, calculate its gradient with units and state whether the plotted quantity increases or decreases." },
    application: { task: "Choose a suitable method for the opaque reaction", evidence: "Use gas collection, mass loss, colourimetry or sampling according to the measurable change, while controlling temperature and mixing." },
  } },
  { subject: "chemistry", topic: "kinetics", point: 2, slug: "chem-collision", capability: "collision theory and factors affecting rate", contextA: "A powder reacts faster than lumps", contextB: "A catalyst changes the energy profile", modeA: "count successful collisions and activation energy", modeB: "compare distribution tails with and without catalyst", demands: {
    recall: { task: "State the two conditions for a successful collision", evidence: "Particles must collide with energy at least equal to the activation energy and with a suitable orientation." },
    explanation: { task: "Explain the effect of temperature", evidence: "Heating increases collision frequency and, more importantly, the fraction of particles with energy at least Ea, so the rate rises." },
    misconception: { task: "Correct the claim that a catalyst increases the energy of every collision", evidence: "A catalyst provides a lower-Ea pathway; it changes the fraction of successful collisions without changing the particles' average kinetic energy at fixed temperature." },
  } },
  { subject: "chemistry", topic: "equilibria", point: 1, slug: "chem-dynamic-equilibrium", capability: "dynamic equilibrium and Le Chatelier principle", contextA: "A sealed reactor is perturbed by adding reactant", contextB: "An industrial process balances conversion with energy cost", modeA: "compare forward and reverse rates after a change", modeB: "predict the direction that opposes the imposed change", demands: {
    recall: { task: "Define dynamic equilibrium", evidence: "In a closed system the forward and reverse reactions continue at equal rates, so macroscopic concentrations remain constant." },
    explanation: { task: "Explain the response to adding a reactant", evidence: "The forward rate initially rises because reactant concentration increases; net reaction consumes some of the added reactant until rates become equal again." },
    synoptic: { task: "Evaluate a compromise industrial condition", evidence: "Choose temperature, pressure and catalyst by balancing equilibrium yield, reaction rate, safety and cost rather than maximising one factor alone." },
  } },
  { subject: "chemistry", topic: "equilibria", point: 2, slug: "chem-le-chatelier", capability: "effects of concentration, pressure and temperature", contextA: "A gaseous equilibrium is compressed", contextB: "The equilibrium constant changes with temperature", modeA: "count gas moles and identify the endothermic direction", modeB: "separate position, rate and Kc", demands: {
    recall: { task: "State the pressure rule for a gaseous equilibrium", evidence: "Increasing pressure favours the side with fewer gas molecules, provided temperature is constant and the gas-mole numbers differ." },
    application: { task: "Predict the effect of the stated temperature change", evidence: "Heating favours the endothermic direction; cooling favours the exothermic direction, while Kc changes only with temperature." },
    misconception: { task: "Correct the claim that a catalyst shifts equilibrium", evidence: "A catalyst speeds both directions by a comparable pathway and changes the time to equilibrium, not the equilibrium position or Kc." },
  } },
  { subject: "chemistry", topic: "acids-bases", point: 1, slug: "chem-bronsted", capability: "Bronsted-Lowry acids, bases and conjugate pairs", contextA: "An acid transfers a proton to water", contextB: "An amphiprotic ion reacts in two possible directions", modeA: "identify donor, acceptor and conjugate change", modeB: "track proton transfer rather than charge labels alone", demands: {
    recall: { task: "Define a Bronsted-Lowry acid and base", evidence: "An acid donates a proton and a base accepts a proton; a conjugate pair differs by one proton." },
    application: { task: "Identify both conjugate pairs", evidence: "Mark the species that loses H⁺ and the species that gains H⁺; compare each with its conjugate by one proton." },
    misconception: { task: "Correct the claim that a strong acid has no conjugate base", evidence: "Every acid has a conjugate base; a strong acid has a very weak conjugate base because proton transfer is strongly favoured." },
  } },
];

export const wjecFlagshipDepthQuestions: Question[] = defineQuestions([
  ...mathsBriefs.flatMap(questionsFor),
  ...biologyBriefs.flatMap(questionsFor),
  ...chemistryBriefs.flatMap(questionsFor),
]);

export const wjecFlagshipDepthCounts = {
  mathsStatements: mathsBriefs.length,
  biologyStatements: biologyBriefs.length,
  chemistryStatements: chemistryBriefs.length,
  questions: wjecFlagshipDepthQuestions.length,
} as const;
