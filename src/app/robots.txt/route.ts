import { buildAppRobotsTxt } from "@/lib/md/agent-files";

// A route rather than the robots.ts convention, because the file carries
// comments pointing agents at /llms.txt and /ai.txt.
export const dynamic = "force-static";

export function GET(): Response {
  return new Response(buildAppRobotsTxt(), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
