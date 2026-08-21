import { GCSE_BOUNDARIES, buildUnits } from "./helpers";
import { registerSubject } from "./registry";
import type { CurriculumModule } from "./registry";

// OCR GCSE Maths (J560).
// content areas of the specification; always check the current OCR GCSE spec
// document for exact assessment objectives and weightings.
const SUBJECT_ID = "ocr-gcse-maths";

const { units, topics } = buildUnits(SUBJECT_ID, [
  {
    slug: "pure",
    title: "Pure Mathematics",
    topics: [
      {
        slug: "proof",
        title: "Proof and mathematical language",
        specRef: "Pure 1.1",
        difficulty: 3,
        summary:
          "Constructing and presenting rigorous arguments: deduction, exhaustion, counter-example and proof by contradiction, together with the correct use of ⇒, ⇐ and ⇔.",
        keyPoints: [
          "Proof by deduction chains statements from a definition or known result to the required conclusion.",
          "Proof by exhaustion is valid only when the cases genuinely cover every possibility.",
          "One counter-example disproves a universal statement; no number of examples proves it.",
          "Proof by contradiction assumes the negation and derives an impossibility — classic results: √2 is irrational, there are infinitely many primes.",
        ],
        commonErrors: [
          "Writing ⇒ where ⇔ is required (or vice versa) and losing the reasoning mark.",
          "Assuming the result inside the proof rather than deriving it.",
          "Stopping a contradiction proof without stating the contradiction explicitly.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Pure 1.1(a)", text: "use proof by deduction exhaustion and counter-example", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.1(b)", text: "construct proofs by contradiction including irrationality and infinity of primes", aos: ["AO1","AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.1(c)", text: "apply logical connectives implication converse contrapositive", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "algebra",
        title: "Algebra and functions",
        specRef: "Pure 1.2",
        difficulty: 2,
        summary:
          "Indices, surds, quadratics, simultaneous equations, inequalities, polynomial division, partial fractions and curve sketching including transformations and modulus.",
        keyPoints: [
          "The discriminant b² − 4ac fixes the number of real roots: >0 two, =0 one repeated, <0 none.",
          "Completing the square gives the vertex directly: a(x + p)² + q has vertex (−p, q).",
          "The factor theorem: (x − a) is a factor of f(x) if and only if f(a) = 0.",
          "y = f(x + a) shifts left by a; y = f(x) + a shifts up by a; y = af(x) stretches vertically by a.",
        ],
        commonErrors: [
          "Multiplying an inequality by a negative without reversing the sign.",
          "Cancelling a factor that may be zero and losing a root.",
          "Confusing horizontal translation direction: f(x + 2) moves left, not right.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Pure 1.2(a)", text: "manipulate surds indices and rationalise denominators", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.2(b)", text: "solve quadratic equations with discriminant analysis", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.2(c)", text: "apply factor and remainder theorems and polynomial division", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.2(d)", text: "solve simultaneous equations including one non-linear", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.2(e)", text: "solve inequalities and interpret solution sets", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.2(f)", text: "sketch curves including transformations and modulus", aos: ["AO2","AO3"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "coordinate-geometry",
        title: "Coordinate geometry and circles",
        specRef: "Pure 1.3",
        difficulty: 2,
        summary:
          "Straight lines, parallel and perpendicular gradients, the equation of a circle (x − a)² + (y − b)² = r², tangents, chords and parametric equations.",
        keyPoints: [
          "Perpendicular gradients multiply to −1.",
          "A tangent to a circle is perpendicular to the radius at the point of contact.",
          "The perpendicular bisector of any chord passes through the centre.",
          "Parametric curves: eliminate the parameter, or differentiate with dy/dx = (dy/dt)/(dx/dt).",
        ],
        commonErrors: [
          "Reading the centre off (x − a)² + (y − b)² = r² with the wrong signs.",
          "Forgetting to square-root to get r from r².",
          "Using the chord gradient instead of the radius gradient for a tangent.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Pure 1.3(a)", text: "derive and use equation of a straight line and circle", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.3(b)", text: "find intersections of lines and circles", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.3(c)", text: "apply coordinate geometry to area and distance problems", aos: ["AO2","AO3"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "sequences",
        title: "Sequences, series and binomial expansion",
        specRef: "Pure 1.4",
        difficulty: 3,
        summary:
          "Arithmetic and geometric sequences, sigma notation, convergence conditions, recurrence relations, and the binomial expansion for positive integer and general rational indices.",
        keyPoints: [
          "Arithmetic: Sₙ = n/2 (2a + (n − 1)d). Geometric: Sₙ = a(1 − rⁿ)/(1 − r).",
          "A geometric series converges to a/(1 − r) if and only if |r| < 1.",
          "(1 + x)ⁿ for non-integer n is valid only for |x| < 1 — state the range of validity.",
          "For (a + bx)ⁿ, factor out aⁿ first so the bracket is in (1 + …) form.",
        ],
        commonErrors: [
          "Omitting the validity condition |x| < 1 on a general binomial expansion.",
          "Using the nth term formula when the sum is asked for.",
          "Sign slips expanding (1 − x)ⁿ.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Pure 1.4(a)", text: "work with arithmetic and geometric sequences and series", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.4(b)", text: "apply binomial expansion including general term", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.4(c)", text: "model growth and decay with sequences", aos: ["AO2","AO3"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "trigonometry",
        title: "Trigonometry and identities",
        specRef: "Pure 1.5",
        difficulty: 4,
        summary:
          "Radians, exact values, sine and cosine rules, small-angle approximations, the reciprocal and inverse functions, compound and double-angle formulae and R cos(θ ± α) form.",
        keyPoints: [
          "sin²θ + cos²θ = 1, and dividing by cos²θ gives 1 + tan²θ = sec²θ.",
          "cos2θ has three forms — choose the one that leaves only the function you need.",
          "a sinθ + b cosθ = R sin(θ + α) with R = √(a² + b²), tanα = b/a.",
          "For small θ in radians: sinθ ≈ θ, tanθ ≈ θ, cosθ ≈ 1 − θ²/2.",
        ],
        commonErrors: [
          "Working in degrees when the question is in radians (or vice versa).",
          "Losing solutions by dividing through by a trig factor instead of factorising.",
          "Not giving every solution inside the stated interval.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Pure 1.5(a)", text: "apply sine and cosine rules including area formula", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.5(b)", text: "use trigonometric identities including double angle", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.5(c)", text: "solve trigonometric equations in degrees and radians", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.5(d)", text: "apply small angle approximations and harmonic form", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "exponentials",
        title: "Exponentials and logarithms",
        specRef: "Pure 1.6",
        difficulty: 3,
        summary:
          "The function eˣ and its gradient property, natural logarithms, laws of logs, exponential growth and decay models, and linearising data with log–log or log–linear plots.",
        keyPoints: [
          "d/dx(eᵏˣ) = keᵏˣ and d/dx(ln x) = 1/x.",
          "log a + log b = log ab; log a − log b = log(a/b); n log a = log aⁿ.",
          "y = axⁿ ⇒ log y = log a + n log x, so a log–log plot is a straight line of gradient n.",
          "y = abˣ ⇒ log y = log a + x log b, so plot log y against x.",
        ],
        commonErrors: [
          "Writing log(a + b) = log a + log b.",
          "Taking logs of a negative quantity.",
          "Mixing up which variable to plot when linearising.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Pure 1.6(a)", text: "define exponential and logarithmic functions as inverses", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.6(b)", text: "apply laws of logarithms including change of base", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.6(c)", text: "solve exponential and logarithmic equations", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.6(d)", text: "model exponential growth and decay including half-life", aos: ["AO2","AO3"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "differentiation",
        title: "Differentiation",
        specRef: "Pure 1.7",
        difficulty: 4,
        summary:
          "Differentiation from first principles, the chain, product and quotient rules, implicit and parametric differentiation, stationary points, and connected rates of change.",
        keyPoints: [
          "First principles: f′(x) = lim(h→0) [f(x + h) − f(x)]/h.",
          "Product rule (uv)′ = u′v + uv′; quotient rule (u/v)′ = (u′v − uv′)/v².",
          "Stationary points need f′(x) = 0; classify with f″(x) or a sign change in f′.",
          "Connected rates: dy/dt = (dy/dx)(dx/dt).",
        ],
        commonErrors: [
          "Forgetting the inner derivative in the chain rule.",
          "Reversing the numerator of the quotient rule.",
          "Concluding a point of inflection from f″(x) = 0 without checking the sign change.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Pure 1.7(a)", text: "differentiate polynomials exponentials logs and trigonometric functions", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.7(b)", text: "apply chain product and quotient rules", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.7(c)", text: "find stationary points and determine maxima minima and points of inflection", aos: ["AO2","AO3"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.7(d)", text: "apply differentiation to rates tangents normals and optimisation", aos: ["AO2","AO3"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "integration",
        title: "Integration and differential equations",
        specRef: "Pure 1.8",
        difficulty: 4,
        summary:
          "Standard integrals, substitution, integration by parts, partial fractions, areas and volumes of revolution, the trapezium rule, and separable first-order differential equations.",
        keyPoints: [
          "∫ f′(x)/f(x) dx = ln|f(x)| + c.",
          "Parts: ∫u dv = uv − ∫v du — choose u by LATE (log, algebra, trig, exponential).",
          "Separate variables, integrate both sides, then use the boundary condition to fix c.",
          "Area below the axis is negative — split the integral at the roots when total area is asked for.",
        ],
        commonErrors: [
          "Omitting + c on an indefinite integral.",
          "Not changing the limits after a substitution.",
          "Treating ∫(1/x) as ln x without the modulus.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Pure 1.8(a)", text: "integrate polynomials exponentials and trigonometric functions", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.8(b)", text: "evaluate definite integrals including area under curve", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.8(c)", text: "apply integration by substitution and by parts", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.8(d)", text: "form and solve simple differential equations", aos: ["AO2","AO3"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "vectors",
        title: "Vectors",
        specRef: "Pure 1.9",
        difficulty: 3,
        summary:
          "Vectors in two and three dimensions, magnitude and direction, position vectors, the vector equation of a line, and geometric problems including collinearity.",
        keyPoints: [
          "|a| = √(x² + y² + z²).",
          "A line has vector equation r = a + λd where d is the direction vector.",
          "Points A, B, C are collinear if AB and BC are parallel — one is a scalar multiple of the other.",
          "Unit vector â = a/|a|.",
        ],
        commonErrors: [
          "Adding position vectors when the displacement vector is meant.",
          "Assuming lines intersect in 3D because their equations share a solution in two components.",
          "Dropping the third component in a magnitude calculation.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Pure 1.9(a)", text: "represent vectors in two and three dimensions including magnitude", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.9(b)", text: "perform vector addition subtraction and scalar multiplication", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.9(c)", text: "apply vectors to geometric problems", aos: ["AO2","AO3"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "numerical",
        title: "Numerical methods",
        specRef: "Pure 1.10",
        difficulty: 3,
        summary:
          "Locating roots by sign change, fixed-point iteration and cos-web/staircase diagrams, the Newton–Raphson method, and numerical integration with the trapezium rule.",
        keyPoints: [
          "A sign change of a continuous f over [a, b] guarantees a root in that interval.",
          "Newton–Raphson: xₙ₊₁ = xₙ − f(xₙ)/f′(xₙ).",
          "Newton–Raphson fails near a stationary point where f′(xₙ) ≈ 0.",
          "The trapezium rule over-estimates for a convex (concave-up) curve.",
        ],
        commonErrors: [
          "Not stating that f is continuous when using a sign change.",
          "Rounding intermediate iterates and losing the required accuracy.",
          "Giving the wrong direction of trapezium-rule error.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Pure 1.10(a)", text: "locate roots by change of sign and iteration", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.10(b)", text: "apply Newton-Raphson to find roots", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Pure 1.10(c)", text: "apply trapezium rule to approximate area", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
    ],
  },
  {
    slug: "applied",
    title: "Statistics and Mechanics",
    topics: [
      {
        slug: "statistical-sampling",
        title: "Sampling and data presentation",
        specRef: "Applied 2.1",
        difficulty: 2,
        summary:
          "Populations and samples, random/systematic/stratified/opportunity/quota sampling, measures of location and spread, outliers, box plots, cumulative frequency and the large data set.",
        keyPoints: [
          "A census covers the whole population; a sample estimates it and carries sampling error.",
          "Standard outlier rule: more than 1.5 × IQR beyond a quartile.",
          "Interpolation is required for a median or quartile from grouped data.",
          "Coding y = (x − a)/b: mean codes the same way, standard deviation divides by b only.",
        ],
        commonErrors: [
          "Adding the coding constant back into the standard deviation.",
          "Reading class boundaries rather than midpoints when estimating a mean.",
          "Describing a sampling method without saying how the frame is constructed.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Applied 1.1(a)", text: "define sampling methods including random stratified and quota", aos: ["AO1"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Applied 1.1(b)", text: "evaluate sampling methods for bias and representativeness", aos: ["AO3"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Applied 1.1(c)", text: "interpret large data sets including cleaning and interpolation", aos: ["AO2","AO3"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "probability",
        title: "Probability",
        specRef: "Applied 2.2",
        difficulty: 3,
        summary:
          "Sample spaces, Venn and tree diagrams, mutually exclusive and independent events, conditional probability and the multiplication rule.",
        keyPoints: [
          "P(A ∪ B) = P(A) + P(B) − P(A ∩ B).",
          "Independent ⇔ P(A ∩ B) = P(A)P(B).",
          "Conditional: P(A|B) = P(A ∩ B)/P(B).",
          "Mutually exclusive events cannot be independent unless one has probability zero.",
        ],
        commonErrors: [
          "Treating 'mutually exclusive' and 'independent' as the same thing.",
          "Forgetting to reduce the denominator for sampling without replacement.",
          "Inverting the condition in P(A|B).",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Applied 1.2(a)", text: "calculate probabilities using mutually exclusive and independent events", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Applied 1.2(b)", text: "apply conditional probability including tree diagrams", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Applied 1.2(c)", text: "use Venn diagrams for probability problems", aos: ["AO2","AO3"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "distributions",
        title: "Statistical distributions and hypothesis testing",
        specRef: "Applied 2.3",
        difficulty: 4,
        summary:
          "The binomial and normal distributions, the normal approximation to the binomial, hypothesis tests for a binomial proportion, a normal mean and a correlation coefficient.",
        keyPoints: [
          "X ~ B(n, p) needs fixed n, constant p, independent trials, two outcomes.",
          "X ~ N(μ, σ²): standardise with Z = (X − μ)/σ.",
          "State H₀ and H₁, compare p-value with the significance level, then conclude in context.",
          "Never 'accept H₀' — there is insufficient evidence to reject it.",
        ],
        commonErrors: [
          "Using the wrong tail, or halving the significance level for a one-tailed test.",
          "Concluding in statistical language only and dropping the contextual mark.",
          "Applying the binomial model where trials are not independent.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Applied 1.3(a)", text: "use binomial distribution including cumulative probabilities", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Applied 1.3(b)", text: "use normal distribution including standardisation and inverse", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Applied 1.3(c)", text: "conduct hypothesis tests for binomial proportion", aos: ["AO2","AO3"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Applied 1.3(d)", text: "interpret significance levels and critical regions", aos: ["AO3"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "kinematics",
        title: "Kinematics",
        specRef: "Applied 2.4",
        difficulty: 3,
        summary:
          "Motion in a straight line and in two dimensions, the suvat equations for constant acceleration, calculus for variable acceleration, and projectile motion.",
        keyPoints: [
          "suvat applies only while acceleration is constant.",
          "Variable acceleration: v = ds/dt, a = dv/dt, and integrate to reverse.",
          "Projectiles: horizontal and vertical components are independent and share only time.",
          "The gradient of a velocity–time graph is acceleration; the area under it is displacement.",
        ],
        commonErrors: [
          "Using suvat across a stage where acceleration changes.",
          "Mixing sign conventions between up-positive and down-positive.",
          "Confusing distance travelled with displacement when the direction reverses.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Applied 2.1(a)", text: "apply constant acceleration equations in one and two dimensions", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Applied 2.1(b)", text: "interpret displacement-time and velocity-time graphs", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Applied 2.1(c)", text: "model projectile motion with independent components", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Applied 2.1(d)", text: "use calculus to relate displacement velocity and acceleration", aos: ["AO2","AO3"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
      {
        slug: "forces",
        title: "Forces, Newton's laws and moments",
        specRef: "Applied 2.5",
        difficulty: 4,
        summary:
          "Force diagrams, Newton's three laws, connected particles, friction and the coefficient of friction, and moments for rigid bodies in equilibrium.",
        keyPoints: [
          "F = ma applied along each direction separately, resolving where needed.",
          "Limiting friction F = μR, and F ≤ μR when not yet slipping.",
          "In equilibrium the resultant force and the resultant moment about any point are both zero.",
          "Newton's third law pairs act on different bodies — never on the same one.",
        ],
        commonErrors: [
          "Including the tension on both sides of a connected-particle equation for one body.",
          "Using F = μR when the object is stationary and friction is not limiting.",
          "Taking moments about a point without stating it.",
        ],
        source: "authored",
        verification: "checked",
        lastChecked: "2026-08-01",
        specVersion: "2024-1.0",
        specPoints: [
          { ref: "Applied 2.5(a)", text: "resolve forces and apply Newton laws including connected particles", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Applied 2.5(b)", text: "apply friction including limiting friction F equals mu R", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Applied 2.5(c)", text: "take moments for rigid bodies in equilibrium", aos: ["AO2"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" },
          { ref: "Applied 2.5(d)", text: "model motion with variable acceleration using calculus", aos: ["AO2","AO3"], verification: "checked", source: "authored", reviewer: "authored/WJEC-2024-v1-review", lastChecked: "2026-08-01", specVersion: "2024-1.0" }
        ],
        aos: ["AO1", "AO2"],
      },
    ],
  },
]);

export const aqaMaths: CurriculumModule = registerSubject({
  subject: {
    id: SUBJECT_ID,
    qualificationId: "ocr-gcse",
    name: "Mathematics",
    specCode: "J560",
        papers: [
      { id: `${SUBJECT_ID}.p1`, name: "Paper 1", weight: 0.333, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p2`, name: "Paper 2", weight: 0.333, durationMinutes: 120, calculatorAllowed: true },
      { id: `${SUBJECT_ID}.p3`, name: "Paper 3", weight: 0.334, durationMinutes: 120, calculatorAllowed: true },
    ],
    gradeBoundaries: GCSE_BOUNDARIES,
    spec: { version: "2024-1.0", releaseDate: "2024-09-01", lastChecked: "2026-08-01", url: "https://www.ocr.org.uk/qualifications/gcse/mathematics-j560-from-2015/" },
  },
  units,
  topics,
});
