import type { PastPaperIndex } from "@/domain/past-paper-coverage";
import wjecPhysics from "./wjec-alevel-physics.json";

// Question-level past-paper maps, one per subject that has one. Kept out of
// the main content bank so the Papers route can read it without building the
// authored question bank.

// JSON imports widen tuples and literals; tests/past-paper-coverage.test.ts checks the shape.
const INDEXES: PastPaperIndex[] = [wjecPhysics as unknown as PastPaperIndex];

export function pastPaperIndexFor(subjectId: string): PastPaperIndex | null {
  return INDEXES.find((index) => index.subjectId === subjectId) ?? null;
}

export function allPastPaperIndexes(): readonly PastPaperIndex[] {
  return INDEXES;
}
