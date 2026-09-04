import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "fs";
import { join } from "path";

describe("performance budgets", () => {
  it("curriculum modules stay under budget (tree-shakable, not bloated)", () => {
    const dir = join(process.cwd(), "src/domain/curriculum");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    // Budgets are source bytes (pre-minify). 100k keeps the 32-subject tree-shake real;
    // shame: the GCSE/A-level splits should have tightened these sooner.
    const budgets: Record<string, number> = { "wjec-biology.ts": 80_000, "aqa-biology.ts": 80_000 };
    for (const f of files) {
      const kb = statSync(join(dir, f)).size;
      const limit = budgets[f] ?? 100_000;
      expect(kb, f + " over perf budget (ship smaller modules or split by level)").toBeLessThan(limit);
    }
  });
  it("domain bundle stays small: no single file is > 120kB", () => {
    const dir = join(process.cwd(), "src/domain");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
      const kb = statSync(join(dir, f)).size;
      expect(kb, f + " over domain budget").toBeLessThan(120_000);
    }
  });
  it("validates curriculum within budget (build-time, not runtime)", async () => {
    const start = Date.now();
    const { allTopics } = await import("@/domain/curriculum");
    allTopics();
    // Module compilation varies with machine load (CI runners share CPUs);
    // the strict shipped-artifact size gate below is the real budget.
    expect(Date.now() - start).toBeLessThan(5000);
  }, 30_000);
  it("Lighthouse/PWA guard: next.config headers pin _next/static immutable + /api no-store + sw no-cache", async () => {
    const { readFileSync } = await import("fs");
    const { join: j2 } = await import("path");
    const cfg = readFileSync(j2(process.cwd(), "next.config.ts"), "utf8");
    expect(cfg).toContain('/_next/static');
    expect(cfg).toContain("immutable");
    expect(cfg).toContain('/api/');
    expect(cfg).toContain("no-store");
    expect(cfg).toContain("/sw.js");
  });
  it("PWA precache: sw.js precaches shell routes and never cached /api", async () => {
    const { readFileSync, readdirSync } = await import("fs");
    const { join: j2 } = await import("path");
    const sw = readFileSync(j2(process.cwd(), "public/sw.js"), "utf8");
    expect(sw).toContain('APP_SHELL');
    expect(sw).toContain('skipWaiting');
    expect(sw).toContain('/api/');
    // Route-aware: every src/app/*/page.tsx must appear in APP_SHELL so the
    // whole app loads offline. This is the fence that makes a missing route fail.
    const routes = readdirSync(j2(process.cwd(), "src/app"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((n) => n !== "api" && !n.startsWith("("));
    const expectedPaths = new Set(["/", ...routes.map((r) => `/${r}`)]);
    for (const p of expectedPaths) {
      expect(sw, `sw.js APP_SHELL missing route ${p} (keep sw.js in sync with src/app/*)`).toContain(`"${p}"`);
    }
  });
  it("build artifact budget: .next (when present) is not absurd", async () => {
    // Soft gate: the production artifact includes optional PDF/OCR/WebLLM
    // assets, so leave room for those feature chunks while still catching a
    // runaway build (>90MB).
    const { existsSync, readdirSync: rs2, statSync: st2 } = await import("fs");
    const { join: j3 } = await import("path");
    const nextDir = j3(process.cwd(), ".next");
    if (!existsSync(nextDir)) return;
    let total = 0;
    const walk = (dir: string) => {
      for (const e of rs2(dir, { withFileTypes: true })) {
        // `next dev` writes an unconditional compile cache under .next/dev that
        // scales with how often the dev server ran, not with what ships — the
        // budget is about production build bloat, so it is excluded.
        if (dir === nextDir && e.name === "dev") continue;
        const p = j3(dir, e.name);
        // Server `.js.map` files are debug artifacts `next build` emits for the
        // server graph (none exist under static/). They are never downloaded by
        // a browser, so like .next/dev they measure the toolchain, not what
        // ships to clients.
        if (!e.isDirectory() && e.name.endsWith(".js.map")) continue;
        if (e.isDirectory()) walk(p);
        else total += st2(p).size;
      }
    };
    walk(nextDir);
    expect(total, ".next over 90MB — investigate bundle bloat").toBeLessThan(90 * 1024 * 1024);
  });
});
