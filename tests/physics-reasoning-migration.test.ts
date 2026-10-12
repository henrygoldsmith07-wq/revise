import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { physicsReasoningDepthQuestions } from "@/content/questions/physics-reasoning-depth";
import { validateStructuredReasoning } from "@/content/structured-physics";
import { physicsContentFingerprint } from "@/domain/physics-content-review";
import type { Question } from "@/domain/types";

const directory = "src/content/sources/physics-reasoning-depth/";
const manifest = JSON.parse(readFileSync(directory + "manifest.json", "utf8")) as { files: string[] };
const sources = manifest.files.map(file => JSON.parse(readFileSync(directory + file, "utf8")));
describe("structured flagship reasoning migration", () => {
  it("preserves the 540 exact IDs and original semantics/trust fingerprints", () => {
    const original = JSON.parse(readFileSync("tests/fixtures/physics-reasoning-depth-fingerprints.json", "utf8"));
    expect(physicsReasoningDepthQuestions).toHaveLength(540);
    // Authored "do not accept" rules are part of the reviewed content, so they
    // change a fingerprint. The only intended change is the rule itself: with
    // the rules stripped, the fingerprint is the original one.
    const withRules = physicsReasoningDepthQuestions.filter(question => question.parts.some(part => part.rejects?.length)).map(question => question.id);
    expect(withRules).toEqual(["cnt:question:physics-depth-fields-sp-01-inverse-square-fallacy-3"]);
    const stripped = (question: Question): Question => ({ ...question, parts: question.parts.map(({ rejects: _rejects, ...part }) => part) });
    expect(Object.fromEntries(physicsReasoningDepthQuestions.map(question => [question.id, physicsContentFingerprint(stripped(question))]))).toEqual(original);
    expect(physicsReasoningDepthQuestions.every(question => question.verification === "unverified")).toBe(true);
  });
  it("rejects bad mapping, bad capability, duplicate IDs and fabricated verification", () => {
    expect(() => validateStructuredReasoning([{...sources[0], point:999}])).toThrow();
    expect(() => validateStructuredReasoning([{...sources[0], capabilityId:"invented"}])).toThrow();
    expect(() => validateStructuredReasoning([sources[0],sources[0]])).toThrow(/Duplicate/);
    expect(() => validateStructuredReasoning([{...sources[0], verification:"verified"}])).toThrow();
    expect(validateStructuredReasoning(sources)).toHaveLength(48);
  });
  it("requires deterministic generated adapters", () => {
    expect(execFileSync("node",["scripts/generate-physics-reasoning.mjs","--check"],{encoding:"utf8"})).toContain("Validated deterministic");
  });
});
