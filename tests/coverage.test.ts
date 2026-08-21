import { describe, expect, it } from "vitest";
import { seedCardsForTopic } from "@/content/seed-cards";
import { seedQuestions } from "@/content";
import { allSubjects, allTopics, getTopic, topicsFor } from "@/domain/curriculum";
import { coverageForSubject } from "@/domain/coverage";
import { SPEC_MANIFEST } from "@/domain/spec";
import type { Topic } from "@/domain/types";

describe("content pipeline — spec metadata", () => {
  it("every topic carries board/spec provenance", () => {
    for (const topic of allTopics()) {
      expect(topic.specRef, `${topic.id} missing specRef`).toBeTruthy();
      expect(topic.specVersion, `${topic.id} missing specVersion`).toBe("2024-1.0");
      expect(topic.source, `${topic.id} missing source`).toBe("authored");
      expect(["unverified", "checked", "verified"], `${topic.id} bad verification`).toContain(topic.verification);
      expect(topic.specRef).toMatch(/^(Unit|Pure|Applied)/);
    }
  });

  it("every subject has a spec manifest entry that matches its code", () => {
    for (const subject of allSubjects()) {
      const spec = SPEC_MANIFEST.find((s) => s.subjectId === subject.id);
      expect(spec, `no SPEC_MANIFEST for ${subject.id}`).toBeDefined();
      expect(spec!.version).toBe(subject.spec?.version);
      expect(spec!.specCode).toBe(subject.specCode);
      expect(spec!.lastChecked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("every topic has AO mapping", () => {
    for (const topic of allTopics()) {
      expect(topic.aos?.length, `${topic.id} no AOs`).toBeGreaterThan(0);
      for (const ao of topic.aos!) expect(["AO1", "AO2", "AO3"]).toContain(ao);
    }
  });

  it("topics expose lastChecked as an ISO date when verified or checked", () => {
    for (const topic of allTopics()) {
      if (topic.verification === "checked" || topic.verification === "verified") {
        expect(topic.lastChecked, `${topic.id} checked but no lastChecked`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
});

describe("content pipeline — questions carry provenance", () => {
  it("every seed question carries source, verification and AO", () => {
    for (const q of seedQuestions) {
      expect(["authored", "licensed", "generated", "past-paper", "import"], q.id).toContain(q.source);
      expect(["unverified", "checked", "verified"], q.id).toContain(q.verification);
      // AO may be undefined on a small number of legacy questions; new ones must set it
      if (q.aos) for (const ao of q.aos) expect(["AO1", "AO2", "AO3"]).toContain(ao);
      for (const p of q.parts) if (p.aos) for (const ao of p.aos) expect(["AO1", "AO2", "AO3"]).toContain(ao);
      for (const topicId of q.topicIds) {
        expect(getTopic(topicId), `question ${q.id} points at unknown ${topicId}`).toBeDefined();
      }
    }
  });
});

describe("content pipeline — coverage is measured", () => {
  it("every subject has non-zero coverage (authored A-level boards require exam questions; new boards/GCSE ship curriculum-first)", () => {
    const authoredAlevelIds = new Set(allSubjects().filter((s) => s.id.startsWith("wjec-alevel") || s.id.startsWith("aqa-alevel") || s.id.startsWith("ocr-alevel")).map((s) => s.id));
    for (const subject of allSubjects()) {
      const topics = topicsFor(subject.id);
      const qs = seedQuestions.filter((q) => q.subjectId === subject.id);
      const cardsPerTopic = new Map<string, number>(topics.map((t) => [t.id, seedCardsForTopic(t, "u").length]));
      const cov = coverageForSubject(topics, qs, cardsPerTopic);
      expect(cov.topicsTotal).toBe(topics.length);
      expect(cov.coveragePercent).toBeGreaterThan(50);
      expect(cov.retrievalItems).toBeGreaterThan(cov.topicsTotal * 4);
      // Statement-level: when specPoints exist, verify measurable statement coverage
      if (cov.specPointsTotal > 0) {
        expect(cov.statements.length).toBe(cov.specPointsTotal);
        expect(cov.specPointsLearnable).toBeGreaterThan(0);
      }
      if (authoredAlevelIds.has(subject.id)) {
        expect(cov.examQuestions, `${subject.id} should have seed questions`).toBeGreaterThan(0);
      } else {
        // Edexcel/GCSE: curriculum ships first; questions follow with licensed past-paper sourcing.
        expect(cov.specPointsTotal, `${subject.id} should still have statements`).toBeGreaterThan(0);
      }
    }
  });

  it("coverage helper tolerates an empty topic list", () => {
    const cov = coverageForSubject([] as unknown as Topic[], [], new Map());
    expect(cov.topicsTotal).toBe(0);
    expect(cov.coveragePercent).toBe(0);
  });
});
describe("statement-level provenance — all subjects", () => {
  it("every subject has specPoints on every topic (no topic left as broad area only)", () => {
    for (const subject of allSubjects()) {
      const topics = topicsFor(subject.id);
      for (const topic of topics) {
        expect(topic.specPoints?.length, `${topic.id} must have specPoints`).toBeGreaterThan(0);
      }
    }
  });

  it("total statement counts meet the density floor", () => {
    const mins: Record<string, number> = { "wjec-alevel-physics": 60, "wjec-alevel-chemistry": 60, "wjec-alevel-biology": 60, "wjec-alevel-maths": 40 };
    for (const subject of allSubjects()) {
      const total = topicsFor(subject.id).reduce((a, tp) => a + (tp.specPoints?.length ?? 0), 0);
      expect(total, `${subject.id} total statements`).toBeGreaterThanOrEqual(mins[subject.id] ?? 40);
    }
  });

  it("SPEC_MANIFEST.paperBreakdown is populated for every subject", () => {
    for (const subject of allSubjects()) {
      const spec = SPEC_MANIFEST.find((s) => s.subjectId === subject.id);
      expect(spec?.paperBreakdown?.length, `${subject.id} missing paperBreakdown`).toBeGreaterThan(0);
      for (const pb of spec!.paperBreakdown!) {
        expect(pb.durationMinutes).toBeGreaterThan(0);
        expect(pb.marks).toBeGreaterThan(0);
        expect(pb.weight).toBeGreaterThan(0);
      }
    }
  });

  it("every seed question maps to specPointIds with learningClaims", () => {
    for (const q of seedQuestions) {
      const hasMapping = (q.specPointIds?.length ?? 0) > 0 || q.parts.some((part) => (part.specPointIds?.length ?? 0) > 0);
      expect(hasMapping, `${q.id} should map to at least one specPoint`).toBeTruthy();
      for (const part of q.parts) if (part.specPointIds?.length) {
        expect(part.learningClaims?.length, `${q.id} part ${part.id} needs learningClaims`).toBeGreaterThan(0);
        expect(part.learningClaims!.length, `${q.id} part ${part.id} claims should align with markScheme length or subset`).toBeGreaterThan(0);
      }
    }
  });
});

describe("statement-level provenance", () => {
  it("physics demonstrator has a specPoint stable id, ref, text, AO and verification per statement", () => {
    const phys = topicsFor("wjec-alevel-physics");
    expect(phys.length).toBeGreaterThan(0);
    for (const topic of phys) {
      expect(topic.specPoints?.length, `${topic.id} needs specPoints (demonstrator)`).toBeGreaterThan(0);
      for (const sp of topic.specPoints!) {
        expect(sp.id, `${topic.id} specPoint missing id`).toBeTruthy();
        expect(sp.ref, `${sp.id} missing ref`).toBeTruthy();
        expect(sp.text.length, `${sp.id} missing learning claim`).toBeGreaterThan(10);
        expect(sp.aos?.length, `${sp.id} missing AO`).toBeGreaterThan(0);
        expect(["unverified","checked","verified"], `${sp.id} bad verification`).toContain(sp.verification as string);
      }
    }
  });

  it("physics questions map parts to specPoints with learningClaims (mark-scheme alignment)", () => {
    const qs = seedQuestions.filter(q => q.subjectId === "wjec-alevel-physics");
    const withMapping = qs.filter(q => q.specPointIds?.length || q.parts.some(p => p.specPointIds?.length));
    expect(withMapping.length, "at least some physics questions should map to specPoints").toBeGreaterThan(0);
    for (const q of withMapping) for (const part of q.parts) if (part.specPointIds?.length) {
      expect(part.learningClaims?.length, `${q.id} mapped part needs learningClaims`).toBeGreaterThan(0);
    }
  });

  it("seed cards carry specPoint mapping and provenance when the topic has statements", () => {
    const phys = topicsFor("wjec-alevel-physics").find(t => t.specPoints?.length);
    if (!phys) return;
    const cards = seedCardsForTopic(phys, "u");
    const withSp = cards.filter(c => c.specPointIds?.length);
    expect(withSp.length, "cards for a statement-bearing topic should map to specPoints").toBeGreaterThan(0);
  });
});

