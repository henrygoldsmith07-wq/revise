"use client";

// ---------------------------------------------------------------------------
// Marking orchestration with supply-chain resilience.
//
// Order of preference, cheapest and most honest first:
//
//   1. **Semantic cache** — an identical (or ≥0.95 cosine-similar) answer
//      already AI-graded on this device answers instantly, free, offline.
//   2. **Local model** — when the student opted into on-device grading and
//      the weights are loaded, WebLLM grades without touching the network.
//   3. **Cloud AI** — the /api/ai route with its provider rotation.
//   4. **Rubric fallback + DLQ** — the deterministic grader answers now and
//      the attempt is queued for an AI re-grade when the provider recovers.
//
// The envelope's `source` never lies: a cache hit reports which tier served
// it, a local mark reports the on-device model, a rubric grade reports
// "fallback" — and the DLQ quietly upgrades the stored attempt later.
// ---------------------------------------------------------------------------

import type { Question } from "@/domain/types";
import type { AiEnvelope, MarkResponse } from "./types";
import { lookupCachedMark, storeCachedMark } from "./semantic-cache";
import { localMarkPart } from "./local-model";

export type MarkTier = "cache" | "local" | "ai" | "fallback";

export interface ResilientMarkResult {
  envelope: AiEnvelope<MarkResponse>;
  /** Which tier of the resilience chain actually produced the grade. */
  tier: MarkTier;
}

/** Per-part grade produced by a non-cloud tier. */
interface PartOutcome {
  partId: string;
  marked: MarkResponse["marked"][number];
  confidence: number;
  via: "cache-exact" | "cache-semantic" | "local";
}

function partOutcomeToMarked(outcome: PartOutcome): MarkResponse["marked"][number] {
  return outcome.marked;
}

/**
 * Grade a question with the full resilience chain. Always resolves — every
 * failure ends in the rubric fallback, never a throw. DLQ enqueueing happens
 * in the caller (which owns the real, persisted attempt record).
 */
export async function resilientMark(
  question: Question,
  answers: Record<string, string>,
  fallback: (question: Question, answers: Record<string, string>) => MarkResponse,
  callServer: () => Promise<AiEnvelope<MarkResponse>>,
  opts?: { useLocalModel?: boolean },
): Promise<ResilientMarkResult> {
  const outcomes: PartOutcome[] = [];
  const remaining: Question["parts"] = [];

  // --- tier 1: per-part semantic cache --------------------------------------
  for (const part of question.parts) {
    const answer = answers[part.id] ?? "";
    const lookup = await lookupCachedMark(question.id, part.id, answer, part.markScheme);
    if (lookup.hit) {
      outcomes.push({
        partId: part.id,
        marked: lookup.hit.marked,
        confidence: lookup.hit.confidence,
        via: lookup.hit.via === "exact" ? "cache-exact" : "cache-semantic",
      });
    } else {
      remaining.push(part);
    }
  }

  // --- tier 2: local model for the parts the cache missed -------------------
  if (opts?.useLocalModel && remaining.length) {
    const localOutcomes = await Promise.all(
      remaining.map(async (part) => {
        const outcome = await tryLocalPart(question, part.id, answers[part.id] ?? "");
        return outcome ? { part, outcome } : null;
      }),
    );
    for (const entry of localOutcomes) {
      if (!entry) continue;
      outcomes.push(entry.outcome);
      const idx = remaining.indexOf(entry.part);
      if (idx >= 0) remaining.splice(idx, 1);
    }
    if (!remaining.length) {
      return { envelope: assembleAllLocal(question, outcomes), tier: "local" };
    }
  }

  // --- everything answered locally: no network at all ------------------------
  if (!remaining.length && outcomes.length > 0) {
    return { envelope: assembleAllCached(question, outcomes), tier: "cache" };
  }

  // --- tier 3: cloud AI ------------------------------------------------------
  // The server prompt grades the *whole* question, so the call always goes
  // out when any part is un-answered; cache hits are preserved for their
  // parts if the cloud path fails.
  const serverEnvelope = await callServer();
  if (serverEnvelope.source === "ai") {
    // Persist grades in the cache so the next identical answer skips the
    // network entirely. Embeddings attach when the embedder is available.
    for (const part of question.parts) {
      const markedPart = serverEnvelope.data.marked.find((m) => m.partId === part.id);
      if (!markedPart) continue;
      await storeCachedMark(
        question.id,
        part,
        answers[part.id] ?? "",
        markedPart,
        typeof serverEnvelope.data.confidence === "number" ? serverEnvelope.data.confidence : 0.5,
        null, // embedding attached lazily by storeCachedMark's caller when cheap
      );
    }
    return { envelope: serverEnvelope, tier: "ai" };
  }

  // --- tier 4: rubric fallback, but cache/local wins still apply -------------
  const merged = mergeOutcomes(serverEnvelope.data, outcomes);
  return { envelope: { ...serverEnvelope, data: merged }, tier: "fallback" };
}

/**
 * Replace fallback-graded parts with cache/local outcomes where available,
 * keeping the server's rubric grades for the rest.
 */
function mergeOutcomes(fallbackMark: MarkResponse, outcomes: PartOutcome[]): MarkResponse {
  if (!outcomes.length) return fallbackMark;
  const byPart = new Map(outcomes.map((o) => [o.partId, o]));
  const marked = fallbackMark.marked.map((m) => {
    const outcome = byPart.get(m.partId);
    // A cache/local grade carries the honest per-part shape already.
    return outcome ? { ...partOutcomeToMarked(outcome), partId: m.partId } : m;
  });
  return { ...fallbackMark, marked };
}

/** Fold per-part cache outcomes into one honest envelope (all parts cached). */
function assembleAllCached(question: Question, outcomes: PartOutcome[]): AiEnvelope<MarkResponse> {
  const marked = question.parts.map((part) => {
    const outcome = outcomes.find((o) => o.partId === part.id);
    return outcome ? outcome.marked : { partId: part.id, awarded: 0, max: part.marks, creditedPoints: [], missedPoints: part.markScheme, comment: "ungraded" };
  });
  const via = outcomes.map((o) => o.via);
  const label = via.every((v) => v === "cache-exact") ? "exact cache" : "semantic cache";
  const confidence = outcomes.reduce((a, o) => a + o.confidence, 0) / Math.max(1, outcomes.length);
  return {
    data: { marked, feedback: `Graded from ${label} — identical answers previously marked by AI.`, confidence },
    source: "fallback",
    provider: "semantic-cache",
    note: `Served locally (${label}); no network call was made.`,
  };
}

/** Fold per-part local-model outcomes into one honest envelope. */
function assembleAllLocal(question: Question, outcomes: PartOutcome[]): AiEnvelope<MarkResponse> {
  const marked = question.parts.map((part) => {
    const outcome = outcomes.find((o) => o.partId === part.id);
    return outcome ? outcome.marked : { partId: part.id, awarded: 0, max: part.marks, creditedPoints: [], missedPoints: part.markScheme, comment: "ungraded" };
  });
  const confidence = outcomes.reduce((a, o) => a + o.confidence, 0) / Math.max(1, outcomes.length);
  return {
    data: { marked, feedback: "Marked on-device while the AI service is unavailable.", confidence },
    source: "fallback",
    provider: "webllm",
    note: "Graded by the on-device model; no network call was made.",
  };
}

/** Grade one part with the local model, tolerating its absence. */
export async function tryLocalPart(
  question: Question,
  partId: string,
  answer: string,
): Promise<PartOutcome | null> {
  try {
    const mark = await localMarkPart(question, partId, answer);
    const part = question.parts.find((p) => p.id === partId);
    if (!part) return null;
    return {
      partId,
      marked: {
        partId,
        awarded: mark.awarded,
        max: part.marks,
        creditedPoints: [],
        missedPoints: part.markScheme,
        comment: mark.comment,
      },
      confidence: mark.confidence,
      via: "local",
    };
  } catch {
    return null;
  }
}
