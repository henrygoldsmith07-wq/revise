import { describe, expect, it } from "vitest";
import { retentionMasteryLabel, retentionMasteryReport } from "@/domain/retention-mastery";
import type { RecallGrade, ReviewLog } from "@/domain/types";

const TODAY = "2026-08-18";

function logs(count: number, grade: RecallGrade, date = "2026-08-15"): ReviewLog[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `review-${grade}-${date}-${index}`,
    userId: "local",
    cardId: `card-${index}`,
    topicId: "topic",
    grade,
    elapsedMs: 1_000,
    reviewedAt: `${date}T09:00:00.000Z`,
  }));
}

describe("retention mastery", () => {
  it("stays evidence-gated before twenty recent reviews", () => {
    const report = retentionMasteryReport({ reviewLogs: logs(6, "good"), today: TODAY });

    expect(report.measuredRetention).toBeNull();
    expect(report.evidenceReviews).toBe(6);
    expect(report.band).toBe("not-enough-evidence");
    expect(report.nextAction).toContain("14 more reviews");
    expect(retentionMasteryLabel(report.band)).toBe("Evidence still building");
  });

  it("calls recall secure when measured retention is on target", () => {
    const report = retentionMasteryReport({
      reviewLogs: [...logs(18, "good"), ...logs(2, "hard")],
      today: TODAY,
    });

    expect(report.measuredRetention).toBe(1);
    expect(report.band).toBe("secure");
    expect(report.gapToTarget).toBe(0.1);
    expect(report.trend).toBe("steady");
  });

  it("distinguishes a below-target but usable sample", () => {
    const report = retentionMasteryReport({
      reviewLogs: [...logs(17, "good"), ...logs(3, "again")],
      today: TODAY,
    });

    expect(report.measuredRetention).toBe(0.85);
    expect(report.band).toBe("building");
    expect(report.nextAction).toContain("clearing due cards daily");
  });
});
