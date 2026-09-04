import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { REVIEW_SECONDS_PER_CARD, sizeDueSession } from "@/domain/session-structure";

const page = () => readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
const recommendation = () => readFileSync(join(process.cwd(), "src/components/RecommendationCard.tsx"), "utf8");

describe("Today screen — 15–25 minutes of due cards, then stop", () => {
  it("leads with a bounded due-card review session, not a curriculum dashboard", () => {
    const source = page();
    expect(source).toContain("TodayReviewSession");
    expect(source).toContain("Today&apos;s review");
    expect(source).toContain("sizeDueSession");
    expect(source).toContain("Start review →");
    expect(source).toContain("the queue will still be here tomorrow");
  });

  it("the session never shows spec-point scale or an after-this queue", () => {
    const source = page();
    expect(source).not.toContain("After this:");
    expect(source).not.toContain("Then:");
    expect(source).not.toContain("Quick stats");
    // A single call to action on the due path — a dashboard has many.
    const startButtons = source.match(/Start review →/g) ?? [];
    expect(startButtons.length).toBe(1);
  });

  it("sizes the session from the due count, capped to the session-length target", () => {
    expect(sizeDueSession(0).cards).toBe(0);
    // 20 minutes at 24 s/card ≈ 50 cards.
    const full = sizeDueSession(259);
    expect(full.cards).toBe(50);
    expect(full.minutes).toBe(20);
    expect(full.capped).toBe(true);
    expect(full.totalDue).toBe(259);
    // A light day is a light session — never inflated to fill the target.
    const light = sizeDueSession(6);
    expect(light.cards).toBe(6);
    expect(light.capped).toBe(false);
    expect(light.minutes).toBeGreaterThanOrEqual(1);
  });

  it("respects a custom session length target", () => {
    const short = sizeDueSession(500, { targetMinutes: 15 });
    expect(short.minutes).toBeLessThanOrEqual(16);
    const long = sizeDueSession(500, { targetMinutes: 25 });
    expect(long.cards).toBeGreaterThan(short.cards);
  });

  it("every cap matches the /review route's own queue arithmetic", () => {
    // /review builds max(10, ceil(sessionMinutes * 2.5)) cards; at 24 s/card
    // that is the same ~2.5 cards/minute this page promises.
    expect(REVIEW_SECONDS_PER_CARD).toBe(24);
    for (const minutes of [15, 20, 25]) {
      const s = sizeDueSession(10_000, { targetMinutes: minutes });
      expect(s.minutes).toBeLessThanOrEqual(minutes + 1);
    }
  });

  it("falls back to the next best task only when nothing is due", () => {
    const source = page();
    expect(source).toContain("Nothing due right now");
    expect(source).toContain("NextBestAction");
    expect(source).toContain("Your next");
    // The recommendation path is the fallback, not the hero.
    const dueBranch = source.indexOf("dueCount > 0");
    const recBranch = source.indexOf("Nothing due right now");
    expect(dueBranch).toBeGreaterThan(-1);
    expect(recBranch).toBeGreaterThan(dueBranch);
  });

  it("shows the resume card instead of a fresh session when one was interrupted", () => {
    const source = page();
    // The due branch renders the resume card when a checkpoint exists and a
    // fresh TodayReviewSession otherwise — exactly one call to action either way.
    expect(source).toContain("revisionCheckpoint ? (");
    expect(source).toContain("ResumeRevisionCard");
    expect(source).toContain("TodayReviewSession");
  });

  it("does not compete with secondary cards or scoring detail on Today", () => {
    const source = page();
    expect(source).not.toContain("ExpectedMarksCard");
    expect(source).not.toContain('title="Other options"');
    expect(source).not.toContain("Need less time?");
  });
});

describe("Today recommendation fallback details", () => {
  it("explains the recommendation in plain English before exposing scoring detail", () => {
    const src = recommendation();
    expect(src).toContain("Why this?");
    expect(src).toContain("Show scoring detail");
    expect(src).toContain("The rank weighs expected marks, exam timing, weakness, fading recall and evidence depth");
    expect(src).toContain("limited marked evidence");
  });
});
