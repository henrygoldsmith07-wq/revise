import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// AGENTS.md: "src/domain stays pure. No IndexedDB, no network, no React."
// This was convention-only: lint had no boundary rule and the graph test could
// not see '@' imports. Pin the rule directly against the real source tree.

const ROOT = path.resolve(process.cwd(), "src/domain");

const FORBIDDEN_MODULE = [
  /^idb($|\/)/,
  /^react($|\/|-dom)/,
  /^next($|\/)/,
  /^@supabase\//,
  /^node:(fs|path|http|https|net|tls|child_process|worker_threads)($|\/)/,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.isFile() && entry.name.endsWith(".ts") ? [full] : [];
  });
}

/** Drop line and block comments so a mention in prose is not read as a call. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("src/domain purity", () => {
  const files = sourceFiles(ROOT);

  it("finds the domain sources to check", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("imports no storage, network, UI or filesystem module", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const specs = [...codeOnly(source).matchAll(/(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)["']([^"']+)["']/g)].map((m) => m[1]!);
      for (const spec of specs) {
        if (FORBIDDEN_MODULE.some((re) => re.test(spec))) {
          offenders.push(`${path.relative(process.cwd(), file)} -> ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("uses no browser storage or direct network global", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = codeOnly(readFileSync(file, "utf8"));
      if (/\b(indexedDB|localStorage|sessionStorage|XMLHttpRequest|WebSocket)\b|\bfetch\s*\(/.test(code)) {
        offenders.push(path.relative(process.cwd(), file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
