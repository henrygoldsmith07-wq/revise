import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { markResponseSchema } from "@/ai/types";
import {
  LOW_CONFIDENCE_MARK_THRESHOLD,
  assessLowConfidenceMark,
  createMarkEscalationRecord,
  markEscalationReport,
} from "@/domain/mark-escalation";
import type { Attempt } from "@/domain/types";

describe("low-confidence mark escalation", () => {
  it("queues a low-confidence AI mark for human review", () => {
    const decision = assessLowConfidenceMark({ markedBy: "ai", confidence: 0.42 });

    expect(decision).toMatchObject({
      escalate: true,
      status: "pending",
      reason: "low-confidence",
      priority: "standard",
      target: "human-review",
      confidence: 0.42,
      threshold: LOW_CONFIDENCE_MARK_THRESHOLD,
    });
    expect(decision.message).toMatch(/human review/i);

    const record = createMarkEscalationRecord(decision, "2026-08-18T12:00:00.000Z");
    expect(record).toMatchObject({
      status: "pending",
      reason: "low-confidence",
      requestedAt: "2026-08-18T12:00:00.000Z",
      confidence: 0.42,
    });
  });

  it("does not escalate threshold-level or deterministic rubric marks", () => {
    expect(assessLowConfidenceMark({ markedBy: "ai", confidence: LOW_CONFIDENCE_MARK_THRESHOLD }).escalate).toBe(false);
    expect(assessLowConfidenceMark({ markedBy: "rubric", confidence: 0.1 }).escalate).toBe(false);
    expect(createMarkEscalationRecord(assessLowConfidenceMark({ markedBy: "rubric" }), "2026-08-18T12:00:00.000Z")).toBeUndefined();
  });

  it("escalates missing AI confidence as urgent and reports queue coverage", () => {
    const missing = assessLowConfidenceMark({ markedBy: "ai" });
    expect(missing).toMatchObject({
      escalate: true,
      status: "pending",
      reason: "missing-confidence",
      priority: "urgent",
      confidence: null,
    });

    const pending = createMarkEscalationRecord(
      assessLowConfidenceMark({ markedBy: "ai", confidence: 0.42 }),
      "2026-08-18T12:00:00.000Z",
    )!;
    const attempts: Array<Pick<Attempt, "markedBy" | "markConfidence" | "markEscalation">> = [
      { markedBy: "ai", markConfidence: 0.42, markEscalation: pending },
      { markedBy: "ai", markConfidence: 0.9 },
      { markedBy: "rubric", markConfidence: 1 },
    ];
    const report = markEscalationReport(attempts);

    expect(report.totalAttempts).toBe(3);
    expect(report.aiAttempts).toBe(2);
    expect(report.escalatedAttempts).toBe(1);
    expect(report.pendingAttempts).toBe(1);
    expect(report.escalationRate).toBeCloseTo(0.5);
  });

  it("preserves absent provider confidence for urgent escalation", () => {
    const parsed = markResponseSchema.parse({
      marked: [{ partId: "p1", awarded: 0, max: 1 }],
      feedback: "No mark.",
    });
    expect(parsed.confidence).toBeUndefined();
    expect(assessLowConfidenceMark({ markedBy: "ai", confidence: parsed.confidence })).toMatchObject({
      reason: "missing-confidence",
      priority: "urgent",
    });
  });

  it("publishes the durable queue on Progress", () => {
    const src = readFileSync(join(process.cwd(), "src/app/progress/page.tsx"), "utf8");
    expect(src).toContain("markEscalationReport");
    expect(src).toContain("Mark review queue");
    expect(src).toContain("pending");
  });
});
