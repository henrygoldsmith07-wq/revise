import { describe, expect, it } from "vitest";
import { seedMisconceptions, seedQuestions, seedQuestionsForSubject, seedQuestionsForTopic } from "@/content";
import { makeCloze, seedCardsForTopic } from "@/content/seed-cards";
import {
  allSubjects,
  allTopics,
  getSubject,
  getTopic,
  gradesFor,
  subjectLabel,
  topicsFor,
  unitsFor,
} from "@/domain/curriculum";
import { gradeForPercent, nextGradeTarget, predictGrade } from "@/domain/grades";
import { addXp, levelFor, newlyUnlocked, touchStreak, unlockedAchievements } from "@/domain/gamification";
import { search } from "@/domain/search";
import type { Attempt, StreakState, TopicMastery } from "@/domain/types";

describe("curriculum registry", () => {
  it("registers the four core subjects across boards (WJEC/AQA/Edexcel/OCR × A-level + GCSE)", () => {
    const names = allSubjects().map((s) => s.name).sort();
    expect(names.filter((n,i,a)=>a.indexOf(n)===i).sort()).toEqual(["Biology", "Chemistry", "Mathematics", "Physics"]);
    expect(allSubjects().length).toBeGreaterThanOrEqual(8);
  });

  it("gives every subject units, topics and paper weightings", () => {
    for (const subject of allSubjects()) {
      expect(unitsFor(subject.id).length).toBeGreaterThan(0);
      expect(topicsFor(subject.id).length).toBeGreaterThanOrEqual(9);
      expect(subject.papers.length).toBeGreaterThan(0);
      expect(subject.gradeBoundaries.length).toBeGreaterThan(0);
    }
  });

  it("gives every topic authored revision content", () => {
    for (const topic of allTopics()) {
      expect(topic.summary.length).toBeGreaterThan(40);
      expect(topic.keyPoints.length).toBeGreaterThanOrEqual(3);
      expect(topic.commonErrors.length).toBeGreaterThanOrEqual(2);
      expect(getSubject(topic.subjectId)).toBeDefined();
    }
  });

  it("keeps topic ids unique across every subject", () => {
    const ids = allTopics().map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves board and qualification lazily for labels and grades", () => {
    const subject = allSubjects()[0];
    expect(subjectLabel(subject.id)).toContain("WJEC");
    expect(gradesFor(subject.id)[0]).toBe("A*");
    expect(subjectLabel("does-not-exist")).toBe("does-not-exist");
  });
});

describe("seed cards", () => {
  it("builds a usable deck from a topic's authored content", () => {
    const topic = allTopics()[0];
    const cards = seedCardsForTopic(topic, "u");
    expect(cards.length).toBeGreaterThanOrEqual(topic.keyPoints.length + topic.commonErrors.length);
    expect(cards.every((c) => c.origin === "seed")).toBe(true);
    expect(cards.every((c) => c.front.trim() && c.back.trim())).toBe(true);
  });

  it("uses deterministic ids so re-seeding never duplicates or resets a deck", () => {
    const topic = allTopics()[0];
    const first = seedCardsForTopic(topic, "u", new Date("2025-01-01T00:00:00Z"));
    const second = seedCardsForTopic(topic, "u", new Date("2026-01-01T00:00:00Z"));
    expect(first.map((c) => c.id)).toEqual(second.map((c) => c.id));
  });

  it("covers every topic in the specification", () => {
    for (const topic of allTopics()) {
      expect(seedCardsForTopic(topic, "u").length).toBeGreaterThan(0);
    }
  });

  it("blanks a content word, not a stop word", () => {
    const cloze = makeCloze("The concentration of reactants decreases over time");
    expect(cloze).not.toBeNull();
    expect(cloze!.front).toContain("[…]");
    expect(["the", "of", "over"]).not.toContain(cloze!.back.toLowerCase());
  });

  it("returns null when there is no word long enough to blank", () => {
    expect(makeCloze("a b c to of")).toBeNull();
  });
});

describe("seed question bank", () => {
  it("ships questions for the authored WJEC/AQA/OCR A-level subjects (Edexcel/GCSE question banks land with licensed sourcing)", () => {
    const required = allSubjects().filter((s) => s.id.startsWith("wjec-alevel") || s.id.startsWith("aqa-alevel") || s.id.startsWith("ocr-alevel"));
    for (const subject of required) {
      expect(seedQuestionsForSubject(subject.id).length, `${subject.id} should have seed questions`).toBeGreaterThan(0);
    }
    // Edexcel/GCSE ship curriculum first; questions follow when licensed sources are added.
    // Guard that we did not regress the overall bank.
    expect(seedQuestions.length).toBeGreaterThanOrEqual(100);
  });

  it("keeps the additional A-level batch balanced across the four core subjects", () => {
    const batch = seedQuestions.filter((question) => question.id.includes("more-alevel"));
    expect(batch.length).toBeGreaterThanOrEqual(32);
    for (const subjectId of [
      "wjec-alevel-biology",
      "wjec-alevel-chemistry",
      "wjec-alevel-maths",
      "wjec-alevel-physics",
      "aqa-alevel-biology",
      "aqa-alevel-chemistry",
      "aqa-alevel-maths",
      "aqa-alevel-physics",
    ]) {
      expect(batch.filter((question) => question.subjectId === subjectId), subjectId).toHaveLength(4);
    }
  });

  it("keeps every question well-formed and self-consistent", () => {
    for (const question of seedQuestions) {
      expect(question.parts.length).toBeGreaterThan(0);
      expect(question.totalMarks).toBe(question.parts.reduce((a, p) => a + p.marks, 0));
      expect(question.topicIds.length).toBeGreaterThan(0);
      for (const topicId of question.topicIds) {
        // A question pointing at a topic that does not exist would silently
        // vanish from practice and never be recommended.
        expect(getTopic(topicId), `unknown topic ${topicId}`).toBeDefined();
      }
      for (const part of question.parts) {
        expect(part.markScheme.length).toBeGreaterThan(0);
        expect(part.modelAnswer.length).toBeGreaterThan(10);
      }
      if (question.kind === "mcq") {
        expect(question.options?.length).toBeGreaterThan(1);
        expect(question.correctIndex).toBeGreaterThanOrEqual(0);
        expect(question.correctIndex!).toBeLessThan(question.options!.length);
      }
    }
  });

  it("uses unique, stable ids", () => {
    const ids = seedQuestions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("seed-q:"))).toBe(true);
  });

  it("finds questions by topic", () => {
    const question = seedQuestions[0];
    expect(seedQuestionsForTopic(question.topicIds[0])).toContainEqual(question);
  });
});

describe("grade prediction", () => {
  const subject = allSubjects()[0];
  const mastery = (value: number): TopicMastery[] =>
    topicsFor(subject.id).map((t) => ({
      topicId: t.id,
      subjectId: subject.id,
      mastery: value,
      retention: value,
      confidence: value,
      cardsTotal: 6,
      cardsDue: 0,
      attempts: 2,
      accuracy: value,
      lastStudiedAt: null,
      weak: value < 0.55,
    }));

  const attempt = (awarded: number, max: number, createdAt: string): Attempt => ({
    id: crypto.randomUUID(),
    userId: "u",
    questionId: "q",
    subjectId: subject.id,
    topicIds: [topicsFor(subject.id)[0].id],
    answers: {},
    marked: [],
    awarded,
    max,
    feedback: "",
    markedBy: "ai",
    elapsedMs: 1000,
    mode: "practice",
    createdAt,
  });

  it("bands a percentage against the subject's boundaries", () => {
    expect(gradeForPercent(subject, 95)).toBe("A*");
    expect(gradeForPercent(subject, 65)).toBe("B");
    expect(gradeForPercent(subject, 5)).toBe("U");
  });

  it("predicts a higher grade for a stronger student", () => {
    const weak = predictGrade(subject, mastery(0.2), [], [], "2025-06-01");
    const strong = predictGrade(subject, mastery(0.9), [], [], "2025-06-01");
    expect(strong.percent).toBeGreaterThan(weak.percent);
  });

  it("keeps confidence low until enough marked work exists", () => {
    const thin = predictGrade(subject, mastery(0.8), [], [], "2025-06-01");
    const thick = predictGrade(
      subject,
      mastery(0.8),
      Array.from({ length: 15 }, () => attempt(8, 10, "2025-05-30T09:00:00.000Z")),
      [],
      "2025-06-01",
    );
    expect(thick.confidence).toBeGreaterThan(thin.confidence);
  });

  it("reports a wider range when the evidence is thin", () => {
    const thin = predictGrade(subject, mastery(0.5), [], [], "2025-06-01");
    expect(thin.worstCase).not.toBe(thin.bestCase);
  });

  it("detects an improving trend across the last month", () => {
    const prediction = predictGrade(
      subject,
      mastery(0.5),
      [
        ...Array.from({ length: 4 }, () => attempt(3, 10, "2025-04-20T09:00:00.000Z")),
        ...Array.from({ length: 4 }, () => attempt(9, 10, "2025-05-25T09:00:00.000Z")),
      ],
      [],
      "2025-06-01",
    );
    expect(prediction.trend).toBeGreaterThan(0);
  });

  it("names the topics with the most headroom", () => {
    const rows = mastery(0.9);
    rows[0] = { ...rows[0], mastery: 0.1 };
    const prediction = predictGrade(subject, rows, [], [], "2025-06-01");
    expect(prediction.headroom[0].topicId).toBe(rows[0].topicId);
  });

  it("turns grade headroom into a route to the next boundary", () => {
    const prediction = {
      subjectId: subject.id,
      percent: 56,
      grade: "C",
      bestCase: "B",
      worstCase: "D",
      confidence: 0.62,
      trend: 2,
      headroom: [
        { topicId: "topic-a", potentialPercent: 5 },
        { topicId: "topic-b", potentialPercent: 3 },
      ],
    };
    const target = nextGradeTarget(subject, prediction);
    expect(target.nextGrade).toEqual({ grade: "B", percent: 60 });
    expect(target.gapPercent).toBe(4);
    expect(target.modeledGainPercent).toBe(4);
    expect(target.route[0]).toEqual({ topicId: "topic-a", potentialPercent: 5, contributionPercent: 4 });
    expect(target.remainingPercent).toBe(0);
  });
});

describe("gamification", () => {
  const state: StreakState = {
    userId: "u",
    current: 4,
    longest: 9,
    lastActiveDate: "2025-06-01",
    xp: 100,
    achievements: [],
  };

  it("increments on consecutive days and is idempotent within a day", () => {
    expect(touchStreak(state, "2025-06-02").current).toBe(5);
    expect(touchStreak(state, "2025-06-01")).toBe(state);
  });

  it("holds the streak across a single missed day but resets after two", () => {
    expect(touchStreak(state, "2025-06-03").current).toBe(4);
    expect(touchStreak(state, "2025-06-05").current).toBe(1);
  });

  it("tracks the longest streak ever reached", () => {
    const long = touchStreak({ ...state, current: 9 }, "2025-06-02");
    expect(long.longest).toBe(10);
  });

  it("never lets XP go negative", () => {
    expect(addXp(state, -500).xp).toBe(0);
  });

  it("makes each level cost more than the last", () => {
    const first = levelFor(0);
    const later = levelFor(5000);
    expect(first.level).toBe(1);
    expect(later.level).toBeGreaterThan(5);
    expect(later.needed).toBeGreaterThan(first.needed);
  });

  it("unlocks achievements once and reports only the new ones", () => {
    const stats = {
      reviews: 120,
      attempts: 5,
      marksEarned: 40,
      papers: 0,
      streak: 8,
      masteredTopics: 2,
      perfectSessions: 0,
    };
    const unlocked = unlockedAchievements(stats);
    expect(unlocked).toContain("hundred-reviews");
    expect(unlocked).toContain("week-streak");
    expect(unlocked).not.toContain("first-paper");
    expect(newlyUnlocked(unlocked, stats)).toHaveLength(0);
  });
});

describe("search", () => {
  const corpus = { topics: allTopics(), cards: [], questions: seedQuestions, misconceptions: seedMisconceptions };

  it("ignores queries that are too short to be useful", () => {
    expect(search(corpus, "a")).toHaveLength(0);
  });

  it("ranks an exact topic title above an incidental mention", () => {
    const results = search(corpus, "photosynthesis");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].kind).toBe("topic");
    expect(results[0].title.toLowerCase()).toContain("photosynthesis");
  });

  it("searches question text as well as curriculum content", () => {
    const results = search(corpus, "titration");
    expect(results.some((r) => r.kind === "question")).toBe(true);
  });

  it("searches misconception statements and links them to their topic", () => {
    const results = search(corpus, "R groups");
    const hit = results.find((r) => r.kind === "misconception");
    expect(hit).toBeTruthy();
    expect(hit!.topicId).toBe("wjec-alevel-biology.biological-molecules");
  });

  it("returns nothing for a term that does not appear", () => {
    expect(search(corpus, "zzzqqxnothing")).toHaveLength(0);
  });
});
