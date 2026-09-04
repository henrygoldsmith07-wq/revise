import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("PhaseEntryNotice — Today wiring", () => {
  const page = () => src("src/app/page.tsx");

  it("sits above the countdown banner in every Today content path", () => {
    const source = page();
    expect(source).toContain('import { PhaseEntryNotice } from "@/components/PhaseEntryNotice";');
    const mounts = source.split("<PhaseEntryNotice />").length - 1;
    expect(mounts).toBeGreaterThanOrEqual(3);
    // The notice must lead, never trail, the countdown banner it announces.
    const banner = source.split("<CountdownPhaseBanner />").length - 1;
    expect(mounts).toBeGreaterThanOrEqual(banner);
  });

  it("re-evaluates phase entries when the store is ready and after snapshot changes", () => {
    const source = page();
    expect(source).toContain("refreshPhaseNotices");
    expect(source).toContain("if (!store.ready) return;");
    expect(source).toContain("void refreshPhaseNotices();");
  });
});

describe("PhaseEntryNotice component", () => {
  const component = () => src("src/components/PhaseEntryNotice.tsx");

  it("renders nothing when no notice is pending", () => {
    expect(component()).toContain("if (!notice) return null;");
  });

  it("reads the notice from the store and renders its title, body and a Schedule link", () => {
    const source = component();
    expect(source).toContain("store.examPhaseNotice");
    expect(source).toContain('aria-label="Exam phase notice"');
    expect(source).toContain("{notice.title}");
    expect(source).toContain("{notice.body}");
    expect(source).toContain('href="/schedule"');
  });

  it("offers a dismiss action wired to the store", () => {
    const source = component();
    expect(source).toContain("dismissExamPhaseNotice");
    expect(source).toContain('aria-label="Dismiss this notice"');
  });
});

describe("Exam countdown — Settings wiring", () => {
  const settings = () => src("src/app/settings/page.tsx");

  it("offers the one-time notification toggle under an Exam countdown section", () => {
    const source = settings();
    expect(source).toContain('title="Exam countdown"');
    expect(source).toContain("examNotifications");
    expect(source).toContain("14 days from an exam");
    expect(source).toContain("Never repeats for the same run-up.");
  });

  it("requests notification permission when the toggle is switched on", () => {
    const source = settings();
    expect(source).toContain("Notification.permission === \"default\"");
    expect(source).toContain("window.Notification.requestPermission()");
  });
});
