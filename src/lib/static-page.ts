// The HTML and markdown for a public, zero-JavaScript content page.
//
// A page is data (a title, a lead and blocks); this module renders it two ways
// so the HTML a search engine indexes and the markdown twin an agent reads say
// exactly the same thing. Route handlers serve the HTML outside the app shell,
// like /welcome: no providers, no client boundaries, nothing per-user.
//
// Inline markup is the /welcome subset: **bold**, `code` and [text](/path or URL).

import { mdTable } from "@/lib/md/format";
import { absoluteUrl, SITE } from "@/lib/site";
import { inlineHtml, inlineMarkdown } from "@/lib/welcome";

export interface StaticTable {
  head: string[];
  rows: string[][];
  /** Column indexes holding numbers, right-aligned in HTML. */
  numeric?: number[];
}

export interface StaticBlock {
  heading: string;
  /** An h3 under the previous h2, rather than a new h2. */
  sub?: boolean;
  paragraphs?: string[];
  /** Rendered as a bulleted list. */
  items?: string[];
  table?: StaticTable;
  /** Set off as an honest statement. */
  honest?: boolean;
}

export interface StaticPage {
  path: string;
  /** The <title>: under ~60 characters. */
  title: string;
  heading: string;
  /** The meta description: one or two sentences. */
  description: string;
  lead: string;
  blocks: StaticBlock[];
  related: { label: string; path: string }[];
}

const STYLE = `
  :root { color-scheme: light dark; }
  body { margin: 0; font: 16px/1.65 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: #f4f4f6; color: #16161a; }
  @media (prefers-color-scheme: dark) { body { background: #0b0b0d; color: #f4f4f6; } }
  main { max-width: 46rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
  nav.crumbs { font-size: .875rem; opacity: .8; }
  h1 { font-size: 1.75rem; line-height: 1.25; margin: 1rem 0 .5rem; }
  h2 { font-size: 1.25rem; margin: 2.5rem 0 .5rem; }
  h3 { font-size: 1.0625rem; margin: 1.75rem 0 .25rem; }
  p, li { margin: .5rem 0; }
  .lead { font-size: 1.0625rem; }
  .honest { border-left: 3px solid currentColor; padding: .25rem 0 .25rem 1rem; margin: 1.5rem 0; }
  ul { padding-left: 1.25rem; }
  a { color: inherit; }
  .table { overflow-x: auto; margin: .75rem 0; }
  table { border-collapse: collapse; width: 100%; font-size: .9375rem; }
  th, td { text-align: left; padding: .4rem .75rem .4rem 0; border-bottom: 1px solid rgba(127, 127, 127, .3); vertical-align: top; }
  th { font-weight: 600; }
  .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  footer { margin-top: 3rem; font-size: .875rem; opacity: .8; }
  code { font-size: .9em; }
`;

function escapeAttribute(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function tableHtml(table: StaticTable): string {
  const cls = (index: number) => (table.numeric?.includes(index) ? ' class="n"' : "");
  const head = table.head.map((cell, index) => `<th${cls(index)}>${inlineHtml(cell)}</th>`).join("");
  const rows = table.rows
    .map((row) => `      <tr>${row.map((cell, index) => `<td${cls(index)}>${inlineHtml(cell)}</td>`).join("")}</tr>`)
    .join("\n");
  return `  <div class="table"><table>\n    <thead><tr>${head}</tr></thead>\n    <tbody>\n${rows}\n    </tbody>\n  </table></div>`;
}

function blockHtml(block: StaticBlock): string {
  const parts = [`  <${block.sub ? "h3" : "h2"}>${inlineHtml(block.heading)}</${block.sub ? "h3" : "h2"}>`];
  const paragraphs = (block.paragraphs ?? []).map((text) => `<p>${inlineHtml(text)}</p>`);
  if (paragraphs.length) parts.push(block.honest ? `  <div class="honest">\n    ${paragraphs.join("\n    ")}\n  </div>` : `  ${paragraphs.join("\n  ")}`);
  if (block.items?.length) parts.push(`  <ul>\n${block.items.map((item) => `    <li>${inlineHtml(item)}</li>`).join("\n")}\n  </ul>`);
  if (block.table) parts.push(tableHtml(block.table));
  return parts.join("\n");
}

/** The page as a complete HTML document: indexable, canonical, with its markdown twin linked. */
export function renderStaticHtml(page: StaticPage): string {
  const canonical = absoluteUrl(page.path);
  const title = escapeAttribute(page.title);
  const description = escapeAttribute(page.description);
  const related = page.related.map((link) => `[${link.label}](${link.path})`).join(" · ");
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonical}">
<link rel="alternate" type="text/markdown" href="${absoluteUrl(`${page.path}.md`)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary">
<style>${STYLE}</style>
</head>
<body>
<main>
  <nav class="crumbs" aria-label="Breadcrumb">${inlineHtml(`[${SITE.name}](/welcome)`)}</nav>
  <h1>${inlineHtml(page.heading)}</h1>
  <p class="lead">${inlineHtml(page.lead)}</p>

${page.blocks.map(blockHtml).join("\n\n")}

  <footer>
    <p>${inlineHtml(related)}</p>
    <p>${inlineHtml(`${SITE.name}: WJEC A-level revision, Physics first. Not affiliated with or endorsed by WJEC.`)}</p>
  </footer>
</main>
</body>
</html>`;
}

/** The same page as a markdown twin body. */
export function renderStaticMarkdown(page: StaticPage): string {
  const md = (text: string) => inlineMarkdown(text, absoluteUrl);
  const parts = [md(page.lead)];
  for (const block of page.blocks) {
    parts.push(`${block.sub ? "###" : "##"} ${md(block.heading)}`);
    for (const paragraph of block.paragraphs ?? []) parts.push(block.honest ? `> ${md(paragraph)}` : md(paragraph));
    if (block.items?.length) parts.push(block.items.map((item) => `- ${md(item)}`).join("\n"));
    if (block.table) parts.push(mdTable(block.table.head.map(md), block.table.rows.map((row) => row.map(md))));
  }
  return parts.join("\n\n");
}

/** A Response for a route handler: static prose with nothing per-user in it. */
export function staticHtmlResponse(page: StaticPage): Response {
  return new Response(renderStaticHtml(page), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
