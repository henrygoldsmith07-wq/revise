import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { pickExamQuestionForCard, questionsTestingCardPoint } from "@/domain/card-question";
import type { Card, Question, QuestionPart } from "@/domain/types";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function part(id: string): QuestionPart {
  return { id, label: "a", prompt: "Explain…", marks: 2, markScheme: ["point"], modelAnswer: "answer" };
}

function q(overrides: Partial<Question>): Question {
  return {
    id: "q1",
    subjectId: "aqa-biology",
    topicIds: ["aqa-biology.t1"],
    kind: "short",
    stem: "stem",
    parts: [part("p1")],
    totalMarks: 2,
    calculatorAllowed: false,
    difficulty: 2,
    origin: "seed",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function card(overrides: Partial<Card>): Card {
  return {
    id: "c1",
    userId: "u",
    subjectId: "aqa-biology",
    topicId: "aqa-biology.t1",
    kind: "basic",
    front: "front",
    back: "back",
    tags: [],
    origin: "seed",
    ...overrides,
  } as Card;
}

describe("exam question for a card — one official-style question per point", () => {
  const byPoint = q({ id: "q-point", specPointIds: ["aqa-biology.t1.sp-01"], kind: "structured", totalMarks: 3 });
  const otherPoint = q({ id: "q-other", specPointIds: ["aqa-biology.t1.sp-02"] });
  const otherTopic = q({ id: "q-other-topic", topicIds: ["aqa-biology.t2"], specPointIds: ["aqa-biology.t1.sp-01"] });
  const noLink = q({ id: "q-nolink" }); // same topic, no specPointIds at all

  it("matches a question that shares the card's spec point in the same topic", () => {
    const c = card({ specPointIds: ["aqa-biology.t1.sp-01"] });
    expect(questionsTestingCardPoint(c, [byPoint, otherPoint]).map((x) => x.id)).toEqual(["q-point"]);
    expect(pickExamQuestionForCard(c, [otherPoint, byPoint])?.id).toBe("q-point");
  });

  it("never returns a question about a different point or topic", () => {
    const c = card({ specPointIds: ["aqa-biology.t1.sp-01"] });
    expect(pickExamQuestionForCard(c, [otherPoint, otherTopic, noLink])).toBeNull();
  });

  it("a card with no spec-point link yields nothing — no substitute labelled as its point", () => {
    expect(pickExamQuestionForCard(card({}), [byPoint])).toBeNull();
  });

  it("prefers a written question over an MCQ testing the same point", () => {
    const c = card({ specPointIds: ["sp"] });
    const mcq = q({ id: "q-mcq", kind: "mcq", specPointIds: ["sp"], totalMarks: 1 });
    const written = q({ id: "q-written", kind: "structured", specPointIds: ["sp"], totalMarks: 2 });
    expect(pickExamQuestionForCard(c, [mcq, written])?.id).toBe("q-written");
  });

  it("among written questions prefers the tightest (fewest marks, fewest parts)", () => {
    const c = card({ specPointIds: ["sp"] });
    const big = q({ id: "q-big", specPointIds: ["sp"], totalMarks: 8, parts: [part("a"), part("b")] });
    const small = q({ id: "q-small", specPointIds: ["sp"], totalMarks: 2 });
    expect(pickExamQuestionForCard(c, [big, small])?.id).toBe("q-small");
  });
});

describe("review wiring — the check appears between cards", () => {
  const source = src("src/app/review/page.tsx");
  it("grades set the exam check from the card's spec point", () => {
    expect(source).toContain("pickExamQuestionForCard(current, store.questions)");
    expect(source).toContain("setExamCheck(");
    expect(source).toContain("setGradedCard(current)");
  });
  it("renders the interstitial panel before the next card, with Answer it / Next", () => {
    expect(source).toContain("ExamCheckPanel");
    expect(source).toContain("Exam-style question");
    expect(source).toContain("Answer it →");
    expect(source).toContain("Next card");
    expect(source).toContain("continueFromCheck");
  });
  it("space/enter move past the check, and grading keys are inert while it is up", () => {
    expect(source).toContain("examCheck ? continueFromCheck() : setRevealed(true)");
    expect(source).toContain("disabled: !revealed || Boolean(examCheck)");
  });
});
