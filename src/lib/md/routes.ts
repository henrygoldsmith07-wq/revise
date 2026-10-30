// Which HTML routes have a markdown twin, and how a request reaches it.
//
// Deliberately tiny and free of content imports: src/proxy.ts and the root
// layout read it on every page request, and nothing reachable from the shell
// may pull in the curriculum or the question bank. The renderers themselves
// live in ./registry.ts, which tests/markdown-routes.test.ts keeps in step
// with this list.
//
// Revise is a local-first app: almost every screen renders the learner's own
// data from IndexedDB in the browser, so it has no public content to mirror.
// Only the routes below carry authored, public material.

/** HTML routes with a markdown twin. An explicit allowlist, never a denylist. */
export const MARKDOWN_PAGES = [
  "/",
  "/welcome",
  "/library",
  "/lesson",
  "/technique",
  "/wjec-a-level-physics",
  "/wjec-a-level-physics/past-papers",
  "/wjec-a-level-physics/definitions",
  "/wjec-a-level-physics/data-booklet",
] as const;
export type MarkdownPage = (typeof MARKDOWN_PAGES)[number];

/** Request header the proxy sets (or clears) so the root layout can link the twin. */
export const MARKDOWN_ALTERNATE_HEADER = "x-markdown-alternate";

/** Query parameters each route's twin understands; anything else is dropped from links. */
export const MARKDOWN_QUERY: Record<MarkdownPage, readonly string[]> = {
  "/": [],
  "/welcome": [],
  "/library": ["subject", "topic"],
  "/lesson": ["subject", "topic", "checkpoint"],
  "/technique": [],
  "/wjec-a-level-physics": [],
  "/wjec-a-level-physics/past-papers": [],
  "/wjec-a-level-physics/definitions": [],
  "/wjec-a-level-physics/data-booklet": [],
};

export function isMarkdownPage(path: string): path is MarkdownPage {
  return (MARKDOWN_PAGES as readonly string[]).includes(path);
}

/** `/library.md` → `/library`; `/index.md` → `/`. Null for anything that is not a twin URL. */
export function htmlPathForMarkdown(pathname: string): string | null {
  if (!pathname.endsWith(".md")) return null;
  const path = pathname.slice(0, -".md".length) || "/";
  return path === "/index" ? "/" : path;
}

/** The markdown URL for an HTML route plus the query parameters it honours. */
export function markdownPathFor(path: MarkdownPage, query?: URLSearchParams): string {
  const base = path === "/" ? "/index.md" : `${path}.md`;
  const kept = new URLSearchParams();
  for (const key of MARKDOWN_QUERY[path]) {
    const value = query?.get(key);
    if (value) kept.set(key, value);
  }
  const search = kept.toString();
  return search ? `${base}?${search}` : base;
}

/** The HTML URL a twin stands for: its canonical. */
export function htmlUrlFor(path: MarkdownPage, query?: URLSearchParams): string {
  const kept = new URLSearchParams();
  for (const key of MARKDOWN_QUERY[path]) {
    const value = query?.get(key);
    if (value) kept.set(key, value);
  }
  const search = kept.toString();
  return search ? `${path}?${search}` : path;
}

/**
 * True when a client asked for markdown in preference to HTML. Markdown only
 * wins when text/markdown carries a strictly higher q than text/html; `*\/*`,
 * `text/*` and a missing header always get HTML, so browsers, curl and link
 * previews never see markdown by accident.
 */
export function prefersMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  let markdown = -1;
  let html = -1;
  for (const range of accept.split(",")) {
    const [type = "", ...params] = range.split(";").map((part) => part.trim().toLowerCase());
    let q = 1;
    for (const param of params) {
      const match = /^q=([0-9.]+)$/.exec(param);
      if (match) q = Number(match[1]);
    }
    if (!Number.isFinite(q)) continue;
    if (type === "text/markdown") markdown = Math.max(markdown, q);
    else if (type === "text/html") html = Math.max(html, q);
  }
  return markdown > 0 && markdown > html;
}
