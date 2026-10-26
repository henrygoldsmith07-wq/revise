import { buildLlmsFullTxt } from "@/lib/md/agent-files";
import { textResponse } from "@/lib/md/http";

// Every page /llms.txt lists, rendered by the same registry and joined, for an
// agent that wants the lot in one fetch. Built once per deploy, never per request.
// GET only: exporting HEAD or OPTIONS would make it render per request, and
// Next answers both for a static GET itself.
export const dynamic = "force-static";

export function GET(): Response {
  const full = buildLlmsFullTxt(new Date().toISOString().slice(0, 10));
  if (full.overLimit) console.warn(`[llms-full] ${full.size} characters, over the one-fetch budget; trim inFullText in src/lib/md/agent-files.ts`);
  return textResponse(full.text, { method: "GET", contentType: "text/plain; charset=utf-8", maxAge: 86_400, staleWhileRevalidate: 604_800 });
}
