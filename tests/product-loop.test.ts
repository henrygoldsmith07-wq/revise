import { describe, expect, it } from "vitest";
import type { AdaptiveSessionPlan, AdaptiveSessionStep, AdaptiveStepKind, AdaptiveStepRecord } from "@/domain/adaptive-contract";
import { buildInterventionMemory, interventionChain } from "@/domain/intervention-memory";
import { describePathway } from "@/domain/study-pathway";
import { buildTrustIndicator } from "@/domain/trust-indicator";
import { buildWhatChanged } from "@/domain/what-changed";
import type { InterventionOutcomeRecord, Question } from "@/domain/types";
import { question } from "./helpers-recovery";

const JARGON = /optimi[sz]|weighting|capabilit|interventi|effectiveness|ranking|\bscor(e|ing)\b|evidence rung|\brung\b|ladder|calibrat|\bFSRS\b|ledger|attestation|retrieval|transfer/i;

const step = (kind: AdaptiveStepKind, extra: Partial<AdaptiveSessionStep> = {}): AdaptiveSessionStep => ({
  id: `s-${kind}`, kind, minutes: 4, label: kind, description: "", href: "/", topicId: "motion", subjectId: "physics",
  cardIds: [], questionIds: [], mistakeIds: [], ...extra,
});

const plan = (kinds: AdaptiveStepKind[], evidence: Partial<AdaptiveSessionPlan["evidence"]> = {}): AdaptiveSessionPlan => ({
  key: "k", subjectId: "physics", topicId: "motion", topicTitle: "Motion graphs", targetMinutes: 20, totalMinutes: 18, score: 1,
  reason: "Recall is strong but application is weak.", steps: kinds.map((k) => step(k)), startHref: "/adaptive-session?topic=motion&start=1",
  evidence: { attempts: 4, focus: "application", focusState: "emerging", ...evidence } as AdaptiveSessionPlan["evidence"],
});

const record = (kind: AdaptiveStepKind, result: AdaptiveStepRecord["result"], extra: Partial<AdaptiveStepRecord> = {}): AdaptiveStepRecord => ({
  stepId: `s-${kind}`, kind, minutes: 4, result, awardedMarks: result === "passed-independent" ? 3 : 0, maxMarks: 3, hintTier: null, elapsedMs: 60_000, ...extra,
});

describe("study pathway names the planner's sequence without changing it", () => {
  it("describes repair, learn, stretch and recall sessions in plain words", () => {
    expect(describePathway(plan(["misconception-repair", "explanation", "independent-application", "delayed-retrieval"])).kind).toBe("repair");
    expect(describePathway(plan(["prerequisite-repair", "supported-practice"])).kind).toBe("foundation");
    expect(describePathway(plan(["explanation", "overdue-retrieval", "supported-practice"])).kind).toBe("learn");
    expect(describePathway(plan(["overdue-retrieval", "independent-application", "transfer", "delayed-retrieval"])).kind).toBe("stretch");
    expect(describePathway(plan(["overdue-retrieval"])).kind).toBe("recall");
  });

  it("merges consecutive repeats, keeps order and flags the delayed check", () => {
    const p = describePathway(plan(["overdue-retrieval", "overdue-retrieval", "independent-application", "delayed-retrieval"]));
    expect(p.steps).toEqual(["Quick recall", "Exam-style question on your own", "Check again in a few days"]);
    expect(p.endsWithDelayedCheck).toBe(true);
    for (const line of [p.headline, p.why, ...p.steps]) expect(line).not.toMatch(JARGON);
  });
});

describe("what changed never turns one session into proof", () => {
  it("reports a fresh unaided success as progress with a caveat, not as proven", () => {
    const change = buildWhatChanged({
      plan: plan(["overdue-retrieval", "independent-application", "delayed-retrieval"]),
      completed: [record("overdue-retrieval", "passed-independent"), record("independent-application", "passed-independent"), record("delayed-retrieval", "scheduled")],
      proof: { status: "awaiting-proof", provableFrom: "2026-10-09", proofDue: false, illusory: false },
      lifecycle: { stage: "looks-learned", label: "Looks learned", claim: null },
    });
    expect(change.verdict).toBe("fresh-success");
    expect(change.before).toEqual({ focus: "Using it in exam questions", state: "Weak evidence" });
    expect(change.thisSession.map((l) => l.text)).toContain("Solved a fresh exam-style question without help");
    expect(change.nextProof).toBe("From 9 Oct: a question you have not seen, answered without help.");
    expect(change.caveat).toMatch(/not proof/);
    expect(change.chain.find((s) => s.stage === "delayed")?.status).toBe("pending");
    expect(change.chain.find((s) => s.stage === "outcome")?.status).toBe("pending");
    expect(change.chain.find((s) => s.stage === "different")?.status).toBe("not-applicable");
  });

  it("calls assisted success weaker evidence and only the lifecycle can say proven", () => {
    const assisted = buildWhatChanged({ plan: plan(["supported-practice"]), completed: [record("supported-practice", "passed-assisted")] });
    expect(assisted.thisSession[0]?.text).toMatch(/with a hint \(weaker evidence\)/);
    expect(assisted.verdict).toBe("practised");
    const proven = buildWhatChanged({ plan: plan(["transfer"]), completed: [record("transfer", "passed-independent")], lifecycle: { stage: "proven", label: "Proven improved", claim: "Improved from about 40% to about 75%." } });
    expect(proven.verdict).toBe("proven");
    expect(proven.caveat).toBeNull();
  });

  it("treats more misses than unaided passes as a repair, and an empty run as no evidence", () => {
    const repair = buildWhatChanged({ plan: plan(["independent-application", "transfer"]), completed: [record("independent-application", "missed"), record("transfer", "missed")] });
    expect(repair.verdict).toBe("needs-repair");
    expect(repair.chain.find((s) => s.stage === "different")?.status).toBe("missed");
    expect(buildWhatChanged({ plan: plan(["independent-application"]), completed: [] }).verdict).toBe("no-evidence");
  });

  it("says unknown, not weak, before any answers", () => {
    const change = buildWhatChanged({ plan: plan(["explanation"], { attempts: 0, focusState: "unknown" }), completed: [] });
    expect(change.before.state).toBe("No answers yet: unknown, not weak");
  });
});

const outcome = (overrides: Partial<InterventionOutcomeRecord> = {}): InterventionOutcomeRecord => ({
  id: "o1", userId: "u1", subjectId: "physics", topicId: "motion", capabilityId: "c1", kind: "guided", priorState: "weak", priorAccuracy: 0.3,
  evidenceVersion: 2, immediateFamilyId: "f1", timeMeasured: true, plannedMinutes: 10, actualMinutes: 10, support: "none",
  immediate: { awarded: 3, max: 3, independent: true, attemptId: "a1", at: "2026-09-01T10:00:00Z", trusted: true },
  createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z", ...overrides,
});

describe("intervention chains and memory", () => {
  it("marks a 'different' question from the same family as not counted", () => {
    const chain = interventionChain(outcome({ transfer: { awarded: 3, max: 3, independent: true, questionId: "q2", attemptId: "a2", at: "2026-09-02T10:00:00Z", familyId: "f1", trusted: true } }), "Motion graphs");
    expect(chain.steps.find((s) => s.stage === "different")?.status).toBe("not-counted");
    expect(chain.outcome).toBe("pending");
    expect(chain.outcomeLabel).toBe("Not proven yet");
  });

  it("waits for a delayed check before any outcome", () => {
    const chain = interventionChain(outcome(), "Motion graphs");
    expect(chain.steps.map((s) => s.stage)).toEqual(["problem", "intervention", "immediate", "different", "delayed", "outcome"]);
    expect(chain.steps.find((s) => s.stage === "delayed")?.status).toBe("pending");
  });

  it("says nothing personal from a small sample", () => {
    const memory = buildInterventionMemory({ records: [outcome()], topicTitle: (id) => id });
    expect(memory.personalised).toBe(false);
    expect(memory.observations).toEqual([]);
    expect(memory.recent).toHaveLength(1);
    expect(memory.emptyLine).not.toMatch(JARGON);
  });

  it("only speaks for enrolled subjects", () => {
    const memory = buildInterventionMemory({ records: [outcome()], topicTitle: (id) => id, subjectIds: ["maths"] });
    expect(memory.recent).toEqual([]);
  });
});

describe("trust indicator keeps provenance honest", () => {
  const physics = { id: "wjec-alevel-physics", name: "Physics", specCode: "A200QS", contentTier: "flagship" as const };
  const topic = { id: "motion", specRef: "Unit 1.2", specPoints: [{ id: "sp-1", ref: "Unit 1.2(a)", text: "", aos: [] }] };
  const q = (overrides: Partial<Question> = {}) => question("q1", "motion", { subjectId: "wjec-alevel-physics", specPointIds: ["sp-1"], ...overrides });

  it("never shows an unreviewed flagship question as checked or reviewed", () => {
    const t = buildTrustIndicator({ question: q({ verification: "verified" }), subject: physics, topics: [topic] });
    expect(t.tier).toBe("unverified");
    expect(t.status).toBe("Not yet checked by a person");
    expect(t.lastReviewed).toBeNull();
    expect(t.specification).toEqual({ title: "WJEC A Level Physics", code: "A200QS", refs: ["Unit 1.2(a)"], matched: true });
  });

  it("labels AI-generated content and never matches a reference subject to a specification", () => {
    const generated = buildTrustIndicator({ question: q({ origin: "ai", source: "generated" }), subject: physics, topics: [topic] });
    expect(generated.origin).toBe("Generated by AI and not reviewed by a person");
    const reference = buildTrustIndicator({
      question: question("q2", "motion", { subjectId: "aqa-alevel-physics", specPointIds: ["sp-1"] }),
      subject: { id: "aqa-alevel-physics", name: "Physics", contentTier: "reference" }, topics: [topic],
    });
    expect(reference.tier).toBe("reference");
    expect(reference.specification?.matched).toBe(false);
  });
});
