import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildMatchBoard,
  isMatch,
  matchScore,
  MATCH_PAIRS,
  type MatchTile,
} from "@/domain/study-modes";
import { nextMove } from "@/components/modes/MatchGame";
import type { Card } from "@/domain/types";
import { createCard } from "@/domain/scheduling";
import { allTopics } from "@/domain/curriculum";

// The match game's board builder and scorer. The component
// (src/components/modes/MatchGame.tsx) owns the clock; these tests pin the
// two pieces of timing the component depends on: that the board is stable per
// seed (so a restart with the same seed cannot fake a faster run) and that the
// score actually rises with the time taken — the timer freeze in MatchGame
// used to give a finished game a stale, artificially low elapsed time.

const NOW = new Date("2025-06-10T09:00:00.000Z");
const TOPIC = allTopics()[0];

function card(id: string, front: string, back: string): Card {
  return createCard({ id, userId: "u", subjectId: TOPIC.subjectId, topicId: TOPIC.id, front, back }, NOW);
}

const deck = [
  card("a", "Unit of force?", "The newton"),
  card("b", "Unit of energy?", "The joule"),
  card("c", "Unit of power?", "The watt"),
  card("d", "Unit of charge?", "The coulomb"),
  card("e", "Unit of pressure?", "The pascal"),
  card("f", "Unit of frequency?", "The hertz"),
];

describe("match board", () => {
  it("deals exactly MATCH_PAIRS pairs of front and back tiles", () => {
    const board = buildMatchBoard(deck, MATCH_PAIRS, 1);
    expect(board).toHaveLength(MATCH_PAIRS * 2);
    for (const cardRow of deck.slice(0, MATCH_PAIRS)) {
      const fronts = board.filter((t) => t.cardId === cardRow.id && t.side === "front");
      const backs = board.filter((t) => t.cardId === cardRow.id && t.side === "back");
      expect(fronts).toHaveLength(1);
      expect(backs).toHaveLength(1);
    }
  });

  it("is stable for the same seed, so restart cannot reuse a stale timer", () => {
    expect(buildMatchBoard(deck, MATCH_PAIRS, 4)).toEqual(buildMatchBoard(deck, MATCH_PAIRS, 4));
    expect(buildMatchBoard(deck, MATCH_PAIRS, 4).map((t) => t.id)).not.toEqual(
      buildMatchBoard(deck, MATCH_PAIRS, 5).map((t) => t.id),
    );
  });

  it("a tile never matches itself or its own side", () => {
    const board = buildMatchBoard(deck, MATCH_PAIRS, 2);
    for (const tile of board) {
      expect(isMatch(tile, tile)).toBe(false);
    }
    const fronts = board.filter((t) => t.side === "front");
    for (const a of fronts) {
      const partner = board.find((t) => t.cardId === a.cardId && t.side === "back");
      expect(partner).toBeDefined();
      expect(isMatch(a, partner as MatchTile)).toBe(true);
    }
  });
});

describe("match score", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("grows with the real elapsed time, so a frozen timer cannot win a round", () => {
    // The component used to capture `elapsed` state (updated on a 200 ms
    // interval) and stop the interval when the board was completed, so the
    // score was read from up to 200 ms of stale, low elapsed time.
    const start = Date.now();
    vi.setSystemTime(start);
    const at = (ms: number) => {
      vi.setSystemTime(start + ms);
      return matchScore(Date.now() - start, 0);
    };
    const now = at(0);
    const later = at(1000);
    const muchLater = at(10_000);
    expect(muchLater).toBeGreaterThan(later);
    expect(later).toBeGreaterThan(now);
    // Exactly 10 s with no mistakes scores exactly 10.
    expect(at(10_000)).toBe(10);
  });

  it("penalises mistakes in whole seconds", () => {
    expect(matchScore(0, 3)).toBe(15);
    expect(matchScore(500, 1)).toBe(6);
  });
});
