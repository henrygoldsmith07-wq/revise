import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConstantsSheet } from "@/components/ConstantsSheet";
import { constantsSheetFor } from "@/content/booklets/constants";

const render = (subjectId: string) => renderToStaticMarkup(createElement(ConstantsSheet, { subjectId }));

describe("constants reference sheet", () => {
  it("has sheets for WJEC Physics and Chemistry only", () => {
    expect(constantsSheetFor("wjec-alevel-physics")?.constants.map((c) => c.id)).toContain("h");
    expect(constantsSheetFor("wjec-alevel-chemistry")?.constants.map((c) => c.id)).toContain("F");
    expect(constantsSheetFor("wjec-alevel-maths")).toBeNull();
    expect(constantsSheetFor("wjec-alevel-biology")).toBeNull();
  });
  it("gives exact SI-defined values", () => {
    const sheet = constantsSheetFor("wjec-alevel-physics")!;
    const value = (id: string) => sheet.constants.find((c) => c.id === id)!.value;
    expect(value("h")).toBe("6.62607015 × 10^-34");
    expect(value("NA")).toBe("6.02214076 × 10^23");
    expect(value("c")).toBe("2.99792458 × 10^8");
  });
  it("renders as a keyboard-operable disclosure with the source note", () => {
    const html = render("wjec-alevel-physics");
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("Data Booklet");
    expect(html).toContain("physics.nist.gov");
  });
  it("renders nothing for Biology", () => {
    expect(render("wjec-alevel-biology")).toBe("");
  });
  it("is wired into practice and exam mode", async () => {
    const { readFileSync } = await import("fs");
    for (const f of ["QuestionRunner", "ExamConditionMode"]) {
      expect(readFileSync(`src/components/${f}.tsx`, "utf8")).toContain("<ConstantsSheet");
    }
  });
});
