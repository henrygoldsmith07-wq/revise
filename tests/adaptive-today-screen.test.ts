import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("Today adaptive session", () => {
  it("renders one best-use hero backed by the store's unified plan", () => {
    const source = read("src/app/page.tsx");
    const hero = read("src/components/AdaptiveSessionHero.tsx");
    expect(source).toContain("adaptiveSession");
    expect(source).toContain("AdaptiveSessionHero");
    expect(hero).toContain("Best use of the next {session.totalMinutes} minutes");
    expect(hero).toContain("Start");
  });

  it("has a resumable sequence runner with active recall and delayed scheduling", () => {
    const source = read("src/app/adaptive-session/page.tsx");
    expect(source).toContain('activity: "adaptive"');
    expect(source).toContain("Before reading: explain");
    expect(source).toContain("Schedule for tomorrow");
    expect(source).toContain("buryCard");
    expect(source).toContain("Next step");
  });
});

