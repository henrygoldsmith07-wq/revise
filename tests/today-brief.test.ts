import { describe, expect, it } from "vitest";
import { buildTodayBrief, countdownLabel } from "@/domain/today-brief";
import type { AdaptiveSessionPlan, AdaptiveStepKind } from "@/domain/adaptive-contract";
import type { PaperReadiness } from "@/domain/paper-readiness";
import type { Mistake } from "@/domain/types";
import type { TopicLifecycle } from "@/domain/proof-lifecycle";

const plan = (...kinds: AdaptiveStepKind[]): AdaptiveSessionPlan => ({
  key: "k", subjectId: "s", topicId: "t", topicTitle: "T", targetMinutes: 20, totalMinutes: 20, score: 1, reason: "", evidence: {} as AdaptiveSessionPlan["evidence"], startHref: "/x",
  steps: kinds.map((kind, i) => ({ id: `${i}`, kind, minutes: 5, label: kind, description: "", href: "", topicId: "t", subjectId: "s", cardIds: [], questionIds: [], mistakeIds: [] })),
});
const paper = (days: number | null, topics = ["t"]): PaperReadiness => ({ paperId: "p", name: "Unit 2", subjectId: "s", daysUntil: days, topicIds: topics } as PaperReadiness);
const mistake = (marks: number, resolved = false, topicId = "t"): Mistake => ({ id: `${marks}${resolved}`, topicId, marksLost: marks, resolved } as Mistake);
const NOW = new Date("2026-10-01T10:00:00Z");

describe("today brief", () => {
  it("uses the owning paper and its countdown", () => {
    const b = buildTodayBrief({ plan: plan("overdue-retrieval"), papers: [paper(18)], now: NOW });
    expect(b).toMatchObject({ paperName: "Unit 2", daysToExam: 18, examLabel: "18 days to the exam" });
  });
  it("stays unknown with no paper and no date", () => {
    expect(buildTodayBrief({ plan: plan("overdue-retrieval"), now: NOW })).toMatchObject({ paperName: null, daysToExam: null, examLabel: null });
  });
  it("falls back to the subject's next exam date, ignoring past ones", () => {
    const exams = [
      { id: "1", userId: "u", subjectId: "s", date: "2026-09-01", label: "" },
      { id: "2", userId: "u", subjectId: "s", date: "2026-10-04", label: "" },
    ];
    expect(buildTodayBrief({ plan: plan("transfer"), examDates: exams, now: NOW }).daysToExam).toBe(3);
  });
  it("totals only open mistakes on the topic", () => {
    const b = buildTodayBrief({ plan: plan("transfer"), mistakes: [mistake(3), mistake(2), mistake(5, true), mistake(9, false, "other")], now: NOW });
    expect(b).toMatchObject({ marksAtRisk: 5, openMistakes: 2 });
  });
  it("is honest that guided practice is not proof", () => {
    const b = buildTodayBrief({ plan: plan("overdue-retrieval", "supported-practice"), now: NOW });
    expect(b.doesNotProve).toMatch(/do not count as independent proof/);
    expect(b.produces).toEqual(["a check of what you still remember"]);
  });
  it("lists the evidence a full ladder produces", () => {
    const b = buildTodayBrief({ plan: plan("overdue-retrieval", "independent-application", "transfer", "delayed-retrieval"), now: NOW });
    expect(b.produces).toHaveLength(4);
    expect(b.doesNotProve).toBeNull();
  });
  it("is honest that a pick with no marked answers is provisional, and says what it was based on", () => {
    const cold = { ...plan("overdue-retrieval"), evidence: { attempts: 0 } } as AdaptiveSessionPlan;
    expect(buildTodayBrief({ plan: cold, papers: [paper(18)], now: NOW }).provisional).toMatch(/exam date and how much of the specification/);
    expect(buildTodayBrief({ plan: cold, now: NOW }).provisional).toMatch(/chosen from how much of the specification/);
    const evidenced = { ...plan("overdue-retrieval"), evidence: { attempts: 6 } } as AdaptiveSessionPlan;
    expect(buildTodayBrief({ plan: evidenced, now: NOW }).provisional).toBeNull();
    expect(buildTodayBrief({ plan: cold, mistakes: [mistake(2)], now: NOW }).provisional).toBeNull();
  });
  it("carries the proof state so a good session is never shown as mastery", () => {
    const looks = { topicId: "t", stage: "looks-learned", label: "Looks learned", line: "not proof yet", claim: null, dueNow: false, memorised: false } as TopicLifecycle;
    expect(buildTodayBrief({ plan: plan("transfer"), lifecycle: looks, now: NOW }).lifecycle).toEqual({ label: "Looks learned", line: "not proof yet", dueNow: false });
    expect(buildTodayBrief({ plan: plan("transfer"), lifecycle: { ...looks, stage: "not-started" }, now: NOW }).lifecycle).toBeNull();
    expect(buildTodayBrief({ plan: plan("transfer"), now: NOW }).lifecycle).toBeNull();
  });
  it("labels past and same-day exams", () => {
    expect(countdownLabel(-2)).toBe("Exam date has passed");
    expect(countdownLabel(0)).toBe("Exam today");
    expect(countdownLabel(1)).toBe("1 day to the exam");
  });
});
