import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("Schedule — nav entry", () => {
  const shell = () => readFileSync(join(process.cwd(), "src/components/AppShell.tsx"), "utf8");

  it("is a first-class destination in the nav", () => {
    const src = shell();
    expect(src).toContain('href: "/schedule"');
    expect(src).toContain('label: "Schedule"');
  });

  it("is desktop-rail like Library rather than a daily-loop bottom-bar item", () => {
    // The bottom bar is the daily loop; planning sits above it.
    const src = shell();
    const entry = src.slice(src.indexOf('href: "/schedule"'), src.indexOf('href: "/schedule"') + 120);
    expect(entry.includes("primary")).toBe(false);
  });
});

describe("Schedule — page wiring", () => {
  const page = () => readFileSync(join(process.cwd(), "src/app/schedule/page.tsx"), "utf8");

  it("renders the planner's derived plan, never its own scheduling logic", () => {
    const src = page();
    expect(src).toContain("store.regeneratePlan");
    expect(src).toContain("store.plannedSessions");
    expect(src).toContain("store.examDates");
    // Rebuild must be a user action or a one-time auto-build, never a loop.
    expect(src).toContain("autoBuilt.current");
  });

  it("shows the exam run-up and groups days under weeks", () => {
    const src = page();
    expect(src).toContain("Exam run-up");
    expect(src).toContain("Planned days");
    expect(src).toContain("Week of ");
  });

  it("deep-links every actionable block so finishing it ticks the plan", () => {
    const src = page();
    // Cards / recall / exam questions carry the planned-session id…
    expect(src).toContain("session=${session.id}");
    // …and each activity maps to the flow that does that work.
    expect(src).toContain('/lesson?subject=${session.subjectId}');
    expect(src).toContain('/practice?mode=recall');
    expect(src).toContain('"/review"');
  });

  it("is honest when there is nothing to schedule yet", () => {
    const src = page();
    expect(src).toContain("No schedule yet");
    expect(src).toContain("Set your weekly study hours in Settings first");
  });

  it("shows what the latest rebuild changed, from the store's changelog", () => {
    const src = page();
    expect(src).toContain("store.planChangelog");
    expect(src).toContain('aria-label="Last rebuild"');
    expect(src).toContain("Last rebuild");
  });
});
