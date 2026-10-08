import {
  applyHumanVerificationLedger,
  humanVerificationLedgerKey,
  parseHumanVerificationLedger,
  type HumanVerificationLedgerFile,
} from "@/domain/human-verification-ledger";
import type { Question } from "@/domain/types";
import { readReviseMeta, writeReviseMeta } from "./storage-namespace";

// ---------------------------------------------------------------------------
// Student side of the reviewer portal.
//
// The bundled bank already carries the committed human-verification ledger.
// Approvals made in the web portal reach students through /api/review-ledger
// (the committed ledger plus entries derived from the verified runtime audit
// chain). The last good copy is cached in IndexedDB so it works offline, and
// is applied on every snapshot load with the SAME applyHumanVerificationLedger
// the bundle uses, which re-checks the exact content fingerprint and the trust
// contract before any question becomes trusted. The applied result is never
// written back to the question rows, so a later change in the ledger is always
// re-derived rather than frozen into local data.
// ---------------------------------------------------------------------------

export const RUNTIME_REVIEW_LEDGER_PATH = "/api/review-ledger";

export async function readRuntimeReviewLedger(): Promise<HumanVerificationLedgerFile | null> {
  const stored = await readReviseMeta<unknown>("runtimeReviewLedger").catch(() => undefined);
  if (!stored) return null;
  const parsed = parseHumanVerificationLedger(stored);
  return parsed.issues.some((issue) => issue.blocking) ? null : parsed.file;
}

/** Apply runtime approvals to bank (seed) questions only; learner-authored questions are never touched. */
const isBankQuestion = (question: Question): boolean => (question as { userId?: unknown }).userId === undefined;

export function applyRuntimeReviewLedger(questions: Question[], ledger: HumanVerificationLedgerFile | null): Question[] {
  if (!ledger?.entries.length) return questions;
  const bank = questions.filter(isBankQuestion);
  const applied = applyHumanVerificationLedger(bank, ledger);
  if (!applied.appliedKeys.length) return questions;
  const byId = new Map(applied.questions.map((question) => [question.id, question] as const));
  return questions.map((question) => (isBankQuestion(question) ? byId.get(question.id) ?? question : question));
}

function ledgerSignature(file: HumanVerificationLedgerFile): string {
  return file.entries.map((entry) => `${humanVerificationLedgerKey(entry.questionId, entry.contentFingerprint)}@${entry.review.reviewedAt ?? ""}`).sort().join("|");
}

/**
 * Fetch the effective ledger and cache it. Returns true when it changed.
 * Never throws: offline, a 5xx or a malformed body keeps the last good copy.
 */
export async function refreshRuntimeReviewLedger(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(RUNTIME_REVIEW_LEDGER_PATH, { headers: { accept: "application/json" } });
    if (!response.ok) return false;
    const parsed = parseHumanVerificationLedger(await response.json());
    if (parsed.issues.some((issue) => issue.blocking)) return false;
    const previous = await readRuntimeReviewLedger();
    if (previous && ledgerSignature(previous) === ledgerSignature(parsed.file)) return false;
    await writeReviseMeta("runtimeReviewLedger", parsed.file);
    return true;
  } catch {
    return false;
  }
}
