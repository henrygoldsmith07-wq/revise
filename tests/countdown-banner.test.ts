import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("Countdown phase banner — Today wiring", () => {
  const page = () => src("src/app/page.tsx");

  it("sits at the top of every Today content path", () => {
    const source = page();
    expect(source).toContain('import { CountdownPhaseBanner } from "@/components/CountdownPhaseBanner";');
    const uses = source.split("<CountdownPhaseBanner />").length - 1;
    // Due-review path, next-best-task path and the empty state all lead with it.
    expect(uses).toBeGreaterThanOrEqual(3);
  });
});

describe("CountdownPhaseBanner", () => {
  const component = () => src("src/components/CountdownPhaseBanner.tsx");

  it("renders nothing when no subject is inside the 42-day window", () => {
    expect(component()).toContain("if (!rows.length) return null;");
  });

  it("reads the countdown phases and gates on the same 42-day boundary as the scheduler", () => {
    const source = component();
    expect(source).toContain('countdownGuidance');
    expect(source).toContain("COUNTDOWN_WINDOW_DAYS = 42");
    expect(source).toContain("days > COUNTDOWN_WINDOW_DAYS");
  });

  it("shows the phase label and strategy per subject and links to the full Schedule", () => {
    const source = component();
    expect(source).toContain('aria-label="Exam countdown"');
    expect(source).toContain("{row.label}");
    expect(source).toContain("{row.strategy}");
    expect(source).toContain('href="/schedule"');
    expect(source).toContain("See the full run-up on Schedule");
  });
});
