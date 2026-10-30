// The WJEC A-level Physics hub: every topic, by how often the papers examine it.
// A static, zero-JavaScript guide page, served outside the app shell like
// /welcome. The words are built in src/lib/physics-guides.ts from the app's own
// data, and the markdown twin at /wjec-a-level-physics.md renders the same page.

import { physicsGuide } from "@/lib/physics-guides";
import { staticHtmlResponse } from "@/lib/static-page";

export async function GET(): Promise<Response> {
  return staticHtmlResponse(physicsGuide("/wjec-a-level-physics"));
}
