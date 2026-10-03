import { describe, expect, it } from "vitest";
import { evidenceGaps, topEvidenceGap, type GapExtras } from "@/domain/evidence-gaps";
import type { InterventionContext } from "@/domain/intervention-ranking";
import { confidenceWord, nearestFive, roughPercent, EVIDENCE_CONFIDENCE } from "@/domain/plain-numbers";

const ctx: InterventionContext = {
  topicId: "t", subjectId: "s", topicTitle: "T", qualificationShare: 0.05, daysToExam: 40, mastery: 0.6, recall: 0.8, application: null,
  transferProven: false, evidenceAttempts: 6, openMistakeMarks: 0, recurringMistakes: 0, repeatedMisconception: false, repeatedTechniqueError: false,
  dueCards: 0, forgettingRisk: 0.1, unseen: { recall: 2, application: 3, transfer: 2 }, prerequisiteWeak: null, delayedProofDue: false, fatigue: 0, paperMaterial: false,
};
const extras: GapExtras = { daysSinceEvidence: 3, distinctIndependent: 5, independentAttempts: 5, timedPaperAttempts: 0, trustedQuestions: 10, lowConfidenceMarks: 0, daysToExam: 40 };
const kinds = (c = ctx, e = extras) => evidenceGaps(c, e).map((gap) => gap.kind);

describe("evidence gaps", () => {
  it("says application is unmeasured when recall is known, with a bounded action", () => {
    const gap = topEvidenceGap(ctx, extras)!;
    expect(gap.kind).toBe("no-application");
    expect(gap.text).toMatch(/recall looks fine, but there is not enough evidence about application/);
    expect(gap.action).toMatchObject({ label: "Test application", minutes: 6 });
  });
  it("has no gap when evidence is broad", () => {
    expect(evidenceGaps({ ...ctx, application: 0.8, transferProven: true }, extras)).toEqual([]);
  });
  it("flags untrusted content first, so unreviewed items are never read as evidence", () => {
    expect(kinds(ctx, { ...extras, trustedQuestions: 0 })[0]).toBe("untrusted-content");
  });
  it("detects zero evidence and repeats-only evidence", () => {
    expect(kinds(ctx, { ...extras, independentAttempts: 0, distinctIndependent: 0 })).toContain("no-independent");
    const repeats = evidenceGaps(ctx, { ...extras, independentAttempts: 5, distinctIndependent: 1 }).find((gap) => gap.kind === "no-independent");
    expect(repeats?.text).toMatch(/Only repeats of the same question/);
  });
  it("reports low-confidence marks as not counting, and stale evidence with its age", () => {
    expect(evidenceGaps(ctx, { ...extras, lowConfidenceMarks: 2 }).find((gap) => gap.kind === "low-marking-confidence")?.text).toMatch(/2 answers were marked with low confidence/);
    expect(evidenceGaps(ctx, { ...extras, daysSinceEvidence: 45 }).find((gap) => gap.kind === "no-recent")?.text).toMatch(/45 days old/);
  });
  it("asks for an unfamiliar question only when one exists, and a delayed check only when due", () => {
    const strong = { ...ctx, application: 0.8 };
    expect(kinds(strong)).toContain("no-transfer");
    expect(kinds({ ...strong, unseen: { recall: 0, application: 0, transfer: 0 } })).not.toContain("no-transfer");
    expect(kinds({ ...strong, delayedProofDue: true })).toContain("no-delayed");
    expect(kinds(strong)).not.toContain("no-delayed");
  });
  it("only asks for timed-paper evidence when the exam is close and evidence is otherwise broad", () => {
    expect(kinds(ctx, { ...extras, daysToExam: 10 })).toContain("no-timed-paper");
    expect(kinds(ctx, { ...extras, daysToExam: 90 })).not.toContain("no-timed-paper");
    expect(kinds(ctx, { ...extras, daysToExam: -2 })).not.toContain("no-timed-paper");
    expect(kinds(ctx, { ...extras, daysToExam: null })).not.toContain("no-timed-paper");
  });
});

describe("plain numbers", () => {
  it("turns confidence into words and leaves unknown as null", () => {
    expect(confidenceWord(0.3)).toBe("low");
    expect(confidenceWord(0.7)).toBe("moderate");
    expect(confidenceWord(0.9)).toBe("high");
    expect(confidenceWord(0.5, EVIDENCE_CONFIDENCE)).toBe("moderate");
    expect(confidenceWord(null)).toBeNull();
    expect(confidenceWord(Number.NaN)).toBeNull();
  });
  it("rounds rates to the nearest five and clamps", () => {
    expect(nearestFive(0.46)).toBe(45);
    expect(nearestFive(0.72)).toBe(70);
    expect(nearestFive(1.4)).toBe(100);
    expect(roughPercent(0.5)).toBe("about 50%");
  });
});
