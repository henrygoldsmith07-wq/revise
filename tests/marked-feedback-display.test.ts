import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commentRestatesMarkedPoints, condenseMarkedFeedback } from "@/domain/marked-feedback-display";
import { examinerSummary, markQuestion, rubricPartComment } from "@/domain/marking";
import { DEVICE_MARK_FOOTER, deviceRubricMark } from "@/lib/offline-mark";
import type { MarkedPart, Question } from "@/domain/types";

// A wrong answer marked on the device listed the same missed points about five
// times (part list, part comment, summary, evidence, remediation card) and ran
// to 2.8–3.5k px at 360px. The view lists them once; these helpers drop only
// the device marker's own generated restatements, never other text.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

const part = (over: Partial<MarkedPart> = {}): MarkedPart => ({
  partId: "a",
  awarded: 0,
  max: 2,
  creditedPoints: [],
  missedPoints: ["Bacteria, Archaea and Eukarya", "Genus"],
  comment: "",
  ...over,
});

const question: Question = {
  id: "q-test",
  subjectId: "wjec-alevel-biology",
  topicIds: [],
  kind: "short",
  difficulty: 1,
  stem: "Living organisms are classified into a hierarchy of taxa.",
  totalMarks: 2,
  source: "authored",
  parts: [{ id: "a", label: "", prompt: "Name the three domains, and name the taxon immediately below family.", marks: 2, markScheme: ["Bacteria, Archaea and Eukarya", "Genus"] }],
} as unknown as Question;

describe("commentRestatesMarkedPoints", () => {
  it("recognises the device marker's own restatement", () => {
    const zero = part();
    expect(commentRestatesMarkedPoints({ ...zero, comment: rubricPartComment(0, 2, zero.missedPoints) })).toBe(true);
    const partial = part({ awarded: 1, missedPoints: ["Genus"], creditedPoints: ["Bacteria, Archaea and Eukarya"] });
    expect(commentRestatesMarkedPoints({ ...partial, comment: rubricPartComment(1, 2, ["Genus"]) })).toBe(true);
  });

  it("keeps any other comment, including an AI marker's or an MCQ key", () => {
    expect(commentRestatesMarkedPoints(part({ comment: "You named two domains but not the third." }))).toBe(false);
    expect(commentRestatesMarkedPoints(part({ missedPoints: ["Correct option"], max: 1, comment: "Not this one — the answer is B." }))).toBe(false);
    expect(commentRestatesMarkedPoints(part({ comment: "" }))).toBe(false);
    expect(commentRestatesMarkedPoints(part({ missedPoints: [], comment: "Full marks — every mark-scheme point is there." }))).toBe(false);
  });

  it("matches what markQuestion really produces for a wrong answer", () => {
    const marked = markQuestion(question, { a: "I think it is because the cells get bigger" }).marked[0]!;
    expect(marked.missedPoints.length).toBeGreaterThan(0);
    expect(commentRestatesMarkedPoints(marked)).toBe(true);
  });
});

describe("condenseMarkedFeedback", () => {
  it("drops the score and the missed-point list but keeps the advice and the no-AI provenance", () => {
    const device = deviceRubricMark(question, { a: "I think it is because the cells get bigger" });
    const condensed = condenseMarkedFeedback(device.feedback, device.marked);
    expect(device.feedback).toContain("The scheme still wants:");
    expect(condensed).not.toContain("The scheme still wants:");
    expect(condensed).not.toMatch(/^0\/2\./);
    expect(condensed).toContain("This response does not yet address what the question is asking for.");
    expect(condensed).toContain("examiners award the statement, not the implication");
    expect(condensed.endsWith(DEVICE_MARK_FOOTER)).toBe(true);
  });

  it("leaves feedback it did not generate untouched", () => {
    const ai = "You described cell growth, but the question asks for the names of the domains.";
    expect(condenseMarkedFeedback(ai, [part()])).toBe(ai);
    // Full marks has no restatement to drop.
    const full = [part({ awarded: 2, missedPoints: [], creditedPoints: ["Bacteria, Archaea and Eukarya", "Genus"] })];
    const summary = examinerSummary(2, 2, full);
    expect(condenseMarkedFeedback(summary, full)).toBe(summary);
  });

  it("leaves the summary alone when the marks were changed after it was written", () => {
    const original = [part()];
    const feedback = examinerSummary(0, 2, original);
    const regraded = [part({ awarded: 1, missedPoints: ["Genus"], creditedPoints: ["Bacteria, Archaea and Eukarya"] })];
    expect(condenseMarkedFeedback(feedback, regraded)).toBe(feedback);
  });
});

describe("marked result inside a check", () => {
  const view = read("src/components/QuestionMarkedResult.tsx");
  const runner = read("src/components/QuestionRunner.tsx");

  it("lists the missed points once under one heading", () => {
    expect(view).toContain('{anyMissed ? "What you missed" : "What earned the marks"}');
    expect(view).toContain("commentRestatesMarkedPoints(marked)");
    expect(view).toContain("condenseMarkedFeedback(result.feedback, result.marked)");
    // Evidence is still there, folded away rather than open on every miss.
    expect(view).toContain("Evidence for each mark");
    expect(view).not.toContain("open={marked.missedPoints.length > 0}");
  });

  it("makes no micro-practice promise, guiding-question panel or fix list mid-check", () => {
    expect(view).toContain("{inDiagnostic ? null : (");
    expect(view).toContain("&& !inDiagnostic;");
    expect(view).toContain('question.kind !== "mcq" && actions.length && !inDiagnostic');
    expect(view).toContain("result.remediation.headline && !inDiagnostic");
    expect(view).toContain("anyMissed && !inDiagnostic");
    expect(view).toContain("awarded < question.totalMarks && !inDiagnostic");
  });

  it("offers Improve my answer in practice but not inside a check", () => {
    expect(runner).toContain('improvableAnswers={mode === "practice" && !farTransfer && !retestMistake && !inDiagnostic ? answers : undefined}');
  });

  it("hides the live verb check once the answer is marked", () => {
    expect(runner).toContain('{result ? null : <CommandWordCheck validation={validateCommandWord(question, part, answers[part.id] ?? "")} />}');
  });

  it("moves focus to the result heading only when submitting dropped it", () => {
    expect(view).toContain("<h2 ref={headingRef} tabIndex={-1}");
    expect(view).toContain("if (!active || active === document.body) headingRef.current?.focus();");
  });

  it("shows one objective pill per objective, not one per missed point", () => {
    expect(view).toContain("[...new Set(");
    expect(view).not.toContain(".flatMap((m) => m.missedPoints).slice(0, 3)");
  });
});
