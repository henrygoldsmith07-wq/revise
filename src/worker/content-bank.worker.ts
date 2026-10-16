// ---------------------------------------------------------------------------
// Content-bank worker (nineteenth pass, 2026-10-13).
//
// Building the authored question bank (`@/content`: ~4k questions, every
// authoring helper, the human-verification ledger and the release set) is
// ~1 s of main-thread JavaScript on a normal phone CPU and ~3.6 s at 4×
// throttling. Since the seventeenth pass it ran right after onboarding
// painted, so the first taps on a fresh profile, and every returning visit,
// waited for it.
//
// This worker builds the bank off the main thread and posts the finished,
// plain-data questions back once. Structured clone preserves them exactly
// (tests/content-bank-worker.test.ts round-trips the whole bank), and
// receiving them costs the main thread a deserialisation, not the build.
// src/data/authored-questions.ts owns the worker and falls back to importing
// the bank on the main thread if the worker cannot start or fails.
//
// Bundled by Next (Turbopack) from `new Worker(new URL(...))`, so the script is
// a content-hashed /_next/static chunk: it always matches the page's own
// build, and the service worker caches it like any other script.
// ---------------------------------------------------------------------------

import { seedQuestions } from "@/content";
import type { ContentBankWorkerMessage } from "@/data/content-bank-protocol";

const scope = self as unknown as { postMessage(message: ContentBankWorkerMessage): void };

try {
  scope.postMessage({ type: "bank", questions: seedQuestions });
} catch (error) {
  scope.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
}
