import { describe, expect, it } from "vitest";
import { execFileSync } from "child_process";

describe("documentation integrity", () => {
  it("docs describe routes, files, scripts and tests that exist", () => {
    const out = execFileSync("node", ["scripts/check-docs-integrity.mjs"], { encoding: "utf8" });
    expect(out).toMatch(/Docs integrity OK/);
  });

  it("does not document removed pages as live routes", async () => {
    const { readFileSync, existsSync } = await import("fs");
    const { join } = await import("path");
    for (const doc of ["docs/architecture.md", "docs/benchmark.md", "docs/revision-engine.md"]) {
      const text = readFileSync(join(process.cwd(), doc), "utf8");
      // Removed pages may be discussed as removed, but never as a live route.
      expect(text).not.toMatch(/route `\/benchmarks`/);
      expect(text).not.toMatch(/route `\/case-study`/);
      expect(text).not.toContain("src/app/benchmarks/page.tsx`, route");
    }
    expect(existsSync(join(process.cwd(), "scripts/check-docs-integrity.mjs"))).toBe(true);
  });
});
