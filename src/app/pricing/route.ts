// The public pricing page: static, zero-JavaScript, served outside the app
// shell like /welcome. The words are built in src/lib/pricing-page.ts from
// PLUS_PLAN, and /pricing.md renders the same page.

import { pricingPage } from "@/lib/pricing-page";
import { staticHtmlResponse } from "@/lib/static-page";

export async function GET(): Promise<Response> {
  return staticHtmlResponse(pricingPage());
}
