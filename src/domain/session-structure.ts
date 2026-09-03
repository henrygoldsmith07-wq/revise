// ---------------------------------------------------------------------------
// Session structure builder — turns a single recommendation into a
// multi-phase session plan with timed segments matched to the student's
// mastery level. A weak topic gets scaffolding (explanation → easy →
// application); a strong-but-stale topic gets retrieval and transfer only.
//
// Pure domain: no React, no storage, no network.
// ---------------------------------------------------------------------------

import type { Id } from "./types";

export interface SessionSegment {
  /** Minutes allocated to this segment. */
  minutes: number;
  kind: "warmup" | "explanation" | "easy-retrieval" | "targeted-questions" | "application" | "transfer" | "mistake-repair" | "delayed-retrieval";
  label: string;
}

export interface SessionStructure {
  topicId: Id;
  totalMinutes: number;
  segments: SessionSegment[];
  /** "scaffolded" for weak topics, "retrieval" for strong-but-stale, "balanced" otherwise. */
  shape: "scaffolded" | "retrieval" | "balanced";
}

/**
 * Build a structured session from a recommendation's context.
 *
 * Mastery drives the shape:
 *   < 0.35   scaffolded — explanation first, easy questions, build up
 *   0.35–0.7 balanced — targeted questions, some application
 *   > 0.7    retrieval — hard retrieval + transfer, skip basics
 */
/** The shape a topic's mastery earns — exposed so session UIs can label blocks. */
export function shapeForMastery(mastery: number | null): SessionStructure["shape"] {
  const m = mastery ?? 0;
  if (m < 0.35) return "scaffolded";
  if (m >= 0.7) return "retrieval";
  return "balanced";
}

export function buildSessionStructure(input: {
  topicId: Id;
  mastery: number | null;
  totalMinutes: number;
  hasMistakes?: boolean;
}): SessionStructure {  const { topicId, mastery, totalMinutes } = input;
  const m = mastery ?? 0;
  const segments: SessionSegment[] = [];

  if (m < 0.35) {
    // Scaffolded: explanation → easy retrieval → application → exam question.
    const warmup = clamp(Math.round(totalMinutes * 0.15), 1, 4);
    const explain = clamp(Math.round(totalMinutes * 0.25), 2, Math.max(2, totalMinutes - warmup - 2));
    const easy = clamp(Math.round(totalMinutes * 0.25), 2, Math.max(1, totalMinutes - warmup - explain - 2));
    const app = Math.max(2, totalMinutes - warmup - explain - easy);
    if (input.hasMistakes) {
      segments.push({ minutes: warmup, kind: "mistake-repair", label: "Fix last mistakes" });
    }
    segments.push(
      { minutes: explain, kind: "explanation", label: "Read the explanation" },
      { minutes: easy, kind: "easy-retrieval", label: "Easy retrieval questions" },
      { minutes: app, kind: "application", label: "Application questions" },
    );
    // Clamp so the sum never exceeds the budget.
    const sum1 = segments.reduce((a, sg) => a + sg.minutes, 0);
    if (sum1 > totalMinutes) {
      const last = segments[segments.length - 1];
      last.minutes = Math.max(1, last.minutes - (sum1 - totalMinutes));
    }
    return { topicId, totalMinutes, segments, shape: "scaffolded" };
  }

  if (m >= 0.7) {
    // Retrieval: warm-up → transfer question → done.
    const warm = clamp(Math.round(totalMinutes * 0.3), 2, Math.max(2, totalMinutes - 3));
    const transfer = Math.max(3, totalMinutes - warm);
    segments.push(
      { minutes: warm, kind: "warmup", label: "Quick retrieval warm-up" },
      { minutes: transfer, kind: "transfer", label: "Transfer / exam-level question" },
    );
    // Optional delayed-retrieval closer if there's room (subtract from transfer).
    if (totalMinutes >= 12) {
      const close = clamp(Math.round(totalMinutes * 0.15), 1, 3);
      const lastTransfer = segments[segments.length - 1];
      lastTransfer.minutes = Math.max(3, lastTransfer.minutes - close);
      segments.push({ minutes: close, kind: "delayed-retrieval", label: "Delayed retrieval check" });
    }
    return { topicId, totalMinutes, segments, shape: "retrieval" };
  }

  // Balanced: targeted questions → mistake repair → delayed retrieval.
  const target = clamp(Math.round(totalMinutes * 0.5), 3, totalMinutes - 3);
  const repair = input.hasMistakes ? clamp(Math.round(totalMinutes * 0.25), 2, Math.max(1, totalMinutes - target)) : 0;
  const delayed = Math.max(2, totalMinutes - target - repair);
  segments.push({ minutes: target, kind: "targeted-questions", label: "Targeted questions" });
  if (repair > 0) segments.push({ minutes: repair, kind: "mistake-repair", label: "Repair mistakes" });
  segments.push({ minutes: delayed, kind: "delayed-retrieval", label: "Delayed retrieval" });

  const balSum = segments.reduce((a, sg) => a + sg.minutes, 0);
  if (balSum > totalMinutes) {
    const last = segments[segments.length - 1];
    last.minutes = Math.max(1, last.minutes - (balSum - totalMinutes));
  }
  return { topicId, totalMinutes, segments, shape: "balanced" };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
