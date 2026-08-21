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
]);
