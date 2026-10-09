import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const layout = read("src/app/layout.tsx");
const welcome = read("src/app/welcome/route.ts");
const sw = read("public/sw.js");

// The honest entry point: what a browser without JavaScript, or a crawler, or a
// parent deciding whether to install this, actually gets. These are the claims
// the outside world sees, so they are asserted rather than assumed.

describe("no-JS entry point", () => {
  it("explains itself without JavaScript, outside the client-only boundary", () => {
    // AccountBoundary resolves its profile in a client effect, so anything inside
    // it never renders on the server. A <noscript> placed there can never be seen.
    const noscript = layout.indexOf("<noscript>");
    expect(noscript).toBeGreaterThan(-1);
    expect(noscript).toBeLessThan(layout.indexOf("<PwaInstallProvider>"));
    expect(noscript).toBeLessThan(layout.indexOf("<AccountBoundary>"));
    // It says why the app cannot start, instead of showing a dead shell.
    expect(layout).toContain("needs JavaScript");
    expect(layout).toMatch(/href="\/welcome"/);
  });

  it("serves /welcome as a static page with no scripts and no per-user data", () => {
    expect(welcome).toContain("export async function GET()");
    expect(welcome).toContain("text/html; charset=utf-8");
    // A route handler is served outside the app layout, so none of the client
    // providers apply. It must therefore ship no script at all.
    expect(welcome).not.toContain("<script");
    expect(welcome).not.toMatch(/\son[a-z]+=/);
    expect(welcome).not.toContain("dangerouslySetInnerHTML");
  });

  it("states the current trust position rather than implying a finished product", () => {
    expect(welcome).toMatch(/No question has been through human review yet/);
    expect(welcome).toMatch(/cannot yet prove|cannot certify/i);
    expect(welcome).toMatch(/Practising works/i);
    // The four flagships are named, and the reference-tier position is honest.
    expect(welcome).toContain("Mathematics, Biology, Chemistry and Physics");
    expect(welcome).toMatch(/None of their questions have been signed off by two\s+independent human reviewers/);
  });

  it("gives /welcome the metadata a shared link needs", () => {
    for (const tag of [
      '<meta name="description"',
      '<link rel="canonical"',
      'property="og:title"',
      'property="og:description"',
      'property="og:url"',
      'name="twitter:card"',
    ]) {
      expect(welcome, tag).toContain(tag);
    }
    expect(welcome).toContain('lang="en-GB"');
  });

  it("keeps the static page inside the precached app shell", () => {
    // tests/perf.test.ts derives the expected route list from src/app, so a new
    // route that is not precached would fail the build gate instead.
    expect(sw).toContain('"/welcome"');
    // The offline shell must not change shape underneath existing users, so
    // the cache version is pinned. Bump it deliberately (and here) whenever
    // the shell list changes, so a stale cache is invalidated rather than
    // silently leaving new routes unavailable offline.
    expect(sw).toContain('const CACHE_VERSION = "revise-v6"');
    expect(read("public/manifest.webmanifest")).toContain('"start_url": "/"');
    expect(read("public/manifest.webmanifest")).toContain('"scope": "/"');
  });
});

describe("metadata honesty", () => {
  it("describes the flagship scope rather than every registered board", () => {
    expect(layout).toContain("export const metadata: Metadata");
    expect(layout).toMatch(/authored to their specification/);
    expect(layout).toMatch(/everything else is labelled reference material/);
    expect(layout).toContain("openGraph:");
    expect(layout).toContain("twitter:");
    expect(layout).toContain('alternates: { canonical: "/" }');
  });

  it("keeps the PWA and accessibility fields that are pinned elsewhere", () => {
    expect(layout).toContain('lang="en-GB"');
    expect(layout).toContain('manifest: "/manifest.webmanifest"');
    expect(layout).toContain("THEME_BOOTSTRAP");
    expect(layout).toMatch(/viewportFit: "cover"/);
  });

  it("uses a deploy-time origin rather than a request header for canonicals", () => {
    // A Host-derived canonical can be pointed at a spoofed origin.
    expect(layout).toContain("NEXT_PUBLIC_SITE_URL");
    expect(layout).not.toMatch(/headers\(\)/);
  });
});

describe("the marketing site no longer overclaims", () => {
  const site = read("revise-site/index.html");

  it("drops the board-wide claim in favour of the flagship position", () => {
    expect(site).not.toContain("2,216 spec statements");
    expect(site).not.toContain("every spec statement across WJEC, AQA, Edexcel and OCR");
    expect(site).toContain("417");
    expect(site).toContain("WJEC A-level spec statements");
  });

  it("publishes the unreviewed position in the headline stats", () => {
    expect(site).toMatch(/0<\/b><span>questions human-reviewed/);
    expect(site).toMatch(/cannot yet certify|cannot yet prove/i);
  });
});