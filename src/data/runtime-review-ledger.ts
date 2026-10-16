import {
  applyHumanVerificationLedger,
  parseHumanVerificationLedger,
  type HumanVerificationLedgerFile,
} from "@/domain/human-verification-ledger";
import { canonicalJson } from "@/domain/content-fingerprint";
import type { HumanVerificationRecord, Question } from "@/domain/types";
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

// Runtime attestations are overlays, not a new baseline. Keep their provenance
// outside the plain-data question so withdrawals also work on an in-memory
// snapshot. Keying the review record handles shallow question copies/edits too.
const runtimeBaselines = new WeakMap<HumanVerificationRecord, Question>();
const runtimeReviewFields = ["humanVerification", "verification", "reviewer", "lastChecked"] as const;

function withoutRuntimeApproval(question: Question): Question {
  const baseline = question.humanVerification && runtimeBaselines.get(question.humanVerification);
  if (!baseline) return question;
  const restored = { ...question };
  for (const field of runtimeReviewFields) {
    delete restored[field];
    if (Object.prototype.hasOwnProperty.call(baseline, field)) {
      Object.assign(restored, { [field]: baseline[field] });
    }
  }
  return restored;
}

export function applyRuntimeReviewLedger(questions: Question[], ledger: HumanVerificationLedgerFile | null): Question[] {
  const baseline = questions.map((question) => isBankQuestion(question) ? withoutRuntimeApproval(question) : question);
  if (!ledger?.entries.length) return baseline;
  const bank = baseline.filter(isBankQuestion);
  const applied = applyHumanVerificationLedger(bank, ledger);
  applied.questions.forEach((question, index) => {
    const original = bank[index]!;
    if (question !== original && question.humanVerification) {
      runtimeBaselines.set(question.humanVerification, original);
    }
  });
  const byId = new Map(applied.questions.map((question) => [question.id, question] as const));
  return baseline.map((question) => (isBankQuestion(question) ? byId.get(question.id) ?? question : question));
}

function ledgerSignature(file: HumanVerificationLedgerFile): string {
  // All approval metadata affects trust, not just fingerprint/date. Normalise
  // entry/key order without discarding status, checks, identity or notes.
  return canonicalJson(file.entries.map((entry) => canonicalJson(entry)).sort());
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
