import { describe, expect, it } from "vitest";
import { buildLargeHistoryFixture } from "@/domain/large-history-fixture";
import { computeApplicationMastery } from "@/domain/application-mastery";
import { computeRecallMastery } from "@/domain/recall-mastery";
import { computeTopicMastery } from "@/domain/mastery";

describe("large-history performance contract", () => {
  it("keeps tens of thousands of events within the browser derivation budget", () => {
    const fixture = buildLargeHistoryFixture({ cards: 3_000, reviews: 30_000, attempts: 10_000 });
    const started = performance.now();
    const mastery = computeTopicMastery(fixture);
    const recall = computeRecallMastery({ topics: fixture.topics, cards: fixture.cards, reviewLogs: fixture.reviewLogs });
    const application = computeApplicationMastery({ topics: fixture.topics, questions: [], attempts: fixture.attempts });
    const elapsed = performance.now() - started;

    expect(fixture.cards).toHaveLength(3_000);
    expect(fixture.reviewLogs).toHaveLength(30_000);
    expect(fixture.attempts).toHaveLength(10_000);
    expect(mastery).toHaveLength(fixture.topics.length);
    expect(recall).toHaveLength(fixture.topics.length);
    expect(application).toHaveLength(fixture.topics.length);
    // This is intentionally generous for shared CI runners while catching an
    // accidental quadratic path that would make a normal dashboard unusable.
    expect(elapsed).toBeLessThan(10_000);
  }, 20_000);
});

