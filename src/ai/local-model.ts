"use client";

// ---------------------------------------------------------------------------
// Local model fallback (WebLLM).
//
// When the cloud provider chain is unreachable (offline, 429s, dead 404s),
// low-stakes formative marks can still be graded *on-device*: a quantised
// small model runs in the browser's GPU via WebGPU. Zero network, zero
// marginal cost, and the grading envelope stays honest — the result is
// labelled `source: "ai"` with provider "webllm:<model>", never confused with
// a cloud grade.
//
// Opt-in and progressive: nothing downloads until the student enables it in
// Settings, the engine loads lazily, and every failure path (no WebGPU, out
// of memory, load interrupted) degrades to the existing rubric fallback.
// ---------------------------------------------------------------------------

import { extractJson } from "./json";
import type { Question } from "@/domain/types";

export const LOCAL_MODEL_ID = "Phi-3-mini-4k-instruct-q4f16_1-MLC";

export interface LocalModelStatus {
  /** WebGPU present in this browser. */
  webgpu: boolean;
  /** Model weights downloaded and engine ready. */
  loaded: boolean;
  /** A load is in progress (0-1) or done (1). */
  loadProgress: number;
}

let enginePromise: Promise<EngineLike | null> | null = null;
let loadProgress = 0;
let loadFailed = false;

interface EngineLike {
  chat: {
    completions: {
      create(opts: {
        messages: { role: string; content: string }[];
        temperature?: number;
        max_tokens?: number;
      }): Promise<{ choices: { message: { content: string } }[] }>;
    };
  };
  unload(): Promise<void>;
}

export function localModelStatus(): LocalModelStatus {
  return {
    webgpu: typeof navigator !== "undefined" && "gpu" in navigator,
    loaded: enginePromise !== null && !loadFailed,
    loadProgress,
  };
}

/**
 * Load the local model. Returns null when unavailable — callers treat that
 * as "no local model today" and keep the normal fallbacks.
 */
async function getEngine(): Promise<EngineLike | null> {
  if (loadFailed) return null;
  if (!localModelStatus().webgpu) return null;
  enginePromise ??= (async () => {
    try {
      const mlc = await import("@mlc-ai/web-llm");
      const engine = await mlc.CreateMLCEngine(LOCAL_MODEL_ID, {
        initProgressCallback: (report: { progress?: number }) => {
          loadProgress = typeof report.progress === "number" ? report.progress : 0;
        },
      });
      loadProgress = 1;
      return engine as unknown as EngineLike;
    } catch {
      loadFailed = true;
      return null;
    }
  })();
  return enginePromise;
}

/** Explicit preload (Settings "prepare offline model" button). */
export async function preloadLocalModel(): Promise<boolean> {
  return (await getEngine()) !== null;
}

export async function unloadLocalModel(): Promise<void> {
  const engine = await enginePromise;
  enginePromise = null;
  loadProgress = 0;
  try {
    await engine?.unload();
  } catch {
    /* already gone */
  }
}

/** Build the same grading contract the server prompt uses, in one message. */
function markingPrompt(question: Question, partId: string, answer: string): { system: string; user: string } {
  const part = question.parts.find((p) => p.id === partId);
  if (!part) throw new Error("unknown part");
  const system =
    "You are an exam marker. Grade the student's answer against the mark scheme. " +
    "Credit a mark-scheme point only if the answer contains it; reward correct alternative wording, never reward what is merely implied. " +
    'Reply with JSON only: {"awarded": number, "comment": string, "confidence": number}. ' +
    "confidence is 0-1 in the mark.";
  const user = [
    `Question: ${question.stem}`,
    `Part (${part.marks} marks): ${part.prompt}`,
    `Mark scheme: ${part.markScheme.map((s) => `• ${s}`).join(" ")}`,
    `Student answer: ${answer.trim() || "(no answer given)"}`,
  ].join("\n");
  return { system, user };
}

/** A confidence the local model reports for its own grade. */
export interface LocalMark {
  awarded: number;
  comment: string;
  confidence: number;
}

/**
 * Grade one part locally. Throws when the model is unavailable or replies
 * unparseably — the caller falls back to the rubric grader as usual.
 */
export async function localMarkPart(question: Question, partId: string, answer: string): Promise<LocalMark> {
  const engine = await getEngine();
  if (!engine) throw new Error("local model unavailable");
  const { system, user } = markingPrompt(question, partId, answer);
  const completion = await engine.chat.completions.create({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.2,
    max_tokens: 220,
  });
  const text = completion.choices[0]?.message?.content ?? "";
  const parsed = extractJson<{ awarded?: number; comment?: string; confidence?: number }>(text);
  if (!parsed || typeof parsed.awarded !== "number") throw new Error("local model reply unparseable");
  const max = question.parts.find((p) => p.id === partId)?.marks ?? 0;
  return {
    awarded: Math.max(0, Math.min(max, Math.round(parsed.awarded))),
    comment: parsed.comment ?? "Marked offline by the on-device model.",
    confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
  };
}
