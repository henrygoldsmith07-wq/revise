import { describe, expect, it } from "vitest";
import { applyHumanVerificationLedger } from "@/domain/human-verification-ledger";
import { physicsContentFingerprint, REQUIRED_HUMAN_CHECKS, trustedAssessmentContent } from "@/domain/content-trust";
import { appendReviewDecisions, auditLogIssues, emptyAuditLog, GENESIS_HASH, type ReviewAuditEvent, type ReviewAuditLog } from "@/domain/review-workflow";
import {
  buildReviewQueue, combineAuditLog, effectiveLedger, prepareDecision, reviewDecisionRequestSchema,
  type ReviewerGrant, type RuntimeEventRow,
} from "@/lib/reviewer/runtime-ledger";
import { decision, NOW, PROMPTS, wq } from "./helpers-review";

// The portal must use the SAME chain as the committed audit log: runtime rows
// continue it, are verified by the domain's auditLogIssues, and verified
// chains become ledger entries through promotableLedgerEntries only.

const q1 = wq("q1", "algebra", PROMPTS[0]!);
const q2 = wq("q2", "algebra", PROMPTS[1]!);
const bank = [q1, q2];
const at = NOW.getTime();
const allChecks = Object.fromEntries(REQUIRED_HUMAN_CHECKS.map((c) => [c, true])) as Record<(typeof REQUIRED_HUMAN_CHECKS)[number], boolean>;

const grant = (label: string): ReviewerGrant => ({ userId: `00000000-0000-4000-8000-${label.padStart(12, "0").slice(-12)}`, reviewerLabel: label, role: "teacher", qualification: "PGCE Mathematics" });
const toRow = (event: ReviewAuditEvent): RuntimeEventRow => ({ seq: event.seq, previous_hash: event.previousHash, hash: event.hash, event });

function request(questionId = q1.id, over: Partial<ReturnType<typeof reviewDecisionRequestSchema.parse>> = {}) {
  return reviewDecisionRequestSchema.parse({
    questionId, contentFingerprint: physicsContentFingerprint(bank.find((q) => q.id === questionId)!), decision: "approve", checks: allChecks, comments: "", ...over,
  });
}

/** Record through prepareDecision, as the route does, returning the stored rows. */
function record(committed: ReviewAuditLog, rows: RuntimeEventRow[], label: string, req = request()): RuntimeEventRow[] {
  const prepared = prepareDecision(combineAuditLog(committed, rows), req, bank, grant(label), at);
  if (!prepared.ok) throw new Error(JSON.stringify(prepared.problems));
  expect(prepared.row.reviewer_id).toBe(label);
  return [...rows, toRow(prepared.event)];
}

describe("runtime continuation of the review audit log", () => {
  it("continues the committed chain from its tail hash", () => {
    const committed = appendReviewDecisions(emptyAuditLog(), [decision(q2, "cli-reviewer")], bank, at).log;
    const rows = record(committed, [], "teacher-a");
    expect(rows[0]!.seq).toBe(2);
    expect(rows[0]!.previous_hash).toBe(committed.events[0]!.hash);
    const combined = combineAuditLog(committed, rows);
    expect(combined.issues).toEqual([]);
    expect(combined.runtimeOnly).toBe(1);
    expect(auditLogIssues(combined.log)).toEqual([]);
  });

  it("starts from genesis on an empty committed log", () => {
    const rows = record(emptyAuditLog(), [], "teacher-a");
    expect(rows[0]).toMatchObject({ seq: 1, previous_hash: GENESIS_HASH });
  });

  it("takes reviewer identity, role, qualification and time from the grant, never the request", () => {
    expect(reviewDecisionRequestSchema.safeParse({ ...request(), reviewerId: "someone-else" }).success).toBe(false);
    expect(reviewDecisionRequestSchema.safeParse({ ...request(), reviewedAt: "2020-01-01T00:00:00Z" }).success).toBe(false);
    const prepared = prepareDecision(combineAuditLog(emptyAuditLog(), []), request(), bank, grant("teacher-a"), at);
    expect(prepared.ok && prepared.event).toMatchObject({ reviewerId: "teacher-a", reviewerRole: "teacher", reviewerQualification: "PGCE Mathematics", reviewedAt: new Date(at).toISOString() });
  });

  it("enforces the domain's rules: six checks, a comment to request changes, no double approval, fresh fingerprint", () => {
    const empty = combineAuditLog(emptyAuditLog(), []);
    const problems = (req: ReturnType<typeof request>, log = empty, who = "teacher-a") => {
      const out = prepareDecision(log, req, bank, grant(who), at);
      return out.ok ? [] : out.problems.map((p) => p.detail);
    };
    expect(problems(request(q1.id, { checks: { ...allChecks, marking: false } })).join()).toMatch(/six checks/);
    expect(problems(request(q1.id, { decision: "revise", comments: " " })).join()).toMatch(/comment/);
    expect(problems(request(q1.id, { contentFingerprint: "wjec-review-v3:sha256:stale" })).join()).toMatch(/stale fingerprint/);
    const once = combineAuditLog(emptyAuditLog(), record(emptyAuditLog(), [], "teacher-a"));
    expect(problems(request(), once, "teacher-a").join()).toMatch(/different reviewer/);
  });

  it("detects tampering, forks and disagreement with exported history", () => {
    const rows = record(emptyAuditLog(), record(emptyAuditLog(), [], "teacher-a"), "teacher-b");
    const edited = rows.map((row, i) => i === 0 ? { ...row, event: { ...(row.event as ReviewAuditEvent), comments: "edited later" } } : row);
    expect(combineAuditLog(emptyAuditLog(), edited).issues.join()).toMatch(/edited/);
    const dropped = [rows[1]!];
    expect(combineAuditLog(emptyAuditLog(), dropped).issues.join()).toMatch(/out of order|chain is broken/);
    const mismatched = [{ ...rows[0]!, hash: rows[1]!.hash }];
    expect(combineAuditLog(emptyAuditLog(), mismatched).issues.join()).toMatch(/do not match/);
    // After export, the committed log holds both events; the runtime copies must match it.
    const exported = combineAuditLog(emptyAuditLog(), rows).log;
    expect(combineAuditLog(exported, rows)).toMatchObject({ issues: [], runtimeOnly: 0 });
    const other = record(emptyAuditLog(), [], "teacher-c");
    expect(combineAuditLog(exported, other).issues.join()).toMatch(/differs from the committed event/);
  });

  it("makes a question trusted for students only after two different teachers approve it in the portal", () => {
    const committedLedger = { formatVersion: 1, entries: [] };
    const afterOne = record(emptyAuditLog(), [], "teacher-a");
    expect(effectiveLedger(bank, committedLedger, combineAuditLog(emptyAuditLog(), afterOne)).entries).toEqual([]);
    const afterTwo = record(emptyAuditLog(), afterOne, "teacher-b");
    const ledger = effectiveLedger(bank, committedLedger, combineAuditLog(emptyAuditLog(), afterTwo));
    expect(ledger.entries.map((e) => e.questionId)).toEqual([q1.id]);
    // The student device applies it with the existing ledger function.
    const applied = applyHumanVerificationLedger(bank, ledger);
    expect(applied.issues.filter((i) => i.blocking)).toEqual([]);
    expect(trustedAssessmentContent(applied.questions.find((q) => q.id === q1.id)!)).toBe(true);
    expect(trustedAssessmentContent(applied.questions.find((q) => q.id === q2.id)!)).toBe(false);
  });

  it("fails closed to the committed ledger when the runtime chain does not verify", () => {
    const rows = record(emptyAuditLog(), record(emptyAuditLog(), [], "teacher-a"), "teacher-b");
    const broken = rows.map((row, i) => i === 1 ? { ...row, event: { ...(row.event as ReviewAuditEvent), reviewerId: "teacher-z" } } : row);
    const combined = combineAuditLog(emptyAuditLog(), broken);
    expect(combined.issues.length).toBeGreaterThan(0);
    expect(effectiveLedger(bank, { formatVersion: 1, entries: [] }, combined).entries).toEqual([]);
    expect(prepareDecision(combined, request(q2.id), bank, grant("teacher-c"), at).ok).toBe(false);
  });
});

describe("review queue", () => {
  it("puts one-approval-from-verified first, parks requested changes and my own approvals", () => {
    let rows = record(emptyAuditLog(), [], "teacher-a", request(q2.id));
    rows = record(emptyAuditLog(), rows, "teacher-b", request(q1.id, { decision: "revise", comments: "Mark scheme point 2 is ambiguous." }));
    const log = combineAuditLog(emptyAuditLog(), rows).log;
    const forC = buildReviewQueue(bank, log, "teacher-c");
    expect(forC.ready.map((i) => i.questionId)).toEqual([q2.id]);
    expect(forC.ready[0]).toMatchObject({ stage: "checked", approvalsNeeded: 1 });
    expect(forC.changesRequested.map((i) => i.questionId)).toEqual([q1.id]);
    expect(forC.changesRequested[0]!.openComment).toMatch(/ambiguous/);
    const forA = buildReviewQueue(bank, log, "teacher-a");
    expect(forA.awaitingOtherReviewer.map((i) => i.questionId)).toEqual([q2.id]);
    expect(forA.ready).toEqual([]);
  });
});
