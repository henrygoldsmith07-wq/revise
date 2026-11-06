import type { AoCode, Id } from "../types";
import type { TopicSpec, UnitSpec } from "./helpers";

// ---------------------------------------------------------------------------
// A board's own structure over the shared reference topics.
//
// The reference subjects build from four shared outlines adapted from WJEC A
// level. A board-structured subject keeps those topics (their ids carry every
// learner's cards, mastery and the questions written for them) but places
// them under the board's own sections, with the board's own titles and
// references, and adds topics for sections the outline never covered.
//
// Ids never move:
//   * a topic keeps `<subject>.<slug>` wherever it is placed;
//   * a statement keeps `<topic>.sp-NN` from its position in the outline, so
//     dropping an off-spec statement never renumbers the ones after it;
//   * statements a board adds are appended after the outline's.
// ---------------------------------------------------------------------------

export interface PlacedTopic {
  /** Slug of a topic in the shared outline or the science's extra topics. */
  topic: string;
  /** The board's own title for this topic, when it differs. */
  title?: string;
  /** The board's section reference(s), e.g. "3.1.2–3.1.4". */
  specRef: string;
  /**
   * Board reference for each outline statement, in order. A missing entry
   * uses `specRef`; `null` leaves out a statement this board's specification
   * does not contain.
   */
  pointRefs?: Array<string | null | undefined>;
  /** Statements this board adds to the topic, appended after the outline's. */
  addPoints?: Array<{ ref: string; text: string; aos?: AoCode[] }>;
}

export interface BoardUnit {
  slug: string;
  title: string;
  topics: PlacedTopic[];
}

export interface BoardOutlineOptions {
  subjectId: Id;
  /** When the structure was checked against the board's published specification. */
  lastChecked: string;
  specVersion: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The board's units over the shared topics. Throws on a slug that is in
 * neither pool or is placed twice: either is an authoring mistake that would
 * otherwise surface as a missing or duplicated topic.
 */
export function boardOutline(pool: ReadonlyArray<UnitSpec | TopicSpec>, units: BoardUnit[], options: BoardOutlineOptions): UnitSpec[] {
  const topics = new Map<string, TopicSpec>();
  for (const entry of pool) {
    for (const topic of "topics" in entry ? entry.topics : [entry]) topics.set(topic.slug, topic);
  }
  const placed = new Set<string>();
  return units.map((unit) => ({
    slug: unit.slug,
    title: unit.title,
    topics: unit.topics.map((placement) => {
      const source = topics.get(placement.topic);
      if (!source) throw new Error(`${options.subjectId}: no reference topic "${placement.topic}"`);
      if (placed.has(placement.topic)) throw new Error(`${options.subjectId}: "${placement.topic}" placed twice`);
      placed.add(placement.topic);
      const topicId = `${options.subjectId}.${source.slug}`;
      const outlinePoints = (source.specPoints ?? []).flatMap((point, index) => {
        const ref = placement.pointRefs?.[index];
        if (ref === null) return [];
        return [{ ...point, id: `${topicId}.sp-${pad(index + 1)}`, ref: ref ?? placement.specRef, specVersion: point.specVersion ?? options.specVersion }];
      });
      const firstAdded = (source.specPoints?.length ?? 0) + 1;
      const added = (placement.addPoints ?? []).map((point, index) => ({
        id: `${topicId}.sp-${pad(firstAdded + index)}`,
        ref: point.ref,
        text: point.text,
        aos: point.aos ?? (["AO1"] as AoCode[]),
        source: "authored" as const,
        verification: "unverified" as const,
        reviewer: null,
        lastChecked: options.lastChecked,
        specVersion: options.specVersion,
      }));
      return {
        ...source,
        specVersion: source.specVersion ?? options.specVersion,
        title: placement.title ?? source.title,
        specRef: placement.specRef,
        specPoints: [...outlinePoints, ...added],
      };
    }),
  }));
}

/** Slugs of every topic a board structure places, in order. */
export function placedTopicSlugs(units: BoardUnit[]): string[] {
  return units.flatMap((unit) => unit.topics.map((topic) => topic.topic));
}
