import { describe, expect, it } from "vitest";
import { specificationCoverageAudit, type SpecificationAuditCard } from "@/domain/specification-audit";
import type { SpecManifestEntry } from "@/domain/spec";
import type { Question, SpecPoint, Subject, Topic } from "@/domain/types";

const VERSION = "2024-1.0";
const CHECKED = "2026-08-01";
const SUBJECT_ID = "demo-alevel-physics";
const TOPIC_ID = `${SUBJECT_ID}.mechanics`;

function subject(overrides: Partial<Subject> = {}): Subject {
  return {
    id: SUBJECT_ID,
    qualificationId: "demo-alevel",
    name: "Physics",
    specCode: "D100",
    papers: [{ id: "p1", name: "Paper 1", weight: 1, durationMinutes: 120, calculatorAllowed: true }],
    gradeBoundaries: [{ grade: "A", percent: 80 }],
    spec: { version: VERSION, releaseDate: "2024-09-01", lastChecked: CHECKED },
    ...overrides,
  };
}

function point(id: string, ref: string, overrides: Partial<SpecPoint> = {}): SpecPoint {
  return {
    id,
    ref,
    text: `Explain ${ref}`,
    aos: ["AO1"],
    source: "authored",
    verification: "verified",
    reviewer: "reviewer",
    lastChecked: CHECKED,
    specVersion: VERSION,
    ...overrides,
  };
}

function topic(specPoints: SpecPoint[], overrides: Partial<Topic> = {}): Topic {
  return {
    id: TOPIC_ID,
    subjectId: SUBJECT_ID,
    unitId: `${SUBJECT_ID}.unit-1`,
    title: "Mechanics",
    order: 1,
    intrinsicDifficulty: 2,
    summary: "A sufficiently detailed mechanics topic for the audit fixture.",
    keyPoints: ["Explain the first principle", "Apply the second principle"],
    commonErrors: ["Confuses units", "Drops a sign"],
    specPoints,
    aos: ["AO1"],
    source: "authored",
    verification: "verified",
    reviewer: "reviewer",
    lastChecked: CHECKED,
    specVersion: VERSION,
    ...overrides,
  };
}

function question(id: string, specPointId: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    subjectId: SUBJECT_ID,
    topicIds: [TOPIC_ID],
    kind: "structured",
    stem: "Explain the principle.",
    parts: [{
      id: `${id}.a`,
      label: "a",
      prompt: "Explain.",
      marks: 1,
      markScheme: ["Correct explanation"],
      modelAnswer: "A correct explanation.",
      aos: ["AO1"],
      specPointIds: [specPointId],
      learningClaims: ["explain the principle"],
    }],
    totalMarks: 1,
    calculatorAllowed: false,
    difficulty: 2,
    origin: "seed",
    source: "authored",
    verification: "verified",
    reviewer: "reviewer",
    lastChecked: CHECKED,
    specVersion: VERSION,
    aos: ["AO1"],
    specPointIds: [specPointId],
    createdAt: `${CHECKED}T00:00:00.000Z`,
    ...overrides,
  };
}

function card(id: string, specPointId: string, overrides: Partial<SpecificationAuditCard> = {}): SpecificationAuditCard {
  return {
    id,
    subjectId: SUBJECT_ID,
    topicId: TOPIC_ID,
    specPointIds: [specPointId],
    specVersion: VERSION,
    lastChecked: CHECKED,
    ...overrides,
  };
}

function manifest(overrides: Partial<SpecManifestEntry> = {}): SpecManifestEntry {
  return {
    subjectId: SUBJECT_ID,
    boardId: "demo",
    qualificationId: "demo-alevel",
    specCode: "D100",
    level: "A Level",
    version: VERSION,
    releaseDate: "2024-09-01",
    lastChecked: CHECKED,
    statementsTotal: 2,
    ...overrides,
  };
}

describe("specificationCoverageAudit", () => {
  it("passes a complete statement, card and question mapping", () => {
    const first = point("sp-1", "1.1");
    const second = point("sp-2", "1.2", { verification: "checked" });
    const report = specificationCoverageAudit({
      subjects: [subject()],
      topics: [topic([first, second], { verification: "checked" })],
      questions: [question("q-1", first.id), question("q-2", second.id)],
      cards: [card("c-1", first.id), card("c-2", second.id)],
      manifest: [manifest()],
      today: "2026-08-18",
    });

    expect(report.status).toBe("pass");
    expect(report.totals).toMatchObject({
      subjects: 1,
      manifestStatements: 2,
      authoredStatements: 2,
      missingManifestStatements: 0,
      verifiedStatements: 1,
      statementsWithCards: 2,
      statementsWithQuestions: 2,
      errors: 0,
      warnings: 0,
    });
    expect(report.subjects[0]).toMatchObject({
      authoredCoverage: 100,
      verifiedCoverage: 50,
      learnableCoverage: 100,
      assessableCoverage: 100,
    });
  });

  it("separates expected curriculum-first gaps from structural failures", () => {
    const report = specificationCoverageAudit({
      subjects: [subject()],
      topics: [topic([point("sp-1", "1.1", { verification: "unverified" })], { verification: "unverified" })],
      questions: [],
      manifest: [manifest({ statementsTotal: 3 })],
      today: "2026-08-18",
    });

    expect(report.status).toBe("review");
    expect(report.totals.errors).toBe(0);
    expect(report.totals.missingManifestStatements).toBe(2);
    expect(report.issues.map((issue) => issue.kind)).toEqual(expect.arrayContaining([
      "manifest-count-gap",
      "unverified-spec-point",
      "statement-no-cards",
      "statement-no-questions",
    ]));
  });

  it("fails deterministically on duplicate, dangling and cross-topic mappings", () => {
    const duplicate = point("sp-1", "1.1");
    const brokenQuestion = question("q-broken", "unknown", {
      topicIds: ["other-topic"],
      parts: [{
        id: "q-broken.a",
        label: "a",
        prompt: "Explain.",
        marks: 2,
        markScheme: ["one", "two"],
        modelAnswer: "A complete answer.",
        specPointIds: ["unknown"],
        learningClaims: ["only one claim"],
      }],
      totalMarks: 2,
    });
    const report = specificationCoverageAudit({
      subjects: [subject()],
      topics: [topic([duplicate, point("sp-1", "1.1")])],
      questions: [brokenQuestion],
      cards: [card("c-broken", "unknown", { topicId: "other-topic" })],
      manifest: [manifest()],
      today: "2026-08-18",
    });

    expect(report.status).toBe("fail");
    expect(report.issues.map((issue) => issue.kind)).toEqual(expect.arrayContaining([
      "card-topic-mismatch",
      "dangling-card-spec-point",
      "dangling-question-spec-point",
      "duplicate-spec-point-id",
      "duplicate-spec-point-ref",
      "question-claim-alignment",
      "unmapped-question",
      "statement-no-cards",
      "statement-no-questions",
    ]));
  });

  it("flags stale and future-dated manifest content", () => {
    const report = specificationCoverageAudit({
      subjects: [subject()],
      topics: [topic([point("sp-1", "1.1")])],
      questions: [],
      manifest: [manifest({
        statementsTotal: 1,
        lastChecked: "2024-01-01",
        releaseDate: "2027-01-01",
      })],
      today: "2026-08-18",
      staleAfterDays: 365,
    });

    expect(report.issues.map((issue) => issue.kind)).toEqual(expect.arrayContaining(["future-date", "stale-spec-point"]));
    expect(report.status).toBe("fail");
  });
});
