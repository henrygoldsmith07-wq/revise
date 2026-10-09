import { describe, expect, it } from "vitest";
import { buildMarksLedger } from "@/domain/marks-ledger";
import type { MistakeRecovery } from "@/domain/mark-recovery";

// ---------------------------------------------------------------------------
// Marks Ledger — synthetic fixtures, NOT human evidence. Asserts the two
// tiers are computed separately and never merged into one score.
// ---------------------------------------------------------------------------

function item(over: Partial<MistakeRecovery> & { mistakeId: string }): MistakeRecovery {
  return {
    topicId: "t1",
    subjectId: "wjec-alevel-physics",
    marks: 1,
    state: "open",
    reason: "fixture",
    ...over,
  };
}

describe("marks ledger tiers", () => {
  it("reports empty ledgers as no evidence, not zero achievement", () => {
    const ledger = buildMarksLedger([]);
    expect(ledger.practice.marks).toBe(0);
    expect(ledger.proven.marks).toBe(0);
    expect(ledger.statement).toContain("No lost marks recorded yet");
  });

  it("keeps practice recovery and trusted proof in separate tiers", () => {
    const ledger = buildMarksLedger([
      item({ mistakeId: "m1", state: "provisional", marks: 2 }),
      item({ mistakeId: "m2", state: "awaiting-proof", marks: 3 }),
      item({ mistakeId: "m3", state: "proven", marks: 4 }),
      item({ mistakeId: "m4", state: "open", marks: 5 }),
      item({ mistakeId: "m5", state: "regressed", marks: 1 }),
    ]);
    expect(ledger.practice).toEqual({ marks: 5, count: 2, unverifiedOnlyMarks: 0 });
    expect(ledger.proven).toEqual({ marks: 4, count: 1 });
    expect(ledger.open).toEqual({ marks: 6, count: 2 });
    // The two tiers are never summed anywhere in the ledger object.
    expect("total" in ledger).toBe(false);
    expect(ledger.statement).toContain("5 marks recovering on practice questions");
    expect(ledger.statement).toContain("4 marks proven on trusted unseen questions");
  });

  it("tracks the unverified-only subset inside the practice tier", () => {
    const ledger = buildMarksLedger([
      item({ mistakeId: "m1", state: "provisional", marks: 2, unverifiedOnly: true }),
      item({ mistakeId: "m2", state: "provisional", marks: 2 }),
    ]);
    expect(ledger.practice.marks).toBe(4);
    expect(ledger.practice.unverifiedOnlyMarks).toBe(2);
  });

  it("explains why the tiers differ behind the Why disclosure", () => {
    const ledger = buildMarksLedger([item({ mistakeId: "m1", state: "proven", marks: 1 })]);
    expect(ledger.explanation).toContain("never added together");
    expect(ledger.explanation).toContain("without help after a delay");
  });
});
