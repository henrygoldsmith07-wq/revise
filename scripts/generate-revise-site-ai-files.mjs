#!/usr/bin/env node
// Generates the AI-agent files for the static landing site (revise-site/),
// which has no build step of its own: index.md (the page as markdown),
// llms.txt, ai.txt, robots.txt, sitemap.xml, the agent block in index.html's
// <head> (markdown alternate, ai-summary, Organization/WebSite JSON-LD), and
// the `headers` in vercel.json that serve them with the right types. Facts come from src/lib/site.ts and the builders in
// src/lib/md/agent-files.ts, the same ones the app serves, so the two sites
// cannot disagree.
//
//   node scripts/generate-revise-site-ai-files.mjs          write the files
//   node scripts/generate-revise-site-ai-files.mjs --check  fail if any is stale (npm run verify)
//
// index.md is converted from index.html itself: the landing page is
// hand-written HTML, so its markup is the data. Edit index.html, then run this.

import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SITE_DIR = join(ROOT, "revise-site");
const check = process.argv.includes("--check");

const bundle = await build({
  stdin: {
    contents: `
      export { SITE, siteJsonLd, jsonLdScript } from "./src/lib/site";
      export { buildAiTxt, buildRobotsTxt } from "./src/lib/md/agent-files";
    `,
    resolveDir: ROOT,
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  alias: { "@": join(ROOT, "src") },
  logLevel: "silent",
});
const lib = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const { SITE } = lib;
const LANDING = SITE.landingUrl;

const html = readFileSync(join(SITE_DIR, "index.html"), "utf8");

// --- index.html → markdown ----------------------------------------------------

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " ", mdash: "—", ndash: "–", rarr: "→", larr: "←", middot: "·", hellip: "…" };
const decode = (text) => text.replace(/&(#?\w+);/g, (whole, name) => ENTITIES[name] ?? whole);
const attr = (attrs, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1] ?? "";
const absolute = (href) => (/^https?:\/\//.test(href) ? href : href.startsWith("#") ? `${LANDING}/${href}` : new URL(href, `${LANDING}/`).href);

function htmlToMarkdown(fragment) {
  const blocks = [];
  let line = "";
  let href = null;
  let skipping = 0;
  const flush = () => {
    const text = line.replace(/\s+/g, " ").replace(/\s+([.,;:!?)])/g, "$1").trim();
    if (text && text !== "-" && text !== "###" && text !== "##") blocks.push(text);
    line = "";
  };
  for (const [, close, tag, attrs = "", text] of fragment.matchAll(/<(\/?)([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g)) {
    if (text !== undefined) {
      if (!skipping) line += decode(text);
      continue;
    }
    const name = tag.toLowerCase();
    if (name === "svg" || name === "style" || name === "script") {
      skipping += close ? -1 : 1;
      continue;
    }
    if (skipping) continue;
    const cls = attr(attrs, "class");
    if (!close) {
      if (name === "h1" || name === "h2") { flush(); line = "## "; }
      else if (name === "h3" || name === "summary") { flush(); line = "### "; }
      else if (name === "p" || name === "details" || name === "section") flush();
      else if (name === "div" && cls.split(" ").includes("stat")) { flush(); line = "- "; }
      else if (name === "span" && cls.split(" ").includes("pill")) { flush(); line = "- "; }
      else if (name === "span") line += " ";
      else if (name === "br") line += " ";
      else if (name === "b" || name === "strong") line += "**";
      else if (name === "code") line += "`";
      else if (name === "a") { href = attr(attrs, "href"); line += "["; }
    } else {
      if (["h1", "h2", "h3", "summary", "p", "div", "details", "section"].includes(name)) flush();
      else if (name === "b" || name === "strong") line += "**";
      else if (name === "code") line += "`";
      else if (name === "a") { line += `](${absolute(href ?? "")})`; href = null; }
    }
  }
  flush();
  // Consecutive list items form one list; everything else is its own paragraph.
  return blocks.reduce((out, block) => {
    const joinList = block.startsWith("- ") && out.length && out[out.length - 1].split("\n").at(-1).startsWith("- ");
    if (joinList) out[out.length - 1] += `\n${block}`;
    else out.push(block);
    return out;
  }, []).join("\n\n");
}

function between(text, start, end) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`index.html no longer has ${start} … ${end}`);
  return text.slice(from, to);
}

const title = decode(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? SITE.name);
const description = decode(/<meta name="description" content="([^"]*)">/.exec(html)?.[1] ?? SITE.description);
const main = htmlToMarkdown(between(html, '<section class="hero"', "<footer>"));

const indexMd = `${[
  `# ${title}`,
  "",
  `> ${description}`,
  "",
  `Canonical: ${LANDING}/`,
  "",
  main,
  "",
  "## Related",
  "",
  `- [Revise, the app](${SITE.url}/)`,
  `- [The app as markdown, with its lessons and library](${SITE.url}/llms.txt)`,
].join("\n")}\n`;

// --- agent files ----------------------------------------------------------------

const llmsTxt = `${[
  `# ${SITE.name}`,
  "",
  `> ${SITE.aiSummary}`,
  "",
  `${SITE.trustPosition} This is the static landing page; the app itself, and the markdown versions of its lessons, library and guides, live at ${SITE.url}.`,
  "",
  "## Core pages",
  `- [Landing page](${LANDING}/index.md): ${description}`,
  "",
  "## The app",
  `- [Revise](${SITE.url}/index.md): ${SITE.aiSummary}`,
  `- [The app's llms.txt](${SITE.url}/llms.txt): every public page of the app as markdown`,
  "",
  "## Machine-readable",
  `- [AI usage policy](${LANDING}/ai.txt): what you may do with this content`,
  `- [Sitemap](${LANDING}/sitemap.xml)`,
  "",
  "<!-- Generated by scripts/generate-revise-site-ai-files.mjs; keep in sync with ai.txt and robots.txt (same generator). -->",
].join("\n")}\n`;

const aiTxt = lib.buildAiTxt({
  siteName: SITE.name,
  url: LANDING,
  description,
  include: ["/", "/index.md", "/llms.txt"],
  exclude: ["none: this site has no private paths"],
});

const robotsTxt = lib.buildRobotsTxt({ url: LANDING, sitemap: `${LANDING}/sitemap.xml`, allow: [], disallow: [] });

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${LANDING}/</loc></url>
</urlset>
`;

// --- the agent block in index.html's <head> --------------------------------------

const BLOCK_START = "<!-- agent-signals: generated by scripts/generate-revise-site-ai-files.mjs; do not edit by hand -->";
const BLOCK_END = "<!-- /agent-signals -->";
const graph = lib.siteJsonLd();
const block = [
  BLOCK_START,
  `<link rel="alternate" type="text/markdown" href="${LANDING}/index.md">`,
  `<meta name="ai-summary" content="${SITE.aiSummary.replace(/"/g, "&quot;")}">`,
  `<script type="application/ld+json">${lib.jsonLdScript(graph)}</script>`,
  BLOCK_END,
].join("\n");
const blockPattern = new RegExp(`${BLOCK_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${BLOCK_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
const nextHtml = blockPattern.test(html) ? html.replace(blockPattern, block) : html.replace("</head>", `${block}\n</head>`);

// --- vercel.json headers: content types and Link hints for the files above ------

const describedBy = `<${LANDING}/llms.txt>; rel="describedby"; type="text/plain", <${LANDING}/ai.txt>; rel="describedby"; type="text/plain"`;
const vercel = JSON.parse(readFileSync(join(SITE_DIR, "vercel.json"), "utf8"));
vercel.headers = [
  { source: "/", headers: [{ key: "Link", value: `<${LANDING}/index.md>; rel="alternate"; type="text/markdown", ${describedBy}` }] },
  {
    source: "/index.md",
    headers: [
      { key: "Content-Type", value: "text/markdown; charset=utf-8" },
      { key: "X-Robots-Tag", value: "noindex, follow" },
      { key: "Link", value: `<${LANDING}/>; rel="canonical", ${describedBy}` },
      { key: "Access-Control-Allow-Origin", value: "*" },
      { key: "Cache-Control", value: "public, s-maxage=86400, stale-while-revalidate=604800" },
    ],
  },
  {
    source: "/(llms|ai|robots).txt",
    headers: [
      { key: "Content-Type", value: "text/plain; charset=utf-8" },
      { key: "Access-Control-Allow-Origin", value: "*" },
    ],
  },
];

// --- write or check ----------------------------------------------------------------

const outputs = {
  "index.md": indexMd,
  "llms.txt": llmsTxt,
  "ai.txt": aiTxt,
  "robots.txt": robotsTxt,
  "sitemap.xml": sitemapXml,
  "index.html": nextHtml,
  "vercel.json": `${JSON.stringify(vercel, null, 2)}\n`,
};

const stale = [];
for (const [file, content] of Object.entries(outputs)) {
  const path = join(SITE_DIR, file);
  let current = null;
  try {
    current = readFileSync(path, "utf8");
  } catch {
    current = null;
  }
  if (current === content) continue;
  if (check) stale.push(file);
  else writeFileSync(path, content);
}

if (check && stale.length) {
  console.error(`revise-site agent files are stale: ${stale.join(", ")}. Run: node scripts/generate-revise-site-ai-files.mjs`);
  process.exit(1);
}
console.log(check ? "revise-site agent files are up to date." : "revise-site agent files written.");
