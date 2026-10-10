// ---------------------------------------------------------------------------
// Approval throughput: how many review-gated questions became approved
// (two independent reviewers on the current content) in the last 7 and 30
// days. Measurement only: nothing here records, changes or relaxes a decision.
//
// The committed ledger (wjec-human-verification.json) only learns about
// reviewer-portal approvals after a developer runs `wjec:review:pull`, so a
// figure read from it alone stays at 0 however many teachers click Approve.
// When the runtime log (public.review_audit_events) is reachable, the figure
// is derived from it with the same functions the portal and the student
// ledger feed use: combineAuditLog verifies the chain, effectiveLedger adds
// promotableLedgerEntries onto the committed ledger, and a chain that fails
// verification contributes nothing (fail closed). With no runtime, the
// committed ledger is used exactly as before.
//
// Deliberately NOT `server-only`: plain-node scripts and tests import it, and
// it never opens a connection itself (the caller passes a query function).
// ---------------------------------------------------------------------------

import { physicsContentFingerprint } from "@/domain/content-trust";
import { humanVerificationLedgerKey, type HumanVerificationLedgerFile } from "@/domain/human-verification-ledger";
import type { Id, Question } from "@/domain/types";
import {
  combineAuditLog,
  effectiveLedger,
  readRuntimeEventPages,
  REVIEW_AUDIT_EVENT_COLUMNS,
  type RuntimeEventRow,
} from "./runtime-ledger";

const DAY_MS = 86_400_000;

export interface ApprovalThroughput {
  approved7d: number;
  approved30d: number;
}

export type ApprovalThroughputSource =
  | { kind: "runtime"; runtimeEvents: number }
  | { kind: "committed"; reason: "runtime-not-configured" | "runtime-unavailable" | "runtime-chain-failed"; issues?: string[] };

export interface ApprovalThroughputReport {
  bySubject: Record<Id, ApprovalThroughput>;
  source: ApprovalThroughputSource;
}

/**
 * Count approved questions per subject by review time. Without a ledger this
 * reads `question.humanVerification` (the committed ledger as applied to the
 * bank). With a ledger, an approved entry for the question's CURRENT content
 * fingerprint supplies the review time; stale-content entries never count.
 */
export function approvalThroughputBySubject(
  questions: readonly Question[],
  subjectIds: readonly Id[],
  nowMs: number,
  ledger?: HumanVerificationLedgerFile,
): Record<Id, ApprovalThroughput> {
  const approvedAt = new Map<string, string>();
  for (const entry of ledger?.entries ?? []) {
    if (entry.review.status === "approved") approvedAt.set(humanVerificationLedgerKey(entry.questionId, entry.contentFingerprint), entry.review.reviewedAt ?? "");
  }
  const reviewedAtOf = (question: Question): string | undefined => {
    if (ledger) {
      const fromLedger = approvedAt.get(humanVerificationLedgerKey(question.id, physicsContentFingerprint(question)));
      if (fromLedger !== undefined) return fromLedger;
    }
    return question.humanVerification?.status === "approved" ? question.humanVerification.reviewedAt : undefined;
  };
  return Object.fromEntries(subjectIds.map((subjectId) => {
    const times = questions
      .filter((question) => question.subjectId === subjectId)
      .map((question) => Date.parse(reviewedAtOf(question) ?? ""))
      .filter((at) => Number.isFinite(at));
    const recent = (days: number) => times.filter((at) => at >= nowMs - days * DAY_MS).length;
    return [subjectId, { approved7d: recent(7), approved30d: recent(30) }];
  }));
}

/**
 * Throughput from the runtime log when rows were read (`rows !== null`),
 * otherwise from the committed ledger. `unavailableReason` says why rows are
 * null, so the report can state its source honestly.
 */
export function approvalThroughputReport(input: {
  questions: readonly Question[];
  subjectIds: readonly Id[];
  nowMs: number;
  committedAuditLog: unknown;
  committedLedger: unknown;
  rows: readonly RuntimeEventRow[] | null;
  unavailableReason?: "runtime-not-configured" | "runtime-unavailable";
}): ApprovalThroughputReport {
  const { questions, subjectIds, nowMs } = input;
  if (input.rows === null) {
    return {
      bySubject: approvalThroughputBySubject(questions, subjectIds, nowMs),
      source: { kind: "committed", reason: input.unavailableReason ?? "runtime-not-configured" },
    };
  }
  const combined = combineAuditLog(input.committedAuditLog, input.rows);
  if (combined.issues.length) {
    return {
      bySubject: approvalThroughputBySubject(questions, subjectIds, nowMs),
      source: { kind: "committed", reason: "runtime-chain-failed", issues: combined.issues },
    };
  }
  const ledger = effectiveLedger(questions, input.committedLedger, combined);
  return {
    bySubject: approvalThroughputBySubject(questions, subjectIds, nowMs, ledger),
    source: { kind: "runtime", runtimeEvents: combined.runtimeOnly },
  };
}

/** Minimal Postgres client surface (`pg.Client#query`, PGlite#query). */
export type PostgresQuery = (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>;

const RELATION = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/;

/**
 * Read runtime events over a direct Postgres connection with the same columns,
 * order and paging as the portal's Supabase read. Read-only. `relation` is a
 * code constant (tests point it at a scratch copy), never user input.
 */
export async function loadRuntimeRowsFromPostgres(query: PostgresQuery, relation = "public.review_audit_events"): Promise<RuntimeEventRow[]> {
  if (!RELATION.test(relation)) throw new Error(`invalid relation name: ${relation}`);
  const sql = `select ${REVIEW_AUDIT_EVENT_COLUMNS.join(", ")} from ${relation} order by seq asc limit $1 offset $2`;
  return readRuntimeEventPages(async (from, to) => {
    const result = await query(sql, [to - from + 1, from]);
    return result.rows.map((raw) => {
      const row = raw as { seq: number | string; previous_hash: string; hash: string; event: unknown };
      return {
        seq: Number(row.seq),
        previous_hash: row.previous_hash,
        hash: row.hash,
        event: typeof row.event === "string" ? JSON.parse(row.event) : row.event,
      };
    });
  });
}
