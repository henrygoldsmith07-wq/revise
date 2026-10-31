import type { MetadataRoute } from "next";
import { PHYSICS_GUIDE_PATHS } from "@/lib/physics-guides";
import { PRICING_PATH } from "@/lib/pricing-page";
import { absoluteUrl } from "@/lib/site";

// Only the pages meant to be indexed. The app's screens are noindex (see the
// root layout) and the markdown twins are noindex alternates, so neither is here.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl("/welcome"), changeFrequency: "monthly", priority: 1 },
    { url: absoluteUrl(PRICING_PATH), changeFrequency: "monthly", priority: 0.8 },
    ...PHYSICS_GUIDE_PATHS.map((path) => ({ url: absoluteUrl(path), changeFrequency: "monthly" as const, priority: 0.8 })),
  ];
}
