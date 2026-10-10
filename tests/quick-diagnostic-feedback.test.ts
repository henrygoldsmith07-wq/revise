import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A new student's first marked questions are the quick diagnostic. Moving to
// the next probe the instant marking finished unmounted the marked result, so
// the student never saw their mark, the points they missed or the model
// answer (README promises "lost marks appear immediately"). The attempt is now
// held on screen until the student chooses to continue.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const quick = read("src/components/QuickDiagnostic.tsx");
const runner = read("src/components/QuestionRunner.tsx");

describe("quick diagnostic feedback", () => {
  it("does not advance to the next probe when marking finishes", () => {
    expect(quick).not.toContain("onFinished={(attempt) => setDone((prev) => [...prev, attempt])}");
    expect(quick).toContain("onFinished={(attempt) => setReviewing(attempt)}");
  });

  it("advances only from an explicit control, and only then records the attempt as done", () => {
    expect(quick).toMatch(/const advance = \(\) => \{\n\s+if \(!reviewing\) return;\n\s+setDone\(\(prev\) => \[\.\.\.prev, reviewing\]\);\n\s+setReviewing\(null\);/);
    expect(quick).toContain('onClick={advance}');
    expect(quick).toContain('"See what I found" : "Next question"');
  });

  it("announces the mark to assistive technology and keeps the control reachable on a phone", () => {
    expect(quick).toContain('role="status" aria-live="polite"');
    expect(quick).toContain("sticky bottom-20 lg:bottom-4");
    expect(quick).toContain("min-h-11");
  });

  it("keeps showing the marked result while the runner stays mounted", () => {
    // The runner renders MarkedResult itself once it has a result; holding the
    // same question (same key) on screen is what keeps the feedback visible.
    expect(runner).toContain("<MarkedResult");
    expect(quick).toContain("<QuestionRunner key={question.id} question={question} hintBudget={0}");
  });
});
