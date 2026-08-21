import { getSubject, getTopic } from "./curriculum";
import { isBuried, isDue, retrievability, todayIso } from "./scheduling";
import type { Card, Id, IsoDate } from "./types";

// ---------------------------------------------------------------------------
// The card browser's query engine.
//
// A search box that only does substring matching is useless once a deck passes
// a few hundred cards — the questions students actually have are "which cards
// have lapsed more than three times?" and "what have I tagged for the mocks
// but never seen?". So this parses a small Anki-flavoured query language:
//
//     tag:paper-1 is:due                  both must hold
//     prop:lapses>3 -is:suspended         numeric comparison, negation
//     "photoelectric effect" topic:quantum  quoted phrase, scoped field
//     is:new or tag:hard                  explicit disjunction
//
// Everything is a pure function over an array, so it runs offline against the
// IndexedDB mirror and needs no index maintenance.
// ---------------------------------------------------------------------------

export type Comparator = ">" | "<" | ">=" | "<=" | "=" | "!=";

export interface Term {
  negated: boolean;
  kind: "text" | "tag" | "topic" | "subject" | "kind" | "origin" | "flag" | "prop" | "added" | "due";
  value: string;
  /** prop: terms only. */
  property?: "lapses" | "reps" | "stability" | "difficulty" | "retention" | "ease";
  comparator?: Comparator;
  number?: number;
}

export interface ParsedQuery {
  /** OR groups of AND-ed terms. A bare query is one group. */
  groups: Term[][];
  /** Anything the parser could not make sense of, surfaced to the user. */
  warnings: string[];
}

const FLAGS = ["due", "new", "suspended", "buried", "learning", "review", "leech", "mistake", "untagged", "starred"] as const;
export type Flag = (typeof FLAGS)[number];

const PROPERTIES = ["lapses", "reps", "stability", "difficulty", "retention", "ease"] as const;

/** Split on whitespace but keep quoted phrases together. */
function tokenise(query: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of query) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && /\s/.test(char)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

export function parseQuery(query: string): ParsedQuery {
  const warnings: string[] = [];
  const groups: Term[][] = [[]];

  for (const raw of tokenise(query)) {
    if (raw.toLowerCase() === "or") {
      groups.push([]);
      continue;
    }
    if (raw.toLowerCase() === "and") continue; // implicit, accepted for readability

    const negated = raw.startsWith("-") || raw.startsWith("!");
    const body = negated ? raw.slice(1) : raw;
    if (!body) continue;

    const colon = body.indexOf(":");
    const group = groups[groups.length - 1];

    if (colon < 0) {
      group.push({ negated, kind: "text", value: body.toLowerCase() });
      continue;
    }

    const field = body.slice(0, colon).toLowerCase();
    const value = body.slice(colon + 1);

    switch (field) {
      case "tag":
        group.push({ negated, kind: "tag", value: value.toLowerCase() });
        break;
      case "topic":
        group.push({ negated, kind: "topic", value: value.toLowerCase() });
        break;
      case "subject":
      case "deck":
        group.push({ negated, kind: "subject", value: value.toLowerCase() });
        break;
      case "kind":
      case "type":
        group.push({ negated, kind: "kind", value: value.toLowerCase() });
        break;
      case "origin":
        group.push({ negated, kind: "origin", value: value.toLowerCase() });
        break;
      case "is": {
        const flag = value.toLowerCase();
        if (!(FLAGS as readonly string[]).includes(flag)) {
          warnings.push(`Unknown filter "is:${value}". Try: ${FLAGS.join(", ")}.`);
          break;
        }
        group.push({ negated, kind: "flag", value: flag });
        break;
      }
      case "added":
      case "due": {
        const days = Number(value.replace(/^[<>=]+/, ""));
        if (!Number.isFinite(days)) {
          warnings.push(`"${field}:${value}" needs a number of days, e.g. ${field}:7.`);
          break;
        }
        group.push({ negated, kind: field === "added" ? "added" : "due", value, number: days });
        break;
      }
      case "prop": {
        const match = value.match(/^([a-z]+)(>=|<=|!=|>|<|=)(-?\d+(?:\.\d+)?)$/i);
        if (!match) {
          warnings.push(`"prop:${value}" should look like prop:lapses>3.`);
          break;
        }
        const [, property, comparator, num] = match;
        if (!(PROPERTIES as readonly string[]).includes(property.toLowerCase())) {
          warnings.push(`Unknown property "${property}". Try: ${PROPERTIES.join(", ")}.`);
          break;
        }
        group.push({
          negated,
          kind: "prop",
          value,
          property: property.toLowerCase() as Term["property"],
          comparator: comparator as Comparator,
          number: Number(num),
        });
        break;
      }
      default:
        // An unrecognised prefix is far more likely to be a colon inside real
        // text than a typo'd field, so it searches rather than erroring.
        group.push({ negated, kind: "text", value: body.toLowerCase() });
    }
  }

  return { groups: groups.filter((g) => g.length > 0), warnings };
}

/**
 * FSRS has no "ease" the way SM-2 did, but students read difficulty as ease,
 * so the browser exposes an SM-2-shaped number derived from FSRS difficulty:
 * difficulty 1 → 3.4 (very easy), difficulty 10 → 1.3 (a leech).
 */
export function easeFactor(card: Card): number {
  const clamped = Math.min(10, Math.max(1, card.difficulty || 5));
  return Math.round((3.4 - ((clamped - 1) / 9) * 2.1) * 100) / 100;
}

function propertyValue(card: Card, property: NonNullable<Term["property"]>, now: Date): number {
  switch (property) {
    case "lapses":
      return card.lapses;
    case "reps":
      return card.reps;
    case "stability":
      return card.stability;
    case "difficulty":
      return card.difficulty;
    case "retention":
      return retrievability(card, now);
    case "ease":
      return easeFactor(card);
  }
}

function compare(left: number, comparator: Comparator, right: number): boolean {
  switch (comparator) {
    case ">":
      return left > right;
    case "<":
      return left < right;
    case ">=":
      return left >= right;
    case "<=":
      return left <= right;
    case "=":
      return Math.abs(left - right) < 1e-9;
    case "!=":
      return Math.abs(left - right) >= 1e-9;
  }
}

function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

function matchesFlag(card: Card, flag: string, today: IsoDate, now: Date): boolean {
  switch (flag as Flag) {
    case "due":
      return isDue(card, today);
    case "new":
      return card.reps === 0;
    case "suspended":
      return Boolean(card.suspended);
    case "buried":
      return isBuried(card, today);
    case "learning":
      return card.reps > 0 && card.stability < 7;
    case "review":
      return card.reps > 0 && card.stability >= 7;
    // A leech is a card that keeps being forgotten — the signal that it needs
    // rewriting rather than more repetitions.
    case "leech":
      return card.lapses >= 4;
    case "mistake":
      return card.kind === "mistake" || card.origin === "mistake";
    case "untagged":
      return card.tags.length === 0;
    case "starred":
      return card.tags.includes("starred");
    default:
      void now;
      return false;
  }
}

function matchesTerm(card: Card, term: Term, today: IsoDate, now: Date): boolean {
  let hit: boolean;
  switch (term.kind) {
    case "text": {
      const haystack = [
        card.front,
        card.back,
        card.note ?? "",
        card.tags.join(" "),
        getTopic(card.topicId)?.title ?? "",
      ]
        .join(" ")
        .toLowerCase();
      hit = haystack.includes(term.value);
      break;
    }
    case "tag":
      // Prefix match so `tag:paper` finds `paper-1` and `paper-2`.
      hit = card.tags.some((t) => t === term.value || t.startsWith(`${term.value}-`));
      break;
    case "topic": {
      const topic = getTopic(card.topicId);
      hit = Boolean(
        card.topicId.toLowerCase().includes(term.value) ||
          topic?.title.toLowerCase().includes(term.value),
      );
      break;
    }
    case "subject": {
      const subject = getSubject(card.subjectId);
      hit = Boolean(
        card.subjectId.toLowerCase().includes(term.value) ||
          subject?.name.toLowerCase().includes(term.value),
      );
      break;
    }
    case "kind":
      hit = card.kind === term.value;
      break;
    case "origin":
      hit = card.origin === term.value;
      break;
    case "flag":
      hit = matchesFlag(card, term.value, today, now);
      break;
    case "added":
      hit = daysBetween(card.createdAt.slice(0, 10), today) <= (term.number ?? 0);
      break;
    case "due":
      hit = daysBetween(today, card.due) <= (term.number ?? 0);
      break;
    case "prop":
      hit = compare(
        propertyValue(card, term.property!, now),
        term.comparator ?? "=",
        term.number ?? 0,
      );
      break;
    default:
      hit = false;
  }
  return term.negated ? !hit : hit;
}

export interface BrowseOptions {
  query?: string;
  /** Hard scope applied before the query, from the UI's filter controls. */
  subjectIds?: Id[];
  topicIds?: Id[];
  now?: Date;
}

export function browse(cards: Card[], options: BrowseOptions = {}): { cards: Card[]; warnings: string[] } {
  const now = options.now ?? new Date();
  const today = todayIso(now);
  const parsed = parseQuery(options.query ?? "");

  const scoped = cards.filter((card) => {
    if (options.subjectIds?.length && !options.subjectIds.includes(card.subjectId)) return false;
    if (options.topicIds?.length && !options.topicIds.includes(card.topicId)) return false;
    return true;
  });

  if (!parsed.groups.length) return { cards: scoped, warnings: parsed.warnings };

  const matched = scoped.filter((card) =>
    parsed.groups.some((group) => group.every((term) => matchesTerm(card, term, today, now))),
  );
  return { cards: matched, warnings: parsed.warnings };
}

export type SortKey = "due" | "added" | "lapses" | "reps" | "stability" | "difficulty" | "front" | "topic";

export function sortCards(cards: Card[], key: SortKey, direction: "asc" | "desc" = "asc"): Card[] {
  const sign = direction === "asc" ? 1 : -1;
  const value = (card: Card): string | number => {
    switch (key) {
      case "due":
        return card.due;
      case "added":
        return card.createdAt;
      case "lapses":
        return card.lapses;
      case "reps":
        return card.reps;
      case "stability":
        return card.stability;
      case "difficulty":
        return card.difficulty;
      case "front":
        return card.front.toLowerCase();
      case "topic":
        return getTopic(card.topicId)?.title.toLowerCase() ?? card.topicId;
    }
  };
  return [...cards].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left === right) return 0;
    return (left < right ? -1 : 1) * sign;
  });
}

/** Tag counts across a set of cards, most used first. */
export function tagCounts(cards: Card[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    for (const tag of card.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => (b.count === a.count ? a.tag.localeCompare(b.tag) : b.count - a.count));
}

/** Ready-made queries offered as chips, so the syntax is discoverable. */
export const SAVED_SEARCHES: { label: string; query: string; hint: string }[] = [
  { label: "Due now", query: "is:due", hint: "Everything the scheduler wants today" },
  { label: "Leeches", query: "is:leech", hint: "Forgotten four times or more — rewrite these" },
  { label: "From mistakes", query: "is:mistake", hint: "Cards minted from dropped marks" },
  { label: "Never seen", query: "is:new", hint: "No reviews yet" },
  { label: "Suspended", query: "is:suspended", hint: "Out of circulation" },
  { label: "Buried", query: "is:buried", hint: "Snoozed until tomorrow" },
  { label: "Untagged", query: "is:untagged", hint: "No tags yet" },
  { label: "Weak recall", query: "prop:retention<0.7 -is:new", hint: "Predicted recall under 70%" },
];
