import { buildLlmsTxt } from "@/lib/md/agent-files";
import { textResponse } from "@/lib/md/http";

// The llmstxt.org map of the public site, generated from the twin registry so
// it never lists a page that does not exist. Rebuilt with each deploy.
// GET only: exporting HEAD or OPTIONS would make it render per request, and
// Next answers both for a static GET itself.
export const dynamic = "force-static";

export function GET(): Response {
  return textResponse(buildLlmsTxt(), { method: "GET", contentType: "text/plain; charset=utf-8", maxAge: 86_400, staleWhileRevalidate: 604_800 });
}
