import { describe, expect, it } from "vitest";
import { resumeQuickDiagnostic, type QuickDiagnosticRun } from "@/domain/quick-diagnostic";
import type { Attempt, Question } from "@/domain/types";

const q = (id: string) => ({ id }) as Question;
const a = (id: string, questionId: string) => ({ id, questionId }) as Attempt;
const run = (over: Partial<QuickDiagnosticRun> = {}): QuickDiagnosticRun => ({
  version: 1,
  subjectId: "s",
  topicIds: ["t1", "t2", "t3"],
  practiceTier: true,
  minutes: 8,
  uncovered: [],
  items: ["q1", "q2", "q3"].map((questionId, i) => ({ questionId, topicId: `t${i + 1}`, dimension: "recall", marks: 2, seconds: 60 })),
  doneAttemptIds: ["a1", "a2"],
  ...over,
});
const bank = [q("q1"), q("q2"), q("q3")];

describe("resumeQuickDiagnostic", () => {
  it("resumes the same questions at the answered position", () => {
    const resumed = resumeQuickDiagnostic(run(), "s", bank, [a("a1", "q1"), a("a2", "q2")]);
    expect(resumed?.run.items.map((i) => i.questionId)).toEqual(["q1", "q2", "q3"]);
    expect(resumed?.done.map((d) => d.id)).toEqual(["a1", "a2"]);
  });

  it("starts afresh for another subject, a finished run, a missing question or an attempt that no longer matches", () => {
    expect(resumeQuickDiagnostic(run(), "other", bank, [a("a1", "q1"), a("a2", "q2")])).toBeNull();
    expect(resumeQuickDiagnostic(run({ doneAttemptIds: ["a1", "a2", "a3"] }), "s", bank, [a("a1", "q1"), a("a2", "q2"), a("a3", "q3")])).toBeNull();
    expect(resumeQuickDiagnostic(run(), "s", [q("q1"), q("q2")], [a("a1", "q1"), a("a2", "q2")])).toBeNull();
    expect(resumeQuickDiagnostic(run(), "s", bank, [a("a1", "q1")])).toBeNull();
    expect(resumeQuickDiagnostic(run(), "s", bank, [a("a1", "q1"), a("a2", "q3")])).toBeNull();
    expect(resumeQuickDiagnostic(undefined, "s", bank, [])).toBeNull();
  });
});
