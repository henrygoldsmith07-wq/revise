import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { quickDiagnosticPool, selectQuickDiagnostic } from "@/domain/quick-diagnostic";
import { trustViaWorkflow } from "../e2e/review-fixture";

// A quick check holds only a few questions. Each one should reach a new topic
// before it is spent ticking another dimension on a topic already sampled:
// with the real Maths bank and five reviewed topics, the old dimension-first
// order produced a three-question check over two topics, which cold start
// (rightly) refuses for a flagship.
describe("quick diagnostic topic spread", () => {
  it("covers three topics when reviewed supply spans them", () => {
    const subjectId = "wjec-alevel-maths";
    const questions = seedQuestions.filter((q) => q.subjectId === subjectId);
    const trusted = trustViaWorkflow(subjectId, questions, 5);
    const merged = questions.map((q) => trusted.find((t) => t.id === q.id) ?? q);
    const pool = quickDiagnosticPool(merged, [], subjectId);
    const topicIds = [...new Set(pool.flatMap((q) => q.topicIds))].sort();
    const selection = selectQuickDiagnostic({ questions: pool, topicIds });
    expect(selection.items.length).toBeGreaterThanOrEqual(3);
    expect(new Set(selection.items.map((i) => i.topicId)).size).toBeGreaterThanOrEqual(3);
  }, 60_000);
});
