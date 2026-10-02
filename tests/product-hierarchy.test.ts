import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { traceTransition } from "@/domain/adaptive-trace";

const ROOT = join(__dirname, "..");

describe("product hierarchy", () => {
  it("keeps three destinations: Today first, then Subjects and Progress, with manual tools subordinate", () => {
    const shell = readFileSync(join(ROOT, "src/components/AppShell.tsx"), "utf8");
    // Three direct destinations and one Tools menu.
    expect(shell).toContain("grid-cols-4");
    expect(shell).toContain('label: "Today"');
    expect(shell).toContain('href: "/library", label: "Subjects"');
    expect(shell).toContain('href: "/readiness", label: "Progress"');
    expect((shell.match(/primary: true/g) ?? [])).toHaveLength(3);
    // Session stays reachable but is no longer a top-level destination.
    expect(shell).not.toMatch(/label: "Session", Icon: [A-Za-z]+, primary: true/);
    expect(shell).toContain("Tools");
    const todayIndex = shell.indexOf('label: "Today"');
    const reviewIndex = shell.indexOf('label: "Review"');
    expect(todayIndex).toBeGreaterThanOrEqual(0);
    expect(todayIndex).toBeLessThan(reviewIndex);
    // Secondary systems exist but are not primary thumb-reach actions.
    for (const label of ["Session", "Review", "Study", "Lessons", "Practice", "Past papers", "Schedule", "Settings"]) {
      expect(shell).toContain(`label: "${label}"`);
    }
    for (const label of ["Review", "Practice", "Schedule", "Settings"]) {
      expect(shell).not.toMatch(new RegExp(`label: "${label}", Icon: [A-Za-z]+, primary: true`));
    }
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
