import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { allSubjects, allTopics, getTopic } from "@/domain/curriculum";
import { buildPracticalTracks, practicalLessonHref, practicalPracticeHref, type PracticalTrackInput } from "@/domain/practical-track";
import type { Attempt, Card, Question } from "@/domain/types";

const subjectId = "wjec-alevel-physics";
const topicId = `${subjectId}.materials`;
const input = (overrides: Partial<PracticalTrackInput> = {}): PracticalTrackInput => ({
  subjects: allSubjects(), topics: allTopics(), questions: [], attempts: [], cards: [],
  enrolledSubjectIds: [subjectId, "wjec-alevel-biology", "wjec-alevel-chemistry"], userId: "learner", ...overrides,
});
const question = (id: string, prompt: string, overrides: Partial<Question> = {}): Question => ({
  id, subjectId, topicIds: [topicId], kind: "short", stem: "A supplied experiment.",
  parts: [{ id: `${id}-a`, label: "a", prompt, marks: 1, markScheme: ["Use evidence."], modelAnswer: "A plan." }],
  totalMarks: 1, calculatorAllowed: false, difficulty: 2, origin: "seed", verification: "unverified", createdAt: "2026-10-14T12:00:00Z", ...overrides,
});
const attempt = (id: string, questionId: string, overrides: Partial<Attempt> = {}): Attempt => ({
  id, questionId, subjectId, topicIds: [topicId], userId: "learner", answers: {}, marked: [], awarded: 0,
  max: 1, feedback: "Practice", markedBy: "self", elapsedMs: 1000, mode: "practice", createdAt: "2026-10-14T12:00:00Z", ...overrides,
});
const card = (id: string, text: string, overrides: Partial<Card> = {}): Card => ({
  id, subjectId, topicId, userId: "learner", kind: "basic", front: text, back: "Read the lesson.", tags: [],
  origin: "manual", due: "2026-10-14", stability: 1, difficulty: 1, reps: 1, lapses: 0, state: 1,
  lastReviewedAt: "2026-10-14T12:00:00Z", createdAt: "2026-10-14T12:00:00Z", updatedAt: "2026-10-14T12:00:00Z", ...overrides,
});
const path = (value: PracticalTrackInput) => buildPracticalTracks(value).find((track) => track.subjectId === subjectId)!.topics.find((topic) => topic.topicId === topicId)!;

describe("WJEC A-level practical-topic track", () => {
  it("shows explicit subject/topic/stage paths with no reviewed bank", () => {
    const tracks = buildPracticalTracks(input());
    expect(tracks.map((track) => track.subjectName).sort()).toEqual(["Biology", "Chemistry", "Physics"]);
    for (const track of tracks) {
      expect(track.qualification).toBe("WJEC A Level");
      expect(track.topics.length).toBeGreaterThan(4);
      for (const topic of track.topics) {
        expect(topic.stages.map((stage) => stage.id)).toEqual(["method", "uncertainty", "graphs"]);
        expect(topic.stages.every((stage) => stage.practiceHref === null)).toBe(true);
        expect(topic.attemptCount).toBe(0);
        expect(topic.reviewedCardCount).toBe(0);
        expect(topic).not.toHaveProperty("requiredPractical");
      }
    }
  });

  it("restricts scope to supported enrolled WJEC A-level sciences", () => {
    const tracks = buildPracticalTracks(input({ enrolledSubjectIds: ["wjec-gcse-biology", "aqa-alevel-physics", "wjec-alevel-maths", "wjec-alevel-biology"] }));
    expect(tracks.map((track) => track.subjectId)).toEqual(["wjec-alevel-biology"]);
    expect(buildPracticalTracks(input({ enrolledSubjectIds: [] }))).toEqual([]);
  });

  it("checks qualification instead of assuming it from the subject id", () => {
    const subjects = allSubjects().map((subject) => subject.id === subjectId ? { ...subject, qualificationId: "wjec-gcse" } : subject);
    expect(buildPracticalTracks(input({ subjects, enrolledSubjectIds: [subjectId] }))).toEqual([]);
  });

  it("every linked topic exists and belongs to the displayed subject", () => {
    for (const track of buildPracticalTracks(input())) {
      for (const topic of track.topics) {
        expect(getTopic(topic.topicId)?.subjectId).toBe(track.subjectId);
        expect(topic.title).toBe(getTopic(topic.topicId)?.title);
        expect(topic.specRef).toBe(getTopic(topic.topicId)?.specRef ?? null);
        for (const href of [topic.lessonHref, ...topic.stages.map((stage) => stage.lessonHref)]) {
          const url = new URL(href, "https://example.test");
          expect(url.pathname).toBe("/lesson");
          expect(url.searchParams.get("subject")).toBe(track.subjectId);
          expect(getTopic(url.searchParams.get("topic")!)?.subjectId).toBe(track.subjectId);
        }
      }
    }
  });

  it("skips missing or mismatched curriculum topics without inventing one", () => {
    const topics = allTopics().filter((topic) => topic.id !== topicId).map((topic) => topic.id === `${subjectId}.waves` ? { ...topic, subjectId: "other" } : topic);
    const ids = buildPracticalTracks(input({ topics })).find((track) => track.subjectId === subjectId)!.topics.map((topic) => topic.topicId);
    expect(ids).not.toContain(topicId);
    expect(ids).not.toContain(`${subjectId}.waves`);
  });

  it("falls back to the topic lesson if the core practical lesson is missing", () => {
    const result = path(input({ topics: allTopics().filter((topic) => topic.id !== `${subjectId}.practical-investigations`) }));
    expect(result.stages.every((stage) => stage.lessonHref === practicalLessonHref(subjectId, topicId))).toBe(true);
  });

  it("creates specific-question links only for matching visible prompts", () => {
    const questions = [question("method-q", "Describe a method using a control variable."), question("error-q", "Evaluate uncertainty in the measurement."), question("graph-q", "Determine the gradient of the graph."), question("theory-q", "State the meaning of stiffness.")];
    const result = path(input({ questions }));
    expect(result.stages.map((stage) => stage.questionCount)).toEqual([1, 1, 1]);
    expect(result.stages.map((stage) => new URL(stage.practiceHref!, "https://example.test").searchParams.get("question"))).toEqual(["method-q", "error-q", "graph-q"]);
    for (const stage of result.stages) {
      const params = new URL(stage.practiceHref!, "https://example.test").searchParams;
      expect([...params.keys()].sort()).toEqual(["question", "subject", "topic"]);
      expect(params.get("subject")).toBe(subjectId);
      expect(params.get("topic")).toBe(topicId);
    }
  });

  it("does not infer supply from hidden mark schemes or another topic/subject", () => {
    const hidden = question("hidden", "State a definition.");
    hidden.parts[0]!.markScheme = ["Discuss uncertainty and a graph gradient in the method."];
    const result = path(input({ questions: [hidden, question("other-topic", "Draw a graph.", { topicIds: [`${subjectId}.waves`] }), question("other-subject", "Describe the method.", { subjectId: "aqa-alevel-physics" })] }));
    expect(result.stages.every((stage) => stage.questionCount === 0 && stage.practiceHref === null)).toBe(true);
  });

  it("allows unreviewed practice honestly, without changing verification", () => {
    const row = question("draft", "Describe the method.");
    const result = path(input({ questions: [row] }));
    expect(result.stages[0]?.practiceHref).toContain("question=draft");
    expect(row.verification).toBe("unverified");
    expect(result).not.toHaveProperty("mastery");
    expect(result).not.toHaveProperty("approved");
  });

  it("selects an unattempted prompt before repeating a previously attempted one", () => {
    const questions = [question("first", "Describe the method."), question("next", "Describe the method.")];
    expect(path(input({ questions, attempts: [attempt("a", "first")] })).stages[0]?.practiceHref).toContain("question=next");
    expect(path(input({ questions, attempts: [attempt("a", "first"), attempt("b", "next")] })).stages[0]?.practiceHref).toContain("question=first");
  });

  it("counts actual topic activity without treating a mark as proof", () => {
    const questions = [question("q", "Describe the method.")];
    const recorded = attempt("one", "q", { awarded: 0 });
    const result = path(input({ questions, attempts: [recorded, recorded, attempt("other-account", "q", { userId: "other" }), attempt("other-topic", "q", { topicIds: [`${subjectId}.waves`] }), attempt("other-subject", "q", { subjectId: "other" })] }));
    expect(result.attemptCount).toBe(1);
    expect(result.stages[0]?.attemptCount).toBe(1);
    expect(result.stages[1]?.attemptCount).toBe(0);
  });

  it("retains a genuine historical topic attempt without inventing a stage for a missing question", () => {
    const result = path(input({ attempts: [attempt("one", "retired-question")] }));
    expect(result.attemptCount).toBe(1);
    expect(result.stages.every((stage) => stage.attemptCount === 0)).toBe(true);
  });

  it("requires review evidence on cards and isolates the learner and topic", () => {
    const reviewed = card("reviewed", "Explain uncertainty.");
    const result = path(input({ cards: [reviewed, reviewed, card("new", "Draw a graph.", { reps: 0, lastReviewedAt: null }), card("no-date", "Describe the method.", { lastReviewedAt: null }), card("another-user", "Describe the method.", { userId: "other" }), card("another-topic", "Describe the method.", { topicId: `${subjectId}.waves` })] }));
    expect(result.reviewedCardCount).toBe(1);
    expect(result.stages[1]?.reviewedCardCount).toBe(1);
    expect(result.stages[0]?.reviewedCardCount).toBe(0);
    expect(result.stages[2]?.reviewedCardCount).toBe(0);
  });

  it("encodes supported route parameters safely", () => {
    const href = practicalPracticeHref("a & b", "topic/x", "cnt:q?=1");
    const params = new URL(href, "https://example.test").searchParams;
    expect(params.get("subject")).toBe("a & b");
    expect(params.get("topic")).toBe("topic/x");
    expect(params.get("question")).toBe("cnt:q?=1");
  });

  it("the route loads asynchronously, has accessible controls and never imports the bank directly", () => {
    const source = readFileSync("src/app/practicals/page.tsx", "utf8");
    expect(source).toContain("loadAuthoredQuestions().then");
    expect(source).not.toContain('from "@/content');
    expect(source).toContain('htmlFor="practical-subject"');
    expect(source).toContain('aria-label="Practical-related topics"');
    expect(source).toContain("aria-pressed=");
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("not an official required-practical checklist");
    expect(source).toContain("key={userId}");
    expect(source).toContain("if (rows.has(question.id))");
    expect(source).toContain("Retry question bank");
  });
});
