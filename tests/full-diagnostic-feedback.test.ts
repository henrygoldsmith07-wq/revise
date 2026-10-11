import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The full diagnostic used to unmount the marked result the moment marking
// finished and ask "How sure were you of that answer?" in its place, so the
// student never saw the mark, and any confidence given afterwards would have
// been a reaction to a mark they could not see. Confidence is now captured
// with the submit, before the reveal, and the marked result stays on screen
// until the student continues.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const page = read("src/app/diagnostic/page.tsx");
const runner = read("src/components/QuestionRunner.tsx");

describe("full diagnostic feedback and confidence capture", () => {
  it("no longer replaces the marked result with a post-hoc confidence question", () => {
    expect(page).not.toContain("How sure were you of that answer?");
    expect(page).not.toContain("onClick={() => confirm(");
  });

  it("captures confidence with the submit, before the mark is revealed", () => {
    expect(page).toContain("onConfidence={setConfidence}");
    expect(runner).toContain("Before you see the mark: how sure are you?");
    expect(runner).toMatch(/onConfidence\(false\);\n\s+void submit\(\);/);
    expect(runner).toMatch(/onConfidence\(true\);\n\s+void submit\(\);/);
    // Only while there is no result: the buttons disappear once marked.
    expect(runner).toContain("{!result && !retestMistake?.resolved && onConfidence ? (");
  });

  it("keeps the same question mounted while the marked attempt is held", () => {
    expect(page).toContain("const questionId = pending ? pending.questionId : probe?.item.id;");
    expect(page).toContain("key={question.id}");
    expect(page).toContain("question && (probe || pending)");
  });

  it("records the probe with the pre-reveal confidence only when the student continues", () => {
    expect(page).toMatch(/function advance\(\) \{\n\s+if \(!pending\) return;/);
    expect(page).toContain("probeFromAttempt(pending, item, confidence)");
    expect(page).toContain('onClick={advance}>Continue</Button>');
    expect(page).toContain('role="status" aria-live="polite"');
    expect(page).toContain("sticky bottom-20 lg:bottom-4");
  });

  it("leaves every other runner on the single submit button", () => {
    expect(runner).toContain('{marking ? "Marking…" : "Submit for marking"}');
  });
});
