import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { physicsDepth50MechanicsQuestions } from "@/content/questions/physics-depth-50-mechanics";
import { validateStructuredPhysics } from "@/content/structured-physics";
import { physicsContentFingerprint } from "@/domain/physics-content-review";

const directory = "src/content/sources/physics-depth50-mechanics/";
const manifest = JSON.parse(readFileSync(directory + "manifest.json", "utf8")) as { files: string[] };
const sources = manifest.files.map((file) => JSON.parse(readFileSync(directory + file, "utf8")));
describe("structured WJEC Physics migration", () => {
  it("preserves all 92 exact ids and pre-migration trust fingerprints", () => {
    const baseline = JSON.parse(readFileSync("tests/fixtures/physics-depth50-mechanics-fingerprints.json", "utf8"));
    expect(physicsDepth50MechanicsQuestions).toHaveLength(92);
    expect(Object.fromEntries(physicsDepth50MechanicsQuestions.map((question) => [question.id, physicsContentFingerprint(question)]))).toEqual(baseline);
    expect(physicsDepth50MechanicsQuestions.every((question) => question.verification === "unverified")).toBe(true);
  });
  it("rejects malformed content, duplicate ids and unknown spec mappings", () => {
    expect(() => validateStructuredPhysics([{ ...sources[0], point: 999 }])).toThrow("unknown specification");
    expect(() => validateStructuredPhysics([sources[0], sources[0]])).toThrow("Duplicate question id");
    expect(() => validateStructuredPhysics([{ ...sources[0], parts: [{ ...sources[0].parts[0], marks: 999 }] }])).toThrow("Each mark");
    expect(() => validateStructuredPhysics([{ ...sources[0], verification: "verified" }])).toThrow();
    expect(validateStructuredPhysics(sources)).toHaveLength(7);
  });
  it("requires deterministic validated artifacts in CI", () => {
    expect(execFileSync("node", ["scripts/generate-structured-physics.mjs", "--check"], { encoding: "utf8" })).toContain("passed");
  });
});
