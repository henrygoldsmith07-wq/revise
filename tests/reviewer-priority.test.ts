import { describe, expect, it } from "vitest";
import { appendReviewDecisions, emptyAuditLog, type ReviewAuditLog } from "@/domain/review-workflow";
import type { Question } from "@/domain/types";
import { buildReviewPriorityIndex, reviewPriorityIndex, type ReviewPriorityInput } from "@/lib/reviewer/priority";
import { buildReviewQueue, combineAuditLog } from "@/lib/reviewer/runtime-ledger";
import { decision, gateFor, NOW, PROMPTS, SUBJECT, topic, wq } from "./helpers-review";

// The portal's "Ready for you" list is ordered by what each review unlocks for
// students (the domain review-priority plan), with trust read exactly as a
// student device reads it. Ordering only: nothing is hidden, no rule changes.

const topics = [topic("algebra", 1), topic("probability", 2), topic("calculus", 3)];
const swapA = wq("alg-swap-1", "algebra", "Show that x = 2 is a root of f(x) = x³ - 5x² + 4x - 3 and state the remainder when f is divided by x - 2.");
const swapB = wq("alg-swap-2", "algebra", "Show that x = 3 is a root of f(x) = x³ - 6x² + 5x - 4 and state the remainder when f is divided by x - 3.");
const blocked = wq("prob-broken", "probability", PROMPTS[6]!, { totalMarks: 9 } as Partial<Question>);
const bank: Question[] = [
  swapA, swapB,
  wq("alg-plain", "algebra", PROMPTS[2]!),
  wq("prob-only", "probability", PROMPTS[3]!),
  blocked,
  wq("calc-1", "calculus", PROMPTS[4]!),
  wq("calc-2", "calculus", PROMPTS[5]!),
];
const EMPTY_LEDGER = { formatVersion: 1, entries: [] };

const input = (log: ReviewAuditLog = emptyAuditLog()): ReviewPriorityInput => ({
  questions: bank, combined: combineAuditLog(log, []), committedLedger: EMPTY_LEDGER, subjectId: SUBJECT, topics, gate: gateFor(topics),
});

function approveTwice(ids: string[], log: ReviewAuditLog = emptyAuditLog()): ReviewAuditLog {
  let current = log;
  for (const who of ["teacher-a", "teacher-b"]) {
    const result = appendReviewDecisions(current, ids.map((id) => decision(bank.find((q) => q.id === id)!, who)), bank, NOW.getTime());
    expect(result.problems).toEqual([]);
    current = result.log;
  }
  return current;
}

describe("capability-first reviewer queue", () => {
  it("leads with ranked reviews, then no-gain reviews, then gate-blocked questions", () => {
    const priority = buildReviewPriorityIndex(input());
    const queue = buildReviewQueue(bank, emptyAuditLog(), "teacher-c", SUBJECT, priority);
    const ids = queue.ready.map((item) => item.questionId);
    // Every question is still listed: ordering never hides work.
    expect([...ids].sort()).toEqual(bank.map((q) => q.id).sort());
    const ranked = queue.ready.filter((item) => item.priorityRank !== null);
    expect(ranked.map((item) => item.priorityRank)).toEqual([...ranked.map((item) => item.priorityRank)].sort((a, b) => a! - b!));
    expect(ranked[0]!.unlocks.length).toBeGreaterThan(0);
    // Only one member of a reskin cluster is worth a review; its sibling follows the ranked block.
    const swapRanks = [swapA, swapB].map((q) => priority.byQuestion.get(q.id)?.rank ?? null);
    expect(swapRanks.filter((rank) => rank !== null)).toHaveLength(1);
    // The gate-blocked question is last and flagged, not dropped.
    expect(ids.at(-1)).toBe(blocked.id);
    expect(queue.ready.at(-1)).toMatchObject({ blocked: true, priorityRank: null, unlocks: [] });
  });

  it("keeps the previous order when no priority index is supplied", () => {
    const queue = buildReviewQueue(bank, emptyAuditLog(), "teacher-c", SUBJECT);
    expect(queue.ready.map((item) => item.questionId)).toEqual(bank.map((q) => q.id).sort());
    expect(queue.ready.every((item) => item.priorityRank === null && !item.blocked)).toBe(true);
  });

  it("reads trust from the review chain exactly as students do, and finds the fastest topic to make provable", () => {
    const before = buildReviewPriorityIndex(input());
    expect(before.summary).toMatchObject({ trustedQuestions: 0, topicsWithProof: 0 });
    // Two different reviewers approve calc-1 in the chain: it becomes trusted
    // for students, leaves the plan, and calculus needs one more question.
    const after = buildReviewPriorityIndex(input(approveTwice(["calc-1"])));
    expect(after.summary).toMatchObject({ trustedQuestions: 1, topicsWithProof: 0 });
    expect(after.byQuestion.has("calc-1")).toBe(false);
    expect(after.fastestProof).toMatchObject({ topicId: `${SUBJECT}.calculus`, questionIds: ["calc-2"], approvals: 2 });
    expect(after.fastestProof!.minutes).toBeGreaterThan(0);
  });

  it("does not count a single approval as trust", () => {
    const one = appendReviewDecisions(emptyAuditLog(), [decision(bank.find((q) => q.id === "calc-1")!, "teacher-a")], bank, NOW.getTime()).log;
    const index = buildReviewPriorityIndex(input(one));
    expect(index.summary).toMatchObject({ trustedQuestions: 0 });
    // Half-reviewed calc-1 needs only one more approval, so it is the cheaper route.
    expect(index.fastestProof).toMatchObject({ topicId: `${SUBJECT}.calculus`, approvals: 3 });
  });

  it("memoises on the audit-chain tail and recomputes after a new decision", () => {
    const empty = input();
    const first = reviewPriorityIndex(empty);
    expect(reviewPriorityIndex(input())).toBe(first);
    const changed = reviewPriorityIndex(input(approveTwice(["calc-1"])));
    expect(changed).not.toBe(first);
    expect(changed.summary!.trustedQuestions).toBe(1);
  });
});
