"use client";

import katex from "katex";
import { useMemo } from "react";

// ---------------------------------------------------------------------------
// Content rendering for STEM revision: inline `$…$` and display `$$…$$` maths
// via KaTeX, plus the small subset of markdown the AI prompts and the authored
// content actually use. Deliberately not a full markdown engine — the input is
// ours, the output is inserted into the DOM, and a small hand-checked grammar
// is far easier to keep safe than a general one.
// ---------------------------------------------------------------------------

/**
 * Only self-contained data URLs and plain http(s) may reach a src attribute.
 * Card content can arrive from an imported deck someone else wrote, so a
 * `javascript:` or `data:text/html` URL must never survive to the DOM.
 */
function safeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (/^data:(image|audio)\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]*$/i.test(trimmed)) return trimmed;
  if (/^https?:\/\/[^\s"'<>]+$/i.test(trimmed)) return trimmed;
  return null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMath(expression: string, displayMode: boolean): string {
  try {
    return katex.renderToString(expression, { displayMode, throwOnError: false, output: "html" });
  } catch {
    return escapeHtml(expression);
  }
}

/** Inline emphasis, code and maths. Input is escaped before any markup runs. */
function inline(text: string): string {
  let out = escapeHtml(text);
  // Maths first: its contents must not be treated as markdown.
  out = out.replace(/\$\$([^$]+)\$\$/g, (_, expr: string) => renderMath(decode(expr), true));
  out = out.replace(/\$([^$\n]+)\$/g, (_, expr: string) => renderMath(decode(expr), false));
  out = out.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-surface2 text-[0.9em]">$1</code>');
  // ![alt](url) and @[audio](url), both URL-validated before they are emitted.
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (whole, alt: string, url: string) => {
    const safe = safeUrl(decode(url));
    if (!safe) return escapeHtml(whole);
    return `<img src="${safe}" alt="${alt}" class="max-w-full h-auto rounded-[8px] border border-line my-2" loading="lazy" />`;
  });
  out = out.replace(/@\[([^\]]*)\]\(([^)]+)\)/g, (whole, _label: string, url: string) => {
    const safe = safeUrl(decode(url));
    if (!safe) return escapeHtml(whole);
    return `<audio controls preload="none" src="${safe}" class="w-full my-2 h-9"></audio>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-ink">$1</strong>');
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return out;
}

function decode(text: string): string {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}

/** A GitHub-style pipe table: header row, `---` separator, then body rows. */
function tableHtml(lines: string[]): string | null {
  if (lines.length < 2) return null;
  const isRow = (line: string) => line.trim().startsWith("|") && line.trim().endsWith("|");
  if (!lines.every(isRow)) return null;
  if (!/^\|[\s:|-]+\|$/.test(lines[1].trim())) return null;

  const cells = (line: string) =>
    line
      .trim()
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim());

  const header = cells(lines[0]);
  const body = lines.slice(2).map(cells);
  const head = header.map((c) => `<th class="text-left font-semibold px-2.5 py-1.5">${inline(c)}</th>`).join("");
  const rows = body
    .map(
      (row) =>
        `<tr class="border-t border-line">${row
          .map((c) => `<td class="px-2.5 py-1.5 align-top">${inline(c)}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  // Wrapped so a wide table scrolls itself instead of the page.
  return `<div class="overflow-x-auto nice-scroll my-2"><table class="w-full text-sm border border-line rounded-[8px] border-separate border-spacing-0"><thead class="bg-surface2 text-ink2">${head}</thead><tbody>${rows}</tbody></table></div>`;
}

export function toHtml(markdown: string): string {
  const blocks = markdown.split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      const table = tableHtml(lines);
      if (table) return table;
      if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
        const items = lines.map((l) => `<li>${inline(l.replace(/^\s*[-•]\s+/, ""))}</li>`).join("");
        return `<ul class="list-disc pl-5 space-y-1">${items}</ul>`;
      }
      if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
        const items = lines.map((l) => `<li>${inline(l.replace(/^\s*\d+\.\s+/, ""))}</li>`).join("");
        return `<ol class="list-decimal pl-5 space-y-1">${items}</ol>`;
      }
      const heading = block.match(/^(#{1,3})\s+(.*)$/);
      if (heading) {
        const level = heading[1].length + 2;
        return `<h${level} class="font-semibold text-ink mt-1">${inline(heading[2])}</h${level}>`;
      }
      return `<p>${lines.map(inline).join("<br />")}</p>`;
    })
    .join("");
}

export function RichText({ children, className }: { children: string; className?: string }) {
  const html = useMemo(() => toHtml(children ?? ""), [children]);
  return (
    <div
      className={`text-sm leading-relaxed text-ink2 space-y-3 [&_h3]:text-sm [&_h4]:text-sm ${className ?? ""}`}
      // Safe by construction: every path through toHtml escapes its input
      // before adding markup, and KaTeX output is generated, not user text.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
