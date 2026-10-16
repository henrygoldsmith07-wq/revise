import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { interventionStepLabel, prescribeIntervention, prescriptionAfterFailedProof } from "@/domain/intervention-engine";
import { learnerEvidenceTrusted, reviewedQuestionCount } from "@/domain/content-trust";
import { choosePracticeNextStep } from "@/domain/practice-next-step";
import type { TopicIntelligence } from "@/domain/learner-intelligence";

// Evidence claims must match what the domain records for the question's trust
// state. An answer on a question without two-check teacher review
// (learnerEvidenceTrusted false) is practice whatever the step: the plan and
// the step pages must never promise it "counts as evidence".

const PROMISE = /counts as (your own )?evidence|will count as evidence|counts as independent evidence/i;

const base = {
  topicId: "t1", subjectId: "s1", mastery: 0.4, recall: 0.8, application: 0.3, applicationGap: 0.5,
  retention: 0.5, uncertainty: 0.3, evidenceAttempts: 6, evidence: "some", marksLost: 4, marksRecoverable: 4,
  openMistakes: 2, recurringMistakes: 0, daysSinceSuccess: 4, daysToExam: 60, proofStatus: "awaiting-proof",
  commandWeakness: "explain", timingWeakness: false,
} as unknown as TopicIntelligence;

const shapes: Partial<TopicIntelligence>[] = [
  {}, { recall: 0.3 }, { recurringMistakes: 3 }, { applicationGap: null, application: 0.2 },
  { evidence: "regressed" } as never, { commandWeakness: null } as never, { proofStatus: null, daysSinceSuccess: null } as never,
];

describe("repair plan on a topic with no teacher-reviewed questions", () => {
  it("no step counts as proof, and no step promises evidence", () => {
    for (const shape of shapes) {
      const plan = prescribeIntervention({ ...base, ...shape } as TopicIntelligence, "Topic", { reviewedQuestions: 0 });
      expect(plan.proofRequired).toBe(false);
      expect(plan.headline.startsWith("Proof check")).toBe(false);
      for (const step of plan.steps) {
        expect(step.countsAsProof).toBe(false);
        expect(step.why).not.toMatch(PROMISE);
        expect(interventionStepLabel(step)).not.toBe("Proof check");
      }
    }
  });

  it("keeps the same steps, links and minutes; only the claim changes", () => {
    for (const shape of shapes) {
      const topic = { ...base, ...shape } as TopicIntelligence;
      const reviewed = prescribeIntervention(topic, "Topic", { reviewedQuestions: 3 });
      const practice = prescribeIntervention(topic, "Topic", { reviewedQuestions: 0 });
      expect(practice.steps.map((s) => [s.kind, s.href, s.minutes, s.title]))
        .toEqual(reviewed.steps.map((s) => [s.kind, s.href, s.minutes, s.title]));
      expect(practice.totalMinutes).toBe(reviewed.totalMinutes);
    }
  });

  it("unaided, timed and delayed steps say they are recorded as practice", () => {
    const plan = prescribeIntervention(base, "Topic", { reviewedQuestions: 0 });
    const kinds = new Map(plan.steps.map((s) => [s.kind, s]));
    for (const kind of ["exam-style-question", "timed-question", "delayed-proof"] as const) {
      expect(kinds.get(kind)?.why).toMatch(/has been checked by a teacher yet, so it is recorded as practice$/);
    }
    expect(interventionStepLabel(kinds.get("delayed-proof")!)).toBe("Delayed check");
    expect(prescriptionAfterFailedProof(base, "Topic", { reviewedQuestions: 0 }).steps.some((s) => s.countsAsProof)).toBe(false);
  });

  it("the after-a-lost-mark next step never promises evidence either", () => {
    for (const shape of [{ evidence: "regressed", recall: 0.9, application: 0.9, applicationGap: null, recurringMistakes: 0, commandWeakness: null }, {}] as Partial<TopicIntelligence>[]) {
      const plan = prescribeIntervention({ ...base, ...shape } as TopicIntelligence, "Topic", { reviewedQuestions: 0 });
      const next = choosePracticeNextStep({
        techniqueRepair: null,
        prescription: { headline: plan.headline, topicTitle: "Topic", firstStep: plan.steps[0] },
        fallback: { label: "Keep practising", why: "" },
      });
      expect(JSON.stringify(next)).not.toMatch(PROMISE);
      expect(next.cta ?? "").not.toMatch(/Proof check/);
    }
  });
});

describe("repair plan on a topic with reviewed questions", () => {
  it("still marks unaided, timed and delayed steps as able to count", () => {
    for (const options of [{ reviewedQuestions: 2 }, {}]) {
      const plan = prescribeIntervention(base, "Topic", options);
      const proofKinds = plan.steps.filter((s) => s.countsAsProof).map((s) => s.kind);
      expect(proofKinds).toEqual(expect.arrayContaining(["exam-style-question", "timed-question", "delayed-proof"]));
      expect(interventionStepLabel(plan.steps.find((s) => s.kind === "delayed-proof")!)).toBe("Proof check");
      // Even here, one answer is never called proof outright: "can count".
      expect(plan.steps.map((s) => s.why).join(" ")).not.toMatch(/first answer that counts as evidence|will count as evidence/);
    }
  });
});

describe("reviewedQuestionCount uses the learner-evidence predicate", () => {
  it("agrees with learnerEvidenceTrusted on the shipped bank, and never counts reference-tier content", async () => {
    const { seedQuestions } = await import("@/content");
    const topics = [...new Set(seedQuestions.flatMap((q) => q.topicIds))];
    expect(topics.length).toBeGreaterThan(50);
    const counted = topics.filter((topicId) => reviewedQuestionCount(seedQuestions, topicId) > 0);
    expect(counted).toEqual(topics.filter((topicId) => seedQuestions.some((q) => q.topicIds.includes(topicId) && learnerEvidenceTrusted(q))));
    // Reference-tier content passes the permissive authoring predicate but can
    // never carry learner evidence, so it never counts here.
    const reference = seedQuestions.find((q) => !q.subjectId.startsWith("wjec-alevel-"));
    if (reference) expect(reviewedQuestionCount([reference], reference.topicIds[0]!)).toBe(0);
  });

  it("counts questions approved through the real review workflow (fixture only)", async () => {
    const { seedQuestions } = await import("@/content");
    const { trustViaWorkflow } = await import("../e2e/review-fixture");
    const maths = seedQuestions.filter((q) => q.subjectId === "wjec-alevel-maths");
    const trusted = trustViaWorkflow("wjec-alevel-maths", maths, 2);
    expect(trusted.length).toBeGreaterThan(0);
    const topicId = trusted[0]!.topicIds[0]!;
    const byId = new Map(trusted.map((q) => [q.id, q]));
    const bank = maths.map((q) => byId.get(q.id) ?? q);
    expect(reviewedQuestionCount(bank, topicId)).toBe(trusted.filter((q) => q.topicIds.includes(topicId)).length);
    expect(reviewedQuestionCount(maths, topicId)).toBe(0);
  });
});

describe("step pages", () => {
  const runner = readFileSync("src/components/QuestionRunner.tsx", "utf8");
  const practice = readFileSync("src/app/practice/page.tsx", "utf8");
  it("the unaided note promises evidence only on a reviewed question", () => {
    const at = runner.indexOf("counts as your own evidence");
    expect(at).toBeGreaterThan(-1);
    expect(runner.slice(Math.max(0, at - 200), at)).toContain("learnerEvidenceTrusted(question)");
    expect(runner.match(/counts as your own evidence/g)).toHaveLength(1);
  });
  it("the unaided step heading makes no evidence claim for questions it has not seen", () => {
    expect(practice).not.toMatch(PROMISE);
  });
  it("guided and worked steps say proof needs a reviewed question", () => {
    expect(runner).toContain("Only an unaided answer on a teacher-reviewed question can count as proof.");
    expect(readFileSync("src/components/WorkedExamplePanel.tsx", "utf8")).toContain("Only an unaided answer on a teacher-reviewed question can count as proof.");
  });
});
