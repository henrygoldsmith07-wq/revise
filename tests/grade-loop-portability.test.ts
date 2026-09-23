import { describe, expect, it } from "vitest";
import { buildPortabilitySnapshot, parsePortabilitySnapshot } from "@/domain/portability";
import type { ActualResultRecord, GradePredictionRecord } from "@/domain/grade-loop";

const prediction: GradePredictionRecord = {
  id: "gp-u:physics:42",
  anonId: "u",
  subjectId: "physics",
  predictedPercent: 72,
  lowerPercent: 64,
  upperPercent: 80,
  gradeLabel: "A",
  confidence: 0.7,
  evidenceShare: 0.5,
  createdAt: "2026-03-01T12:00:00.000Z",
  examDate: "2026-05-20",
};

const actual: ActualResultRecord = {
  id: "result-1",
  anonId: "u",
  subjectId: "physics",
  percent: 75,
  kind: "mock",
  label: "Spring mock",
  takenAt: "2026-03-20T12:00:00.000Z",
};

describe("grade-loop portability", () => {
  it("includes forecast snapshots and actual outcomes in the portable export", () => {
    const snapshot = buildPortabilitySnapshot({
      userId: "u",
      cards: [],
      attempts: [],
      reviewLogs: [],
      mistakes: [],
      plannedSessions: [],
      examDates: [],
      gradePredictions: [prediction],
      gradeActuals: [actual],
    });

    expect(snapshot.gradePredictionsCount).toBe(1);
    expect(snapshot.gradePredictions).toEqual([prediction]);
    expect(snapshot.gradeActualsCount).toBe(1);
    expect(snapshot.gradeActuals).toEqual([actual]);
  });

  it("keeps older format-v1 exports valid when grade-loop fields are absent", () => {
    const snapshot = buildPortabilitySnapshot({
      userId: "u",
      cards: [],
      attempts: [],
      reviewLogs: [],
      mistakes: [],
      plannedSessions: [],
      examDates: [],
    });
    const legacy = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
    delete legacy.gradePredictions;
    delete legacy.gradePredictionsCount;
    delete legacy.gradeActuals;
    delete legacy.gradeActualsCount;

    const parsed = parsePortabilitySnapshot(JSON.stringify(legacy));

    expect(parsed.ok).toBe(true);
    expect(parsed.snapshot?.gradePredictions).toEqual([]);
    expect(parsed.snapshot?.gradeActuals).toEqual([]);
    expect(parsed.snapshot?.gradePredictionsCount).toBe(0);
    expect(parsed.snapshot?.gradeActualsCount).toBe(0);
  });
});
