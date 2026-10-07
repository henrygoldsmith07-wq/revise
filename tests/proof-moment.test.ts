import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_PROVEN_MOMENTS, newlyProvenTopics, nextSeenProofStates, parseSeenProofStates } from "@/domain/proof-moment";

describe("proof moment", () => {
  it("celebrates a topic that moved from awaiting proof to proven", () => {
    expect(newlyProvenTopics({ t1: "awaiting-proof" }, [{ topicId: "t1", state: "proven" }])).toEqual(["t1"]);
  });

  it("does not celebrate a topic already seen as proven, or one not proven", () => {
    expect(
      newlyProvenTopics({ t1: "proven", t2: "awaiting-proof" }, [
        { topicId: "t1", state: "proven" },
        { topicId: "t2", state: "awaiting-proof" },
      ]),
    ).toEqual([]);
  });

  it("caps how many topics animate at once", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ topicId: `t${i}`, state: "proven" as const }));
    expect(newlyProvenTopics({}, rows)).toHaveLength(MAX_PROVEN_MOMENTS);
  });

  it("records every topic's current state for next time", () => {
    expect(nextSeenProofStates({ old: "proven" }, [{ topicId: "t1", state: "awaiting-proof" }])).toEqual({
      old: "proven",
      t1: "awaiting-proof",
    });
  });

  it("parses stored state defensively", () => {
    expect(parseSeenProofStates(null)).toEqual({});
    expect(parseSeenProofStates("not json")).toEqual({});
    expect(parseSeenProofStates("[1,2]")).toEqual({});
    expect(parseSeenProofStates(JSON.stringify({ a: "proven", b: "made-up", c: 3 }))).toEqual({ a: "proven" });
  });
});

describe("proof moment UI", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("animates Awaiting proof → Proven in CSS only, with no motion library", () => {
    const panel = read("src/components/ProofPanel.tsx");
    expect(panel).toContain("newlyProvenTopics(");
    expect(panel).toContain("proof-moment__from");
    expect(panel).toContain("proof-moment__to");
    expect(panel).toContain('aria-live="polite"');
    const pkg = JSON.parse(read("package.json")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect({ ...pkg.dependencies, ...pkg.devDependencies }).not.toHaveProperty("framer-motion");
    expect(panel).not.toMatch(/framer-motion|motion\/react/);
  });

  it("respects reduced motion from the OS and from the in-app setting", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain("@keyframes proof-to");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce) {\n  .proof-moment__from"));
    expect(reduced).toContain(".proof-moment__from { display: none; }");
    expect(css).toContain(":root.reduce-motion .proof-moment__from { display: none; }");
  });
});
