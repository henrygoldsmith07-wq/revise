import { describe, expect, it } from "vitest";
import { allSubjects, allTopics } from "@/domain/curriculum";
import { buildAdaptiveSession } from "@/domain/adaptive-session";

describe("adaptive session is independent of subject order", () => {
  it("picks the same session whichever order enrolled subjects are listed in", () => {
    const ids = allSubjects().slice(0, 4).map((s) => s.id);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    const topics = allTopics(ids);
    const plan = (subjectIds: string[]) => buildAdaptiveSession({
      topics, cards: [], reviewLogs: [], questions: [], attempts: [], mistakes: [], mastery: [], exams: [], subjectIds, targetMinutes: 20, now: new Date("2026-10-03T12:00:00Z"),
    });
    const reference = plan(ids)?.startHref;
    expect(reference).toBeTruthy();
    for (const order of [[...ids].reverse(), [ids[1]!, ids[0]!, ...ids.slice(2)], [...ids.slice(2), ...ids.slice(0, 2)]]) expect(plan(order)?.startHref).toBe(reference);
  });
});
