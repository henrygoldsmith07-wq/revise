import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { classifyTopic } from "@/domain/topic-status";
import { LEARNER_STATE_TONE } from "@/domain/learner-state";
import type { TopicMastery } from "@/domain/types";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function mastery(overrides: Partial<TopicMastery>): TopicMastery {
  return {
    topicId: "t1",
    subjectId: "aqa-biology",
    mastery: 0,
    retention: 1,
    confidence: 0.5,
    cardsTotal: 10,
    cardsDue: 0,
    attempts: 0,
    accuracy: 1,
    lastStudiedAt: null,
    weak: false,
    ...overrides,
  };
}

describe("classifyTopic — plain language, not just FSRS numbers", () => {
  it("a topic with no mastery row is Untouched, never a red 0%", () => {
    expect(classifyTopic(undefined).status).toBe("untouched");
    expect(classifyTopic(undefined).label).toBe("Untouched");
    expect(classifyTopic(undefined).explanation).toMatch(/no cards reviewed/i);
  });

  it("zero-attempt rows are Untouched even with default numeric fields", () => {
    expect(classifyTopic(mastery({})).status).toBe("untouched");
    expect(classifyTopic(mastery({ mastery: 0.9 })).status).toBe("untouched"); // no evidence yet
  });

  it("solid topics are Covered", () => {
    const info = classifyTopic(mastery({ attempts: 40, mastery: 0.85, retention: 0.97, accuracy: 0.9 }));
    expect(info.status).toBe("covered");
    expect(info.explanation).toMatch(/solid|holding|schedule/i);
  });

  it("fading recall is Shaky even at high raw mastery", () => {
    const info = classifyTopic(mastery({ attempts: 40, mastery: 0.85, retention: 0.55, accuracy: 0.9 }));
    expect(info.status).toBe("shaky");
    expect(info.explanation).toMatch(/fading|forgot/i);
  });

  it("low mastery with evidence is Shaky", () => {
    expect(classifyTopic(mastery({ attempts: 12, mastery: 0.3, retention: 0.95, accuracy: 0.9 })).status).toBe("shaky");
  });

  it("due cards at the edge of forgetting are Shaky", () => {
    const info = classifyTopic(mastery({ attempts: 12, mastery: 0.75, retention: 0.85, accuracy: 0.9, cardsDue: 4 }));
    expect(info.status).toBe("shaky");
  });

  it("due cards with high recall stay Covered", () => {
    const info = classifyTopic(mastery({ attempts: 12, mastery: 0.75, retention: 0.96, accuracy: 0.9, cardsDue: 2 }));
    expect(info.status).toBe("covered");
  });

  it("low answer accuracy is Shaky", () => {
    expect(
      classifyTopic(mastery({ attempts: 20, mastery: 0.8, retention: 0.96, accuracy: 0.35 })).status,
    ).toBe("shaky");
  });
});

describe("Library per-topic rows", () => {
  const source = src("src/app/library/page.tsx");

  it("every topic row leads with one of the six learner words and keeps the reason on tap", () => {
    expect(source).toContain("LearnerStateTag");
    expect(source).toContain("stateByTopic.get(row.id)");
    expect(source).toContain("topicLifecycle(");
    expect(src("src/components/LearnerStateTag.tsx")).toContain("title={view.detail}");
  });

  it("shows no unexplained mastery percentage or bar in the topic list, and unchecked topics are never red", () => {
    expect(source).not.toContain("studied ? (");
    expect(source).not.toMatch(/Math\.round\(\(mastery\?\.mastery \?\? 0\) \* 100\)\}%/);
    expect(LEARNER_STATE_TONE["not-checked"]).toBe("neutral");
  });
});

describe("TopicStatusTag component", () => {
  const source = src("src/components/TopicStatusTag.tsx");
  it("labels by word with an icon and a tooltip explanation — never colour alone", () => {
    expect(source).toContain("const tone");
    expect(source).toContain("success");
    expect(source).toContain("review");
    expect(source).toContain("neutral");
    expect(source).toContain("title={explanation}");
    expect(source).toContain('aria-hidden="true"');
  });
});
