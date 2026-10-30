// The definitions and laws WJEC A-level Physics asks a student to state.
// A static, zero-JavaScript guide page, served outside the app shell like
// /welcome. The words are built in src/lib/physics-guides.ts from the app's own
// data, and the markdown twin at /wjec-a-level-physics/definitions.md renders the same page.

import { physicsGuide } from "@/lib/physics-guides";
import { staticHtmlResponse } from "@/lib/static-page";

export async function GET(): Promise<Response> {
  return staticHtmlResponse(physicsGuide("/wjec-a-level-physics/definitions"));
}
