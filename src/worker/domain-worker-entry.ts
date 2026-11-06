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
import { loadAllSubjects } from "@/domain/curriculum";

// The worker has its own copy of the curriculum registry, and its results
// must match the main thread's for any subject, so it loads every subject's
// topic tree (bundled into this file) before answering.
const ready = loadAllSubjects();

const api = {
  assess: async (...args: Parameters<typeof buildAssessmentInsight>) => { await ready; return buildAssessmentInsight(...args); },
  trace: async (...args: Parameters<typeof traceQuestions>) => { await ready; return traceQuestions(...args); },
  validate: async (...args: Parameters<typeof validateFsrs>) => { await ready; return validateFsrs(...args); },
  calibrate: async (input: { traces: Parameters<typeof calibrateDifficulty>[0] }) => { await ready; return calibrateDifficulty(input.traces); },
};

export type DomainWorkerApi = typeof api;

// Default endpoint is the worker's own global scope.
Comlink.expose(api);
