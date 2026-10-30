import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { constantsSheetFor } from "@/content/booklets/constants";
import { pastPaperIndexFor } from "@/content/past-papers";
import { teachingFor } from "@/content/teaching";
import { renderMarkdown } from "@/lib/md/registry";
import { definitionPoints, PHYSICS_GUIDE_PATHS, physicsGuide, superscriptPowers } from "@/lib/physics-guides";
import { absoluteUrl, SITE } from "@/lib/site";
import { renderStaticHtml } from "@/lib/static-page";

// The public WJEC Physics guides are the pages search engines index, so they
// carry the same honesty rules as /welcome: built from the app's own data,
// no question text, no hidden answers and no claim the trust position cannot back.

const html = (path: (typeof PHYSICS_GUIDE_PATHS)[number]) => renderStaticHtml(physicsGuide(path));
const index = pastPaperIndexFor("wjec-alevel-physics")!;

describe("WJEC Physics guide pages", () => {
  it.each(PHYSICS_GUIDE_PATHS)("%s is an indexable, script-free page with a canonical and a twin", (path) => {
    const page = html(path);
    expect(page).toContain('<meta name="robots" content="index, follow">');
    expect(page).toContain(`<link rel="canonical" href="${absoluteUrl(path)}">`);
    expect(page).toContain(`<link rel="alternate" type="text/markdown" href="${absoluteUrl(`${path}.md`)}">`);
    expect(page).not.toContain("<script");
    expect(page).not.toMatch(/\son[a-z]+=/);
    expect(page.endsWith("</html>")).toBe(true);
    expect(physicsGuide(path).title.length).toBeLessThanOrEqual(60);
  });

  it.each(PHYSICS_GUIDE_PATHS)("%s is served by a static route handler", (path) => {
    const source = readFileSync(`src/app${path}/route.ts`, "utf8");
    expect(source).toContain("export async function GET()");
    expect(source).toContain(`physicsGuide("${path}")`);
  });

  it.each(PHYSICS_GUIDE_PATHS)("%s says the same things in its markdown twin", (path) => {
    const text = renderMarkdown(path)!.text;
    for (const block of physicsGuide(path).blocks) expect(text).toContain(block.heading);
    expect(text).toContain(`Canonical: ${absoluteUrl(path)}`);
  });

  it.each(PHYSICS_GUIDE_PATHS)("%s makes no claim the trust position cannot back", (path) => {
    const page = html(path);
    expect(page).not.toMatch(/\bproven\b|guarantee|boost|improves? (your )?grades?/i);
    // The curriculum's spec refs follow the app's grouping, not WJEC's numbering.
    expect(page).not.toMatch(/Unit \d\.\d\(/);
  });

  it("states the trust position on the hub", () => {
    expect(html("/wjec-a-level-physics")).toContain(SITE.trustPosition);
  });

  it("links every indexed paper and every question, and reproduces no WJEC text", () => {
    const page = html("/wjec-a-level-physics/past-papers");
    for (const paper of index.papers) {
      expect(page).toContain(paper.markSchemeUrl);
      if (paper.paperUrl) expect(page).toContain(paper.paperUrl);
      for (const question of paper.questions) expect(page).toContain(`${paper.year} Unit ${paper.unit} Q${question.number}`);
    }
    expect(page).toContain("No WJEC question or mark-scheme text is reproduced here");
  });

  it("lists units only from the past-paper index", () => {
    const units = new Set(index.papers.map((paper) => paper.unit));
    const hub = physicsGuide("/wjec-a-level-physics");
    const table = hub.blocks.find((block) => block.table)!.table!;
    for (const row of table.rows) {
      for (const unit of row[4].split(", ").filter(Boolean)) expect(units.has(Number(unit))).toBe(true);
    }
  });

  it("writes out every definition point, without the lesson's hidden answers", () => {
    const points = definitionPoints();
    expect(points.length).toBeGreaterThan(0);
    const page = html("/wjec-a-level-physics/definitions");
    const text = renderMarkdown("/wjec-a-level-physics/definitions")!.text;
    for (const { point } of points) {
      expect(point.text).toMatch(/^(define|state)\b/i);
      const teaching = teachingFor(point.id)!;
      expect(text).toContain(teaching.explain[0]);
      expect(page).toContain(`checkpoint=${point.id}`);
      for (const hidden of [teaching.check.explanation, teaching.apply.modelAnswer, teaching.trap?.right]) {
        if (hidden) expect(text).not.toContain(hidden);
      }
    }
    expect(page).toContain("not yet teacher-reviewed");
  });

  it("lists every constant on the reference sheet and points to WJEC's own booklet", () => {
    const page = html("/wjec-a-level-physics/data-booklet");
    for (const constant of constantsSheetFor("wjec-alevel-physics")!.constants) {
      expect(page).toContain(constant.name);
      expect(page).toContain(superscriptPowers(constant.value));
    }
    expect(page).toContain("This is not WJEC&#39;s booklet".replace("&#39;", "'"));
    expect(page).toContain("https://www.wjec.co.uk/qualifications/physics-as-a-level/");
  });

  it("writes powers as superscripts", () => {
    expect(superscriptPowers("1.602176634 × 10^-19")).toBe("1.602176634 × 10⁻¹⁹");
    expect(superscriptPowers("J K^-1 mol^-1")).toBe("J K⁻¹ mol⁻¹");
  });

  it("is in the sitemap", () => {
    const urls = sitemap().map((entry) => entry.url);
    for (const path of PHYSICS_GUIDE_PATHS) expect(urls).toContain(absoluteUrl(path));
  });
});
