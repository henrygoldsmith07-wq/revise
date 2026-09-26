import { describe, expect, it } from "vitest";
import { allTopics } from "@/domain/curriculum";
import { seedQuestions, seedCardsForTopic } from "@/content";
import {
  buildSubjectDepth,
  classifyDepth,
  classifyPartDepth,
  FLAGSHIP_SUBJECTS,
  isFlagship,
  type DepthInput,
} from "@/domain/flagship";
import type { Question } from "@/domain/types";

// ---------------------------------------------------------------------------
// Flagship depth programme — per-statement asset-tree classification and
// aggregation. The real bank is asserted against so the headline depth numbers
// cannot silently rot (CI harness, no live page).
// ---------------------------------------------------------------------------

function miniQuestion(over: Partial<Question> & { id: string; topicId: string }): Question {
  const topicId = over.topicId;
  return {
    subjectId: topicId.split(".").slice(0, -1).join("."),
    topicIds: [topicId],
    kind: "structured",
    stem: "s",
    parts: [
      {
        id: `${over.id}:0`,
        label: "",
        prompt: "p",
        marks: 3,
        markScheme: ["point"],
        modelAnswer: "model",
        aos: over.parts?.[0]?.aos ?? ["AO2"],
        specPointIds: over.parts?.[0]?.specPointIds ?? [`${topicId}.sp-01`],
      },
    ],
    totalMarks: 3,
    ...over,
  } as unknown as Question;
}

describe("classifyDepth", () => {
  it("routes unfamiliar-context questions to transfer", () => {
    const q = miniQuestion({ id: "cnt:question:unfamiliar-context-x", topicId: "wjec-alevel-physics.waves" });
    expect(classifyDepth(q)).toBe("transfer");
  });

  it("routes misconception questions to misconception", () => {
    const q = miniQuestion({ id: "cnt:question:misconception-newton-3", topicId: "wjec-alevel-physics.momentum" });
    expect(classifyDepth(q)).toBe("misconception");
  });

  it("treats 6+ mark questions as synoptic even without a slug signal", () => {
    const q = { ...miniQuestion({ id: "cnt:question:plain", topicId: "wjec-alevel-maths.algebra" }), totalMarks: 6 };
    expect(classifyDepth(q as Question)).toBe("synoptic");
  });

  it("splits recall from application by marks and AO", () => {
    const oneMarkAo1 = miniQuestion({
      id: "cnt:question:r1",
      topicId: "wjec-alevel-biology.cells",
      totalMarks: 1,
      parts: [{ id: "p", label: "", prompt: "", marks: 1, markScheme: [], modelAnswer: "", aos: ["AO1"], specPointIds: [] }],
    } as Partial<Question> & { id: string; topicId: string });
    expect(classifyDepth(oneMarkAo1)).toBe("recall");
  });

  it("classifies every seed question into exactly one bucket", () => {
    for (const q of seedQuestions) {
      expect(["recall", "application", "transfer", "misconception", "synoptic"]).toContain(classifyDepth(q));
    }
  });

  it("classifies structured parts independently instead of flattening the whole question", () => {
    const topicId = "wjec-alevel-chemistry.atomic-structure";
    const question = {
      ...miniQuestion({ id: "mixed-structured", topicId }),
      totalMarks: 8,
      parts: [
        { id: "r", label: "(a)", prompt: "State", marks: 1, markScheme: ["x"], modelAnswer: "x", aos: ["AO1"], specPointIds: [`${topicId}.sp-01`] },
        { id: "a", label: "(b)", prompt: "Apply", marks: 3, markScheme: ["x"], modelAnswer: "x", aos: ["AO2"], specPointIds: [`${topicId}.sp-01`] },
        { id: "t", label: "(c)", prompt: "Evaluate", marks: 2, markScheme: ["x"], modelAnswer: "x", aos: ["AO3"], specPointIds: [`${topicId}.sp-01`] },
      ],
    } as unknown as Question;
    expect(classifyDepth(question)).toBe("synoptic");
    expect(question.parts.map((part) => classifyPartDepth(question, part))).toEqual([
      "recall", "application", "transfer",
    ]);
  });
});

describe("buildSubjectDepth (synthetic fixture)", () => {
  const topicId = "wjec-test-subject.topic-a";
  const topics = [
    {
      id: topicId,
      subjectId: "wjec-test-subject",
      verification: "verified" as const,
      specPoints: [
        { id: `${topicId}.sp-01`, ref: "T1(a)", text: "claim one", aos: ["AO2"], verification: "verified" },
        { id: `${topicId}.sp-02`, ref: "T1(b)", text: "claim two", aos: ["AO2"], verification: "checked" },
      ],
      keyPoints: ["kp"],
      commonErrors: ["ce"],
    } as unknown as Parameters<typeof buildSubjectDepth>[0]["topics"][number],
  ];
  const cardCounts = new Map([[topicId, 5]]);

  function q(id: string, spIndex: number): Question {
    return miniQuestion({
      id,
      topicId,
      parts: [{ id: `${id}:0`, label: "", prompt: "", marks: 2, markScheme: [], modelAnswer: "worked", aos: ["AO2"], specPointIds: [`${topicId}.sp-0${spIndex}`] }],
    } as Partial<Question> & { id: string; topicId: string });
  }

  it("marks a statement gold only with 4+ questions spanning recall/application/transfer", () => {
    const input: DepthInput = {
      topics,
      questions: [
        // True recall: 1 mark, AO1.
        { ...miniQuestion({ id: "a-recall", topicId }), parts: [{ id: "ar", label: "", promptt: "", marks: 1, markScheme: [], modelAnswer: "worked", aos: ["AO1"], specPointIds: [`${topicId}.sp-01`] }], totalMarks: 1 } as unknown as Question,
        q("b-app", 1),
        { ...miniQuestion({ id: "c-transfer", topicId }), parts: [{ id: "ct", label: "", promptmpt: "", marks: 2, markScheme: [], modelAnswer: "w", aos: ["AO3"], specPointIds: [`${topicId}.sp-01`] }] } as unknown as Question,
        q("d-second-application", 1),
      ],
      cardCountByTopic: cardCounts,
    };
    // Force categories: make b-app application via AO2/marks already; c-transfer via AO3.
    input.questions[1] = {
      ...input.questions[1],
      totalMarks: 4,
    } as Question;

    const depth = buildSubjectDepth(input);
    const sp1 = depth.specPoints.find((s) => s.specPointId.endsWith("sp-01"))!;
    expect(sp1.distinctQuestions).toBeGreaterThanOrEqual(4);
    expect(sp1.workedSolutionsComplete).toBe(true);
    expect(depth.goldStatements).toBe(1);
  });

  it("lets one mixed structured question supply several categories but only one independent-question count", () => {
    const point = `${topicId}.sp-01`;
    const mixed = {
      ...miniQuestion({ id: "mixed", topicId }),
      parts: [
        { id: "mixed-r", label: "(a)", prompt: "State", marks: 1, markScheme: ["r"], modelAnswer: "r", aos: ["AO1"], specPointIds: [point] },
        { id: "mixed-a", label: "(b)", prompt: "Apply", marks: 3, markScheme: ["a"], modelAnswer: "a", aos: ["AO2"], specPointIds: [point] },
        { id: "mixed-t", label: "(c)", prompt: "Evaluate", marks: 2, markScheme: ["t"], modelAnswer: "t", aos: ["AO3"], specPointIds: [point] },
      ],
      totalMarks: 6,
    } as unknown as Question;
    const input: DepthInput = {
      topics,
      questions: [mixed, q("second", 1), q("third", 1), q("fourth", 1)],
      cardCountByTopic: cardCounts,
    };
    const depth = buildSubjectDepth(input);
    const row = depth.specPoints.find((item) => item.specPointId === point)!;
    expect(row.distinctQuestions).toBe(4);
    expect(row.categories.recall).toBe(1);
    expect(row.categories.application).toBeGreaterThanOrEqual(1);
    expect(row.categories.transfer).toBe(1);
    expect(depth.goldStatements).toBe(1);
  });

  it("lists gaps ordered worst-first for uncovered statements", () => {
    const depth = buildSubjectDepth({ topics, questions: [], cardCountByTopic: cardCounts });
    expect(depth.gaps.length).toBe(2);
    expect(depth.gaps[0].missing.length).toBeGreaterThanOrEqual(depth.gaps[1].missing.length);
    expect(depth.gaps.every((g) => g.missing.includes("coverage" as never) || g.missing.length > 0)).toBe(true);
  });
});

describe("real flagship bank sanity", () => {
  it("registers exactly the four WJEC A-level flagships", () => {
    expect(FLAGSHIP_SUBJECTS.map((f) => f.subjectId)).toEqual([
      "wjec-alevel-maths",
      "wjec-alevel-biology",
      "wjec-alevel-chemistry",
      "wjec-alevel-physics",
    ]);
    expect(isFlagship("aqa-gcse-physics")).toBe(false);
  });

  it("keeps flagship density honest â€” physics zero-question statements stay below the pre-pack baseline", () => {
    for (const f of FLAGSHIP_SUBJECTS) {
      const topics = allTopics().filter((t) => t.id.startsWith(`${f.subjectId}.`));
      const cardCounts = new Map(topics.map((t) => [t.id, seedCardsForTopic(t, "flagship-depth-test").length] as const));
      const depth = buildSubjectDepth({ topics, questions: seedQuestions, cardCountByTopic: cardCounts });
      const zeroQuestionStatements = depth.specPoints.filter((sp) => sp.distinctQuestions === 0).length;
      // Pre-pack audit found 37 zero-question physics statements; the depth
      // pack cut that to 26. This fence stops silent regressions.
      if (f.subjectId === "wjec-alevel-physics") expect(zeroQuestionStatements).toBeLessThanOrEqual(26);
      expect(depth.statementsTotal).toBeGreaterThan(0);
      expect(depth.questionsPerStatement).toBeGreaterThan(0);
    }
  });
});
