import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { traceTransition } from "@/domain/adaptive-trace";

const ROOT = join(__dirname, "..");

describe("product hierarchy", () => {
  it("keeps one primary loop: Today first, Today and Session with manual tools, secondary subordinate", () => {
    const shell = readFileSync(join(ROOT, "src/components/AppShell.tsx"), "utf8");
    // Two direct primary actions and one Tools menu.
    expect(shell).toContain("grid-cols-3");
    expect(shell).toContain('label: "Today"');
    expect(shell).toContain('href: "/adaptive-session", label: "Session"');
    expect((shell.match(/primary: true/g) ?? [])).toHaveLength(2);
    expect(shell).toContain("Tools");
    const todayIndex = shell.indexOf('label: "Today"');
    const reviewIndex = shell.indexOf('label: "Review"');
    expect(todayIndex).toBeGreaterThanOrEqual(0);
    expect(todayIndex).toBeLessThan(reviewIndex);
    // Secondary systems exist but are not primary thumb-reach actions.
    for (const label of ["Readiness", "Schedule", "Library", "Settings"]) {
      expect(shell).toContain(`label: "${label}"`);
    }
    expect(shell).not.toMatch(/label: "Readiness", Icon: [A-Za-z]+, primary: true/);
  });

  it("renders the highest-value task before analytics on Today", () => {
    const page = readFileSync(join(ROOT, "src/app/page.tsx"), "utf8");
    const hero = page.indexOf("AdaptiveSessionHero");
    const details = page.indexOf("<details");
    expect(hero).toBeGreaterThanOrEqual(0);
    expect(details).toBeGreaterThan(hero);
    // Secondary data stays collapsed; it must not compete with Start.
    expect(page).toContain("Plan, pace and outlook");
  });

  it("keeps phone-width answer entry touch-friendly", () => {
    const runner = readFileSync(join(ROOT, "src/components/QuestionRunner.tsx"), "utf8");
    expect(runner).toContain("min-h-12");
  });
});

describe("adaptive trace", () => {
  it("explains action → evidence → state → decision through one policy", () => {
    const step = traceTransition({
      action: "Answered supported-practice independently",
      evidence: "2/3 marks, no hints",
      stateUpdate: "Capability score updated; mistake closed",
      candidate: { id: "t", kind: "transfer", subjectId: "s", minutes: 10, signals: { weakness: 0.6, evidenceConfidence: 0.7 } },
    });
    expect(step.action).toContain("Answered");
    expect(step.nextDecision.length).toBeGreaterThan(0);
    expect(step.evidenceLevel).toBe("developing");
    expect(Number.isFinite(step.policyScore)).toBe(true);
  });
});
