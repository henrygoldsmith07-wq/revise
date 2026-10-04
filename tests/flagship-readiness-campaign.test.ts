import { describe, expect, it } from "vitest";
import { flagshipReadiness } from "@/domain/flagship-readiness";
import { buildReviewCampaign } from "@/domain/review-campaign";
import { appendReviewDecisions, emptyAuditLog } from "@/domain/review-workflow";
import { topic, wq, PROMPTS, SUBJECT, NOW, gateFor, decision, verifyThroughWorkflow } from "./helpers-review";

describe("flagship readiness gates", () => {
  const topics = Array.from({ length: 5 }, (_, i) => topic(`t${i}`, i));
  const bank = topics.flatMap((_, i) => [
    wq(`q${i}-a`, `t${i}`, PROMPTS[0]!),
    wq(`q${i}-b`, `t${i}`, PROMPTS[1]!, { flavour: "transfer" }),
    wq(`q${i}-c`, `t${i}`, PROMPTS[2]!),
  ]);
  const check = (ids: string[]) => {
    const fixture = verifyThroughWorkflow(bank, ids);
    return flagshipReadiness({ ...fixture, auditEvents: fixture.log.events, topics, gate: gateFor(topics), subjectId: SUBJECT, now: NOW });
  };
  it("does not trust authored metadata, one review, or raw question count", () => {
    expect(check([]).verdict).toBe("NOT READY");
    const once = appendReviewDecisions(emptyAuditLog(), bank.map(q => decision(q, "fixture-A")), bank, NOW.getTime());
    expect(flagshipReadiness({ topics, questions: bank, auditEvents: once.log.events, gate: gateFor(topics), subjectId: SUBJECT }).trustedQuestions).toBe(0);
  });
  it("moves upward only as a diagnostic, mission and delayed proof become usable", () => {
    const diagnostic = bank.filter(q => q.id.endsWith("-a")).map(q => q.id);
    expect(check(diagnostic).verdict).toBe("DIAGNOSTIC READY");
    expect(check([...diagnostic, "q0-b"]).verdict).toBe("MISSION READY");
    const proof = check([...diagnostic, "q0-b", "q0-c"]);
    expect(proof.verdict).toBe("PROOF READY");
    expect(proof.proofTopicIds).toEqual([`${SUBJECT}.t0`]);
    expect(proof.measures.delayedProof).toEqual({ count: 1, total: 5, percent: 20 });
    expect(proof.criteria.flagship).toBe(false);
  });
  it("reskins and edits never inflate proof supply", () => {
    const questions = [bank[0]!, { ...bank[0]!, id: "reskin", learning: { ...bank[0]!.learning!, familyId: "renamed" } }];
    const fixture = verifyThroughWorkflow(questions, questions.map(q => q.id));
    const input = { ...fixture, topics: [topics[0]!], auditEvents: fixture.log.events, gate: gateFor(topics), subjectId: SUBJECT };
    expect(flagshipReadiness(input).measures.secondDistinctSupply.count).toBe(0);
    const edited = fixture.questions.map(q => ({ ...q, stem: `${q.stem} Edited.` }));
    const result = flagshipReadiness({ ...input, questions: edited });
    expect(result.trustedQuestions).toBe(0);
    expect(result.questionsRequiringReReview).toHaveLength(2);
  });
  it("empty curricula cannot release vacuously", () => {
    expect(flagshipReadiness({ topics: [], questions: [], gate: gateFor([]), subjectId: SUBJECT }).verdict).toBe("NOT READY");
  });
});

describe("cross-subject reviewer campaigns", () => {
  it("ranks marginal capability per reviewer minute and honours work budgets", () => {
    const topics = [topic("cheap"), topic("expensive")];
    const questions = [wq("cheap", "cheap", PROMPTS[0]!, { seconds: 30 }), wq("expensive", "expensive", PROMPTS[1]!, { seconds: 170 })];
    const input = { topics, questions, gate: gateFor(topics), now: NOW };
    const campaign = buildReviewCampaign(input);
    expect(campaign.items[0]!.questionId).toBe("cheap");
    const cost = campaign.items[0]!.reviewMinutes;
    expect(buildReviewCampaign({ ...input, minuteBudget: cost }).items).toHaveLength(1);
    expect(buildReviewCampaign({ ...input, minuteBudget: cost - 1 }).items).toHaveLength(0);
    expect(() => buildReviewCampaign({ ...input, limit: NaN })).toThrow();
  });
  it("identifies second-review work and promotion without approving anything", () => {
    const topics = [topic("a")], q = wq("q", "a", PROMPTS[0]!);
    const log = appendReviewDecisions(emptyAuditLog(), [decision(q, "fixture-A")], [q], NOW.getTime()).log;
    const campaign = buildReviewCampaign({ topics, questions: [q], auditEvents: log.events, gate: gateFor(topics) });
    expect(campaign.items[0]).toMatchObject({ reviewsNeeded: 1, reviewer1Approved: true, reviewer2Required: true, readyForPromotion: false });
    const second = appendReviewDecisions(log, [decision(q, "fixture-B")], [q], NOW.getTime()).log;
    expect(buildReviewCampaign({ topics, questions: [q], auditEvents: second.events, gate: gateFor(topics) }).items[0]).toMatchObject({ reviewsNeeded: 0, reviewMinutes: 0, readyForPromotion: true });
    expect(q.humanVerification).toBeUndefined();
  });
  it("does not spend reviewer work on a cluster already trusted", () => {
    const topics = [topic("a")], q = wq("q", "a", PROMPTS[0]!);
    const fixture = verifyThroughWorkflow([q], [q.id]);
    const reskin = { ...q, id: "clone" };
    expect(buildReviewCampaign({ topics, questions: [...fixture.questions, reskin], auditEvents: fixture.log.events, gate: gateFor(topics) }).items).toEqual([]);
  });
});
