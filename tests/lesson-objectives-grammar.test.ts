import { describe, expect, it } from "vitest";
import { buildLessons, buildRoadmapLessons } from "@/content/lessons";
import { topicsFor } from "@/domain/curriculum";

// Thirty-first pass. The 360px walkthrough's lesson (opened from a lost mark)
// promised "Success looks like this: Explain that define capacitance and
// explain factors affecting a parallel-plate capacitor." Spec statements are
// verb phrases, and the objective builder only recognised a short list of
// command words, so 143 of 450 WJEC objectives read "Explain that <verb> …".
// A spec statement that starts with a lower-case verb now becomes
// "Be able to <statement>."

const WJEC = ["wjec-alevel-physics", "wjec-alevel-biology", "wjec-alevel-chemistry", "wjec-alevel-maths"];

function objectivesFor(subjectId: string): string[] {
  const topics = topicsFor(subjectId);
  const lessons = [
    ...buildLessons(topics),
    ...buildRoadmapLessons(topics).map((entry) => (entry as unknown as { lesson?: { learningObjectives?: string[] } }).lesson ?? entry),
  ] as Array<{ learningObjectives?: string[] }>;
  return lessons.flatMap((lesson) => lesson.learningObjectives ?? []);
}

describe("lesson success criteria read as sentences", () => {
  it("no WJEC objective wraps a spec statement in 'Explain that'", () => {
    const problems: string[] = [];
    for (const subjectId of WJEC) {
      const statements = new Set(topicsFor(subjectId).flatMap((t) => (t.specPoints ?? []).map((s) => s.text.trim().replace(/[.!?]+$/, ""))));
      for (const objective of objectivesFor(subjectId)) {
        const wrapped = objective.match(/^Explain that (.*)\.$/)?.[1];
        if (wrapped && [...statements].some((s) => s.charAt(0).toLowerCase() + s.slice(1) === wrapped && /^[a-z]/.test(s))) problems.push(`${subjectId}: ${objective}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("the capacitance lesson from the walkthrough states its target plainly", () => {
    const objectives = objectivesFor("wjec-alevel-physics");
    expect(objectives).toContain("Be able to define capacitance and explain factors affecting a parallel-plate capacitor.");
    expect(objectives.some((o) => o.startsWith("Explain that define"))).toBe(false);
  });

  it("authored key-point sentences keep 'Explain that' (they are claims, not verbs)", () => {
    const objectives = objectivesFor("wjec-alevel-physics");
    expect(objectives.some((o) => /^Explain that capacitance is charge stored/.test(o))).toBe(true);
  });
});
