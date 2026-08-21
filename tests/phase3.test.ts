import { describe, expect, it } from "vitest";
import { allTopics, topicsFor } from "@/domain/curriculum";
import { seedQuestions } from "@/content";
import { seedCardsForTopic } from "@/content/seed-cards";
import { coverageForSubject } from "@/domain/coverage";
import { assessmentNarrative, dependencyNarrative, overallProgressNarrative, progressNarrative } from "@/domain/analytics";
import { regressionReport } from "@/domain/content-review";
import { nextMistakeLoop } from "@/domain/mistakes";
import { buildPlan } from "@/domain/planner";
import { normaliseMath } from "@/domain/diagrams";
import type { Mistake } from "@/domain/types";

describe("phase 3 — planner workload/fatigue", () => {
  it("caps daily minutes", () => {
    const topics = topicsFor("wjec-alevel-physics").slice(0,2);
    const everyDay = Array.from({length:7},(_,w)=>({weekday:w, minutes:180}));
    const uncapped = buildPlan({ userId:"u", topics, mastery:[], exams:[], availability: everyDay, sessionLengthMinutes:30, subjectIds:["wjec-alevel-physics"], horizonDays:2, now:new Date("2025-06-02T08:00:00Z"), idFactory:(()=>{let n=0;return()=>`id-${n++}`;})() });
    const capped = buildPlan({ userId:"u", topics, mastery:[], exams:[], availability: everyDay, sessionLengthMinutes:30, subjectIds:["wjec-alevel-physics"], dailyMinutesCap:60, horizonDays:2, now:new Date("2025-06-02T08:00:00Z"), idFactory:(()=>{let n=0;return()=>`id-${n++}`;})() });
    expect(capped.length).toBeLessThan(uncapped.length);
  });
});

describe("phase 3 — analytics narratives", () => {
  it("progressNarrative returns a headline and CTA", () => {
    const topics = topicsFor("wjec-alevel-biology");
    const qs = seedQuestions.filter((q)=> q.subjectId==="wjec-alevel-biology");
    const cardsPerTopic = new Map(topics.map((t)=> [t.id, seedCardsForTopic(t,"u").length]));
    const cov = coverageForSubject(topics, qs, cardsPerTopic);
    const n = progressNarrative({ subjectLabel:"WJEC Biology", masteryAvg:0.55, coverage: cov, weakCount:3, weakTop:"Enzymes" });
    expect(n.headline).toContain("WJEC Biology");
    expect(n.paragraphs.length).toBeGreaterThan(0);
    expect(n.cta).toContain("Enzymes");
  });
  it("overallProgressNarrative turns evidence into a next move", () => {
    const n = overallProgressNarrative({
      mastery: [
        { topicId: "t1", subjectId: "s", mastery: 0.42, retention: 0.4, confidence: 0.4, cardsTotal: 2, cardsDue: 1, attempts: 1, accuracy: 0.4, lastStudiedAt: null, weak: true },
        { topicId: "t2", subjectId: "s", mastery: 0.84, retention: 0.8, confidence: 0.8, cardsTotal: 3, cardsDue: 0, attempts: 2, accuracy: 0.8, lastStudiedAt: null, weak: false },
      ],
      attempts: [{ awarded: 6, max: 10, createdAt: "2026-08-10T12:00:00Z" }],
      dueCards: 4,
      openMistakes: 2,
      weakTop: "Kinetics",
      now: new Date("2026-08-18T12:00:00Z"),
    });
    expect(n.headline).toContain("Steady progress");
    expect(n.paragraphs.join(" ")).toContain("Kinetics");
    expect(n.bullets?.join(" ")).toContain("1/2 topics");
    expect(n.cta).toBe("Practise Kinetics");
  });
  it("assessmentNarrative handles empty insight", () => {
    const n = assessmentNarrative({ byCommand:{} as never, byMisconception:{} as never, marksLostByTopic:[], marksLostByAo:{}, repeatedWeakSubtopics:[], expectedMarksPerHour:[], techniqueVsKnowledge: { knowledgeLost: 0, techniqueLost: 0, knowledgeShare: 0, techniqueShare: 0, totalLost: 0, reliable: false, narrative: "", drivers: [] } }, ()=> "topic");
    expect(n.headline).toMatch(/No marks/);
  });
  it("dependencyNarrative returns null when nothing blocked", () => {
    expect(dependencyNarrative([], ()=> "t")).toBeNull();
  });
});

describe("phase 3 — content review regression", () => {
  it("passes on the real bank", () => {
    const topics = allTopics();
    const r = regressionReport({ topics, questions: seedQuestions, today: "2026-08-15" });
    // Should be green apart from stale window (today far from 2026-08-01 is still within 365). Possibly zero flags.
    expect(r.ok || r.flags.every((f)=> f.kind==="stale-check")).toBe(true);
  });
});

describe("phase 3 — mistake auto-loop", () => {
  it("orders by marksLost then recency", () => {
    const ms: Mistake[] = [
      { id:"m1", userId:"u", subjectId:"s", topicId:"t", marksLost:1, description:"d", category:"recall", resolved:false, cardId:"c1", createdAt:"2025-06-01T00:00:00Z" },
      { id:"m2", userId:"u", subjectId:"s", topicId:"t", marksLost:3, description:"d", category:"recall", resolved:false, cardId:"c2", createdAt:"2025-06-02T00:00:00Z" },
      { id:"m3", userId:"u", subjectId:"s", topicId:"t", marksLost:3, description:"d", category:"recall", resolved:false, cardId:"c3", createdAt:"2025-06-03T00:00:00Z" },
    ] as unknown as Mistake[];
    expect(nextMistakeLoop(ms as Mistake[])).toEqual(["c3","c2","c1"]);
  });
});

describe("phase 3 — maths handwriting helper", () => {
  it("normalises unicode maths", () => {
    expect(normaliseMath("a – b × 2 ²")).toBe("a - b * 2 ^2");
  });
});
