import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { seedMisconceptions, seedQuestions } from "@/content";
import { buildLessons } from "@/content/lessons";
import { seedCardsForTopic } from "@/content/seed-cards";
import { allSubjects, allTopics } from "@/domain/curriculum";
import { recommendationTaskId } from "@/domain/funnel";
import { answerKey, fnv1a, scopeKey } from "@/ai/semantic-cache";

// ---------------------------------------------------------------------------
// The app composes ids into larger keys by colon concatenation in several
// places — `lesson:<topicId>:<step>`, question part ids (`<qid>:<i>`), the
// aiCache exact key (`<qid>:<pid>:<hash>`) and its byScope index key
// (`<qid>:<pid>`), funnel task ids (`<activity>:<topicId>:<day>`). None of
// these are *parsed* back anywhere (verified by audit), so ambiguity is
// currently only theoretical — but that holds only while the embedded
// components stay colon-free. These pins hold each family to that contract,
// so a new curriculum file that sneaks a colon into an id fails here instead
// of silently colliding in a derived key space.
// ---------------------------------------------------------------------------

const topics = allTopics();
const subjects = allSubjects();
const lessons = buildLessons(topics);
const cards = topics.flatMap((t) => seedCardsForTopic(t, "audit-user", new Date(0)));

describe("topic-id hygiene: the separator contract", () => {
  it("topic ids contain no colons (they are embedded into lesson:, aiCache and funnel keys)", () => {
    const offenders = topics.filter((t) => t.id.includes(":")).map((t) => t.id);
    expect(offenders).toEqual([]);
  });

  it("subject ids contain no colons (embedded in paper spec ids and funnel keys)", () => {
    const offenders = subjects.filter((s) => s.id.includes(":")).map((s) => s.id);
    expect(offenders).toEqual([]);
  });
});

describe("content bank (`cnt:` namespace)", () => {
  it("question ids are unique across the whole corpus", () => {
    const ids = seedQuestions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("question ids stay namespaced and single-family", () => {
    const offenders = seedQuestions.filter((q) => !q.id.startsWith("cnt:question:")).map((q) => q.id);
    expect(offenders).toEqual([]);
  });

  it("part ids are globally unique and derive from their question id", () => {
    const parts = seedQuestions.flatMap((q) => q.parts.map((p) => ({ qid: q.id, pid: p.id })));
    const ids = parts.map((p) => p.pid);
    expect(new Set(ids).size).toBe(ids.length);
    const orphans = parts.filter((p) => !p.pid.startsWith(`${p.qid}:`));
    expect(orphans).toEqual([]);
  });

  it("misconception ids are unique and namespaced (slug uniqueness is pinned on the authoring specs)", () => {
    const ids = seedMisconceptions.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("cnt:misconception:"))).toBe(true);
  });

  it("seeded card ids are unique and single-family", () => {
    const ids = cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const offenders = cards.filter((c) => !c.id.startsWith("cnt:card:")).map((c) => c.id);
    expect(offenders).toEqual([]);
  });
});

describe("lesson: family", () => {
  it("lesson ids are unique and embed their topic id at segment 1", () => {
    const ids = lessons.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const lesson of lessons) {
      expect(lesson.id).toBe(`lesson:${lesson.topicId}`);
      const [, embeddedTopic] = lesson.id.split(":");
      expect(embeddedTopic).toBe(lesson.topicId);
    }
  });

  it("every step id is unique and derives from its lesson id (prefix-parseable)", () => {
    const all = lessons.flatMap((l) => l.steps.map((s) => ({ lessonId: l.id, stepId: s.id })));
    const ids = all.map((s) => s.stepId);
    expect(new Set(ids).size).toBe(ids.length);
    const orphans = all.filter((s) => !s.stepId.startsWith(`${s.lessonId}:`));
    expect(orphans).toEqual([]);
  });
});

describe("aiCache composite keys", () => {
  it("fnv1a is a fixed-width hex digest", () => {
    for (const text of ["", "a", "Photosynthesis produces glucose", "seed dispersal prose"]) {
      expect(fnv1a(text)).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it("exact keys are injective over (questionId, partId, answer)", () => {
    const [q1, q2] = seedQuestions.slice(0, 2);
    const a = answerKey(q1.id, q1.parts[0].id, "Photosynthesis");
    const b = answerKey(q1.id, q1.parts[0].id, "Respiration");
    const c = answerKey(q2.id, q2.parts[0].id, "Photosynthesis");
    expect(new Set([a, b, c]).size).toBe(3);
    // Deterministic: the same answer maps to the same key on re-derivation.
    expect(answerKey(q1.id, q1.parts[0].id, "Photosynthesis")).toBe(a);
  });

  it("scope keys never collide for distinct question/part pairs", () => {
    const scopes = seedQuestions.flatMap((q) => q.parts.map((p) => scopeKey(q.id, p.id)));
    expect(new Set(scopes).size).toBe(scopes.length);
  });
});

describe("funnel task ids", () => {
  it("are stable for the same inputs and distinct across activity/topic/day", () => {
    const topic = topics[0];
    const day = "2026-09-04";
    const base = recommendationTaskId("review", topic.id, topic.subjectId, day);
    expect(recommendationTaskId("review", topic.id, topic.subjectId, day)).toBe(base);
    const variants = [
      recommendationTaskId("practice", topic.id, topic.subjectId, day),
      recommendationTaskId("review", topics[1].id, topics[1].subjectId, day),
      recommendationTaskId("review", topic.id, topic.subjectId, "2026-09-05"),
    ];
    expect(new Set(variants).size).toBe(3);
  });
});

describe("random families are crypto-backed", () => {
  // Structural pins: every persisted-row mint site uses crypto.randomUUID,
  // not Math.random. A grep-shaped test, but it holds the boundary the audit
  // established: only non-persisted, in-record ids (editorial issue notes)
  // may use Math.random.
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

  it("outbox rows and idempotency keys are minted with crypto.randomUUID", () => {
    const src = read("src/data/sync.ts");
    expect(src).toContain("id: crypto.randomUUID()");
    expect(src).toContain("idempotencyKey: crypto.randomUUID()");
  });

  it("the device-id fallback still produces v4-shaped uuids without randomUUID", () => {
    const src = read("src/data/device.ts");
    expect(src).toContain("getRandomValues");
    // Version and variant bits are forced — this is what makes the fallback
    // uuid-shaped rather than merely random.
    expect(src).toContain("0x40");
    expect(src).toContain("0x80");
  });
});
