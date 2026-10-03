import { applyHumanVerificationLedger } from "@/domain/human-verification-ledger";
import type { GateContext } from "@/domain/review-gates";
import {
  appendReviewDecisions, emptyAuditLog, promotableLedgerEntries, type ReviewAuditLog, type ReviewDecisionInput,
} from "@/domain/review-workflow";
import { physicsContentFingerprint, REQUIRED_HUMAN_CHECKS } from "@/domain/content-trust";
import type { Question, Topic } from "@/domain/types";

export const SUBJECT = "wjec-alevel-maths";
export const NOW = new Date("2026-10-03T12:00:00.000Z");
export const SPEC = "2024-1.0";

export const topic = (slug: string, order = 1): Topic => ({
  id: `${SUBJECT}.${slug}`, subjectId: SUBJECT, unitId: "u", title: slug.replace(/-/g, " "), order, intrinsicDifficulty: 2, summary: "", keyPoints: [], commonErrors: [],
  specPoints: [{ id: `${SUBJECT}.${slug}.sp-1`, ref: "1.1", text: "Claim", aos: ["AO1"] }], specVersion: SPEC,
}) as Topic;

const baseline = { subject: "maths", structures: ["equation"], representations: ["equation"], operations: ["solve"], relationships: [], outputTypes: ["value"] } as const;
const unfamiliar = { ...baseline, structures: ["graph-dataset"], representations: ["graph"], operations: ["interpret"] } as const;

/** A well-formed WJEC question. `kind: transfer` carries a real baseline link; `data` carries a table. */
export function wq(id: string, slug: string, prompt: string, extra: { flavour?: "transfer" | "data"; marks?: number; seconds?: number } & Partial<Question> = {}): Question {
  const { flavour: kind, marks = 2, seconds, ...rest } = extra;
  const data = kind === "data" ? `\n| x | y |\n|---|---|\n| 1 | 2 |\n| 2 | 5 |\n| 3 | 10 |` : "";
  const demand = kind === "transfer" ? "transfer" : "application";
  const learning = {
    familyId: `fam-${id}`, contextId: `ctx-${id}`, demand, expectedMinutes: seconds ? seconds / 60 : marks * 0.75,
    reasoningMoves: [`move ${id} alpha`, `move ${id} beta`],
    ...(kind === "data" ? { setupFingerprint: { ...baseline, structures: ["table-dataset"], representations: ["table"] } } : {}),
    ...(kind === "transfer" ? { transferLink: { baselinePartId: `${id}:a`, baselineSetupFingerprint: baseline, transferSetupFingerprint: unfamiliar, baselineReasoningGraph: { nodes: [] }, transferReasoningGraph: { nodes: [] } } } : {}),
  };
  return {
    id, subjectId: SUBJECT, topicIds: [`${SUBJECT}.${slug}`], kind: "short", stem: `${prompt}${data}`, totalMarks: marks, calculatorAllowed: true, difficulty: 3,
    origin: "seed", source: "authored", specVersion: SPEC, createdAt: "2026-01-01T00:00:00.000Z", specPointIds: [`${SUBJECT}.${slug}.sp-1`],
    parts: [{ id: `${id}:a`, label: "a", prompt, marks, markScheme: Array.from({ length: marks }, (_, i) => `Point ${i + 1} for ${id}`), modelAnswer: `Worked answer for ${id}`, specPointIds: [`${SUBJECT}.${slug}.sp-1`] }],
    learning, ...rest,
  } as unknown as Question;
}

export const gateFor = (topics: readonly Topic[]): GateContext => ({
  topicIds: new Set(topics.map((t) => t.id)),
  specPointIds: new Set(topics.flatMap((t) => (t.specPoints ?? []).map((s) => s.id))),
  specVersionOf: () => SPEC,
});

/** Distinct problems so no pair is a number, noun or reasoning reskin. */
export const PROMPTS = [
  "Use the factor theorem to decide whether x minus two is a factor of the given cubic polynomial and state the remaining quadratic factor.",
  "Find the coordinates of the stationary point of the curve and use the second derivative to determine its nature in context.",
  "Two events are independent with stated probabilities; calculate the probability that exactly one of them occurs during the trial.",
  "A particle moves along a straight line with constant acceleration; determine its displacement after the stated time interval.",
  "Prove by contradiction that the square root of two cannot be written as a ratio of two integers in lowest terms.",
  "Sketch the graph of the exponential model, label its asymptote, and interpret the growth constant for the population described.",
  "Evaluate the definite integral by substitution and explain geometrically why the signed area changes sign across the interval.",
  "Test at the five per cent level whether the sample mean provides evidence that the population mean has increased.",
];

export function reviewer(id: string, role: "teacher" | "examiner" = "teacher") {
  return { reviewerId: id, reviewerRole: role, reviewerQualification: "Test fixture only — not a real review", reviewedAt: "2026-09-30T10:00:00.000Z" } as const;
}

export function decision(question: Question, who: string, over: Partial<ReviewDecisionInput> = {}): ReviewDecisionInput {
  return {
    questionId: question.id, contentFingerprint: physicsContentFingerprint(question), decision: "approve", ...reviewer(who),
    checks: Object.fromEntries(REQUIRED_HUMAN_CHECKS.map((c) => [c, true])) as ReviewDecisionInput["checks"], comments: "", ...over,
  };
}

/**
 * Test-only: two named fixture reviewers approve each question through the real
 * workflow, so trust comes from the same audit-log → ledger path as production.
 * Nothing in the shipped bank is approved by this.
 */
export function verifyThroughWorkflow(questions: readonly Question[], ids: readonly string[], log: ReviewAuditLog = emptyAuditLog()): { questions: Question[]; log: ReviewAuditLog } {
  let current = log;
  for (const who of ["fixture-reviewer-a", "fixture-reviewer-b"]) {
    const result = appendReviewDecisions(current, ids.map((id) => decision(questions.find((q) => q.id === id)!, who)), questions, NOW.getTime());
    if (result.problems.length) throw new Error(JSON.stringify(result.problems));
    current = result.log;
  }
  const applied = applyHumanVerificationLedger(questions, { formatVersion: 1, entries: promotableLedgerEntries(questions, current) });
  if (applied.issues.some((i) => i.blocking)) throw new Error(JSON.stringify(applied.issues));
  return { questions: applied.questions, log: current };
}

/** Twenty-four unrelated problems: none is a number, noun or reasoning reskin of another. */
export const DISTINCT_PROMPTS = [
  "Use the factor theorem to decide whether x minus two is a factor of the given cubic polynomial and state the remaining quadratic factor.",
  "Find the coordinates of the stationary point of the curve and use the second derivative to determine its nature in context.",
  "Two events are independent with stated probabilities; calculate the probability that exactly one of them occurs during the trial.",
  "A particle moves along a straight line with constant acceleration; determine its displacement after the stated time interval.",
  "Prove by contradiction that the square root of two cannot be written as a ratio of two integers in lowest terms.",
  "Sketch the graph of the exponential model, label its asymptote, and interpret the growth constant for the population described.",
  "Evaluate the definite integral by substitution and explain geometrically why the signed area changes sign across the interval.",
  "Test at the five per cent level whether the sample mean provides evidence that the population mean has increased.",
  "Expand the binomial expression up to the third term and use it to approximate the value of the given power.",
  "Resolve the forces acting on the ladder, take moments about its base and find the minimum coefficient of friction.",
  "Determine the vector equation of the line through two points and decide whether it meets the given plane.",
  "Use the Newton Raphson method from the given starting value and comment on why it fails near a stationary point.",
  "Solve the trigonometric equation on the stated interval and give every solution correct to one decimal place.",
  "Model the cooling of the liquid with a differential equation, separate the variables and find the particular solution.",
  "Find the sum to infinity of the geometric series and state the condition on the common ratio for convergence.",
  "Calculate the product moment correlation coefficient for the paired readings and state a conclusion about linear association.",
  "Describe the transformation that maps the first curve onto the second and write the equation of the image.",
  "Show that the arithmetic sequence has a given nth term and find the smallest n for which the total exceeds the target.",
  "Differentiate implicitly to find the gradient at the stated point and hence write the equation of the normal.",
  "Construct a tree diagram for sampling without replacement and find the conditional probability of the second colour.",
  "Use integration by parts to find the exact area enclosed between the logarithmic curve and the horizontal axis.",
  "Decide which continuous distribution models the waiting time and compute the probability of exceeding the mean.",
  "Prove the identity involving double angles and use it to solve the stated equation without a calculator.",
  "Estimate the gradient of the tangent numerically using a small step and compare with the exact derivative.",
];
