import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { bandForMarks, buildQerLevelView, isQerPart } from "@/domain/qer-levels";
import { QerLevelCard } from "@/components/QerLevelCard";
import type { MarkedPart, Question, QuestionPart } from "@/domain/types";

const part = { id: "q:a", label: "", prompt: "Explain how temperature affects enzyme activity.", marks: 6, markScheme: ["a"], modelAnswer: "m" } as QuestionPart;
const question = { id: "q", kind: "extended", stem: "Enzymes.", parts: [part] } as unknown as Question;
const marked = (awarded: number, missed: string[] = []): MarkedPart => ({ partId: "q:a", awarded, max: 6, creditedPoints: [], missedPoints: missed, comment: "" });
const linked = "Heat gives more kinetic energy, which means more collisions, so the rate rises. Above the optimum hydrogen bonds break because the enzyme denatures, therefore activity falls.";

describe("QER level of response", () => {
  it("maps marks to the 1-2, 3-4, 5-6 bands", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((m) => bandForMarks(m).level)).toEqual([0, 1, 1, 2, 2, 3, 3]);
    expect(bandForMarks(4.5).level).toBe(2);
  });
  it("only applies to 6-mark written parts", () => {
    expect(isQerPart({ kind: "extended" }, { marks: 6 })).toBe(true);
    expect(isQerPart({ kind: "extended" }, { marks: 4 })).toBe(false);
    expect(isQerPart({ kind: "mcq" }, { marks: 6 })).toBe(false);
    expect(buildQerLevelView({ question, part: { ...part, marks: 4 }, marked: { ...marked(2), max: 4 }, answer: "x" })).toBeNull();
  });
  it("says how far the next level is and which missed points to add", () => {
    const view = buildQerLevelView({ question, part, marked: marked(2, ["denaturation", "optimum", "collisions"]), answer: linked })!;
    expect(view.level).toBe(1);
    expect(view.marksToNextLevel).toBe(1);
    expect(view.nextLevelPoints).toEqual(["denaturation"]);
    const low = buildQerLevelView({ question, part, marked: marked(0, ["a", "b"]), answer: "" })!;
    expect(low).toMatchObject({ level: 0, marksToNextLevel: 1, nextLevelPoints: ["a"] });
    expect(low.summary).toMatch(/reaches level 1/);
  });
  it("top band has no next level and flags unlinked full-band content without changing marks", () => {
    const view = buildQerLevelView({ question, part, marked: marked(6), answer: "Enzymes are proteins. Heat. Active sites. Optimum. Denature. Substrates." })!;
    expect(view.marksToNextLevel).toBeNull();
    expect(view.awarded).toBe(6);
    expect(view.presentationRisk).toBe(true);
    const ok = buildQerLevelView({ question, part, marked: marked(5), answer: linked })!;
    expect(ok.presentationRisk).toBe(false);
    expect(ok.summary).toMatch(/1 mark short/);
  });
  it("renders the band and next-level points, and nothing for other sizes", () => {
    const html = renderToStaticMarkup(createElement(QerLevelCard, {question: question, part: part, marked: marked(3, ["optimum temperature"]), answer: linked}));
    expect(html).toContain("Level 2 of 3");
    expect(html).toContain("optimum temperature");
    expect(html).toContain("never change your mark");
    expect(renderToStaticMarkup(createElement(QerLevelCard, {question: question, part: { ...part, marks: 4 }, marked: { ...marked(3), max: 4 }, answer: "x" }))).toBe("");
  });
});
