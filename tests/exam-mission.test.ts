import { describe, expect, it } from "vitest";
import { buildExamMissions, buildPaperMission, missionNextAction, type MissionInput } from "@/domain/exam-mission";
import { buildMarkRecovery } from "@/domain/mark-recovery";
import { buildPaperRecovery } from "@/domain/paper-recovery";
import { buildSessionEvidence } from "@/domain/session-evidence";
import { buildMistakePatterns } from "@/domain/mistake-patterns";
import { attempt, bank, mistake } from "./helpers-recovery";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const unitMistakes = [
  mistake("m1", { workingErrorKind: "unit-error", questionId: "q-a1", createdAt: "2026-09-18T09:00:00.000Z", attemptId: "p1" }),
  mistake("m2", { workingErrorKind: "conversion-error", questionId: "q-g1", topicId: "geometry", createdAt: "2026-09-20T09:00:00.000Z", attemptId: "p1" }),
];
const paperAttempts = [attempt("p1", "q-a1", 0, 3, "2026-09-18T08:00:00.000Z", { paperSpecId: "paper-1" })];

function input(attempts = paperAttempts, over: Partial<MissionInput> = {}, mistakes = unitMistakes) {
  const recovery = buildMarkRecovery({ mistakes, attempts, questions: bank, now: NOW });
  const patterns = buildMistakePatterns({ mistakes, attempts, questions: bank });
  return { mistakes, recovery, patterns, daysToExam: 40, unseenByTopic: { algebra: 4, geometry: 3 }, topicTitle: (id: string) => id, ...over } satisfies MissionInput;
}

describe("exam missions", () => {
  it("builds an evidence-driven mission from a recurring cause", () => {
    const [m] = buildExamMissions(input());
    expect(m.origin).toBe("pattern");
    expect(m.cause).toBe("unit-error");
    expect(m.title).toMatch(/unit-conversion/i);
    expect(m.status).toBe("not-started");
    expect(m.stages.map((s) => s.kind)).toEqual(["repair", "practise", "apply", "delayed-proof", "complete"]);
    expect(m.stages.every((s) => s.reason.length > 0)).toBe(true);
    expect(m.evidence[0]).toMatch(/6 marks lost across 2 questions/);
    expect(m.current.kind).toBe("repair");
  });

  it("adds a diagnose stage when the cause is mostly unclassified", () => {
    const ms = [mistake("m1", { category: "unclassified" }), mistake("m2", { category: "unclassified", questionId: "q-a2" })];
    const [m] = buildExamMissions(input(paperAttempts, {}, ms));
    expect(m.stages[0].kind).toBe("diagnose");
  });

  it("advances stages only on evidence, not on activity", () => {
    const touched = [...paperAttempts, attempt("a1", "q-a2", 1, 3, "2026-09-25T09:00:00.000Z", { retestMistakeId: "m1" })];
    const m = buildExamMissions(input(touched))[0];
    expect(m.status).toBe("active");
    expect(m.current.kind).toBe("practise");
    // Many same-question repeats never move it past practise.
    const repeats = [...paperAttempts, attempt("r1", "q-a1", 3, 3, "2026-09-25T09:00:00.000Z"), attempt("r2", "q-a1", 3, 3, "2026-09-30T09:00:00.000Z")];
    const r = buildExamMissions(input(repeats))[0];
    expect(r.status).not.toBe("proven");
    expect(r.current.kind).toBe("apply");
  });

  it("is awaiting proof until a delayed independent success, then proven", () => {
    const both = [
      attempt("a1", "q-a2", 3, 3, "2026-09-25T09:00:00.000Z"),
      attempt("a2", "q-g2", 3, 3, "2026-09-25T10:00:00.000Z", { topicIds: ["geometry"] }),
    ];
    const waiting = buildExamMissions(input([...paperAttempts, ...both]))[0];
    expect(waiting.status).toBe("awaiting-proof");
    expect(waiting.current.kind).toBe("delayed-proof");
    expect(waiting.proofDueAt).toBeDefined();

    const proof = [
      ...paperAttempts, ...both,
      attempt("a3", "q-a3", 3, 3, "2026-09-30T09:00:00.000Z"),
      attempt("a5", "q-g3", 3, 3, "2026-09-30T10:00:00.000Z", { topicIds: ["geometry"] }),
    ];
    const done = buildExamMissions(input(proof))[0];
    expect(done.status).toBe("proven");
    expect(done.current.kind).toBe("complete");
    expect(done.recovery.proven).toBe(6);
  });

  it("lets measured outcomes reorder missions", () => {
    const ms = [...unitMistakes, mistake("m3", { questionId: "q-a2", topicId: "algebra", marksLost: 7, category: "recall" })];
    const base = buildExamMissions(input(paperAttempts, {}, ms));
    const weighted = buildExamMissions(input(paperAttempts, { repairWeight: (k) => (k === "technique-intervention" ? 0.3 : 1) }, ms));
    expect(base[0].cause).toBe("unit-error");
    expect(weighted[0].cause).not.toBe("unit-error");
  });

  it("flags regression when a proven mark is lost again", () => {
    const attempts = [
      ...paperAttempts,
      attempt("a1", "q-a2", 3, 3, "2026-09-22T09:00:00.000Z"), attempt("a2", "q-a3", 3, 3, "2026-09-30T09:00:00.000Z"),
      attempt("a3", "q-a4", 0, 3, "2026-10-02T09:00:00.000Z"),
    ];
    const ms = [mistake("m1", { workingErrorKind: "unit-error" })];
    const missions = buildExamMissions(input(attempts, {}, ms));
    expect(missions[0].status).toBe("regressed");
    expect(missions[0].current.kind).toBe("repair");
  });

  it("is blocked, not secure, when there are too few unseen questions to prove improvement", () => {
    const attempts = [...paperAttempts, attempt("a1", "q-a2", 3, 3, "2026-09-25T09:00:00.000Z")];
    const ms = [mistake("m1", { workingErrorKind: "unit-error" })];
    const [m] = buildExamMissions(input(attempts, { unseenByTopic: { algebra: 0 } }, ms));
    expect(m.proofPossible).toBe(false);
    expect(m.status).toBe("blocked");
    expect(m.evidence.join(" ")).toMatch(/too few unseen/);
    expect(m.stages.find((s) => s.kind === "apply")?.blockedBy).toBeDefined();
  });

  it("drops the delayed check when the exam is too close to prove anything", () => {
    const [m] = buildExamMissions(input(paperAttempts, { daysToExam: 2 }));
    expect(m.stages.some((s) => s.kind === "delayed-proof")).toBe(false);
    expect(m.proofPossible).toBe(false);
    expect(m.completionCondition).toMatch(/cannot be proven/);
  });

  it("starts a mission directly from a paper autopsy", () => {
    const m = buildPaperMission("paper-1", input(paperAttempts, { paperTitles: { "paper-1": "2025 Physics Unit 1" } }))!;
    expect(m.origin).toBe("paper");
    expect(m.title).toBe("Repair mistakes from 2025 Physics Unit 1");
    expect(buildPaperMission("none", input())).toBeNull();
  });

  it("produces one next action with why, what follows and the proof standard", () => {
    const action = missionNextAction(buildExamMissions(input())[0]);
    expect(action.title).toMatch(/^Start:/);
    expect(action.minutes).toBeGreaterThan(0);
    expect(action.why).toMatch(/6 marks/);
    expect(action.after).toMatch(/^Next,/);
    expect(action.proof).toMatch(/different question/);
    expect(action.href).toMatch(/^\/practice\?recover=1/);
    const later = buildExamMissions(input([...paperAttempts, attempt("a1", "q-a2", 3, 3, "2026-09-25T09:00:00.000Z")]))[0];
    expect(missionNextAction(later).href).toMatch(/^\/adaptive-session\?topic=/);
  });
});

describe("paper recovery lifecycle", () => {
  const make = (attempts: ReturnType<typeof attempt>[]) => {
    const recovery = buildMarkRecovery({ mistakes: unitMistakes, attempts, questions: bank, now: NOW });
    return buildPaperRecovery({ paperId: "paper-1", title: "2025 Unit 1", mistakes: unitMistakes, recovery, attempts, questions: bank })!;
  };

  it("starts at autopsy, with causes and recurrence on each loss", () => {
    const r = make(paperAttempts);
    expect(r.stage).toBe("autopsy");
    expect(r.losses[0].causeLabel).toMatch(/unit/);
    expect(r.losses.every((l) => l.recurring && l.important)).toBe(true);
    expect(r.totals.previouslyLost).toBe(6);
  });

  it("is not closed by revision alone, and closes only when important losses are proven", () => {
    const busy = [...paperAttempts, attempt("a1", "q-a2", 3, 3, "2026-09-25T09:00:00.000Z"), attempt("a2", "q-g2", 3, 3, "2026-09-25T10:00:00.000Z", { topicIds: ["geometry"] })];
    expect(make(busy).stage).toBe("delayed-verification");
    const proven = [...busy, attempt("a3", "q-a3", 3, 3, "2026-09-30T09:00:00.000Z"), attempt("a4", "q-a5", 3, 3, "2026-09-30T10:00:00.000Z")];
    const reused = [...proven, attempt("a5", "q-g2", 3, 3, "2026-09-30T11:00:00.000Z", { topicIds: ["geometry"] })];
    // Reusing the question that earned the first success is not a new check.
    expect(make(reused).stage).not.toBe("closed");
    const fresh = [...proven, attempt("a5", "q-g3", 3, 3, "2026-09-30T11:00:00.000Z", { topicIds: ["geometry"] })];
    expect(make(fresh).stage).toBe("closed");
  });
});

describe("session evidence", () => {
  it("states what changed, what is weak, the evidence created and what happens next", () => {
    const before = buildMarkRecovery({ mistakes: unitMistakes, attempts: paperAttempts, questions: bank, now: NOW }).totals;
    const session = [attempt("s1", "q-a2", 3, 3, "2026-10-03T09:00:00.000Z"), attempt("s2", "q-a3", 0, 3, "2026-10-03T09:05:00.000Z", { hintTier: "cue" })];
    const after = buildMarkRecovery({ mistakes: unitMistakes, attempts: [...paperAttempts, ...session], questions: bank, now: NOW }).totals;
    const s = buildSessionEvidence({ attempts: session, before, after });
    expect(s.evidence.independent).toBe(1);
    expect(s.evidence.lines).toContain("no delayed proof yet");
    expect(s.evidence.lines.join(" ")).toMatch(/used help/);
    expect(s.stillWeak.length).toBeGreaterThan(0);
    expect(s.next).toMatch(/different question/);
  });
});
