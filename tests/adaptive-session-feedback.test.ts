import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The daily adaptive session recorded each answered question and replanned
// at once; the replan swapped the step panel for the next step in the same
// render, so the marked result (mark, missed points, model answer) was never
// visible in a returning student's main session. A marked step is now held
// on screen until the student continues; recording and replanning do not wait.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const page = read("src/app/adaptive-session/page.tsx");

describe("adaptive session keeps the marked result visible", () => {
  it("holds a marked question step when it is recorded, without delaying the record", () => {
    expect(page).toMatch(/const recordStep = \(record: AdaptiveStepRecord\) => \{\n\s+if \(!run\) return;\n\s+const marked = record\.maxMarks > 0 \? steps\.find\(\(candidate\) => candidate\.id === record\.stepId\) : undefined;\n\s+if \(marked\) setHeldStep\(marked\);\n\s+const next = \{ \.\.\.run, completed: \[\.\.\.run\.completed, record\] \};/);
  });

  it("keeps rendering the held step until the student continues", () => {
    expect(page).toContain("const displayStep = heldStep ?? activeStep;");
    expect(page).toContain("key={displayStep.id}");
    expect(page).toContain("step={displayStep}");
    expect(page).toContain("setHeldStep(null);");
  });

  it("does not jump to the completion screen while a marked result is on screen", () => {
    expect(page).toContain("if (result && result.steps.length === 0 && result.done && heldRef.current) {");
  });

  it("does not remount the question when the retest resolves its mistake", () => {
    expect(page).toContain("const [mountMistake] = useState(liveMistake);");
  });

  it("announces the mark and keeps Continue reachable on a phone", () => {
    expect(page).toContain('role="status" aria-live="polite"');
    expect(page).toContain("sticky bottom-20 lg:bottom-4");
    expect(page).toContain("Read the marking above, then continue when you are ready.");
  });
});
