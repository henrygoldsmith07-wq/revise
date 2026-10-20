import { describe, expect, it } from "vitest";
import { aqaComputerScienceQuestions, aqaEconomicsQuestions, aqaPsychologyQuestions, seedQuestionsForSubject } from "@/content";
import { seedCardsForTopic } from "@/content/seed-cards";
import { allSubjects, getSubject, topicsFor } from "@/domain/curriculum";
import { AUTHORED_REFERENCE_DISCLAIMER, AUTHORED_REFERENCE_SUBJECTS } from "@/domain/curriculum/honesty";
import { specFor } from "@/domain/spec";
import { markPart } from "@/domain/marking";

// Subjects added beyond the four sciences and maths. Each topic list is
// written for its own AQA specification, not cloned from a flagship, and is
// labelled as unreviewed wherever it appears.

const NEW_SUBJECTS = [
  { id: "aqa-alevel-psychology", name: "Psychology", specCode: "7182", bank: aqaPsychologyQuestions },
  { id: "aqa-alevel-computer-science", name: "Computer Science", specCode: "7517", bank: aqaComputerScienceQuestions },
  { id: "aqa-alevel-economics", name: "Economics", specCode: "7136", bank: aqaEconomicsQuestions },
];

describe("new subjects", () => {
  it("are registered as AQA A-level reference subjects with an accurate disclaimer", () => {
    expect([...AUTHORED_REFERENCE_SUBJECTS].sort()).toEqual(NEW_SUBJECTS.map((s) => s.id).sort());
    for (const { id, name, specCode } of NEW_SUBJECTS) {
      const subject = getSubject(id)!;
      expect(subject, id).toBeDefined();
      expect(subject.name).toBe(name);
      expect(subject.qualificationId).toBe("aqa-alevel");
      expect(subject.specCode).toBe(specCode);
      expect(subject.contentTier).toBe("reference");
      // The cloned-outline disclaimer says "adapted from a WJEC A-level outline", which would be false here.
      expect(subject.contentDisclaimer).toBe(AUTHORED_REFERENCE_DISCLAIMER);
      expect(subject.contentDisclaimer).not.toMatch(/WJEC/);
      expect(specFor(id)?.specCode).toBe(specCode);
      expect(specFor(id)?.statementsTotal).toBe(topicsFor(id).reduce((n, t) => n + (t.specPoints?.length ?? 0), 0));
      expect(subject.papers.reduce((sum, paper) => sum + paper.weight, 0)).toBeCloseTo(1, 2);
    }
  });

  it("are not clones of any other subject's outline", () => {
    const others = new Set(
      allSubjects()
        .filter((s) => !AUTHORED_REFERENCE_SUBJECTS.has(s.id))
        .flatMap((s) => topicsFor(s.id).flatMap((t) => t.keyPoints)),
    );
    for (const { id } of NEW_SUBJECTS) {
      const shared = topicsFor(id).flatMap((t) => t.keyPoints).filter((point) => others.has(point));
      expect(shared, id).toEqual([]);
    }
  });

  it("give every topic spec-numbered statements, key points and common errors, all unverified", () => {
    for (const { id } of NEW_SUBJECTS) {
      const topics = topicsFor(id);
      expect(topics.length, id).toBeGreaterThanOrEqual(11);
      for (const topic of topics) {
        expect(topic.specRef, topic.id).toMatch(/^4\.\d+/);
        expect(topic.keyPoints.length, topic.id).toBeGreaterThanOrEqual(4);
        expect(topic.commonErrors.length, topic.id).toBeGreaterThanOrEqual(3);
        expect(topic.specPoints?.length ?? 0, topic.id).toBeGreaterThanOrEqual(3);
        expect(topic.verification).toBe("unverified");
        for (const point of topic.specPoints ?? []) {
          expect(point.ref, point.id).toMatch(/^4\.\d+/);
          expect(point.verification, point.id).toBe("unverified");
          expect(point.reviewer ?? null, point.id).toBeNull();
        }
        expect(seedCardsForTopic(topic, "u").length, topic.id).toBeGreaterThanOrEqual(topic.keyPoints.length + topic.commonErrors.length);
      }
    }
  });

  it("ship at least two questions per topic, each linked to a real statement in its topic", () => {
    for (const { id, bank } of NEW_SUBJECTS) {
      const seeded = new Set(seedQuestionsForSubject(id).map((q) => q.id));
      for (const topic of topicsFor(id)) {
        const onTopic = bank.filter((q) => q.topicIds.includes(topic.id));
        expect(onTopic.length, topic.id).toBeGreaterThanOrEqual(2);
      }
      for (const question of bank) {
        expect(seeded.has(question.id), question.id).toBe(true);
        expect(question.verification).toBe("unverified");
        expect(question.source).toBe("authored");
        const pointIds = new Set(topicsFor(id).flatMap((t) => t.specPoints ?? []).map((p) => p.id));
        for (const part of question.parts) {
          for (const pointId of part.specPointIds ?? []) expect(pointIds.has(pointId), `${part.id} → ${pointId}`).toBe(true);
          expect(part.specPointIds?.length, part.id).toBeGreaterThan(0);
        }
        if (question.kind === "mcq") {
          expect(question.options?.[question.correctIndex ?? -1], question.id).toBeDefined();
        }
      }
    }
  });

  it("award full marks to every model answer with the offline marker", () => {
    const failing = NEW_SUBJECTS.flatMap(({ bank }) =>
      bank.filter((q) => q.kind !== "mcq").flatMap((q) => q.parts.filter((p) => markPart(p, p.modelAnswer).awarded < p.marks).map((p) => p.id)),
    );
    expect(failing).toEqual([]);
  });
});
