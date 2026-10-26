// The facts every outward-facing surface repeats: the page metadata, /welcome,
// /llms.txt, /llms-full.txt, /ai.txt, /robots.txt, the markdown twins and the
// JSON-LD all read them from here, so they cannot drift apart. The static
// landing site (revise-site/) is generated from the same module by
// scripts/generate-revise-site-ai-files.mjs.
//
// Claims made here are the claims the whole outside world sees. They follow the
// current trust position (AGENTS.md, "Current honest position"): four WJEC
// subjects authored to their specification, no question human-reviewed yet,
// everything else reference material. Change them only when that changes.

/**
 * Canonical origin. Set NEXT_PUBLIC_SITE_URL at deploy time rather than
 * trusting a Host header, so canonicals, OG tags and every absolute link an
 * agent follows can never be pointed at a spoofed origin. The fallback is the
 * production deployment, so a preview or a local build still names the real
 * site as canonical.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://revise-gray.vercel.app").replace(/\/+$/, "");

/** The static landing page (revise-site/, its own Vercel project). */
export const LANDING_URL = "https://revise-site-henrygoldsmith07-9188s-projects.vercel.app";

export const SITE = {
  name: "Revise",
  url: SITE_URL,
  landingUrl: LANDING_URL,
  locale: "en-GB",
  title: "Revise — exam revision that knows what to do next",
  description:
    "WJEC A-level revision, Physics first: tells you the one thing to do next — spaced repetition, exam-style practice with examiner marking, and a plan that rebuilds itself. Four subjects are authored to their specification; everything else is labelled reference material.",
  shortDescription:
    "WJEC A-level revision, Physics first: tells you the one thing to do next. Four subjects are authored to their specification; everything else is labelled reference material.",
  /** For a model that has already fetched a page: what this site is, in two sentences. */
  aiSummary:
    "Revise is a free, local-first revision app for WJEC A-level, Physics first, that picks the one most useful thing to study next. Four WJEC subjects are authored to their specification but no question has been human-reviewed yet, so it does not claim to prove improvement.",
  /** The current trust position, stated once for llms.txt, ai.txt and the markdown twins. */
  trustPosition:
    "Four WJEC A-level subjects (Mathematics, Biology, Chemistry and Physics) have their topics and specification statements authored. No question has been through human review yet, so Revise cannot yet prove that a learner has improved. Other boards and qualifications reuse those outlines and are labelled reference material.",
} as const;

/** An absolute URL on this site for a path that may carry a query string. */
export function absoluteUrl(path: string): string {
  return `${SITE.url}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Organization + WebSite JSON-LD, from the same facts as llms.txt and ai.txt. */
export function siteJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE.url}/#organization`,
        name: SITE.name,
        url: SITE.url,
        logo: absoluteUrl("/logo.svg"),
        description: SITE.description,
        sameAs: [SITE.landingUrl],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE.url}/#website`,
        name: SITE.name,
        url: SITE.url,
        description: SITE.description,
        inLanguage: SITE.locale,
        publisher: { "@id": `${SITE.url}/#organization` },
      },
    ],
  };
}

/** JSON for an inline <script type="application/ld+json">: `<` escaped so it can never close the tag. */
export function jsonLdScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
