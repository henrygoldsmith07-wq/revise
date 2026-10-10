import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// When the AI marker fails, the attempt is marked against the mark scheme on
// the device and (with consent) queued for an AI re-mark that later upgrades
// it in place. The student used to see only "From the spec content on this
// device", with no hint that the AI failed or that the mark may change. The
// notice must appear only when the re-mark was really queued.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("AI re-mark notice", () => {
  it("enqueueDeadMark reports whether it actually queued the re-mark", () => {
    const dlq = read("src/ai/mark-dlq.ts");
    expect(dlq).toMatch(/reason: string;\n\}\): Promise<boolean>/);
    expect(dlq).toMatch(/if \(!\(await localAiConsentGranted\(\)\)\) return false;/);
    expect(dlq).toMatch(/await db\.put\("aiDlq", item\);\n\s*return true;/);
  });

  it("the runner derives the notice from the queue result, never from the fallback alone", () => {
    const runner = read("src/state/question-execution.ts");
    expect(runner).toMatch(/const aiRemarkQueued = markTier === "fallback" && retryable\s*\?\s*await enqueueDeadMark\(/);
    expect(runner).toContain("aiRemarkQueued,");
    // A successful re-grade clears the notice.
    expect(runner).toContain("aiRemarkQueued: false,");
  });

  it("the marked result tells the student what happened and that they can carry on", () => {
    const view = read("src/components/QuestionMarkedResult.tsx");
    expect(view).toContain('result.source === "fallback" && result.aiRemarkQueued');
    expect(view).toContain("AI marking did not respond");
    expect(view).toContain("update this mark if it changes");
  });
});
