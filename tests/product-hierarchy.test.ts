import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { traceTransition } from "@/domain/adaptive-trace";

const ROOT = join(__dirname, "..");

describe("product hierarchy", () => {
  it("keeps five destinations: Today, Learn, Practice, Progress and Library, with manual modes in a collapsed Tools menu", () => {
    const shell = readFileSync(join(ROOT, "src/components/AppShell.tsx"), "utf8");
    // Five direct destinations and one Tools menu on the phone bar.
    expect(shell).toContain("grid grid-cols-6");
    expect(shell).toContain('href: "/", label: "Today"');
    expect(shell).toContain('href: "/lesson", label: "Learn"');
    expect(shell).toContain('href: "/practice", label: "Practice"');
    expect(shell).toContain('href: "/readiness", label: "Progress"');
    expect(shell).toContain('href: "/library", label: "Library"');
    expect((shell.match(/primary: true/g) ?? [])).toHaveLength(5);
    const order = ["Today", "Learn", "Practice", "Progress", "Library"].map((label) => shell.indexOf(`label: "${label}"`));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(shell).toContain("Tools");
    expect(shell).toContain("const TOOLS_NAV");
    // On desktop the Tools group is a disclosure, closed unless a tool is the current page.
    expect(shell).toContain("open={toolsActive || undefined}");
    // Specialist and manual routes stay reachable (deep links unchanged) but are not primary.
    for (const label of ["Review", "Past papers", "Choose how to study", "Tutor", "Schedule", "Settings"]) {
      expect(shell).toContain(`label: "${label}"`);
      expect(shell).not.toMatch(new RegExp(`label: "${label}", Icon: [A-Za-z]+, primary: true`));
    }
    // A destination stays highlighted inside the routes it owns.
    expect(shell).toContain('match: ["/review", "/papers", "/diagnostic"]');
    expect(shell).toContain('match: ["/adaptive-session"]');
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
