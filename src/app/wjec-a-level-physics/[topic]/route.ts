// One WJEC A-level Physics topic: how often it is examined, what the
// specification asks, what earns marks and where they are lost. A static,
// zero-JavaScript page served outside the app shell like the other guides;
// the words are built in src/lib/physics-guides.ts from the app's own data.
// Its markdown twin is the topic's library twin (/library.md?topic=…), which
// carries the same key points, errors and misconceptions.

import { physicsTopicGuide } from "@/lib/physics-guides";
import { staticHtmlResponse } from "@/lib/static-page";

export async function GET(_request: Request, { params }: { params: Promise<{ topic: string }> }): Promise<Response> {
  const page = physicsTopicGuide((await params).topic);
  if (!page) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return staticHtmlResponse(page);
}
