import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ApplicationMasteryRow } from "@/domain/application-mastery";
import { buildCommandCentre } from "@/domain/exam-command-centre";
import type { ExamOutlookRow } from "@/domain/exam-outlook";
import type { ExamReadiness } from "@/domain/exam-readiness";
import { buildExamTrajectory } from "@/domain/exam-trajectory";
import { LEARNER_MODEL_OWNERS, projectSubjectModel, type SubjectLearnerModel } from "@/domain/learner-model";
import { buildMarkRecovery } from "@/domain/mark-recovery";
import type { TopicLifecycle } from "@/domain/proof-lifecycle";
import type { RecallMasteryRow } from "@/domain/recall-mastery";
import type { RevisionAction } from "@/domain/revision-engine";
import type { ExamDate } from "@/domain/types";
import { attempt, mistake, question } from "./helpers-recovery";

const NOW = new Date("2026-10-06T12:00:00Z");
const JARGON = /optimi[sz]|weighting|capabilit|interventi|effectiveness|ranking|\bscor(e|ing)\b|factor|evidence rung|\brung\b|calibrat|\bFSRS\b|ledger|attestation|posterior/i;

const topics = [
  { id: "algebra", title: "Algebra" },
  { id: "geometry", title: "Geometry" },
  { id: "calculus", title: "Calculus" },
];

const life = (topicId: string, stage: TopicLifecycle["stage"], extra: Partial<TopicLifecycle> = {}): TopicLifecycle => ({
  topicId, stage, label: stage, line: "", claim: null, dueNow: false, memorised: false, ...extra,
});

const recallRow = (topicId: string, mastery: number, evidence: RecallMasteryRow["evidence"]): RecallMasteryRow => ({
  topicId, subjectId: "maths", mastery, currentRetention: mastery, trueRetention: null, cardsTotal: 4, cardsDue: 1, reviews: 6, recalled: 5, lastReviewedAt: null, evidence,
});

const appRow = (topicId: string, mastery: number, evidence: ApplicationMasteryRow["evidence"]): ApplicationMasteryRow => ({
  topicId, subjectId: "maths", mastery, accuracy: mastery, recentAccuracy: null, marksAwarded: 3, marksAvailable: 9, attempts: 3, questionsAttempted: 3, averageDifficulty: 3, lastAttemptAt: null, evidence,
});

function model(): SubjectLearnerModel {
  const questions = [question("q-a1", "algebra"), question("q-g1", "geometry")];
  const mistakes = [mistake("m1", { topicId: "algebra", questionId: "q-a1", attemptId: "att-m1", marksLost: 3, createdAt: "2026-09-20T10:00:00Z" })];
  const attempts = [attempt("att-m1", "q-a1", 0, 3, "2026-09-20T10:00:00Z")];
  return projectSubjectModel({
    subjectId: "maths",
    topics,
    lifecycles: [life("algebra", "weak"), life("geometry", "fading"), life("calculus", "not-started")],
    recall: [recallRow("algebra", 0.85, "reliable"), recallRow("geometry", 0.4, "emerging"), recallRow("calculus", 0, "unmeasured")],
    application: [appRow("algebra", 0.3, "emerging"), appRow("geometry", 0.8, "reliable"), appRow("calculus", 0.1, "unmeasured")],
    recovery: buildMarkRecovery({ mistakes, attempts, questions, now: NOW }),
  });
}

describe("learner model ownership", () => {
  it("names exactly one owner per facet, and every owner file exists", () => {
    const facets = LEARNER_MODEL_OWNERS.map((o) => o.facet);
    expect(new Set(facets).size).toBe(facets.length);
    expect(facets).toEqual(["curriculum", "recall", "application", "examTechnique", "mistakes", "retention", "transfer", "confidence", "interventions", "outcomes"]);
    for (const owner of LEARNER_MODEL_OWNERS) {
      for (const file of owner.owner.split(" + ")) expect(existsSync(join(process.cwd(), file)), file).toBe(true);
      expect(owner.whyItMatters.length).toBeGreaterThan(10);
    }
  });

  it("is documented for people in docs/learner-model.md", () => {
    expect(existsSync(join(process.cwd(), "docs/learner-model.md"))).toBe(true);
  });
});

describe("projectSubjectModel", () => {
  const m = model();

  it("keeps recall and application distinct, and finds the knows-it-cannot-use-it gap", () => {
    expect(m.recall.weak.map((r) => r.topicId)).toEqual(["geometry"]);
    expect(m.application.weak.map((r) => r.topicId)).toEqual(["algebra"]);
    expect(m.application.recallStrongApplicationWeak.map((r) => r.topicId)).toEqual(["algebra"]);
  });

  it("never treats unmeasured evidence as weak", () => {
    expect(m.recall.weak.some((r) => r.topicId === "calculus")).toBe(false);
    expect(m.application.weak.some((r) => r.topicId === "calculus")).toBe(false);
    expect(m.recall.measuredTopics).toBe(2);
  });

  it("reads lost marks from mark recovery, and coverage and retention from the lifecycle", () => {
    expect(m.mistakes.open).toBeGreaterThan(0);
    expect(m.mistakes.topics[0]?.topicId).toBe("algebra");
    expect(m.curriculum).toEqual({ topics: 3, started: 2, notStarted: 1 });
    expect(m.retention.fading.map((r) => r.topicId)).toEqual(["geometry"]);
  });

  it("claims no proven outcome without the proof ledger", () => {
    expect(m.outcomes.proven).toEqual([]);
    expect(m.outcomes.provenMarkPoints).toBe(0);
    expect(m.confidence.readinessStatus).toBeNull();
  });
});

const outlook = (overrides: Partial<ExamOutlookRow> = {}): ExamOutlookRow => ({
  subjectId: "maths", attempts: 10, independentAttempts: 8, percent: 62, grade: "B", low: 52, high: 72, confidence: 0.6, provisional: false, ...overrides,
});

describe("exam trajectory", () => {
  const m = model();

  it("shows no number without marked answers, and a forming message before the minimum", () => {
    expect(buildExamTrajectory({ model: m, outlook: null }).position.kind).toBe("none");
    const forming = buildExamTrajectory({ model: m, outlook: outlook({ attempts: 1 }) });
    expect(forming.position.kind).toBe("forming");
    expect(forming.heading).not.toMatch(/%/);
  });

  it("labels a provisional band as an early estimate and never adds a target claim", () => {
    const t = buildExamTrajectory({ model: m, outlook: outlook({ provisional: true }), targetGrade: "A" });
    expect(t.heading).toContain("Early estimate");
    expect(t.heading).not.toContain("target");
    expect(t.risk).toBe("too-early");
  });

  it("uses readiness for risk and only filters the plan's own actions for levers", () => {
    const readiness = { subjectId: "maths", status: "at-risk", gapPercent: 8, targetGrade: "A", confidence: 0.7 } as ExamReadiness;
    const actions = [
      { id: "a1", subjectId: "physics", title: "Other subject", minutes: 10, route: { href: "/x", label: "Start" } },
      { id: "a2", subjectId: "maths", title: "Recover 3 marks: Algebra", minutes: 12.2, route: { href: "/m", label: "Start" } },
    ] as RevisionAction[];
    const t = buildExamTrajectory({ model: m, outlook: outlook(), readiness, actions });
    expect(t.riskLabel).toBe("At risk");
    expect(t.heading).toContain("below your A target");
    expect(t.levers).toEqual([{ id: "a2", title: "Recover 3 marks: Algebra", minutes: 13, href: "/m" }]);
  });

  it("explains drivers in plain words", () => {
    const t = buildExamTrajectory({ model: m, outlook: outlook() });
    expect(t.drivers.length).toBeGreaterThan(0);
    expect(t.drivers.length).toBeLessThanOrEqual(3);
    for (const line of [...t.drivers, t.heading]) expect(line).not.toMatch(JARGON);
    expect(t.provenLine).toBeNull();
  });
});

describe("exam command centre", () => {
  const exam = (subjectId: string, days: number): ExamDate => ({ id: `e-${subjectId}`, userId: "u1", subjectId, date: new Date(NOW.getTime() + days * 86_400_000).toISOString().slice(0, 10), label: subjectId });

  it("orders subjects by the nearest exam and leads with one sentence", () => {
    const maths = model();
    const physics = { ...model(), subjectId: "physics" };
    const centre = buildCommandCentre({
      now: NOW, subjectIds: ["maths", "physics"], subjectName: (id) => (id === "maths" ? "Maths" : "Physics"),
      models: [maths, physics], examDates: [exam("maths", 40), exam("physics", 12)],
    });
    expect(centre.subjects.map((s) => s.subjectId)).toEqual(["physics", "maths"]);
    expect(centre.headline).toBe("Your next exam is Physics, in 12 days.");
    expect(centre.subjects[0]?.exam?.days).toBe(12);
    expect(centre.provenTopics).toBe(0);
  });

  it("asks for exam dates rather than inventing a timeline", () => {
    const centre = buildCommandCentre({ now: NOW, subjectIds: ["maths"], subjectName: () => "Maths", models: [model()], examDates: [] });
    expect(centre.headline).toMatch(/Add your exam dates/);
    expect(centre.subjects[0]?.exam).toBeNull();
  });

  it("ignores models for subjects the learner is not taking", () => {
    const centre = buildCommandCentre({ now: NOW, subjectIds: [], subjectName: () => "Maths", models: [model()], examDates: [] });
    expect(centre.subjects).toEqual([]);
  });
});
