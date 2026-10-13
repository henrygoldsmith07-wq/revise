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

  it("the bank is reached through the on-demand loader", async () => {
    const meta = await metafile();
    const dynamicImporters = Object.entries(meta.inputs)
      .filter(([, input]) => input.imports.some((imported) => imported.path === BANK && imported.kind === "dynamic-import"))
      .map(([file]) => file);
    expect(dynamicImporters).toContain("src/data/authored-questions.ts");
  }, 60_000);
});
