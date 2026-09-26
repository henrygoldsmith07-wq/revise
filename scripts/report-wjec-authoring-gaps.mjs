import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const BACKLOG_PATH = resolve("src/content/reviews/wjec-authoring-backlog.json");
const args = new Set(process.argv.slice(2));

const bundle = await build({
  stdin: {
    contents: [
      'export { seedQuestions as questions } from "./src/content";',
      'export { allTopics } from "./src/domain/curriculum";',
      'export { FLAGSHIP_SUBJECTS } from "./src/domain/flagship";',
      'export { flagshipTrustReadiness } from "./src/domain/flagship-trust";',
    ].join("\n"),
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const data = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"),
);

const topics = data.allTopics();
const subjects = {};
const summary = [];
for (const flagship of data.FLAGSHIP_SUBJECTS) {
  const report = data.flagshipTrustReadiness({
    subjectId: flagship.subjectId,
    topics,
    questions: data.questions,
    trustedQuestion: () => true,
    releaseQuestion: () => true,
  });
  const gaps = report.statements
    .filter((row) => !row.meetsCoreTrustBar)
    .map((row) => ({
      specPointId: row.specPointId,
      topicId: row.topicId,
      currentQuestionCount: row.trustedQuestionIds.length,
      independentQuestionDeficit: Math.max(0, 4 - row.trustedQuestionIds.length),
      missingCategories: row.missing.filter((value) => value !== "4-trusted-questions"),
    }))
    .sort((left, right) => left.specPointId.localeCompare(right.specPointId));
  subjects[flagship.subjectId] = gaps;
  summary.push({
    subjectId: flagship.subjectId,
    statementsTotal: report.statementsTotal,
    authoredCeilingCoreStatements: report.statementsMeetingCoreTrustBar,
    authoringGapStatements: gaps.length,
    statementSlotDeficit: report.statementReviewSlotDeficit,
  });
}

const expected = {
  formatVersion: 1,
  coreQuestionCount: 4,
  model: "part-level-depth-v1",
  subjects,
};

if (args.has("--write")) {
  await writeFile(BACKLOG_PATH, JSON.stringify(expected, null, 2) + "\n");
}

if (args.has("--check")) {
  let current;
  try {
    current = JSON.parse(await readFile(BACKLOG_PATH, "utf8"));
  } catch (error) {
    console.error("WJEC authoring backlog is missing or invalid:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
  if (JSON.stringify(current) !== JSON.stringify(expected)) {
    console.error("WJEC authoring backlog is stale. Run: npm run wjec:authoring:refresh");
    process.exit(1);
  }
}

if (args.has("--json")) {
  console.log(JSON.stringify({ summary, backlog: expected }, null, 2));
} else if (!args.has("--check") || !process.env.npm_config_silent) {
  console.log("WJEC authored-content ceiling");
  for (const row of summary) {
    console.log([
      row.subjectId,
      "core if every current question were approved " + row.authoredCeilingCoreStatements + "/" + row.statementsTotal,
      "gap statements " + row.authoringGapStatements,
      "statement slots missing " + row.statementSlotDeficit,
    ].join(" | "));
  }
  if (args.has("--check")) console.log("Authoring backlog matches the live part-level ceiling.");
}
