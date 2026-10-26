import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

// Only the pages meant to be indexed. The app's screens are noindex (see the
// root layout) and the markdown twins are noindex alternates, so neither is here.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: absoluteUrl("/welcome"), changeFrequency: "monthly", priority: 1 }];
}
