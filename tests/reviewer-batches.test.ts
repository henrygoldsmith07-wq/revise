import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { physicsTransferLinkedQuestions } from "@/content/questions/physics-transfer-linked";
import { appendReviewDecisions, emptyAuditLog, type ReviewAuditLog } from "@/domain/review-workflow";
import type { Question } from "@/domain/types";
import { buildTransferBatch, linkedPartFor, needsLabel, nextInBatch, transferPairs } from "@/lib/reviewer/batches";
import { reviewerReturnPath } from "@/lib/reviewer/return-path";
import { decision, NOW, PROMPTS, SUBJECT, wq } from "./helpers-review";
// @ts-expect-error plain .mjs helper without types
import { grantFailureHint, grantProblems, parseGrantArgs, reviewerLink } from "../scripts/lib/reviewer-grant.mjs";

// The transfer-pair batch is ordering and context only: states come from the
// domain's reviewStateOf, nobody is offered a question they already approved,
// and the second approval visibly has to come from a different reviewer.

const baseA = wq("base-a", "algebra", PROMPTS[0]!);
const baseB = wq("base-b", "calculus", PROMPTS[1]!);
const withLink = (id: string, slug: string, prompt: string, baselinePartId: string): Question => {
  const question = wq(id, slug, prompt, { flavour: "transfer" });
  const link = question.learning!.transferLink!;
  return { ...question, parts: question.parts.map((part) => ({ ...part, learning: { ...(part.learning ?? {}), demand: "transfer", transferLink: { ...link, baselinePartId } } })) } as Question;
};
const transA = withLink("trans-a", "algebra", PROMPTS[2]!, "base-a:a");
const transB = withLink("trans-b", "calculus", PROMPTS[3]!, "base-b:a");
const orphan = withLink("trans-orphan", "algebra", PROMPTS[4]!, "missing:a");
const bank: Question[] = [baseA, transA, wq("plain", "algebra", PROMPTS[5]!), baseB, transB, orphan];

function approve(log: ReviewAuditLog, ids: string[], who: string): ReviewAuditLog {
  const result = appendReviewDecisions(log, ids.map((id) => decision(bank.find((q) => q.id === id)!, who)), bank, NOW.getTime());
  expect(result.problems).toEqual([]);
  return result.log;
}

describe("transfer-pair review batch", () => {
  it("pairs each linked transfer with its baseline, baseline first, and skips dangling links", () => {
    const pairs = transferPairs(bank, SUBJECT);
    expect(pairs.map((pair) => [pair.baselineQuestionId, pair.transferQuestionId])).toEqual([["base-a", "trans-a"], ["base-b", "trans-b"]]);
    const view = buildTransferBatch(bank, [], SUBJECT, "teacher-a");
    expect(view.members.map((member) => member.questionId)).toEqual(["base-a", "trans-a", "base-b", "trans-b"]);
    expect(view).toMatchObject({ approvalsNeeded: 8, approvalsRecorded: 0, verifiedQuestions: 0, readyPairs: 0, actionable: 4 });
    expect(needsLabel(view.members[0]!)).toBe("needs 2 reviewers");
  });

  it("reads every state from the audit chain and never re-offers a question to the reviewer who approved it", () => {
    const log = approve(emptyAuditLog(), ["base-a", "trans-a"], "teacher-a");
    const forA = buildTransferBatch(bank, log.events, SUBJECT, "teacher-a");
    expect(forA.members.find((m) => m.questionId === "base-a")).toMatchObject({ stage: "checked", action: "awaiting-other", approvers: ["teacher-a"] });
    expect(needsLabel(forA.members[0]!)).toBe("needs 1 more reviewer, not teacher-a");
    // Teacher A's next item skips both questions they approved.
    expect(nextInBatch(forA, null)).toBe("base-b");
    expect(nextInBatch(forA, "base-b")).toBe("trans-b");
    expect(nextInBatch(forA, "trans-b")).toBe("base-b");

    // Teacher B is offered the half-reviewed pair first, in batch order.
    const forB = buildTransferBatch(bank, log.events, SUBJECT, "teacher-b");
    expect(nextInBatch(forB, null)).toBe("base-a");
    expect(forB.approvalsRecorded).toBe(2);

    // Only a second, different reviewer makes the pair usable for proof.
    const both = approve(log, ["base-a", "trans-a"], "teacher-b");
    const done = buildTransferBatch(bank, both.events, SUBJECT, "teacher-b");
    expect(done.pairs[0]).toMatchObject({ ready: true });
    expect(done).toMatchObject({ readyPairs: 1, verifiedQuestions: 2, approvalsRecorded: 4 });
    expect(nextInBatch(done, null)).toBe("base-b");
  });

  it("does not let the same reviewer approve twice to finish a pair", () => {
    const log = approve(emptyAuditLog(), ["base-a"], "teacher-a");
    const again = appendReviewDecisions(log, [decision(baseA, "teacher-a")], bank, NOW.getTime());
    expect(again.accepted).toBe(0);
    expect(buildTransferBatch(bank, log.events, SUBJECT, null).members[0]).toMatchObject({ stage: "checked", approvalsNeeded: 1 });
  });

  it("marks a change request as waiting for the author, not ready", () => {
    const result = appendReviewDecisions(emptyAuditLog(), [decision(transA, "teacher-a", { decision: "revise", comments: "Second mark point is ambiguous." })], bank, NOW.getTime());
    expect(result.problems).toEqual([]);
    const view = buildTransferBatch(bank, result.log.events, SUBJECT, "teacher-b");
    const member = view.members.find((m) => m.questionId === "trans-a")!;
    expect(member).toMatchObject({ action: "changes-requested", openComment: "Second mark point is ambiguous." });
    expect(needsLabel(member)).toMatch(/waits for an author edit/);
    expect(nextInBatch(view, "base-a")).toBe("base-b");
  });

  it("finds the other half of a pair in both directions for the review screen", () => {
    expect(linkedPartFor(bank, transA)).toMatchObject({ role: "transfer", links: [{ question: { id: "base-a" }, ownPartId: "trans-a:a" }] });
    expect(linkedPartFor(bank, baseB)).toMatchObject({ role: "baseline", links: [{ question: { id: "trans-b" }, ownPartId: "base-b:a" }] });
    expect(linkedPartFor(bank, bank[2]!)).toBeNull();
  });

  it("covers the 14 shipped Physics transfer items and their baselines, all still unreviewed", () => {
    const view = buildTransferBatch(seedQuestions, [], "wjec-alevel-physics", null);
    expect(view.pairs).toHaveLength(physicsTransferLinkedQuestions.length);
    expect(new Set(view.pairs.map((pair) => pair.transferQuestionId))).toEqual(new Set(physicsTransferLinkedQuestions.map((q) => q.id)));
    expect(view.members).toHaveLength(28);
    // Honest state: nothing in the shipped bank is approved by this change.
    expect(view).toMatchObject({ verifiedQuestions: 0, readyPairs: 0, approvalsRecorded: 0, approvalsNeeded: 56 });
  });
});

describe("reviewer sign-in return path", () => {
  it("returns to the portal page that was opened, minus Supabase's callback params", () => {
    expect(reviewerReturnPath("/reviewer/pairs", "?subject=physics")).toBe("/reviewer/pairs?subject=physics");
    expect(reviewerReturnPath("/reviewer/pairs", "?subject=physics&code=abc&error=x")).toBe("/reviewer/pairs?subject=physics");
    expect(reviewerReturnPath("/reviewer", "")).toBe("/reviewer");
  });

  it("never sends a sign-in link anywhere outside the portal", () => {
    expect(reviewerReturnPath("/settings", "")).toBe("/reviewer");
    expect(reviewerReturnPath("/reviewerx", "")).toBe("/reviewer");
    expect(reviewerReturnPath("/reviewer//evil.example", "")).toBe("/reviewer");
  });
});

describe("maintainer grant command (validation only)", () => {
  const ok = parseGrantArgs(["--email", "J.Smith@School.org", "--label", "teacher-jsmith", "--role", "teacher", "--qualification", "PGCE Physics; 8 years teaching WJEC A-level", "--granted-by", "henry"]);

  it("accepts a well-formed grant and normalises the email", () => {
    expect(ok.email).toBe("j.smith@school.org");
    expect(grantProblems(ok)).toEqual([]);
  });

  it("mirrors the reviewer_roles constraints before touching the database", () => {
    expect(grantProblems({ ...ok, label: "T" })).toHaveLength(1);
    expect(grantProblems({ ...ok, role: "student" })).toHaveLength(1);
    expect(grantProblems({ ...ok, qualification: "x" })).toHaveLength(1);
    expect(grantProblems({ ...ok, email: "not-an-email" })).toHaveLength(1);
  });

  it("refuses a label that leaks the email and the obvious self-grant", () => {
    expect(grantProblems({ ...ok, label: "j.smith-physics" }).join()).toMatch(/pseudonym/);
    expect(grantProblems({ ...ok, label: "henry" }).join()).toMatch(/cannot grant reviewer access to themselves/);
    expect(grantProblems({ ...ok, email: "henry@example.org", label: "reviewer-h" }).join()).toMatch(/themselves/);
  });

  it("explains a refused relabel and a taken pseudonym", () => {
    expect(grantFailureHint("reviewer pseudonym cannot change: this account is already reviewer teacher-one, and independent approvals are counted by pseudonym"))
      .toMatch(/re-run with --label teacher-one/);
    expect(grantFailureHint('duplicate key value violates unique constraint "reviewer_roles_reviewer_label_key"')).toMatch(/already used by another reviewer/);
    expect(grantFailureHint("network down")).toBe("");
  });

  it("rejects unknown flags and prints the batch link", () => {
    expect(() => parseGrantArgs(["--approve-all"])).toThrow(/unknown argument/);
    expect(reviewerLink("https://revise-gray.vercel.app")).toBe("https://revise-gray.vercel.app/reviewer/pairs?subject=physics");
  });
});

describe("portal wiring (source contract)", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  const page = read("src/app/(reviewer)/reviewer/review/[questionId]/page.tsx");
  const pairs = read("src/app/(reviewer)/reviewer/pairs/page.tsx");
  const queue = read("src/app/(reviewer)/reviewer/page.tsx");
  const signIn = read("src/components/reviewer/ReviewerSignIn.tsx");

  it("keeps Next/Skip inside the batch and shows the linked baseline beside a transfer", () => {
    expect(page).toContain('search.batch === "pairs"');
    expect(page).toContain("nextInBatch(batch, question.id)");
    expect(page).toContain("linkedPartFor(reviewBank, question)");
    expect(page).toContain("Baseline this question transfers from");
  });

  it("links the batch from the queue and gates the batch page like every portal page", () => {
    expect(queue).toContain("/reviewer/pairs?subject=");
    expect(pairs).toContain("getReviewerContext()");
    expect(pairs).toContain("<ReviewerGate");
    expect(pairs).toContain("combined.issues.length");
  });

  it("re-renders the server gate once the magic-link session exists, and returns to the opened page", () => {
    expect(signIn).toContain("router.refresh()");
    expect(signIn).toContain("reviewerReturnPath(location.pathname, location.search)");
    expect(signIn).toContain("shouldCreateUser: false");
  });
});
