import { describe, expect, it } from "vitest";
import { applyHumanVerificationLedger } from "@/domain/human-verification-ledger";
import { physicsContentFingerprint, trustedAssessmentContent } from "@/domain/content-trust";
import { approvableByReview, blockingGates, gateContextFromTopics, questionGateIssues } from "@/domain/review-gates";
import {
  appendReviewDecisions, auditLogIssues, emptyAuditLog, parseReviewReturn, promotableLedgerEntries, promotionGateIssues, reviewReturnTemplate, reviewStateOf,
  REQUIRED_INDEPENDENT_APPROVALS,
} from "@/domain/review-workflow";
import { decision, gateFor, NOW, PROMPTS, topic, verifyThroughWorkflow, wq } from "./helpers-review";

const T = topic("algebra");
const gate = gateFor([T]);
const q1 = wq("q1", "algebra", PROMPTS[0]!);
const at = NOW.getTime();

describe("review workflow stages", () => {
  it("moves unverified → checked → verified only with two different reviewers on the same content", () => {
    expect(reviewStateOf(q1, []).stage).toBe("unverified");
    const first = appendReviewDecisions(emptyAuditLog(), [decision(q1, "reviewer-a")], [q1], at);
    expect(first.problems).toEqual([]);
    expect(reviewStateOf(q1, first.log.events)).toMatchObject({ stage: "checked", approvalsNeeded: REQUIRED_INDEPENDENT_APPROVALS - 1 });
    const second = appendReviewDecisions(first.log, [decision(q1, "reviewer-b")], [q1], at);
    expect(reviewStateOf(q1, second.log.events).stage).toBe("verified");
  });

  it("refuses a second approval from the same reviewer", () => {
    const first = appendReviewDecisions(emptyAuditLog(), [decision(q1, "reviewer-a")], [q1], at);
    const again = appendReviewDecisions(first.log, [decision(q1, "reviewer-a")], [q1], at);
    expect(again.accepted).toBe(0);
    expect(again.problems[0]?.detail).toMatch(/different reviewer/);
    expect(again.log).toBe(first.log);
  });

  it("rejects incomplete reviewer metadata, incomplete checks and comment-free rejections", () => {
    const bad = (over: Parameters<typeof decision>[2]) => appendReviewDecisions(emptyAuditLog(), [decision(q1, "r", over)], [q1], at).problems.map((p) => p.detail).join(";");
    expect(bad({ reviewerId: "" })).toMatch(/missing reviewer id/);
    expect(bad({ reviewerQualification: " " })).toMatch(/qualification/);
    expect(bad({ reviewedAt: "yesterday" })).toMatch(/review date/);
    expect(bad({ reviewedAt: "2999-01-01T00:00:00Z" })).toMatch(/review date/);
    expect(bad({ checks: { question: true, marking: false, workedSolution: true, capabilityMapping: true, specificationMapping: true, examRealism: true } })).toMatch(/six checks/);
    expect(bad({ decision: "reject" })).toMatch(/needs a comment/);
    expect(bad({ decision: "revise", comments: "Mark 2 is ambiguous" })).toBe("");
  });

  it("a revision request resets earlier approvals and keeps the comment", () => {
    let log = appendReviewDecisions(emptyAuditLog(), [decision(q1, "reviewer-a")], [q1], at).log;
    log = appendReviewDecisions(log, [decision(q1, "reviewer-b", { decision: "revise", comments: "Mark scheme omits the sign check." })], [q1], at).log;
    expect(reviewStateOf(q1, log.events)).toMatchObject({ stage: "unverified", lastDecision: "revise", openComment: "Mark scheme omits the sign check." });
  });

  it("invalidates review when question or marking content changes", () => {
    const { questions, log } = verifyThroughWorkflow([q1], ["q1"]);
    expect(trustedAssessmentContent(questions[0]!)).toBe(true);
    const edited = { ...q1, parts: [{ ...q1.parts[0]!, markScheme: ["Changed point 1", "Changed point 2"] }] };
    expect(physicsContentFingerprint(edited)).not.toBe(physicsContentFingerprint(q1));
    expect(reviewStateOf(edited, log.events)).toMatchObject({ stage: "unverified", needsReReview: true });
    expect(promotableLedgerEntries([edited], log)).toEqual([]);
    const stale = applyHumanVerificationLedger([edited], { formatVersion: 1, entries: promotableLedgerEntries([q1], log) });
    expect(trustedAssessmentContent(stale.questions[0]!)).toBe(false);
    expect(appendReviewDecisions(log, [decision(q1, "reviewer-c")], [edited], at).problems[0]?.detail).toMatch(/stale fingerprint/);
  });

  it("refuses a transfer or data classification the question does not actually have", () => {
    const plain = appendReviewDecisions(emptyAuditLog(), [decision(q1, "a", { classification: { transferConfirmed: true } })], [q1], at);
    expect(plain.problems[0]?.detail).toMatch(/no structural transfer link/);
    const data = appendReviewDecisions(emptyAuditLog(), [decision(q1, "a", { classification: { dataAnalysisConfirmed: true } })], [q1], at);
    expect(data.problems[0]?.detail).toMatch(/no authored data representation/);
    const real = wq("q-transfer", "algebra", PROMPTS[1]!, { flavour: "transfer" });
    expect(appendReviewDecisions(emptyAuditLog(), [decision(real, "a", { classification: { transferConfirmed: true } })], [real], at).problems).toEqual([]);
  });
});

describe("audit log integrity", () => {
  it("detects edited or removed history", () => {
    const { log } = verifyThroughWorkflow([q1], ["q1"]);
    expect(auditLogIssues(log)).toEqual([]);
    const edited = structuredClone(log);
    edited.events[0]!.reviewerId = "someone-else";
    expect(auditLogIssues(edited).join(";")).toMatch(/does not match its hash/);
    const removed = structuredClone(log);
    removed.events.shift();
    expect(auditLogIssues(removed).join(";")).toMatch(/chain is broken|out of order/);
  });
});

describe("promotion gate", () => {
  it("fails a ledger approval or trusted question that has no verified chain", () => {
    const { log } = verifyThroughWorkflow([q1], ["q1"]);
    const entries = promotableLedgerEntries([q1], log);
    expect(promotionGateIssues([q1], log, entries, trustedAssessmentContent).issues).toEqual([]);
    const oneApproval = appendReviewDecisions(emptyAuditLog(), [decision(q1, "reviewer-a")], [q1], at).log;
    expect(promotionGateIssues([q1], oneApproval, entries, trustedAssessmentContent).issues.join(";")).toMatch(/no verified audit chain/);
    const smuggled = applyHumanVerificationLedger([q1], { formatVersion: 1, entries }).questions;
    expect(promotionGateIssues(smuggled, emptyAuditLog(), [], trustedAssessmentContent).issues.join(";")).toMatch(/trusted at runtime without a verified audit chain/);
  });
});

describe("external review files", () => {
  it("round-trips: blank rows are skipped, filled rows validated", () => {
    const template = reviewReturnTemplate("pack-1", [q1]);
    expect(template.decisions[0]).toMatchObject({ questionId: "q1", contentFingerprint: physicsContentFingerprint(q1), reviewerId: "" });
    expect(parseReviewReturn(JSON.stringify(template))).toMatchObject({ decisions: [], skipped: 1, errors: [] });
    const filled = { ...template, decisions: [decision(q1, "reviewer-a")] };
    const parsed = parseReviewReturn(JSON.stringify(filled));
    expect(appendReviewDecisions(emptyAuditLog(), parsed.decisions, [q1], at).accepted).toBe(1);
    expect(parseReviewReturn("{not json").errors[0]).toMatch(/valid JSON/);
  });
});

describe("content quality gates", () => {
  const codes = (q: ReturnType<typeof wq>) => questionGateIssues(q, gate).map((i) => i.code);
  it("derives the same gate context from a curriculum as the reviewer portal uses", () => {
    const derived = gateContextFromTopics([T, { ...topic("calculus"), specVersion: undefined }]);
    expect([...derived.topicIds].sort()).toEqual([T.id, topic("calculus").id].sort());
    expect(derived.specPointIds.has(T.specPoints[0]!.id)).toBe(true);
    expect(derived.specVersionOf?.(T.subjectId)).toBe(gate.specVersionOf?.(T.subjectId));
  });
  it("never counts a gate-blocked question as approvable, so it cannot fill an authored-ceiling slot", () => {
    const fakeTransfer = wq("t-ceiling", "algebra", PROMPTS[2]!, { flavour: "transfer" });
    fakeTransfer.learning!.transferLink = undefined;
    expect(approvableByReview(fakeTransfer, gate)).toBe(false);
    expect(approvableByReview(wq("t-linked", "algebra", PROMPTS[3]!, { flavour: "transfer" }), gate)).toBe(true);
    expect(approvableByReview(q1, gate)).toBe(true);
  });
  it("passes a well-formed question", () => expect(blockingGates(questionGateIssues(q1, gate))).toEqual([]));
  it("blocks missing mark schemes, wrong totals and broken links", () => {
    expect(codes({ ...q1, parts: [{ ...q1.parts[0]!, markScheme: [] }] })).toContain("no-mark-scheme");
    expect(codes({ ...q1, totalMarks: 5 })).toContain("mark-total-mismatch");
    expect(codes({ ...q1, specPointIds: [], parts: [{ ...q1.parts[0]!, specPointIds: [] }] })).toContain("no-spec-link");
    expect(codes({ ...q1, specPointIds: ["nope"] })).toContain("unknown-spec-point");
    expect(codes({ ...q1, topicIds: ["missing.topic"] })).toContain("unknown-topic");
    expect(codes({ ...q1, kind: "mcq", options: ["a", "b"], correctIndex: 4 })).toContain("mcq-mismatch");
  });
  it("blocks stale specification versions and unaccepted provenance", () => {
    expect(codes({ ...q1, specVersion: "2019-0.1" })).toContain("stale-spec-version");
    expect(codes({ ...q1, source: "unreviewed" })).toContain("insufficient-provenance");
    expect(codes({ ...q1, origin: "ai" })).toContain("insufficient-provenance");
  });
  it("blocks transfer or data labels without actual transfer or data", () => {
    const fakeTransfer = wq("t", "algebra", PROMPTS[2]!, { flavour: "transfer" });
    fakeTransfer.learning!.transferLink = undefined;
    expect(codes(fakeTransfer)).toContain("transfer-label-without-transfer");
    expect(codes(wq("t2", "algebra", PROMPTS[3]!, { flavour: "transfer" }))).not.toContain("transfer-label-without-transfer");
    const fakeData = wq("d", "algebra", PROMPTS[4]!, { flavour: "data" });
    fakeData.stem = PROMPTS[4]!;
    fakeData.parts[0]!.prompt = PROMPTS[4]!;
    expect(codes(fakeData)).toContain("data-label-without-data");
    expect(codes(wq("d2", "algebra", PROMPTS[5]!, { flavour: "data" }))).not.toContain("data-label-without-data");
  });
});
