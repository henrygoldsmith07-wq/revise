import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const aliases = {
  maths: "wjec-alevel-maths",
  biology: "wjec-alevel-biology",
  chemistry: "wjec-alevel-chemistry",
  physics: "wjec-alevel-physics",
};
const argv = process.argv.slice(2);
const subjectArg = argv.find((arg) => !arg.startsWith("--"));
if (!subjectArg || subjectArg === "help") {
  console.log("Usage: npm run wjec:authoring:plan -- <maths|biology|chemistry|physics|subject-id> [--limit=12] [--json]");
  process.exit(subjectArg ? 0 : 1);
}
const subjectId = aliases[subjectArg] ?? subjectArg;
const limitArg = argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : 12;
if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
  console.error("--limit must be an integer from 1 to 50");
  process.exit(1);
}

const backlog = JSON.parse(await readFile(resolve("src/content/reviews/wjec-authoring-backlog.json"), "utf8"));
if (backlog.formatVersion !== 1 || backlog.model !== "part-level-depth-v2-approvable" || !Array.isArray(backlog.subjects?.[subjectId])) {
  console.error(`Unknown subject or incompatible authoring backlog: ${subjectId}`);
  process.exit(1);
}

const bundle = await build({
  stdin: {
    contents: [
      'export { buildWjecAuthoringPlan } from "./src/domain/wjec-authoring-plan";',
      'export { allTopics } from "./src/domain/curriculum";',
    ].join("\n"),
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const data = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const topics = data.allTopics();
const topicById = new Map(topics.map((topic) => [topic.id, topic]));
const specLabel = new Map(topics.flatMap((topic) => (topic.specPoints ?? []).map((point) => [point.id, point.text])));
const plan = data.buildWjecAuthoringPlan(backlog.subjects[subjectId], limit).map((brief) => ({
  ...brief,
  topicLabel: topicById.get(brief.topicId)?.title ?? brief.topicId,
  targets: brief.targetSpecPointIds.map((id) => ({ id, label: specLabel.get(id) ?? id })),
}));
const result = {
  subjectId,
  backlogModel: backlog.model,
  generatedFromCurrentBacklog: true,
  requestedLimit: limit,
  briefs: plan,
  note: "Planning output only. Every authored question still requires normal validation and qualified human review before it can become trusted assessment evidence.",
};

if (argv.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`WJEC authoring plan | ${subjectId} | ${plan.length} brief(s)`);
  for (const brief of plan) {
    console.log(`\n${brief.sequence}. ${brief.topicLabel} | demand ${brief.requiredDemand} | new independent family`);
    for (const target of brief.targets) console.log(`   - ${target.id}: ${target.label}`);
    console.log(`   Why: ${brief.rationale || "independent authored coverage"}`);
  }
  console.log("\nPlanning only: authored questions remain untrusted until qualified human review.");
}
