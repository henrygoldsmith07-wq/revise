import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StudentOnly, TeacherModeToggle, TeacherOnly } from "@/components/TeacherMode";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/** True when every match of `pattern` in `source` sits inside a <TeacherOnly> block or a `teacher ?` branch. */
function onlyInTeacherView(source: string, pattern: RegExp): boolean {
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  for (const match of source.matchAll(global)) {
    const before = source.slice(0, match.index);
    const opened = before.lastIndexOf("<TeacherOnly>");
    const closed = before.lastIndexOf("</TeacherOnly>");
    const inBlock = opened > closed;
    const line = before.slice(before.lastIndexOf("\n", before.length - 1));
    const inBranch = /teacher\s*\?/.test(before.slice(-220)) || /teacher\s*\?/.test(line);
    if (!inBlock && !inBranch) return false;
  }
  return true;
}

describe("Focus Mode (default) vs Teacher view", () => {
  it("renders the student version by default, on the server and first paint", () => {
    expect(renderToStaticMarkup(createElement(StudentOnly, null, "plain"))).toBe("plain");
    expect(renderToStaticMarkup(createElement(TeacherOnly, null, "Wilson 95%"))).toBe("");
  });

  it("exposes the switch accessibly", () => {
    const html = renderToStaticMarkup(createElement(TeacherModeToggle));
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain("Focus Mode");
  });

  it("keeps Wilson intervals, weighted trials and n= behind Teacher view in the assessment panels", () => {
    const mastery = read("src/components/assessment/mastery-panels.tsx");
    expect(onlyInTeacherView(mastery, /Wilson|95%|weighted trials|\bn=\{|\bn=\$|FSRS/)).toBe(true);
    expect(mastery).toContain("plainEvidenceLine(");
    const questions = read("src/components/assessment/question-panels.tsx");
    expect(onlyInTeacherView(questions, /\bn=<|\br=\{/)).toBe(true);
    const simulation = read("src/components/assessment/simulation-panels.tsx");
    expect(onlyInTeacherView(simulation, /slope \{|MAE \{|bias \{/)).toBe(true);
  });

  it("keeps readiness weights and interval coverage behind Teacher view on Progress", () => {
    const page = read("src/app/readiness/page.tsx");
    expect(page).toContain("<TeacherModeToggle />");
    expect(onlyInTeacherView(page, /\(30%\)/)).toBe(true);
    const grade = read("src/components/GradePredictionRealityPanel.tsx");
    expect(onlyInTeacherView(grade, /prediction interval coverage/)).toBe(true);
  });
});
