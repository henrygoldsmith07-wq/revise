import { defineMisconceptions } from "./authoring";

const SUBJECT_ID = "wjec-alevel-maths";

export const mathsMisconceptions = defineMisconceptions([
  {
    slug: "inequality-sign-reversal",
    subjectId: SUBJECT_ID,
    topics: ["algebra"],
    statement:
      "If I multiply or divide both sides of an inequality by a negative number, the sign stays the same.",
    explanation:
      "Multiplying or dividing by a negative reverses the order of the two sides: if a < b then -a > -b. Keeping the sign unchanged points you at the wrong half of the number line.",
    example: "From -2x < 6 the student writes x < -3 instead of x > -3.",
    correction:
      "Reverse the inequality sign whenever you multiply or divide by a negative, then check with a value such as x = 0.",
    tag: "rearrangement",
    ao: "AO2",
  },
  {
    slug: "cancelling-zero-factor",
    subjectId: SUBJECT_ID,
    topics: ["algebra"],
    statement: "I can cancel a common factor from both sides of an equation and keep every solution.",
    explanation:
      "Cancelling divides by that factor, which is only valid when the factor is not zero. When the factor can be zero, that value is itself a solution - cancellation silently throws it away.",
    example: "From x(x - 2) = 0 the student divides by x and finds only x = 2, losing the root x = 0.",
    correction:
      "Factorise and apply the zero-product rule: set each factor to zero. Never divide by an expression that may be zero.",
    tag: "method-skipped",
    ao: "AO2",
  },
  {
    slug: "chain-rule-inner-derivative",
    subjectId: "aqa-alevel-maths",
    topics: ["differentiation"],
    statement: "For the chain rule, differentiate the outer function and leave the inner function exactly as it is.",
    explanation:
      "The chain rule multiplies by the derivative of the inner function: d/dx f(g(x)) = f'(g(x)) x g'(x). Leaving the inner function 'untouched' is precisely the forgotten g'(x) that examiners see when (3x + 1)² is differentiated as 2(3x + 1) instead of 6(3x + 1).",
    example: "For y = (3x + 1)² the student writes dy/dx = 2(3x + 1), dropping the factor 3 from the inner derivative.",
    correction:
      "Differentiate the outside, keep the inside, then multiply by the derivative of the inside: dy/dx = 2(3x + 1) × 3.",
    tag: "method-skipped",
    ao: "AO2",
  },
  {
    slug: "inflection-requires-sign-change",
    subjectId: "aqa-alevel-maths",
    topics: ["differentiation"],
    statement: "If f″(x) = 0 at a point, that point is a point of inflection.",
    explanation:
      "f″(x) = 0 is necessary but not sufficient for a point of inflection: the curvature must actually change sign through the point. f(x) = x⁴ has f″(0) = 0 yet has a minimum at x = 0, so the second-derivative value alone cannot decide.",
    example: "The student classifies the turning point of y = x⁴ at x = 0 as a point of inflection purely because f″(0) = 0.",
    correction:
      "Check the sign of f″ on both sides of the point (or a sign change in f′); a point of inflection requires f″ to change sign.",
    tag: "conceptual",
    ao: "AO1",
  },
  // --- AQA GCSE ---------------------------------------------------------
  {
    slug: "gcse-translation-direction",
    subjectId: "aqa-gcse-maths",
    topics: ["algebra"],
    statement: "y = f(x + 2) moves the graph 2 units to the right.",
    explanation:
      "Adding inside the function shifts it the other way: f(x + 2) reaches the same output 2 units of input earlier, so the graph moves left by 2. This is the horizontal-translation direction that students invert.",
    example: "The student sketches y = (x + 2)² two units to the right of y = x², when its minimum is at x = −2.",
    correction:
      "Inside the brackets, +a means left, −a means right: y = f(x + 2) has the same shape shifted 2 units left.",
    tag: "graph-reading",
    ao: "AO1",
  },
  {
    slug: "gcse-completing-square-new-curve",
    subjectId: "aqa-gcse-maths",
    topics: ["algebra"],
    statement: "Completing the square rewrites the quadratic as a different curve.",
    explanation:
      "Completing the square is the same curve in vertex form: a(x + p)² + q is exactly the original quadratic, and its vertex is (−p, q). No graph is changed — the form just makes the turning point visible.",
    example: "The student treats y = x² + 6x + 5 and y = (x + 3)² − 4 as two different curves and looks for two sets of roots.",
    correction:
      "Convert, don't replace: y = x² + 6x + 5 ≡ (x + 3)² − 4, one curve with its minimum at (−3, −4).",
    tag: "conceptual",
    ao: "AO2",
  },
  {
    slug: "gcse-af-x-is-horizontal-stretch",
    subjectId: "aqa-gcse-maths",
    topics: ["algebra"],
    statement: "y = af(x) stretches the graph horizontally by a factor of a.",
    explanation:
      "Multiplying the output changes every y value, so y = af(x) stretches the graph vertically by a. Horizontal stretches come from changing the input, f(ax), not the output.",
    example: "The student draws y = 2x² as a wider parabola, when each point is twice as high.",
    correction:
      "Output multiplied → vertical stretch by a; input multiplied, f(ax) → horizontal squeeze by 1/a.",
    tag: "conceptual",
    ao: "AO1",
  },
  {
    slug: "gcse-circle-radius-root",
    subjectId: "aqa-gcse-maths",
    topics: ["coordinate-geometry"],
    statement: "For (x − 3)² + (y + 4)² = 25 the centre is (−3, 4) and the radius is 25.",
    explanation:
      "In (x − a)² + (y − b)² = r² the centre is (a, b) with the signs taken from the brackets, so (x − 3)² gives a = 3 and (y + 4)² = (y − (−4))² gives b = −4. The right-hand side is r², so the radius is the square root, 5, not the number on the right.",
    example: "Asked for the circle (x − 3)² + (y + 4)² = 25, the student reads off centre (−3, 4) and radius 25.",
    correction:
      "Flip each bracket's sign for the centre — (x − 3)² + (y + 4)² = 25 → centre (3, −4) — then square-root the right-hand side for the radius.",
    tag: "graph-reading",
    ao: "AO1",
  },
  {
    slug: "gcse-radians-degrees",
    subjectId: "aqa-gcse-maths",
    topics: ["trigonometry"],
    statement: "Whether a trig calculation is done in degrees or radians does not change the answer.",
    explanation:
      "Degrees and radians are different units for the same angle: π radians = 180°. A calculator left in the wrong mode returns a different value, sin 60° ≈ 0.866 but sin 60 (radians) ≈ −0.305, so angles and answers must be converted at both ends of every question.",
    example: "The student evaluates sin(π/3) on a degrees-mode calculator and writes 0.018, mixing up radian input with degree output.",
    correction:
      "Set the calculator to the mode the question uses; convert with π radians = 180° whenever a trig function takes a radian input.",
    tag: "units",
    ao: "AO2",
  },
  // --- Edexcel & OCR boards ----------------------------------------------
  {
    slug: "edexcel-binomial-validity",
    subjectId: "edexcel-alevel-maths",
    topics: ["sequences"],
    statement: "The binomial expansion of (1 + x)ⁿ can be used for any value of x.",
    explanation:
      "For non-integer n the expansion is an infinite series that converges only for |x| < 1. Outside that range the terms grow without bound, so any value computed from it is meaningless.",
    example: "The student expands (1 + x)^½ and evaluates at x = 2 without a validity statement, losing the final mark every session.",
    correction:
      "State the range of validity alongside the expansion: |x| < 1 — rescaled for brackets, (1 + 2x)ⁿ is valid for |2x| < 1, i.e. |x| < ½.",
    tag: "method-skipped",
    ao: "AO2",
  },
  {
    slug: "edexcel-integral-modulus",
    subjectId: "edexcel-alevel-maths",
    topics: ["integration"],
    statement: "∫1/x dx = ln x + c, so the integral is undefined for negative x.",
    explanation:
      "The antiderivative is ln|x| + c — the modulus matters. The gradient of ln x matches 1/x only for x > 0, while 1/x is defined and integrable for negative x too.",
    example: "For the integral of 1/x from −4 to −1 the student writes [ln x] and declares it undefined, when ln|x| gives ln 1 − ln 4 = −ln 4.",
    correction:
      "Write ln|f(x)| whenever integrating 1/f(x) or f′(x)/f(x), and carry the modulus through the evaluation.",
    tag: "conceptual",
    ao: "AO2",
  },
  {
    slug: "ocr-root-sign-change-unique",
    subjectId: "ocr-alevel-maths",
    topics: ["numerical"],
    statement: "A sign change of f between a and b proves there is exactly one root between them.",
    explanation:
      "A sign change of a continuous f guarantees at least one root in [a, b], not exactly one — the curve can cross the axis several times inside the interval. And without continuity a sign change guarantees nothing at all.",
    example: "From f(1) < 0 and f(2) > 0 the student concludes one root lies between 1 and 2, missing the two further crossings inside.",
    correction:
      "Say 'f is continuous and changes sign, so a root exists in [a, b]'. For uniqueness, add that f′ keeps a single sign on the interval (f is monotonic).",
    tag: "conceptual",
    ao: "AO2",
  },
  {
    slug: "ocr-displacement-adds-positions",
    subjectId: "ocr-alevel-maths",
    topics: ["vectors"],
    statement: "The displacement from A to B is OA + OB — add the two position vectors.",
    explanation:
      "Displacement is what carries you from A to B, so AB = OB − OA: destination minus start. Adding the position vectors points somewhere else entirely.",
    example: "With OA = (1, 2, 0) and OB = (4, 6, 1), the student writes AB = (5, 8, 1) instead of OB − OA = (3, 4, 1).",
    correction:
      "Subtract start from end: AB = OB − OA. A quick sketch of triangle OAB catches the order.",
    tag: "conceptual",
    ao: "AO1",
  },
  // --- Edexcel & OCR GCSE -------------------------------------------------
  {
    slug: "edexcel-exclusive-independent",
    subjectId: "edexcel-gcse-maths",
    topics: ["probability"],
    statement: "If two events are mutually exclusive they must also be independent, because neither affects the other.",
    explanation:
      "The two words describe different things. Mutually exclusive: the events cannot both happen, so P(A ∩ B) = 0. Independent: one happening does not change the other's probability, so P(A ∩ B) = P(A)P(B). Both at once would force P(A)P(B) = 0 — at least one event is impossible.",
    example: "On a Venn diagram the student labels two non-overlapping events 'independent', when P(A ∩ B) = 0 contradicts P(A)P(B) > 0.",
    correction:
      "Exclusive → cannot co-occur: add probabilities, intersection is 0. Independent → no effect on each other: multiply probabilities.",
    tag: "terminology",
    ao: "AO1",
  },
  {
    slug: "ocr-nth-term-vs-sum",
    subjectId: "ocr-gcse-maths",
    topics: ["sequences"],
    statement: "To find how many terms are needed for the total to exceed 100, set the nth term a·rⁿ⁻¹ greater than 100.",
    explanation:
      "The nth term gives the size of one term, not the running total. 'Total exceeds 100' is a sum question: solve Sₙ > 100 using Sₙ = a(1 − rⁿ)/(1 − r) for a geometric series or Sₙ = n/2(2a + (n − 1)d) for an arithmetic one.",
    example: "For 3, 6, 12, … the student solves 3·2ⁿ⁻¹ > 100 and reports n = 6, when the sum first passes 100 at n = 5 (93 → 189).",
    correction:
      "'Which term' → nth term formula; 'total after n terms' or 'how many terms to exceed' → sum formula Sₙ.",
    tag: "misread-command",
    ao: "AO2",
  },
  // --- WJEC GCSE -----------------------------------------------------------
  {
    slug: "wjec-gcse-tangent-chord-gradient",
    subjectId: "wjec-gcse-maths",
    topics: ["coordinate-geometry"],
    statement: "To find the gradient of the tangent at a point on a circle, use the gradient of the chord from the centre.",
    explanation:
      "A tangent is perpendicular to the radius at the point of contact — so the radius through that point is the line whose gradient you need, then turn it into the negative reciprocal (m₁m₂ = −1). The chord's gradient belongs to a different line entirely.",
    example: "For x² + y² = 25 at (3, 4) the student uses the chord from (3, 4) to (5, 0), gradient −2, instead of the radius gradient 4/3 and tangent gradient −3/4.",
    correction:
      "Radius gradient first (y/x from the centre), then tangent = negative reciprocal. Check: radius × tangent = −1.",
    tag: "method-skipped",
    ao: "AO2",
  },
  {
    slug: "wjec-gcse-quotient-rule-order",
    subjectId: "wjec-gcse-maths",
    topics: ["differentiation"],
    statement: "For y = u/v, the numerator of the quotient rule is (uv′ − u′v) — the order does not matter because the bottom is squared anyway.",
    explanation:
      "The order fixes the sign of the whole derivative: (u/v)′ = (u′v − uv′)/v², with the top's derivative first. Swapping the numerator gives the negative of the correct answer everywhere the denominator is squared and positive.",
    example: "For y = sin x / x the student writes (sin x − x cos x)/x² instead of (x cos x − sin x)/x², flipping every sign.",
    correction:
      "'Top's derivative times bottom, minus top times bottom's derivative, over bottom squared': (u′v − uv′)/v². Test on y = x²/x = x as a sanity check.",
    tag: "conceptual",
    ao: "AO2",
  },
  // --- AQA A-level, wider topics ------------------------------------------
  {
    slug: "aqa-log-of-sum",
    subjectId: "aqa-alevel-maths",
    topics: ["exponentials"],
    statement: "log(a + b) = log a + log b — logs split sums into sums.",
    explanation:
      "The log laws split multiplication and division, not addition: log a + log b = log ab and log a − log b = log(a/b). A sum inside the log has no simplification — log(a + b) stays as it is (factorise out a common power if you must).",
    example: "Solving 3ˣ + 3ˣ⁺¹ = 81, the student writes log(3ˣ) + log(3ˣ⁺¹) = log 81 and loses the structure 3ˣ(1 + 3) = 81 entirely.",
    correction:
      "Factor first, then log: 3ˣ × 4 = 81 → 3ˣ = 20.25 → x = log 20.25 ÷ log 3. Only products and quotients split under logs.",
    tag: "conceptual",
    ao: "AO2",
  },
  {
    slug: "aqa-divide-loses-trig-roots",
    subjectId: "aqa-alevel-maths",
    topics: ["trigonometry"],
    statement: "Solving sin x cos x = 0 by dividing both sides by cos x keeps all the solutions.",
    explanation:
      "Dividing by cos x assumes cos x ≠ 0 — but cos x = 0 is exactly where the other family of solutions lives. Division by a variable expression silently discards that branch; factorising keeps it.",
    example: "From sin x cos x = 0 the student writes tan x = 0 → x = 0°, 180°, 360°, missing x = 90° and 270° where cos x = 0.",
    correction:
      "Factorise instead of dividing: sin x = 0 or cos x = 0, then solve each branch across the stated interval.",
    tag: "method-skipped",
    ao: "AO2",
  },
]);
