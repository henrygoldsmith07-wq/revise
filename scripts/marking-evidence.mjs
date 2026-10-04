// Private operational intake; never bundled with the learner application.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadDomain } from "./lib/load-domain.mjs";
const [command, input, destination, extra] = process.argv.slice(2);
if (!["init", "pack", "import", "report"].includes(command) || !input) throw new Error("Usage: marking-evidence.mjs init <new.json> | pack <corpus.json> <new-directory> | import <corpus.json> <returns.json> <new-corpus.json> | report <corpus.json>");
const d = await loadDomain(`
 export { parseAnswerCorpusJson } from './src/domain/answer-corpus';
 export * from './src/domain/marking-evidence';
 export { seedQuestions as questions } from './src/content';
 export { markPart } from './src/domain/marking';
`);
const write = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
if (command === "init") {
 await write(input, { formatVersion: 2, benchmarkVersion: "pilot-human-v1", createdAt: new Date().toISOString(), provenance: "Genuine anonymised student collection — populate only after consent", records: [] });
 console.log("Empty intake created. No evidence fabricated. See docs/evidence-operations.md for the existing answer-corpus record format and required collection attestations.");
} else {
 const parsed = d.parseAnswerCorpusJson(await readFile(input, "utf8"));
 if (parsed.errors.length || !parsed.file) throw new Error(parsed.errors.join("; ") || "Invalid corpus");
 const records = parsed.records;
 if (command === "pack") {
  if (!destination || !records.length) throw new Error("Supply a populated consented student-answer corpus and a new output directory.");
  const out = resolve(destination);
  await mkdir(out); // refuse overwriting returned human evidence
  for (const slot of ["A", "B"]) {
   const eligible = records.filter(r => (slot === "A" ? r.humanMark1 : r.humanMark2) == null);
   await write(resolve(out, `marker-${slot}.json`), { formatVersion: 1, returns: eligible.map(r => ({ recordId: r.id, fingerprint: d.markingRecordFingerprint(r), slot,
    mark: null, marker: { markerId: "", role: "teacher", qualification: "", boardFamiliarity: "WJEC", independentlyMarked: false, markedAt: "" } })) });
   // Blind: no first-pass, adjudicated, rubric or AI mark is present.
   await write(resolve(out, `blind-${slot}.json`), eligible.map(r => ({ recordId: r.id, fingerprint: d.markingRecordFingerprint(r), questionId: r.questionId,
    question: r.questionText, markScheme: r.markScheme, tariff: r.maximumMarks, studentAnswer: r.studentAnswer })));
  }
  await write(resolve(out, "adjudication.json"), { formatVersion: 1, returns: records.filter(r => d.independentPair(r) && r.humanMark1 !== r.humanMark2 && r.adjudicatedMark == null).map(r => ({ recordId: r.id, fingerprint: d.markingRecordFingerprint(r), slot: "adjudication", mark: null,
   marker: { markerId: "", role: "senior-examiner", qualification: "", markedAt: "" } })) });
  await write(resolve(out, "adjudication-pack.json"), records.filter(r => d.independentPair(r) && r.humanMark1 !== r.humanMark2 && r.adjudicatedMark == null).map(r => ({
   recordId: r.id, fingerprint: d.markingRecordFingerprint(r), question: r.questionText, markScheme: r.markScheme, tariff: r.maximumMarks,
   studentAnswer: r.studentAnswer, markerA: r.humanMark1, markerB: r.humanMark2,
  })));
  await writeFile(resolve(out, "README.md"), "# Private human marking pack\n\nGive marker A only blind-A.json and marker-A.json; give marker B only blind-B.json and marker-B.json. Do not share marks until both have independently marked. Record pseudonymous qualified marker IDs, timestamps and independence attestations. Import each return against the latest corpus into a new file. A third marker may adjudicate disagreements; no averaged mark is treated as truth. Do not send this private answer pack automatically.\n");
  console.log(out);
 } else if (command === "import") {
  if (!destination || !extra) throw new Error("Import requires return file and NEW output corpus path.");
  const returned = JSON.parse(await readFile(destination, "utf8"));
  if (returned.formatVersion !== 1 || !Array.isArray(returned.returns) || returned.returns.some(r => !r || typeof r.recordId !== "string" || typeof r.fingerprint !== "string" || !r.marker)) throw new Error("Malformed human mark return file");
  const filled = returned.returns.filter(r => r.mark !== null || r.marker.markerId || r.marker.markedAt);
  const result = d.applyHumanMarkReturns(records, filled);
  if (result.errors.length) throw new Error(result.errors.join("; "));
  await write(extra, { ...parsed.file, records: result.records });
  console.log(`Imported ${result.applied} genuine human decisions; blank rows skipped. Existing files preserved.`);
 } else {
  // Rubric uses exactly the bank snapshot named by the corpus; changed marking
  // is excluded, never quietly evaluated against another question version.
  const evaluated = records.map(r => {
   const q = d.questions.find(q => q.id === r.questionId);
   const p = q?.parts.find(p => p.id === r.partId);
   const matches = p && p.marks === r.maximumMarks && p.prompt === r.questionText && JSON.stringify(p.markScheme) === JSON.stringify(r.markScheme) && q.specVersion === r.specificationVersion;
   return matches ? { ...r, rubricMark: d.markPart(p, r.studentAnswer).awarded, markingVersion: `${r.benchmarkVersion}:bank:${q.specVersion}` } : { ...r, rubricMark: null };
  });
  console.log(JSON.stringify(d.markingEvidenceReport(evaluated), null, 2));
 }
}
