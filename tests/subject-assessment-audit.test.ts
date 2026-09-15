import { describe, expect, it } from "vitest";
import { wjecBiologyQualityQuestions } from "@/content/questions/wjec-biology-quality";
import { wjecChemistryQualityQuestions } from "@/content/questions/wjec-chemistry-quality";
import { wjecFlagshipDepthQuestions } from "@/content/questions/wjec-flagship-depth";
import { wjecMathsQualityQuestions } from "@/content/questions/wjec-maths-quality";
import { wjecCapabilities } from "@/content/capabilities";
import { wjecDepthCurricula } from "@/content/wjec-subject-capabilities";
import { wjecFlagshipCurricula } from "@/content/wjec-subject-capabilities";
import { seedQuestions } from "@/content";
import { defineQuestion } from "@/content/questions/authoring";
import { qualityItem } from "@/content/questions/wjec-quality-authoring";
import { auditFlagshipSubject, buildFlagshipDepthDashboard } from "@/domain/subject-assessment-audit";
import { classifyNumericalClaims, promptAnswerClaims, transferNoveltyClasses } from "@/domain/subject-assessment-audit";
import { semanticRouteDistance } from "@/domain/physics-assessment-quality";
import type { LearningDemand, Question } from "@/domain/types";

const qualityBanks = [wjecMathsQualityQuestions, wjecBiologyQualityQuestions, wjecChemistryQualityQuestions];
const subjects = ["maths", "biology", "chemistry"] as const;

function flagshipBank(subject: (typeof subjects)[number]): Question[] {
  const quality = qualityBanks[subjects.indexOf(subject)]!;
  return [...quality, ...wjecFlagshipDepthQuestions.filter((question) => question.subjectId === `wjec-alevel-${subject}`)];
}

describe("WJEC flagship depth pack", () => {
  it.each(subjects)("reaches at least twenty deep statements for %s", (subject) => {
    const curriculum = wjecDepthCurricula[subjects.indexOf(subject)]!;
    const audit = auditFlagshipSubject({ subjectId: curriculum.subject.id, topics: curriculum.topics,
      questions: flagshipBank(subject), nodes: wjecCapabilities });
    expect(audit.completeStatements).toBeGreaterThanOrEqual(20);
    expect(audit.correctness.errors).toBe(0);
    expect(audit.issues.filter((issue) => issue.kind !== "unreviewed")).toEqual([]);
    expect(audit.approvedQuestions).toBe(0);
    expect(audit.releaseReady).toBe(false);
  });

  it("reports a balanced internal dashboard while keeping drafts out of trusted counts", () => {
    const dashboard = buildFlagshipDepthDashboard({
      curricula: wjecDepthCurricula,
      questions: qualityBanks.flat().concat(wjecFlagshipDepthQuestions),
      nodes: wjecCapabilities,
    });
    expect(dashboard.balancedAtTwenty).toBe(true);
    expect(dashboard.subjects).toHaveLength(3);
    expect(dashboard.subjects.every((row) => row.deepComplete >= 20)).toBe(true);
    expect(dashboard.subjects.every((row) => row.approvedQuestions === 0)).toBe(true);
    // Existing quality packs are generated drafts too; the dashboard counts
    // the whole internal inventory, while the new pack must be present.
    expect(dashboard.generatedQuestionCount).toBeGreaterThanOrEqual(wjecFlagshipDepthQuestions.length);
  });

  it("can report all four WJEC flagships without changing the student surface", () => {
    const dashboard = buildFlagshipDepthDashboard({ curricula: wjecFlagshipCurricula, questions: seedQuestions, nodes: wjecCapabilities });
    expect(dashboard.subjects.map((row) => row.subjectId)).toEqual([
      "wjec-alevel-physics", "wjec-alevel-maths", "wjec-alevel-biology", "wjec-alevel-chemistry",
    ]);
    expect(dashboard.subjects[0]!.statements).toBe(108);
    expect(dashboard.subjects[0]!.deepComplete).toBe(108);
    expect(dashboard.balancedAtTwenty).toBe(true);
  });
});

function fixture(subjectId: string, prompt: string, modelAnswer: string): Question {
  return defineQuestion({ slug: `audit-fixture-${subjectId}`, subjectId, topics: ["fixture"], stem: "Fixture", parts: [
    { prompt, marks: 1, scheme: [modelAnswer], answer: modelAnswer },
  ] });
}

function substantiveFixture(
  subjectId: string,
  slug: string,
  demand: LearningDemand,
  prompt: string,
  modelAnswer: string,
): Question {
  return defineQuestion({
    slug: `audit-substantive-${slug}`,
    subjectId,
    topics: ["fixture"],
    stem: "Adversarial subject-audit fixture",
    parts: [{
      prompt,
      marks: 2,
      scheme: ["Use the stated relation or mechanism.", modelAnswer],
      answer: modelAnswer,
      learning: {
        familyId: `fixture:${slug}:family`,
        contextId: `fixture:${slug}:context`,
        demand,
        reasoningMoves: ["fixture reasoning"],
        quality: "substantive",
      },
    }],
  });
}

function subjectIssues(question: Question) {
  return auditFlagshipSubject({ subjectId: question.subjectId, topics: [], questions: [question], nodes: [] }).subjectIssues;
}

describe("subject-specific correctness checks", () => {
  it("treats a numeric answer placed in a calculation prompt as a hard leakage error", () => {
    const question = substantiveFixture(
      "wjec-alevel-maths", "answer-leak-numeric", "calculation",
      "For f(x) = x², calculate f'(3) = 14 from the supplied information.",
      "f'(3) = 14.",
    );
    expect(subjectIssues(question).some((issue) => issue.kind === "answer-leakage" && issue.severity === "error")).toBe(true);
  });

  it("catches simplified algebraic expressions and prose conclusions leaked into prompts", () => {
    expect(promptAnswerClaims("Simplify (√2 + 1)^2 to 3 + 2√2.")).toContain("3 + 2√2");
    const algebra = substantiveFixture(
      "wjec-alevel-maths", "answer-leak-expression", "calculation",
      "Simplify (√2 + 1)^2 to 3 + 2√2.",
      "The simplified expression is 3 + 2√2.",
    );
    const biology = substantiveFixture(
      "wjec-alevel-biology", "answer-leak-conclusion", "explanation",
      "The effect is increased enzyme activity. Explain why the effect occurs.",
      "The effect is increased enzyme activity because more active sites form enzyme-substrate complexes.",
    );
    expect(subjectIssues(algebra).some((issue) => issue.kind === "answer-leakage" && issue.severity === "error")).toBe(true);
    expect(subjectIssues(biology).some((issue) => issue.kind === "answer-leakage" && issue.severity === "error")).toBe(true);
  });

  it("does not mistake an instructed route such as solve f' = 0 for a leaked result", () => {
    const prompt = "Calculate f'(3) using solve f' = 0 then compare the stationary values.";
    expect(promptAnswerClaims(prompt)).toEqual([]);
    const question = substantiveFixture("wjec-alevel-maths", "answer-leak-route-instruction", "calculation", prompt,
      "Solve f'(x) = 0, compare the values and report the stationary point.");
    expect(subjectIssues(question).some((issue) => issue.kind === "answer-leakage")).toBe(false);
  });

  it("keeps a supplied equation distinct from a leaked result and catches selection leaks", () => {
    expect(promptAnswerClaims("Calculate y = 2x from the supplied relation.")).toEqual([]);
    expect(promptAnswerClaims("Select 14 as the concentration.")).toContain("14");
    const suppliedRelation = substantiveFixture(
      "wjec-alevel-maths", "answer-leak-supplied-equation", "calculation",
      "Calculate y = 2x from the supplied relation.",
      "Using y = 2x and x = 2 gives y = 4.",
    );
    const selection = substantiveFixture(
      "wjec-alevel-chemistry", "answer-leak-selection", "calculation",
      "Select 0.020 mol dm^-3 as the concentration.",
      "The concentration is 0.020 mol dm^-3.",
    );
    expect(subjectIssues(suppliedRelation).some((issue) => issue.kind === "answer-leakage")).toBe(false);
    expect(subjectIssues(selection).some((issue) => issue.kind === "answer-leakage" && issue.severity === "error")).toBe(true);
  });

  it("catches a qualitative conclusion embedded in a predictive prompt", () => {
    const question = substantiveFixture(
      "wjec-alevel-biology", "answer-leak-prediction", "explanation",
      "Predict that water moves into the cell. Explain why.",
      "Water moves into the cell because its water potential is higher outside.",
    );
    expect(subjectIssues(question).some((issue) => issue.kind === "answer-leakage" && issue.severity === "error")).toBe(true);
  });

  it("requires concrete capability evidence in the student-facing setup", () => {
    const question = substantiveFixture(
      "wjec-alevel-maths", "missing-capability-evidence", "calculation",
      "Use the polynomial equation x² - 5x + 6 = 0 to find its roots.",
      "The roots are x = 2 and x = 3.",
    );
    const part = question.parts[0]!;
    part.specPointIds = ["wjec-alevel-maths.algebra.sp-01"];
    part.capabilityIds = ["math.algebra.sp-01"];
    part.learning = {
      ...part.learning!,
      capabilityEvidence: {
        capabilityId: "math.algebra.sp-01",
        requiredEntities: ["surd"],
        requiredOperations: ["simplify"],
      },
    };
    expect(subjectIssues(question).some((issue) => issue.kind === "capability-evidence" && /surd/i.test(issue.detail))).toBe(true);
  });

  it("rejects provenance that invents a final number without a source-linked route", () => {
    const question = substantiveFixture(
      "wjec-alevel-maths", "invented-provenance-number", "calculation",
      "For x = 2, calculate y from the stated relation.",
      "y = 42.",
    );
    const part = question.parts[0]!;
    part.specPointIds = ["wjec-alevel-maths.algebra.sp-01"];
    part.capabilityIds = ["math.algebra.sp-01"];
    part.learning = {
      ...part.learning!,
      provenance: {
        sourceEvidence: ["x = 2"],
        operation: "calculate",
        intermediateResults: [],
        finalResult: "y = 42",
      },
    };
    expect(subjectIssues(question).some((issue) => issue.kind === "provenance" && /42|source-linked/i.test(issue.detail))).toBe(true);
  });

  it("rejects an inconsistent intermediate even when the final value looks plausible", () => {
    const question = substantiveFixture(
      "wjec-alevel-maths", "wrong-intermediate", "calculation",
      "For x = 2, calculate y from y = 2x.",
      "2 × 2 = 5, so y = 4.",
    );
    const part = question.parts[0]!;
    part.learning = {
      ...part.learning!,
      provenance: {
        sourceEvidence: ["x = 2", "y = 2x"],
        operation: "calculate",
        intermediateResults: ["2 × 2 = 5"],
        finalResult: "y = 4",
      },
    };
    expect(subjectIssues(question).some((issue) => issue.kind === "provenance" && /Arithmetic step is inconsistent/i.test(issue.detail))).toBe(true);
  });

  it("rejects provenance that changes the Maths function or invents a Chemistry species", () => {
    const maths = substantiveFixture(
      "wjec-alevel-maths", "wrong-function", "calculation",
      "Given f(x) = x², calculate f'(2).",
      "g'(x) = 2x, so g'(2) = 4.",
    );
    const mathsPart = maths.parts[0]!;
    mathsPart.learning = {
      ...mathsPart.learning!,
      provenance: { sourceEvidence: ["f(x) = x²"], operation: "differentiate", intermediateResults: ["g'(x) = 2x"], finalResult: "g'(2) = 4" },
    };
    const chemistry = substantiveFixture(
      "wjec-alevel-chemistry", "wrong-species", "calculation",
      "For NaOH(aq), calculate the amount from the supplied concentration and volume.",
      "HCl(aq) provides the reacting amount, so n = 0.020 mol.",
    );
    const chemistryPart = chemistry.parts[0]!;
    chemistryPart.learning = {
      ...chemistryPart.learning!,
      provenance: { sourceEvidence: ["NaOH(aq)"], operation: "calculate", intermediateResults: ["n = 0.020 mol"], finalResult: "n = 0.020 mol" },
    };
    expect(subjectIssues(maths).some((issue) => issue.kind === "provenance" && /different function/i.test(issue.detail))).toBe(true);
    expect(subjectIssues(chemistry).some((issue) => issue.kind === "provenance" && /HCl/i.test(issue.detail))).toBe(true);
  });

  it("classifies supplied and derived numerical claims separately", () => {
    const question = substantiveFixture(
      "wjec-alevel-maths", "numeric-claim-roles", "calculation",
      "For x = 2, calculate y = 2x.",
      "2 × 2 = 4, so y = 4.",
    );
    const part = question.parts[0]!;
    part.learning = {
      ...part.learning!,
      provenance: {
        sourceEvidence: ["x = 2", "y = 2x"],
        operation: "calculate",
        intermediateResults: ["2 × 2 = 4"],
        finalResult: "y = 4",
      },
    };
    const claims = classifyNumericalClaims(part);
    expect(claims.some((claim) => claim.location === "prompt" && claim.value === "2" && claim.role === "supplied")).toBe(true);
    expect(claims.some((claim) => claim.location === "answer" && claim.value === "4" && claim.role === "derived-final")).toBe(true);
  });

  it("does not label a raw graph datum as a verified graph-derived result", () => {
    const question = substantiveFixture(
      "wjec-alevel-maths", "graph-claim-roles", "calculation",
      "A graph shows a raw reading of 4.0 at x = 2. Use the tangent to calculate the gradient.",
      "The tangent gradient is 2.0.",
    );
    const part = question.parts[0]!;
    part.learning = {
      ...part.learning!,
      provenance: { sourceEvidence: ["4.0", "x = 2"], operation: "calculate gradient", intermediateResults: [], finalResult: "gradient = 2.0" },
    };
    const claims = classifyNumericalClaims(part);
    expect(claims.some((claim) => claim.location === "prompt" && claim.value === "4.0" && claim.role === "supplied")).toBe(true);
    expect(claims.some((claim) => claim.location === "answer" && claim.value === "2.0" && claim.role === "graph-derived")).toBe(true);
  });

  it("requires transfer novelty to change the information structure, not only the label", () => {
    expect(transferNoveltyClasses("Use an unfamiliar graph representation with a hidden parameter and a fixed integer constraint.")).toEqual(
      expect.arrayContaining(["representation", "hidden-state", "constraint"]),
    );
    const question = substantiveFixture(
      "wjec-alevel-maths", "transfer-without-novelty", "transfer",
      "Use a different context and calculate the same value using the same method.",
      "The different context gives the same value by the same method.",
    );
    expect(subjectIssues(question).some((issue) => issue.kind === "transfer-novelty" && issue.severity === "error")).toBe(true);
  });

  it("keeps semantic route distance sensitive to a genuinely different representation", () => {
    expect(semanticRouteDistance("substitute the equation and calculate the value", "substitute the equation and calculate the value")).toBe(0);
    expect(semanticRouteDistance("substitute the equation and calculate the value", "read the graph gradient, infer the hidden parameter and compare the trend")).toBeGreaterThan(0.2);
  });

  it("requires explicit secondary capability evidence for synoptic work", () => {
    const question = substantiveFixture(
      "wjec-alevel-maths", "synoptic-without-secondary", "synoptic",
      "Combine differentiation with the area of a rectangle and determine the optimum.",
      "Differentiate the area expression, compare the admissible values and report the optimum.",
    );
    const part = question.parts[0]!;
    part.specPointIds = ["wjec-alevel-maths.differentiation.sp-04"];
    part.capabilityIds = ["math.differentiation.sp-04"];
    part.learningClaims = ["differentiation", "area"];
    expect(subjectIssues(question).some((issue) => issue.kind === "synoptic-evidence" && issue.severity === "error")).toBe(true);
  });

  it("labels uninstantiated helper prose as scaffold while allowing an instantiated operation", () => {
    const scaffold = qualityItem(
      "maths", "differentiation", 1, "fallback-helper", "calculation", "fallback", "generic route",
      "Calculate the requested value from the stated value using the appropriate method.",
      ["Use the appropriate method."], "Use the appropriate method.",
    );
    expect(scaffold.parts[0]!.learning?.quality).toBe("scaffold");

    const authored = qualityItem(
      "maths", "differentiation", 1, "instantiated-helper", "calculation", "route", "differentiate a named function",
      "For f(x) = x², use the appropriate method to calculate f'(2).",
      ["Differentiate f(x) = x² to obtain f'(x) = 2x.", "Substitute x = 2 to obtain f'(2) = 4."],
      "Using f'(x) = 2x, substitute x = 2 and obtain f'(2) = 4.",
    );
    expect(authored.parts[0]!.learning?.quality).toBe("substantive");
  });

  it("excludes a mapped cell with missing standalone capability/spec metadata", () => {
    const question = qualityItem(
      "maths", "differentiation", 1, "missing-map", "recall", "map", "state the rule",
      "State the derivative rule for f(x) = x².",
      ["The derivative is f'(x) = 2x."], "f'(x) = 2x.",
    );
    question.parts[0]!.specPointIds = [];
    question.parts[0]!.capabilityIds = [];
    const curriculum = wjecDepthCurricula[0]!;
    const audit = auditFlagshipSubject({ subjectId: curriculum.subject.id, topics: curriculum.topics, questions: [question], nodes: wjecCapabilities });
    expect(audit.completeStatements).toBe(0);
    expect(audit.issues.some((issue) => issue.kind === "missing-spec-point")).toBe(true);
    expect(audit.repairQueue[0]?.priority).toBe("missing-authored-demand");
  });

  it("catches a non-equivalent Maths identity", () => {
    const question = fixture("wjec-alevel-maths", "Check the identity. x + 1 = x + 2.", "x + 1 = x + 2");
    const audit = auditFlagshipSubject({ subjectId: question.subjectId, topics: [], questions: [question], nodes: [] });
    expect(audit.subjectIssues.some((issue) => issue.kind === "maths-equivalence" && issue.severity === "error")).toBe(true);
  });

  it("catches an unqualified Biology contradiction", () => {
    const question = fixture("wjec-alevel-biology", "Explain the effect on rate.", "The rate increases and decreases.");
    const audit = auditFlagshipSubject({ subjectId: question.subjectId, topics: [], questions: [question], nodes: [] });
    expect(audit.subjectIssues.some((issue) => issue.kind === "biology-contradiction" && issue.severity === "error")).toBe(true);
  });

  it("catches an atom-unbalanced Chemistry equation", () => {
    const question = fixture("wjec-alevel-chemistry", "Balance the reaction.", "H2 + O2 -> H2O");
    const audit = auditFlagshipSubject({ subjectId: question.subjectId, topics: [], questions: [question], nodes: [] });
    expect(audit.subjectIssues.some((issue) => issue.kind === "chemistry-equation-balance" && issue.severity === "error")).toBe(true);
  });

  it("keeps scaffold and placeholder cells out of deep completion", () => {
    const question = defineQuestion({
      slug: "audit-scaffold-cell",
      subjectId: "wjec-alevel-maths",
      topics: ["fixture"],
      stem: "Scaffold fixture",
      parts: [{
        prompt: "Use the stated value and graph to trace the relationship to the target.",
        marks: 1,
        scheme: ["Use appropriate method."],
        answer: "Use appropriate method.",
        learning: {
          familyId: "fixture:scaffold:family",
          contextId: "fixture:scaffold:context",
          demand: "application",
          reasoningMoves: ["generic route"],
          quality: "scaffold",
        },
      }],
    });
    const audit = auditFlagshipSubject({ subjectId: question.subjectId, topics: [], questions: [question], nodes: [] });
    expect(audit.completeStatements).toBe(0);
    expect(audit.repairQueue.some((item) => item.reasons.some((reason) => reason.includes("generic-fallback")))).toBe(true);
    expect(audit.subjectIssues.some((issue) => issue.kind === "generic-fallback" && issue.severity === "error")).toBe(true);
  });

  it("flags missing standalone data and solution substance", () => {
    const question = substantiveFixture(
      "wjec-alevel-maths",
      "missing-data-and-solution",
      "calculation",
      "Calculate the target value from the stated value and the graph using the relationship.",
      "Use appropriate method.",
    );
    const kinds = new Set(subjectIssues(question).map((issue) => issue.kind));
    expect(kinds.has("generic-fallback")).toBe(true);
    expect(kinds.has("not-self-contained")).toBe(true);
    expect(kinds.has("solution-substance")).toBe(true);
  });

  it("rejects empty or meta mark schemes even when the answer has numbers", () => {
    const question = defineQuestion({
      slug: "audit-meta-mark-scheme",
      subjectId: "wjec-alevel-maths",
      topics: ["fixture"],
      stem: "Meta mark scheme fixture",
      parts: [{
        prompt: "Calculate the gradient of y = 2x + 1 between x = 0 and x = 3.",
        marks: 2,
        scheme: ["Award the method mark.", "Award the answer mark."],
        answer: "m = (7 − 1)/(3 − 0) = 2.",
        learning: {
          familyId: "fixture:meta-scheme:family",
          contextId: "fixture:meta-scheme:context",
          demand: "calculation",
          reasoningMoves: ["calculate a gradient from two points"],
          quality: "substantive",
        },
      }],
    });
    expect(subjectIssues(question).some((issue) => issue.kind === "generic-fallback" && issue.severity === "error")).toBe(true);
  });

  it("requires a supplied graph and a concrete variable before counting a cell", () => {
    const graph = substantiveFixture(
      "wjec-alevel-maths",
      "missing-graph",
      "application",
      "Use the graph to calculate the requested value of the variable.",
      "The result is correct.",
    );
    const kinds = new Set(subjectIssues(graph).map((issue) => issue.kind));
    expect(kinds.has("not-self-contained")).toBe(true);
    expect(kinds.has("solution-substance")).toBe(true);
  });

  it("does not treat a bare graph reference as supplied data", () => {
    const question = substantiveFixture(
      "wjec-alevel-maths",
      "graph-reference-only",
      "application",
      "Use the graph shown below to calculate x.",
      "The result is correct.",
    );
    expect(subjectIssues(question).some((issue) => issue.kind === "not-self-contained")).toBe(true);
  });

  it("flags an explicitly referenced Maths variable with no definition", () => {
    const question = substantiveFixture(
      "wjec-alevel-maths",
      "undefined-variable",
      "calculation",
      "Calculate the variable z using x and y.",
      "z = 4.",
    );
    expect(subjectIssues(question).some((issue) => issue.kind === "not-self-contained" && /variable|definition/i.test(issue.detail))).toBe(true);
  });

  it("rejects a method instruction that never carries out the calculation", () => {
    const question = substantiveFixture(
      "wjec-alevel-maths",
      "method-only-answer",
      "calculation",
      "For f(x) = x^3, calculate f'(x).",
      "Differentiate the function using the power rule.",
    );
    expect(subjectIssues(question).some((issue) => issue.kind === "solution-substance")).toBe(true);
  });

  it.each([
    ["wrong-derivative", "calculation", "For f(x) = x^3, calculate f'(x).", "f'(x) = 2x^2.", "maths-calculus"],
    ["wrong-integral", "calculation", "Calculate ∫ 1/x dx.", "∫ 1/x dx = 1/x^2 + C.", "maths-calculus"],
    ["wrong-trig-identity", "explanation", "Show whether sin²x + cos²x = 2 is an identity.", "sin²x + cos²x = 2.", "maths-equivalence"],
    ["wrong-conditional-denominator", "calculation", "Calculate P(A|B) using P(A ∩ B)/P(A).", "P(A|B) = P(A ∩ B) / P(A).", "maths-equivalence"],
    ["domain-violation", "calculation", "Solve ln(x) = 1 for x > 0.", "x = -2.", "maths-domain"],
    ["wrong-linear-root", "calculation", "Solve 3x + 2 = 11.", "x = 4.", "maths-equivalence"],
    ["wrong-graph-shift", "explanation", "State the transformation f(x + 2).", "The graph shifts right by 2.", "maths-equivalence"],
    ["wrong-vector-dot", "calculation", "For a = (2, 3) and b = (4, 5), calculate the dot product.", "a · b = 22.", "maths-equivalence"],
    ["wrong-independent-product", "calculation", "A and B are independent. Find P(A ∩ B).", "P(A ∩ B) = P(A) + P(B).", "maths-equivalence"],
    ["wrong-suvat", "calculation", "Use v = u + at for u = 2 m s^-1, a = 3 m s^-2 and t = 4 s; calculate v.", "v = 8 m s^-1.", "maths-mechanics"],
    ["wrong-mean", "calculation", "The data values are 2, 4, 6. Calculate the mean.", "mean = 5.", "maths-statistics"],
    ["wrong-log", "calculation", "Solve ln(x) = 2 for x > 0.", "x = 5.", "maths-equivalence"],
    ["wrong-coordinate-gradient", "calculation", "Points A(1, 2) and B(4, 8) are given. Calculate the gradient.", "gradient = 1.", "maths-equivalence"],
    ["wrong-radical-root", "calculation", "Solve √(x + 3) = x - 1.", "x = -2.", "maths-domain"],
  ] as const)("catches adversarial Maths %s", (_slug, demand, prompt, answer, kind) => {
    const question = substantiveFixture("wjec-alevel-maths", _slug, demand, prompt, answer);
    expect(subjectIssues(question).some((issue) => issue.kind === kind && issue.severity === "error")).toBe(true);
  });

  it.each([
    ["water-potential-reversal", "explanation", "Explain net water movement across a partially permeable membrane.", "Water moves from lower water potential to higher water potential.", "biology-causal-chain"],
    ["passive-diffusion-reversal", "explanation", "Explain diffusion down a concentration gradient.", "Passive diffusion moves from lower concentration to higher concentration.", "biology-causal-chain"],
    ["photosynthesis-organelle", "recall", "Identify the organelle where photosynthesis occurs.", "Photosynthesis occurs in the mitochondria.", "biology-terminology"],
    ["xylem-sucrose", "recall", "State which tissue transports sucrose.", "Xylem transports sucrose.", "biology-terminology"],
    ["dna-uracil", "recall", "State the base found in DNA.", "DNA contains uracil.", "biology-terminology"],
    ["correlation-causation", "explanation", "Evaluate whether correlation proves a biological mechanism.", "Correlation proves causation.", "biology-data-interpretation"],
    ["data-overclaim", "application", "Use the assay data to evaluate the treatment effect.", "The treatment definitively caused the increase.", "biology-data-interpretation"],
    ["ribosome-confusion", "recall", "State the role of a ribosome.", "The ribosome produces ATP.", "biology-terminology"],
    ["osmosis-atp", "explanation", "Explain osmosis across a membrane.", "Osmosis requires ATP to move water.", "biology-causal-chain"],
  ] as const)("catches adversarial Biology %s", (_slug, demand, prompt, answer, kind) => {
    const question = substantiveFixture("wjec-alevel-biology", _slug, demand, prompt, answer);
    expect(subjectIssues(question).some((issue) => issue.kind === kind && issue.severity === "error")).toBe(true);
  });

  it("flags a Biology practical answer that omits controls and replication", () => {
    const question = substantiveFixture(
      "wjec-alevel-biology", "practical-controls", "application",
      "Design an experiment to test whether temperature changes enzyme rate.",
      "Change the temperature and record the rate.",
    );
    expect(subjectIssues(question).some((issue) => issue.kind === "biology-practical-design" && issue.severity === "warning")).toBe(true);
  });

  it.each([
    ["ionic-charge", "calculation", "Check Fe2+ + Cl2 -> Fe3+ + Cl-.", "Fe2+ + Cl2 -> Fe3+ + Cl-.", "chemistry-equation-balance"],
    ["ionic-superscript-charge", "calculation", "Check Fe^2+ + OH- -> Fe(OH)2.", "Fe^2+ + OH- -> Fe(OH)2.", "chemistry-equation-balance"],
    ["oxidation-state", "recall", "State the oxidation state of O in H2O.", "In H2O, oxygen has oxidation state +2.", "chemistry-oxidation-state"],
    ["stoichiometric-ratio", "calculation", "For 2H2 + O2 -> 2H2O, state the H2:O2 mole ratio.", "The H2:O2 mole ratio is 1:1.", "chemistry-stoichiometry"],
    ["generic-stoichiometric-ratio", "calculation", "For N2 + 3H2 -> 2NH3, state the N2:H2 mole ratio.", "The N2:H2 mole ratio is 1:1.", "chemistry-stoichiometry"],
    ["equilibrium-expression", "calculation", "For A + B ⇌ C, write Kc.", "Kc = [A][B] / [C].", "chemistry-equilibrium"],
    ["equilibrium-exponent", "calculation", "For A + 2B ⇌ C, write Kc.", "Kc = [C] / [A][B].", "chemistry-equilibrium"],
    ["equilibrium-reversal-generic", "calculation", "For N2O4 ⇌ 2NO2, write Kc.", "Kc = [N2O4] / [NO2]^2.", "chemistry-equilibrium"],
    ["oxidation-generic", "recall", "State the oxidation state of Fe in Fe2O3.", "In Fe2O3, iron has oxidation state +2.", "chemistry-oxidation-state"],
    ["acid-base-ph", "calculation", "Given [H+] = 1 × 10^-3 mol dm-3, calculate pH.", "pH = 2.", "chemistry-acid-base"],
    ["volume-unit", "calculation", "Calculate n for 25 cm³ of 0.2 mol dm-3 solution.", "n = c × 25 = 5 mol.", "chemistry-unit"],
    ["titration-amount", "calculation", "A 25 cm³ aliquot of 0.2 mol dm-3 solution is used in a titration. Calculate n.", "n = c × 25/1000 = 0.5 mol.", "chemistry-stoichiometry"],
    ["electron-half-equation", "calculation", "Check the reduction half-equation Fe3+ + e- -> Fe2+.", "Fe3+ + 2e- -> Fe2+.", "chemistry-stoichiometry"],
    ["empirical-formula", "calculation", "A compound contains 24.0 g carbon and 4.0 g hydrogen. Find its empirical formula.", "The empirical formula is CH.", "chemistry-stoichiometry"],
  ] as const)("catches adversarial Chemistry %s", (_slug, demand, prompt, answer, kind) => {
    const question = substantiveFixture("wjec-alevel-chemistry", _slug, demand, prompt, answer);
    const issues = subjectIssues(question);
    expect(issues.some((issue) => issue.kind === kind && issue.severity === "error")).toBe(true);
  });

  it("keeps precision mismatches as review warnings", () => {
    const question = substantiveFixture("wjec-alevel-chemistry", "precision-warning", "calculation",
      "Calculate the concentration and give it to 2 significant figures.", "c = 0.1234 mol dm-3.");
    expect(subjectIssues(question).some((issue) => issue.kind === "chemistry-precision" && issue.severity === "warning")).toBe(true);
  });

  it("accepts explicitly corrected, valid subject reasoning", () => {
    const valid = [
      substantiveFixture("wjec-alevel-maths", "valid-derivative", "calculation", "For f(x) = x^3, calculate f'(x).", "Using d(x^3)/dx = 3x^2 by the power rule, f'(x) = 3x^2."),
      substantiveFixture("wjec-alevel-biology", "valid-water-direction", "explanation", "Explain net water movement across a partially permeable membrane.", "The quoted lower-to-higher direction is incorrect; water moves from higher to lower water potential instead."),
      substantiveFixture("wjec-alevel-chemistry", "valid-ionic-equation", "calculation", "Check Fe2+ + 2OH- -> Fe(OH)2.", "Fe2+ + 2OH- -> Fe(OH)2 is balanced for atoms and charge."),
      substantiveFixture("wjec-alevel-chemistry", "valid-oxidation-state", "recall", "State the oxidation state of O in H2O.", "In H2O, oxygen has oxidation state -2."),
      substantiveFixture("wjec-alevel-chemistry", "valid-volume-unit", "calculation", "Calculate n for 25 cm3 of 0.2 mol dm-3 solution.", "n = c × 25/1000 = 0.005 mol."),
    ];
    for (const question of valid) {
      expect(subjectIssues(question).filter((issue) => issue.severity === "error"), question.id).toEqual([]);
    }
  });
});
