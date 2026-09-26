// generate-content.mjs — structured content source → validated typed runtime.
//
// Usage:
//   node scripts/generate-content.mjs capacitors          # write the artefact
//   node scripts/generate-content.mjs capacitors --check  # fail on drift (CI)
//
// The JSON source holds educational data only. The demand → kind/difficulty/AO
// mapping lives here, once, and is pinned by tests/content-slice-migration.
// Generated files carry a header and must not be edited by hand.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEMANDS = new Set(["recall", "explanation", "application", "misconception", "calculation", "transfer", "synoptic"]);
const SPEC_POINT = /^[a-z0-9-]+\.[a-z0-9-]+\.[a-z0-9-]+$/;

function fail(message) {
  console.error(`generate-content: ${message}`);
  process.exit(1);
}

function demandKind(demand) {
  return demand === "calculation" ? "calculation" : "short";
}

function demandDifficulty(demand) {
  if (demand === "recall") return 1;
  if (demand === "transfer" || demand === "synoptic") return 4;
  return 3;
}

function demandAos(demand) {
  if (demand === "recall") return ["AO1"];
  if (demand === "transfer" || demand === "synoptic") return ["AO2", "AO3"];
  return ["AO2"];
}

function ts(value) {
  return JSON.stringify(value);
}

function validateItem(group, item, index) {
  const where = `${group.id}[${index}] slug=${item.slug ?? "?"}`;
  for (const field of ["slug", "demand", "family", "context", "reasoning", "prompt", "answer"]) {
    if (typeof item[field] !== "string" || !item[field].trim()) fail(`${where}: ${field} must be a non-empty string`);
  }
  if (!DEMANDS.has(item.demand)) fail(`${where}: unknown demand ${item.demand}`);
  if (!Array.isArray(item.scheme) || item.scheme.length === 0 || item.scheme.some((s) => typeof s !== "string" || !s.trim())) {
    fail(`${where}: scheme must be a non-empty string array`);
  }
  if (!SPEC_POINT.test(group.specPointId)) fail(`${group.id}: bad specPointId ${group.specPointId}`);
  if (!/^[a-z0-9-]+$/.test(item.slug)) fail(`${where}: slug must be kebab-case`);
}

function buildSpec(group, item) {
  const familyId = group.familyPrefix ? `${group.familyPrefix}:${item.family}` : item.family;
  const contextId = `${group.contextPrefix}:${item.context}`;
  // Part-level learning carries no expectedMinutes; the question-level copy
  // does. This mirrors the hand-written helpers exactly.
  const learning = {
    familyId,
    contextId,
    demand: item.demand,
    reasoningMoves: [item.reasoning],
  };
  const questionLearning = { ...learning, expectedMinutes: item.scheme.length * 1.25 };
  return {
    slug: `${group.idPrefix}-${item.slug}`,
    subjectId: group.subjectId,
    topics: [group.topic],
    kind: demandKind(item.demand),
    stem: item.prompt,
    source: group.source,
    verification: group.verification,
    reviewer: null,
    lastChecked: null,
    difficulty: demandDifficulty(item.demand),
    learning: questionLearning,
    parts: [{
      prompt: item.prompt,
      marks: item.scheme.length,
      scheme: item.scheme,
      answer: item.answer,
      specPointIds: [group.specPointId],
      capabilityIds: [group.capabilityId],
      aos: demandAos(item.demand),
      learning,
    }],
  };
}

function emitQuestionCall(spec) {
  const part = spec.parts[0];
  return `  defineQuestion({
    slug: ${ts(spec.slug)},
    subjectId: ${ts(spec.subjectId)},
    topics: ${ts(spec.topics)},
    kind: ${ts(spec.kind)},
    stem: ${ts(spec.stem)},
    source: ${ts(spec.source)},
    verification: ${ts(spec.verification)},
    reviewer: null,
    lastChecked: null,
    difficulty: ${spec.difficulty},
    learning: ${ts(spec.learning)},
    parts: [{
      prompt: ${ts(part.prompt)},
      marks: ${part.marks},
      scheme: ${ts(part.scheme)},
      answer: ${ts(part.answer)},
      specPointIds: ${ts(part.specPointIds)},
      capabilityIds: ${ts(part.capabilityIds)},
      aos: ${ts(part.aos)},
      learning: ${ts(part.learning)},
    }],
  })`;
}

const EXPORT_NAMES = { energy: "physicsCapacitorEnergyQuestions", rc: "physicsCapacitorRcQuestions" };

function generate(slice) {
  if (slice !== "capacitors") fail(`unknown slice ${slice}`);
  const source = JSON.parse(readFileSync(join(ROOT, "src/content/sources/capacitors.json"), "utf8"));
  const chunks = [];
  chunks.push(`// GENERATED from src/content/sources/capacitors.json — do not edit by hand.`);
  chunks.push(`// Regenerate: node scripts/generate-content.mjs capacitors`);
  chunks.push(`import { defineQuestion } from "./authoring";`);
  chunks.push(`import type { Question } from "@/domain/types";`);
  chunks.push(``);
  for (const group of source.groups) {
    for (const [index, item] of group.items.entries()) validateItem(group, item, index);
    const calls = group.items.map((item) => emitQuestionCall(buildSpec(group, item))).join(",\n");
    chunks.push(`export const ${EXPORT_NAMES[group.id]}: Question[] = [`);
    chunks.push(calls);
    chunks.push(`];`);
    chunks.push(``);
  }
  return chunks.join("\n");
}

const [slice, flag] = process.argv.slice(2);
if (!slice) fail("usage: node scripts/generate-content.mjs <slice> [--check]");
const outPath = join(ROOT, "src/content/questions/physics-capacitors.generated.ts");
const text = generate(slice) + "\n";
if (flag === "--check") {
  const current = readFileSync(outPath, "utf8").replace(/\r\n/g, "\n");
  if (current !== text) fail(`${outPath} is stale — run: node scripts/generate-content.mjs ${slice}`);
  console.log(`generate-content: ${slice} in sync (${text.length} chars).`);
} else if (!flag) {
  writeFileSync(outPath, text);
  console.log(`generate-content: wrote ${outPath} (${text.length} chars).`);
} else {
  fail(`unknown flag ${flag}`);
}
