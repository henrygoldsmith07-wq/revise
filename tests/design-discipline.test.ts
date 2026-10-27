import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Mechanical design checks: the things a reviewer cannot reliably eyeball
// across 150 components, and that each slipped in at least once.

const ROOT = process.cwd();

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return name.endsWith(".tsx") ? [path] : [];
  });
}

const sources = tsxFiles(join(ROOT, "src")).map((path) => ({ path: path.slice(ROOT.length + 1), text: readFileSync(path, "utf8") }));
const studio = readFileSync(join(ROOT, "src/app/le-studio.css"), "utf8");
const globals = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");

describe("design discipline", () => {
  it("uses only the stated corner-radius scale (no arbitrary rounded-[Npx])", () => {
    const offenders = sources.filter(({ text }) => /\brounded(?:-[trblse]{1,2})?-\[/.test(text)).map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("puts no emoji in the interface", () => {
    const emoji = /[\u{1F300}-\u{1FAFF}]/u;
    const offenders = sources.filter(({ text }) => emoji.test(text)).map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("keeps decorative gradients out of the app stylesheets", () => {
    expect(globals).not.toMatch(/(linear|radial|conic)-gradient\(/);
    expect(studio).not.toMatch(/(linear|radial|conic)-gradient\(/);
  });

  it("every colour utility in a component maps to a Le Studio token", () => {
    // bg-accentsoft was used in thirty places before --color-accentsoft
    // existed; Tailwind generates nothing for an unknown colour, so those
    // callouts silently rendered with no fill.
    const tokens = new Set([...studio.matchAll(/--color-([a-z0-9]+):/g)].map((m) => m[1]));
    for (const builtIn of ["white", "black", "transparent", "current", "inherit"]) tokens.add(builtIn);
    const families = /(?<![\w-])(?:[a-z0-9-]+:)*(?:bg|text|border|ring|divide|outline|fill|stroke)-([a-z][a-z0-9]*)(?:\/\d+)?(?![\w-[])/g;
    const notColours = new Set([
      "xs", "sm", "md", "lg", "xl", "base", "left", "right", "center", "justify", "start", "end", "none",
      "t", "b", "l", "r", "x", "y", "s", "e", "dashed", "dotted", "solid", "double", "collapse", "separate",
      "inset", "balance", "pretty", "wrap", "nowrap", "clip", "ellipsis", "top", "bottom", "fixed", "local",
      "scroll", "cover", "contain", "auto", "no", "repeat", "opacity", "offset", "hidden", "spacing", "only",
    ]);
    const unknown = new Set<string>();
    for (const { path, text } of sources) {
      for (const match of text.matchAll(families)) {
        const name = match[1];
        if (notColours.has(name) || tokens.has(name) || /^\d/.test(name)) continue;
        unknown.add(`${path}: ${match[0]}`);
      }
    }
    expect([...unknown]).toEqual([]);
  });
});
