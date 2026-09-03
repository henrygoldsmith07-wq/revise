// ---------------------------------------------------------------------------
// Build the domain worker bundle into public/ at prebuild time.
//
// Same pattern as the pdf worker: a generated artifact in public/, gitignored,
// produced by the scripts that already run before dev and build. esbuild
// inlines Comlink and the domain modules into one classic-script IIFE, so the
// worker needs no import maps and no runtime module resolution.
// ---------------------------------------------------------------------------

import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "domain-worker.js");

await build({
  entryPoints: [join(root, "src", "worker", "domain-worker-entry.ts")],
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: false,
  sourcemap: false,
  outfile: out,
  alias: { "@": join(root, "src") },
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});

mkdirSync(dirname(out), { recursive: true });
console.log("built domain-worker.js → public/");
