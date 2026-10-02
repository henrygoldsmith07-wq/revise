import { describe, expect, it } from "vitest";
import { buildPaperReadiness, rankPapers, resolvePaperTopics } from "@/domain/paper-readiness";
import type { Attempt, ExamDate, Mistake, Question, SpecPoint, Subject, Topic, Unit } from "@/domain/types";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const point = (id: string): SpecPoint => ({ id, ref: id, text: id, aos: ["AO1"] });

const subject: Subject = {
  id: "maths", qualificationId: "q", name: "Maths", gradeBoundaries: [],
  papers: [
    { id: "maths.u1", name: "Unit 1", weight: 0.6, durationMinutes: 90, calculatorAllowed: true },
    { id: "maths.u2", name: "Unit 2", weight: 0.4, durationMinutes: 90, calculatorAllowed: true },
    { id: "maths.u9", name: "Unit 9", weight: 0.1, durationMinutes: 90, calculatorAllowed: true },
  ],
};
const units: Unit[] = [
  { id: "a", subjectId: "maths", title: "Unit 1: Mechanics", order: 1 },
  { id: "b", subjectId: "maths", title: "Unit 2: Fields", order: 2 },
  { id: "c", subjectId: "maths", title: "Core ideas", order: 3 },
];
const topic = (id: string, unitId: string, pts: string[]): Topic => ({
  id, subjectId: "maths", unitId, title: id, order: 1, intrinsicDifficulty: 2, summary: "", keyPoints: [], commonErrors: [],
  specPoints: pts.map(point),
});
const topics = [topic("t1", "a", ["s1", "s2"]), topic("t2", "b", ["s3"]), topic("t3", "c", ["s4"])];

function q(id: string, spec: string, transfer = false): Question {
  return {
    id: transfer ? `${id}-unfamiliar` : id, subjectId: "maths", topicIds: ["t1"], kind: "short", stem: id,
    parts: [{ id: `${id}:a`, label: "", prompt: "p", marks: 2, markScheme: ["x", "y"], modelAnswer: "m", specPointIds: [spec] }],
    totalMarks: 2, calculatorAllowed: true, difficulty: 3, origin: "seed", createdAt: "2026-01-01T09:00:00.000Z",
    ...(transfer ? { learning: { demand: "transfer" } as Question["learning"] } : {}),
  };
}
function att(id: string, question: Question, awarded: number, extra: Partial<Attempt> = {}): Attempt {
  return {
    id, userId: "u", questionId: question.id, subjectId: "maths", topicIds: question.topicIds, answers: {},
    marked: [{ partId: `${question.id.replace("-unfamiliar", "")}:a`, awarded, max: 2, creditedPoints: [], missedPoints: [], comment: "" }],
    awarded, max: 2, feedback: "", markedBy: "rubric", elapsedMs: 1000, mode: "practice", createdAt: day(1), ...extra,
  };
}
const mistake = (id: string, topicId: string, questionId: string, marksLost = 2): Mistake => ({
  id, userId: "u", subjectId: "maths", topicId, questionId, marksLost, description: "", category: "method", createdAt: day(1),
} as unknown as Mistake);

const run = (over: Partial<Parameters<typeof buildPaperReadiness>[0]> = {}) =>
  buildPaperReadiness({ subject, topics, units, questions: [], attempts: [], mistakes: [], now: NOW, ...over });
const byId = (rows: ReturnType<typeof run>, id: string) => rows.find((row) => row.paperId === id)!;

describe("paper topic resolution", () => {
  it("only links topics the unit title names, and leaves others unknown", () => {
    const map = resolvePaperTopics(subject, topics, units);
    expect(map.get("maths.u1")).toEqual({ topicIds: ["t1"], mapping: "unit-title" });
    expect(map.get("maths.u9")).toEqual({ topicIds: [], mapping: "unknown" });
  });
  it("treats a single-paper subject as covering everything and honours explicit maps", () => {
    const solo = { ...subject, papers: [subject.papers[0]!] };
    expect(resolvePaperTopics(solo, topics, units).get("maths.u1")?.mapping).toBe("single-paper");
    expect(resolvePaperTopics(subject, topics, units, { "maths.u9": ["t3"] }).get("maths.u9")).toEqual({ topicIds: ["t3"], mapping: "explicit" });
  });
});

describe("paper readiness", () => {
  it("reports zero evidence as missing, not as a score", () => {
    const row = byId(run(), "maths.u1");
    expect(row).toMatchObject({ statements: 2, secure: 0, missing: 2, untouched: 2, secureShare: 0, evidence: "none", marksAtRisk: 0 });
    expect(row.recall.accuracy).toBeNull();
    expect(row.nextProof.kind).toBe("first-evidence");
  });

  it("keeps an unmapped paper explicitly unknown", () => {
    const row = byId(run(), "maths.u9");
    expect(row).toMatchObject({ mapping: "unknown", secureShare: null, urgency: null, statements: 0 });
    expect(row.nextProof.kind).toBe("unknown");
  });

  it("handles no exam date and a past exam", () => {
    expect(byId(run(), "maths.u1").daysUntil).toBeNull();
    const dates: ExamDate[] = [{ id: "e", userId: "u", subjectId: "maths", paperSpecId: "maths.u1", date: "2026-09-20", label: "U1" }];
    const past = byId(run({ examDates: dates }), "maths.u1");
    expect(past.daysUntil).toBeLessThan(0);
    expect(past.urgency).toBeNull();
  });

  it("prefers the next upcoming date over a past sitting", () => {
    const dates: ExamDate[] = [
      { id: "e1", userId: "u", subjectId: "maths", paperSpecId: "maths.u1", date: "2026-06-01", label: "old" },
      { id: "e2", userId: "u", subjectId: "maths", paperSpecId: "maths.u1", date: "2026-10-19", label: "new" },
    ];
    expect(byId(run({ examDates: dates }), "maths.u1").daysUntil).toBe(18);
  });

  it("totals only open mistakes for the paper's topics and counts recurring ones across questions", () => {
    const rows = run({
      mistakes: [
        mistake("m1", "t1", "qa", 3), mistake("m2", "t1", "qb", 2), mistake("m3", "t2", "qc", 5),
        { ...mistake("m4", "t1", "qd", 4), resolved: true } as Mistake,
      ],
    });
    expect(byId(rows, "maths.u1")).toMatchObject({ marksAtRisk: 5, unresolvedMistakes: 2, recurringMistakes: 1 });
    expect(byId(rows, "maths.u1").nextProof.kind).toBe("repair");
    expect(byId(rows, "maths.u2")).toMatchObject({ marksAtRisk: 5, recurringMistakes: 0 });
  });

  it("does not credit transfer proof from hinted attempts or one-off thin evidence", () => {
    const tq = q("tq", "s1", true);
    const hinted = run({ questions: [tq], attempts: [att("a1", tq, 2, { hintTier: "cue" })] });
    expect(byId(hinted, "maths.u1")).toMatchObject({ transferProven: 0, transferUnproven: 1 });
    const clean = run({ questions: [tq], attempts: [att("a2", tq, 2)] });
    const row = byId(clean, "maths.u1");
    expect(row).toMatchObject({ transferProven: 1, transferUnproven: 0 });
    expect(row.transfer.accuracy).toBeNull();
  });

  it("ignores self-marked answers", () => {
    const tq = q("tq", "s1", true);
    const row = byId(run({ questions: [tq], attempts: [att("a", tq, 2, { markedBy: "self" })] }), "maths.u1");
    expect(row.transferProven).toBe(0);
  });

  it("reports no unseen transfer questions as nothing to prove rather than proven", () => {
    const row = byId(run({ questions: [q("r1", "s1")] }), "maths.u1");
    expect(row).toMatchObject({ transferProven: 0, transferUnproven: 0 });
  });

  it("shows sudden deterioration: secure share drops when recent answers fail", () => {
    const qs = ["q1", "q2", "q3", "q4"].map((id) => q(id, "s1"));
    const good = qs.map((x, i) => att(`g${i}`, x, 2, { createdAt: day(5) }));
    const before = byId(run({ questions: qs, attempts: good }), "maths.u1");
    const bad = qs.map((x, i) => att(`b${i}`, x, 0, { createdAt: day(0) }));
    const after = byId(run({ questions: qs, attempts: [...good, ...bad] }), "maths.u1");
    expect(before.secure).toBe(1);
    expect(after.secure).toBe(0);
    expect(after.secureShare!).toBeLessThanOrEqual(before.secureShare!);
  });

  it("ranks near, heavy, weak papers first and unknown papers last", () => {
    const dates: ExamDate[] = [
      { id: "e1", userId: "u", subjectId: "maths", paperSpecId: "maths.u1", date: "2026-10-31", label: "" },
      { id: "e2", userId: "u", subjectId: "maths", paperSpecId: "maths.u2", date: "2026-10-05", label: "" },
    ];
    const ranked = rankPapers(run({ examDates: dates }));
    expect(ranked.map((row) => row.paperId)).toEqual(["maths.u2", "maths.u1", "maths.u9"]);
  });
});
