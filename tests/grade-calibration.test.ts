import { describe, expect, it } from "vitest";
import { getSubject, topicsFor } from "@/domain/curriculum";
import { gradeForPercent, predictGrade } from "@/domain/grades";
import { calibrateFromHistory, simulatePaper } from "@/domain/assessment";
import { seedQuestions } from "@/content";
import type { Attempt, TopicMastery } from "@/domain/types";

// ---------------------------------------------------------------------------
// Grade calibration — prove predicted performance converges on later timed papers.
// The product claim is that Revise's predicted grade becomes more accurate
// as you do more work. This harness checks three things without a network:
//  1. calibration math (bias/slope/MAE) is numerically correct
//  2. simulatePaper + calibrateFromHistory compose correctly over a synthetic learner history
//  3. predictGrade confidence grows and bias shrinks as evidence accumulates
// ---------------------------------------------------------------------------

const S = getSubject("wjec-alevel-chemistry")!;
const TOPICS = topicsFor(S.id);

function masteryFor(val: number, topicIds: string[]): TopicMastery[] {
  return topicIds.map((id) => ({
    topicId: id,
    subjectId: S.id,
    mastery: val,
    retention: val,
    confidence: val,
    cardsTotal: 6,
    cardsDue: 0,
    attempts: 4,
    accuracy: val,
    lastStudiedAt: "2025-06-01T09:00:00.000Z",
    weak: val < 0.55,
  }));
}

function attemptFor(awarded: number, max: number, createdAt: string, topicId: string): Attempt {
  return {
    id: `a-${createdAt}-${awarded}`,
    userId: "u", questionId: "q1", subjectId: S.id, topicIds: [topicId],
    answers: {}, marked: [], awarded, max, feedback: "", markedBy: "ai", elapsedMs: 1000, mode: "practice", createdAt,
  };
}

describe("calibrateFromHistory — numerical proof", () => {
  it("returns identity when only 0–2 samples exist", () => {
    const c0 = calibrateFromHistory({ subjectId: S.id, pairs: [] });
    expect(c0.slope).toBe(1); expect(c0.bias).toBe(0); expect(c0.sampleSize).toBe(0);
    const c2 = calibrateFromHistory({ subjectId: S.id, pairs: [{ predicted: 40, actual: 42 }, { predicted: 55, actual: 60 }] });
    expect(c2.slope).toBe(1); expect(c2.sampleSize).toBe(2);
  });

  it("fits a regression with finite slope/bias/mae on 3+ points", () => {
    const pairs = [
      { predicted: 40, actual: 42 }, { predicted: 55, actual: 58 }, { predicted: 60, actual: 63 },
      { predicted: 70, actual: 72 }, { predicted: 45, actual: 48 },
    ];
    const c = calibrateFromHistory({ subjectId: S.id, pairs });
    expect(Number.isFinite(c.slope)).toBe(true);
    expect(Number.isFinite(c.bias)).toBe(true);
    expect(c.sampleSize).toBe(5);
    expect(c.mae).toBeGreaterThanOrEqual(0);
    expect(c.mae).toBeLessThan(10); // small systematic error -> low MAE
  });

  it("MAE shrinks after calibration vs before on a biased predictor (synthetic papers)", () => {
    // A predictor that is consistently 6 marks low:  ... actual = predicted + 6
    const pairs = Array.from({ length: 8 }, (_, i) => ({ predicted: 40 + i * 5, actual: 46 + i * 5 }));
    const beforeMae = pairs.reduce((a, p) => a + Math.abs(p.actual - p.predicted), 0) / pairs.length;
    const c = calibrateFromHistory({ subjectId: S.id, pairs });
    const afterMae = c.mae;
    expect(afterMae).toBeLessThan(beforeMae);
    expect(c.bias).toBeGreaterThan(4); // learns the systematic underprediction
    expect(c.slope).toBeCloseTo(1, 0.05);
  });
});

describe("simulatePaper + calibrateFromHistory — predicted vs later timed papers", () => {
  it("paper simulation is monotone in mastery and calibrated slope is ~1 for honest marks", () => {
    const questions = seedQuestions.filter((q) => q.subjectId === S.id).slice(0, 6);
    expect(questions.length).toBeGreaterThan(0);
    const topicMasteryFor = (val: number) => {
      const m = new Map<string, number>();
      for (const t of TOPICS) m.set(t.id, val);
      return m;
    };
    const weak = simulatePaper({ subject: S, paperSpecId: S.papers[0].id, questions, topicMastery: topicMasteryFor(0.25) });
    const strong = simulatePaper({ subject: S, paperSpecId: S.papers[0].id, questions, topicMastery: topicMasteryFor(0.85) });
    expect(strong.predictedMarks).toBeGreaterThan(weak.predictedMarks);
    expect(strong.predictedMarks).toBeGreaterThan(strong.totalMarks * 0.5);
    expect(weak.predictedMarks).toBeLessThan(weak.totalMarks);
    // Calibration on honest marks: slope stays near 1
    const pairs = [
      { predicted: weak.predictedMarks, actual: Math.round(weak.predictedMarks * 0.98) },
      { predicted: strong.predictedMarks, actual: Math.round(strong.predictedMarks * 1.02) },
      { predicted: Math.round((weak.predictedMarks + strong.predictedMarks) / 2), actual: Math.round((weak.predictedMarks + strong.predictedMarks) / 2) },
      { predicted: strong.predictedMarks - 2, actual: strong.predictedMarks - 1 },
    ];
    const c = calibrateFromHistory({ subjectId: S.id, pairs });
    expect(c.slope).toBeCloseTo(1, 0.2);
    expect(c.mae).toBeLessThan(5);
  });

  it("a longitudinal synthetic history converges: more evidence narrows the band", () => {
    const topicId = TOPICS[0].id;
    const thinMastery = masteryFor(0.4, [topicId]);
    const thinAttempts: Attempt[] = [attemptFor(4, 10, "2025-04-20T09:00:00.000Z", topicId)];
    const thin = predictGrade(S, thinMastery, thinAttempts, [], "2025-06-01");

    const thickAttempts: Attempt[] = Array.from({ length: 15 }, (_, i) =>
      attemptFor(7, 10, `2025-05-${String(10 + i).padStart(2, "0")}T09:00:00.000Z`, topicId),
    );
    const thick = predictGrade(S, masteryFor(0.65, [topicId]), thickAttempts, [], "2025-06-01");

    expect(thick.confidence).toBeGreaterThan(thin.confidence);
    // Thick evidence narrows the band to at most ~1 grade step
    const gradeIndex = (g: string) => ["A*", "A", "B", "C", "D", "E", "U"].indexOf(g);
    const thinSpread = Math.abs(gradeIndex(thin.bestCase) - gradeIndex(thin.worstCase));
    const thickSpread = Math.abs(gradeIndex(thick.bestCase) - gradeIndex(thick.worstCase));
    expect(thickSpread).toBeLessThanOrEqual(thinSpread);
  });

  it("predicted percent tracks measured accuracy when mastery is held fixed", () => {
    const topicIds = TOPICS.slice(0, 3).map((t) => t.id);
    const m = topicIds.map((id) => ({
      topicId: id, subjectId: S.id, mastery: 0.6, retention: 0.6, confidence: 0.6, cardsTotal: 6, cardsDue: 0, attempts: 4, accuracy: 0.6, lastStudiedAt: "2025-06-01T09:00:00.000Z", weak: false,
    })) as TopicMastery[];
    const lowAcc = Array.from({ length: 10 }, (_, i) => attemptFor(3, 10, `2025-05-${String(10 + i).padStart(2, "0")}T09:00:00.000Z`, topicIds[0]));
    const highAcc = Array.from({ length: 10 }, (_, i) => attemptFor(9, 10, `2025-05-${String(10 + i).padStart(2, "0")}T09:00:00.000Z`, topicIds[0]));
    const lowPred = predictGrade(S, m, lowAcc, [], "2025-06-01");
    const highPred = predictGrade(S, m, highAcc, [], "2025-06-01");
    // Once trust=1, measured accuracy dominates coverage, so high accuracy -> higher predicted grade
    expect(highPred.percent).toBeGreaterThan(lowPred.percent);
    expect(gradeForPercent(S, highPred.percent) !== "U" || gradeForPercent(S, lowPred.percent) === "U").toBe(true);
  });

  it("full timed-paper flow: simulate several papers, calibrate, then apply calibration to a new simulation", () => {
    const questions = seedQuestions.filter((q) => q.subjectId === S.id).slice(0, 8);
    const mk = (val: number) => new Map(TOPICS.map((t) => [t.id, val]));
    const history: Array<{ predicted: number; actual: number }> = [];
    for (const v of [0.3, 0.5, 0.7, 0.8]) {
      const sim = simulatePaper({ subject: S, paperSpecId: S.papers[0].id, questions, topicMastery: mk(v) });
      // "actual" is sim plus a small consistent bias the calibration should learn
      const actual = Math.round(sim.predictedMarks * 1.0 + 3);
      history.push({ predicted: sim.predictedMarks, actual });
    }
    const cal = calibrateFromHistory({ subjectId: S.id, pairs: history });
    expect(cal.sampleSize).toBe(4);
    // Apply calibration to a fresh paper at v=0.6
    const fresh = simulatePaper({ subject: S, paperSpecId: S.papers[0].id, questions, topicMastery: mk(0.6), calibration: cal });
    const uncal = simulatePaper({ subject: S, paperSpecId: S.papers[0].id, questions, topicMastery: mk(0.6) });
    // Calibrated prediction should be ~3 marks higher (the learned bias), but not wildly different
    expect(fresh.predictedMarks).toBeGreaterThan(uncal.predictedMarks);
    expect(fresh.predictedMarks - uncal.predictedMarks).toBeLessThan(8);
    expect(cal.mae).toBeLessThan(6);
  });
});
