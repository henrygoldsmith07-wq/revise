import { describe, expect, it } from "vitest";
import { defineQuestion } from "@/content/questions/authoring";
import { wjecFlagshipDepthQuestions } from "@/content/questions/wjec-flagship-depth";
import type { Question, QuestionPart, ReasoningGraph } from "@/domain/types";
import {
  compareTransferStructures,
  fingerprintSetup,
  isDistinctReasoningRoute,
  isSupersetRoute,
  MIN_REASONING_GRAPH_DISTANCE,
  reasoningGraphDistance,
  reasoningGraphForPart,
} from "@/domain/reasoning-graph";
import {
  isFreeTextSecondarySkill,
  isMappedCapabilityId,
  synopticAblationHolds,
  validateSynopticStructure,
} from "@/domain/reasoning-graph";
import { validateSubstantivePart } from "@/domain/subject-assessment-audit";

function graph(nodes: Array<[ReasoningGraph["nodes"][number]["kind"], string]>): ReasoningGraph {
  return { nodes: nodes.map(([kind, label]) => ({ kind, label })) };
}

function substantivePart(overrides: Partial<QuestionPart> & { prompt: string; answer: string }): Question {
  return defineQuestion({
    slug: `adv-${Math.random().toString(36).slice(2, 8)}`,
    subjectId: "wjec-alevel-maths",
    topics: ["fixture"],
    stem: "Adversarial",
    parts: [{
      prompt: overrides.prompt,
      marks: 2,
      scheme: ["Step one with checkable operation.", (overrides as { answer: string }).answer],
      answer: (overrides as { answer: string }).answer,
      specPointIds: ["wjec-alevel-maths.algebra.sp-02"],
      capabilityIds: ["math.algebra.sp-02"],
      learning: {
        familyId: "fixture:family",
        contextId: "fixture:context",
        demand: "transfer",
        reasoningMoves: ["calculate"],
        quality: "substantive",
        ...(overrides.learning ?? {}),
      },
      ...(overrides.specPointIds ? { specPointIds: overrides.specPointIds } : {}),
      ...(overrides.capabilityIds ? { capabilityIds: overrides.capabilityIds } : {}),
      ...(overrides.learningClaims ? { learningClaims: overrides.learningClaims } : {}),
    }],
  });
}

describe("transfer structural novelty", () => {
  it("normalises away pure number substitution", () => {
    const a = fingerprintSetup("Let f(x) = x² − 3x + 2 for 0 ≤ x ≤ 3; use the displayed polynomial.", "f(2) = 0");
    const b = fingerprintSetup("Let f(x) = x² − 7x + 9 for 0 ≤ x ≤ 9; use the displayed polynomial.", "f(5) = 0");
    expect(a).toEqual(b);
  });

  it("gives no credit to renamed contexts, nouns, unfamiliar or new representation wording", () => {
    const base = "Let f(x) = x² − 3x + 2 for 0 ≤ x ≤ 3; use the displayed polynomial.";
    const renamed = "Let f(x) = x² − 3x + 2 for 0 ≤ x ≤ 3; use the unfamiliar projectile model with a new representation.";
    expect(fingerprintSetup(base)).toEqual(fingerprintSetup(renamed));
    const g = graph([["evidence", "supplied-equation"], ["operation", "compute-substitute"], ["intermediate", "roots"], ["constraint", "domain"], ["conclusion", "quantity"]]);
    const comparison = compareTransferStructures(fingerprintSetup(base), fingerprintSetup(renamed), g, g);
    expect(comparison.isNovel).toBe(false);
    expect(comparison.structuralChanges).toEqual([]);
  });

  it("requires one structural and one reasoning-path change", () => {
    const baselineFp = fingerprintSetup("Let f(x) = x² − 3x + 2 for 0 ≤ x ≤ 3; use the displayed polynomial.");
    const transferFp = fingerprintSetup("A graph plots y = x² − 3x + 2 with a hidden integer constraint; read intercepts and infer the admissible roots.");
    const baselineG = graph([["evidence", "supplied-equation"], ["operation", "solve-roots"], ["intermediate", "roots"], ["constraint", "domain"], ["conclusion", "quantity"]]);
    const transferG = graph([["evidence", "hidden-parameter"], ["operation", "infer-hidden"], ["intermediate", "optimum-candidate"], ["constraint", "integer"], ["conclusion", "decision"]]);
    const comparison = compareTransferStructures(baselineFp, transferFp, baselineG, transferG);
    expect(comparison.isNovel).toBe(true);
    expect(comparison.structuralChanges.length).toBeGreaterThanOrEqual(1);
    expect(comparison.reasoningChanges.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects structural-only or reasoning-only changes", () => {
    const fpA = fingerprintSetup("Let f(x) = x² − 3x + 2; use the polynomial.");
    const fpB = fingerprintSetup("A graph plots y = x² − 3x + 2; read intercepts.");
    const gSame = graph([["evidence", "supplied-equation"], ["operation", "solve-roots"], ["intermediate", "roots"], ["constraint", "domain"], ["conclusion", "quantity"]]);
    // Different fingerprint but identical graph: no reasoning-path change.
    const onlyStructural = compareTransferStructures(fpA, fpB, gSame, gSame);
    expect(onlyStructural.isNovel).toBe(false);
  });

  it("requires an explicit baselinePartId for depth transfer cells", () => {
    const question = substantivePart({
      prompt: "A graph plots y = x² − 3x + 2 with a hidden integer constraint; determine the admissible roots P(A|B) and probability.",
      answer: "Intercepts at x = 1 and x = 2 give roots; P(A|B) = 0.5 in the restricted sample space.",
    });
    const part = question.parts[0]!;
    part.learning = { ...part.learning!, demand: "transfer", familyId: "wjec-maths-depth:test:transfer:mechanism" };
    const failures = validateSubstantivePart("wjec-alevel-maths", question, part);
    expect(failures.some((f) => f.kind === "transfer-not-novel")).toBe(true);
  });

  it("compares eight fingerprint dimensions", () => {
    const fp = fingerprintSetup("Let f(x) = x² − 3x + 2; use the polynomial.");
    expect(Object.keys(fp)).toEqual(expect.arrayContaining([
      "relationshipTopology", "knownVsUnknown", "hiddenState", "representationType",
      "operationSequence", "suppliedVsInferred", "constraintType", "requestedOutput",
    ]));
  });
});

describe("generated-depth transfer bypass removal", () => {
  it("holds generated substantive transfer to the same gate as authored content", () => {
    const makeDepth = (quality: "substantive" | "scaffold"): Question => defineQuestion({
      slug: `depth-bypass-${quality}`,
      subjectId: "wjec-alevel-maths",
      topics: ["algebra"],
      stem: "Depth",
      source: "generated",
      verification: "unverified",
      parts: [{
        prompt: "Use a different context and calculate the same value using the same method for equation x² − 3x + 2 = 0.",
        marks: 2,
        scheme: ["The different context gives the same value by the same method.", "Reports x = 1 and x = 2."],
        answer: "The different context gives the same value by the same method. Therefore x = 1 and x = 2.",
        specPointIds: ["wjec-alevel-maths.algebra.sp-02"],
        capabilityIds: ["math.algebra.sp-02"],
        learning: {
          familyId: "wjec-maths-depth:test:transfer:mechanism",
          contextId: "wjec-maths-depth:test:ctx",
          demand: "transfer",
          reasoningMoves: ["calculate"],
          quality,
          promptTarget: "Find the roots",
          expectedResult: "x = 1 and x = 2",
          derivation: ["calculate"],
          evidenceSources: ["x² − 3x + 2 = 0"],
          capabilityEvidence: { capabilityId: "math.algebra.sp-02", requiredEntities: ["quadratic"], requiredOperations: ["calculate"] },
          provenance: { sourceEvidence: ["x² − 3x + 2 = 0"], operation: "calculate", intermediateResults: [], finalResult: "x = 1 and x = 2" },
        },
      }],
    });
    const substantive = makeDepth("substantive");
    const substantiveFailures = validateSubstantivePart("wjec-alevel-maths", substantive, substantive.parts[0]!);
    expect(substantiveFailures.some((f) => f.kind === "transfer-not-novel" || f.kind === "transfer-novelty" || f.kind === "demand-evidence")).toBe(true);
    const scaffold = makeDepth("scaffold");
    const scaffoldFailures = validateSubstantivePart("wjec-alevel-maths", scaffold, scaffold.parts[0]!);
    // Scaffold keeps the temporary bypass: no structural transfer gate, only the quality gate.
    expect(scaffoldFailures.some((f) => f.kind === "transfer-not-novel")).toBe(false);
  });
});

describe("capability-specific transfer generators", () => {
  it("never reuses the normal Route A/B setup unchanged for transfer", () => {
    // Every depth transfer prompt must differ structurally from its baseline
    // application prompt in the same brief (not just numbers/nouns).
    const byBrief = new Map<string, { baseline?: string; transfers: string[] }>();
    for (const question of wjecFlagshipDepthQuestions) {
      const match = question.id.match(/wjec-depth-(maths|biology|chemistry)-(.+)-route-[ab]/);
      if (!match) continue;
      const briefKey = `${match[1]}:${match[2]}`;
      const entry = byBrief.get(briefKey) ?? { transfers: [] };
      for (const part of question.parts) {
        if (part.learning?.demand === "application" && question.id.endsWith("route-a")) entry.baseline = part.prompt;
        if (part.learning?.demand === "transfer") entry.transfers.push(part.prompt);
      }
      byBrief.set(briefKey, entry);
    }
    expect(byBrief.size).toBeGreaterThan(0);
    for (const [key, entry] of byBrief) {
      expect(entry.baseline, key).toBeTruthy();
      for (const transfer of entry.transfers) {
        const baselineFp = fingerprintSetup(entry.baseline!);
        const transferFp = fingerprintSetup(transfer);
        expect(JSON.stringify(baselineFp) === JSON.stringify(transferFp), `${key} reuses setup`).toBe(false);
      }
    }
  });

  it("covers maths equation→graph, biology water-potential and chemistry back-titration shifts", () => {
    const prompts = wjecFlagshipDepthQuestions.flatMap((q) => q.parts.filter((p) => p.learning?.demand === "transfer").map((p) => p.prompt));
    expect(prompts.some((p) => /graph/i.test(p) && /hidden|integer|condition/i.test(p))).toBe(true);
    expect(prompts.some((p) => /water.?potential|pressure.?potential/i.test(p))).toBe(true);
    expect(prompts.some((p) => /back[- ]?titration|limiting reagent/i.test(p))).toBe(true);
    expect(prompts.some((p) => /perturbation|concentration-time|Kc/i.test(p))).toBe(true);
  });
});

describe("explicit reasoning graphs", () => {
  it("stores ordered evidence→operation→intermediate→constraint→conclusion graphs", () => {
    for (const question of wjecFlagshipDepthQuestions.slice(0, 20)) {
      for (const part of question.parts) {
        const stored = part.learning?.reasoningGraph;
        expect(stored, `${question.id}:${part.id}`).toBeTruthy();
        const kinds = stored!.nodes.map((n) => n.kind);
        expect(kinds[0]).toBe("evidence");
        expect(kinds).toContain("operation");
        expect(kinds).toContain("intermediate");
        expect(kinds).toContain("constraint");
        expect(kinds[kinds.length - 1]).toBe("conclusion");
      }
    }
  });

  it("uses stable semantic nodes for the flagship examples", () => {
    const mathsOptimum = wjecFlagshipDepthQuestions
      .flatMap((q) => q.parts)
      .find((p) => p.learning?.demand === "transfer" && p.learning?.reasoningGraph?.nodes.some((n) => n.label === "infer-hidden"));
    expect(mathsOptimum).toBeTruthy();
    const bioMovement = wjecFlagshipDepthQuestions
      .flatMap((q) => q.parts)
      .find((p) => p.learning?.reasoningGraph?.nodes.some((n) => n.label === "water-gradient"));
    expect(bioMovement).toBeTruthy();
    const chemMoles = wjecFlagshipDepthQuestions
      .flatMap((q) => q.parts)
      .find((p) => p.learning?.reasoningGraph?.nodes.some((n) => n.label === "mole-amount"));
    expect(chemMoles).toBeTruthy();
  });

  it("derives a fallback graph when none is stored", () => {
    const question = substantivePart({ prompt: "For f(x) = x², calculate f'(2).", answer: "f'(x) = 2x, so f'(2) = 4." });
    const derived = reasoningGraphForPart(question.parts[0]!);
    expect(derived.nodes.length).toBeGreaterThanOrEqual(5);
  });
});

describe("Route A/B graph distance", () => {
  it("compares seven dimensions with a conservative threshold", () => {
    const left = graph([["evidence", "supplied-equation"], ["operation", "differentiate"], ["intermediate", "stationary-equation"], ["constraint", "domain"], ["conclusion", "optimum"]]);
    const right = graph([["evidence", "supplied-equation"], ["operation", "differentiate"], ["intermediate", "stationary-equation"], ["constraint", "domain"], ["conclusion", "optimum"]]);
    const breakdown = reasoningGraphDistance(left, right);
    expect(Object.keys(breakdown)).toEqual(expect.arrayContaining([
      "inputRepresentation", "evidenceDependencies", "operations", "orderOfOperations", "intermediateStates", "constraintsChecks", "finalInference", "overall",
    ]));
    expect(breakdown.overall).toBe(0);
    expect(MIN_REASONING_GRAPH_DISTANCE).toBeGreaterThanOrEqual(0.3);
    expect(isDistinctReasoningRoute(left, right)).toBe(false);
  });

  it.each([
    ["wording"],
    ["values"],
    ["context"],
    ["variable names"],
    ["reordered prose"],
    ["superficial check"],
  ])("collapses cosmetic %s differences to the same route", () => {
    const g = graph([["evidence", "supplied-equation"], ["operation", "compute-substitute"], ["intermediate", "roots"], ["constraint", "domain"], ["conclusion", "quantity"]]);
    const h = graph([["evidence", "supplied-equation"], ["operation", "compute-substitute"], ["intermediate", "roots"], ["constraint", "domain"], ["conclusion", "quantity"]]);
    // Same semantic nodes despite prose/value/context/name/order/check wording.
    expect(isDistinctReasoningRoute(g, h)).toBe(false);
  });

  it("ignores family ids and modeA/modeB labels", () => {
    const left = graph([["evidence", "supplied-equation"], ["operation", "compute-substitute"], ["intermediate", "roots"], ["constraint", "domain"], ["conclusion", "quantity"]]);
    const right = graph([["evidence", "supplied-equation"], ["operation", "compute-substitute"], ["intermediate", "roots"], ["constraint", "domain"], ["conclusion", "quantity"]]);
    expect(reasoningGraphDistance(left, right).overall).toBe(0);
  });

  it("keeps valid alternatives distinct", () => {
    const algebraic = graph([["evidence", "supplied-equation"], ["operation", "differentiate"], ["intermediate", "stationary-equation"], ["constraint", "domain"], ["conclusion", "optimum"]]);
    const graphical = graph([["evidence", "supplied-graph"], ["operation", "read-graph"], ["intermediate", "gradient-value"], ["constraint", "endpoint"], ["conclusion", "optimum"]]);
    expect(isDistinctReasoningRoute(algebraic, graphical)).toBe(true);
    const direct = graph([["evidence", "supplied-measurement"], ["operation", "mole-convert"], ["intermediate", "mole-amount"], ["constraint", "units"], ["conclusion", "quantity"]]);
    const backTitration = graph([["evidence", "titration-chain"], ["operation", "back-titrate"], ["intermediate", "mole-amount"], ["constraint", "stoichiometric"], ["conclusion", "quantity"]]);
    expect(isDistinctReasoningRoute(direct, backTitration)).toBe(true);
    const mechanistic = graph([["evidence", "supplied-measurement"], ["operation", "enzyme-mechanism"], ["intermediate", "inhibition-pattern"], ["constraint", "control"], ["conclusion", "mechanism"]]);
    const dataLed = graph([["evidence", "assay-data"], ["operation", "control-evaluate"], ["intermediate", "gradient-value"], ["constraint", "water-balance"], ["conclusion", "decision"]]);
    expect(isDistinctReasoningRoute(mechanistic, dataLed)).toBe(true);
  });
});

describe("route supersets and cosmetic alternatives", () => {
  it("fails Route B as Route A plus a trivial check", () => {
    const routeA = graph([["evidence", "supplied-equation"], ["operation", "compute-substitute"], ["intermediate", "roots"], ["constraint", "domain"], ["conclusion", "quantity"]]);
    const routeB = graph([["evidence", "supplied-equation"], ["operation", "compute-substitute"], ["intermediate", "roots"], ["constraint", "domain"], ["conclusion", "quantity"], ["constraint", "check-answer"]]);
    expect(isSupersetRoute(routeA, routeB)).toBe(true);
    expect(isDistinctReasoningRoute(routeA, routeB)).toBe(false);
  });

  it("requires a changed core dependency, not an extra check", () => {
    const routeA = graph([["evidence", "supplied-equation"], ["operation", "compute-substitute"], ["intermediate", "roots"], ["constraint", "domain"], ["conclusion", "quantity"]]);
    const genuine = graph([["evidence", "supplied-graph"], ["operation", "read-graph"], ["intermediate", "gradient-value"], ["constraint", "endpoint"], ["conclusion", "quantity"]]);
    expect(isSupersetRoute(routeA, genuine)).toBe(false);
    expect(isDistinctReasoningRoute(routeA, genuine)).toBe(true);
  });
});

describe("synoptic secondary capability ids", () => {
  it("rejects broad free-text secondaries", () => {
    for (const label of ["domain and endpoint checks", "exact form and admissibility checks", "experimental controls and data interpretation", "stoichiometric and unit constraints"]) {
      expect(isFreeTextSecondarySkill(label)).toBe(true);
      expect(isMappedCapabilityId(label)).toBe(false);
    }
    expect(isMappedCapabilityId("math.algebra.sp-05")).toBe(true);
    expect(isMappedCapabilityId("bio.membranes-transport.sp-03")).toBe(true);
    expect(isMappedCapabilityId("chem.moles.sp-02")).toBe(true);
  });

  it("stores primary/secondary ids and contracts on every depth synoptic cell", () => {
    const synoptics = wjecFlagshipDepthQuestions.flatMap((q) => q.parts.map((p) => ({ q, p }))).filter(({ p }) => p.learning?.demand === "synoptic");
    expect(synoptics.length).toBeGreaterThan(0);
    for (const { p } of synoptics) {
      expect(p.learning?.synopticLink?.primaryCapabilityId, p.id).toMatch(/^(math|bio|chem)\./);
      expect(p.learning?.synopticLink?.secondaryCapabilityId, p.id).toMatch(/^(math|bio|chem)\./);
      expect(p.learning?.primaryContract?.requiredEntities.length).toBeGreaterThan(0);
      expect(p.learning?.secondaryContract?.requiredEntities.length, p.id).toBeGreaterThan(0);
      expect(p.learning?.capabilityEvidence?.secondaryCapabilityId).toBe(p.learning?.synopticLink?.secondaryCapabilityId);
    }
  });
});

function synopticFixture(params: {
  subjectId: string;
  prompt: string;
  answer: string;
  primaryId: string;
  secondaryId: string;
  primaryEntities: string[];
  primaryOps: string[];
  secondaryEntities: string[];
  secondaryOps: string[];
}): Question {
  const primaryContract = { capabilityId: params.primaryId, requiredEntities: params.primaryEntities, requiredOperations: params.primaryOps };
  const secondaryContract = { capabilityId: params.secondaryId, requiredEntities: params.secondaryEntities, requiredOperations: params.secondaryOps };
  return defineQuestion({
    slug: `syn-ablation-${Math.random().toString(36).slice(2, 8)}`,
    subjectId: params.subjectId,
    topics: ["fixture"],
    stem: "Synoptic ablation",
    parts: [{
      prompt: params.prompt,
      marks: 3,
      scheme: [params.answer],
      answer: params.answer,
      specPointIds: ["sp"],
      capabilityIds: [params.primaryId],
      learning: {
        familyId: "fixture:syn",
        contextId: "fixture:ctx",
        demand: "synoptic",
        reasoningMoves: ["calculate", "compare"],
        quality: "substantive",
        capabilityEvidence: { capabilityId: params.primaryId, requiredEntities: params.primaryEntities, requiredOperations: params.primaryOps, secondaryCapability: params.secondaryId, secondaryCapabilityId: params.secondaryId },
        synopticLink: { primaryCapabilityId: params.primaryId, secondaryCapabilityId: params.secondaryId },
        primaryContract,
        secondaryContract,
      },
      learningClaims: [params.primaryId, params.secondaryId],
    }],
  });
}

describe("synoptic independent validity and ablation", () => {
  it("fails differentiation+geometry when geometry is unused", () => {
    const q = synopticFixture({
      subjectId: "wjec-alevel-maths",
      primaryId: "math.differentiation.sp-03",
      secondaryId: "math.coordinate-geometry.sp-01",
      primaryEntities: ["derivative", "stationary"],
      primaryOps: ["differentiate"],
      secondaryEntities: ["circle", "coordinate"],
      secondaryOps: ["calculate distance"],
      prompt: "For f(x) = x³ − 4x² + 4x combine derivative stationary (math.differentiation.sp-03) with geometry circle coordinate (math.coordinate-geometry.sp-01): find stationary points.",
      answer: "Differentiate to obtain f'(x) = 3x² − 8x + 4. Solve f' = 0. Therefore the stationary derivative points are found.",
    });
    const failures = validateSynopticStructure(q.parts[0]!, "wjec-alevel-maths");
    expect(failures.length).toBeGreaterThan(0);
    expect(synopticAblationHolds(q.parts[0]!, "wjec-alevel-maths")).toBe(false);
  });

  it("fails osmosis+controls when the conclusion ignores controls", () => {
    const q = synopticFixture({
      subjectId: "wjec-alevel-biology",
      primaryId: "bio.membranes-transport.sp-03",
      secondaryId: "bio.cell-structure.sp-05",
      primaryEntities: ["water potential", "osmosis"],
      primaryOps: ["predict movement"],
      secondaryEntities: ["control", "replication"],
      secondaryOps: ["compare control"],
      prompt: "Combine osmosis water potential (bio.membranes-transport.sp-03) with experimental control replication (bio.cell-structure.sp-05) with a matched control and replication.",
      answer: "Water moves from higher to lower water potential because of the gradient. Therefore movement is predicted.",
    });
    expect(validateSynopticStructure(q.parts[0]!, "wjec-alevel-biology").length).toBeGreaterThan(0);
  });

  it("fails stoichiometry+uncertainty when uncertainty has no effect", () => {
    const q = synopticFixture({
      subjectId: "wjec-alevel-chemistry",
      primaryId: "chem.moles.sp-02",
      secondaryId: "chem.moles.sp-05",
      primaryEntities: ["mole", "concentration"],
      primaryOps: ["calculate amount"],
      secondaryEntities: ["uncertainty", "burette"],
      secondaryOps: ["calculate uncertainty"],
      prompt: "Combine stoichiometry mole concentration (chem.moles.sp-02) with uncertainty burette (chem.moles.sp-05): convert with n = cV and include burette precision.",
      answer: "Calculate amount n = cV = 0.01000 mol from 20.00 cm³ of 0.500 mol dm⁻³. Therefore the amount is 0.01000 mol.",
    });
    expect(validateSynopticStructure(q.parts[0]!, "wjec-alevel-chemistry").length).toBeGreaterThan(0);
  });

  it("fails equilibrium+mole ratio when only equilibrium is used", () => {
    const q = synopticFixture({
      subjectId: "wjec-alevel-chemistry",
      primaryId: "chem.equilibria.sp-01",
      secondaryId: "chem.moles.sp-02",
      primaryEntities: ["equilibrium", "Kc"],
      primaryOps: ["predict shift"],
      secondaryEntities: ["mole ratio", "titration"],
      secondaryOps: ["apply ratio"],
      prompt: "Combine equilibrium Kc (chem.equilibria.sp-01) with mole ratio titration (chem.moles.sp-02): predict the shift and apply the ratio.",
      answer: "Heating favours the endothermic direction, so equilibrium shifts right. Therefore Kc is unchanged by pressure.",
    });
    expect(validateSynopticStructure(q.parts[0]!, "wjec-alevel-chemistry").length).toBeGreaterThan(0);
  });

  it("passes when removing either strand leaves the solution incomplete", () => {
    const q = synopticFixture({
      subjectId: "wjec-alevel-maths",
      primaryId: "math.differentiation.sp-03",
      secondaryId: "math.coordinate-geometry.sp-01",
      primaryEntities: ["derivative", "stationary"],
      primaryOps: ["differentiate"],
      secondaryEntities: ["circle", "coordinate"],
      secondaryOps: ["calculate distance"],
      prompt: "For f(x) = x³ − 4x² + 4x on 0 ≤ x ≤ 4 combine derivative stationary (math.differentiation.sp-03) with geometry circle coordinate (math.coordinate-geometry.sp-01): differentiate, solve f' = 0 and compare with the circle distance constraint.",
      answer: "Differentiate to obtain derivative f'(x) = 3x² − 8x + 4 and solve f' = 0 for stationary candidates. Calculate distance from the coordinate circle constraint and compare both strands together; without the derivative the candidates cannot be formed, and without the circle distance the optimum is inadmissible. Therefore derivative stationary and circle coordinate distance both constrain the optimum.",
    });
    expect(validateSynopticStructure(q.parts[0]!, "wjec-alevel-maths")).toEqual([]);
    expect(synopticAblationHolds(q.parts[0]!, "wjec-alevel-maths")).toBe(true);
  });
});

describe("deep completion layers", () => {
  it("counts a depth statement only when content, capability and diversity layers all pass", () => {
    // Spot-check one brief per subject: all seven demands must carry graphs,
    // transfer links and synoptic links where required.
    for (const subject of ["maths", "biology", "chemistry"] as const) {
      const questions = wjecFlagshipDepthQuestions.filter((q) => q.subjectId === `wjec-alevel-${subject}`);
      const transferParts = questions.flatMap((q) => q.parts).filter((p) => p.learning?.demand === "transfer");
      const synopticParts = questions.flatMap((q) => q.parts).filter((p) => p.learning?.demand === "synoptic");
      expect(transferParts.length).toBeGreaterThan(0);
      expect(synopticParts.length).toBeGreaterThan(0);
      for (const part of transferParts) {
        expect(part.learning?.transferLink?.baselinePartId, part.id).toBeTruthy();
        expect(part.learning?.reasoningGraph?.nodes.length).toBeGreaterThanOrEqual(5);
      }
      for (const part of synopticParts) {
        expect(part.learning?.synopticLink?.secondaryCapabilityId, part.id).toMatch(/^(math|bio|chem)\./);
      }
    }
  });
});
