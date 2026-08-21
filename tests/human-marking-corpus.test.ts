import { describe, expect, it } from "vitest";
import { markQuestion } from "@/domain/marking";
import {
  HUMAN_MARKING_CORPUS,
  HUMAN_MARKING_CORPUS_FLOOR,
  passesHumanMarkingFloor,
  scoreHumanMarkingCorpus,
  validateHumanMarkingCorpus,
} from "@/domain/human-marking-corpus";

describe("human marking corpus", () => {
  it("ships versioned, unique, per-part human labels with valid ranges", () => {
    const validation = validateHumanMarkingCorpus(HUMAN_MARKING_CORPUS);

    expect(HUMAN_MARKING_CORPUS.version).toBe("2026.08.v1");
    expect(HUMAN_MARKING_CORPUS.rows).toHaveLength(12);
    expect(validation).toEqual({ ok: true, issues: [] });
    expect(new Set(HUMAN_MARKING_CORPUS.rows.map((row) => row.id)).size).toBe(12);
  });

  it("scores every labelled script with the same reusable metric contract", () => {
    const report = scoreHumanMarkingCorpus(HUMAN_MARKING_CORPUS, (question, answers) => markQuestion(question, answers));

    expect(report.rowCount).toBe(12);
    expect(report.exactCount).toBe(7);
    expect(report.exactMatchAccuracy).toBeCloseTo(7 / 12, 5);
    expect(report.perPartMae).toBeCloseTo(0.417, 3);
    expect(report.rows.find((row) => row.label === "sign error mid-working, wrong final")?.humanTotal).toBe(1);
    expect(report.rows.find((row) => row.label === "sign error mid-working, wrong final")?.predictedTotal).toBe(0);
  });

  it("passes the published rubric floor and exposes the thresholds", () => {
    const report = scoreHumanMarkingCorpus(HUMAN_MARKING_CORPUS, (question, answers) => markQuestion(question, answers));

    expect(HUMAN_MARKING_CORPUS_FLOOR).toEqual({ minExactMatchAccuracy: 0.5, maxPerPartMae: 0.8 });
    expect(passesHumanMarkingFloor(report)).toBe(true);
  });

  it("rejects duplicate rows and out-of-range human awards", () => {
    const first = HUMAN_MARKING_CORPUS.rows[0];
    const invalid = {
      ...HUMAN_MARKING_CORPUS,
      rows: [
        ...HUMAN_MARKING_CORPUS.rows,
        { ...first, id: first.id, humanAwards: [first.question.parts[0]!.marks + 1, 0] },
      ],
    };

    const validation = validateHumanMarkingCorpus(invalid);

    expect(validation.ok).toBe(false);
    expect(validation.issues).toEqual(expect.arrayContaining([
      expect.stringContaining("duplicate row id"),
      expect.stringContaining("outside the part mark range"),
    ]));
  });
});
