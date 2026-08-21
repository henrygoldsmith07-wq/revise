import type { Id, Topic, TopicMastery } from "./types";

// ---------------------------------------------------------------------------
// Prerequisite / topic-dependency graph.
//
// Topics are not independent. "Equilibria" assumes "Moles"; "Integration"
// assumes "Differentiation". When a topic is weak and its prerequisite is
// also weak, fixing the prerequisite first recovers more marks per hour than
// grinding the downstream topic in isolation. This module makes that explicit
// so the Weak-topic diagnosis and the recommender can surface it.
//
// The graph is *additive*: curriculum modules can declare edges, but nothing
// breaks if they do not — unknown topics simply have no prerequisites.
// ---------------------------------------------------------------------------

/** One directed edge: `prerequisiteId` should be secure before `topicId`. */
export interface PrerequisiteEdge {
  topicId: Id;
  prerequisiteId: Id;
  /** "You will struggle with X until Y is secure." Shown verbatim in the UI. */
  reason?: string;
}

// Curated edges for the two specifications. IDs are fully-qualified topic ids
// so AQA and WJEC can diverge without colliding.
const EDGES: PrerequisiteEdge[] = [
  // Chemistry — physical
  { topicId: "wjec-alevel-chemistry.equilibria", prerequisiteId: "wjec-alevel-chemistry.moles", reason: "Equilibrium calculations reuse mole and concentration work" },
  { topicId: "wjec-alevel-chemistry.acids-bases", prerequisiteId: "wjec-alevel-chemistry.equilibria", reason: "pH and buffers are a special case of equilibrium" },
  { topicId: "wjec-alevel-chemistry.kinetics", prerequisiteId: "wjec-alevel-chemistry.moles", reason: "Rate equations need mole and gas-volume fluency" },
  { topicId: "wjec-alevel-chemistry.energetics", prerequisiteId: "wjec-alevel-chemistry.bonding", reason: "Enthalpy cycles reuse bonding and structure ideas" },
  { topicId: "aqa-alevel-chemistry.equilibria", prerequisiteId: "aqa-alevel-chemistry.moles", reason: "Equilibrium calculations reuse mole and concentration work" },
  { topicId: "aqa-alevel-chemistry.acids-bases", prerequisiteId: "aqa-alevel-chemistry.equilibria", reason: "pH and buffers are a special case of equilibrium" },
  { topicId: "aqa-alevel-chemistry.kinetics", prerequisiteId: "aqa-alevel-chemistry.moles", reason: "Rate equations need mole and gas-volume fluency" },
  { topicId: "aqa-alevel-chemistry.energetics", prerequisiteId: "aqa-alevel-chemistry.bonding", reason: "Enthalpy cycles reuse bonding and structure ideas" },
  // Physics
  { topicId: "wjec-alevel-physics.kinematics-dynamics", prerequisiteId: "wjec-alevel-physics.motion", reason: "Dynamics assumes kinematics fluency" },
  { topicId: "wjec-alevel-physics.forces-energy", prerequisiteId: "wjec-alevel-physics.kinematics-dynamics", reason: "Work/energy needs the kinematics base" },
  { topicId: "aqa-alevel-physics.kinematics-dynamics", prerequisiteId: "aqa-alevel-physics.motion", reason: "Dynamics assumes kinematics fluency" },
  { topicId: "aqa-alevel-physics.forces-energy", prerequisiteId: "aqa-alevel-physics.kinematics-dynamics", reason: "Work/energy needs the kinematics base" },
  // Maths
  { topicId: "wjec-alevel-maths.integration", prerequisiteId: "wjec-alevel-maths.differentiation", reason: "Integration inverts differentiation — secure the derivative first" },
  { topicId: "wjec-alevel-maths.vectors", prerequisiteId: "wjec-alevel-maths.trigonometry", reason: "Vectors lean on trigonometry" },
  { topicId: "aqa-alevel-maths.integration", prerequisiteId: "aqa-alevel-maths.differentiation", reason: "Integration inverts differentiation — secure the derivative first" },
  { topicId: "aqa-alevel-maths.vectors", prerequisiteId: "aqa-alevel-maths.trigonometry", reason: "Vectors lean on trigonometry" },
  // Biology
  { topicId: "wjec-alevel-biology.respiration", prerequisiteId: "wjec-alevel-biology.enzymes", reason: "Respiration is an enzyme-controlled pathway" },
  { topicId: "wjec-alevel-biology.genetics-inheritance", prerequisiteId: "wjec-alevel-biology.nucleic-acids", reason: "Genetics assumes the nucleic-acid base" },
  { topicId: "aqa-alevel-biology.respiration", prerequisiteId: "aqa-alevel-biology.enzymes", reason: "Respiration is an enzyme-controlled pathway" },
  { topicId: "aqa-alevel-biology.genetics-inheritance", prerequisiteId: "aqa-alevel-biology.nucleic-acids", reason: "Genetics assumes the nucleic-acid base" },
];

export function prerequisiteEdges(): PrerequisiteEdge[] { return [...EDGES]; }

export function prerequisitesFor(topicId: Id): Id[] {
  return EDGES.filter((e) => e.topicId === topicId).map((e) => e.prerequisiteId);
}

export function dependentsOf(topicId: Id): Id[] {
  return EDGES.filter((e) => e.prerequisiteId === topicId).map((e) => e.topicId);
}

export interface DependencyReport {
  topicId: Id;
  weak: boolean;
  blockedBy: Array<{ prerequisiteId: Id; weak: boolean; reason?: string }>;
  blocks: Id[]; // downstream topics that depend on this one
}

/**
 * For each topic, report which prerequisites are also weak ("blocked") and
 * which downstream topics it blocks. Sorted so blocked topics come first.
 */
export function dependencyReport(input: { topics: Topic[]; mastery: TopicMastery[] }): DependencyReport[] {
  const masteryById = new Map(input.mastery.map((m) => [m.topicId, m]));
  const byId = new Map(input.topics.map((t) => [t.id, t]));
  const weakSet = new Set(input.mastery.filter((m) => m.weak).map((m) => m.topicId));
  const out: DependencyReport[] = [];
  for (const topic of input.topics) {
    const weak = weakSet.has(topic.id);
    const blockedBy = EDGES.filter((e) => e.topicId === topic.id && byId.has(e.prerequisiteId))
      .map((e) => ({ prerequisiteId: e.prerequisiteId, weak: weakSet.has(e.prerequisiteId), reason: e.reason }));
    const blocks = EDGES.filter((e) => e.prerequisiteId === topic.id && byId.has(e.topicId)).map((e) => e.topicId);
    // Only surface topics that participate in the graph or are weak
    if (blockedBy.length || blocks.length || weak) {
      out.push({ topicId: topic.id, weak, blockedBy, blocks });
    }
  }
  // Blocked weak topics first (best fix-the-prerequisite opportunities)
  out.sort((a, b) => {
    const aBlocked = a.blockedBy.some((x) => x.weak) ? 1 : 0;
    const bBlocked = b.blockedBy.some((x) => x.weak) ? 1 : 0;
    if (aBlocked !== bBlocked) return bBlocked - aBlocked;
    if (a.weak !== b.weak) return a.weak ? -1 : 1;
    return 0;
  });
  return out;
}

/** Data-driven prerequisite inference — real usage only, gated on sample size.
 *
 *  When enough attempts exist, downstream topics that consistently underperform
 *  while a candidate prerequisite is also weak surface as a suggested edge.
 *  Curated edges always win; inferred edges are suggestions for review, not
 *  auto-inserted into the graph.
 */
export interface InferredEdge extends PrerequisiteEdge {
  confidence: "low" | "medium" | "high";
  evidence: number;
  downstreamSuccessWhenPrereqWeak: number | null;
  downstreamSuccessWhenPrereqOk: number | null;
  gap: number | null;
}

export function inferPrerequisiteEdges(input: {
  topics: Topic[];
  mastery: TopicMastery[];
  attemptsByTopic?: Map<Id, import("./types").Attempt[]>;
  minAttempts?: number;
}): InferredEdge[] {
  const minAttempts = input.minAttempts ?? 5;
  const masteryById = new Map(input.mastery.map((m) => [m.topicId, m.mastery]));
  const attemptsByTopic = input.attemptsByTopic;
  // Candidate pairs: every ordered topic pair within the same subject that is not already an edge
  const subjectBuckets = new Map<Id, Topic[]>();
  for (const t of input.topics) {
    const list = subjectBuckets.get(t.subjectId) ?? [];
    list.push(t);
    subjectBuckets.set(t.subjectId, list);
  }
  const existing = new Set(EDGES.map((e) => `${e.topicId}<-${e.prerequisiteId}`));
  const out: InferredEdge[] = [];
  for (const [, bucket] of subjectBuckets) {
    for (const downstream of bucket) {
      for (const prereq of bucket) {
        if (downstream.id === prereq.id) continue;
        const key = `${downstream.id}<-${prereq.id}`;
        if (existing.has(key)) continue;
        const dMastery = masteryById.get(downstream.id);
        const pMastery = masteryById.get(prereq.id);
        if (dMastery == null || pMastery == null) continue;
        // Need enough attempts on downstream to measure
        const dAtts = attemptsByTopic?.get(downstream.id) ?? [];
        if (dAtts.length < minAttempts) continue;
        // Heuristic: downstream weak + prereq weak much more often than downstream weak + prereq ok
        // gap is negative when prereq is weaker than downstream (prereq - downstream)
        const gap = pMastery - dMastery;
        // Only surface when prereq is materially weaker than downstream
        if (pMastery >= 0.55) continue;
        if (dMastery >= 0.6) continue; // downstream not weak → no block
        if (gap > -0.08) continue; // prereq not meaningfully weaker
        const downstreamSuccessWhenPrereqWeak = dMastery;
        const downstreamSuccessWhenPrereqOk = null; // not enough stratification without per-attempt time series
        const evidence = dAtts.length;
        const confidence: InferredEdge["confidence"] = evidence >= 10 && gap < -0.18 ? "high" : evidence >= 7 ? "medium" : "low";
        out.push({
          topicId: downstream.id,
          prerequisiteId: prereq.id,
          reason: `Data suggests ${prereq.title} is a prerequisite for ${downstream.title} — downstream is weak (${Math.round(dMastery * 100)}%) while the prerequisite is weaker (${Math.round(pMastery * 100)}%).`,
          confidence,
          evidence,
          downstreamSuccessWhenPrereqWeak,
          downstreamSuccessWhenPrereqOk,
          gap: Math.round(gap * 1000) / 1000,
        });
      }
    }
  }
  // Most negative gap first (strongest block)
  out.sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0));
  // Cap to top 12 so review stays focused
  return out.slice(0, 12);
}

/**
 * Pick the highest-leverage prerequisite to fix first among weak topics that
 * are blocked. Returns null when no blocked weak topic exists.
 */
export function bestPrerequisiteFix(input: { topics: Topic[]; mastery: TopicMastery[]; marksPerHour?: Map<Id, number> }): { topicId: Id; prerequisiteId: Id; reason?: string } | null {
  const masteryById = new Map(input.mastery.map((m) => [m.topicId, m]));
  const weakSet = new Set(input.mastery.filter((m) => m.weak).map((m) => m.topicId));
  const candidates: Array<{ topicId: Id; prerequisiteId: Id; reason?: string; mastery: number; mph?: number }> = [];
  for (const e of EDGES) {
    if (!weakSet.has(e.topicId)) continue;
    if (!weakSet.has(e.prerequisiteId)) continue;
    const m = masteryById.get(e.prerequisiteId);
    if (!m) continue;
    candidates.push({ topicId: e.topicId, prerequisiteId: e.prerequisiteId, reason: e.reason, mastery: m.mastery, mph: input.marksPerHour?.get(e.prerequisiteId) });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (a.mph != null && b.mph != null && a.mph !== b.mph) return b.mph - a.mph;
    return a.mastery - b.mastery;
  });
  const c = candidates[0];
  return { topicId: c.topicId, prerequisiteId: c.prerequisiteId, reason: c.reason };
}

export interface RootPrerequisitePath {
  rootTopicId: Id;
  /** Ordered from the downstream topic towards the root. */
  path: Id[];
}

/** Traverse the dependency graph to the foundational topics behind one topic. */
export function rootPrerequisitePaths(topicId: Id, edges: PrerequisiteEdge[] = prerequisiteEdges()): RootPrerequisitePath[] {
  const visit = (current: Id, path: Id[], seen: Set<Id>): RootPrerequisitePath[] => {
    if (seen.has(current)) return [{ rootTopicId: current, path: [...path, current] }];
    const next = edges.filter((edge) => edge.topicId === current).map((edge) => edge.prerequisiteId);
    if (!next.length) return [{ rootTopicId: current, path: [...path, current] }];
    const nextSeen = new Set(seen).add(current);
    return next.flatMap((prerequisiteId) => visit(prerequisiteId, [...path, current], nextSeen));
  };

  const unique = new Map<string, RootPrerequisitePath>();
  for (const row of visit(topicId, [], new Set())) unique.set(`${row.rootTopicId}:${row.path.join("/")}`, row);
  return [...unique.values()];
}

export interface RootPrerequisiteRemediation {
  rootTopicId: Id;
  affectedTopicIds: Id[];
  paths: Id[][];
  rootMastery: number;
  lowestAffectedMastery: number;
  priority: number;
  reason: string;
}

/** Rank weak foundational topics whose repair can unblock several weak dependents. */
export function rootPrerequisiteRemediation(input: {
  topics: Topic[];
  mastery: TopicMastery[];
  marksPerHour?: Map<Id, number>;
  edges?: PrerequisiteEdge[];
}): RootPrerequisiteRemediation[] {
  const edges = input.edges ?? prerequisiteEdges();
  const topicIds = new Set(input.topics.map((topic) => topic.id));
  const masteryById = new Map(input.mastery.map((row) => [row.topicId, row]));
  const candidates = new Map<Id, { affectedTopicIds: Set<Id>; paths: Id[][] }>();

  for (const target of input.topics) {
    const targetMastery = masteryById.get(target.id);
    if (!targetMastery?.weak) continue;
    for (const path of rootPrerequisitePaths(target.id, edges)) {
      if (path.path.length < 2 || !topicIds.has(path.rootTopicId)) continue;
      const rootMastery = masteryById.get(path.rootTopicId);
      if (!rootMastery?.weak) continue;
      const current = candidates.get(path.rootTopicId) ?? { affectedTopicIds: new Set<Id>(), paths: [] };
      current.affectedTopicIds.add(target.id);
      current.paths.push(path.path);
      candidates.set(path.rootTopicId, current);
    }
  }

  return [...candidates.entries()]
    .map(([rootTopicId, value]) => {
      const rootMastery = masteryById.get(rootTopicId)?.mastery ?? 0;
      const affectedTopicIds = [...value.affectedTopicIds];
      const lowestAffectedMastery = Math.min(...affectedTopicIds.map((id) => masteryById.get(id)?.mastery ?? 0));
      const marksPerHour = input.marksPerHour?.get(rootTopicId) ?? 0;
      const priority = roundPriority((1 - rootMastery) * affectedTopicIds.length + marksPerHour * 0.05);
      return {
        rootTopicId,
        affectedTopicIds,
        paths: value.paths,
        rootMastery,
        lowestAffectedMastery,
        priority,
        reason: `Repairing this foundation can unblock ${affectedTopicIds.length} weak dependent topic${affectedTopicIds.length === 1 ? "" : "s"}.`,
      };
    })
    .sort((a, b) => b.priority - a.priority || a.rootTopicId.localeCompare(b.rootTopicId));
}

function roundPriority(value: number): number {
  return Math.round(value * 100) / 100;
}
