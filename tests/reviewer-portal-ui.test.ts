import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Source-level accessibility and efficiency contract for the reviewer portal
// (WCAG AA intent: labelled controls, live regions, managed focus, keyboard
// parity), in the same style as tests/a11y.test.ts.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const form = read("src/components/reviewer/ReviewDecisionForm.tsx");
const page = read("src/app/(reviewer)/reviewer/review/[questionId]/page.tsx");
const queue = read("src/app/(reviewer)/reviewer/page.tsx");

describe("reviewer portal accessibility", () => {
  it("binds A / R / J / 1–6 through the shared shortcut registry so ? lists them", () => {
    expect(form).toContain("useShortcuts(");
    expect(form).toContain('key: "a", group: "Review", label: "Approve"');
    expect(form).toContain('key: "r", group: "Review", label: "Request changes"');
    expect(form).toContain('key: "j"');
    expect(form).toContain("key: String(index + 1)");
    expect(form).toContain('aria-keyshortcuts="A"');
    expect(form).toContain('aria-keyshortcuts="R"');
  });

  it("announces status and errors and moves focus deliberately", () => {
    expect(form).toContain('role="alert"');
    expect(form).toContain('aria-live="polite"');
    expect(form).toContain("errorRef.current?.focus()");
    expect(form).toContain('document.getElementById("review-title")?.focus()');
    expect(page).toContain('id="review-title" tabIndex={-1}');
    // An incomplete approval sends focus to the first unticked check.
    expect(form).toContain("checkRefs.current[gap]?.focus()");
  });

  it("labels every control and groups the six checks", () => {
    expect(form).toContain("<fieldset");
    expect(form).toContain("<legend");
    expect(form).toContain('htmlFor="review-comment"');
    expect(queue).toContain('<th scope="col"');
    expect(queue).toContain("<caption");
    expect(queue).toContain('aria-current={entry.subjectId === subject.subjectId ? "page" : undefined}');
  });

  it("keeps shortcuts live on checkboxes but never while typing a comment", () => {
    const shortcuts = read("src/components/shortcuts.tsx");
    expect(shortcuts).toContain('["checkbox", "radio", "button", "submit", "reset"].includes(target.type)');
    expect(shortcuts).toContain('["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)');
  });

  it("uses Le Studio tokens only — no new UI library", () => {
    for (const source of [form, page, queue]) {
      expect(source).not.toMatch(/from "(@radix-ui|@headlessui|@mui|antd|@chakra-ui)/);
      expect(source).not.toMatch(/#[0-9a-f]{6}\b/i);
    }
  });

  it("shows stem, mark scheme, spec points and provenance on one screen", () => {
    expect(page).toContain("Mark scheme");
    expect(page).toContain("Specification points");
    expect(page).toContain("Provenance");
    expect(page).toContain("question.stem");
  });

  it("puts the evidence for the capability-mapping and worked-solution checks on screen", () => {
    // Check 4 "Skills mapped right" must show the skill mapping; check 3
    // "Worked answer right" must not hide behind a collapsed toggle.
    expect(page).toContain("capability mapping");
    expect(page).toContain("part.capabilityIds");
    expect(page).toContain("part.learningClaims");
    expect(page).toContain("part.aoCodes");
    expect(page).toContain('<details className="mt-2" open>');
    expect(page).toContain(">Worked answer</summary>");
  });
});
