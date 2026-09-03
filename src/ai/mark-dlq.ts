"use client";

// ---------------------------------------------------------------------------
// Dead-letter queue for AI marks that never reached the model.
//
// When the marking call fails (offline, 429 rate limit, 5xx, provider down),
// the attempt is not lost — it is graded by the deterministic rubric fallback
// and *queued here* for an AI re-grade. A drain pass retries with exponential
// backoff and full jitter so a class-full of clients does not stampede the
// free-tier endpoint the moment it recovers.
//
// When the retry succeeds, the stored attempt is upgraded in place: marked
// parts, feedback, confidence and escalation state are recomputed from the AI
// grade, and the app is told via a DOM event so any open view re-renders. The
// student sees the rubric mark immediately; the AI mark replaces it later.
// ---------------------------------------------------------------------------

import type { Attempt, Question } from "@/domain/types";
import { getDb } from "@/data/db";
import type { AiDlqItem } from "@/data/db";
import { saveAttempt } from "@/data/repository";
import { markResponseSchema } from "./types";
import type { MarkResponse } from "./types";
import { withMarkEvidence } from "@/domain/marking";
import { assessLowConfidenceMark, createMarkEscalationRecord } from "@/domain/mark-escalation";

/** First retry after ~30s; each failure multiplies the delay, capped at 24h. */
export const DLQ_BASE_DELAY_MS = 30_000;
export const DLQ_MAX_DELAY_MS = 24 * 60 * 60 * 1000;
export const DLQ_MAX_ATTEMPTS = 12;
/** Per-drain-pass cap so a big backlog cannot hog the tab. */
export const DLQ_BATCH = 3;

/** Event fired on this page when a queued mark is successfully re-graded. */
export const AI_DLQ_RESOLVED_EVENT = "revise:ai-dlq-resolved";

export interface AiDlqResolvedDetail {
  attemptId: string;
  questionId: string;
  /** The upgraded attempt, so an open result view can re-render from it. */
  attempt: Attempt;
}

/**
 * Exponential backoff with full jitter (AWS "Exponential Backoff and Jitter"
 * style): delay = random(0, min(cap, base * 2^attempts)). Full jitter spreads
 * retries across the whole window instead of thundering-herd on the boundary.
 */
export function dlqBackoffMs(attempts: number, random: () => number = Math.random): number {
  const cap = Math.min(DLQ_MAX_DELAY_MS, DLQ_BASE_DELAY_MS * 2 ** attempts);
  return Math.floor(random() * cap);
}

export function dlqNextAttemptAt(attempts: number, now: Date = new Date(), random: () => number = Math.random): string {
  return new Date(now.getTime() + dlqBackoffMs(attempts, random)).toISOString();
}

/** Enqueue an attempt for AI re-grading. Best-effort: never throws. */
export async function enqueueDeadMark(input: {
  attempt: Attempt;
  question: Question;
  reason: string;
}): Promise<void> {
  try {
    const db = await getDb();
    const item: AiDlqItem = {
      id: crypto.randomUUID(),
      attemptId: input.attempt.id,
      question: input.question,
      answers: input.attempt.answers,
      reason: input.reason,
      queuedAt: new Date().toISOString(),
      attempts: 0,
      nextAttemptAt: new Date().toISOString(), // first drain pass may try immediately
      lastError: input.reason,
    };
    await db.put("aiDlq", item);
  } catch {
    // The queue is a resilience enhancement; losing one enqueue must never
    // break the marking flow that already served the student a grade.
  }
}

/** Due items, oldest next-attempt first, capped per pass. */
export async function dueDeadMarks(now: Date = new Date()): Promise<AiDlqItem[]> {
  const db = await getDb();
  const all = await db.getAll("aiDlq");
  const cutoff = now.toISOString();
  return all
    .filter((i) => i.nextAttemptAt <= cutoff)
    .sort((a, b) => a.nextAttemptAt.localeCompare(b.nextAttemptAt))
    .slice(0, DLQ_BATCH);
}

export async function dlqSize(): Promise<number> {
  const db = await getDb();
  return db.count("aiDlq");
}

async function reschedule(item: AiDlqItem, error: string): Promise<void> {
  const db = await getDb();
  const attempts = item.attempts + 1;
  if (attempts >= DLQ_MAX_ATTEMPTS) {
    await db.delete("aiDlq", item.id); // retired; the rubric mark stands
    return;
  }
  const updated: AiDlqItem = {
    ...item,
    attempts,
    nextAttemptAt: dlqNextAttemptAt(attempts),
    lastError: error.slice(0, 200),
  };
  await db.put("aiDlq", updated);
}

/**
 * One drain pass: try up to DLQ_BATCH due items against the server AI route.
 * Returns how many were successfully re-graded.
 */
export async function drainDeadMarks(fetchFn: typeof fetch = fetch): Promise<number> {
  const due = await dueDeadMarks();
  let resolved = 0;
  for (const item of due) {
    try {
      const res = await fetchFn("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: "mark", payload: { question: item.question, answers: item.answers } }),
      });
      if (res.status === 429 || res.status >= 500) {
        await reschedule(item, `HTTP ${res.status}`);
        continue;
      }
      if (!res.ok) {
        // 4xx other than 429: the payload is the problem — retrying is futile.
        await dbRemove(item.id);
        continue;
      }
      const body = (await res.json()) as { data?: unknown; source?: unknown };
      if (body?.source !== "ai" || !body.data) {
        // The route answered but the model still did not grade (fallback
        // envelope). Backoff and try again later.
        await reschedule(item, "provider still unavailable");
        continue;
      }
      const applied = await applyResolvedMark(item, body.data);
      if (applied) {
        resolved++;
        await dbRemove(item.id);
      } else {
        // The attempt row is gone (cleared device, sync conflict) — retire.
        await dbRemove(item.id);
      }
    } catch (error) {
      await reschedule(item, error instanceof Error ? error.message : "drain failed");
    }
  }
  return resolved;
}

async function dbRemove(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("aiDlq", id);
}

/**
 * Upgrade the stored attempt with the AI grade: recompute markedBy,
 * confidence and the escalation record so the review queue sees the AI mark,
 * then notify the UI via AI_DLQ_RESOLVED_EVENT. Returns false when the
 * attempt no longer exists (device cleared, sync conflict) — the caller
 * retires the queue item.
 */
async function applyResolvedMark(item: AiDlqItem, data: unknown): Promise<boolean> {
  const parsed = markResponseSchema.safeParse(data);
  if (!parsed.success) return false;
  const mark: MarkResponse = withMarkEvidence(item.question, item.answers, parsed.data);

  const db = await getDb();
  const attempt = (await db.get("attempts", item.attemptId)) as Attempt | undefined;
  if (!attempt) return false;

  // Guard against a stale retry racing a *newer* local edit: never downgrade
  // a grade that already carries an AI mark, and never overwrite an attempt
  // the student has resubmitted or edited since it was queued.
  if (attempt.markedBy === "ai" || attempt.createdAt > item.queuedAt) return false;

  // Recompute confidence/escalation exactly as the live marking path would:
  // an AI grade that clears the confidence threshold closes the pending
  // escalation; an still-shaky one re-requests review with fresh evidence.
  const confidence = typeof mark.confidence === "number" ? mark.confidence : null;
  const decision = assessLowConfidenceMark({ markedBy: "ai", confidence });
  const escalation = createMarkEscalationRecord(decision, new Date().toISOString());

  const upgraded: Attempt = {
    ...attempt,
    marked: mark.marked,
    feedback: mark.feedback,
    awarded: mark.marked.reduce((a, m) => a + m.awarded, 0),
    max: mark.marked.reduce((a, m) => a + m.max, 0),
    markedBy: "ai",
    markConfidence: confidence ?? undefined,
    markEscalation: escalation,
  };
  // Save through the repository (not raw IDB) so the upgrade enters the sync
  // outbox and the AI mark reaches the student's other devices too.
  await saveAttempt(upgraded);

  // Notify the app so any open view re-renders with the upgraded mark.
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<AiDlqResolvedDetail>(AI_DLQ_RESOLVED_EVENT, {
        detail: { attemptId: item.attemptId, questionId: item.question.id, attempt: upgraded },
      }),
    );
  }
  return true;
}
