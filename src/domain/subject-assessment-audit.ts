import type { CapabilityNode } from "./capability-graph";
import {
  compareTransferStructures,
} from "./subject-assessment-semantic";
import {
  compareTransferStructures as compareTransferReasoningGraphs,
  fingerprintSetup,
  isDistinctReasoningRoute,
  isSupersetRoute,
  MIN_REASONING_GRAPH_DISTANCE,
  reasoningGraphForPart,
} from "./reasoning-graph";
export { answerLeakageDetail, capabilityNotRequiredReason, classifyNumericalClaims, compareTransferStructures, promptAnswerClaims, transferNoveltyClasses } from "./subject-assessment-semantic";
export { fingerprintSetup, isDistinctReasoningRoute, isSupersetRoute, reasoningGraphForPart } from "./reasoning-graph";
export type { NumericalClaimClassification, NumericalClaimRole, TransferNoveltyClass } from "./subject-assessment-semantic";
import {
  addIssue,
  partText,
  validateBiologyPart,
  validateChemistryPart,
  validateMathsPart,
  validateSubstantivePart,
} from "./subject-correctness";
export { validateSubstantivePart } from "./subject-correctness";
export type { SubstantiveGateFailure } from "./subject-correctness";
import {
  auditPhysicsAssessmentQuality,
  PHYSICS_ASSESSMENT_DEMANDS,
  semanticRouteDistance,
  type PhysicsAssessmentQualityAudit,
  type PhysicsQualityIssueKind,
  type PhysicsQualityIssue,
} from "./physics-assessment-quality";
import type {
  Id,
  LearningDemand,
  Question,
  Topic,
} from "./types";

/**
 * The WJEC flagship subjects share one depth contract.  Physics already uses
 * the contract; these ids let authoring and QA report the other three subjects
 * through the same internal surface without creating a second mastery model.
 */
export const WJEC_FLAGSHIP_SUBJECT_IDS = [
  "wjec-alevel-physics",
  "wjec-alevel-maths",
  "wjec-alevel-biology",
  "wjec-alevel-chemistry",
] as const;

export type WjecFlagshipSubjectId = (typeof WJEC_FLAGSHIP_SUBJECT_IDS)[number];

export type SubjectAssessmentIssueKind =
  | "generic-fallback"
  | "not-self-contained"
  | "solution-substance"
  | "demand-evidence"
  | "answer-leakage"
  | "capability-evidence"
  | "capability-not-required"
  | "provenance"
  | "transfer-novelty"
  | "transfer-not-novel"
  | "duplicate-reasoning-graph"
  | "secondary-capability-not-required"
  | "missing-secondary-contract"
  | "route-superset"
  | "synoptic-evidence"
  | "maths-equivalence"
  | "maths-domain"
  | "maths-exact-form"
  | "maths-calculus"
  | "maths-mechanics"
  | "maths-statistics"
  | "biology-terminology"
  | "biology-causal-chain"
  | "biology-practical-design"
  | "biology-data-interpretation"
  | "biology-contradiction"
  | "chemistry-equation-balance"
  | "chemistry-stoichiometry"
  | "chemistry-oxidation-state"
  | "chemistry-unit"
  | "chemistry-precision"
  | "chemistry-acid-base"
  | "chemistry-equilibrium"
  | "unresolved";

export interface SubjectAssessmentIssue {
  subjectId: WjecFlagshipSubjectId | Id;
  questionId: Id;
  partId: Id;
  kind: SubjectAssessmentIssueKind;
  severity: "error" | "warning";
  detail: string;
}

export interface SubjectCorrectnessSummary {
  issueCount: number;
  errors: number;
  warnings: number;
  /** Warnings remain unresolved until a qualified reviewer closes them. */
  unresolved: number;
  byKind: Partial<Record<SubjectAssessmentIssueKind, number>>;
}

/** Stable repair ordering used by the authoring queue and internal dashboard. */
export type SubjectRepairPriority =
  | "missing-authored-demand"
  | "not-self-contained"
  | "weak-worked-solution"
  | "duplicate-reasoning"
  | "correctness-warning";

export interface SubjectRepairQueueItem {
  subjectId: WjecFlagshipSubjectId | Id;
  specPointId?: Id;
  capabilityId?: Id;
  demand?: LearningDemand;
  questionId?: Id;
  partId?: Id;
  severity: "error" | "warning";
  priority: SubjectRepairPriority;
  reasons: string[];
}

export interface FlagshipSubjectAssessmentAudit extends PhysicsAssessmentQualityAudit {
  subjectIssues: SubjectAssessmentIssue[];
  correctness: SubjectCorrectnessSummary;
  /** Number of independent marking disagreements supplied by the benchmark. */
  markingDisagreements: number;
  /** Exact demand cells and parts that need author repair before completion. */
  repairQueue: SubjectRepairQueueItem[];
}


function summariseCorrectness(issues: readonly SubjectAssessmentIssue[]): SubjectCorrectnessSummary {
  const byKind: Partial<Record<SubjectAssessmentIssueKind, number>> = {};
  for (const issue of issues) byKind[issue.kind] = (byKind[issue.kind] ?? 0) + 1;
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;
  return { issueCount: issues.length, errors, warnings, unresolved: warnings, byKind };
}

function buildRepairQueue(
  subjectId: WjecFlagshipSubjectId | Id,
  questions: readonly Question[],
  depth: PhysicsAssessmentQualityAudit,
  subjectIssues: readonly SubjectAssessmentIssue[],
): SubjectRepairQueueItem[] {
  const queue = new Map<string, SubjectRepairQueueItem>();
  const issueByPart = new Map<string, SubjectAssessmentIssue[]>();
  for (const issue of subjectIssues) {
    const key = `${issue.questionId}::${issue.partId}`;
    const rows = issueByPart.get(key) ?? [];
    rows.push(issue);
    issueByPart.set(key, rows);
  }

  const priorityRank: Record<SubjectRepairPriority, number> = {
    "missing-authored-demand": 0,
    "not-self-contained": 1,
    "weak-worked-solution": 2,
    "duplicate-reasoning": 3,
    "correctness-warning": 4,
  };

  const put = (item: SubjectRepairQueueItem): void => {
    const key = `${item.specPointId ?? "?"}:${item.capabilityId ?? "?"}:${item.demand ?? "?"}:${item.partId ?? item.questionId ?? "cell"}`;
    const prior = queue.get(key);
    if (!prior) {
      queue.set(key, item);
      return;
    }
    prior.reasons = [...new Set([...prior.reasons, ...item.reasons])];
    if (item.severity === "error") prior.severity = "error";
    if (priorityRank[item.priority] < priorityRank[prior.priority]) prior.priority = item.priority;
  };

  const priorityForSubjectIssue = (issue: SubjectAssessmentIssue): SubjectRepairPriority => {
    if (issue.kind === "answer-leakage" || issue.kind === "capability-evidence" || issue.kind === "capability-not-required" || issue.kind === "provenance" || issue.kind === "transfer-novelty" || issue.kind === "transfer-not-novel" || issue.kind === "synoptic-evidence" || issue.kind === "missing-secondary-contract" || issue.kind === "secondary-capability-not-required") return "missing-authored-demand";
    if (issue.kind === "duplicate-reasoning-graph" || issue.kind === "route-superset") return "duplicate-reasoning";
    if (issue.kind === "not-self-contained") return "not-self-contained";
    if (issue.kind === "solution-substance") return "weak-worked-solution";
    if (issue.kind !== "generic-fallback" && issue.kind !== "demand-evidence") return "correctness-warning";
    if (issue.severity === "warning") return "correctness-warning";
    return "missing-authored-demand";
  };

  const priorityForStructuralIssue = (kind: PhysicsQualityIssueKind): SubjectRepairPriority => {
    if (kind === "cosmetic-reskin" || kind === "surface-rewording") return "duplicate-reasoning";
    if (kind === "incomplete-mark-scheme") return "weak-worked-solution";
    return "missing-authored-demand";
  };

  // One item for every incomplete statement/capability/demand cell, even
  // when no question exists yet. This keeps the authoring queue honest.
  for (const coverage of depth.capabilityCoverageByCapability) {
    for (const demand of coverage.demands) {
      if (demand.complete && demand.distinct) continue;
      const rows = questions.flatMap((question) => question.parts
        .filter((part) => part.specPointIds?.includes(coverage.specPointId) &&
          part.capabilityIds?.length === 1 && part.capabilityIds[0] === coverage.capabilityId &&
          part.learning?.demand === demand.demand)
        .map((part) => ({ question, part })));
      const representative = rows[0];
      put({
        subjectId,
        specPointId: coverage.specPointId,
        capabilityId: coverage.capabilityId,
        demand: demand.demand,
        ...(representative ? { questionId: representative.question.id, partId: representative.part.id } : {}),
        severity: "error",
        priority: "missing-authored-demand",
        reasons: [demand.complete ? "Demand has insufficiently distinct families, contexts or reasoning paths." : "Demand needs at least two substantive families."],
      });
    }
  }

  // Preserve the exact textual reason for every rejected part. These entries
  // complement the cell-level gaps above and make repair/re-review actionable.
  for (const [partKey, issues] of issueByPart) {
    const separator = partKey.indexOf("::");
    if (separator < 0) continue;
    const questionId = partKey.slice(0, separator);
    const partId = partKey.slice(separator + 2);
    const question = questions.find((row) => row.id === questionId);
    const part = question?.parts.find((row) => row.id === partId);
    if (!question || !part) continue;
    const meta = part.learning;
    put({
      subjectId,
      ...(part.specPointIds?.length === 1 ? { specPointId: part.specPointIds[0] } : {}),
      ...(part.capabilityIds?.length === 1 ? { capabilityId: part.capabilityIds[0] } : {}),
      ...(meta?.demand ? { demand: meta.demand } : {}),
      questionId,
      partId,
      severity: issues.some((issue) => issue.severity === "error") ? "error" : "warning",
      priority: issues.map(priorityForSubjectIssue).sort((a, b) => priorityRank[a] - priorityRank[b])[0] ?? "missing-authored-demand",
      reasons: issues.map((issue) => `${issue.kind}: ${issue.detail}`),
    });
  }
  // Structural duplicate/mapping/rubric issues are part of the same repair
  // queue even though they live in the shared Physics audit type. Exclude
  // unreviewed-only entries: review approval is a separate trust workflow,
  // while this queue is about cells that cannot count as deep authored work.
  for (const issue of depth.issues) {
    if (!issue.partId || issue.kind === "unreviewed") continue;
    const question = questions.find((row) => row.id === issue.questionId);
    const part = question?.parts.find((row) => row.id === issue.partId);
    if (!question || !part) continue;
    put({
      subjectId,
      ...(issue.specPointId ? { specPointId: issue.specPointId } : {}),
      ...(issue.capabilityId ? { capabilityId: issue.capabilityId } : {}),
      ...(part.learning?.demand ? { demand: part.learning.demand } : {}),
      questionId: issue.questionId,
      partId: issue.partId,
      severity: "error",
      priority: priorityForStructuralIssue(issue.kind),
      reasons: [`${issue.kind}: ${issue.detail}`],
    });
  }
  return [...queue.values()].sort((a, b) => {
    if (priorityRank[a.priority] !== priorityRank[b.priority]) return priorityRank[a.priority] - priorityRank[b.priority];
    if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
    return `${a.specPointId ?? ""}:${a.demand ?? ""}:${a.questionId ?? ""}:${a.partId ?? ""}`
      .localeCompare(`${b.specPointId ?? ""}:${b.demand ?? ""}:${b.questionId ?? ""}:${b.partId ?? ""}`);
  });
}

/** Run the shared seven-demand audit plus conservative subject checks. */
export function auditFlagshipSubject(input: {
  subjectId: WjecFlagshipSubjectId | Id;
  topics: readonly Topic[];
  questions: readonly Question[];
  nodes: readonly CapabilityNode[];
  trustedQuestion?: (question: Question) => boolean;
  markingDisagreements?: number;
}): FlagshipSubjectAssessmentAudit {
  const subjectIssues: SubjectAssessmentIssue[] = [];
  const invalidParts = new Set<string>();
  const subjectQuestions = input.questions.filter((row) => row.subjectId === input.subjectId);
  // Run the shared mapping/authoring audit once before counting strict cells.
  // Its issues are deliberately kept in the structural audit surface, but a
  // non-Physics part with a missing/unknown mapping, incomplete rubric or
  // duplicate route must not still inflate deepComplete through the broad
  // statement-level rows.
  if (input.subjectId !== "wjec-alevel-physics") {
    const structural = auditPhysicsAssessmentQuality({
      ...input,
      subjectId: input.subjectId,
      strictSubstantive: false,
    });
    for (const issue of structural.issues) {
      if (issue.partId && issue.kind !== "unreviewed") invalidParts.add(`${issue.questionId}:${issue.partId}`);
    }
  }
  for (const question of subjectQuestions) {
    for (const part of question.parts) {
      // Physics already has a mature, reviewed depth bank and retains its
      // legacy 108/108 contract. The substantive gate is applied to the three
      // first-wave flagship packs only.
      if (input.subjectId !== "wjec-alevel-physics") {
        for (const failure of validateSubstantivePart(input.subjectId, question, part)) {
          addIssue(subjectIssues, question, part, failure.kind, "error", failure.detail);
          invalidParts.add(`${question.id}:${part.id}`);
        }
      }
      const issueStart = subjectIssues.length;
      if (input.subjectId === "wjec-alevel-maths") validateMathsPart(question, part, subjectIssues);
      else if (input.subjectId === "wjec-alevel-biology") validateBiologyPart(question, part, subjectIssues);
      else if (input.subjectId === "wjec-alevel-chemistry") validateChemistryPart(question, part, subjectIssues);
      // A deterministic correctness error is a content defect as well as a
      // reportable issue. Exclude that part from deep completion until an
      // author repairs and re-reviews it; warnings remain conservative manual
      // review items and do not silently erase otherwise useful coverage.
      if (subjectIssues.slice(issueStart).some((issue) => issue.severity === "error")) {
        invalidParts.add(`${question.id}:${part.id}`);
      }
    }
  }

  // Layer C â€” diversity validity. Transfer needs a structurally distinct
  // baseline, synoptic needs two mapped capabilities, and Route A/B need
  // materially different reasoning graphs. No layer is bypassed for generated
  // substantive content; only explicit `scaffold` cells keep a bypass.
  if (input.subjectId !== "wjec-alevel-physics") {
    const allParts = subjectQuestions.flatMap((question) => question.parts.map((part) => ({ question, part })));
    const partById = new Map(allParts.map(({ question, part }) => [`${question.id}:${part.id}`, { question, part }]));
    for (const { question, part } of allParts) {
      if (part.learning?.demand !== "transfer") continue;
      if (part.learning?.quality === "scaffold") continue;
      if (invalidParts.has(`${question.id}:${part.id}`)) continue;
      const capability = part.capabilityIds?.length === 1 ? part.capabilityIds[0] : undefined;
      const specPoint = part.specPointIds?.length === 1 ? part.specPointIds[0] : undefined;
      if (!capability || !specPoint) continue;
      // Explicit baseline linkage is a hard requirement.
      const baselineId = part.learning?.transferLink?.baselinePartId?.trim();
      if (baselineId) {
        const baselineEntry = [...partById.entries()].find(([key]) => key.endsWith(`:${baselineId}`) || key === baselineId);
        if (!baselineEntry) {
          addIssue(subjectIssues, question, part, "transfer-not-novel", "error", `Transfer baseline ${baselineId} does not exist in the same capability (transfer-not-novel).`);
          invalidParts.add(`${question.id}:${part.id}`);
          continue;
        }
        const baselineCapability = baselineEntry[1].part.capabilityIds?.[0];
        if (baselineCapability !== capability) {
          addIssue(subjectIssues, question, part, "transfer-not-novel", "error", "Transfer baseline is from a different capability; reference an explicit baseline task from the same capability (transfer-not-novel).");
          invalidParts.add(`${question.id}:${part.id}`);
          continue;
        }
      }
      const baselines = allParts.filter(({ question: candidateQuestion, part: candidate }) =>
        candidateQuestion.id !== question.id && candidate.specPointIds?.length === 1 && candidate.specPointIds[0] === specPoint &&
        candidate.capabilityIds?.length === 1 && candidate.capabilityIds[0] === capability &&
        (candidate.learning?.demand === "application" || candidate.learning?.demand === "calculation") &&
        candidate.learning?.quality !== "scaffold");
      if (!baselines.length) continue;
      // An explicit stored link is the strongest transfer evidence: a named
      // baseline plus setup fingerprints and reasoning graphs compared across
      // eight structural and seven reasoning dimensions with a dual-change
      // requirement. The value-stripped Jaccard heuristic below cannot resolve
      // same-capability transfer (shared topic vocabulary always scores
      // near-identical), so a passing stored link settles the question and
      // the heuristic legs serve only link-less authored transfers. Rigor is
      // equal-or-stronger on both paths, never bypassed.
      const storedLink = part.learning?.transferLink;
      if (storedLink) {
        const comparison = compareTransferReasoningGraphs(
          storedLink.baselineSetupFingerprint,
          storedLink.transferSetupFingerprint,
          storedLink.baselineReasoningGraph,
          storedLink.transferReasoningGraph,
        );
        if (!comparison.isNovel) {
          addIssue(subjectIssues, question, part, "transfer-not-novel", "error", `Transfer has no structural novelty against its explicit baseline (structural: ${comparison.structuralChanges.join(", ") || "none"}; reasoning: ${comparison.reasoningChanges.join(", ") || "none"}) (transfer-not-novel).`);
          invalidParts.add(`${question.id}:${part.id}`);
        }
        continue;
      }
      const transferText = partText(part);
      const structuralComparisons = baselines.map(({ part: baseline }) => compareTransferStructures(
        input.subjectId,
        baseline.prompt,
        part.prompt,
      ));
      const hasStructuralChange = structuralComparisons.some((comparison) => comparison.meaningful);
      if (!hasStructuralChange || baselines.every(({ part: baseline }) => semanticRouteDistance(transferText, partText(baseline)) < 0.35)) {
        addIssue(subjectIssues, question, part, "transfer-novelty", "error", "Transfer route is semantically the same as the available application/calculation route; add an unfamiliar representation, hidden constraint or genuinely different operation.");
        invalidParts.add(`${question.id}:${part.id}`);
        continue;
      }
      // Derived fingerprint + reasoning-graph gate for depth cells without a
      // stored link; authored quality cells already passed the representation
      // gate above and need no further diagnostic (they are not generated
      // flagship drafts).
      if ((part.learning?.familyId ?? "").includes("-depth:")) {
        const transferGraph = reasoningGraphForPart(part, input.subjectId);
        const transferFingerprint = fingerprintSetup(part.prompt, part.modelAnswer);
        const novelAgainstSome = baselines.some(({ part: baseline }) => {
          const baselineGraph = reasoningGraphForPart(baseline, input.subjectId);
          const baselineFingerprint = fingerprintSetup(baseline.prompt, baseline.modelAnswer);
          return compareTransferReasoningGraphs(baselineFingerprint, transferFingerprint, baselineGraph, transferGraph).isNovel;
        });
        if (!novelAgainstSome) {
          addIssue(subjectIssues, question, part, "transfer-not-novel", "error", "Transfer has no structural novelty against any baseline route in the same capability (transfer-not-novel).");
          invalidParts.add(`${question.id}:${part.id}`);
        }
      }
    }
    // Route A/B graph distance: two substantive parts sharing a specPoint,
    // capability and demand count as distinct only when their reasoning graphs
    // differ materially. Cosmetic alternatives (numbers, context names, family
    // ids, modeA/modeB, rewritten prose, substitute-vs-recompute) collapse.
    const routeGroups = new Map<string, Array<{ question: (typeof allParts)[number]["question"]; part: (typeof allParts)[number]["part"] }>>();
    for (const entry of allParts) {
      const { question, part } = entry;
      if (part.learning?.quality !== "substantive") continue;
      // Route A/B diversity is a depth-pack contract (two authored variants per
      // demand). Authored quality singletons are not Route A/B pairs.
      if (!(part.learning?.familyId ?? "").includes("-depth:")) continue;
      if (!part.specPointIds?.length || !part.capabilityIds?.length || !part.learning?.demand) continue;
      if (invalidParts.has(`${question.id}:${part.id}`)) continue;
      const key = `${part.specPointIds[0]}::${part.capabilityIds[0]}::${part.learning.demand}`;
      const rows = routeGroups.get(key) ?? [];
      rows.push(entry);
      routeGroups.set(key, rows);
    }
    for (const [, rows] of routeGroups) {
      const byQuestion = new Map<string, (typeof rows)[number]>();
      for (const row of rows) {
        if (!byQuestion.has(row.question.id)) byQuestion.set(row.question.id, row);
      }
      if (byQuestion.size < 2) continue;
      const entries = [...byQuestion.values()];
      for (let i = 0; i < entries.length; i += 1) {
        for (let j = i + 1; j < entries.length; j += 1) {
          const left = entries[i]!;
          const right = entries[j]!;
          const leftGraph = reasoningGraphForPart(left.part, input.subjectId);
          const rightGraph = reasoningGraphForPart(right.part, input.subjectId);
          if (isSupersetRoute(leftGraph, rightGraph) || isSupersetRoute(rightGraph, leftGraph)) {
            addIssue(subjectIssues, right.question, right.part, "route-superset", "error", `Route B is Route A plus a trivial verification step; change a core reasoning dependency or representation (route-superset). Baseline: ${left.question.id}:${left.part.id}.`);
            invalidParts.add(`${right.question.id}:${right.part.id}`);
          } else if (!isDistinctReasoningRoute(leftGraph, rightGraph, MIN_REASONING_GRAPH_DISTANCE)) {
            addIssue(subjectIssues, right.question, right.part, "duplicate-reasoning-graph", "error", `Route A/B reasoning graphs are materially the same (distance below ${MIN_REASONING_GRAPH_DISTANCE}); change the representation, operation sequence or constraints (duplicate-reasoning-graph). Baseline: ${left.question.id}:${left.part.id}.`);
            invalidParts.add(`${right.question.id}:${right.part.id}`);
          }
        }
      }
    }
  }
  const depth = auditPhysicsAssessmentQuality({
    ...input,
    strictSubstantive: input.subjectId !== "wjec-alevel-physics",
    substantivePart: (question, part) => !invalidParts.has(`${question.id}:${part.id}`),
  });
  const repairQueue = buildRepairQueue(input.subjectId, subjectQuestions, depth, subjectIssues);
  return {
    ...depth,
    subjectIssues,
    correctness: summariseCorrectness(subjectIssues),
    markingDisagreements: Math.max(0, input.markingDisagreements ?? 0),
    repairQueue,
  };
}

export interface FlagshipDepthDashboardRow {
  subjectId: WjecFlagshipSubjectId | Id;
  statements: number;
  deepComplete: number;
  incomplete: number;
  questions: number;
  questionsPerStatement: number;
  demandCompletion: Record<LearningDemand, number>;
  approvedQuestions: number;
  draftQuestions: number;
  structuralIssues: number;
  subjectCorrectness: SubjectCorrectnessSummary;
  repairQueue: number;
  markingDisagreements: number;
  releaseReady: boolean;
}

export interface FlagshipDepthDashboard {
  subjects: FlagshipDepthDashboardRow[];
  balancedAtTwenty: boolean;
  /** No student-facing data: this is an authoring/release QA surface. */
  generatedQuestionCount: number;
  totalQuestions: number;
}

export interface FlagshipDepthDashboardInput {
  curricula: ReadonlyArray<{ subject: { id: Id }; topics: readonly Topic[] }>;
  questions: readonly Question[];
  nodes: readonly CapabilityNode[];
  trustedQuestion?: (question: Question) => boolean;
  markingDisagreementsBySubject?: Partial<Record<Id, number>>;
}

/** Build one compact internal row per WJEC subject for balanced authoring. */
export function buildFlagshipDepthDashboard(input: FlagshipDepthDashboardInput): FlagshipDepthDashboard {
  const rows = input.curricula.map(({ subject, topics }): FlagshipDepthDashboardRow => {
    const subjectQuestions = input.questions.filter((question) => question.subjectId === subject.id);
    const audit = auditFlagshipSubject({
      subjectId: subject.id,
      topics,
      questions: subjectQuestions,
      nodes: input.nodes,
      trustedQuestion: input.trustedQuestion,
      markingDisagreements: input.markingDisagreementsBySubject?.[subject.id],
    });
    const demandCompletion = Object.fromEntries(
      PHYSICS_ASSESSMENT_DEMANDS.map((demand) => [demand, 0]),
    ) as Record<LearningDemand, number>;
    for (const demand of audit.capabilityCoverage.flatMap((coverage) => coverage.demands)) {
      if (demand.complete && demand.distinct) demandCompletion[demand.demand] = (demandCompletion[demand.demand] ?? 0) + 1;
    }
    return {
      subjectId: subject.id,
      statements: audit.statements,
      deepComplete: audit.completeStatements,
      incomplete: Math.max(0, audit.statements - audit.completeStatements),
      questions: subjectQuestions.length,
      questionsPerStatement: audit.statements ? Number((subjectQuestions.length / audit.statements).toFixed(2)) : 0,
      demandCompletion,
      approvedQuestions: audit.approvedQuestions,
      draftQuestions: audit.unreviewedQuestions,
      structuralIssues: audit.issues.filter((issue: PhysicsQualityIssue) => issue.kind !== "unreviewed").length,
      subjectCorrectness: audit.correctness,
      repairQueue: audit.repairQueue.length,
      markingDisagreements: audit.markingDisagreements,
      // A warning is an unresolved reviewer action, so it cannot be promoted
      // to a trusted release even though it may leave substantive practice
      // coverage usable for authoring.
      releaseReady: audit.releaseReady && audit.correctness.errors === 0 && audit.correctness.unresolved === 0,
    };
  });
  return {
    subjects: rows,
    balancedAtTwenty: rows.filter((row) => WJEC_FLAGSHIP_SUBJECT_IDS.includes(row.subjectId as WjecFlagshipSubjectId)).every((row) => row.deepComplete >= 20),
    generatedQuestionCount: input.questions.filter((question) => question.source === "generated").length,
    totalQuestions: input.questions.length,
  };
}

/** Descriptive aliases for callers that do not need to know the legacy Physics audit name. */
export const auditWjecSubjectAssessment = auditFlagshipSubject;
export const buildWjecFlagshipDepthDashboard = buildFlagshipDepthDashboard;
