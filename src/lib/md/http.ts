// HTTP for the markdown twins and the site-level agent files. One place builds
// the headers, so every markdown response says the same things: it is
// markdown, roughly how many tokens it costs, that the HTML page is canonical
// and must be the one indexed, and that any origin may read it.

import { absoluteUrl } from "@/lib/site";

export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "Accept",
} as const;

/** Approximate tokens (chars / 4): enough for an agent to budget a fetch. */
export function approximateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface MarkdownResponseInit {
  method: string;
  status?: number;
  /** HTML path (with query) this body mirrors. */
  canonical?: string;
  /** Seconds a shared cache may keep it. */
  maxAge?: number;
  staleWhileRevalidate?: number;
  /** YYYY-MM-DD the content last changed, when known. */
  lastUpdated?: string;
  contentType?: string;
}

/** A markdown (or plain text) response. HEAD gets the same headers and no body. */
export function textResponse(body: string, init: MarkdownResponseInit): Response {
  const headers = new Headers({
    "content-type": init.contentType ?? "text/markdown; charset=utf-8",
    "x-markdown-tokens": String(approximateTokens(body)),
    // The HTML page stays canonical: search engines index it, not this.
    "x-robots-tag": "noindex, follow",
    vary: "Accept",
    "cache-control": `public, s-maxage=${init.maxAge ?? 3600}, stale-while-revalidate=${init.staleWhileRevalidate ?? 86_400}`,
    ...CORS_HEADERS,
  });
  if (init.canonical) {
    const canonical = absoluteUrl(init.canonical);
    headers.set("content-location", canonical);
    headers.set("link", `<${canonical}>; rel="canonical"`);
  }
  if (init.lastUpdated) {
    const date = new Date(`${init.lastUpdated}T00:00:00Z`);
    if (Number.isFinite(date.getTime())) headers.set("last-modified", date.toUTCString());
  }
  return new Response(init.method === "HEAD" ? null : body, { status: init.status ?? 200, headers });
}

/** CORS preflight for every agent-facing endpoint. */
export function optionsResponse(): Response {
  return new Response(null, { status: 204, headers: { ...CORS_HEADERS, "access-control-max-age": "86400" } });
}

/** Never HTML: an unknown twin is a markdown 404. */
export function markdownNotFound(method: string, requested: string): Response {
  const body = `# Not found\n\n> There is no markdown version of ${requested}.\n\nThe list of every markdown page is at ${absoluteUrl("/api/md/_catalog")}, and the site map for agents at ${absoluteUrl("/llms.txt")}.\n`;
  return textResponse(body, { method, status: 404, maxAge: 300, staleWhileRevalidate: 3600 });
}
