import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { NextRequest } from "next/server";
import { TEACHING } from "@/content/teaching";
import { allSubjects, getSubject, topicsFor } from "@/domain/curriculum";
import { isFlagship } from "@/domain/flagship";
import {
  AI_SEARCH_CRAWLERS,
  AI_TRAINING_CRAWLERS,
  buildAppAiTxt,
  buildAppRobotsTxt,
  buildLlmsFullTxt,
  buildLlmsTxt,
  LLMS_FULL_SOFT_LIMIT,
} from "@/lib/md/agent-files";
import { listMarkdownRoutes, renderMarkdown } from "@/lib/md/registry";
import { htmlPathForMarkdown, MARKDOWN_ALTERNATE_HEADER, MARKDOWN_PAGES, markdownPathFor, prefersMarkdown } from "@/lib/md/routes";
import { SITE } from "@/lib/site";
import { WELCOME } from "@/lib/welcome";

vi.mock("server-only", () => ({}));

// The markdown twins (src/lib/md): every public page has a markdown version
// rendered from the same data, agents can reach it by `.md` or by Accept, and
// nothing private, unreviewed-as-reviewed or hidden-until-answered leaks out.

/**
 * Every route in src/app that has no twin, and why. A new page fails the
 * coverage test below until it is given a renderer or a reason here.
 */
const NO_TWIN: Record<string, string> = {
  "/adaptive-session": "per-learner app state (IndexedDB)",
  "/classes": "per-learner app state (IndexedDB)",
  "/diagnostic": "per-learner app state (IndexedDB)",
  "/papers": "per-learner app state (IndexedDB)",
  "/practicals": "built from the learner's enrolled subjects and attempts",
  "/practice": "per-learner app state; serves unreviewed questions",
  "/readiness": "per-learner app state (IndexedDB)",
  "/readiness/spec": "per-learner app state (IndexedDB)",
  "/readiness/trusted-coverage": "reviewer and developer tool; depends on the runtime review ledger",
  "/review": "per-learner app state (IndexedDB)",
  "/schedule": "per-learner app state (IndexedDB)",
  "/settings": "per-learner app state (IndexedDB)",
  "/shared": "per-learner app state (IndexedDB)",
  "/study": "per-learner app state (IndexedDB)",
  "/tutor": "per-learner app state (IndexedDB)",
  "/twin": "per-learner app state (IndexedDB)",
  "/reviewer": "signed-in teacher portal",
  "/reviewer/pairs": "signed-in teacher portal",
  "/reviewer/review/[questionId]": "signed-in teacher portal",
  "/llms.txt": "agent file, not a page",
  "/llms-full.txt": "agent file, not a page",
  "/ai.txt": "agent file, not a page",
  "/robots.txt": "agent file, not a page",
};

function appRoutes(dir = join(process.cwd(), "src/app")): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return appRoutes(full);
    if (entry !== "page.tsx" && entry !== "route.ts") return [];
    const route = `/${relative(join(process.cwd(), "src/app"), dir).split(sep).filter((part) => !/^\(.*\)$/.test(part)).join("/")}`;
    return [route === "/" ? "/" : route.replace(/\/$/, "")];
  });
}

describe("every route is accounted for", () => {
  it("has a markdown renderer or a stated reason not to", () => {
    const routes = appRoutes().filter((route) => !route.startsWith("/api"));
    const unaccounted = routes.filter((route) => !(MARKDOWN_PAGES as readonly string[]).includes(route) && !(route in NO_TWIN));
    expect(unaccounted).toEqual([]);
    // And neither list names a route that no longer exists.
    for (const route of [...MARKDOWN_PAGES, ...Object.keys(NO_TWIN)]) expect(routes, route).toContain(route);
  });
});

describe("content negotiation", () => {
  it("serves markdown only when it outranks HTML", () => {
    expect(prefersMarkdown("text/markdown")).toBe(true);
    expect(prefersMarkdown("text/markdown, */*")).toBe(true);
    expect(prefersMarkdown("text/markdown;q=0.9, text/html;q=0.8")).toBe(true);
    expect(prefersMarkdown("text/html, text/markdown;q=0.9")).toBe(false);
    expect(prefersMarkdown("text/html;q=0.9, text/markdown;q=0.9")).toBe(false);
    expect(prefersMarkdown("text/markdown;q=0")).toBe(false);
  });

  it("always gives HTML to browsers, curl and link previews", () => {
    expect(prefersMarkdown(null)).toBe(false);
    expect(prefersMarkdown("")).toBe(false);
    expect(prefersMarkdown("*/*")).toBe(false);
    expect(prefersMarkdown("text/*")).toBe(false);
    expect(prefersMarkdown("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")).toBe(false);
  });

  it("maps .md URLs to their HTML route", () => {
    expect(htmlPathForMarkdown("/index.md")).toBe("/");
    expect(htmlPathForMarkdown("/library.md")).toBe("/library");
    expect(htmlPathForMarkdown("/library")).toBeNull();
    expect(markdownPathFor("/library", new URLSearchParams({ topic: "t", from: "adaptive" }))).toBe("/library.md?topic=t");
  });
});

describe("rendered twins", () => {
  const routes = listMarkdownRoutes();
  const rendered = routes.map((route) => ({ route, out: renderMarkdown(route.path, new URLSearchParams(route.query)) }));

  it("renders every listed route with the shared shape and only absolute links", () => {
    expect(routes.length).toBeGreaterThan(600);
    for (const { route, out } of rendered) {
      const label = `${route.path}?${new URLSearchParams(route.query)}`;
      expect(out, label).not.toBeNull();
      expect(out!.text.startsWith("# "), label).toBe(true);
      expect(out!.text, label).toMatch(new RegExp(`\\nCanonical: ${SITE.url.replace(/[.]/g, "\\.")}/`));
      expect(out!.text, label).not.toMatch(/\]\((?!https?:\/\/)/);
      expect(out!.text, label).not.toMatch(/<\/?(?:div|span|script)\b/i);
    }
  });

  it("answers an unknown route or entity with null (a markdown 404), never a guess", () => {
    expect(renderMarkdown("/settings")).toBeNull();
    expect(renderMarkdown("/library", new URLSearchParams({ topic: "no-such-topic" }))).toBeNull();
    expect(renderMarkdown("/lesson", new URLSearchParams({ topic: "wjec-alevel-physics.kinematics-dynamics", checkpoint: "nope" }))).toBeNull();
  });

  it("labels trust honestly on every subject and lesson", () => {
    for (const subject of allSubjects()) {
      const text = renderMarkdown("/library", new URLSearchParams({ subject: subject.id }))!.text;
      if (isFlagship(subject.id)) expect(text, subject.id).toContain("No question in it has been through human review yet");
      else expect(text, subject.id).toMatch(/reference|preview|unverified|not been checked/i);
    }
    for (const { route, out } of rendered) {
      if (route.path === "/lesson") expect(out!.text).toContain("Not yet teacher-reviewed");
    }
  });

  it("never shows what the lesson hides until the learner acts", () => {
    const checkpoints = rendered.filter(({ route }) => route.query.checkpoint);
    expect(checkpoints.length).toBe(Object.keys(TEACHING).length);
    for (const { route, out } of checkpoints) {
      const teaching = TEACHING[route.query.checkpoint!]!;
      expect(out!.text).toContain(teaching.check.question);
      expect(out!.text).not.toContain(teaching.check.explanation);
      expect(out!.text).not.toContain(teaching.apply.modelAnswer);
      if (teaching.trap) expect(out!.text).not.toContain(teaching.trap.right);
    }
  });

  it("says the same words as the /welcome HTML", () => {
    const text = renderMarkdown("/welcome")!.text;
    for (const section of WELCOME.sections) {
      expect(text).toContain(`## ${section.heading}`);
      // Links compared by their words: the twin's are absolute, the source's relative.
      const words = (s: string) => s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
      for (const line of [...(("items" in section ? section.items : undefined) ?? []), ...(("paragraphs" in section ? section.paragraphs : undefined) ?? [])]) {
        expect(words(text)).toContain(words(line));
      }
    }
  });

  it("covers every subject and topic in the library", () => {
    const topics = allSubjects().reduce((sum, subject) => sum + topicsFor(subject.id).length, 0);
    expect(routes.filter((r) => r.path === "/library" && r.query.topic)).toHaveLength(topics);
    expect(routes.filter((r) => r.path === "/library" && r.query.subject)).toHaveLength(allSubjects().length);
    expect(getSubject("wjec-alevel-physics")).toBeDefined();
  });
});

describe("/api/md", () => {
  async function call(path: string, init: RequestInit = {}) {
    const { GET, HEAD, OPTIONS } = await import("@/app/api/md/[[...path]]/route");
    const url = new URL(`https://revise.test/api/md/${path}`);
    const segments = url.pathname.replace(/^\/api\/md\/?/, "").split("/").filter(Boolean);
    const context = { params: Promise.resolve({ path: segments }) };
    const request = new Request(url, init);
    if (init.method === "OPTIONS") return OPTIONS();
    return (init.method === "HEAD" ? HEAD : GET)(request, context);
  }

  it("serves a twin with the headers agents and search engines need", async () => {
    const res = await call("library?topic=wjec-alevel-physics.kinematics-dynamics");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, follow");
    expect(Number(res.headers.get("x-markdown-tokens"))).toBeGreaterThan(50);
    expect(res.headers.get("content-location")).toBe(`${SITE.url}/library?topic=wjec-alevel-physics.kinematics-dynamics`);
    expect(res.headers.get("link")).toBe(`<${SITE.url}/library?topic=wjec-alevel-physics.kinematics-dynamics>; rel="canonical"`);
    expect(res.headers.get("vary")).toBe("Accept");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toMatch(/s-maxage=\d+, stale-while-revalidate=\d+/);
    expect(await res.text()).toMatch(/^# /);
  });

  it("answers HEAD with the same headers and no body, and handles preflight", async () => {
    const head = await call("index", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(await head.text()).toBe("");
    const options = await call("index", { method: "OPTIONS" });
    expect(options.status).toBe(204);
    expect(options.headers.get("access-control-allow-methods")).toContain("GET");
  });

  it("returns a markdown 404, never HTML", async () => {
    for (const path of ["does-not-exist", "settings", "library?topic=nope", "reviewer"]) {
      const res = await call(path);
      expect(res.status, path).toBe(404);
      expect(res.headers.get("content-type"), path).toBe("text/markdown; charset=utf-8");
      expect(await res.text(), path).toMatch(/^# Not found/);
    }
  });

  it("lists every twin in the catalog", async () => {
    const res = await call("_catalog");
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const body = (await res.json()) as { count: number; routes: { html: string; markdown: string }[] };
    expect(body.count).toBe(listMarkdownRoutes().length);
    expect(body.routes.every((route) => route.markdown.startsWith(`${SITE.url}/`) && /\.md(\?|$)/.test(route.markdown))).toBe(true);
  });
});

describe("proxy routing", () => {
  async function proxyFor(path: string, headers: Record<string, string> = {}) {
    const { proxy } = await import("@/proxy");
    return proxy(new NextRequest(new URL(path, "https://revise.test"), { headers }));
  }
  const rewrite = (res: Response) => res.headers.get("x-middleware-rewrite");

  it("rewrites .md URLs and markdown-preferring requests to the one handler", async () => {
    expect(rewrite(await proxyFor("/library.md?topic=x"))).toBe("https://revise.test/api/md/library?topic=x");
    expect(rewrite(await proxyFor("/index.md"))).toBe("https://revise.test/api/md/index");
    expect(rewrite(await proxyFor("/does-not-exist.md"))).toBe("https://revise.test/api/md/does-not-exist");
    expect(rewrite(await proxyFor("/library?topic=x", { accept: "text/markdown" }))).toBe("https://revise.test/api/md/library?topic=x");
  });

  it("leaves HTML alone for */*, for non-twin pages and for real markdown files", async () => {
    for (const [path, headers] of [["/library", { accept: "*/*" }], ["/", {}], ["/settings", { accept: "text/markdown" }], ["/docs/benchmark.md", {}]] as const) {
      expect(rewrite(await proxyFor(path, headers)), path).toBeNull();
    }
  });

  it("advertises the twin and the agent files, and cannot be told a different twin", async () => {
    const res = await proxyFor("/library?topic=x&from=adaptive", { [MARKDOWN_ALTERNATE_HEADER]: "https://evil.example/x.md" });
    expect(res.headers.get("link")).toContain(`<${SITE.url}/library.md?topic=x>; rel="alternate"; type="text/markdown"`);
    expect(res.headers.get("link")).toContain(`<${SITE.url}/llms.txt>; rel="describedby"`);
    expect(res.headers.get("vary")).toBe("Accept");
    expect(res.headers.get("x-middleware-request-x-markdown-alternate")).toBe(`${SITE.url}/library.md?topic=x`);
    const other = await proxyFor("/settings", { [MARKDOWN_ALTERNATE_HEADER]: "https://evil.example/x.md" });
    expect(other.headers.get("x-middleware-request-x-markdown-alternate")).toBeNull();
    expect(other.headers.get("link")).not.toContain("alternate");
  });
});

describe("site-level agent files", () => {
  it("llms.txt follows llmstxt.org and every link it gives resolves to a twin", () => {
    const text = buildLlmsTxt();
    expect(text.startsWith(`# ${SITE.name}\n\n> `)).toBe(true);
    for (const heading of ["## Core pages", "## Machine-readable", "## Optional"]) expect(text).toContain(heading);
    const links = [...text.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map((m) => new URL(m[1]!));
    expect(links.length).toBeGreaterThan(10);
    for (const url of links.filter((u) => u.origin === SITE.url && u.pathname.endsWith(".md"))) {
      expect(renderMarkdown(htmlPathForMarkdown(url.pathname)!, url.searchParams), url.href).not.toBeNull();
    }
  });

  it("llms-full.txt carries the listed pages within one fetch", () => {
    const full = buildLlmsFullTxt("2026-10-26");
    expect(full.overLimit).toBe(false);
    expect(full.size).toBeLessThanOrEqual(LLMS_FULL_SOFT_LIMIT);
    expect(full.text).toContain(`<!-- source: ${SITE.url}/welcome -->`);
    expect(full.text).toContain("Generated: 2026-10-26");
  });

  it("ai.txt states identity, permissions, restrictions, attribution and scope", () => {
    const text = buildAppAiTxt();
    for (const section of ["[identity]", "[permissions]", "[restrictions]", "[attribution]", "[scope]", "[contact]"]) expect(text).toContain(section);
    expect(text).toContain(`url: ${SITE.url}`);
    expect(text).toMatch(/human-reviewed/);
    expect(text).toContain("/reviewer");
  });

  it("robots.txt lets every AI crawler in, keeps private paths closed and names the sitemap", () => {
    const text = buildAppRobotsTxt();
    for (const agent of [...AI_SEARCH_CRAWLERS, ...AI_TRAINING_CRAWLERS]) expect(text).toContain(`User-agent: ${agent}`);
    expect(text).not.toMatch(/^Disallow: \/\s*$/m);
    expect(text).toContain("Disallow: /reviewer");
    expect(text).toContain("Allow: /api/md/");
    expect(text).toContain(`Sitemap: ${SITE.url}/sitemap.xml`);
    expect(text).toMatch(/llms\.txt/);
  });

  it("the service worker never caches agent files", () => {
    const sw = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
    expect(sw).toContain("llms(?:-full)?|ai|robots");
  });
});
