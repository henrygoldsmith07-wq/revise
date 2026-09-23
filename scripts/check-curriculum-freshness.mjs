#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "src", "domain", "spec.ts"), "utf8");
const staleDays = Number(process.env.CURRICULUM_STALE_DAYS ?? 365);
const today = process.env.CURRICULUM_TODAY ?? new Date().toISOString().slice(0, 10);
const entries = [];
const pattern = /subjectId:\s*"([^"]+)"[\s\S]{0,900}?lastChecked:\s*"(\d{4}-\d{2}-\d{2})"[\s\S]{0,200}?url:\s*"([^"]+)"/g;
for (const match of source.matchAll(pattern)) {
  const [, subjectId, lastChecked, url] = match;
  const ageDays = Math.round((new Date(today).getTime() - new Date(lastChecked).getTime()) / 86_400_000);
  entries.push({ subjectId, lastChecked, ageDays, url, stale: ageDays > staleDays });
}

const report = {
  app: "revise",
  generatedAt: new Date().toISOString(),
  today,
  staleDays,
  total: entries.length,
  stale: entries.filter((entry) => entry.stale),
  entries,
};
const output = process.env.CURRICULUM_FRESHNESS_OUTPUT ?? path.join(root, "artifacts", "curriculum-freshness.json");
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Curriculum freshness: ${report.total} specs checked, ${report.stale.length} stale (>${staleDays}d).`);
if (process.argv.includes("--fail-on-stale") && report.stale.length) {
  for (const entry of report.stale) console.error(`STALE ${entry.subjectId}: ${entry.lastChecked} (${entry.ageDays}d)`);
  process.exit(1);
}

