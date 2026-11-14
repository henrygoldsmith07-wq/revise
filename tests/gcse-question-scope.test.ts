import { describe, expect, it } from "vitest";
import {
  aqaGcsePracticalQuestions,
  aqaGcseQuestions,
  aqaGcseSynopticQuestions,
  authenticExpansionQuestions,
  authenticSourceQuestions,
  dataExpansionQuestions,
  gcseExpansionQuestions,
  gcsePhysicsCourseQuestions,
  seedQuestions,
  unfamiliarContextQuestions,
} from "@/content";
import { GCSE_PHYSICS_PLACEMENT, gcseTemplateKey, scopeGcseQuestion } from "@/content/gcse-question-scope";
import { GCSE_PHYSICS_OUTLINE } from "@/domain/curriculum/outlines/gcse-physics";
import { getTopic, topicsFor } from "@/domain/curriculum";
import { referenceDisclaimerFor } from "@/domain/curriculum/honesty";
import { liveCards, loadedTopics, retiredSeedCard } from "@/domain/card-retirement";
import { seedCardsForTopic } from "@/content/seed-cards";
import type { Question } from "@/domain/types";

const GCSE_PHYSICS = ["aqa-gcse-physics", "edexcel-gcse-physics", "ocr-gcse-physics", "wjec-gcse-physics"];

/** Every GCSE physics question the content packs build, before scoping. */
function unscopedGcsePhysics(): Question[] {
  return [
    ...gcseExpansionQuestions,
    ...dataExpansionQuestions,
    ...unfamiliarContextQuestions,
    ...authenticExpansionQuestions,
    ...authenticSourceQuestions,
    ...aqaGcseQuestions,
    ...aqaGcsePracticalQuestions,
    ...aqaGcseSynopticQuestions,
    ...gcsePhysicsCourseQuestions,
  ].filter((question) => GCSE_PHYSICS.includes(question.subjectId));
}
// A-level ideas that are not in the DfE GCSE physics content.
const A_LEVEL_ONLY = /photon|photoelectric|stopping potential|young modulus|\bstress\b|\bstrain\b(?! energy)|simple harmonic|gravitational potential(?! energy)|centripetal|internal resistance|\bemf\b|work function/i;

describe("GCSE physics follows the DfE GCSE subject content, not the A-level outline", () => {
  it("every GCSE physics subject builds from the GCSE outline", () => {
    const slugs = GCSE_PHYSICS_OUTLINE.flatMap((unit) => unit.topics.map((topic) => topic.slug));
    for (const subjectId of GCSE_PHYSICS) {
      const topics = topicsFor(subjectId);
      expect(topics.map((topic) => topic.id.slice(subjectId.length + 1)), subjectId).toEqual(slugs);
      for (const topic of topics) {
        expect(`${topic.title} ${topic.summary} ${topic.keyPoints.join(" ")} ${(topic.specPoints ?? []).map((p) => p.text).join(" ")}`, topic.id).not.toMatch(A_LEVEL_ONLY);
        expect(topic.specPoints?.length, topic.id).toBeGreaterThan(0);
        expect(topic.keyPoints.length, topic.id).toBeGreaterThanOrEqual(2);
        expect(topic.commonErrors.length, topic.id).toBeGreaterThanOrEqual(2);
      }
      // No slug is shared with the A-level outline, so no installed A-level card keeps its id.
      for (const slug of ["kinematics-dynamics", "energy-power", "materials", "waves", "quantum", "electric-circuits", "momentum", "circular-shm", "fields", "thermal", "nuclear"]) {
        expect(getTopic(`${subjectId}.${slug}`), `${subjectId}.${slug}`).toBeUndefined();
      }
    }
  });

  it("the label says what the topic list is built on, and does not claim WJEC Wales follows the DfE document", () => {
    for (const subjectId of GCSE_PHYSICS) {
      const label = referenceDisclaimerFor(subjectId);
      expect(label, subjectId).toMatch(/DfE GCSE subject content/);
      expect(label, subjectId).not.toMatch(/A-level topic list|go well beyond GCSE/);
    }
    expect(referenceDisclaimerFor("wjec-gcse-physics")).toMatch(/regulated separately/);
    // The other GCSE subjects still say they use the A-level list until theirs is written.
    expect(referenceDisclaimerFor("aqa-gcse-chemistry")).toMatch(/A-level topic list/);
  });
});

describe("GCSE physics questions are on the GCSE course and tagged to it", () => {
  const bank = seedQuestions.filter((question) => GCSE_PHYSICS.includes(question.subjectId));

  it("every question's topics and statements are real points of its own subject's GCSE outline", () => {
    expect(bank.length).toBeGreaterThan(100);
    for (const question of bank) {
      for (const topicId of question.topicIds) expect(getTopic(topicId), `${question.id}: ${topicId}`).toBeDefined();
      for (const part of question.parts) {
        expect(part.specPointIds?.length, `${question.id} part ${part.id}`).toBeGreaterThan(0);
        for (const id of part.specPointIds ?? []) {
          const topic = question.topicIds.map(getTopic).find((t) => t?.specPoints?.some((p) => p.id === id));
          expect(topic, `${question.id}: ${id}`).toBeDefined();
        }
      }
    }
  });

  it("no A-level-only question reaches a GCSE physics student", () => {
    for (const question of bank) {
      const text = `${question.stem} ${question.parts.map((p) => `${p.prompt} ${p.modelAnswer}`).join(" ")}`;
      expect(text, question.id).not.toMatch(A_LEVEL_ONLY);
    }
  });

  it("every template is placed by a person: retagged or withheld, none unplaced", () => {
    // The packs before scoping: every GCSE physics question they build.
    const raw = unscopedGcsePhysics();
    expect(raw.length).toBeGreaterThan(bank.length);
    const unplaced = [...new Set(raw.map(gcseTemplateKey).filter((key) => !(key in GCSE_PHYSICS_PLACEMENT) && !key.startsWith("gcse-physics-course-")))];
    expect(unplaced).toEqual([]);
    // No dead entries: every entry in the map names a template that exists.
    const templates = new Set(raw.map(gcseTemplateKey));
    expect(raw.length).toBeGreaterThan(0);
    expect(Object.keys(GCSE_PHYSICS_PLACEMENT).filter((key) => !templates.has(key))).toEqual([]);
  });

  it("every GCSE physics topic now has at least one question on every board", () => {
    for (const subjectId of GCSE_PHYSICS) {
      const questions = bank.filter((question) => question.subjectId === subjectId);
      const uncovered = topicsFor(subjectId).filter((topic) => !questions.some((question) => question.topicIds.includes(topic.id)));
      expect(uncovered.map((topic) => topic.id), subjectId).toEqual([]);
    }
  });

  it("a template that is not placed is withheld rather than shipped untagged", () => {
    const fake = { ...bank[0]!, id: "cnt:question:gcse-expansion-aqa-gcse-physics-new-template", subjectId: "aqa-gcse-physics" } as Question;
    expect(scopeGcseQuestion(fake)).toEqual([]);
    const other = { ...bank[0]!, subjectId: "aqa-alevel-physics" } as Question;
    expect(scopeGcseQuestion(other)).toEqual([other]);
  });
});

describe("seed cards from a topic that has left its subject retire from review", () => {
  const topics = topicsFor("aqa-gcse-physics");
  const loaded = loadedTopics(topics);
  const current = seedCardsForTopic(topics[0]!, "u1");
  const old = { ...current[0]!, id: "cnt:card:aqa-gcse-physics.circular-shm:kp:0", topicId: "aqa-gcse-physics.circular-shm" };

  it("retires an installed A-level seed card and keeps the current ones", () => {
    expect(retiredSeedCard(old, loaded)).toBe(true);
    expect(current.every((card) => !retiredSeedCard(card, loaded))).toBe(true);
    expect(liveCards([...current, old], loaded)).toEqual(current);
  });

  it("never retires a card the learner made, or one whose subject is not loaded", () => {
    expect(retiredSeedCard({ ...old, origin: "manual" }, loaded)).toBe(false);
    expect(retiredSeedCard({ ...old, origin: "mistake" }, loaded)).toBe(false);
    expect(retiredSeedCard({ ...old, subjectId: "edexcel-alevel-physics", topicId: "edexcel-alevel-physics.nope" }, loaded)).toBe(false);
  });

  it("returns the same array when nothing is retired, so memos downstream stay stable", () => {
    expect(liveCards(current, loaded)).toBe(current);
  });

  it("the store hides retired cards from the learner model and every screen, without deleting them", async () => {
    const { readFileSync } = await import("node:fs");
    const store = readFileSync("src/state/store.tsx", "utf8");
    expect(store).toContain("useLearnerMastery(liveSnapshot, topics)");
    expect(store).toContain("...(liveSnapshot ?? snapshot),");
  });
});
