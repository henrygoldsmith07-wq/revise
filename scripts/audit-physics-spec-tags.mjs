// Ranks likely mis-tagged WJEC Physics spec points (thirty-first pass).
//
//   node scripts/audit-physics-spec-tags.mjs            ranked report per source file
//   node scripts/audit-physics-spec-tags.mjs --json f   also write every scored part to f
//   node scripts/audit-physics-spec-tags.mjs --top 40   how many suspects to list (default 30)
//
// A lost mark links to the lesson for the part's spec point, and adaptive
// sessions pick questions by spec point, so a wrong tag sends a student to
// the wrong lesson. This is a *triage* tool, not a verdict:
//
// Method. For every WJEC Physics question part, the text the student sees and
// is marked on (stem, part prompt, mark scheme, model answer) is compared with
// each spec point *in the same topic* (a tag outside the topic is already a
// test failure in tests/physics-spec-tags.test.ts). A spec point is described
// by its curriculum wording plus its authored checkpoint teaching (explain
// steps, worked example, check, apply task, trap). Both sides are reduced to
// content-word stems (lower case, stop words removed, crude suffix stripping,
// physics symbols kept) and scored by TF-IDF cosine similarity, with IDF taken
// over the spec-point documents of the topic. A part is a suspect when another
// point in the topic out-scores its tagged point; suspects are ranked by the
// gap and by the ratio best/tagged.
//
// Limits. Keyword overlap rewards shared vocabulary, not shared physics: a
// question that *uses* momentum to test a collision analysis can score highest
// on the momentum-definitions point; teaching text is longer for some points
// than others; synonyms ("p.d." vs "voltage") are missed. "Agreement" below is
// the share of parts whose tagged point is also the best keyword match. It is
// not an accuracy figure and must not be reported as one; every retag is a
// human decision with a written reason.

import { build } from "esbuild";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const top = args.includes("--top") ? Number(args[args.indexOf("--top") + 1]) : 30;
const SUBJECT = "wjec-alevel-physics";

const bundle = await build({
  stdin: {
    contents: [
      'export { seedQuestions } from "./src/content";',
      'export { topicsFor } from "./src/domain/curriculum";',
      'export { TEACHING } from "./src/content/teaching";',
    ].join("\n"),
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "error",
});
const data = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

// ---- text → stems -----------------------------------------------------------
const STOP = new Set(("a an and are as at be been being by can could do does for from has have how if in into is it its " +
  "of on or so such than that the their then there these this those to was were what when where which while who why will " +
  "with without would your you use using used give show state explain calculate describe suggest find determine one two three " +
  "student value values answer mark marks part question data given each also both other same between about after before " +
  "because therefore hence must only not no any all more most less very per show that s m".split(" ")));
function stem(word) {
  let w = word;
  for (const suffix of ["ations", "ation", "ingly", "ings", "ing", "ities", "ity", "ness", "ments", "ment", "ies", "es", "ed", "ly", "s"]) {
    if (w.length > suffix.length + 3 && w.endsWith(suffix)) { w = w.slice(0, -suffix.length); break; }
  }
  return w;
}
function tokens(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[–—]/g, " ")
    .split(/[^a-z0-9αβγδεθλμνπρστφωΩΦΔ²³⁻¹½√]+/i)
    .filter((t) => t.length > 1 && !STOP.has(t) && !/^\d+(\.\d+)?$/.test(t))
    .map(stem);
}
function tf(list) {
  const m = new Map();
  for (const t of list) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}
function cosine(a, b, idf) {
  let dot = 0, na = 0, nb = 0;
  for (const [t, v] of a) { const w = v * (idf.get(t) ?? 0); na += w * w; const u = b.get(t); if (u) dot += w * u * (idf.get(t) ?? 0); }
  for (const [t, v] of b) { const w = v * (idf.get(t) ?? 0); nb += w * w; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// ---- spec-point documents per topic ---------------------------------------
const topics = data.topicsFor(SUBJECT);
const specDocs = new Map(); // topicId -> [{id, ref, text, vec}]
const idfByTopic = new Map();
for (const topic of topics) {
  const docs = (topic.specPoints ?? []).map((sp) => {
    const t = data.TEACHING[sp.id];
    const teaching = t
      ? [...t.explain, t.worked.prompt, ...t.worked.steps, t.worked.answer, t.check.question, t.check.explanation, t.apply.prompt, t.apply.modelAnswer, t.trap?.wrong ?? "", t.trap?.right ?? ""].join(" ")
      : "";
    // The statement is weighted twice: it is what the point *is*; teaching is supporting vocabulary.
    return { id: sp.id, ref: sp.ref, text: sp.text, vec: tf(tokens(`${sp.text} ${sp.text} ${teaching}`)), taught: Boolean(t) };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.vec.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = new Map([...df].map(([t, n]) => [t, Math.log(1 + docs.length / n)]));
  specDocs.set(topic.id, docs);
  idfByTopic.set(topic.id, idf);
}

// ---- source-file attribution -------------------------------------------------
// Questions do not carry their file. The longest run of id segments (after
// "cnt:question:") found literally in exactly one content file wins; ids
// built by a generator (topic + point + slug + index) match on their slug.
// physics-part-learning.ts only annotates other files' ids, so it is skipped.
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|json)$/.test(name) ? [p] : [];
  });
}
const files = [...walk("src/content/questions"), ...walk("src/content/sources")]
  .filter((p) => !p.endsWith("physics-part-learning.ts"))
  .map((p) => ({ path: relative(process.cwd(), p), text: readFileSync(p, "utf8") }));
const hitCache = new Map();
function uniqueHit(needle) {
  if (!hitCache.has(needle)) {
    const hits = files.filter((f) => f.text.includes(needle));
    hitCache.set(needle, hits.length === 1 ? hits[0].path : null);
  }
  return hitCache.get(needle);
}
function sourceFile(id) {
  const segs = id.replace(/^cnt:question:/, "").split("-");
  for (let len = segs.length; len >= 2; len--) {
    for (let i = 0; i + len <= segs.length; i++) {
      const needle = segs.slice(i, i + len).join("-");
      if (needle.length < 10 || /^(sp-\d+|\d+)$/.test(segs[i + len - 1]) && len < 3) continue;
      const hit = uniqueHit(needle);
      if (hit) return hit;
    }
  }
  return "(unattributed)";
}

// ---- score every tagged part --------------------------------------------------
const rows = [];
for (const q of data.seedQuestions.filter((x) => x.subjectId === SUBJECT)) {
  for (const part of q.parts) {
    const tags = part.specPointIds?.length ? part.specPointIds : q.specPointIds ?? [];
    if (tags.length !== 1) continue; // multi-tag parts are left out of the ranking
    const tagged = tags[0];
    const topicId = q.topicIds.find((t) => (specDocs.get(t) ?? []).some((d) => d.id === tagged));
    if (!topicId) continue;
    const docs = specDocs.get(topicId);
    if (docs.length < 2) continue;
    const idf = idfByTopic.get(topicId);
    const vec = tf(tokens([q.stem, part.prompt, ...(part.markScheme ?? []), part.modelAnswer].join(" ")));
    const scored = docs.map((d) => ({ id: d.id, ref: d.ref, text: d.text, score: cosine(vec, d.vec, idf) })).sort((a, b) => b.score - a.score);
    const mine = scored.find((s) => s.id === tagged);
    const best = scored[0];
    rows.push({
      question: q.id, part: part.id, file: sourceFile(q.id), topic: topicId,
      tagged, taggedScore: +mine.score.toFixed(3), best: best.id, bestRef: best.ref, bestText: best.text, bestScore: +best.score.toFixed(3),
      gap: +(best.score - mine.score).toFixed(3), ratio: mine.score ? +(best.score / mine.score).toFixed(2) : Infinity,
      prompt: `${q.stem} ${part.prompt}`.replace(/\s+/g, " ").slice(0, 200),
    });
  }
}

const suspects = rows.filter((r) => r.best !== r.tagged).sort((a, b) => b.gap - a.gap || b.ratio - a.ratio);
const strong = suspects.filter((r) => r.gap >= 0.1 && r.ratio >= 2);
const byFile = new Map();
for (const r of rows) {
  const f = byFile.get(r.file) ?? { parts: 0, agree: 0, strong: 0 };
  f.parts++;
  if (r.best === r.tagged) f.agree++;
  if (r.best !== r.tagged && r.gap >= 0.1 && r.ratio >= 2) f.strong++;
  byFile.set(r.file, f);
}

console.log(`WJEC Physics single-tag parts scored: ${rows.length} (multi-tag parts skipped).`);
console.log(`Tagged point is also the best keyword match: ${rows.length - suspects.length}/${rows.length}. Strong suspects (gap ≥ 0.10 and ratio ≥ 2): ${strong.length}.`);
console.log("This is keyword agreement, not tagging accuracy (see the header of this script).\n");
console.log("Per source file (parts · keyword agreement · strong suspects), most strong suspects first:");
for (const [file, f] of [...byFile].sort((a, b) => b[1].strong - a[1].strong || b[1].parts - a[1].parts)) {
  console.log(`  ${String(f.strong).padStart(3)} strong · ${String(f.agree).padStart(4)}/${String(f.parts).padEnd(4)} agree · ${file}`);
}
console.log(`\nTop ${top} suspects:`);
for (const r of suspects.slice(0, top)) {
  console.log(`- ${r.question} [${r.part.split(":").pop()}] (${r.file})\n    tagged ${r.tagged.split(".").slice(1).join(".")} ${r.taggedScore} → best ${r.best.split(".").slice(1).join(".")} ${r.bestScore} (${r.bestRef}: ${r.bestText})\n    "${r.prompt}"`);
}
if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ method: "tf-idf cosine over content-word stems, same topic only", rows }, null, 2));
  console.log(`\nWrote ${rows.length} scored parts to ${jsonOut}`);
}
