// ---------------------------------------------------------------------------
// Adaptive cold-start diagnostic (15–25 minutes) for one subject.
//
// This module only *chooses* probes and *summarises* what was learned. Each
// probe is answered through the normal attempt pipeline, so mastery, the
// recommender and the planner consume the evidence exactly as they would any
// other practice: there is no parallel scoring model here.
//
// Policy: start broad (one recall probe per topic), then branch —
//   correct + confident   → go harder in that topic, or open a new area
//   correct + unsure      → verify with a different item at the same depth
//   incorrect             → find the cause (recall → application → prerequisite
//                           → technique), then stop that branch once enough is known
// Only trusted items are used, and the choice maximises information per minute.
// ---------------------------------------------------------------------------

import type { Id } from "./types";

export type ProbeDepth = "recall" | "application" | "hard-application";
export type ProbeCause = "recall" | "application" | "prerequisite" | "technique" | "none";

export interface DiagnosticItem {
  id: Id;
  topicId: Id;
  depth: ProbeDepth;
  marks: number;
  /** Expected seconds for a typical student. */
  expectedSeconds: number;
  /** Only human-reviewed / trust-gated items may be used. */
  trusted: boolean;
  familyId?: string;
  /** Topic that this topic builds on, when the curriculum says so. */
  prerequisiteTopicId?: Id;
}

export interface ProbeRecord {
  itemId: Id;
  topicId: Id;
  depth: ProbeDepth;
  correct: boolean;
  confident: boolean;
  seconds: number;
  /** Set when the marker or student flagged a command-word/technique miss. */
  techniqueMiss?: boolean;
  hinted?: boolean;
}

export const DIAGNOSTIC_MIN_MINUTES = 15;
export const DIAGNOSTIC_MAX_MINUTES = 25;
export const DIAGNOSTIC_MAX_PER_TOPIC = 4;
const SETTLED_WRONG = 2;

export interface TopicState {
  topicId: Id;
  probes: ProbeRecord[];
  settled: boolean;
  cause: ProbeCause;
  nextDepth: ProbeDepth | "verify" | null;
}

const DEPTHS: ProbeDepth[] = ["recall", "application", "hard-application"];
const higher = (d: ProbeDepth): ProbeDepth | null => DEPTHS[DEPTHS.indexOf(d) + 1] ?? null;

/** Independent, unhinted probes only; a hinted correct answer is not clean evidence. */
function clean(p: ProbeRecord): boolean {
  return !p.hinted;
}

export function inferCause(probes: readonly ProbeRecord[]): ProbeCause {
  const wrong = probes.filter((p) => !p.correct && clean(p));
  if (!wrong.length) return "none";
  const last = wrong.at(-1)!;
  if (last.techniqueMiss) return "technique";
  const recallRight = probes.some((p) => p.depth === "recall" && p.correct && clean(p));
  const recallWrong = probes.some((p) => p.depth === "recall" && !p.correct && clean(p));
  if (last.depth === "recall") return "recall";
  if (recallRight) return "application";
  if (recallWrong) return "recall";
  return "application";
}

export function topicStates(records: readonly ProbeRecord[], topicIds: readonly Id[]): TopicState[] {
  return topicIds.map((topicId) => {
    const probes = records.filter((r) => r.topicId === topicId);
    const last = probes.at(-1);
    const wrongCount = probes.filter((p) => !p.correct && clean(p)).length;
    const cause = inferCause(probes);
    const settled = probes.length >= DIAGNOSTIC_MAX_PER_TOPIC || wrongCount >= SETTLED_WRONG ||
      (!!last && last.correct && last.confident && last.depth === "hard-application" && clean(last));
    let nextDepth: TopicState["nextDepth"] = "recall";
    if (last) {
      if (last.correct && !last.confident) nextDepth = "verify";
      else if (last.correct) nextDepth = higher(last.depth);
      else if (last.depth === "recall") nextDepth = wrongCount >= SETTLED_WRONG ? null : "recall";
      else nextDepth = probes.some((p) => p.depth === "recall") ? (wrongCount >= SETTLED_WRONG ? null : "application") : "recall";
    }
    return { topicId, probes, settled: settled || nextDepth === null, cause, nextDepth };
  });
}

export interface NextProbe {
  item: DiagnosticItem;
  reason: string;
}

export interface NextProbeInput {
  topicIds: readonly Id[];
  items: readonly DiagnosticItem[];
  records: readonly ProbeRecord[];
  /** Items the learner has already attempted before this diagnostic (never re-used). */
  seenItemIds?: ReadonlySet<Id>;
  /** Topics the learner already has solid trusted evidence for; skipped. */
  knownTopicIds?: ReadonlySet<Id>;
}

export function elapsedMinutes(records: readonly ProbeRecord[]): number {
  return records.reduce((sum, r) => sum + Math.max(15, r.seconds), 0) / 60;
}

export function diagnosticFinished(input: NextProbeInput): boolean {
  if (elapsedMinutes(input.records) >= DIAGNOSTIC_MAX_MINUTES) return true;
  return nextProbe(input) === null;
}

export function nextProbe(input: NextProbeInput): NextProbe | null {
  const minutes = elapsedMinutes(input.records);
  if (minutes >= DIAGNOSTIC_MAX_MINUTES) return null;
  const asked = new Set(input.records.map((r) => r.itemId));
  const askedFamilies = new Set(input.items.filter((i) => asked.has(i.id) && i.familyId).map((i) => i.familyId!));
  const usable = input.items.filter((i) => i.trusted && !asked.has(i.id) && !input.seenItemIds?.has(i.id) &&
    !(i.familyId && askedFamilies.has(i.familyId)));
  const topics = input.topicIds.filter((id) => !input.knownTopicIds?.has(id));
  const states = topicStates(input.records, topics);
  const remainingMinutes = DIAGNOSTIC_MAX_MINUTES - minutes;
  const candidates: Array<NextProbe & { score: number }> = [];

  for (const state of states) {
    if (state.settled) continue;
    const pool = usable.filter((i) => i.topicId === state.topicId);
    const last = state.probes.at(-1);
    const wants: Array<{ depth: ProbeDepth; reason: string; info: number }> = [];
    if (!last) wants.push({ depth: "recall", reason: "First look at this topic.", info: 1 });
    else if (state.nextDepth === "verify") wants.push({ depth: last.depth, reason: "Correct but unsure: checking with a different question.", info: 0.8 });
    else if (state.nextDepth) {
      const harder = state.nextDepth !== last.depth && last.correct;
      wants.push({
        depth: state.nextDepth,
        reason: last.correct ? (harder ? "Correct and confident: trying something harder." : "Checking a further depth.")
          : state.cause === "recall" ? "Missed: checking whether recall is the problem."
          : state.cause === "application" ? "Recall is fine; testing where application breaks." : "Narrowing down the cause.",
        info: last.correct ? 0.6 : 0.9,
      });
    }
    // A wrong answer at application with a known prerequisite opens a prerequisite probe.
    const lastWrongApp = last && !last.correct && last.depth !== "recall";
    if (lastWrongApp && state.cause === "application") {
      const prereq = pool.find((i) => i.prerequisiteTopicId)?.prerequisiteTopicId;
      const prereqItem = prereq ? usable.find((i) => i.topicId === prereq && i.depth === "recall") : undefined;
      if (prereqItem && !asked.has(prereqItem.id) && !input.records.some((r) => r.topicId === prereq)) {
        candidates.push({ item: prereqItem, reason: "Checking whether a prerequisite is behind the miss.", score: 0.95 / (prereqItem.expectedSeconds / 60) });
      }
    }
    for (const want of wants) {
      const item = pool.filter((i) => i.depth === want.depth).sort((a, b) => a.expectedSeconds - b.expectedSeconds || a.id.localeCompare(b.id))[0];
      if (!item) continue;
      const mins = item.expectedSeconds / 60;
      if (mins > remainingMinutes && minutes >= DIAGNOSTIC_MIN_MINUTES) continue;
      // Broad-first: unseen topics get a coverage bonus until every topic has a probe.
      candidates.push({ item, reason: want.reason, score: want.info / Math.max(0.5, mins) });
    }
  }
  return candidates.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))[0] ?? null;
}

export interface DiagnosticReport {
  minutes: number;
  /** What the evidence supports saying, in plain sentences. */
  established: string[];
  unknown: Id[];
  weak: Array<{ topicId: Id; cause: ProbeCause }>;
  strong: Id[];
  calibration: { overconfident: number; underconfident: number; samples: number };
  speed: "fast" | "typical" | "slow" | "unknown";
  techniqueFlags: number;
  path: Array<{ topicId: Id; action: "prerequisite-repair" | "retrieval-set" | "independent-set" | "transfer-set" | "technique-intervention" }>;
}

export function diagnosticReport(records: readonly ProbeRecord[], topicIds: readonly Id[], items: readonly DiagnosticItem[] = []): DiagnosticReport {
  const states = topicStates(records, topicIds);
  const unknown = states.filter((s) => s.probes.length === 0).map((s) => s.topicId);
  const weak: DiagnosticReport["weak"] = [];
  const strong: Id[] = [];
  const path: DiagnosticReport["path"] = [];
  const itemById = new Map(items.map((i) => [i.id, i] as const));
  for (const state of states) {
    if (!state.probes.length) continue;
    const cleanProbes = state.probes.filter(clean);
    const wrong = cleanProbes.filter((p) => !p.correct);
    const right = cleanProbes.filter((p) => p.correct);
    // Strong needs two clean correct answers; one lucky answer is still thin.
    if (right.length >= 2 && wrong.length === 0 && right.some((p) => p.confident)) strong.push(state.topicId);
    else if (wrong.length > 0 && wrong.length >= right.length) {
      weak.push({ topicId: state.topicId, cause: state.cause });
      const prereq = state.cause === "application" ? itemById.get(state.probes.find((p) => !p.correct)!.itemId)?.prerequisiteTopicId : undefined;
      path.push({ topicId: state.topicId, action: state.cause === "technique" ? "technique-intervention" : state.cause === "recall" ? "retrieval-set" : prereq ? "prerequisite-repair" : "independent-set" });
    } else if (right.length >= 1 && wrong.length === 0) {
      path.push({ topicId: state.topicId, action: "transfer-set" });
    }
  }
  const timed = records.filter((r) => itemById.get(r.itemId));
  const ratio = timed.length ? timed.reduce((s, r) => s + r.seconds, 0) / timed.reduce((s, r) => s + itemById.get(r.itemId)!.expectedSeconds, 0) : null;
  const confSamples = records.filter(clean);
  const established: string[] = [];
  if (strong.length) established.push(`${strong.length} topic${strong.length === 1 ? "" : "s"} looked secure on unaided answers.`);
  if (weak.length) established.push(`${weak.length} topic${weak.length === 1 ? "" : "s"} showed a clear gap.`);
  if (!records.length) established.push("No diagnostic answers yet, so nothing can be said.");
  else established.push("This is a starting picture from a few questions, not a grade prediction.");
  return {
    minutes: Math.round(elapsedMinutes(records) * 10) / 10,
    established,
    unknown,
    weak,
    strong,
    calibration: {
      overconfident: confSamples.filter((r) => r.confident && !r.correct).length,
      underconfident: confSamples.filter((r) => !r.confident && r.correct).length,
      samples: confSamples.length,
    },
    speed: ratio === null ? "unknown" : ratio < 0.8 ? "fast" : ratio > 1.3 ? "slow" : "typical",
    techniqueFlags: records.filter((r) => r.techniqueMiss).length,
    path: path.slice(0, 5),
  };
}
