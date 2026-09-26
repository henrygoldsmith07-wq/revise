import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { REVIEW_SECONDS_PER_CARD, sizeDueSession } from "@/domain/session-structure";

const page = () => readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
const hero = () => readFileSync(join(process.cwd(), "src/components/AdaptiveSessionHero.tsx"), "utf8");
const recommendation = () => readFileSync(join(process.cwd(), "src/components/RecommendationCard.tsx"), "utf8");

describe("Today screen — one dominant next action (decision engine)", () => {
  it("leads with the single adaptive plan, not a dashboard or due fork", () => {
    const source = page();
    expect(source).toContain("adaptiveSession");
    expect(source).toContain("AdaptiveSessionHero");
    expect(source).toContain("one recommended session");
    // No competing decision branches: the optimiser already traded off
    // FSRS pressure, mastery, mistakes, exam timing and capability gaps.
    expect(source).not.toContain("dueCount > 0");
    expect(source).not.toContain("TodayReviewSession");
    expect(source).not.toContain("NextBestAction");
    expect(source).not.toContain("legacyTodayBranch");
  });

  it("the hero states what to do, why, and starts within one tap", () => {
    const source = hero();
    expect(source).toContain("Your next session is ready");
    expect(source).toContain("session.reason");
    expect(source).toContain("session.startHref");
    expect(source).toContain("Start session");
    expect(source).toContain("Why this session?");
  });

  it("the session never shows spec-point scale or an after-this queue", () => {
    const source = page();
    expect(source).not.toContain("After this:");
    expect(source).not.toContain("Then:");
    expect(source).not.toContain("Quick stats");
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

  it("shows the resume card instead of a fresh session when one was interrupted", () => {
    const source = page();
    expect(source).toContain("revisionCheckpoint ? (");
    expect(source).toContain("ResumeRevisionCard");
    expect(source).toContain("AdaptiveSessionHero");
  });

  it("does not compete with secondary cards or scoring detail on Today", () => {
    const source = page();
    expect(source).not.toContain("ExpectedMarksCard");
    expect(source).not.toContain('title="Other options"');
    expect(source).not.toContain("Need less time?");
  });

  it("keeps the roadmap available as a compact continuation path", () => {
    const source = page();
    expect(source).toContain("TodayRoadmap");
    expect(source).toContain("preferredSubjectId");
    expect(source).toContain('import("@/components/TodayRoadmap")');
    expect(source).toContain("TodayRoadmapLoading");
  });

  it("keeps secondary context collapsed so the hero dominates", () => {
    const source = page();
    expect(source).toContain("Plan, pace and outlook");
    expect(source).toContain("<details");
    // The hero (or resume) renders before the collapsed section.
    expect(source.indexOf("AdaptiveSessionHero")).toBeLessThan(source.indexOf("Plan, pace and outlook"));
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
