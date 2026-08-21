import { browse } from "./browser";
import { shuffleWithSeed } from "./shuffle";
import { isAvailable, isDue, todayIso } from "./scheduling";
import type { Card, CustomStudySpec } from "./types";

// ---------------------------------------------------------------------------
// Custom study: a session the student builds themselves, outside what the
// scheduler would have chosen.
//
// The important rule is that a custom session must never corrupt the schedule.
// Studying ahead is legitimate the night before an exam, but grading a card
// early would shorten every future interval on it. So `ahead` sessions are
// marked preview-only, and the review screen grades nothing in that mode — it
// is cramming, honestly labelled, with the FSRS state left alone.
// ---------------------------------------------------------------------------

export const DEFAULT_CUSTOM_STUDY: CustomStudySpec = {
  query: "",
  pool: "due",
  limit: 30,
  order: "due",
};

export interface CustomStudyResult {
  cards: Card[];
  /** How many matched before the limit was applied. */
  available: number;
  warnings: string[];
  /** True when the session includes cards that are not actually due. */
  isPreview: boolean;
  /** One sentence describing what the session will contain. */
  description: string;
}

function inPool(card: Card, pool: CustomStudySpec["pool"], today: string): boolean {
  switch (pool) {
    case "due":
      return isDue(card, today);
    case "new":
      return card.reps === 0 && isAvailable(card, today);
    case "lapsed":
      return card.lapses > 0 && isAvailable(card, today);
    case "suspended":
      return Boolean(card.suspended);
    case "all":
      return true;
  }
}

export function buildCustomStudy(
  cards: Card[],
  spec: CustomStudySpec,
  now: Date = new Date(),
  seed = Math.floor(now.getTime() / 86_400_000),
): CustomStudyResult {
  const today = todayIso(now);

  const { cards: matched, warnings } = browse(cards, {
    query: spec.query,
    subjectIds: spec.subjectIds,
    topicIds: spec.topicIds,
    now,
  });

  let pool = matched.filter((card) => inPool(card, spec.pool, today));
  if (spec.tags?.length) {
    pool = pool.filter((card) => spec.tags!.some((tag) => card.tags.includes(tag)));
  }

  const ordered = orderCards(pool, spec.order, seed);
  const limited = ordered.slice(0, Math.max(1, spec.limit));
  const isPreview = limited.some((card) => !isDue(card, today));

  return {
    cards: limited,
    available: pool.length,
    warnings,
    isPreview,
    description: describe(spec, pool.length, limited.length, isPreview),
  };
}

export function orderCards(cards: Card[], order: CustomStudySpec["order"], seed: number): Card[] {
  switch (order) {
    case "random":
      return shuffleWithSeed(cards, seed);
    case "difficulty":
      return [...cards].sort((a, b) => b.difficulty - a.difficulty);
    case "lapses":
      return [...cards].sort((a, b) => b.lapses - a.lapses);
    case "added":
      return [...cards].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "due":
    default:
      return [...cards].sort((a, b) => a.due.localeCompare(b.due));
  }
}

const POOL_LABEL: Record<CustomStudySpec["pool"], string> = {
  due: "cards due today",
  new: "cards you have never seen",
  lapsed: "cards you have forgotten before",
  suspended: "suspended cards",
  all: "cards",
};

function describe(spec: CustomStudySpec, available: number, taken: number, isPreview: boolean): string {
  if (available === 0) return `Nothing matches — no ${POOL_LABEL[spec.pool]} fit that filter.`;
  const scope = spec.query.trim() ? ` matching "${spec.query.trim()}"` : "";
  const capped = taken < available ? ` (${available} available, capped at ${taken})` : "";
  const warning = isPreview
    ? " Some are not due yet, so this runs as a preview and will not change their scheduling."
    : "";
  return `${taken} ${POOL_LABEL[spec.pool]}${scope}${capped}.${warning}`;
}

/** One-tap presets for the situations students actually face. */
export const CUSTOM_STUDY_PRESETS: { label: string; hint: string; spec: CustomStudySpec }[] = [
  {
    label: "Cram before an exam",
    hint: "Everything in scope, most difficult first — a preview that leaves scheduling alone",
    spec: { query: "", pool: "all", limit: 60, order: "difficulty", ahead: true },
  },
  {
    label: "Repair leeches",
    hint: "Only the cards you keep forgetting",
    spec: { query: "is:leech", pool: "all", limit: 20, order: "lapses" },
  },
  {
    label: "Learn new material",
    hint: "Cards you have never seen, oldest first",
    spec: { query: "", pool: "new", limit: 20, order: "added" },
  },
  {
    label: "Repair mistakes",
    hint: "Cards minted from marks you dropped",
    spec: { query: "is:mistake", pool: "all", limit: 20, order: "lapses" },
  },
  {
    label: "Random mixed drill",
    hint: "A shuffled set across every topic in scope",
    spec: { query: "", pool: "all", limit: 30, order: "random", ahead: true },
  },
];
