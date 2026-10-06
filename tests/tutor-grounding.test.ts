import { describe, expect, it } from "vitest";
import {
  buildTutorLearnerContext,
  curriculumPosition,
  suggestTutorStarters,
} from "@/domain/tutor-grounding";
import { tutorFallback } from "@/ai/fallback";
import { allSubjects, getTopic, subjectLabel, topicsFor } from "@/domain/curriculum";
import type { Mistake, Topic, TopicMastery } from "@/domain/types";

// The tutor's grounding decisions: which topic it opens on, why, and what it
// is told about the learner. These are evidence rules — open mistakes only,
// enrolled subjects only, weakest first — so they are pinned here.

function orderedTopics(subjectId: string): Topic[] {
  return [...topicsFor(subjectId)].sort((a, b) => a.order - b.order);
}

const subject = allSubjects().find((s) => topicsFor(s.id).length >= 3);
if (!subject) throw new Error("test needs a registered subject with topics");
const topics = orderedTopics(subject.id);
const topicA = topics[0];
const topicB = topics[1];
const topicC = topics[2];

function mistake(overrides: Partial<Mistake> & Pick<Mistake, "topicId" | "subjectId">): Mistake {
  return {
    id: `m-${overrides.topicId}-${overrides.marksLost ?? 1}-${overrides.category ?? "method"}-${overrides.resolved ?? false}`,
    userId: "u1",
    marksLost: 1,
    description: "lost a point",
    category: "method",
    resolved: false,
    createdAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("suggestTutorStarters", () => {
  it("ranks topics by marks actually lost, not by mistake count", () => {
    const starters = suggestTutorStarters({
      mistakes: [
        mistake({ topicId: topicA.id, subjectId: subject.id, marksLost: 1 }),
        mistake({ topicId: topicB.id, subjectId: subject.id, marksLost: 3 }),
      ],
      subjectIds: [subject.id],
    });
    expect(starters[0].topicId).toBe(topicB.id);
    expect(starters[0].marksLost).toBe(3);
    expect(starters[1].topicId).toBe(topicA.id);
  });

  it("excludes resolved mistakes and subjects the learner is not enrolled in", () => {
    const other = allSubjects().find((s) => s.id !== subject.id);
    const starters = suggestTutorStarters({
      mistakes: [
        mistake({ topicId: topicA.id, subjectId: subject.id, resolved: true }),
        ...(other
          ? [mistake({ topicId: orderedTopics(other.id)[0].id, subjectId: other.id, marksLost: 9 })]
          : []),
      ],
      subjectIds: [subject.id],
    });
    expect(starters.every((starter) => starter.subjectId === subject.id)).toBe(true);
    expect(starters[0].openMistakes).toBe(0);
  });

  it("names a repeating loss category when one dominates", () => {
    const starters = suggestTutorStarters({
      mistakes: [
        mistake({ topicId: topicA.id, subjectId: subject.id, category: "method", marksLost: 2 }),
        mistake({ topicId: topicA.id, subjectId: subject.id, category: "method", marksLost: 2 }),
        mistake({ topicId: topicA.id, subjectId: subject.id, category: "recall", marksLost: 1 }),
      ],
      subjectIds: [subject.id],
    });
    expect(starters[0].reason).toContain("repeat method slips");
    expect(starters[0].dominantCategory).toBe("method");
  });

  it("falls back to the start of the spec when nothing is open", () => {
    const starters = suggestTutorStarters({ mistakes: [], subjectIds: [subject.id], limit: 2 });
    expect(starters[0].topicId).toBe(topicA.id);
    expect(starters[0].reason).toContain("start teaching from the spec");
  });

  it("respects the limit", () => {
    const starters = suggestTutorStarters({
      mistakes: [
        mistake({ topicId: topicA.id, subjectId: subject.id, marksLost: 3 }),
        mistake({ topicId: topicB.id, subjectId: subject.id, marksLost: 2 }),
        mistake({ topicId: topicC.id, subjectId: subject.id, marksLost: 1 }),
      ],
      subjectIds: [subject.id],
      limit: 2,
    });
    expect(starters).toHaveLength(2);
  });
});

describe("curriculumPosition", () => {
  it("states the topic's place in its specification", () => {
    expect(curriculumPosition(topicA)).toBe(`Topic 1 of ${topics.length} · ${subjectLabel(subject.id)}`);
    expect(curriculumPosition(topicB)).toBe(`Topic 2 of ${topics.length} · ${subjectLabel(subject.id)}`);
  });
});

describe("buildTutorLearnerContext", () => {
  const mastery = (overrides: Partial<TopicMastery> = {}): TopicMastery =>
    ({
      topicId: topicA.id,
      subjectId: subject.id,
      mastery: 0.42,
      retention: 0.6,
      confidence: 0.5,
      cardsTotal: 10,
      cardsDue: 2,
      attempts: 4,
      accuracy: 0.5,
      ...overrides,
    }) as TopicMastery;

  it("carries the position, the mastery read and the open points", () => {
    const context = buildTutorLearnerContext({
      topic: topicA,
      mistakes: [
        mistake({ topicId: topicA.id, subjectId: subject.id, point: "State the unit", marksLost: 1 }),
        mistake({ topicId: topicA.id, subjectId: subject.id, point: "Use g = 9.81", marksLost: 2 }),
      ],
      mastery: mastery(),
    });
    expect(context.position).toContain(`Topic 1 of ${topics.length}`);
    expect(context.masteryLine).toBe("42% mastery, 50% accuracy across 4 attempts");
    expect(context.openMistakes).toHaveLength(2);
    expect(context.openMistakes[0].point).toBe("Use g = 9.81");
  });

  it("falls back to the mistake description when no mark-scheme point was recorded", () => {
    const context = buildTutorLearnerContext({
      topic: topicA,
      mistakes: [
        mistake({ topicId: topicA.id, subjectId: subject.id, description: "dropped the sign", point: undefined }),
      ],
    });
    expect(context.openMistakes[0].point).toBe("dropped the sign");
    expect(context.masteryLine).toBeUndefined();
  });

  it("ignores resolved mistakes and other topics", () => {
    const context = buildTutorLearnerContext({
      topic: topicA,
      mistakes: [
        mistake({ topicId: topicA.id, subjectId: subject.id, resolved: true }),
        mistake({ topicId: topicB.id, subjectId: subject.id }),
      ],
    });
    expect(context.openMistakes).toHaveLength(0);
  });
});

describe("tutorFallback", () => {
  it("says plainly when the topic is not in the local curriculum", () => {
    const reply = tutorFallback("not-a-topic", 0, { openMistakes: [] });
    expect(reply.reply).toContain("Pick a topic");
    expect(reply.suggestPractice).toBe(false);
  });

  it("coaches through the exact lost points when the learner has them", () => {
    const reply = tutorFallback(topicA.id, 0, {
      openMistakes: [{ point: "Use g = 9.81", category: "method", marksLost: 2 }],
    });
    expect(reply.reply).toContain("Use g = 9.81");
    expect(reply.checkQuestion).toBeTruthy();
    expect(reply.suggestPractice).toBe(true);
  });

  it("cycles through the lost points as the conversation continues", () => {
    const learner = {
      openMistakes: [
        { point: "first point", category: "recall", marksLost: 1 },
        { point: "second point", category: "method", marksLost: 1 },
      ],
    };
    expect(tutorFallback(topicA.id, 0, learner).reply).toContain("first point");
    expect(tutorFallback(topicA.id, 1, learner).reply).toContain("second point");
  });

  it("teaches from the key points when nothing is open", () => {
    const reply = tutorFallback(topicA.id, 0, { openMistakes: [] });
    expect(reply.reply).toContain(topicA.title);
    expect(reply.checkQuestion).toBeTruthy();
    expect(reply.suggestPractice).toBe(false);
    expect(tutorFallback(topicA.id, 2, { openMistakes: [] }).suggestPractice).toBe(true);
  });
});

// The registry topic must really exist, so a curriculum reshuffle fails here
// rather than silently pointing the tutor at a dead topic.
it("uses topics that exist in the curriculum", () => {
  expect(getTopic(topicA.id)).toBeDefined();
  expect(getTopic(topicB.id)).toBeDefined();
});
