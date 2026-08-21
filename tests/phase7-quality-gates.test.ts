import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const root = process.cwd();

describe("Phase 7 — E2E harness", () => {
  it("playwright.config.ts exists and pins baseURL + webServer build→start", () => {
    const p = join(root, "playwright.config.ts");
    expect(existsSync(p), "playwright.config.ts missing").toBe(true);
    const src = readFileSync(p, "utf8");
    expect(src).toContain("playwright/test");
    expect(src).toContain("webServer");
    expect(src).toContain("build");
    expect(src).toContain("start");
    expect(src).toContain("baseURL");
  });
  it("offline.spec.ts covers onboarding→review→practice + offline banner + keyboard", () => {
    const src = readFileSync(join(root, "e2e/offline.spec.ts"), "utf8");
    expect(src).toContain("offline walk");
    expect(src).toContain("skip-link");
    expect(src).toContain("Offline — everything still works");
    expect(src).toContain('toBeFocused');
    expect(src).toContain("setOffline");
  });
  it("visual.spec.ts is composable and documents update contract", () => {
    const src = readFileSync(join(root, "e2e/visual.spec.ts"), "utf8");
    expect(src).toContain("toHaveScreenshot");
    expect(src).toContain("--update-snapshots");
  });
  it("e2e README documents running + CI fallback + snapshot contract", () => {
    const md = readFileSync(join(root, "e2e/README.md"), "utf8");
    expect(md).toContain("Offline walk");
    expect(md).toContain("playwright install");
    expect(md).toContain("CI");
    expect(md).toContain("__screenshots__");
  });
  it("CI workflow runs Playwright conditionally and uploads artefacts", () => {
    const yml = readFileSync(join(root, "../../.github/workflows/revise.yml"), "utf8");
    expect(yml).toContain("Playwright E2E");
    expect(yml).toContain("@playwright/test");
    expect(yml).toContain("upload-artifact");
    expect(yml).toContain("playwright-report");
  });
  it("package.json exposes test:e2e scripts", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.scripts["test:e2e"]).toContain("playwright");
    expect(pkg.scripts["test:e2e:ci"]).toContain("playwright");
  });
});

describe("Phase 7 — perf budgets + Lighthouse/PWA fences", () => {
  it("perf.test.ts pins Lighthouse header contract and PWA precache", () => {
    const src = readFileSync(join(root, "tests/perf.test.ts"), "utf8");
    expect(src).toContain("Lighthouse/PWA guard");
    expect(src).toContain("immutable");
    expect(src).toContain("APP_SHELL");
    expect(src).toContain("skipWaiting");
  });
  it("next.config.ts pins _next/static immutable + /api no-store + sw no-cache", () => {
    const src = readFileSync(join(root, "next.config.ts"), "utf8");
    expect(src).toContain("/_next/static");
    expect(src).toContain("immutable");
    expect(src).toContain('/api/');
    expect(src).toContain("no-store");
    expect(src).toContain("/sw.js");
  });
});

describe("Phase 7 — WCAG hardening", () => {
  it("globals.css exposes .sr-only for visually-hidden labels", () => {
    const src = readFileSync(join(root, "src/app/globals.css"), "utf8");
    expect(src).toContain(".sr-only");
    expect(src).toContain("clip: rect");
  });
  it("AppShell: aside aria-label + banner role + offline live region", () => {
    const src = readFileSync(join(root, "src/components/AppShell.tsx"), "utf8");
    expect(src).toContain('aria-label="Primary"');
    expect(src).toContain('role="banner"');
    expect(src).toContain('role="status"');
    expect(src).toContain('aria-live="polite"');
  });
  it("SearchOverlay: correct ARIA combobox pattern", () => {
    const src = readFileSync(join(root, "src/components/SearchOverlay.tsx"), "utf8");
    expect(src).toContain('aria-activedescendant');
    expect(src).toContain('aria-controls="search-results"');
    expect(src).toContain('role="listbox"');
    expect(src).toContain('role="option"');
  });
});

describe("Phase 7 — i18n scaffolding", () => {
  it("i18n: detectLocale + t + missingKeys contract is sound", async () => {
    const m = await import("@/domain/i18n");
    expect(m.detectLocale(["cy", "en-GB"])).toBe("cy");
    expect(m.detectLocale(["fr-FR"])).toBe("fr");
    expect(m.detectLocale(["xx"], "en-GB")).toBe("en-GB");
    expect(m.t("en-GB", "nav.today")).toBe("Today");
    expect(m.t("cy", "nav.today")).toBe("Heddiw");
    expect(m.t("cy", "search.empty", { query: "moles" })).toContain("moles");
    expect(m.t("en-GB" as never, "not.a.key")).toBe("not.a.key");
    expect(m.missingKeys("cy")).toEqual([]);
    expect(m.extraKeys("cy")).toEqual([]);
    expect(m.isSupportedLocale("en-GB")).toBe(true);
    expect(m.isSupportedLocale("xx")).toBe(false);
    expect(m.formatDateLocale("2026-01-01", "en-GB")).toBeTruthy();
    expect(m.formatNumberLocale(1234.5, "en-GB")).toBeTruthy();
  });
  it("every locale dictionary has the same key set as en-GB", async () => {
    const m = await import("@/domain/i18n");
    for (const locale of m.SUPPORTED_LOCALES) {
      expect(m.missingKeys(locale as never), `${locale} missing keys`).toEqual([]);
    }
  });
});

describe("Phase 7 — onboarding funnel", () => {
  it("onboarding domain: completion rate + drop-off + activation wiring", async () => {
    const o = await import("@/domain/onboarding");
    const empty = o.emptyOnboardingProgress();
    expect(o.onboardingCompletionRate(empty)).toBe(0);
    expect(o.onboardingDropOffStep(empty)).toBe("you");
    const partial = { ...empty, completedStep: 1, reachedStep: 1 };
    expect(o.onboardingCompletionRate(partial)).toBe(0.5);
    expect(o.onboardingDropOffStep(partial)).toBe("exams");
    const done = { ...empty, completed: true, completedStep: 3, reachedStep: 3, skipped: false, startedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:05:00.000Z", stepDurationsMs: { you: 1000, subjects: 1000, exams: 1000, time: 1000 } };
    expect(o.onboardingCompletionRate(done)).toBe(1);
    expect(o.onboardingDropOffStep(done)).toBeNull();
  });
  it("deriveActivation + isActivated + summariseFunnel are coherent", async () => {
    const o = await import("@/domain/onboarding");
    const act = o.deriveActivation({
      onboardingCompletedAt: "2026-01-01T10:00:00.000Z",
      reviewLogs: [{ reviewedAt: "2026-01-01T11:00:00.000Z" }],
      attempts: [{ createdAt: "2026-01-01T12:00:00.000Z" }],
      plannedSessions: [
        { status: "done", completedAt: "2026-01-01T13:00:00.000Z" },
        { status: "pending" },
      ],
    });
    expect(o.isActivated(act)).toBe(true);
    expect(act.timeToActivationMs).toBe(60 * 60 * 1000);
    expect(act.signals).toContain("reviewed-card");
    expect(act.signals).toContain("answered-question");
    const empty2 = o.deriveActivation({ onboardingCompletedAt: null, reviewLogs: [], attempts: [], plannedSessions: [] });
    expect(o.isActivated(empty2)).toBe(false);
    expect(empty2.timeToActivationMs).toBeNull();
    const summary = o.summariseFunnel([
      { progress: { ...o.emptyOnboardingProgress(), completed: true, completedStep: 3, reachedStep: 3 }, activation: act },
      { progress: { ...o.emptyOnboardingProgress(), skipped: true }, activation: empty2 },
    ]);
    expect(summary.totalStarted).toBe(2);
    expect(summary.completionRate).toBe(0.5);
    expect(summary.skipRate).toBe(0.5);
    expect(summary.activationRate).toBe(0.5);
  });
});
