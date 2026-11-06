import { describe, expect, it } from "vitest";
import { seedQuestionsForSubject } from "@/content";
import { getTopic, topicsFor, unitsFor } from "@/domain/curriculum";
import { BIOLOGY_REFERENCE_OUTLINE } from "@/domain/curriculum/outlines/biology";
import { CHEMISTRY_REFERENCE_OUTLINE } from "@/domain/curriculum/outlines/chemistry";
import { MATHS_REFERENCE_OUTLINE } from "@/domain/curriculum/outlines/maths";
import { PHYSICS_REFERENCE_OUTLINE } from "@/domain/curriculum/outlines/physics";
import type { UnitSpec } from "@/domain/curriculum/helpers";
import { BOARD_ADDED_TOPICS } from "./fixtures/board-added-topics";

// AQA's four A-level sciences and maths now follow the AQA specifications
// section by section. The expected sections and subsections below were
// transcribed from the published specification PDFs (AQA-7401-7402-SP-2015,
// AQA-7404-7405-SP-2015, AQA-7407-7408-SP-2015, AQA-7357-SP-2017) on
// 2026-11-06, independently of the board maps they check.

interface Expected {
  subjectId: string;
  outline: UnitSpec[];
  units: string[];
  /** Every content subsection a student is examined on; each must be referenced somewhere. */
  sections: string[];
}

const range = (prefix: string, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

const EXPECTED: Expected[] = [
  {
    subjectId: "aqa-alevel-biology",
    outline: BIOLOGY_REFERENCE_OUTLINE,
    units: [
      "3.1 Biological molecules",
      "3.2 Cells",
      "3.3 Organisms exchange substances with their environment",
      "3.4 Genetic information, variation and relationships between organisms",
      "3.5 Energy transfers in and between organisms",
      "3.6 Organisms respond to changes in their internal and external environments",
      "3.7 Genetics, populations, evolution and ecosystems",
      "3.8 The control of gene expression",
    ],
    sections: [
      ...range("3.1.", 1, 8), ...range("3.2.", 1, 4), ...range("3.3.", 1, 4), ...range("3.4.", 1, 7),
      ...range("3.5.", 1, 4), ...range("3.6.", 1, 4), ...range("3.7.", 1, 4), ...range("3.8.", 1, 4),
    ],
  },
  {
    subjectId: "aqa-alevel-chemistry",
    outline: CHEMISTRY_REFERENCE_OUTLINE,
    units: ["3.1 Physical chemistry", "3.2 Inorganic chemistry", "3.3 Organic chemistry"],
    sections: [...range("3.1.", 1, 12), ...range("3.2.", 1, 6), ...range("3.3.", 1, 16)],
  },
  {
    subjectId: "aqa-alevel-physics",
    outline: PHYSICS_REFERENCE_OUTLINE,
    units: [
      "3.1 Measurements and their errors",
      "3.2 Particles and radiation",
      "3.3 Waves",
      "3.4 Mechanics and materials",
      "3.5 Electricity",
      "3.6 Further mechanics and thermal physics",
      "3.7 Fields and their consequences",
      "3.8 Nuclear physics",
      "3.9–3.13 Options (one is studied)",
    ],
    sections: [
      ...range("3.1.", 1, 3), ...range("3.2.", 1, 2), ...range("3.3.", 1, 2), ...range("3.4.1.", 1, 8), "3.4.2",
      ...range("3.5.1.", 1, 6), ...range("3.6.1.", 1, 4), ...range("3.6.2.", 1, 3), ...range("3.7.", 2, 5), ...range("3.8.1.", 1, 8),
      "3.9", "3.10", "3.11", "3.12", "3.13",
    ],
  },
  {
    subjectId: "aqa-alevel-maths",
    outline: MATHS_REFERENCE_OUTLINE,
    units: ["Pure mathematics (A–J)", "Statistics (K–O)", "Mechanics (P–S)"],
    sections: [
      "A1", ...range("B", 1, 11), ...range("C", 1, 4), ...range("D", 1, 6), ...range("E", 1, 9), ...range("F", 1, 7),
      ...range("G", 1, 6), ...range("H", 1, 8), ...range("I", 1, 3), ...range("J", 1, 5), "K1", ...range("L", 1, 4),
      ...range("M", 1, 3), ...range("N", 1, 3), ...range("O", 1, 3), "P1", ...range("Q", 1, 5), ...range("R", 1, 6), "S1",
    ],
  },
];

/** Expand "3.1.1–3.1.8", "B7–B9", "3.1.6, 3.1.10" and "H1, H4, H6" into single references. */
function expandRefs(ref: string): string[] {
  return ref.split(/,\s*/).flatMap((part) => {
    const [from, to] = part.split("–").map((s) => s.trim());
    if (!to) return [from!];
    const head = from!.match(/^(.*?)(\d+)$/);
    const tail = to.match(/^(.*?)(\d+)$/);
    // "3.4.1.1–3.4.1.5" and "B7–B9" share a prefix; a letter span such as "K–L" names areas, not sections.
    if (!head || !tail || head[1] !== tail[1]) return [from!, to];
    return range(head[1]!, Number(head[2]), Number(tail[2]));
  });
}

function referencedSections(subjectId: string): Set<string> {
  const refs = new Set<string>();
  for (const topic of topicsFor(subjectId)) {
    for (const ref of [topic.specRef ?? "", ...(topic.specPoints ?? []).map((p) => p.ref)]) {
      for (const single of expandRefs(ref)) refs.add(single);
    }
  }
  return refs;
}

/** A section counts as covered by itself or by any finer reference beneath it. */
function covered(section: string, refs: Set<string>): boolean {
  for (const ref of refs) if (ref === section || ref.startsWith(`${section}.`)) return true;
  return false;
}

describe("AQA A-level subjects follow the AQA specification", () => {
  for (const expected of EXPECTED) {
    describe(expected.subjectId, () => {
      it("has the specification's own sections as its units, in order", () => {
        expect(unitsFor(expected.subjectId).map((unit) => unit.title)).toEqual(expected.units);
      });

      it("references every examined section of the specification", () => {
        const refs = referencedSections(expected.subjectId);
        expect(expected.sections.filter((section) => !covered(section, refs))).toEqual([]);
      });

      it("carries no WJEC unit references", () => {
        const wjec = topicsFor(expected.subjectId).flatMap((topic) =>
          [topic.specRef ?? "", ...(topic.specPoints ?? []).map((p) => p.ref)].filter((ref) => /Unit|Pure 1|Applied [12]/.test(ref)),
        );
        expect(wjec).toEqual([]);
      });

      it("keeps every topic id from the shared outline, so learners' cards and mastery stay attached", () => {
        const missing = expected.outline
          .flatMap((unit) => unit.topics)
          .map((topic) => `${expected.subjectId}.${topic.slug}`)
          .filter((id) => !getTopic(id));
        expect(missing).toEqual([]);
      });

      it("keeps each surviving statement's id and text, and drops only statements no question cites", () => {
        const questions = seedQuestionsForSubject(expected.subjectId);
        const cited = new Set(questions.flatMap((q) => q.parts.flatMap((part) => part.specPointIds ?? [])));
        for (const outlineTopic of expected.outline.flatMap((unit) => unit.topics)) {
          const topic = getTopic(`${expected.subjectId}.${outlineTopic.slug}`)!;
          const byId = new Map((topic.specPoints ?? []).map((point) => [point.id, point]));
          (outlineTopic.specPoints ?? []).forEach((point, index) => {
            const id = `${topic.id}.sp-${String(index + 1).padStart(2, "0")}`;
            const now = byId.get(id);
            if (now) expect(now.text).toBe(point.text);
            else expect(cited.has(id), `${id} was dropped but a question cites it`).toBe(false);
          });
        }
      });

      it("resolves every question's topic and statement", () => {
        const dangling: string[] = [];
        for (const question of seedQuestionsForSubject(expected.subjectId)) {
          for (const topicId of question.topicIds) if (!getTopic(topicId)) dangling.push(`${question.id}: ${topicId}`);
          for (const part of question.parts) {
            for (const pointId of part.specPointIds ?? []) {
              const topicId = pointId.replace(/\.sp-\d+$/, "");
              if (!getTopic(topicId)?.specPoints?.some((p) => p.id === pointId)) dangling.push(`${question.id}: ${pointId}`);
            }
          }
        }
        expect(dangling).toEqual([]);
      });

      it("gives every topic it adds an authored exam-style question, tagged to that topic's own statements", () => {
        const questions = seedQuestionsForSubject(expected.subjectId);
        for (const topic of topicsFor(expected.subjectId).filter((candidate) => BOARD_ADDED_TOPICS.has(candidate.id))) {
          const own = questions.filter((question) => question.topicIds.includes(topic.id));
          expect(own.length, `${topic.id} has no question`).toBeGreaterThanOrEqual(1);
          for (const question of own) {
            for (const part of question.parts) {
              expect(part.specPointIds?.length, `${question.id} part untagged`).toBeGreaterThan(0);
              expect(part.specPointIds!.every((id) => id.startsWith(`${topic.id}.sp-`)), question.id).toBe(true);
              expect(part.markScheme.length, question.id).toBe(part.marks);
            }
          }
        }
      });

      it("gives every topic key points, common errors and statements to learn from", () => {
        for (const topic of topicsFor(expected.subjectId)) {
          expect(topic.keyPoints.length, topic.id).toBeGreaterThanOrEqual(3);
          expect(topic.commonErrors.length, topic.id).toBeGreaterThanOrEqual(2);
          expect(topic.specPoints?.length ?? 0, topic.id).toBeGreaterThanOrEqual(3);
          expect(new Set(topic.specPoints!.map((p) => p.id)).size, topic.id).toBe(topic.specPoints!.length);
        }
      });
    });
  }
});
