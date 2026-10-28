// ---------------------------------------------------------------------------
// Where a student's school is decides their likely exam board, so onboarding
// can preselect it instead of asking. Schools in Wales sit WJEC A levels
// (Eduqas is WJEC's England brand); Northern Ireland's board is CCEA. England
// mixes AQA, Pearson Edexcel and OCR, so nothing is guessed there. An inferred
// board is always a suggestion the student can change.
// ---------------------------------------------------------------------------

import type { Id } from "./types";

export type SchoolRegion = "wales" | "england" | "northern-ireland" | "other";
export const SCHOOL_REGIONS: readonly SchoolRegion[] = ["wales", "england", "northern-ireland", "other"];
export const SCHOOL_REGION_LABEL: Record<SchoolRegion, string> = {
  wales: "Wales",
  england: "England",
  "northern-ireland": "Northern Ireland",
  other: "Other",
};

export function isSchoolRegion(value: unknown): value is SchoolRegion {
  return typeof value === "string" && (SCHOOL_REGIONS as readonly string[]).includes(value);
}

const REGION_BOARD: Partial<Record<SchoolRegion, Id>> = { wales: "wjec", "northern-ireland": "ccea" };

/** The board a region's schools use, when Revise offers it; null means "let the student pick". */
export function inferBoardForRegion(region: SchoolRegion | undefined, availableBoardIds: readonly Id[]): Id | null {
  const board = region ? REGION_BOARD[region] : undefined;
  return board && availableBoardIds.includes(board) ? board : null;
}

/** True when the region has a usual board that Revise does not offer yet (Northern Ireland without CCEA). */
export function regionBoardMissing(region: SchoolRegion | undefined, availableBoardIds: readonly Id[]): boolean {
  const board = region ? REGION_BOARD[region] : undefined;
  return Boolean(board && !availableBoardIds.includes(board));
}

/**
 * The board after the student picks a region. A board the student chose by
 * hand is kept; a board that was only inferred follows the new region (and is
 * cleared when the new region has none to infer).
 */
export function boardAfterRegionChange(input: {
  region: SchoolRegion;
  currentBoardId: Id | null;
  currentWasInferred: boolean;
  availableBoardIds: readonly Id[];
}): { boardId: Id | null; inferred: boolean } {
  const inferred = inferBoardForRegion(input.region, input.availableBoardIds);
  if (input.currentBoardId && !input.currentWasInferred) return { boardId: input.currentBoardId, inferred: false };
  return { boardId: inferred, inferred: inferred !== null };
}
