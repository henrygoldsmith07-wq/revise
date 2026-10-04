import { readFile } from "node:fs/promises";
import { loadDomain } from "./lib/load-domain.mjs";
const flags = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, "").split("=")));
const d = await loadDomain(`
 export { seedQuestions as questions } from './src/content';
 export { allTopics } from './src/domain/curriculum';
 export { FLAGSHIP_SUBJECTS } from './src/domain/flagship';
 export { flagshipReadiness } from './src/domain/flagship-readiness';
 export { buildPilotReport } from './src/domain/pilot-evidence';
 export { markingEvidenceReport } from './src/domain/marking-evidence';
 export { parseAnswerCorpusJson } from './src/domain/answer-corpus';
 export { productQualityReport } from './src/domain/product-quality';
`);
const read = async path => JSON.parse(await readFile(path, "utf8"));
const topics = d.allTopics();
const log = await read("src/content/reviews/wjec-review-audit-log.json");
const gate = { topicIds: new Set(topics.map(t => t.id)), specPointIds: new Set(topics.flatMap(t => (t.specPoints ?? []).map(s => s.id))), specVersionOf: id => topics.find(t => t.subjectId === id)?.specVersion };
const content = d.FLAGSHIP_SUBJECTS.map(f => d.flagshipReadiness({ topics, questions: d.questions, auditEvents: log.events, gate, subjectId: f.subjectId }));
const learners = flags.pilot ? (await read(flags.pilot)).learners : [];
if (!Array.isArray(learners)) throw new Error("Pilot file must contain a learners array; use consented Settings pilot exports.");
const parsed = flags.corpus ? d.parseAnswerCorpusJson(await readFile(flags.corpus, "utf8")) : { records: [], errors: [] };
if (parsed.errors.length) throw new Error(parsed.errors.join("; "));
const report = d.productQualityReport({ content, pilot: d.buildPilotReport(learners, d.questions), marking: d.markingEvidenceReport(parsed.records), ...(flags.reliability ? { reliability: await read(flags.reliability) } : {}) });
if (Object.hasOwn(flags, "json")) console.log(JSON.stringify(report, null, 2));
else {
 console.log("Internal product quality — observed evidence only\n");
 for (const s of content) console.log(`${s.label}: ${s.verdict}, ${s.trustedQuestions} trusted questions, ${s.blockedTopics.length} blocked topics`);
 console.log(`\nPilot: ${report.pilot.learners} learners; ${report.pilot.learning.marksProvenRecovered} marks proven recovered; ${report.pilot.proof.learnersBlockedBySupply} learners blocked by content`);
 console.log(`Marking: ${report.marking.genuineIndependentAnswers}/250 genuine double-marked answers; ${report.marking.unresolvedDisagreements} unresolved disagreements`);
 console.log(`\nTop blockers:\n${report.blockers.map(b => `${b.rank}. ${b.kind}: ${b.detail}\n   Next: ${b.nextAction}`).join("\n")}`);
 console.log(`\n${report.note}\nFull evidence: npm run product:quality -- --json [--pilot=file.json] [--corpus=file.json] [--reliability=file.json]`);
}
