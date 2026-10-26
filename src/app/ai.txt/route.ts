import { buildAppAiTxt } from "@/lib/md/agent-files";
import { textResponse } from "@/lib/md/http";

// How AI systems may use this site's content (ai-txt v1.1.1), from the same
// facts as /llms.txt and /robots.txt.
// GET only: exporting HEAD or OPTIONS would make it render per request, and
// Next answers both for a static GET itself.
export const dynamic = "force-static";

export function GET(): Response {
  return textResponse(buildAppAiTxt(), { method: "GET", contentType: "text/plain; charset=utf-8", maxAge: 86_400, staleWhileRevalidate: 604_800 });
}
