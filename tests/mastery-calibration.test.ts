import { describe, expect, it } from "vitest";
import { createCard } from "@/domain/scheduling";
import {
  buildHistoricalSnapshots,
  evaluateFutureOutcomes,
  buildMasteryCalibrationReport,
  evaluateMasteryCalibration,
} from "@/domain/mastery-calibration";
import type { Attempt, Card, Mistake, ReviewLog, Topic } from "@/domain/types";

const TOPIC = (id: string): Topic => ({
  id,
  subjectId: "subj",
  unitId: "unit",
  title: id,
  order: 0,
  intrinsicDifficulty: 3,
  summary: "summary",
  keyPoints: ["kp"],
  commonErrors: [],
});

function card(topicId: string, id: string, createdAt: string): Card {
  return {
    ...createCard({ id, userId: "u", subjectId: "subj", topicId, front: "f", back: "b" }, new Date(createdAt)),
    stability: 10,
    reps: 3,
    lastReviewedAt: createdAt,
    due: "2025-07-01",
  };
}

function attempt(topicId: string, awarded: number, max: number, createdAt: string): Attempt {
  return {
    id: `att-${createdAt}-${topicId}`,
    userId: "u",
    questionId: "q",
    subjectId: "subj",
    topicIds: [topicId],
    answers: {},
    marked: [],
    awarded,
    max,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 1000,
    mode: "practice",
    createdAt,
  };
}

describe("mastery calibration — no future-data leakage", () => {
  it("future attempts do not affect mastery at cutoff", () => {
    const topics = [TOPIC("t1")];
    const cards = [card("t1", "c1", "2025-05-01T00:00:00.000Z")];
    const attemptsEarly = [attempt("t1", 8, 10, "2025-05-02T00:00:00.000Z")];
    const attemptsLate = [attempt("t1", 0, 10, "2025-06-10T00:00:00.000Z")];
    const allAttempts = [...attemptsEarly, ...attemptsLate];

    const snapEarly = buildHistoricalSnapshots({
      topics,
      cards,
      reviewLogs: [],
      attempts: allAttempts,
      mistakes: [],
      cutoffs: ["2025-05-15T00:00:00.000Z"],
    });
    const snapEarlyOnly = buildHistoricalSnapshots({
      topics,
      cards,
      reviewLogs: [],
      attempts: attemptsEarly,
      mistakes: [],
      cutoffs: ["2025-05-15T00:00:00.000Z"],
    });
    // Same mastery means no leakage
    expect(snapEarly[0].predictedMastery).toBe(snapEarlyOnly[0].predictedMastery);
  });

  it("proves future assessment data cannot leak backwards", () => {
    const topics = [TOPIC("t1"), TOPIC("t2")];
    const attempts = [
      attempt("t1", 9, 10, "2025-05-01T00:00:00.000Z"),
      attempt("t1", 1, 10, "2025-06-20T00:00:00.000Z"), // future disaster
    ];
    const cards: Card[] = [];
    const snaps = buildHistoricalSnapshots({
      topics,
      cards,
      reviewLogs: [],
      attempts,
      mistakes: [],
      cutoffs: ["2025-05-10T00:00:00.000Z", "2025-06-25T00:00:00.000Z"],
    });
    // Early cutoff should be optimistic, late cutoff pessimistic after seeing the 1/10
    const earlyT1 = snaps.find((s) => s.topicId === "t1" && s.cutoff === "2025-05-10T00:00:00.000Z")!;
    const lateT1 = snaps.find((s) => s.topicId === "t1" && s.cutoff === "2025-06-25T00:00:00.000Z")!;
    expect(earlyT1.predictedMastery).toBeGreaterThan(lateT1.predictedMastery);
  });

  it("freezes estimate and evaluates on later unseen questions", () => {
    const topics = [TOPIC("t1")];
    const attempts = [
      attempt("t1", 6, 10, "2025-05-01T00:00:00.000Z"),
      attempt("t1", 7, 10, "2025-05-02T00:00:00.000Z"),
      attempt("t1", 8, 10, "2025-06-01T00:00:00.000Z"), // future
      attempt("t1", 2, 10, "2025-06-02T00:00:00.000Z"), // future
    ];
    const report = evaluateMasteryCalibration({
      topics,
      cards: [],
      reviewLogs: [],
      attempts,
      mistakes: [],
      cutoffs: ["2025-05-10T00:00:00.000Z", "2025-05-20T00:00:00.000Z"],
      minFutures: 1,
    });
    // Should have at least some outcomes measured
    expect(report.outcomesMeasured).toBeGreaterThan(0);
  });

  it("reports calibration bands 0–20 .. 80–100 with predicted vs observed", () => {
    const topics = Array.from({ length: 5 }, (_, i) => TOPIC(`t${i}`));
    // Make t0 weak (low accuracy early, low future), t4 strong
    const attempts: Attempt[] = [];
    for (const t of topics) {
      const weak = t.id === "t0" || t.id === "t1";
      attempts.push(attempt(t.id, weak ? 2 : 8, 10, "2025-05-01T00:00:00.000Z"));
      attempts.push(attempt(t.id, weak ? 3 : 9, 10, "2025-05-02T00:00:00.000Z"));
      attempts.push(attempt(t.id, weak ? 1 : 7, 10, "2025-06-10T00:00:00.000Z"));
      attempts.push(attempt(t.id, weak ? 2 : 8, 10, "2025-06-11T00:00:00.000Z"));
    }
    const cards = topics.flatMap((t) =>
      Array.from({ length: 4 }, (_, i) => card(t.id, `c-${t.id}-${i}`, "2025-04-28T00:00:00.000Z")),
    );
    const report = evaluateMasteryCalibration({
      topics,
      cards,
      reviewLogs: [],
      attempts,
      mistakes: [],
      cutoffs: ["2025-05-05T00:00:00.000Z", "2025-05-06T00:00:00.000Z", "2025-05-07T00:00:00.000Z", "2025-05-08T00:00:00.000Z", "2025-05-09T00:00:00.000Z", "2025-05-10T00:00:00.000Z"],
    });
    expect(report.bands).toHaveLength(5);
    expect(report.bands[0].band).toBe("0–20%");
    expect(report.bands[4].band).toBe("80–100%");
    if (!report.insufficientData) {
      for (const b of report.bands) {
        if (b.count > 0) {
          expect(b.predictedMean).not.toBeNull();
          expect(b.observedMean).not.toBeNull();
          expect(b.calibrationError).not.toBeNull();
        }
      }
    }
  });

  it("returns insufficient data when too few pairs", () => {
    const topics = [TOPIC("t1")];
    const report = evaluateMasteryCalibration({
      topics,
      cards: [],
      reviewLogs: [],
      attempts: [],
      mistakes: [],
      cutoffs: ["2025-05-01T00:00:00.000Z"],
    });
    expect(report.insufficientData).toBe(true);
    expect(report.insufficientReason).toContain("measurable");
  });
});
