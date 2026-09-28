// Spaced-repetition cards and review logs.
//
// Part of the domain model (see ./types.ts barrel). Split by bounded
// context for ownership; every name is re-exported from "@/domain/types".
import type { Id, IsoDate, IsoInstant } from "./types-base";
import type { VerificationStatus, ContentSource, LicensedSource } from "./types-curriculum";

// --- spaced repetition -----------------------------------------------------

export type CardKind = "basic" | "cloze" | "image" | "equation" | "mistake" | "audio";
export type RecallGrade = "again" | "hard" | "good" | "easy";

/**
 * Immutable FSRS snapshot taken just before the first Lamport-stamped grade
 * was appended to a card's op log. Together, `base` + `log` are a complete
 * description of the card's scheduling history: the FSRS fields are a pure
 * function of replaying the log from the base (see domain/sync-crdt.ts).
 * Written once, never mutated afterwards.
 */
export interface CardSyncBase {
  due: IsoDate;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: number;
}

/**
 * One grading event in a card's CRDT operation log. The pair
 * `(lamport, deviceId)` is a total order — the Lamport counter orders events
 * on one device, and the deviceId breaks ties across devices — so every
 * replica replays the same log into the same FSRS state.
 */
export interface CardGradeEvent {
  /** The grade applied, FSRS-style. */
  grade: RecallGrade;
  /** Wall-clock moment of the review (display + elapsed-day computation). */
  reviewedAt: IsoInstant;
  /** Minting device — part of the total order and of the event's identity. */
  deviceId: string;
  /** Minting device's Lamport counter — the other half of the total order. */
  lamport: number;
  /** Present only on the first event of a log: the pre-logging FSRS snapshot. */
  base?: CardSyncBase;
}

export interface Card {
  id: Id;
  userId: Id;
  subjectId: Id;
  topicId: Id;
  kind: CardKind;
  front: string;
  back: string;
  /** Cloze cards keep the un-blanked sentence so it can be re-rendered. */
  clozeSource?: string;
  /** Data URL or remote URL. Data URLs keep images working offline. */
  imageUrl?: string;
  /** Data URL for a recorded or uploaded clip. */
  audioUrl?: string;
  /** Free-form note shown under the answer; never tested. */
  note?: string;
  /** Lower-case, deduplicated. The browser filters on these. */
  tags: string[];
  /** Set when the card was minted from a specific mistake. */
  sourceMistakeId?: Id;
  origin: "seed" | "manual" | "ai" | "document" | "mistake" | "import";
  /** Which spec statements this card directly supports (stable specPoint ids). */
  specPointIds?: Id[];
  /** Provenance for audit: where the card's claim comes from. */
  source?: ContentSource;
  licensedSource?: LicensedSource | null;
  verification?: VerificationStatus;
  reviewer?: string | null;
  lastChecked?: IsoDate | null;
  specVersion?: string;
  /** Suspended cards never appear until explicitly unsuspended. */
  suspended?: boolean;
  /** Buried cards reappear on this date. Bury is a one-day snooze. */
  buriedUntil?: IsoDate;
  /**
   * CRDT operation log: every grade this card has ever received, Lamport-
   * stamped. This is the source of truth for the card's FSRS state across
   * devices — `syncCardState` replays it, so two devices that graded the same
   * card concurrently converge on one deterministic schedule instead of one
   * grade silently erasing the other. Optional: cards authored before the
   * sync upgrade have no log and fall back to last-write-wins until their
   * next review.
   */
  log?: CardGradeEvent[];
  // FSRS state
  due: IsoDate;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: number;
  lastReviewedAt: IsoInstant | null;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

export interface ReviewLog {
  id: Id;
  userId: Id;
  cardId: Id;
  topicId: Id;
  grade: RecallGrade;
  /** Self-reported before the answer is revealed; feeds weak-topic detection. */
  confidence?: 1 | 2 | 3 | 4 | 5;
  elapsedMs: number;
  reviewedAt: IsoInstant;
}
