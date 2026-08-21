import { describe, expect, it } from "vitest";
import {
  ANSWER_CORPUS_FORMAT_VERSION,
  DEV_FIXTURE_BENCHMARK_VERSION,
  answerCorpusStats,
  createAnswerCorpusFile,
  devFixtureRecords,
  parseAnswerCorpusJson,
  serialiseAnswerCorpus,
  validateAnswerCorpusRecord,
  validateAnswerCorpusFile,
} from "@/domain/answer-corpus";
import type { AnswerCorpusRecord } from "@/domain/answer-corpus";

function validRecord(overrides: Partial<AnswerCorpusRecord> = {}): AnswerCorpusRecord {
  return {
    id: "rec-1",
    questionId: "q1",
    subject: "wjec-alevel-physics",
    specification: "A200QS",
    specificationVersion: "2024-1.0",
    topic: "wjec-alevel-physics.quantum",
    questionText: "Calculate the energy",
    markScheme: ["Uses E=hc/lambda", "Answer 4.9e-19 J"],
    maximumMarks: 2,
    commandWord: "calculate",
    difficulty: 3,
    questionTypeTags: ["calculation", "2-4-mark"],
    studentAnswer: "E=hc/lambda=4.9e-19",
    humanMark1: 2,
    humanMark2: 1,
    adjudicatedMark: 2,
    humanFeedback: "Good method",
    identifiedMisconceptions: [],
    source: "teacher-reviewed",
    reviewStatus: "adjudicated",
    provenance: "WJEC 2019 Paper 1 Q2(a) anonymised",
    marker1Meta: { markerId: "examiner-1", role: "examiner" },
    marker2Meta: { markerId: "examiner-2", role: "examiner" },
    benchmarkVersion: "2026.08.v2",
    abilityLevel: "intermediate",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("answer corpus — schema & validation", () => {
  it("validates a correct record with no issues", () => {
    const rec = validRecord();
    const res = validateAnswerCorpusRecord(rec, 0);
    expect(res.issues).toEqual([]);
  });

  it("supports all required fields per PRIMARY GOAL", () => {
    const rec = validRecord();
    expect(rec).toHaveProperty("questionId");
    expect(rec).toHaveProperty("subject");
    expect(rec).toHaveProperty("specification");
    expect(rec).toHaveProperty("topic");
    expect(rec).toHaveProperty("questionText");
    expect(rec).toHaveProperty("markScheme");
    expect(rec).toHaveProperty("maximumMarks");
    expect(rec).toHaveProperty("commandWord");
    expect(rec).toHaveProperty("difficulty");
    expect(rec).toHaveProperty("studentAnswer");
    expect(rec).toHaveProperty("humanMark1");
    expect(rec).toHaveProperty("humanMark2");
    expect(rec).toHaveProperty("adjudicatedMark");
    expect(rec).toHaveProperty("humanFeedback");
    expect(rec).toHaveProperty("identifiedMisconceptions");
    expect(rec).toHaveProperty("provenance");
    expect(rec).toHaveProperty("reviewStatus");
    expect(rec).toHaveProperty("marker1Meta");
    expect(rec).toHaveProperty("benchmarkVersion");
  });

  it("rejects out-of-range marks and bad difficulty", () => {
    const rec = validRecord({ humanMark1: 99, difficulty: 6 as unknown as 1 });
    const res = validateAnswerCorpusRecord(rec, 0);
    expect(res.issues.some((i) => i.includes("humanMark1"))).toBe(true);
    expect(res.issues.some((i) => i.includes("difficulty"))).toBe(true);
  });

  it("rejects duplicate ids at file level", () => {
    const r1 = validRecord({ id: "dup" });
    const r2 = validRecord({ id: "dup" });
    const file = createAnswerCorpusFile([r1, r2], "2026.08.v2", "test");
    const v = validateAnswerCorpusFile(file);
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.includes("Duplicate record id"))).toBe(true);
  });

  it("parses JSON array and versioned object, filters bad rows", () => {
    const good = validRecord({ id: "good" });
    const bad = { ...validRecord({ id: "bad" }), maximumMarks: 0 };
    const rawArray = JSON.stringify([good, bad]);
    const res = parseAnswerCorpusJson(rawArray);
    expect(res.records).toHaveLength(1);
    expect(res.records[0].id).toBe("good");
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("round-trips via serialise", () => {
    const recs = [validRecord({ id: "a1" }), validRecord({ id: "a2" })];
    const file = createAnswerCorpusFile(recs, "2026.08.v2", "test provenance");
    const raw = serialiseAnswerCorpus(file);
    const parsed = parseAnswerCorpusJson(raw);
    expect(parsed.records).toHaveLength(2);
    expect(parsed.file?.formatVersion).toBe(ANSWER_CORPUS_FORMAT_VERSION);
  });

  it("dev fixtures are clearly labelled and never examiner-reviewed", () => {
    const fixtures = devFixtureRecords();
    expect(fixtures.length).toBeGreaterThanOrEqual(8);
    for (const f of fixtures) {
      expect(f.benchmarkVersion).toBe(DEV_FIXTURE_BENCHMARK_VERSION);
      expect(f.provenance.toLowerCase()).toContain("synthetic");
      expect(f.provenance.toLowerCase()).toContain("not human evidence");
      expect(f.source).not.toBe("official/past-paper");
      expect(f.source).not.toBe("examiner-reviewed");
    }
    // Covers checklist: multiple subjects, mark totals, question types, ability levels
    const subjects = new Set(fixtures.map((f) => f.subject));
    expect(subjects.size).toBeGreaterThanOrEqual(3);
    const marks = new Set(fixtures.map((f) => f.maximumMarks));
    expect(marks.has(1)).toBe(true);
    expect(marks.has(6)).toBe(true);
    const types = new Set(fixtures.flatMap((f) => f.questionTypeTags));
    expect(types.has("calculation")).toBe(true);
    expect(types.has("practical-method") || types.has("data-interpretation")).toBe(true);
    expect(types.has("contradictory") || types.has("vague")).toBe(true);
  });

  it("stats breakdowns by subject/spec/command/difficulty/marks/type/source", () => {
    const recs = [
      validRecord({ id: "1", subject: "wjec-alevel-physics", specification: "A200QS", commandWord: "calculate", difficulty: 1, maximumMarks: 1, questionTypeTags: ["1-mark"], source: "teacher-reviewed", reviewStatus: "single-marked", humanMark1: 1, humanMark2: null, adjudicatedMark: null }),
      validRecord({ id: "2", subject: "aqa-gcse-biology", specification: "8461", commandWord: "evaluate", difficulty: 4, maximumMarks: 6, questionTypeTags: ["6plus-extended", "evaluate"], source: "internally authored", reviewStatus: "adjudicated", humanMark1: 2, humanMark2: 2, adjudicatedMark: 2 }),
    ];
    const stats = answerCorpusStats(recs);
    expect(stats.total).toBe(2);
    expect(stats.bySubject["wjec-alevel-physics"]).toBe(1);
    expect(stats.bySpecification["A200QS"]).toBe(1);
    expect(stats.byCommandWord["calculate"]).toBe(1);
    expect(stats.byDifficulty["1"]).toBe(1);
    expect(stats.byMarks["6"]).toBe(1);
    expect(stats.byQuestionType["evaluate"]).toBe(1);
    expect(stats.bySource["teacher-reviewed"]).toBe(1);
    expect(stats.adjudicated).toBe(1);
  });

  it("warnings for empty markScheme and contradictory adjudication", () => {
    const rec = validRecord({ markScheme: [], adjudicatedMark: 2, humanMark1: null, humanMark2: null });
    const res = validateAnswerCorpusRecord(rec, 0);
    expect(res.warnings.some((w) => w.includes("markScheme is empty"))).toBe(true);
    expect(res.warnings.some((w) => w.includes("adjudicatedMark without human marks"))).toBe(true);
  });
});
