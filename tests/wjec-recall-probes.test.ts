import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { wjecRecallProbeQuestions } from "@/content/questions/wjec-recall-probes";
import { learnerEvidenceTrusted } from "@/domain/content-trust";
import { classifyDepth } from "@/domain/flagship";
import { markQuestion } from "@/domain/marking";

// Recall probes for WJEC Maths/Biology/Chemistry topics that had none. They must be recall-level,
// honestly unreviewed (never proof-eligible until two teachers approve them in the portal), mapped to
// a real spec point, and markable: the model answer earns full marks and a blank answer earns none.
describe("WJEC recall probes", () => {
  it("are in the seed bank, recall-level, unverified and unreviewed", () => {
    expect(wjecRecallProbeQuestions.length).toBe(72);
    const ids = new Set(seedQuestions.map((q) => q.id));
    for (const q of wjecRecallProbeQuestions) {
      expect(ids.has(q.id)).toBe(true);
      const seeded = seedQuestions.find((s) => s.id === q.id)!;
      expect(classifyDepth(seeded)).toBe("recall");
      expect(seeded.verification).not.toBe("verified");
      expect(seeded.humanVerification).toBeUndefined();
      expect(learnerEvidenceTrusted(seeded)).toBe(false);
      expect(seeded.parts.every((p) => (p.specPointIds ?? []).length > 0 && p.aos?.includes("AO1"))).toBe(true);
    }
    const subjects = new Set(wjecRecallProbeQuestions.map((q) => q.subjectId));
    expect([...subjects].sort()).toEqual(["wjec-alevel-biology", "wjec-alevel-chemistry", "wjec-alevel-maths"]);
  });

  it("award full marks to the model answer and nothing to a blank answer", () => {
    for (const q of wjecRecallProbeQuestions) {
      const part = q.parts[0]!;
      const full = markQuestion(q, { [part.id]: part.modelAnswer ?? "" });
      expect(full.awarded, `${q.id} model answer`).toBe(q.totalMarks);
      const blank = markQuestion(q, { [part.id]: "" });
      expect(blank.awarded, `${q.id} blank`).toBe(0);
    }
  });
});
