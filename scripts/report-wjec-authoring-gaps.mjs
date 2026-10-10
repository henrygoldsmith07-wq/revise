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
      'export { approvableByReview, blockingGates, gateContextFromTopics, questionGateIssues } from "./src/domain/review-gates";',
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
const gate = data.gateContextFromTopics(topics);
const subjects = {};
const summary = [];
// The ceiling is "core statements if every current question were approved".
// A question failing a blocking review gate cannot be approved until an
// author fixes it, so it never counts towards the ceiling. Before 2026-10-10
// every question counted, and Physics showed 108/108 statements resting on
// transfer slots filled only by questions labelled "transfer" with no
// baseline link — approvals the reviewer portal refuses.
const gateBlocked = {};
for (const flagship of data.FLAGSHIP_SUBJECTS) {
  const blockedByCode = {};
  for (const question of data.questions) {
    if (question.subjectId !== flagship.subjectId) continue;
    for (const code of new Set(data.blockingGates(data.questionGateIssues(question, gate)).map((issue) => issue.code))) {
      blockedByCode[code] = (blockedByCode[code] ?? 0) + 1;
    }
  }
  gateBlocked[flagship.subjectId] = Object.fromEntries(Object.entries(blockedByCode).sort(([a], [b]) => a.localeCompare(b)));
  const report = data.flagshipTrustReadiness({
    subjectId: flagship.subjectId,
    topics,
    questions: data.questions,
    trustedQuestion: (question) => data.approvableByReview(question, gate),
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
  model: "part-level-depth-v2-approvable",
  /** Questions per subject failing each blocking review gate; they are excluded from the ceiling. */
  gateBlocked,
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
    // Name the most likely author mistake plainly: new content that can never
    // be approved as written (for example "transfer" with no baseline link).
    for (const [subjectId, codes] of Object.entries(gateBlocked)) {
      for (const [code, count] of Object.entries(codes)) {
        const before = current?.gateBlocked?.[subjectId]?.[code] ?? 0;
        if (count > before) {
          console.error(`${subjectId}: ${count - before} more question(s) now fail the blocking review gate "${code}" (${before} -> ${count}). ` +
            "They can never be approved as written; fix them (e.g. add a transferLink to a real baseline, or label the part by its true demand) rather than refreshing.");
        }
      }
    }
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
      "core if every approvable question were approved " + row.authoredCeilingCoreStatements + "/" + row.statementsTotal,
      "gate-blocked " + Object.entries(gateBlocked[row.subjectId] ?? {}).map(([code, count]) => code + " " + count).join(", "),
      "gap statements " + row.authoringGapStatements,
      "statement slots missing " + row.statementSlotDeficit,
    ].join(" | "));
  }
  if (args.has("--check")) console.log("Authoring backlog matches the live part-level ceiling.");
}
