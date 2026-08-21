import { describe, expect, it } from "vitest";
import {
  misconceptionById,
  misconceptionsForSubject,
  misconceptionsForTopic,
  seedMisconceptions,
  seedQuestions,
} from "@/content";
import { allSubjects, allTopics, getTopic } from "@/domain/curriculum";
import { mistakesFromAttempt } from "@/domain/mistakes";
import { matchMisconception, tallyMisconceptions } from "@/domain/misconception-library";
import { buildSearchIndex, searchIndex } from "@/domain/search";
import type { Attempt, Question } from "@/domain/types";

describe("misconception library", () => {
  it("ships at least two misconceptions for each of the four WJEC A-level subjects", () => {
    const required = allSubjects().filter((s) => s.id.startsWith("wjec-alevel"));
    for (const subject of required) {
      expect(
        misconceptionsForSubject(subject.id).length,
        `${subject.id} should have misconceptions`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps every entry well-formed and linked to topics that exist", () => {
    for (const entry of seedMisconceptions) {
      expect(entry.statement.trim().length).toBeGreaterThan(10);
      expect(entry.explanation.trim().length).toBeGreaterThan(20);
      expect(entry.example.trim().length).toBeGreaterThan(10);
      expect(entry.correction.trim().length).toBeGreaterThan(10);
      expect(entry.topicIds.length).toBeGreaterThan(0);
      for (const topicId of entry.topicIds) {
        expect(getTopic(topicId), `unknown topic ${topicId} in ${entry.id}`).toBeDefined();
      }
    }
  });

  it("uses unique, stable ids", () => {
    const ids = seedMisconceptions.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("seed-misconception:"))).toBe(true);
  });

  it("finds entries by subject, topic and id", () => {
    const entry = seedMisconceptions[0]!;
    expect(misconceptionsForSubject(entry.subjectId)).toContainEqual(entry);
    expect(misconceptionsForTopic(entry.topicIds[0]!)).toContainEqual(entry);
    expect(misconceptionById(entry.id)).toBe(entry);
    expect(misconceptionById("does-not-exist")).toBeUndefined();
  });

  it("covers every entry's subject in the curriculum", () => {
    for (const entry of seedMisconceptions) {
      expect(allTopics().some((t) => t.subjectId === entry.subjectId)).toBe(true);
    }
  });
});

describe("matchMisconception", () => {
  it("matches a student answer against the entry's example", () => {
    const entries = misconceptionsForTopic("wjec-alevel-maths.algebra");
    const match = matchMisconception(
      entries,
      "Solves -2x < 6 correctly",
      "I divided both sides of -2x < 6 by -2 and kept the sign, writing x < -3",
    );
    expect(match).not.toBeNull();
    expect(match!.entry.id).toBe("seed-misconception:inequality-sign-reversal");
    expect(match!.score).toBeGreaterThanOrEqual(0.5);
  });

  it("returns null when the answer carries none of an entry's tell-tale tokens", () => {
    const entries = misconceptionsForTopic("wjec-alevel-maths.algebra");
    expect(matchMisconception(entries, "States x^2 - x - 6", "the sky is blue")).toBeNull();
  });
});

describe("search integration", () => {
  const index = buildSearchIndex({
    topics: allTopics(),
    cards: [],
    questions: seedQuestions,
    misconceptions: seedMisconceptions,
  });

  it("indexes misconceptions so a belief can be looked up by name", () => {
    const hit = searchIndex(index, "R groups").find((r) => r.kind === "misconception");
    expect(hit).toBeTruthy();
    expect(hit!.topicId).toBe("wjec-alevel-biology.biological-molecules");
  });
});

describe("misconception tallies", () => {
  const entries = misconceptionsForTopic("wjec-alevel-maths.algebra");

  const attempt = (): Attempt => ({
    id: "a-tally",
    userId: "u",
    questionId: "q-tally",
    subjectId: "wjec-alevel-maths",
    topicIds: ["wjec-alevel-maths.algebra"],
    answers: { "alg-tally": "I divided both sides of -2x < 6 by -2 and kept the sign, writing x < -3" },
    marked: [
      {
        partId: "alg-tally",
        awarded: 0,
        max: 1,
        creditedPoints: [],
        missedPoints: ["Solves -2x < 6 correctly"],
        comment: "",
      },
    ],
    awarded: 0,
    max: 1,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 1000,
    mode: "practice",
    createdAt: "2025-06-01T09:00:00.000Z",
  });

  const question = (): Question => ({
    id: "q-tally",
    subjectId: "wjec-alevel-maths",
    topicIds: ["wjec-alevel-maths.algebra"],
    kind: "structured",
    stem: "Solve -2x < 6.",
    parts: [
      {
        id: "alg-tally",
        label: "(a)",
        prompt: "Solve -2x < 6.",
        marks: 1,
        markScheme: ["Solves -2x < 6 correctly"],
        modelAnswer: "x > -3",
      },
    ],
    totalMarks: 1,
    calculatorAllowed: true,
    difficulty: 2,
    origin: "seed",
    createdAt: "2025-01-01T00:00:00.000Z",
  });

  it("records the matched library entry id on a mistake", () => {
    let n = 0;
    const [draft] = mistakesFromAttempt(
      attempt(),
      question(),
      () => `m-${n++}`,
      new Date("2025-06-01T09:00:00Z"),
      entries,
    );
    expect(draft.mistake.misconceptionEntryId).toBe("seed-misconception:inequality-sign-reversal");
  });

  it("tallies recurring misconceptions weighted by marks lost", () => {
    const a = entries[0]!;
    const b = entries[1]!;
    const tallies = tallyMisconceptions(
      [
        { misconceptionEntryId: a.id, marksLost: 2 },
        { misconceptionEntryId: b.id, marksLost: 5 },
        { misconceptionEntryId: a.id, marksLost: 1 },
        {},
      ],
      entries,
    );
    expect(tallies).toHaveLength(2);
    // b appears once but costs 5 marks; a appears twice for 3 — b ranks first.
    expect(tallies[0]).toEqual({ entry: b, count: 1, marksLost: 5 });
    expect(tallies[1]).toEqual({ entry: a, count: 2, marksLost: 3 });
  });
});
