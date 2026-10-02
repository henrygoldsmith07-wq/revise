import { describe, expect, it } from "vitest";
import { auditRecommendations } from "@/domain/recommendation-audit";
import type { FunnelEvent } from "@/domain/funnel";
import type { ProofLedger, TopicProof } from "@/domain/proof-of-improvement";

const ev = (type: FunnelEvent["type"], topic: string, day = "2026-09-01"): FunnelEvent => ({ anonId: "a", type, at: `${day}T10:00:00Z`, detail: `adaptive:${topic}:${day}` });
const proof = (topicId: string, o: Partial<TopicProof> = {}): TopicProof => ({ topicId, subjectId: "s", share: 0.1, status: "awaiting-proof", proofDue: false, illusory: false, markPoints: 0, ...o } as TopicProof);
const ledger = (...topics: TopicProof[]): ProofLedger => ({ topics } as ProofLedger);

describe("recommendation audit", () => {
  it("is empty and honest with no events", () => {
    const a = auditRecommendations([], undefined);
    expect(a).toMatchObject({ shown: 0, accepted: 0, acceptRate: null, sufficient: false });
    expect(a.headline).toMatch(/No recommendations/);
  });
  it("ignores acceptances that were never shown, and unrelated events", () => {
    const a = auditRecommendations([ev("recommendation_accepted", "t1"), { anonId: "a", type: "app_opened", at: "2026-09-01T00:00:00Z" }, { ...ev("recommendation_displayed", "t2"), detail: "review-due" }], undefined);
    expect(a).toMatchObject({ shown: 0, accepted: 0 });
  });
  it("counts each shown session once and reports the accept rate", () => {
    const events = [ev("recommendation_displayed", "t1"), ev("recommendation_displayed", "t1"), ev("recommendation_accepted", "t1"), ev("recommendation_displayed", "t2", "2026-09-02")];
    const a = auditRecommendations(events, undefined);
    expect(a).toMatchObject({ shown: 2, accepted: 1, acceptRate: 0.5 });
    expect(a.headline).toMatch(/too little to say/);
  });
  it("only claims proof counts once enough accepted topics exist, and never claims causation", () => {
    const events = ["t1", "t2", "t3"].flatMap((t) => [ev("recommendation_displayed", t), ev("recommendation_accepted", t)]);
    const l = ledger(proof("t1", { status: "proven-gain", markPoints: 2 }), proof("t2", { status: "proven-gain", illusory: true }), proof("t3", { proofDue: true }), proof("t9", { status: "proven-gain", markPoints: 1.5 }));
    const a = auditRecommendations(events, l);
    expect(a.sufficient).toBe(true);
    expect(a.acceptedOutcomes).toMatchObject({ proven: 1, illusory: 1, "awaiting-proof": 1 });
    expect(a.provenMarksAccepted).toBe(2);
    expect(a.provenMarksOther).toBe(1.5);
    expect(a.headline).toMatch(/1 of 3 of those topics show proven gain/);
    expect(a.headline).toMatch(/does not show the suggestions caused it/);
  });
  it("separates held or unclear results from unknown ones", () => {
    const a = auditRecommendations(["t1", "t2"].flatMap((t) => [ev("recommendation_displayed", t), ev("recommendation_accepted", t)]), ledger(proof("t1", { status: "held" }), proof("t2", { status: "no-clear-change" })));
    expect(a.acceptedOutcomes["no-change"]).toBe(2);
  });
  it("reports declines and unknown topics distinctly", () => {
    const a = auditRecommendations([ev("recommendation_displayed", "t1"), ev("recommendation_accepted", "t1"), ev("recommendation_displayed", "t2"), ev("recommendation_accepted", "t2")], ledger(proof("t1", { status: "declined", markPoints: -1 })));
    expect(a.acceptedOutcomes).toMatchObject({ declined: 1, "no-proof-yet": 1 });
  });
});
