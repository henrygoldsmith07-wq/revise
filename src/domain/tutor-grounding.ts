// Conversational tutor grounding — where the tutor starts and what it knows.
//
// The tutor teaches from the learner's exact position: the topic they are
// standing on, the marks they have actually lost there, and where that topic
// sits in the specification. Those are evidence decisions, so they live here
// as pure functions — the chat UI only renders what these return, and the AI
// layer only ever receives what these produce. Nothing here touches the model.

import { getTopic, subjectLabel, topicsFor } from "./curriculum";
import type { Id, IsoInstant, Mistake, Topic, TopicMastery } from "./types";

/** A topic the tutor suggests opening with, and why. */
export interface TutorStarter {
  topicId: Id;
  subjectId: Id;
  title: string;
  /** Why the tutor suggests this topic, in the student's language. */
  reason: string;
  openMistakes: number;
  marksLost: number;
  /** The loss category that repeats among these open mistakes, when one does. */
  dominantCategory: Mistake["category"] | null;
  lastLostAt: IsoInstant | null;
}

/** One lost mark-scheme point the tutor is told about, in the model payload. */
export interface TutorMistakeContext {
  /** The exact mark-scheme point the student has lost before. */
  point: string;
  category: string;
  marksLost: number;
}

/** The learner evidence that accompanies every tutor turn. */
export interface TutorLearnerContext {
  position?: string;
  masteryLine?: string;
  openMistakes: TutorMistakeContext[];
}

const CATEGORY_LABELS: Record<Mistake["category"], string> = {
  recall: "recall slips",
  method: "method slips",
  arithmetic: "arithmetic slips",
  interpretation: "interpretation slips",
  communication: "communication slips",
  unclassified: "lost marks",
};

/** A mistake the tutor may still repair: unresolved, enrolled, in a real topic. */
function tutorEligible(mistake: Mistake, enrolled: ReadonlySet<Id>): boolean {
  return !mistake.resolved && enrolled.has(mistake.subjectId) && getTopic(mistake.topicId) !== undefined;
}

function starterReason(open: Mistake[], marksLost: number): string {
  if (open.length === 1) {
    const label = CATEGORY_LABELS[open[0].category];
    return `1 open mistake · ${marksLost} mark${marksLost === 1 ? "" : "s"} lost (${label})`;
  }
  const counts = new Map<Mistake["category"], number>();
  for (const mistake of open) counts.set(mistake.category, (counts.get(mistake.category) ?? 0) + 1);
  const [dominant, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (count >= 2) {
    return `${open.length} open mistakes · ${marksLost} marks lost — repeat ${CATEGORY_LABELS[dominant]}`;
  }
  return `${open.length} open mistakes · ${marksLost} marks lost here`;
}

/**
 * Topics to open the tutor on, weakest first: the topics where the learner has
 * unrecovered marks. Only when nothing is open does a "start from the spec"
 * fallback appear, one per enrolled subject.
 */
export function suggestTutorStarters(input: {
  mistakes: readonly Mistake[];
  subjectIds: readonly Id[];
  limit?: number;
}): TutorStarter[] {
  const limit = input.limit ?? 3;
  const enrolled = new Set(input.subjectIds);
  const byTopic = new Map<Id, Mistake[]>();
  for (const mistake of input.mistakes) {
    if (!tutorEligible(mistake, enrolled)) continue;
    const rows = byTopic.get(mistake.topicId) ?? [];
    rows.push(mistake);
    byTopic.set(mistake.topicId, rows);
  }

  const starters: TutorStarter[] = [...byTopic.entries()]
    .map(([topicId, open]) => {
      const topic = getTopic(topicId) as Topic;
      const marksLost = open.reduce((sum, mistake) => sum + mistake.marksLost, 0);
      const lastLostAt = open.map((m) => m.createdAt).sort().at(-1) ?? null;
      return {
        topicId,
        subjectId: topic.subjectId,
        title: topic.title,
        reason: starterReason(open, marksLost),
        openMistakes: open.length,
        marksLost,
        dominantCategory: dominantCategoryOf(open),
        lastLostAt,
      };
    })
    .sort((a, b) => {
      if (b.marksLost !== a.marksLost) return b.marksLost - a.marksLost;
      if (b.openMistakes !== a.openMistakes) return b.openMistakes - a.openMistakes;
      return (b.lastLostAt ?? "").localeCompare(a.lastLostAt ?? "");
    })
    .slice(0, limit);

  if (starters.length >= limit) return starters;

  // No unrecovered marks (or not enough yet): point at the start of the spec.
  for (const subjectId of input.subjectIds) {
    if (starters.length >= limit) break;
    const first = orderedTopics(subjectId)[0];
    if (!first || starters.some((starter) => starter.topicId === first.id)) continue;
    starters.push({
      topicId: first.id,
      subjectId,
      title: first.title,
      reason: "Nothing unrecovered here yet — start teaching from the spec",
      openMistakes: 0,
      marksLost: 0,
      dominantCategory: null,
      lastLostAt: null,
    });
  }
  return starters;
}

function dominantCategoryOf(open: readonly Mistake[]): Mistake["category"] | null {
  const counts = new Map<Mistake["category"], number>();
  for (const mistake of open) counts.set(mistake.category, (counts.get(mistake.category) ?? 0) + 1);
  const [dominant, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return count >= 2 ? dominant : null;
}

/** Topics of one subject in specification order. */
function orderedTopics(subjectId: Id): Topic[] {
  return [...topicsFor(subjectId)].sort((a, b) => a.order - b.order);
}

/** Where this topic sits in its specification, e.g. "Topic 4 of 18 · WJEC A Level Physics". */
export function curriculumPosition(topic: Topic): string {
  const list = orderedTopics(topic.subjectId);
  const index = list.findIndex((t) => t.id === topic.id);
  const label = subjectLabel(topic.subjectId);
  if (index < 0) return label;
  return `Topic ${index + 1} of ${list.length} · ${label}`;
}

/**
 * The learner brief that travels with every turn: where the student is, what
 * the evidence says about the topic, and the mark-scheme points they have
 * actually lost. The caller masks the points before they leave the device.
 */
export function buildTutorLearnerContext(input: {
  topic: Topic;
  mistakes: readonly Mistake[];
  mastery?: TopicMastery | null;
}): TutorLearnerContext {
  const { topic } = input;
  const open = input.mistakes
    .filter((mistake) => mistake.topicId === topic.id && !mistake.resolved)
    .sort((a, b) => b.marksLost - a.marksLost);

  const openMistakes: TutorMistakeContext[] = open.slice(0, 8).map((mistake) => ({
    point: mistake.point ?? mistake.description,
    category: mistake.category,
    marksLost: mistake.marksLost,
  }));

  return {
    position: [curriculumPosition(topic), topic.specRef ? `spec ${topic.specRef}` : null]
      .filter((part): part is string => part !== null)
      .join(" · "),
    masteryLine: masteryLine(input.mastery),
    openMistakes,
  };
}

function masteryLine(mastery: TopicMastery | null | undefined): string | undefined {
  if (!mastery || mastery.attempts === 0) return undefined;
  const parts = [
    `${Math.round(mastery.mastery * 100)}% mastery`,
    `${Math.round(mastery.accuracy * 100)}% accuracy across ${mastery.attempts} attempt${mastery.attempts === 1 ? "" : "s"}`,
  ];
  return parts.join(", ");
}
