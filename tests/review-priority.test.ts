import { describe, expect, it } from "vitest";
import { appendReviewDecisions, emptyAuditLog } from "@/domain/review-workflow";
import { buildReviewPriorities, COLD_START_TOPIC_TARGET } from "@/domain/review-priority";
import { auditTopicSupply } from "@/domain/supply-audit";
import type { Question } from "@/domain/types";
import { decision, gateFor, NOW, PROMPTS, SUBJECT, topic, verifyThroughWorkflow, wq } from "./helpers-review";

const topics = [topic("algebra", 1), topic("probability", 2), topic("calculus", 3), topic("statistics", 4)];
const T = (slug: string) => `${SUBJECT}.${slug}`;
const swapA = wq("alg-swap-1", "algebra", "Show that x = 2 is a root of f(x) = x³ - 5x² + 4x - 3 and state the remainder when f is divided by x - 2.");
const swapB = wq("alg-swap-2", "algebra", "Show that x = 3 is a root of f(x) = x³ - 6x² + 5x - 4 and state the remainder when f is divided by x - 3.");

const bank: Question[] = [
  swapA, swapB,
  wq("alg-transfer", "algebra", PROMPTS[1]!, { flavour: "transfer" }),
  wq("alg-plain", "algebra", PROMPTS[2]!),
  wq("prob-only", "probability", PROMPTS[3]!),
  wq("calc-1", "calculus", PROMPTS[4]!),
  wq("calc-2", "calculus", PROMPTS[5]!),
  wq("stat-data", "statistics", PROMPTS[6]!, { flavour: "data" }),
  wq("stat-plain", "statistics", PROMPTS[7]!),
];
const run = (questions: Question[], events = emptyAuditLog().events) => buildReviewPriorities({ topics, questions, auditEvents: events, gate: gateFor(topics), now: NOW, subjectIds: [SUBJECT] });

describe("review prioritisation", () => {
  it("is deterministic and proposes one question per reskin cluster", () => {
    expect(run(bank)).toEqual(run([...bank].reverse()));
    const queue = run(bank).queue;
    expect(queue.filter((i) => i.questionId.startsWith("alg-swap")).length).toBe(1);
    expect(new Set(queue.map((i) => i.questionId)).size).toBe(queue.length);
  });

  it("puts the cold-start diagnostic first, then the second distinct question and transfer", () => {
    const report = run(bank);
    expect(COLD_START_TOPIC_TARGET).toBeGreaterThan(report.subjects[0]!.coldStartTarget - 1);
    expect(report.queue[0]!.unlocks).toContain("cold-start-diagnostic");
    const algebra = report.queue.filter((i) => i.topicId === T("algebra"));
    expect(algebra.map((i) => i.unlocks).flat()).toEqual(expect.arrayContaining(["second-distinct-question", "first-transfer-question"]));
    expect(algebra.find((i) => i.unlocks.includes("first-transfer-question"))!.questionId).toBe("alg-transfer");
    const statistics = report.queue.filter((i) => i.topicId === T("statistics"));
    expect(statistics.find((i) => i.unlocks.includes("first-data-question"))!.questionId).toBe("stat-data");
  });

  it("says when a genuinely new question must be authored instead", () => {
    const row = run(bank).topics.find((r) => r.topicId === T("probability"))!;
    expect(row).toMatchObject({ trustedDistinct: 0, proofBlocked: true });
    expect(row.authoringNeeded).toEqual({ distinct: 1, transfer: true, data: false });
    expect(run(bank).topics.find((r) => r.topicId === T("calculus"))!.authoringNeeded.transfer).toBe(true);
  });

  it("ranks finishing a half-reviewed question above starting a new one", () => {
    const before = run(bank).queue;
    const target = before.find((i) => i.topicId === T("calculus") && i.questionId === "calc-2")!;
    const target1 = before.find((i) => i.topicId === T("calculus") && i.questionId === "calc-1");
    const pick = (target1 ?? target).questionId;
    const log = appendReviewDecisions(emptyAuditLog(), [decision(bank.find((q) => q.id === pick)!, "reviewer-a")], bank, NOW.getTime()).log;
    const after = run(bank, log.events).queue;
    const item = after.find((i) => i.questionId === pick)!;
    expect(item).toMatchObject({ stage: "checked", reviewsNeeded: 1 });
    expect(item.rank).toBeLessThanOrEqual(before.find((i) => i.questionId === pick)!.rank);
  });

  it("holds back a question that needs revision until its content changes", () => {
    const revise = appendReviewDecisions(emptyAuditLog(), [decision(bank.find((q) => q.id === "alg-plain")!, "reviewer-a", { decision: "revise", comments: "Ambiguous wording in part (a)." })], bank, NOW.getTime()).log;
    const report = run(bank, revise.events);
    expect(report.queue.some((i) => i.questionId === "alg-plain")).toBe(false);
    expect(report.topics.find((r) => r.topicId === T("algebra"))!.awaitingRevision).toBe(1);
  });

  it("does not propose questions that fail a blocking content gate", () => {
    const broken = { ...bank.find((q) => q.id === "calc-1")!, totalMarks: 9 } as Question;
    const report = run(bank.map((q) => (q.id === "calc-1" ? broken : q)));
    expect(report.queue.some((i) => i.questionId === "calc-1")).toBe(false);
    expect(report.topics.find((r) => r.topicId === T("calculus"))!.blockedByGates).toBe(1);
  });

  it("stops needing review in a topic once trusted supply is genuinely distinct", () => {
    const { questions } = verifyThroughWorkflow(bank, ["calc-1", "calc-2"]);
    const row = run(questions).topics.find((r) => r.topicId === T("calculus"))!;
    expect(row).toMatchObject({ trustedDistinct: 2, proofBlocked: false });
    expect(row.next).toBeNull();
  });

  it("reaches cold-start readiness once five topics each have a trusted short question", () => {
    const five = ["a", "b", "c", "d", "e", "f"].map((s) => topic(`t-${s}`));
    const questions = five.map((t, i) => wq(`only-${i}`, t.id.replace(`${SUBJECT}.`, ""), PROMPTS[i]!));
    const input = (qs: Question[]) => buildReviewPriorities({ topics: five, questions: qs, gate: gateFor(five), now: NOW, subjectIds: [SUBJECT] });
    expect(input(questions).subjects[0]!.coldStartReady).toBe(false);
    const { questions: trusted } = verifyThroughWorkflow(questions, questions.slice(0, 5).map((q) => q.id));
    expect(input(trusted).subjects[0]).toMatchObject({ coldStartTopics: 5, coldStartReady: true });
  });
});

describe("duplicate protection in supply", () => {
  it("never counts reskins of one question as two trusted questions", () => {
    const { questions } = verifyThroughWorkflow(bank, ["alg-swap-1", "alg-swap-2"]);
    const row = auditTopicSupply(T0, questions);
    expect(row.trusted).toBe(2);
    expect(row.provableDistinct).toBe(1);
    expect(row.verdict).toBe("thin");
  });
});
const T0 = topics[0]!;
