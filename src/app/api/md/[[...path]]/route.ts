import { CORS_HEADERS, markdownNotFound, optionsResponse, textResponse } from "@/lib/md/http";
import { listMarkdownRoutes, renderMarkdown } from "@/lib/md/registry";
import { markdownPathFor } from "@/lib/md/routes";
import { PHYSICS_GUIDE_PATHS } from "@/lib/physics-guides";
import { absoluteUrl, SITE } from "@/lib/site";

// The one markdown handler. src/proxy.ts rewrites every twin request here:
// `/library.md?topic=…` and `/library?topic=…` with `Accept: text/markdown`
// both arrive as `/api/md/library?topic=…`. Called directly, it is the
// debugging view of the same thing. It never returns HTML: an unknown route or
// entity is a markdown 404. `/api/md/_catalog` lists every twin.

export const runtime = "nodejs";

/** Pages whose content changes only with a deploy are cached longer. */
const STATIC_PAGES = new Set<string>(["/", "/welcome", "/technique", "/pricing", ...PHYSICS_GUIDE_PATHS]);

type Context = { params: Promise<{ path?: string[] }> };

function catalog(method: string): Response {
  const routes = listMarkdownRoutes().map((route) => {
    const query = new URLSearchParams(route.query);
    return {
      title: route.title,
      group: route.group,
      html: absoluteUrl(`${route.path}${query.size ? `?${query}` : ""}`),
      markdown: absoluteUrl(markdownPathFor(route.path, query)),
    };
  });
  const body = JSON.stringify({ site: SITE.name, url: SITE.url, count: routes.length, routes }, null, 2);
  return new Response(method === "HEAD" ? null : body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-robots-tag": "noindex, follow",
      "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800",
      ...CORS_HEADERS,
    },
  });
}

async function handle(request: Request, context: Context): Promise<Response> {
  const { path = [] } = await context.params;
  const url = new URL(request.url);
  const joined = `/${path.join("/")}`;
  if (joined === "/_catalog") return catalog(request.method);
  const htmlPath = joined === "/index" ? "/" : joined;
  const rendered = renderMarkdown(htmlPath, url.searchParams);
  if (!rendered) return markdownNotFound(request.method, absoluteUrl(`${htmlPath}${url.search}`));
  const lasting = STATIC_PAGES.has(htmlPath);
  return textResponse(rendered.text, {
    method: request.method,
    canonical: rendered.doc.canonical,
    lastUpdated: rendered.doc.lastUpdated,
    maxAge: lasting ? 86_400 : 3600,
    staleWhileRevalidate: lasting ? 604_800 : 86_400,
  });
}

export const GET = handle;
export const HEAD = handle;

export function OPTIONS(): Response {
  return optionsResponse();
}
