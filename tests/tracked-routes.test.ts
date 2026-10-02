import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A route directory whose name matches a .gitignore pattern (for example `coverage`)
// is silently dropped by `git add`, so the page exists locally and 404s after merge.
function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return pages(full);
    return name === "page.tsx" || name === "route.ts" ? [full] : [];
  });
}

describe("app routes survive git", () => {
  it("no page or route file is matched by .gitignore", () => {
    let inRepo = true;
    try { execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { stdio: "ignore" }); } catch { inRepo = false; }
    if (!inRepo) return;
    const files = pages("src/app");
    expect(files.length).toBeGreaterThan(10);
    // `git check-ignore` exits 1 when nothing matches, which is the passing case.
    let ignored = "";
    try {
      ignored = execFileSync("git", ["check-ignore", "--no-index", ...files], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch (error) {
      if ((error as { status?: number }).status !== 1) throw error;
    }
    expect(ignored).toBe("");
  });
});
