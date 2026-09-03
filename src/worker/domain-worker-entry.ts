// ---------------------------------------------------------------------------
// Worker entry: the API surface served by public/domain-worker.js.
//
// Bundled at prebuild time by scripts/build-domain-worker.mjs (esbuild) into a
// single classic-script IIFE with Comlink inlined. The main thread wraps it
// with Comlink.wrap in src/data/domain-engine.ts.
//
// Same functions, same parameters, same results as the main-thread fallback in
// domain-engine.ts — one source of truth, so worker and fallback can never
// diverge. If the worker is unavailable the client silently computes inline.
// ---------------------------------------------------------------------------

import * as Comlink from "comlink";
import { buildAssessmentInsight } from "@/domain/assessment";
import { calibrateDifficulty, traceQuestions } from "@/domain/knowledge-tracing";
import { validateFsrs } from "@/domain/fsrs-tuning";

const api = {
  assess: buildAssessmentInsight,
  trace: traceQuestions,
  validate: validateFsrs,
  calibrate: (input: { traces: Parameters<typeof calibrateDifficulty>[0] }) => calibrateDifficulty(input.traces),
};

export type DomainWorkerApi = typeof api;

// Default endpoint is the worker's own global scope.
Comlink.expose(api);
