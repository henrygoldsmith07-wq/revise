// ---------------------------------------------------------------------------
// Year 12 / Year 13 awareness. A Year 12 WJEC student sits the AS units (1 and
// 2) first, so quick checks, recommendations and the plan must not lead with
// A2-only content (Units 3 and 4). The choice is optional and local: unknown
// keeps every topic, exactly as before.
// ---------------------------------------------------------------------------

import type { Topic } from "./types";

export type YearGroup = "year-12" | "year-13";
export const YEAR_GROUPS: readonly YearGroup[] = ["year-12", "year-13"];
export const YEAR_GROUP_LABEL: Record<YearGroup, string> = { "year-12": "Year 12", "year-13": "Year 13" };

export function isYearGroup(value: unknown): value is YearGroup {
  return value === "year-12" || value === "year-13";
}

/** The spec unit number from a topic's specRef ("Unit 2.4" -> 2), or null when the spec does not number units. */
export function topicUnitNumber(topic: Pick<Topic, "specRef">): number | null {
  const match = /^Unit\s+(\d+)/i.exec(topic.specRef ?? "");
  return match ? Number(match[1]) : null;
}

/** True for A2-only topics (Unit 3 or above). Topics with no unit number are never treated as A2. */
export function isA2Topic(topic: Pick<Topic, "specRef">): boolean {
  const unit = topicUnitNumber(topic);
  return unit !== null && unit >= 3;
}

/**
 * Topics the learner should be offered now. Year 12 drops A2-only topics, but
 * only in a subject that still has AS topics left, so a subject whose spec
 * has no numbered units never goes empty. Year 13 and unknown keep everything.
 */
export function topicsForYear<T extends Pick<Topic, "specRef" | "subjectId">>(
  topics: readonly T[],
  year: YearGroup | undefined,
  unit4Option?: Unit4Option,
): T[] {
  if (year !== "year-12") return unit4Option && year === "year-13" ? topicsForUnit4Option(topics, unit4Option) : [...topics];
  const hasAs = new Set(topics.filter((t) => topicUnitNumber(t) !== null && !isA2Topic(t)).map((t) => t.subjectId));
  return topics.filter((t) => !(isA2Topic(t) && hasAs.has(t.subjectId)));
}

/** The one Unit 4 option a Year 13 student studies (WJEC options are lettered A-D). */
export type Unit4Option = "A" | "B" | "C" | "D";
export const UNIT4_OPTIONS: readonly Unit4Option[] = ["A", "B", "C", "D"];

export function isUnit4Option(value: unknown): value is Unit4Option {
  return typeof value === "string" && (UNIT4_OPTIONS as readonly string[]).includes(value);
}

/** The option letter from a specRef like "Unit 4 Option B(a)", or null for any other topic. */
export function topicUnit4Option(topic: Pick<Topic, "specRef">): Unit4Option | null {
  const match = /^Unit\s+4\s+Option\s+([A-D])\b/i.exec(topic.specRef ?? "");
  return match ? (match[1].toUpperCase() as Unit4Option) : null;
}

/**
 * Keeps only the chosen Unit 4 option's topics. A subject that does not offer
 * the chosen letter keeps all its options, so a choice never empties a subject.
 */
export function topicsForUnit4Option<T extends Pick<Topic, "specRef" | "subjectId">>(topics: readonly T[], option: Unit4Option | undefined): T[] {
  if (!option) return [...topics];
  const offers = new Set(topics.filter((t) => topicUnit4Option(t) === option).map((t) => t.subjectId));
  return topics.filter((t) => {
    const own = topicUnit4Option(t);
    return own === null || own === option || !offers.has(t.subjectId);
  });
}
