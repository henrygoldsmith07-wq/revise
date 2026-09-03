"use client";

// ---------------------------------------------------------------------------
// Domain-engine facade: heavy computes off the React main thread.
//
// The heavy end of src/domain — assessment insight, question traces, FSRS
// validation, difficulty calibration — scales with the student's history and
// recomputes after every grade. Past a few thousand attempts those recomputes
// land on the render path and stutter the UI. This facade routes them to a
// Comlink RPC worker; the React thread receives pre-calculated snapshots.
//
// Two properties matter:
//
// 1. **Fallback is a first-class path.** The worker is created lazily on
//    first use; if construction fails (no worker support, CSP, odd browser),
//    every call transparently computes on the main thread instead. One code
//    path for correctness, one flag for observability.
// 2. **Every call is keyed and deduped.** A worker call is async, so two
//    renders can request the same compute before the first answers; the
//    second request joins the first's promise rather than duplicating work.
// ---------------------------------------------------------------------------

import * as Comlink from "comlink";
import type { AssessmentInsight, Attempt, Card, Id, Mistake, Question, ReviewLog, TopicMastery } from "@/domain/types";
import type { QuestionTrace, DifficultyCalibrationReport } from "@/domain/knowledge-tracing";
import { calibrateDifficulty, traceQuestions } from "@/domain/knowledge-tracing";
import type { FsrsValidation } from "@/domain/fsrs-tuning";
import { validateFsrs } from "@/domain/fsrs-tuning";
import { buildAssessmentInsight } from "@/domain/assessment";

export type { QuestionTrace, DifficultyCalibrationReport, FsrsValidation };

/** The compute surface the worker serves (and the fallback implements). */
export interface DomainEngineApi {
  assess(input: {
    attempts: Attempt[];
    mistakes: Mistake[];
    mastery: TopicMastery[];
    questionsById: Map<Id, Question>;
  }): AssessmentInsight;
  trace(input: { questions: Question[]; attemptsByQuestion: Map<Id, Attempt[]> }): QuestionTrace[];
  validate(input: { cards: Card[]; logs: ReviewLog[] }): FsrsValidation;
  calibrate(input: { traces: QuestionTrace[] }): DifficultyCalibrationReport;
}

/** Below this many attempts the compute runs synchronously — cheaper than an RPC round-trip. */
export const SYNC_COMPUTE_THRESHOLD = 500;

const impl: DomainEngineApi = {
  assess: buildAssessmentInsight,
  trace: traceQuestions,
  validate: validateFsrs,
  calibrate: (input) => calibrateDifficulty(input.traces),
};

let worker: Comlink.Remote<DomainEngineApi> | null = null;
let workerFailed = false;

function getWorker(): Comlink.Remote<DomainEngineApi> | null {
  if (workerFailed || typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = Comlink.wrap<DomainEngineApi>(new Worker("/domain-worker.js", { type: "classic" }));
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

/** Diagnostics for the settings panel: is the engine on-thread or off-thread? */
export function engineMode(): "worker" | "main-thread" {
  return getWorker() ? "worker" : "main-thread";
}

// One in-flight promise per keyed call, so concurrent renders share work.
const inflight = new Map<string, Promise<unknown>>();

async function viaEngine<K extends keyof DomainEngineApi>(
  key: K,
  size: number,
  args: Parameters<DomainEngineApi[K]>[0],
  fallback: () => ReturnType<DomainEngineApi[K]>,
): Promise<ReturnType<DomainEngineApi[K]>> {
  // Small histories: a synchronous call beats the RPC round-trip.
  if (size < SYNC_COMPUTE_THRESHOLD) return fallback() as ReturnType<DomainEngineApi[K]>;
  const w = getWorker();
  if (!w) return fallback() as ReturnType<DomainEngineApi[K]>;
  const dedupeKey = `${String(key)}:${JSON.stringify(stringifySafe(args))}`;
  const existing = inflight.get(dedupeKey);
  if (existing) return existing as ReturnType<DomainEngineApi[K]>;
  const p = (async () => {
    try {
      return (await (w[key] as (a: unknown) => Promise<unknown>)(args)) as ReturnType<DomainEngineApi[K]>;
    } catch {
      // Worker error (or structured-clone failure on a non-serialisable arg):
      // fall back to the main thread for this call and every later one.
      workerFailed = true;
      return fallback() as ReturnType<DomainEngineApi[K]>;
    } finally {
      inflight.delete(dedupeKey);
    }
  })();
  inflight.set(dedupeKey, p);
  return p;
}

function stringifySafe(value: unknown): unknown {
  try {
    return JSON.stringify(value, (_k, v) => (v instanceof Map ? { __map: [...v.entries()] } : v));
  } catch {
    return null; // unkeyable — no dedupe, still correct
  }
}

export const domainEngine = {
  assess: (input: { attempts: Attempt[]; mistakes: Mistake[]; mastery: TopicMastery[]; questionsById: Map<Id, Question> }) =>
    viaEngine("assess", input.attempts.length, input, () => impl.assess(input)),
  trace: (input: { questions: Question[]; attemptsByQuestion: Map<Id, Attempt[]> }) =>
    viaEngine("trace", [...input.attemptsByQuestion.values()].reduce((n, rows) => n + rows.length, 0), input, () => impl.trace(input)),
  validate: (input: { cards: Card[]; logs: ReviewLog[] }) =>
    viaEngine("validate", input.logs.length, input, () => impl.validate(input)),
  calibrate: (input: { traces: QuestionTrace[] }) =>
    viaEngine("calibrate", input.traces.length, input, () => impl.calibrate(input)),
};
