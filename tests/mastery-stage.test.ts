import { describe, expect, it } from "vitest";
import { classifyEvidence, masteryStage } from "@/domain/mastery-stage";
import type { Attempt, Question } from "@/domain/types";

const NOW = new Date("2026-10-01T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const q = (id: string, family = id, context = id): Question => ({
  id, subjectId: "maths", topicIds: ["t"], kind: "short", stem: id, totalMarks: 3, calculatorAllowed: true, difficulty: 3, origin: "seed",
  createdAt: "2026-01-01T00:00:00.000Z", learning: { familyId: family, contextId: context, expectedMinutes: 3 } as Question["learning"],
  parts: [{ id: `${id}:a`, label: "", prompt: "p", marks: 3, markScheme: ["a"], modelAnswer: "m" }],
}) as Question;
const att = (id: string, question: Question, awarded: number, daysAgo: number, o: Partial<Attempt> = {}): Attempt => ({
  id, userId: "u", questionId: question.id, subjectId: "maths", topicIds: ["t"], answers: {}, marked: [], awarded, max: 3, feedback: "",
  markedBy: "rubric", elapsedMs: 1000, mode: "practice", createdAt: day(daysAgo), ...o,
});
const stage = (attempts: Attempt[], questions: Question[], extra: { cardsReviewed?: boolean } = {}) =>
  masteryStage({ topicId: "t", attempts, questions, now: NOW, ...extra });

const A = q("a", "fa", "ca"), B = q("b", "fb", "ca"), C = q("c", "fc", "cc"), D = q("d", "fd", "cd");

describe("evidence classification", () => {
  it("separates repeat, same-pattern, near-transfer and unfamiliar", () => {
    expect(classifyEvidence(A, [], new Set())).toBe("same-pattern");
    expect(classifyEvidence(A, [A], new Set(["a"]))).toBe("repeat");
    expect(classifyEvidence(q("a2", "fa", "cx"), [A], new Set(["a"]))).toBe("same-pattern");
    expect(classifyEvidence(B, [A], new Set(["a"]))).toBe("near-transfer");
    expect(classifyEvidence(C, [A], new Set(["a"]))).toBe("unfamiliar");
  });
});

describe("mastery stage", () => {
  it("is untouched with no evidence and learning once cards were reviewed", () => {
    expect(stage([], [A]).stage).toBe("untouched");
    expect(stage([], [A], { cardsReviewed: true }).stage).toBe("learning");
  });
  it("stays learning until enough different questions are answered unaided", () => {
    const r = stage([att("1", A, 3, 3), att("2", B, 3, 2)], [A, B]);
    expect(r.stage).toBe("learning");
    expect(r.next).toMatch(/1 more different question/);
  });
  it("never lets one repeated question create mastery", () => {
    const attempts = [1, 2, 3, 4, 5, 6].map((i) => att(`r${i}`, A, 3, 10 - i));
    const r = stage(attempts, [A]);
    expect(r.stage).toBe("learning");
    expect(r.evidence).toMatchObject({ independentQuestions: 1, repeatsIgnored: 5 });
    expect(r.reasons.join(" ")).toMatch(/5 repeats of the same question ignored/);
  });
  it("hinted answers are not independent evidence", () => {
    const attempts = [att("1", A, 3, 3, { hintTier: "cue" }), att("2", B, 3, 2, { hintTier: "cue" }), att("3", C, 3, 1, { hintTier: "cue" })];
    expect(stage(attempts, [A, B, C]).stage).toBe("learning");
  });
  it("is practised with volume and accuracy but only familiar patterns", () => {
    const same = [q("a", "f", "c"), q("b", "f", "c"), q("c", "f", "c")];
    const r = stage(same.map((x, i) => att(`s${i}`, x, 3, 5 - i)), same);
    expect(r.stage).toBe("practised");
    expect(r.next).toMatch(/pattern you have not seen/);
  });
  it("is secure after unaided success on a new pattern, before any delay", () => {
    const r = stage([att("1", A, 3, 4), att("2", B, 3, 3), att("3", C, 3, 2)], [A, B, C]);
    expect(r.stage).toBe("secure");
    expect(r.next).toMatch(/7 days/);
  });
  it("is proven only when a new-pattern success comes a week after the first evidence", () => {
    const r = stage([att("1", A, 3, 20), att("2", B, 3, 15), att("3", C, 3, 2)], [A, B, C]);
    expect(r.stage).toBe("proven");
    expect(r.next).toBeNull();
  });
  it("does not prove from low accuracy on new patterns", () => {
    const r = stage([att("1", A, 3, 20), att("2", B, 1, 15), att("3", C, 1, 2)], [A, B, C]);
    expect(["learning", "practised"]).toContain(r.stage);
  });
  it("fades when strong evidence is old", () => {
    const r = stage([att("1", A, 3, 100), att("2", B, 3, 95), att("3", C, 3, 90)], [A, B, C]);
    expect(r.stage).toBe("fading");
    expect(r.reasons.join(" ")).toMatch(/90 days ago/);
  });
  it("does not call weak old evidence fading", () => {
    expect(stage([att("1", A, 1, 100)], [A]).stage).toBe("learning");
  });
  it("ignores self-marked answers", () => {
    const attempts = [att("1", A, 3, 3, { markedBy: "self" }), att("2", B, 3, 2, { markedBy: "self" }), att("3", C, 3, 1, { markedBy: "self" })];
    expect(stage(attempts, [A, B, C]).stage).toBe("learning");
  });
  it("drops back when a recent unaided answer fails and accuracy falls", () => {
    const before = stage([att("1", A, 3, 4), att("2", B, 3, 3), att("3", C, 3, 2)], [A, B, C]).stage;
    const after = stage([att("1", A, 3, 4), att("2", B, 3, 3), att("3", C, 3, 2), att("4", D, 0, 1), att("5", q("e", "fe", "ce"), 0, 0)], [A, B, C, D, q("e", "fe", "ce")]);
    expect(before).toBe("secure");
    expect(after.evidence.accuracy!).toBeLessThan(0.7);
    expect(after.stage).toBe("practised");
  });
});
