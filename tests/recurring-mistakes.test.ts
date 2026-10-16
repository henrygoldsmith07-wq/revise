import { describe, expect, it } from "vitest";
import { buildLearnerIntelligence, recurringOpenMistakes } from "@/domain/learner-intelligence";
import { prescribeIntervention } from "@/domain/intervention-engine";
import type { Mistake } from "@/domain/types";

function mistake(over: Partial<Mistake>): Mistake {
  return {
    id: over.id ?? "m",
    userId: "u",
    subjectId: "s",
    topicId: "t1",
    questionId: "q1",
    attemptId: "a1",
    marksLost: 1,
    resolved: false,
    createdAt: "2026-10-01T10:00:00.000Z",
    misconception: "conceptual",
    ...over,
  } as Mistake;
}

describe("recurring mistakes mean a repeat across different questions", () => {
  it("one wrong answer is never a repeat, however many points it missed", () => {
    const oneAnswer = [mistake({ id: "m1" }), mistake({ id: "m2" }), mistake({ id: "m3" })];
    expect(recurringOpenMistakes(oneAnswer)).toBe(0);
  });

  it("the same misconception on two different questions is a repeat", () => {
    expect(recurringOpenMistakes([mistake({ id: "m1", questionId: "q1" }), mistake({ id: "m2", questionId: "q2", attemptId: "a2" })])).toBe(2);
  });

  it("different misconceptions, or the unlabelled 'other', do not repeat", () => {
    expect(recurringOpenMistakes([mistake({ id: "m1", questionId: "q1" }), mistake({ id: "m2", questionId: "q2", misconception: "units" })])).toBe(0);
    expect(recurringOpenMistakes([mistake({ id: "m1", questionId: "q1", misconception: "other" }), mistake({ id: "m2", questionId: "q2", misconception: "other" })])).toBe(0);
  });

  it("a library entry id identifies the idea more precisely than the coarse tag", () => {
    const rows = [
      mistake({ id: "m1", questionId: "q1", misconceptionEntryId: "e1" }),
      mistake({ id: "m2", questionId: "q2", misconceptionEntryId: "e2" }),
    ];
    expect(recurringOpenMistakes(rows)).toBe(0);
    expect(recurringOpenMistakes([...rows, mistake({ id: "m3", questionId: "q3", misconceptionEntryId: "e1" })])).toBe(2);
  });

  it("after a single wrong first answer the plan no longer claims the same idea cost marks more than once", () => {
    const intel = buildLearnerIntelligence({
      topicIds: ["t1"],
      topicSubject: () => "s",
      mastery: [],
      recallMastery: [],
      applicationMastery: [],
      attempts: [],
      mistakes: [mistake({ id: "m1" }), mistake({ id: "m2" }), mistake({ id: "m3" })],
      proof: [],
      examDates: [],
      now: new Date("2026-10-02T10:00:00.000Z"),
    });
    const row = intel.subjects.flatMap((s) => s.topics).find((t) => t.topicId === "t1")!;
    expect(row.recurringMistakes).toBe(0);
    const plan = prescribeIntervention(row, "Topic");
    expect(plan.steps.map((s) => s.kind)).not.toContain("misconception-repair");
    expect(plan.steps.map((s) => s.why).join(" ")).not.toContain("more than once");
  });
});
