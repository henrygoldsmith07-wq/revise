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
export function topicsForYear<T extends Pick<Topic, "specRef" | "subjectId">>(topics: readonly T[], year: YearGroup | undefined): T[] {
  if (year !== "year-12") return [...topics];
  const hasAs = new Set(topics.filter((t) => topicUnitNumber(t) !== null && !isA2Topic(t)).map((t) => t.subjectId));
  return topics.filter((t) => !(isA2Topic(t) && hasAs.has(t.subjectId)));
}
