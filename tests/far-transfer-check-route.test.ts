import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getSubject } from "@/domain/curriculum";
import { buildExamReadiness } from "@/domain/exam-readiness";
import type { GradePrediction } from "@/domain/grades";

// A delayed far-transfer check is scheduled a week after a strong unaided
// answer, counted as "due" by exam readiness, and completed only by an
// unaided attempt on /practice?retest=<id>. Until this pass nothing linked
// there ("Take a transfer check" opened plain practice) and the page treated
// the id as a missing mistake, so no check could ever be completed.

const SUBJECT = getSubject("wjec-alevel-chemistry")!;

function prediction(): GradePrediction {
  return { subjectId: SUBJECT.id, percent: 74, grade: "A", bestCase: "A", worstCase: "C", confidence: 0.75, trend: 0, headroom: [] };
}

function readiness(transfer: Parameters<typeof buildExamReadiness>[0]["transfer"]) {
  return buildExamReadiness({
    subject: SUBJECT,
    prediction: prediction(),
    targetGrade: "A",
    examDays: 42,
    coverage: { average: 0.82, topics: 10, evidencedTopics: 9 },
    retention: { average: 0.86, cards: 80, reviews: 24 },
    timed: { accuracy: 0.84, attempts: 10, marks: 48 },
    pace: { ratio: 1, attempts: 8 },
    transfer,
  });
}

describe("transfer check action", () => {
  it("opens the earliest due check when one exists", () => {
    const row = readiness({ passRate: null, completed: 0, due: 1, nextDueRetestId: "far-transfer:a1" });
    expect(row.blockers[0]?.key).toBe("transfer");
    expect(row.nextAction).toEqual({ label: "Take a transfer check", action: "transfer", retestId: "far-transfer:a1" });
  });

  it("does not offer to take a check when none is due", () => {
    const row = readiness({ passRate: null, completed: 0, due: 0 });
    expect(row.blockers[0]?.key).toBe("transfer");
    expect(row.nextAction.retestId).toBeUndefined();
    expect(row.nextAction.label).toBe("Answer unaided to schedule a transfer check");
  });

  it("links the readiness card and passes the due id from the store", () => {
    const card = readFileSync("src/components/ExamReadinessCard.tsx", "utf8");
    expect(card).toContain("retestId ? `/practice?retest=${encodeURIComponent(retestId)}`");
    expect(card).toContain("actionHref(row.subjectId, action.action, action.retestId)");
    const outcomes = readFileSync("src/state/outcomes.ts", "utf8");
    expect(outcomes).toContain('nextDueRetestId: transfers.find((retest) => retest.status === "due")?.retestId ?? null');
  });
});

describe("practice page runs a far-transfer check", () => {
  const page = readFileSync("src/app/practice/page.tsx", "utf8");
  const runner = readFileSync("src/components/QuestionRunner.tsx", "utf8");

  it("renders the question instead of the missing-mistake panel", () => {
    expect(page).toContain(") : retestId && !farTransferMatch ? (");
    expect(page).toContain("{retestId && !farTransferMatch && (!retestMistake || !retestQuestion) ? null : current ? (");
    // The marked result stays on screen after the check completes.
    expect(page).toContain('const farTransferRetest = farTransferMatch?.status === "completed" ? undefined : farTransferMatch;');
  });

  it("offers no hints, and hides topic reminders wherever hints are off", () => {
    expect(page).toContain("const hintBudget = adaptiveHintBudget ?? (farTransferRetest ? 0 : stepModeHintBudget(stepMode));");
    // Timed steps have no hints either; the reminders used to show under them.
    expect(page).toContain("{current && hintBudget !== 0 ? (");
  });

  it("claims evidence only on a question that can carry it", () => {
    expect(runner).toContain("(Boolean(farTransfer) && learnerEvidenceTrusted(question))");
  });
});
