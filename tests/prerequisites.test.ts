import { describe, expect, it } from "vitest";
import { allTopics } from "@/domain/curriculum";
import { bestPrerequisiteFix, dependencyReport, dependentsOf, prerequisiteEdges, prerequisitesFor } from "@/domain/prerequisites";
import type { TopicMastery } from "@/domain/types";

function mastery(topicId: string, weak: boolean, masteryVal=0.4): TopicMastery {
  return { topicId, subjectId: topicId.split(".").slice(0,2).join("-"), mastery: masteryVal, retention: 0.5, confidence: 0.5, cardsTotal: 4, cardsDue: 0, attempts: 4, accuracy: masteryVal, lastStudiedAt: null, weak } as unknown as TopicMastery;
}

describe("prerequisite graph", () => {
  it("exposes edges for both boards", () => {
    const edges = prerequisiteEdges();
    expect(edges.some((e) => e.topicId.startsWith("wjec-"))).toBe(true);
    expect(edges.some((e) => e.topicId.startsWith("aqa-"))).toBe(true);
    for (const e of edges) {
      expect(e.topicId).toBeTruthy();
      expect(e.prerequisiteId).toBeTruthy();
    }
  });

  it("prerequisitesFor and dependentsOf are consistent", () => {
    const topic = prerequisiteEdges()[0].topicId;
    const pres = prerequisitesFor(topic);
    expect(pres.length).toBeGreaterThan(0);
    for (const pre of pres) expect(dependentsOf(pre)).toContain(topic);
  });

  it("dependencyReport surfaces blocked weak topics first", () => {
    const edges = prerequisiteEdges();
    // Build a scenario where a downstream topic is blocked by a weak prereq
    const firstEdge = edges.find((e) => allTopics().some((t)=>t.id===e.topicId) && allTopics().some((t)=>t.id===e.prerequisiteId));
    if (!firstEdge) return;
    const report = dependencyReport({
      topics: allTopics(),
      mastery: [
        mastery(firstEdge.topicId, true, 0.3),
        mastery(firstEdge.prerequisiteId, true, 0.2),
      ],
    });
    const first = report[0];
    expect(first).toBeDefined();
    expect(first.blockedBy.some((b)=>b.weak)).toBe(true);
  });

  it("bestPrerequisiteFix picks the weakest prerequisite or highest mph", () => {
    const edges = prerequisiteEdges().slice(0,3);
    if (edges.length < 2) return;
    const rec = bestPrerequisiteFix({
      topics: allTopics(),
      mastery: [
        mastery(edges[0].topicId, true, 0.3), mastery(edges[0].prerequisiteId, true, 0.2),
        mastery(edges[1].topicId, true, 0.3), mastery(edges[1].prerequisiteId, true, 0.4),
      ],
      marksPerHour: new Map([[edges[0].prerequisiteId, 5], [edges[1].prerequisiteId, 1]]),
    });
    expect(rec).not.toBeNull();
    // mph should make the first prereq win despite being weaker
    expect(rec!.prerequisiteId).toBe(edges[0].prerequisiteId);
  });
});
