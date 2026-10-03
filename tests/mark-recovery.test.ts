import { describe, expect, it } from "vitest";
import { buildMarkRecovery, classifyMistake } from "@/domain/mark-recovery";
import { attempt, bank, mistake } from "./helpers-recovery";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const run = (attempts = [] as ReturnType<typeof attempt>[], m = mistake("m1"), now = NOW) =>
  classifyMistake(m, attempts, new Map(bank.map((q) => [q.id, q])), now);

describe("marks recovered", () => {
  it("leaves untouched marks open", () => {
    expect(run().state).toBe("open");
  });

  it("counts a revisit without success as targeted, not recovered", () => {
    const r = run([attempt("a1", "q-a2", 1, 3, "2026-09-21T09:00:00.000Z")]);
    expect(r.state).toBe("targeted");
  });

  it("treats a repeat of the same question as provisional, never proof", () => {
    const r = run([attempt("a1", "q-a1", 3, 3, "2026-09-21T09:00:00.000Z"), attempt("a2", "q-a1", 3, 3, "2026-09-30T09:00:00.000Z")]);
    expect(r.state).toBe("provisional");
  });

  it("does not count help or self-marking as independent proof", () => {
    const hinted = attempt("a1", "q-a2", 3, 3, "2026-09-21T09:00:00.000Z", { hintTier: "cue" });
    const later = attempt("a2", "q-a3", 3, 3, "2026-09-30T09:00:00.000Z", { markedBy: "self" });
    expect(run([hinted, later]).state).toBe("provisional");
  });

  it("awaits delayed proof after an independent success on a different question", () => {
    const r = run([attempt("a1", "q-a2", 3, 3, "2026-09-22T09:00:00.000Z")], mistake("m1"), new Date("2026-09-23T09:00:00.000Z"));
    expect(r.state).toBe("awaiting-proof");
    expect(r.proofDueAt).toBe("2026-09-25T09:00:00.000Z");
  });

  it("proves a mark only after a delayed independent success on another question", () => {
    const r = run([attempt("a1", "q-a2", 3, 3, "2026-09-22T09:00:00.000Z"), attempt("a2", "q-a3", 3, 3, "2026-09-30T09:00:00.000Z")]);
    expect(r.state).toBe("proven");
  });

  it("does not let a delayed repeat of the first success's question prove it", () => {
    const r = run([attempt("a1", "q-a2", 3, 3, "2026-09-22T09:00:00.000Z"), attempt("a2", "q-a1", 3, 3, "2026-09-30T09:00:00.000Z")]);
    expect(r.state).toBe("awaiting-proof");
  });

  it("marks a proven mark as regressed when a later independent attempt fails", () => {
    const r = run([
      attempt("a1", "q-a2", 3, 3, "2026-09-22T09:00:00.000Z"), attempt("a2", "q-a3", 3, 3, "2026-09-30T09:00:00.000Z"),
      attempt("a3", "q-a4", 0, 3, "2026-10-02T09:00:00.000Z"),
    ]);
    expect(r.state).toBe("regressed");
  });

  it("keeps totals consistent and reports ranges when evidence is thin", () => {
    const ms = [mistake("m1", { marksLost: 3 }), mistake("m2", { marksLost: 2, questionId: "q-g1", topicId: "geometry" })];
    const thin = buildMarkRecovery({ mistakes: ms, attempts: [attempt("a1", "q-a2", 3, 3, "2026-09-22T09:00:00.000Z")], questions: bank, now: NOW });
    const t = thin.totals;
    expect(t.proven + t.provisional + t.open).toBe(t.previouslyLost);
    expect(t.evidence).toBe("thin");
    expect(t.recovered.low).toBe(0);
    expect(t.recovered.high).toBe(3);
    expect(t.statement).toMatch(/incomplete/i);
  });

  it("reports no evidence rather than inventing precision", () => {
    const none = buildMarkRecovery({ mistakes: [mistake("m1")], attempts: [], questions: bank, now: NOW }).totals;
    expect(none.evidence).toBe("none");
    expect(none.open).toBe(3);
    expect(none.recovered).toEqual({ low: 0, high: 0 });
  });

  it("groups by topic and paper", () => {
    const ms = [mistake("m1", { attemptId: "p1" }), mistake("m2", { topicId: "geometry", questionId: "q-g1", attemptId: "p2" })];
    const attempts = [attempt("p1", "q-a1", 0, 3, "2026-09-20T08:00:00.000Z", { paperSpecId: "paper-1" }), attempt("p2", "q-g1", 0, 3, "2026-09-20T08:00:00.000Z", { paperSpecId: "paper-2" })];
    const r = buildMarkRecovery({ mistakes: ms, attempts, questions: bank, now: NOW });
    expect(r.byTopic("geometry").previouslyLost).toBe(3);
    expect(r.byPaper("paper-1").previouslyLost).toBe(3);
  });
});

describe("paper attribution", () => {
  it("prefers the paper record id over the shared spec id", () => {
    const attempts = [attempt("p1", "q-a1", 0, 3, "2026-09-20T08:00:00.000Z", { paperId: "paper-2025", paperSpecId: "unit-1" })];
    const r = buildMarkRecovery({ mistakes: [mistake("m1", { attemptId: "p1" })], attempts, questions: bank, now: NOW });
    expect(r.byPaper("paper-2025").previouslyLost).toBe(3);
    expect(r.byPaper("unit-1").previouslyLost).toBe(0);
  });
});
