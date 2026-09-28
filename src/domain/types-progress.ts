// Gamification, custom study, decks and lesson progress.
//
// Part of the domain model (see ./types.ts barrel). Split by bounded
// context for ownership; every name is re-exported from "@/domain/types".
import type { Id, IsoDate, IsoInstant } from "./types-base";
import type { CardKind } from "./types-cards";

export interface StreakState {
  userId: Id;
  current: number;
  longest: number;
  lastActiveDate: IsoDate | null;
  xp: number;
  /** Ids of unlocked achievements. */
  achievements: Id[];
}

export interface Achievement {
  id: Id;
  name: string;
  description: string;
  /** Evaluated against the aggregate stats; pure so it is trivially testable. */
  test: (stats: GamificationStats) => boolean;
}

export interface GamificationStats {
  reviews: number;
  attempts: number;
  marksEarned: number;
  papers: number;
  streak: number;
  masteredTopics: number;
  perfectSessions: number;
}

// --- custom study ----------------------------------------------------------

/** What goes into a hand-built session, as chosen in the custom-study dialog. */
export interface CustomStudySpec {
  /** Browser query string; empty means "everything in scope". */
  query: string;
  subjectIds?: Id[];
  topicIds?: Id[];
  tags?: string[];
  /** Which pool to draw from before the query narrows it further. */
  pool: "due" | "new" | "lapsed" | "suspended" | "all";
  limit: number;
  order: "due" | "random" | "difficulty" | "lapses" | "added";
  /** Custom sessions can preview ahead of schedule without rescheduling. */
  ahead?: boolean;
}

// --- deck import/export ----------------------------------------------------

export interface DeckExportCard {
  front: string;
  back: string;
  kind: CardKind;
  tags: string[];
  note?: string;
  imageUrl?: string;
  audioUrl?: string;
  clozeSource?: string;
  topicId?: Id;
  subjectId?: Id;
  /** Present in a full export, absent in a shared deck. */
  scheduling?: {
    due: IsoDate;
    stability: number;
    difficulty: number;
    reps: number;
    lapses: number;
    state: number;
    lastReviewedAt: IsoInstant | null;
  };
}

export interface DeckExport {
  /** Bumped when the shape changes; importers refuse what they cannot read. */
  formatVersion: 1;
  name: string;
  description?: string;
  exportedAt: IsoInstant;
  /** Set when the deck came from this app rather than a third party. */
  source?: string;
  subjectId?: Id;
  cards: DeckExportCard[];
}

// --- lesson progress (synced, like settings/streak) -------------------------

/**
 * Which lessons the student finished and their lesson streak. One row per
 * user so it syncs across devices. Merged as a grow-only set (OR-set CRDT):
 * completion events from any device are unioned by lesson id, and the streak
 * is a pure fold over per-day completion records — so completing different
 * lessons on different devices both survive, and a week-long offline run on
 * one device cannot erase daily progress made on another.
 */
export interface LessonProgress {
  userId: Id;
  /** lesson id -> true once that lesson has been completed. */
  completed: Record<string, boolean>;
  /** Consecutive days with at least one finished lesson (local-time days). */
  streak: { count: number; lastDay: string };
  /** lesson id -> the local day (YYYY-MM-DD) it was first completed on. */
  completedOn?: Record<string, string>;
  updatedAt: IsoInstant;
}
