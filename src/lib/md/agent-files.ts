// The site-level files AI agents read: /llms.txt (llmstxt.org), /llms-full.txt,
// /ai.txt and /robots.txt. All four are generated here, from src/lib/site.ts and
// the twin registry, so they agree with each other and with the pages; the
// landing site's copies (revise-site/) come from the same builders through
// scripts/generate-revise-site-ai-files.mjs. Keep the four in sync by editing
// this file, never a generated copy.

import { SITE } from "@/lib/site";
import { mdLink, mdList } from "./format";
import { isFlagship } from "@/domain/flagship";
import { subjectIdOf } from "@/domain/recommender-tournament";
import { listMarkdownRoutes, renderMarkdown, type MarkdownGroup, type MarkdownRoute } from "./registry";
import { markdownPathFor } from "./routes";

/** Above this, /llms-full.txt is too big for one fetch; the build logs a warning. */
export const LLMS_FULL_SOFT_LIMIT = 500_000;

/** Crawlers allowed explicitly. All are allowed on public paths, training crawlers included, by the owner's choice. */
export const AI_SEARCH_CRAWLERS = ["OAI-SearchBot", "ChatGPT-User", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User"] as const;
export const AI_TRAINING_CRAWLERS = ["GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended", "CCBot", "Bytespider"] as const;

/** Paths no crawler needs: the signed-in reviewer portal and the APIs (except the markdown twins). */
export const PRIVATE_PATHS = ["/reviewer", "/api/"] as const;
export const PUBLIC_API_PATHS = ["/api/md/"] as const;

const SYNC_NOTE = "Generated from src/lib/site.ts and src/lib/md; keep in sync with /llms.txt, /ai.txt and /robots.txt (one generator: src/lib/md/agent-files.ts).";

function twinLink(route: MarkdownRoute): string {
  return mdLink(route.title, markdownPathFor(route.path, new URLSearchParams(route.query)));
}

function line(route: MarkdownRoute): string {
  return `${twinLink(route)}: ${route.summary}`;
}

/** /llms.txt: what Revise is, and where every public page's markdown lives. */
export function buildLlmsTxt(): string {
  const routes = listMarkdownRoutes();
  const of = (group: MarkdownGroup) => routes.filter((route) => route.group === group);
  const lessonHeads = of("lessons").filter((route) => !route.query.topic);
  const curriculumHeads = of("curriculum").filter((route) => !route.query.topic);
  const checkpoints = of("lessons").filter((route) => route.query.checkpoint).length;
  return `${[
    `# ${SITE.name}`,
    "",
    `> ${SITE.aiSummary}`,
    "",
    `${SITE.trustPosition} Revise is free and needs no account; a learner's revision history stays in their own browser and is never published. Every page below has a markdown version; the revision screens themselves have none, because their content is the learner's own.`,
    "",
    "## Core pages",
    mdList(of("core").map(line)),
    "",
    "## Guides",
    mdList(of("guides").map(line)),
    "",
    "## Lessons",
    mdList(lessonHeads.map(line)),
    `- ${checkpoints} taught checkpoints are listed in the markdown catalog and included in full in /llms-full.txt.`,
    "",
    "## Curriculum library",
    mdList(curriculumHeads.map(line)),
    `- Every topic page (${of("curriculum").length - curriculumHeads.length}) is in the markdown catalog.`,
    "",
    "## Machine-readable",
    mdList([
      `${mdLink("Full content", "/llms-full.txt")}: the core pages, guides, lessons and flagship topics in one file`,
      `${mdLink("Markdown catalog", "/api/md/_catalog")}: every markdown page (${routes.length}), as JSON`,
      `${mdLink("Sitemap", "/sitemap.xml")}: the indexable HTML pages`,
      `${mdLink("AI usage policy", "/ai.txt")}: what you may do with this content`,
    ]),
    "",
    "## Optional",
    mdList([`${mdLink("Landing page", SITE.landingUrl)}: the static introduction to Revise`]),
    "",
    `<!-- ${SYNC_NOTE} -->`,
  ].join("\n")}\n`;
}

/**
 * Which twins /llms-full.txt carries, to stay one fetch: the core pages, the
 * guides, every taught lesson checkpoint, the library index and every flagship
 * topic. Lists that the included pages repeat (lesson topic lists, subject
 * pages) and reference subjects stay in the catalog only.
 */
function inFullText(route: MarkdownRoute): boolean {
  if (route.group === "lessons") return !route.query.topic || Boolean(route.query.checkpoint);
  if (route.group !== "curriculum") return true;
  if (route.query.subject) return false;
  // Flagship status is a property of the subject, and the subject id of a
  // topic id is the prefix before the first dot — but only when there is one:
  // a dotless id is not its own subject.
  if (!route.query.topic) return true;
  const subject = subjectIdOf(route.query.topic);
  return subject === null ? true : isFlagship(subject);
}

/** /llms-full.txt: every listed page, rendered by the same registry, joined. */
export function buildLlmsFullTxt(generated: string): { text: string; size: number; overLimit: boolean } {
  const routes = listMarkdownRoutes();
  const included = routes.filter(inFullText);
  const parts = included.flatMap((route) => {
    const rendered = renderMarkdown(route.path, new URLSearchParams(route.query));
    if (!rendered) return [];
    return [`---\n<!-- source: ${rendered.doc.canonical === "/" ? SITE.url : `${SITE.url}${rendered.doc.canonical}`} -->\n${rendered.text.trim()}`];
  });
  const left = routes.length - included.length;
  const text = `${[
    `# ${SITE.name} - full content`,
    `> ${SITE.aiSummary}`,
    `Generated: ${generated}`,
    "",
    `Order: core pages, guides, lessons, then the curriculum library. ${left} pages (lesson topic lists, subject pages and reference-subject topics) are left out to keep this one fetch; each is listed in ${SITE.url}/api/md/_catalog.`,
    "",
    ...parts,
  ].join("\n")}\n`;
  return { text, size: text.length, overLimit: text.length > LLMS_FULL_SOFT_LIMIT };
}

/** /ai.txt (ai-txt v1.1.1 sections): who we are, what agents may do, and how to cite. */
export function buildAiTxt(input: { siteName: string; url: string; description: string; include: readonly string[]; exclude: readonly string[] }): string {
  return `${[
    `# ai.txt — usage policy for AI systems (ai-txt spec v1.1.1)`,
    `# ${SYNC_NOTE}`,
    "",
    "[identity]",
    `name: ${input.siteName}`,
    `url: ${input.url}`,
    `description: ${input.description}`,
    `contact: ${SITE.landingUrl}`,
    "",
    "[permissions]",
    "summarise: allowed",
    "quote: allowed, with attribution",
    "cite: allowed",
    "index: allowed, for search and answers",
    "train: allowed, on public pages only",
    "",
    "[restrictions]",
    "- Do not fabricate quotes, marks, grades, ratings or reviews.",
    "- Do not say Revise questions are human-reviewed, or that Revise is proven to improve grades: neither is true yet.",
    "- Do not present Revise lessons, topic summaries or misconceptions as exam-board material: they are independently authored and not teacher-reviewed.",
    "- Do not present Revise content as your own.",
    "- No learner data is public; nothing here may be used to infer one.",
    "",
    "[attribution]",
    `format: ${input.siteName} (<canonical HTML URL>)`,
    "canonical: the HTML page; a markdown version names it in its Canonical line and Content-Location header",
    "",
    "[scope]",
    `include: ${input.include.join(", ")}`,
    `exclude: ${input.exclude.join(", ")}`,
    "",
    "[contact]",
    `url: ${SITE.landingUrl}`,
  ].join("\n")}\n`;
}

export function buildAppAiTxt(): string {
  return buildAiTxt({
    siteName: SITE.name,
    url: SITE.url,
    description: SITE.description,
    include: ["/", "/welcome", "/library", "/lesson", "/technique", "/*.md", "/api/md/", "/llms.txt", "/llms-full.txt"],
    exclude: [...PRIVATE_PATHS, "the per-learner revision screens (they render only in the learner's browser and carry no public content)"],
  });
}

/** robots.txt: every crawler allowed on public paths; private paths closed to all. */
export function buildRobotsTxt(input: { url: string; sitemap: string | null; disallow: readonly string[]; allow: readonly string[] }): string {
  const rules = [...input.allow.map((path) => `Allow: ${path}`), ...input.disallow.map((path) => `Disallow: ${path}`)];
  return `${[
    `# ${SITE.name} — robots.txt`,
    `# ${SYNC_NOTE}`,
    `# AI agents: ${input.url}/llms.txt maps the site, ${input.url}/ai.txt says how the content may be used,`,
    "# and every public page has a markdown version at <path>.md.",
    "",
    "# AI search, user-fetch and training crawlers: allowed on every public path.",
    ...[...AI_SEARCH_CRAWLERS, ...AI_TRAINING_CRAWLERS].map((agent) => `User-agent: ${agent}`),
    "Allow: /",
    ...rules,
    "",
    "User-agent: *",
    "Allow: /",
    ...rules,
    ...(input.sitemap ? ["", `Sitemap: ${input.sitemap}`] : []),
  ].join("\n")}\n`;
}

export function buildAppRobotsTxt(): string {
  return buildRobotsTxt({ url: SITE.url, sitemap: `${SITE.url}/sitemap.xml`, allow: PUBLIC_API_PATHS, disallow: PRIVATE_PATHS });
}
