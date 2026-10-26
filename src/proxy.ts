import { NextResponse, type NextRequest } from "next/server";
import { buildContentSecurityPolicy, createNonce } from "@/lib/csp";
import {
  htmlPathForMarkdown,
  isMarkdownPage,
  MARKDOWN_ALTERNATE_HEADER,
  markdownPathFor,
  prefersMarkdown,
} from "@/lib/md/routes";
import { absoluteUrl } from "@/lib/site";

// Per-request CSP nonce for every page (see src/lib/csp.ts). Next.js reads the
// nonce from the request's Content-Security-Policy header while rendering and
// applies it to its scripts; the root layout reads x-nonce for its own inline
// theme script. Nonces need dynamic rendering, which the layout opts into.
//
// It also routes the markdown twins (src/lib/md). `/library.md?topic=…`, and
// `/library?topic=…` asked for with `Accept: text/markdown`, are both rewritten
// to the one handler at /api/md. A twin is text, not a document, so it gets no
// nonce: it keeps the static file policy next.config.ts gives every path with
// an extension. Real markdown files in /public (/docs/*.md) are left alone.

/** Public files that already end in .md and must be served as they are. */
const STATIC_MARKDOWN = /^\/docs\//;

/** Advertised on every page: where an agent finds the map, the full text and the policy. */
const DESCRIBED_BY = ["/llms.txt", "/llms-full.txt", "/ai.txt"]
  .map((path) => `<${absoluteUrl(path)}>; rel="describedby"; type="text/plain"`)
  .join(", ");

function toTwin(request: NextRequest, htmlPath: string): NextResponse {
  const target = request.nextUrl.clone();
  target.pathname = htmlPath === "/" ? "/api/md/index" : `/api/md${htmlPath}`;
  return NextResponse.rewrite(target);
}

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  const twinOf = htmlPathForMarkdown(pathname);
  if (twinOf !== null) {
    if (STATIC_MARKDOWN.test(pathname)) return NextResponse.next();
    // An unknown path still goes to the handler: it answers with a markdown 404.
    return toTwin(request, twinOf);
  }

  const markdownPage = isMarkdownPage(pathname);
  if (markdownPage && (request.method === "GET" || request.method === "HEAD") && prefersMarkdown(request.headers.get("accept"))) {
    return toTwin(request, pathname);
  }

  const nonce = createNonce();
  const policy = buildContentSecurityPolicy({ nonce, isDev: process.env.NODE_ENV === "development" });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  // Always overwritten or removed here, so a client can never choose what the
  // layout links as this page's markdown twin.
  const alternate = markdownPage ? absoluteUrl(markdownPathFor(pathname, searchParams)) : null;
  if (alternate) requestHeaders.set(MARKDOWN_ALTERNATE_HEADER, alternate);
  else requestHeaders.delete(MARKDOWN_ALTERNATE_HEADER);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Link", alternate ? `<${alternate}>; rel="alternate"; type="text/markdown", ${DESCRIBED_BY}` : DESCRIBED_BY);
  // The same URL answers with markdown for an Accept that asks for it. `next
  // start` replaces this on a rendered page; that is harmless, because pages are
  // `private, no-store` and the markdown answer carries its own Vary: Accept.
  if (markdownPage) response.headers.set("Vary", "Accept");
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not API routes, build assets or files served from /public.
      // Paths skipped here get a static CSP from next.config.ts instead.
      source: "/((?!api(?:/|$)|_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    // Markdown twin URLs, which the rule above skips for their extension.
    { source: "/((?!api(?:/|$)|_next/).*\\.md)" },
  ],
};
