import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { masteryStage, REFERENCE_PROOF_NEXT, stageLabel, stageMeaning } from "@/domain/mastery-stage";
import { buildPaperReadiness } from "@/domain/paper-readiness";
import { buildProgressSummary } from "@/domain/progress-summary";
import { buildSpecificationMap, specStatusLabel } from "@/domain/specification-evidence";
import type { Attempt, Question, Subject, Topic, Unit } from "@/domain/types";

// Reference-tier subjects (everything outside the four WJEC flagships) are
// practised on outline questions nobody has checked against the board's
// specification. #41 stopped their outlook and readiness reading as exam
// predictions; these tests hold the remaining mastery and specification
// wording to the same line. Each describe block fails on the code before this
// change (a reference topic reached "Proven"; the spec map had no tier and
// always said "Secure"; paper readiness asked the learner to "Prove it").

const REF = "aqa-alevel-maths";
const NOW = new Date("2026-10-01T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const q = (id: string, family: string, context: string, subjectId = REF): Question => ({
  id, subjectId, topicIds: ["t"], kind: "short", stem: id, totalMarks: 3, calculatorAllowed: true, difficulty: 3, origin: "seed",
  createdAt: "2026-01-01T00:00:00Z", learning: { familyId: family, contextId: context, expectedMinutes: 3 } as Question["learning"],
  parts: [{ id: `${id}:a`, label: "", prompt: "p", marks: 3, markScheme: ["a"], modelAnswer: "m", specPointIds: ["sp1"] }],
}) as Question;
const att = (id: string, question: Question, awarded: number, daysAgo: number): Attempt => ({
  id, userId: "u", questionId: question.id, subjectId: question.subjectId, topicIds: ["t"], answers: {},
  marked: [{ partId: question.parts[0]!.id, awarded, max: 3 }] as Attempt["marked"], awarded, max: 3, feedback: "",
  markedBy: "rubric", elapsedMs: 1000, mode: "practice", createdAt: day(daysAgo),
});

const A = q("a", "fa", "ca"), B = q("b", "fb", "ca"), C = q("c", "fc", "cc");
// The exact pattern that makes a topic "proven" on reviewed flagship material:
// unaided success on a new pattern a week after the first evidence.
const delayedTransfer = [att("1", A, 3, 20), att("2", B, 3, 15), att("3", C, 3, 2)];

describe("a reference-tier topic can never reach Proven", () => {
  it("tops out at Secure in practice, with a next step that says why", () => {
    const r = masteryStage({ topicId: "t", attempts: delayedTransfer, questions: [A, B, C], now: NOW });
    expect(r.referenceTier).toBe(true);
    expect(r.stage).toBe("secure");
    expect(r.next).toBe(REFERENCE_PROOF_NEXT);
    expect(stageLabel(r.stage, r.referenceTier)).toBe("Secure in practice");
    expect(stageMeaning(r.stage, r.referenceTier)).toMatch(/not been checked against this board's specification/);
  });

  it("leaves flagship labels exactly as they were", () => {
    expect(stageLabel("secure", false)).toBe("Secure");
    expect(stageLabel("proven", false)).toBe("Proven");
    expect(stageLabel("practised", true)).toBe("Practised");
  });
});

describe("progress summary qualifies reference strengths", () => {
  it("labels a reference topic Secure in practice and counts it separately", () => {
    const topic: Topic = { id: "t", subjectId: REF, unitId: "u", title: "Topic t", order: 1, intrinsicDifficulty: 2, summary: "", keyPoints: [], commonErrors: [] };
    const s = buildProgressSummary({ subjectIds: [REF], topics: [topic], attempts: delayedTransfer, questions: [A, B, C], mistakes: [], now: NOW });
    expect(s.stageCounts.proven).toBe(0);
    expect(s.stageCounts.secure).toBe(1);
    expect(s.practiceOnlySecure).toBe(1);
    expect(s.strong[0]).toMatchObject({ stage: "secure", label: "Secure in practice", referenceTier: true });
  });
});

describe("specification evidence on a reference subject is a practice map", () => {
  it("flags the tier and qualifies the secure labels", () => {
    expect(buildSpecificationMap({ subjectId: "aqa-alevel-biology", attempts: [], questions: [], now: NOW }).referenceTier).toBe(true);
    expect(buildSpecificationMap({ subjectId: "wjec-alevel-physics", attempts: [], questions: [], now: NOW }).referenceTier).toBe(false);
    expect(specStatusLabel("secure", true)).toBe("Secure in practice");
    expect(specStatusLabel("stale", true)).toBe("Secure in practice but stale");
    expect(specStatusLabel("secure", false)).toBe("Secure");
    expect(specStatusLabel("weak", true)).toBe("Weak");
  });

  it("the page names the practice layer and never hard-codes the flagship label", () => {
    const view = readFileSync(join(process.cwd(), "src/components/SpecificationMapView.tsx"), "utf8");
    expect(view).toContain('referenceTier ? "Practice layer" : "Proof layer"');
    expect(view).toContain("REFERENCE_DISCLAIMER");
    expect(view).not.toContain("STATUS_LABELS[");
    expect(view).not.toContain('label="Secure"');
  });
});

describe("paper readiness on a reference subject asks for practice, not proof", () => {
  const unit: Unit = { id: "u", subjectId: REF, title: "Unit 1: Pure", order: 1 };
  const topic: Topic = {
    id: "t", subjectId: REF, unitId: "u", title: "Topic t", order: 1, intrinsicDifficulty: 2, summary: "", keyPoints: [], commonErrors: [],
    specPoints: [{ id: "sp1", ref: "1.1", text: "Statement" }] as Topic["specPoints"],
  };
  const subject = { id: REF, qualificationId: "q", name: "Maths", papers: [{ id: "p1", name: "Unit 1", weight: 0.5, durationMinutes: 90, totalMarks: 80 }] } as unknown as Subject;
  const transfer = { ...q("x-unfamiliar", "fx", "cx"), slug: "unfamiliar-context-x" } as Question;
  transfer.parts[0]!.learning = { demand: "transfer" } as Question["parts"][number]["learning"];

  it("flags the tier and swaps 'Prove it' for 'Practise it'", () => {
    const [row] = buildPaperReadiness({ subject, topics: [topic], units: [unit], questions: [A, B, transfer], attempts: [att("1", A, 3, 3), att("2", B, 3, 2)], mistakes: [], now: NOW });
    expect(row?.referenceTier).toBe(true);
    expect(row?.nextProof.kind).toBe("transfer");
    expect(row?.nextProof.text).toBe("Practise it on an unfamiliar-context question.");
    expect(row?.nextProof.text).not.toMatch(/^Prove/);
  });

  it("the panel words reference rows as practice", () => {
    const panel = readFileSync(join(process.cwd(), "src/components/PaperReadinessPanel.tsx"), "utf8");
    expect(panel).toContain("practice, not proof");
    expect(panel).toContain('row.referenceTier ? "Next step" : "Next proof"');
  });
});
