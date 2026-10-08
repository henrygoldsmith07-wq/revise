import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Socratic examiner panel", () => {
  const panel = read("src/components/SocraticExaminerPanel.tsx");
  const result = read("src/components/QuestionMarkedResult.tsx");

  it("appears below full marks on written answers, before the mark scheme detail", () => {
    expect(result).toContain('question.kind !== "mcq" && awarded < question.totalMarks');
    expect(result.indexOf("<SocraticExaminerPanel")).toBeLessThan(result.indexOf("result.marked.map"));
  });

  it("renders the authored guidance without waiting for any request", () => {
    // The static guidance comes from the pure domain and is rendered unconditionally.
    expect(panel).toContain("staticSocraticGuidance(focus)");
    expect(panel).toContain("guidance.statement");
    expect(panel).not.toMatch(/if \(thinking\)\s*return/);
  });

  it("never asks — and never shows a typing indicator — when offline or AI consent is off", () => {
    expect(panel).toContain("const canAsk = consent && online");
    expect(panel).toContain("if (opened.current || !canAsk) return;");
    expect(panel).toContain("aiConsentGrantedInSettings(settings)");
  });

  it("bounds the wait and keeps a model reply only if the domain guard accepts it", () => {
    expect(panel).toContain("timeoutMs: SOCRATIC_TIMEOUT_MS");
    expect(panel).toContain("checkSocraticReply(envelope.data, context.markScheme)");
    expect(read("src/ai/client.ts")).toContain("Promise.race([request, timeout])");
  });

  it("is an accessible conversation: polite live log, status typing indicator, labelled composer", () => {
    expect(panel).toContain('role="log"');
    expect(panel).toContain('aria-live="polite"');
    expect(panel).toContain('role="status"');
    expect(panel).toContain("typing-dot");
    expect(panel).toContain("htmlFor={composerId}");
    expect(panel).toContain("composerRef.current?.focus()");
  });

  it("uses calm, provisional language and no red or green", () => {
    expect(panel).toContain("provisional");
    expect(panel).not.toMatch(/text-danger|bg-danger|text-success|bg-success/);
  });
});

describe("Tutor chat accessibility", () => {
  const tutor = read("src/app/tutor/page.tsx");

  it("announces replies through a polite live log and a status typing indicator", () => {
    expect(tutor).toContain('role="log"');
    expect(tutor).toContain('aria-live="polite"');
    expect(tutor).toContain("aria-busy={pending}");
    expect(tutor).toContain("typing-dot");
  });

  it("keeps keyboard focus in the composer across turns", () => {
    expect(tutor).toContain("composerRef.current?.focus()");
    expect(tutor).not.toMatch(/id="tutor-composer"[\s\S]{0,600}disabled=\{pending\}/);
    expect(tutor).toContain("ref={endRef}");
  });
});
