import type { CapabilityNode } from "./capability-graph";
import type { Id, LearningDemand, Question, QuestionPart, Topic } from "./types";

/** The seven demands that make a Physics item useful beyond simple recall. */
export const PHYSICS_ASSESSMENT_DEMANDS: readonly LearningDemand[] = [
  "recall", "explanation", "application", "misconception", "calculation", "transfer", "synoptic",
];

/** Two genuinely different families are the minimum evidence for a demand. */
export const MIN_PHYSICS_FAMILIES = 2;

export interface PhysicsDemandCoverage {
  demand: LearningDemand;
  families: string[];
  contexts: string[];
  reasoningMoves: string[];
  questionCount: number;
  complete: boolean;
  distinct: boolean;
}

export interface PhysicsCapabilityCoverage {
  topicId: Id;
  specPointId: Id;
  capabilityIds: Id[];
  demands: PhysicsDemandCoverage[];
  complete: boolean;
}

/** Coverage at the smallest diagnosed skill, rather than only the statement. */
export interface PhysicsCapabilityDemandCoverage {
  topicId: Id;
  specPointId: Id;
  capabilityId: Id;
  demands: PhysicsDemandCoverage[];
  complete: boolean;
}

export type PhysicsQualityIssueKind =
  | "missing-part-learning"
  | "missing-reasoning-move"
  | "templated-reasoning-move"
  | "missing-spec-point"
  | "missing-capability"
  | "multi-capability-part"
  | "unknown-spec-point"
  | "unknown-capability"
  | "incomplete-mark-scheme"
  | "cosmetic-reskin"
  | "surface-rewording"
  | "unreviewed";

export interface PhysicsQualityIssue {
  questionId: Id;
  partId?: Id;
  /** Context retained so the authoring queue can point to the exact gap. */
  topicId?: Id;
  specPointId?: Id;
  capabilityId?: Id;
  kind: PhysicsQualityIssueKind;
  detail: string;
}

export interface PhysicsAssessmentQualityAudit {
  subjectId: string;
  statements: number;
  completeStatements: number;
  approvedQuestions: number;
  unreviewedQuestions: number;
  capabilityCoverage: PhysicsCapabilityCoverage[];
  capabilityCoverageByCapability: PhysicsCapabilityDemandCoverage[];
  issues: PhysicsQualityIssue[];
  /** True only when coverage, variation, mappings and human review all pass. */
  releaseReady: boolean;
}

/** One actionable authoring/review item, ordered by the smallest missing unit. */
export interface PhysicsQualityQueueItem {
  topicId: Id;
  specPointId: Id;
  capabilityId: Id | null;
  missingDemands: LearningDemand[];
  reason: "missing-demand" | "missing-mapping" | "missing-review" | "content-quality";
  issueKind?: PhysicsQualityIssueKind;
  questionId?: Id;
  partId?: Id;
}

/**
 * A concrete brief for an author, derived from the audit rather than from a
 * generic prompt template. It tells the author which families, contexts and
 * reasoning operations already exist so a new item can add real diversity.
 */
export interface PhysicsAuthoringBrief {
  topicId: Id;
  specPointId: Id;
  capabilityId: Id;
  missingDemands: LearningDemand[];
  demandRequirements: Array<{
    demand: LearningDemand;
    existingFamilies: string[];
    existingContexts: string[];
    existingReasoningMoves: string[];
    requiredFamilies: number;
    requiredContexts: number;
    requiredReasoningMoves: number;
  }>;
  rejectIf: string[];
}

const STOP_WORDS = new Set(["a", "an", "and", "at", "by", "for", "from", "in", "is", "of", "on", "or", "the", "to", "with"]);

/** Remove values and punctuation so a number-swapped reskin is visible. */
export function promptSignature(text: string): string {
  return text.toLowerCase()
    .replace(/[−–—]/g, "-")
    .replace(/\b[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\b/gi, "#")
    .replace(/[^a-z0-9#]+/g, " ")
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token))
    .join(" ");
}

/**
 * Value-stripped prompt containment: the fraction of the smaller prompt's
 * content words (and character trigrams) that also appear in the other.
 * Rewordings ("calculate" → "determine", "acting" → "acts", a name swap)
 * keep this near 1 because almost every content word survives; genuinely
 * different questions share little. Used together with the reasoning-move
 * check to reject wording-only variants from counting as distinct families.
 */
export function promptOverload(left: string, right: string): number {
  const tokens = (text: string): Set<string> =>
    new Set(promptSignature(text).split(" ").filter(Boolean));
  const a = tokens(left);
  const b = tokens(right);
  let tokenScore = 0;
  if (a.size && b.size) {
    let shared = 0;
    for (const token of a) if (b.has(token)) shared++;
    tokenScore = shared / Math.min(a.size, b.size);
  }
  const trigrams = (text: string): Set<string> => {
    const squashed = promptSignature(text).replace(/[^a-z0-9#]/g, "");
    const grams = new Set<string>();
    for (let i = 0; i + 3 <= squashed.length; i++) grams.add(squashed.slice(i, i + 3));
    return grams;
  };
  const ta = trigrams(left);
  const tb = trigrams(right);
  let trigramScore = 0;
  if (ta.size && tb.size) {
    let shared = 0;
    for (const gram of ta) if (tb.has(gram)) shared++;
    trigramScore = shared / Math.min(ta.size, tb.size);
  }
  return Math.max(tokenScore, trigramScore);
}

/** Authoring constants that a real reasoning move can never collapse to. */
const TEMPLATED_MOVE_PREFIXES = [
  "recall reasoning",
  "explanation reasoning",
  "application reasoning",
  "misconception reasoning",
  "calculation reasoning",
  "transfer reasoning",
  "synoptic reasoning",
];

/**
 * A reasoning move must name the physical/cognitive operation, not the demand
 * category. `${demand} reasoning ...` strings are generated filler and defeat
 * the distinctness check, so they are rejected before coverage counting.
 */
export function isTemplatedReasoningMove(move: string): boolean {
  const text = move.trim().toLowerCase();
  if (text.length < 12) return true;
  return TEMPLATED_MOVE_PREFIXES.some((prefix) => text.startsWith(prefix));
}

/** Distinctness floor for reasoning-move text itself (0–1 containment). */
const MOVE_OVERLAP_LIMIT = 0.55;
/**
 * Wording-only rewording threshold (0–1 containment). Two prompts sharing at
 * least this fraction of the smaller one's content words ask the same thing
 * in different words. The flag additionally requires the same reasoning
 * operation, so the wording bar can sit lower than a standalone duplicate
 * detector: wording overlap alone never flags.
 */
const REWORDING_CONTAINMENT_LIMIT = 0.6;
/**
 * Shared-operation threshold (0–1 containment over reasoning-move text).
 * Short calculation prompts on a narrow statement always share vocabulary
 * ("calculate the internal resistance"), so wording overlap alone cannot
 * distinguish a reskin from legitimate same-skill practice in a new context.
 * A rewording also repeats the same reasoning operation, so both signals are
 * required before a part is flagged.
 */
const SHARED_OPERATION_LIMIT = 0.5;

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function questionPartsForPoint(question: Question, specPointId: Id): QuestionPart[] {
  return question.parts.filter((part) => part.specPointIds?.includes(specPointId));
}

function partLearningMetadata(question: Question, part: QuestionPart) {
  return part.learning ?? (question.learning ? {
    familyId: question.learning.familyId,
    contextId: question.learning.contextId,
    demand: question.learning.demand,
    reasoningMoves: question.learning.reasoningMoves ?? [],
  } : undefined);
}

function partDemand(question: Question, part: QuestionPart): LearningDemand | undefined {
  return partLearningMetadata(question, part)?.demand;
}

/** Authored reasoning moves only; templated filler never counts toward distinctness. */
function authoredReasoningMoves(question: Question, part: QuestionPart): string[] {
  return (partLearningMetadata(question, part)?.reasoningMoves ?? [])
    .filter((move) => !isTemplatedReasoningMove(move));
}

/**
 * Count reasoning moves as distinct only when their text genuinely differs.
 * Two "families" whose moves are near-identical strings follow the same
 * solution path, so they cannot establish distinct coverage.
 */
function distinctAuthoredMoves(parts: Array<{ question: Question; part: QuestionPart }>): string[] {
  const moves: string[] = [];
  for (const { question, part } of parts) {
    for (const move of authoredReasoningMoves(question, part)) {
      const duplicate = moves.some((existing) => promptOverload(existing, move) >= MOVE_OVERLAP_LIMIT);
      if (!duplicate) moves.push(move);
    }
  }
  return moves;
}

function demandCoverage(mappedQuestions: Array<{ question: Question; part: QuestionPart }>): PhysicsDemandCoverage[] {
  return PHYSICS_ASSESSMENT_DEMANDS.map((demand): PhysicsDemandCoverage => {
    const rows = mappedQuestions.filter(({ question, part }) => partDemand(question, part) === demand);
    const families = unique(rows.map(({ question, part }) => partLearningMetadata(question, part)?.familyId).filter((id): id is string => Boolean(id)));
    const contexts = unique(rows.map(({ question, part }) => partLearningMetadata(question, part)?.contextId).filter((id): id is string => Boolean(id)));
    const authoredMoves = distinctAuthoredMoves(rows);
    const signatures = unique(rows.map(({ part }) => promptSignature(part.prompt)).filter(Boolean));
    return { demand, families, contexts, reasoningMoves: authoredMoves, questionCount: rows.length,
      complete: families.length >= MIN_PHYSICS_FAMILIES,
      // A second family/context is only useful when it asks for a different
      // reasoning operation. Prompt wording and number changes alone are not
      // enough to establish transfer-ready coverage, and templated moves
      // (`${demand} reasoning ...`) are excluded before counting.
      distinct: signatures.length >= MIN_PHYSICS_FAMILIES && contexts.length >= MIN_PHYSICS_FAMILIES &&
        authoredMoves.length >= MIN_PHYSICS_FAMILIES };
  });
}

/**
 * Audits the content inventory at the smallest authored unit: one part mapped
 * to one specification statement. A family id alone is not enough; the audit
 * also compares context and reasoning moves so changing only numbers cannot
 * masquerade as transfer practice.
 */
export function auditPhysicsAssessmentQuality(input: {
  /** Defaults to Physics for existing callers; the same audit serves the other WJEC flagships. */
  subjectId?: Id;
  topics: readonly Topic[];
  questions: readonly Question[];
  nodes: readonly CapabilityNode[];
  /** Trust predicate is injected to keep this audit independent of the review store. */
  trustedQuestion?: (question: Question) => boolean;
}): PhysicsAssessmentQualityAudit {
  const subjectId = input.subjectId ?? "wjec-alevel-physics";
  const physicsTopics = input.topics.filter((topic) => topic.subjectId === subjectId);
  const physicsQuestions = input.questions.filter((question) => question.subjectId === subjectId);
  const physicsNodes = input.nodes.filter((node) => node.subjectId === subjectId);
  const points = physicsTopics.flatMap((topic) => (topic.specPoints ?? []).map((point) => ({ topic, point })));
  const pointIds = new Set(points.map(({ point }) => point.id));
  const nodeById = new Map(physicsNodes.map((node) => [node.id, node]));
  const trustedQuestion = input.trustedQuestion ?? (() => false);
  const issues: PhysicsQualityIssue[] = [];
  const promptByDemand = new Map<string, Map<string, Id>>();
  /** Per statement+demand cell: every stored prompt keyed by question:part id. */
  const promptTextByDemand = new Map<string, Map<string, string>>();
  /** Per statement+demand cell: authored reasoning moves keyed by question:part id. */
  const promptMovesByDemand = new Map<string, Map<string, string[]>>();

  const addIssue = (question: Question, part: QuestionPart | undefined, kind: PhysicsQualityIssueKind, detail: string): void => {
    const specPointIds = part?.specPointIds ?? [];
    const capabilityIds = part?.capabilityIds ?? [];
    issues.push({
      questionId: question.id,
      ...(part ? { partId: part.id } : {}),
      ...(question.topicIds[0] ? { topicId: question.topicIds[0] } : {}),
      ...(specPointIds.length === 1 ? { specPointId: specPointIds[0] } : {}),
      ...(capabilityIds.length === 1 ? { capabilityId: capabilityIds[0] } : {}),
      kind,
      detail,
    });
  };

  for (const question of physicsQuestions) {
    if (!trustedQuestion(question)) {
      addIssue(question, undefined, "unreviewed", "Question has no current six-check human approval.");
    }
    for (const part of question.parts) {
      const specPointIds = part.specPointIds ?? [];
      if (specPointIds.length === 0) {
        addIssue(question, part, "missing-spec-point", "Map this part to exactly one WJEC specification statement.");
      }
      if (specPointIds.length > 1) {
        addIssue(question, part, "multi-capability-part", "A part maps to multiple specification points; it cannot isolate the blocking capability.");
      }
      for (const specPointId of specPointIds) {
        if (!pointIds.has(specPointId)) {
          addIssue(question, part, "unknown-spec-point", specPointId);
        }
      }
      const meta = partLearningMetadata(question, part);
      if (!meta) {
        addIssue(question, part, "missing-part-learning", "Add demand, family, context and authored reasoning moves.");
      } else if (!meta.reasoningMoves.length) {
        addIssue(question, part, "missing-reasoning-move", "No reasoning move is recorded.");
      } else if (meta.reasoningMoves.every((move) => isTemplatedReasoningMove(move))) {
        addIssue(question, part, "templated-reasoning-move", "Reasoning move restates the demand category; author the actual cognitive operation.");
      }
      if (part.markScheme.length !== part.marks) {
        addIssue(question, part, "incomplete-mark-scheme", `${part.markScheme.length} mark points for ${part.marks} marks.`);
      }
      const capabilityIds = part.capabilityIds ?? [];
      if (capabilityIds.length === 0) {
        addIssue(question, part, "missing-capability", "Map this part to one smallest useful capability.");
      } else if (capabilityIds.length > 1) {
        addIssue(question, part, "multi-capability-part", "A part maps to multiple capabilities; split it so a miss can identify the blocking skill.");
      }
      for (const capabilityId of capabilityIds) {
        const node = nodeById.get(capabilityId);
        if (!node) addIssue(question, part, "unknown-capability", capabilityId);
        else if (specPointIds.length === 1 && !node.specPointIds.includes(specPointIds[0]!)) {
          addIssue(question, part, "unknown-capability", `${capabilityId} does not map to ${specPointIds[0]}.`);
        }
      }
      if (meta && specPointIds.length === 1) {
        const key = `${specPointIds[0]}:${meta.demand}`;
        const seen = promptByDemand.get(key) ?? new Map<string, Id>();
        const texts = promptTextByDemand.get(key) ?? new Map<string, string>();
        const signature = promptSignature(part.prompt);
        // Exact value-stripped signature match with a *different* question:
        // a number-swapped reskin.
        const previous = seen.get(signature);
        if (previous && previous !== question.id) {
          addIssue(question, part, "cosmetic-reskin", `Shares the value-stripped prompt signature with ${previous}.`);
        }
        if (signature) {
          // Wording-only changes keep a high content-word overlap. A part
          // whose prompt is a near-copy of any part from another question in
          // the same statement+demand cell cannot be a distinct family, so it
          // is surfaced as a queue item. Parts of the same structured question
          // are one authored item and never counted against each other.
          // Because short calculation prompts on a narrow statement share
          // vocabulary legitimately, the flag additionally requires the same
          // reasoning operation: wording overlap without a shared operation
          // is same-skill practice in a new context, which is allowed.
          const ownMoves = authoredReasoningMoves(question, part);
          for (const [priorKey, priorPrompt] of texts) {
            if (priorKey.startsWith(`${question.id}:`)) continue;
            if (promptOverload(priorPrompt, part.prompt) < REWORDING_CONTAINMENT_LIMIT) continue;
            const priorEntry = promptMovesByDemand.get(key)?.get(priorKey);
            const sharedOperation = priorEntry !== undefined && ownMoves.length > 0 &&
              ownMoves.some((move) => priorEntry.some((prior) => promptOverload(prior, move) >= SHARED_OPERATION_LIMIT));
            if (sharedOperation) {
              addIssue(question, part, "surface-rewording", `Wording and reasoning operation of an existing ${meta.demand} part in the same statement; a rewording is not a distinct family.`);
              break;
            }
          }
          seen.set(signature, question.id);
          promptByDemand.set(key, seen);
          texts.set(`${question.id}:${part.id}`, part.prompt);
          promptTextByDemand.set(key, texts);
          const movesByPart = promptMovesByDemand.get(key) ?? new Map<string, string[]>();
          movesByPart.set(`${question.id}:${part.id}`, ownMoves);
          promptMovesByDemand.set(key, movesByPart);
        }
      }
    }
  }

  const capabilityCoverage = points.map(({ topic, point }): PhysicsCapabilityCoverage => {
    const mappedQuestions = physicsQuestions.flatMap((question) => questionPartsForPoint(question, point.id)
      .map((part) => ({ question, part })));
    const capabilityIds = unique(mappedQuestions.flatMap(({ part }) => part.capabilityIds ?? []));
    const demands = demandCoverage(mappedQuestions);
    return { topicId: topic.id, specPointId: point.id, capabilityIds, demands,
      complete: demands.every((demand) => demand.complete && demand.distinct) };
  });
  const capabilityCoverageByCapability = points.flatMap(({ topic, point }): PhysicsCapabilityDemandCoverage[] => {
    const mappedQuestions = physicsQuestions.flatMap((question) => questionPartsForPoint(question, point.id)
      .map((part) => ({ question, part })));
    // Include every graph capability attached to the statement even when no
    // question has been authored yet; otherwise an empty skill disappears
    // from the authoring queue and can be mistaken for complete coverage.
    const capabilityIds = unique([
      ...physicsNodes.filter((node) => node.specPointIds.includes(point.id)).map((node) => node.id),
      ...mappedQuestions.flatMap(({ part }) => part.capabilityIds ?? []),
    ]);
    return capabilityIds.map((capabilityId) => {
      const rows = mappedQuestions.filter(({ part }) => part.capabilityIds?.length === 1 && part.capabilityIds[0] === capabilityId);
      const demands = demandCoverage(rows);
      return { topicId: topic.id, specPointId: point.id, capabilityId, demands,
        complete: demands.every((demand) => demand.complete && demand.distinct) };
    });
  });
  const completeStatements = capabilityCoverage.filter((row) => row.complete).length;
  const approvedQuestions = physicsQuestions.filter(trustedQuestion).length;
  return {
    subjectId: "wjec-alevel-physics",
    statements: points.length,
    completeStatements,
    approvedQuestions,
    unreviewedQuestions: physicsQuestions.length - approvedQuestions,
    capabilityCoverage,
    capabilityCoverageByCapability,
    issues,
    // Statement-level depth is necessary but insufficient: a second graph
    // capability attached to the same statement must also have its own
    // demand coverage, otherwise a broad question could hide an unmeasured
    // blocking skill.
    releaseReady: points.length > 0 && completeStatements === points.length &&
      capabilityCoverage.every((row) => row.capabilityIds.length > 0) &&
      capabilityCoverageByCapability.length > 0 && capabilityCoverageByCapability.every((row) => row.complete) &&
      approvedQuestions === physicsQuestions.length && issues.length === 0,
  };
}

/** A compact queue for the next authoring/review pass. */
export function physicsQualityGaps(audit: PhysicsAssessmentQualityAudit): PhysicsCapabilityCoverage[] {
  return audit.capabilityCoverage.filter((row) => !row.complete);
}

/**
 * Turn the capability audit into briefs that a human author can act on. A
 * brief is intentionally silent on wording or numbers: the new question must
 * introduce a different context and reasoning operation, not fill a template.
 */
export function physicsAuthoringBriefs(audit: PhysicsAssessmentQualityAudit): PhysicsAuthoringBrief[] {
  return audit.capabilityCoverageByCapability
    .filter((row) => !row.complete)
    .map((row) => {
      const incomplete = row.demands.filter((demand) => !demand.complete || !demand.distinct);
      return {
        topicId: row.topicId,
        specPointId: row.specPointId,
        capabilityId: row.capabilityId,
        missingDemands: incomplete.map((demand) => demand.demand),
        demandRequirements: incomplete.map((demand) => ({
          demand: demand.demand,
          existingFamilies: demand.families,
          existingContexts: demand.contexts,
          existingReasoningMoves: demand.reasoningMoves,
          requiredFamilies: MIN_PHYSICS_FAMILIES,
          requiredContexts: MIN_PHYSICS_FAMILIES,
          requiredReasoningMoves: MIN_PHYSICS_FAMILIES,
        })),
        rejectIf: [
          "only the numbers, names or surface wording change",
          "the reasoning move restates the demand category instead of the cognitive operation",
          "the part maps to multiple specification points or capabilities",
          "the mark scheme has fewer independently awardable points than marks",
          "the reviewer cannot verify the physical assumptions against WJEC",
        ],
      };
    });
}

/**
 * Flatten the audit into a deterministic authoring queue. Mapping failures are
 * surfaced before demand gaps, and demand gaps are attached to the smallest
 * capability whenever the graph already identifies one.
 */
export function physicsQualityQueue(audit: PhysicsAssessmentQualityAudit): PhysicsQualityQueueItem[] {
  const queue: PhysicsQualityQueueItem[] = [];
  for (const row of audit.capabilityCoverageByCapability) {
    const missingDemands = row.demands
      .filter((demand) => !demand.complete || !demand.distinct)
      .map((demand) => demand.demand);
    if (missingDemands.length) queue.push({
      topicId: row.topicId,
      specPointId: row.specPointId,
      capabilityId: row.capabilityId,
      missingDemands,
      reason: "missing-demand",
    });
  }
  const seen = new Set(queue.map((row) => `${row.specPointId}:${row.capabilityId ?? "none"}`));
  for (const row of audit.capabilityCoverage.filter((coverage) => coverage.capabilityIds.length === 0)) {
    const key = `${row.specPointId}:none`;
    if (seen.has(key)) continue;
    queue.push({ topicId: row.topicId, specPointId: row.specPointId, capabilityId: null, missingDemands: [], reason: "missing-mapping" });
    seen.add(key);
  }
  for (const issue of audit.issues) {
    if (!["missing-spec-point", "missing-capability", "unknown-spec-point", "unknown-capability", "multi-capability-part"].includes(issue.kind)) continue;
    // The issue already names the question/part. Keep that identity in the
    // queue even when its statement link is itself the thing being repaired.
    const key = `${issue.questionId}:${issue.partId ?? "part"}:${issue.kind}`;
    if (seen.has(key)) continue;
    queue.push({
      topicId: issue.topicId ?? "wjec-alevel-physics",
      specPointId: issue.specPointId ?? "mapping-required",
      capabilityId: null,
      missingDemands: [],
      reason: "missing-mapping",
      issueKind: issue.kind,
      questionId: issue.questionId,
      ...(issue.partId ? { partId: issue.partId } : {}),
    });
    seen.add(key);
  }
  for (const issue of audit.issues.filter((row) => [
    "missing-part-learning", "missing-reasoning-move", "templated-reasoning-move", "incomplete-mark-scheme",
    "cosmetic-reskin", "surface-rewording",
  ].includes(row.kind))) {
    const key = `${issue.questionId}:${issue.partId ?? "part"}:${issue.kind}`;
    if (seen.has(key)) continue;
    queue.push({
      topicId: issue.topicId ?? "wjec-alevel-physics",
      specPointId: issue.specPointId ?? "content-review-required",
      capabilityId: issue.capabilityId ?? null,
      missingDemands: [],
      reason: "content-quality",
      issueKind: issue.kind,
      questionId: issue.questionId,
      ...(issue.partId ? { partId: issue.partId } : {}),
    });
    seen.add(key);
  }
  for (const issue of audit.issues.filter((row) => row.kind === "unreviewed")) {
    const key = `${issue.questionId}:review`;
    if (seen.has(key)) continue;
    queue.push({
      topicId: issue.topicId ?? "wjec-alevel-physics",
      specPointId: issue.specPointId ?? "review-required",
      capabilityId: issue.capabilityId ?? null,
      missingDemands: [],
      reason: "missing-review",
      issueKind: issue.kind,
      questionId: issue.questionId,
    });
    seen.add(key);
  }
  const priority: Record<PhysicsQualityQueueItem["reason"], number> = {
    "missing-mapping": 0,
    "missing-review": 1,
    "content-quality": 2,
    "missing-demand": 3,
  };
  return queue.sort((a, b) => priority[a.reason] - priority[b.reason] || a.topicId.localeCompare(b.topicId) ||
    a.specPointId.localeCompare(b.specPointId) || (a.capabilityId ?? "").localeCompare(b.capabilityId ?? "") ||
    (a.questionId ?? "").localeCompare(b.questionId ?? "") || (a.partId ?? "").localeCompare(b.partId ?? ""));
}
