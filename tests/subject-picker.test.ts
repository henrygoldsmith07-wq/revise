import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const picker = read("src/components/SubjectPicker.tsx");

describe("subject picker UI", () => {
  it("uses accessible pressed card controls with a compact variant", () => {
    expect(picker).toContain('role="group"');
    expect(picker).toContain("aria-pressed={selected}");
    expect(picker).toContain('selectionMode = "multiple"');
    expect(picker).toContain('density = "comfortable"');
    expect(picker).toContain("selected ? <CreditedIcon");
    expect(picker).toContain("grid-cols-2 sm:grid-cols-3");
  });

  it("keeps multi-select and single-select behavior in one component", () => {
    expect(picker).toContain("onChange([id])");
    expect(picker).toContain("selectedIds.filter((selected) => selected !== id)");
    expect(picker).toContain("[...selectedIds, id]");
  });

  it("uses the picker on onboarding, Lessons and Study", () => {
    const onboarding = read("src/components/Onboarding.tsx");
    const lessons = read("src/app/lesson/page.tsx");
    const study = read("src/app/study/page.tsx");
    expect(onboarding).toContain("<SubjectPicker");
    expect(onboarding).toContain('ariaLabel={`${row.level} subjects`}');
    expect(lessons).toContain("<SubjectPicker");
    expect(lessons).toContain('ariaLabel="Lesson subject"');
    expect(study).toContain("<SubjectPicker");
    expect(study).toContain('ariaLabel="Subject"');
  });

  it("gives onboarding a live selection summary and clear action", () => {
    const onboarding = read("src/components/Onboarding.tsx");
    expect(onboarding).toContain("selected");
    expect(onboarding).toContain('aria-label="Selected subjects"');
    expect(onboarding).toContain("Clear all");
    expect(onboarding).toContain("setSubjectIds([])");
  });

  it("offers an unverified preview instead of quietly listing unverified subjects", () => {
    const onboarding = read("src/components/Onboarding.tsx");
    // Reference-tier subjects reuse another board's outline without having been
    // checked against this board's spec, so they sit behind an explicit choice
    // rather than in the main list next to a disclaimer.
    expect(onboarding).toMatch(/unverified preview/i);
    expect(onboarding).toContain("setShowReference(true)");
    // Both tiers still exist: nothing was dropped, only ordered behind a choice.
    expect(onboarding).toContain("referenceRows");
    expect(onboarding).toContain("flagshipRows");
    // The flagship list keeps its own accessible name, and the preview is distinct.
    expect(onboarding).toContain("ariaLabel={`${row.level} subjects`}");
    expect(onboarding).toContain("ariaLabel={`${row.level} unverified preview subjects`}");
  });
});
