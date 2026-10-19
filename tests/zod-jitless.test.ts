import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "@/lib/zod";

function walk(d: string): string[] {
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

describe("zod jitless", () => {
  it("is configured and schemas still parse", () => {
    expect(z.config().jitless).toBe(true);
    expect(z.object({ a: z.string() }).safeParse({ a: "x" }).success).toBe(true);
  });
  it("no source imports zod directly", () => {
    const bad = walk("src").filter(
      (p) => !p.endsWith("lib/zod.ts") && /from "zod"/.test(readFileSync(p, "utf8")),
    );
    expect(bad).toEqual([]);
  });
});
