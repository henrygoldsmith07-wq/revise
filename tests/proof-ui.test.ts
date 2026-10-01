import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("evidence and proof surfaces", () => {
  it("explains Today's session from its own evidence and shows one proof line", () => {
    const hero = read("src/components/AdaptiveSessionHero.tsx");
    expect(hero).toContain("explainSession(session, proof?.conversion)");
    expect(hero).toContain('aria-label="Evidence behind this session"');
    expect(hero).toContain("/readiness#proof");
    // Waiting for a delay is not worth Today's attention; a test that is due is.
    expect(hero).toContain("proof.proven || proof.declined || proof.illusory || proof.due");
    // A mapped action's own reason stays, but only where it says something the evidence lines do not.
    expect(hero).toContain("session.learningPolicy && session.reason");
    expect(read("src/app/page.tsx")).toContain("proof={proofLedger}");
  });

  it("puts proof of improvement first on Readiness, with an anchor Today can link to", () => {
    const page = read("src/app/readiness/page.tsx");
    expect(page.indexOf("<ProofPanel />")).toBeGreaterThan(page.indexOf("<ExamReadinessCard />"));
    expect(page.indexOf("<ProofPanel />")).toBeLessThan(page.indexOf("<MarksAtRiskPanel />"));
    expect(read("src/components/ProofPanel.tsx")).toContain('id="proof"');
  });

  it("never lets a session debrief claim a same-session gain is already tested", () => {
    const page = read("src/app/adaptive-session/page.tsx");
    expect(page).not.toContain("The gain is now tested");
    expect(page).toContain("proofLine(");
  });

  it("computes the proof ledger once and feeds both the planner and the screens", () => {
    const sessions = read("src/state/sessions.ts");
    expect(sessions.match(/buildProofLedger\(/g)).toHaveLength(1);
    expect(sessions).toContain("proofLedger,\n      topics,");
  });
});
