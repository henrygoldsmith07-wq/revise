// Shared markdown formatting for the twins, /llms.txt and /llms-full.txt.
// Every link is absolute and points at the HTML page, never at a .md twin,
// except where a link exists to hand an agent the markdown (llms.txt).

import { absoluteUrl } from "@/lib/site";

/** Escape what would change the meaning of plain text inside a markdown line. */
export function mdText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/([[\]])/g, "\\$1").replace(/\r?\n+/g, " ").trim();
}

/** A link to a site path (made absolute) or an absolute URL. */
export function mdLink(label: string, target: string): string {
  const url = /^https?:\/\//.test(target) ? target : absoluteUrl(target);
  return `[${mdText(label)}](${url.replace(/[()\s]/g, (c) => encodeURIComponent(c))})`;
}

export function mdList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

export function mdNumbered(items: readonly string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

/** A table; cells have pipes and line breaks escaped. */
export function mdTable(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\r?\n+/g, " ").trim();
  return [
    `| ${header.map(cell).join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
  ].join("\n");
}

/** Multi-line authored text as a blockquote-safe block (keeps its own line breaks). */
export function mdBlock(text: string): string {
  return text.trim().split(/\r?\n/).map((line) => line.trimEnd()).join("  \n");
}

export interface MarkdownDocument {
  title: string;
  /** One sentence: the page's meta description. */
  summary: string;
  /** HTML path (with query) this document mirrors: its canonical. */
  canonical: string;
  /** YYYY-MM-DD, only when the content carries a real date. */
  lastUpdated?: string;
  /** Main content, already markdown, without the title. */
  body: string;
  related?: readonly { label: string; path: string }[];
}

/** The fixed shape every twin shares: title, summary, canonical, body, related. */
export function renderDocument(doc: MarkdownDocument): string {
  const head = [
    `# ${doc.title}`,
    "",
    `> ${mdText(doc.summary)}`,
    "",
    `Canonical: ${absoluteUrl(doc.canonical)}`,
    ...(doc.lastUpdated ? [`Last updated: ${doc.lastUpdated}`] : []),
  ];
  const related = doc.related?.length
    ? ["", "## Related", "", mdList(doc.related.map((link) => mdLink(link.label, link.path)))]
    : [];
  return `${[...head, "", doc.body.trim(), ...related].join("\n")}\n`;
}
