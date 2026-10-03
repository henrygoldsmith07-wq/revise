import { describe, expect, it } from "vitest";
import { buildPaperResult } from "@/domain/paper-result";
import { LEARNER_STATE_LABEL } from "@/domain/learner-state";
import type { PaperRecovery } from "@/domain/paper-recovery";

const NOW = new Date("2026-10-03T12:00:00Z");
const totals = (o: Partial<PaperRecovery["totals"]> = {}): PaperRecovery["totals"] => ({
  previouslyLost: 6, targeted: 0, provisional: 0, awaitingProof: 0, proven: 0, regressed: 0, open: 6, evidence: "thin",
  recovered: { low: 0, high: 0 }, statement: "", ...o,
});
const loss = (id: string, topicId: string, marksLost: number, cause: string, label: string, recurring = false) =>
  ({ mistakeId: id, topicId, questionId: `q-${id}`, marksLost, cause, causeLabel: label, recurring, important: true, intervention: "independent-set", recovery: "open", proven: false }) as unknown as PaperRecovery["losses"][number];
const recovery = (o: Partial<PaperRecovery> = {}): PaperRecovery => ({
  paperId: "p1", title: "Paper 1", score: 34, max: 40, totals: totals(), stage: "autopsy", stageReason: "",
  losses: [loss("a", "t-forces", 3, "calculation", "Calculation slips"), loss("b", "t-forces", 1, "calculation", "Calculation slips", true), loss("c", "t-waves", 2, "knowledge", "Knowledge gap")],
  diagnosis: {} as PaperRecovery["diagnosis"], ...o,
});

const stage = { kind: "delayed-proof", title: "Delayed check", minutes: 6, dayOffset: 5, reason: "Enough time has passed.", done: false };
const fakeMission = { id: "m1", title: "Paper 1", status: "awaiting-proof", recovery: totals({ provisional: 6, awaitingProof: 6, open: 0 }), current: stage, stages: [stage], completionCondition: "x", evidence: [] } as never;

describe("paper result", () => {
  it("reports where marks were lost, biggest first, and the likely reason", () => {
    const r = buildPaperResult({ recovery: recovery(), mission: null, now: NOW });
    expect(r.where).toEqual([{ topicId: "t-forces", marks: 4 }, { topicId: "t-waves", marks: 2 }]);
    expect(r.reason).toBe("Mostly calculation slips (4 marks), which has cost marks before.");
    expect(r.lost).toBe(6);
    expect(r.recoverable).toBe(6);
    expect(r.state).toBe("needs-work");
    expect(LEARNER_STATE_LABEL[r.state!]).toBe("Needs work");
  });

  it("never calls early success proof", () => {
    const r = buildPaperResult({ recovery: recovery({ totals: totals({ provisional: 3, open: 3 }) }), mission: null, now: NOW });
    expect(r.state).toBe("improving");
    expect(r.statement).toBe("This is improving, but not proven yet.");
    expect(r.recoverable).toBe(6);
  });

  it("is proven only when every lost mark is proven, and regressed when any slipped", () => {
    expect(buildPaperResult({ recovery: recovery({ totals: totals({ proven: 6, open: 0 }) }), mission: null, now: NOW }).state).toBe("proven");
    expect(buildPaperResult({ recovery: recovery({ totals: totals({ proven: 3, regressed: 1, open: 3 }) }), mission: null, now: NOW }).state).toBe("regressed");
  });

  it("states a delay in days when a check is waiting", () => {
    const r = buildPaperResult({ recovery: recovery({ totals: totals({ provisional: 6, awaitingProof: 6, open: 0 }) }), mission: fakeMission, nextCheckAt: "2026-10-08T12:00:00Z", now: NOW });
    expect(r.state).toBe("awaiting-proof");
    expect(r.check).toBe("Revise will check this again in 5 days.");
  });

  it("says plainly when nothing was lost", () => {
    const r = buildPaperResult({ recovery: recovery({ totals: totals({ previouslyLost: 0, open: 0 }), losses: [] }), mission: null, now: NOW });
    expect(r.state).toBeNull();
    expect(r.statement).toBe("No marks were lost on this paper.");
    expect(r.next).toBeNull();
  });
});
