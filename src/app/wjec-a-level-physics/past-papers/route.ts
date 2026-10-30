// WJEC A-level Physics past-paper questions by unit and by topic, linked to WJEC's PDFs.
// A static, zero-JavaScript guide page, served outside the app shell like
// /welcome. The words are built in src/lib/physics-guides.ts from the app's own
// data, and the markdown twin at /wjec-a-level-physics/past-papers.md renders the same page.

import { physicsGuide } from "@/lib/physics-guides";
import { staticHtmlResponse } from "@/lib/static-page";

export async function GET(): Promise<Response> {
  return staticHtmlResponse(physicsGuide("/wjec-a-level-physics/past-papers"));
}
