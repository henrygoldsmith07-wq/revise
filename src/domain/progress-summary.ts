// ---------------------------------------------------------------------------
// Progress summary — the four questions a student actually asks.
//
//   1. What am I strong at?          (evidence stages Secure / Proven)
//   2. Where am I losing marks?      (open mistakes, recurring root causes)
//   3. What has been proven?         (proof ledger: gain on new questions)
//   4. What should I work on next?   (today's chosen session)
//
// Pure selector over existing domain results; nothing here re-scores. With
// too little evidence it says so instead of inventing strengths.
// ---------------------------------------------------------------------------

import { buildMarksAtRisk } from "./marks-at-risk";
import { masteryStages, stageLabel, type MasteryStage } from "./mastery-stage";
import { buildMistakePatterns, type MistakePattern } from "./mistake-patterns";
import { buildTopicLifecycles, type LifecycleStage } from "./proof-lifecycle";
import type { ProofLedger } from "./proof-of-improvement";
import type { Attempt, Id, Mistake, Question, Topic } from "./types";

export interface StrongTopic {
  topicId: Id; title: string; stage: MasteryStage; label: string; reason: string;
  /** Reference-tier practice evidence: the label already says "in practice". */
  referenceTier: boolean;
  /** Marks lost on this topic that are not yet recovered (the topic can be strong overall and still have them). */
  openMarks: number;
}
export interface LosingTopic { topicId: Id; title: string; marks: number }
export interface ProvenTopic { topicId: Id; title: string; markPoints: number }

export interface ProgressSummary {
  /** True when no topic has reached Practised yet: strengths are unknown, not absent. */
  coldStart: boolean;
  strong: StrongTopic[];
  stageCounts: Record<MasteryStage, number>;
  /** How many of `stageCounts.secure` rest on reference-tier practice questions only. */
  practiceOnlySecure: number;
  losing: {
    totalMarks: number; topics: LosingTopic[]; patterns: MistakePattern[];
    /**
     * Topics shown as strong or proven that still have unrecovered lost marks.
     * Both are true at once, at different scopes: "Proven"/"Secure" is about
     * the topic overall; a lost mark is one specific question not yet won back.
     */
    inStrongTopics: LosingTopic[];
    /** One plain sentence explaining that scope whenever `inStrongTopics` is not empty; otherwise null. */
    scopeNote: string | null;
  };
  proven: { topics: ProvenTopic[]; declined: number; awaiting: number; markPoints: number };
  /** Where topics stand on proof: states shown to students, never a score. */
  lifecycle: {
    counts: Record<LifecycleStage, number>;
    /** A delayed check on new questions can be taken now. */
    dueNow: Array<{ topicId: Id; title: string }>;
    /** Strong on questions already seen, weaker on new ones. */
    memorised: Array<{ topicId: Id; title: string }>;
    slipped: Array<{ topicId: Id; title: string }>;
    /** Evidence-backed "improved from X to Y" sentences; empty unless the ledger supports them. */
    claims: string[];
  };
  next: string | null;
}

const ORDER: MasteryStage[] = ["untouched", "learning", "practised", "secure", "proven", "fading"];

export function buildProgressSummary(input: {
  subjectIds: readonly Id[];
  topics: readonly Topic[];
  attempts: readonly Attempt[];
  questions: readonly Question[];
  mistakes: readonly Mistake[];
  ledger?: ProofLedger;
  reviewedTopicIds?: ReadonlySet<Id>;
  nextHeadline?: string | null;
  now?: Date;
}): ProgressSummary {
  const enrolled = new Set(input.subjectIds);
  const topics = input.topics.filter((topic) => !enrolled.size || enrolled.has(topic.subjectId));
  const title = new Map(topics.map((topic) => [topic.id, topic.title] as const));
  const stages = masteryStages({
    topicIds: topics.map((topic) => topic.id), attempts: input.attempts, questions: input.questions,
    reviewedTopicIds: input.reviewedTopicIds, now: input.now,
  });
  const stageCounts = Object.fromEntries(ORDER.map((stage) => [stage, 0])) as Record<MasteryStage, number>;
  for (const row of stages) stageCounts[row.stage] += 1;
  const practiceOnlySecure = stages.filter((row) => row.stage === "secure" && row.referenceTier).length;

  const risk = buildMarksAtRisk({
    mistakes: input.mistakes as Mistake[], attempts: input.attempts as Attempt[], questions: input.questions as Question[],
    ...(enrolled.size ? { subjectIds: [...enrolled] } : {}),
  });
  const openMarks = new Map(risk.topics.filter((row) => row.marks > 0).map((row) => [row.topicId, row.marks] as const));

  const strong = stages
    .filter((row) => row.stage === "secure" || row.stage === "proven")
    .sort((a, b) => ORDER.indexOf(b.stage) - ORDER.indexOf(a.stage) || (b.evidence.accuracy ?? 0) - (a.evidence.accuracy ?? 0) || a.topicId.localeCompare(b.topicId))
    .slice(0, 5)
    .map((row) => ({ topicId: row.topicId, title: title.get(row.topicId) ?? row.topicId, stage: row.stage, label: stageLabel(row.stage, row.referenceTier), reason: row.reasons[0] ?? "", referenceTier: row.referenceTier, openMarks: openMarks.get(row.topicId) ?? 0 }));
  const patterns = buildMistakePatterns({ mistakes: input.mistakes, attempts: input.attempts, questions: input.questions })
    .filter((row) => !row.repaired && (row.recurring || row.openMarks > 0))
    .filter((row) => !enrolled.size || row.topics.some((id) => topics.some((topic) => topic.id === id)))
    .slice(0, 3);

  const ledgerTopics = (input.ledger?.topics ?? []).filter((row) => !enrolled.size || enrolled.has(row.subjectId));
  const provenTopics = ledgerTopics
    .filter((row) => row.status === "proven-gain" && !row.illusory)
    .sort((a, b) => b.markPoints - a.markPoints || a.topicId.localeCompare(b.topicId))
    .map((row) => ({ topicId: row.topicId, title: title.get(row.topicId) ?? row.topicId, markPoints: row.markPoints }));

  const lifecycles = buildTopicLifecycles({
    topics, ledger: input.ledger, attempts: input.attempts, questions: input.questions,
    reviewedTopicIds: input.reviewedTopicIds, now: input.now,
  });
  const lifecycleCounts = Object.fromEntries(
    (["not-started", "weak", "practising", "looks-learned", "awaiting-proof", "proven", "holding", "no-clear-improvement", "slipped", "fading"] as LifecycleStage[]).map((stage) => [stage, 0]),
  ) as Record<LifecycleStage, number>;
  for (const row of lifecycles) lifecycleCounts[row.stage] += 1;
  const named = (rows: typeof lifecycles) => rows.map((row) => ({ topicId: row.topicId, title: title.get(row.topicId) ?? row.topicId }));

  // A topic can be shown as strong/proven (whole-topic evidence) while
  // specific lost marks on it are still open. Never hide either; say how they
  // relate, so "Proven" next to "N marks lost" is not read as a contradiction.
  const strongOrProven = new Map<Id, string>();
  for (const row of strong) strongOrProven.set(row.topicId, row.label);
  for (const row of provenTopics) if (!strongOrProven.has(row.topicId)) strongOrProven.set(row.topicId, "Improvement proven");
  for (const row of lifecycles) if ((row.stage === "proven" || row.stage === "holding") && !strongOrProven.has(row.topicId)) strongOrProven.set(row.topicId, "Improvement proven");
  const inStrongTopics = [...strongOrProven.keys()]
    .filter((topicId) => (openMarks.get(topicId) ?? 0) > 0)
    .map((topicId) => ({ topicId, title: title.get(topicId) ?? topicId, marks: openMarks.get(topicId) ?? 0 }))
    .sort((a, b) => b.marks - a.marks || a.topicId.localeCompare(b.topicId));
  const overlapMarks = inStrongTopics.reduce((sum, row) => sum + row.marks, 0);
  const scopeNote = inStrongTopics.length
    ? `${overlapMarks} of these marks ${overlapMarks === 1 ? "is" : "are"} in ${inStrongTopics.slice(0, 3).map((row) => row.title).join(", ")}, which ${inStrongTopics.length === 1 ? "shows" : "show"} as strong or proven. Both are true: that label is about the topic as a whole, while each lost mark is a specific question you have not yet got right again.`
    : null;

  return {
    lifecycle: {
      counts: lifecycleCounts,
      dueNow: named(lifecycles.filter((row) => row.dueNow)),
      memorised: named(lifecycles.filter((row) => row.memorised)),
      slipped: named(lifecycles.filter((row) => row.stage === "slipped")),
      claims: lifecycles.flatMap((row) => (row.claim ? [row.claim] : [])),
    },
    coldStart: stageCounts.practised + stageCounts.secure + stageCounts.proven + stageCounts.fading === 0,
    strong,
    stageCounts,
    practiceOnlySecure,
    losing: {
      totalMarks: risk.totalMarks,
      topics: risk.topics.slice(0, 3).map((row) => ({ topicId: row.topicId, title: row.label, marks: row.marks })),
      patterns,
      inStrongTopics,
      scopeNote,
    },
    proven: {
      topics: provenTopics.slice(0, 5),
      declined: ledgerTopics.filter((row) => row.status === "declined").length,
      awaiting: ledgerTopics.filter((row) => row.proofDue).length,
      markPoints: Math.round(provenTopics.reduce((sum, row) => sum + row.markPoints, 0) * 10) / 10,
    },
    next: input.nextHeadline ?? null,
  };
}
