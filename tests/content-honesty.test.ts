import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { allSubjects, topicsFor } from "@/domain/curriculum";
import { FLAGSHIP_SUBJECTS, isFlagship } from "@/domain/flagship";
import { defaultSettings } from "@/data/repository";
import { REFERENCE_DISCLAIMER } from "@/domain/curriculum/honesty";

describe("content honesty — flagship vs reference", () => {
  it("marks exactly the four WJEC A-level flagships as flagship", () => {
    const flagships = allSubjects().filter((s) => s.contentTier === "flagship");
    expect(flagships.map((s) => s.id).sort()).toEqual([...FLAGSHIP_SUBJECTS.map((f) => f.subjectId)].sort());
    for (const subject of allSubjects()) {
      if (isFlagship(subject.id)) {
        expect(subject.contentTier).toBe("flagship");
        expect(subject.contentDisclaimer).toBeUndefined();
      } else {
        expect(subject.contentTier).toBe("reference");
        expect(subject.contentDisclaimer).toBe(REFERENCE_DISCLAIMER);
      }
    }
  });

  it("downgrades cloned subjects so they cannot look spec-checked", () => {
    for (const subject of allSubjects().filter((s) => s.contentTier === "reference")) {
      for (const topic of topicsFor(subject.id)) {
        expect(topic.verification, topic.id).toBe("unverified");
        if (!subject.id.startsWith("wjec-")) {
          expect(topic.reviewer ?? "", topic.id).not.toMatch(/WJEC/i);
          for (const sp of topic.specPoints ?? []) {
            expect(sp.verification, sp.id).toBe("unverified");
            expect(sp.reviewer ?? "", sp.id).not.toMatch(/WJEC/i);
          }
        }
      }
    }
  });

  it("leaves flagship verification intact", () => {
    const physics = topicsFor("wjec-alevel-physics");
    expect(physics.some((t) => t.verification === "checked")).toBe(true);
  });

  it("replaces cloned GCSE papers with the spec-manifest structure", () => {
    const aqaBio = allSubjects().find((s) => s.id === "aqa-gcse-biology");
    expect(aqaBio?.papers).toHaveLength(2);
    expect(aqaBio?.papers.every((p) => p.durationMinutes === 105)).toBe(true);
    expect(aqaBio?.papers.reduce((a, p) => a + p.weight, 0)).toBeCloseTo(1, 5);

    const aqaMaths = allSubjects().find((s) => s.id === "aqa-gcse-maths");
    expect(aqaMaths?.papers).toHaveLength(3);
    expect(aqaMaths?.papers.every((p) => p.durationMinutes === 90)).toBe(true);
    expect(aqaMaths?.papers[0].calculatorAllowed).toBe(false);
    expect(aqaMaths?.papers[0].name).toMatch(/non-calculator/i);
    expect(aqaMaths?.papers[1].calculatorAllowed).toBe(true);

    const edexcelMaths = allSubjects().find((s) => s.id === "edexcel-gcse-maths");
    expect(edexcelMaths?.papers[0].calculatorAllowed).toBe(false);

    const wjecMaths = allSubjects().find((s) => s.id === "wjec-gcse-maths");
    expect(wjecMaths?.papers).toHaveLength(2);
    expect(wjecMaths?.papers[0].calculatorAllowed).toBe(false);
  });

  it("downgrades non-flagship seed questions", () => {
    const referenceQs = seedQuestions.filter((q) => !isFlagship(q.subjectId));
    expect(referenceQs.length).toBeGreaterThan(0);
    for (const q of referenceQs) {
      expect(q.verification, q.id).toBe("unverified");
      if (!q.subjectId.startsWith("wjec-")) {
        expect(q.reviewer ?? "", q.id).not.toMatch(/WJEC/i);
      }
    }
    const flagshipQs = seedQuestions.filter((q) => isFlagship(q.subjectId));
    expect(flagshipQs.some((q) => q.verification === "checked")).toBe(true);
  });

  it("defaults new students onto flagships with lab mode off", () => {
    const settings = defaultSettings("u");
    expect(settings.subjectIds).toEqual(FLAGSHIP_SUBJECTS.map((f) => f.subjectId));
    expect(settings.labMode).toBe(false);
  });
});
