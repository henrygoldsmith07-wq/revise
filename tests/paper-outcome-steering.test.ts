import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { recommend } from "@/domain/recommender";
import type { Card, ExamDate, Mistake, PlannedSession, Topic, TopicMastery } from "@/domain/types";
import type { PaperOutcomeRecord } from "@/domain/paper-outcome";

const NOW = new Date("2025-06-02T17:00:00.000Z");
const SUBJECT = "bio";

const topic = (id: string): Topic => ({
  id,
  subjectId: SUBJECT,
  unitId: "unit",
  title: `Topic ${id}`,
  order: 0,
  intrinsicDifficulty: 3,
  summary: "summary",
  keyPoints: ["point"],
  commonErrors: ["error"],
});

const mastery = (topicId: string, value: number): TopicMastery => ({
  topicId,
  subjectId: SUBJECT,
  mastery: value,
  retention: value,
  confidence: value,
  cardsTotal: 6,
  cardsDue: 0,
  attempts: 3,
  accuracy: value,
  lastStudiedAt: null,
  weak: false,
});

const outcome = (overrides: Partial<PaperOutcomeRecord>): PaperOutcomeRecord => ({
  id: `po-${overrides.satAt}`,
  userId: "local",
  subjectId: SUBJECT,
  paperId: "p1",
  predictedMarks: 60,
  totalMarks: 100,
  actualMarks: 60,
  satAt: "2025-05-01T00:00:00.000Z",
  ...overrides,
});

const base = {
  topics: [topic("t1")],
  mastery: [mastery("t1", 0.7)], // avg ≥ 0.6 → paper rec emitted
  cards: [] as Card[],
  mistakes: [] as Mistake[],
  exams: [{ id: "e1", userId: "u", subjectId: SUBJECT, date: "2025-06-20", label: "Paper 1" }] as ExamDate[],
  plan: [] as PlannedSession[],
  sessionLengthMinutes: 25,
  subjectIds: [SUBJECT],
  now: NOW,
};

describe("recommender × paper outcomes", () => {
  it("ranks the paper higher when sat papers beat their predictions", () => {
    const withoutOutcomes = recommend(base);
    const beating = recommend({
      ...base,
      paperOutcomes: [
        outcome({ actualMarks: 80, satAt: "2025-06-01T00:00:00.000Z" }),
        outcome({ actualMarks: 80, satAt: "2025-05-01T00:00:00.000Z" }),
      ],
    });
    const paperScore = (recs: ReturnType<typeof recommend>) =>
      recs.find((r) => r.activity === "paper")?.score ?? 0;
    expect(paperScore(beating)).toBeGreaterThan(paperScore(withoutOutcomes));
  });

  it("ranks the paper lower when sat papers fall short", () => {
    const withoutOutcomes = recommend(base);
    const fallingShort = recommend({
      ...base,
      paperOutcomes: [
        outcome({ actualMarks: 40, satAt: "2025-06-01T00:00:00.000Z" }),
        outcome({ actualMarks: 40, satAt: "2025-05-01T00:00:00.000Z" }),
      ],
    });
    const paperScore = (recs: ReturnType<typeof recommend>) =>
      recs.find((r) => r.activity === "paper")?.score ?? 0;
    expect(paperScore(fallingShort)).toBeLessThan(paperScore(withoutOutcomes));
  });

  it("leaves the ranking untouched with no outcome history", () => {
    const a = recommend(base);
    const b = recommend({ ...base, paperOutcomes: [] });
    expect(a.map((r) => r.score)).toEqual(b.map((r) => r.score));
  });
});

describe("ExamConditionMode outcome wiring", () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const component = () => src("src/components/ExamConditionMode.tsx");

  it("freezes the prediction at paper start, before any answer is marked", () => {
    const source = component();
    expect(source).toContain("outcomeStartedRef");
    expect(source).toContain("store.beginPaperOutcome");
    expect(source).toContain("store.previewPaper");
    // The freeze happens inside startExam (before any marking can run).
    const startExam = source.slice(source.indexOf("function startExam"));
    expect(startExam).toContain("beginPaperOutcome");
  });

  it("closes the outcome with actual marks after the paper is saved", () => {
    const source = component();
    expect(source).toContain("store.closePaperOutcome(paperRunId, actualMarks)");
    const addPaperAt = source.indexOf('status: "practised"');
    const closeAt = source.indexOf("store.closePaperOutcome(paperRunId, actualMarks)");
    expect(closeAt).toBeGreaterThan(addPaperAt);
  });
});
