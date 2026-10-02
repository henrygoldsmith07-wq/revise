import { describe, expect, it } from "vitest";
import { examPhase, explainIntervention, rankInterventions, type InterventionContext } from "@/domain/intervention-ranking";

const base: InterventionContext = {
  topicId: "t", subjectId: "s", topicTitle: "Capacitors", paperName: "Unit 2", qualificationShare: 0.08,
  daysToExam: 18, mastery: 0.5, recall: 0.8, application: 0.45, transferProven: false, evidenceAttempts: 10,
  openMistakeMarks: 0, recurringMistakes: 0, repeatedMisconception: false, repeatedTechniqueError: false,
  dueCards: 0, forgettingRisk: 0.2, unseen: { recall: 3, application: 4, transfer: 2 }, prerequisiteWeak: null,
  delayedProofDue: false, fatigue: 0, paperMaterial: true,
};
const top = (ctx: InterventionContext, max?: number) => rankInterventions([ctx], { maxMinutes: max })[0];

describe("intervention ranking", () => {
  it("picks application work when recall is secure and application is weak", () => {
    expect(top(base)?.kind).toBe("independent-set");
  });
  it("offers a first-pass lesson only with zero evidence", () => {
    const zero = { ...base, mastery: null, recall: null, application: null, evidenceAttempts: 0, daysToExam: null };
    expect(rankInterventions([zero]).map((r) => r.kind)).toContain("first-pass-lesson");
    expect(rankInterventions([base]).map((r) => r.kind)).not.toContain("first-pass-lesson");
  });
  it("prefers repair kinds for repeated misconception, technique error and weak prerequisite", () => {
    expect(top({ ...base, repeatedMisconception: true, application: 0.8, mastery: 0.7, recall: 0.9 })?.kind).toBe("misconception-correction");
    expect(top({ ...base, repeatedTechniqueError: true, application: 0.8, mastery: 0.7, recall: 0.9, transferProven: true })?.kind).toBe("technique-intervention");
    expect(top({ ...base, prerequisiteWeak: { topicId: "p", title: "Algebra" }, recall: 0.7, application: 0.3 })?.kind).toBe("prerequisite-repair");
  });
  it("moves to transfer once application is secure and no unfamiliar success exists", () => {
    const kinds = rankInterventions([{ ...base, application: 0.8, mastery: 0.8 }]).map((r) => r.kind);
    expect(kinds).toContain("transfer-set");
  });
  it("never recommends interventions without unseen supply", () => {
    const none = { ...base, unseen: { recall: 0, application: 0, transfer: 0 } };
    const kinds = rankInterventions([{ ...none, application: 0.8, mastery: 0.8 }]).map((r) => r.kind);
    expect(kinds).not.toContain("independent-set");
    expect(kinds).not.toContain("transfer-set");
  });
  it("does not offer full papers early, without paper material, or with thin evidence", () => {
    expect(rankInterventions([{ ...base, daysToExam: 90 }]).map((r) => r.kind)).not.toContain("full-paper");
    expect(rankInterventions([{ ...base, daysToExam: 5, paperMaterial: false }]).map((r) => r.kind)).not.toContain("full-paper");
    expect(rankInterventions([{ ...base, daysToExam: 5, evidenceAttempts: 3 }]).map((r) => r.kind)).not.toContain("full-paper");
    expect(rankInterventions([{ ...base, daysToExam: 5, evidenceAttempts: 14 }]).map((r) => r.kind)).toContain("full-paper");
  });
  it("respects the time available and discounts long work when fatigued", () => {
    expect(rankInterventions([{ ...base, daysToExam: 5, evidenceAttempts: 14 }], { maxMinutes: 20 }).every((r) => r.minutes <= 20)).toBe(true);
    const fresh = rankInterventions([{ ...base, daysToExam: 5, evidenceAttempts: 14 }]).find((r) => r.kind === "full-paper")!;
    const tired = rankInterventions([{ ...base, daysToExam: 5, evidenceAttempts: 14, fatigue: 1 }]).find((r) => r.kind === "full-paper")!;
    expect(tired.valuePerMinute).toBeLessThan(fresh.valuePerMinute);
  });
  it("treats past exams as low urgency and no date as neutral", () => {
    expect(examPhase(-3)).toBe("past");
    expect(examPhase(null)).toBe("none");
    expect(top({ ...base, daysToExam: -3 })!.valuePerMinute).toBeLessThan(top({ ...base, daysToExam: null })!.valuePerMinute);
  });
  it("is deterministic and ranks the bigger exam stake first across topics", () => {
    const small = { ...base, topicId: "a", qualificationShare: 0.02 };
    const big = { ...base, topicId: "b", qualificationShare: 0.1 };
    expect(rankInterventions([small, big])[0]!.topicId).toBe("b");
    expect(rankInterventions([big, small])).toEqual(rankInterventions([small, big]));
  });
  it("explains in plain language without decimals", () => {
    const pick = top(base)!;
    const text = explainIntervention(base, pick);
    expect(text.headline).toBe("15-minute capacitors application session");
    expect(text.lines.join(" ")).toMatch(/Recall is reasonably secure \(80%\), but application is weak \(45%\)/);
    expect(text.lines.join(" ")).toMatch(/exam is in 18 days/);
    expect(text.lines.join(" ")).not.toMatch(/\d\.\d/);
  });
  it("says so when evidence is missing and no date is set", () => {
    const text = explainIntervention({ ...base, recall: null, application: null, daysToExam: null }, { kind: "first-pass-lesson", minutes: 12 });
    expect(text.lines.join(" ")).toMatch(/not enough evidence/);
    expect(text.lines.join(" ")).toMatch(/No exam date/);
  });
});
