import { describe, expect, it } from "vitest";
import { seedCards } from "@/content";
import { allTopics } from "@/domain/curriculum";
import { rankRevisionActions } from "@/domain/revision-engine";
import { gradeCard, isDue, isDueReview, studiedCardTopicIds, toDateOnly } from "@/domain/scheduling";
import { topicShares } from "@/domain/topic-weight";
import { buildMarkRecovery } from "@/domain/mark-recovery";

// ---------------------------------------------------------------------------
// First visit (twelfth pass, 2026-10-12). A mobile walk-through of a fresh
// profile that skipped the quick check landed on "Complete your Mathematics
// reviews — 194 cards due; the later they are done, the more you forget",
// labelled "backed by solid recent evidence". None of it was true: the 194
// were the seeded deck, installed due on day one and never studied. Today
// counted them as owed reviews and treated every topic as touched, so the
// learn-untouched candidates never reached the engine.
// ---------------------------------------------------------------------------

const NOW = new Date("2026-10-12T14:00:00+01:00");
const TODAY = toDateOnly(NOW);
const SUBJECT = "wjec-alevel-maths";

describe("a seeded deck that has never been studied", () => {
  const topics = allTopics([SUBJECT]);
  const cards = seedCards(topics, "u1", NOW).filter((c) => c.subjectId === SUBJECT);

  it("is installed due, but no card is an owed review", () => {
    expect(cards.length).toBeGreaterThan(50);
    expect(cards.every((c) => isDue(c, TODAY))).toBe(true);
    expect(cards.filter((c) => isDueReview(c, TODAY))).toEqual([]);
  });

  it("leaves every topic untouched until a card is studied", () => {
    expect(studiedCardTopicIds(cards).size).toBe(0);
    const studied = gradeCard(cards[0]!, "good", NOW);
    expect(studiedCardTopicIds([studied, ...cards.slice(1)])).toEqual(new Set([cards[0]!.topicId]));
  });

  it("a studied card whose interval has run out is an owed review", () => {
    const studied = gradeCard(cards[0]!, "again", NOW);
    expect(isDueReview(studied, studied.due)).toBe(true);
  });

  it("so the first recommendation is a marked session on an unstarted topic, not a card backlog", () => {
    const shares = topicShares(topics);
    const untouched = topics
      .filter((t) => !studiedCardTopicIds(cards).has(t.id))
      .map((t) => ({ subjectId: t.subjectId, topicId: t.id, label: t.title, share: shares.get(t.id) ?? 0 }));
    const due = cards.filter((c) => isDueReview(c, TODAY)).length;
    const plan = rankRevisionActions({
      now: NOW, subjectIds: [SUBJECT], subjectName: () => "Mathematics", topicTitle: (id) => id,
      mistakes: [], attempts: [], questions: [], recovery: buildMarkRecovery({ mistakes: [], attempts: [], questions: [], now: NOW }), examDates: [],
      supplyByTopic: {}, untouched, topicWeight: (id) => ({ share: shares.get(id) ?? 0, relative: 1 }),
      dueReviews: due ? [{ subjectId: SUBJECT, count: due, overdue: 0 }] : [],
    });
    expect(plan.top?.type).toBe("learn-untouched");
    expect(plan.top?.route.href).toMatch(/^\/adaptive-session\?topic=/);
    expect(plan.actions.some((a) => a.type === "due-reviews")).toBe(false);
  });
});
