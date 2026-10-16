import fs from "node:fs";
import path from "node:path";
import { build, type Metafile } from "esbuild";
import { describe, expect, it } from "vitest";

// The authored question bank (`@/content`, ~3.6 MB of client JS) must not be
// statically reachable from the "/" route's layout or page. When it was, the
// landing and onboarding screens could not paint until a phone had downloaded,
// parsed and evaluated the whole bank. It is loaded on demand by
// src/data/authored-questions.ts (seventeenth pass). This walks the real
// import graph (esbuild metafile), so a re-export or a new import of
// `@/content` anywhere under the shell fails here with the chain that caused it.

const ROOT = path.resolve(__dirname, "..");
const ENTRIES = ["src/app/layout.tsx", "src/app/page.tsx"];
const BANK = "src/content/index.ts";

async function metafile(): Promise<Metafile> {
  const result = await build({
    entryPoints: ENTRIES.map((entry) => path.join(ROOT, entry)),
    absWorkingDir: ROOT,
    bundle: true,
    splitting: true,
    format: "esm",
    outdir: path.join(ROOT, ".shell-boundary-out"),
    write: false,
    metafile: true,
    jsx: "automatic",
    logLevel: "silent",
    platform: "browser",
    packages: "external",
    external: ["*.css"],
    alias: { "@": path.join(ROOT, "src") },
    loader: { ".json": "json", ".svg": "empty", ".png": "empty" },
    define: { "process.env.NODE_ENV": '"production"' },
  });
  return result.metafile;
}

/** Shortest chain of static `import` statements from an entry to `target`, or null. */
function staticChain(inputs: Metafile["inputs"], target: string): string[] | null {
  const previous = new Map<string, string | null>(ENTRIES.map((entry) => [entry, null]));
  const queue = [...ENTRIES];
  while (queue.length) {
    const current = queue.shift()!;
    for (const imported of inputs[current]?.imports ?? []) {
      if (imported.kind !== "import-statement" || imported.external || previous.has(imported.path)) continue;
      previous.set(imported.path, current);
      queue.push(imported.path);
    }
  }
  if (!previous.has(target)) return null;
  const chain: string[] = [];
  for (let at: string | null | undefined = target; at; at = previous.get(at)) chain.unshift(at);
  return chain;
}

describe("app shell / content bank boundary", () => {
  it("the / route never statically imports the authored question bank", async () => {
    const meta = await metafile();
    expect(meta.inputs[BANK], "the bank should still be bundled (as a lazy chunk)").toBeDefined();
    expect(staticChain(meta.inputs, BANK)).toBeNull();
  }, 60_000);

  it("nothing the / route can load, statically or on demand, imports the bank except the loader", async () => {
    // Nineteenth pass: the loader builds the bank in a worker. Any other module the
    // route can reach (a lazily loaded Today panel included) that imports `@/content`
    // would build it again on the main thread, which is the cost the worker removes.
    // Misconceptions and seed cards have their own modules for this reason.
    const meta = await metafile();
    const reached = new Map<string, string | null>(ENTRIES.map((entry) => [entry, null]));
    const queue = [...ENTRIES];
    while (queue.length) {
      const current = queue.shift()!;
      if (current === BANK) continue;
      for (const imported of meta.inputs[current]?.imports ?? []) {
        if (imported.external || reached.has(imported.path)) continue;
        reached.set(imported.path, current);
        queue.push(imported.path);
      }
    }
    const importers = Object.entries(meta.inputs)
      .filter(([file, input]) => reached.has(file) && input.imports.some((imported) => imported.path === BANK))
      .map(([file]) => file);
    const chains = importers.map((file) => {
      const chain: string[] = [];
      for (let at: string | null | undefined = file; at; at = reached.get(at)) chain.unshift(at);
      return chain.join(" -> ");
    });
    expect(importers, chains.join("\n")).toEqual(["src/data/authored-questions.ts"]);
  }, 60_000);

  it("the bank is reached through the on-demand loader", async () => {
    const meta = await metafile();
    const dynamicImporters = Object.entries(meta.inputs)
      .filter(([, input]) => input.imports.some((imported) => imported.path === BANK && imported.kind === "dynamic-import"))
      .map(([file]) => file);
    expect(dynamicImporters).toContain("src/data/authored-questions.ts");
  }, 60_000);

  it("every student route reaches the bank only through the loader", async () => {
    // Nineteenth pass: the loader's copy is built in a worker and is not shared
    // with a module that imports `@/content` itself, so such a module costs the
    // main thread a second build (~1 s on a phone) when it loads. The AI client
    // did this on every marked answer until this pass. Allowed: the server-only
    // reviewer data layer, and the trusted-coverage maintainer view (it needs the
    // release-set predicate, not the questions).
    const pages = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? entry.name === "api"
            ? []
            : pages(path.join(dir, entry.name))
          : entry.name === "page.tsx"
            ? [path.relative(ROOT, path.join(dir, entry.name)).split(path.sep).join("/")]
            : [],
      );
    const entries = ["src/app/layout.tsx", ...pages(path.join(ROOT, "src/app"))];
    const result = await build({
      entryPoints: entries.map((entry) => path.join(ROOT, entry)),
      absWorkingDir: ROOT,
      bundle: true,
      splitting: true,
      format: "esm",
      outdir: path.join(ROOT, ".shell-boundary-out"),
      write: false,
      metafile: true,
      jsx: "automatic",
      logLevel: "silent",
      platform: "browser",
      packages: "external",
      external: ["*.css", "server-only"],
      alias: { "@": path.join(ROOT, "src") },
      loader: { ".json": "json", ".svg": "empty", ".png": "empty" },
      define: { "process.env.NODE_ENV": '"production"' },
    });
    const allowed = new Set(["src/data/authored-questions.ts", "src/lib/reviewer/server.ts", "src/app/readiness/trusted-coverage/page.tsx"]);
    const inputs = result.metafile.inputs;
    const offenders = Object.entries(inputs)
      .filter(([file, input]) => !allowed.has(file) && input.imports.some((imported) => imported.path === BANK))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
    expect(entries.length).toBeGreaterThan(15);
  }, 60_000);
});
