import { describe, expect, it } from "vitest";
import { seedCards, seedCardsForTopic, upgradeSeedCardFaces } from "@/content/seed-cards";
import { hiddenAnswerShare, keyPointForError, keyPointPrompt, recallStem } from "@/domain/card-prompt";
import { allTopics } from "@/domain/curriculum";
import type { Card, Topic } from "@/domain/types";

// A flashcard whose front already shows its back teaches nothing. Before this
// suite, 1,071 of the 1,900 key-point seed cards printed their whole answer
// on the front ("<topic> — state and explain: <the answer>").

const topics = allTopics();
const cards = seedCards(topics, "prompt-test", new Date("2026-10-01T09:00:00Z"));
const keyPointCards = cards.filter((card) => card.id.includes(":kp:"));
const errorCards = cards.filter((card) => card.id.includes(":err:"));
const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

describe("key-point card fronts", () => {
  it("never contain their own answer", () => {
    const leaking = keyPointCards.filter((card) => squash(card.front).includes(squash(card.back)));
    expect(leaking.map((card) => card.id)).toEqual([]);
  });

  it("always leave a real part of the answer to recall", () => {
    const thin = keyPointCards.filter((card) => hiddenAnswerShare(card.front, card.back) < 0.2);
    expect(thin.map((card) => `${card.front} || ${card.back}`)).toEqual([]);
  });

  it("hide at least 40% of the answer on nearly every card", () => {
    const strong = keyPointCards.filter((card) => hiddenAnswerShare(card.front, card.back) >= 0.4);
    expect(strong.length / keyPointCards.length).toBeGreaterThanOrEqual(0.9);
  });

  it("cue the subject of a statement and withhold the claim", () => {
    expect(recallStem("A tangent to a circle is perpendicular to the radius at the point of contact.")).toBe(
      "A tangent to a circle is",
    );
    expect(recallStem("Efficiency = useful output ÷ total input, always ≤ 1.")).toBe("Efficiency =");
    expect(recallStem("Perpendicular gradients multiply to −1.")).toBe("Perpendicular gradients");
    expect(keyPointPrompt("Kinetics", "Rate of reaction: the change in concentration per unit time.")).toBe(
      "Kinetics — explain: Rate of reaction",
    );
  });

  it("does not split a ratio as if it were a term and its explanation", () => {
    const front = keyPointPrompt("Analysis", "The molecular ion peak gives Mr; the M+2 peak in a 3:1 ratio indicates chlorine.");
    expect(front).not.toContain("explain:");
    expect(front).not.toContain("3:1");
  });
});

describe("common-error cards", () => {
  it("only name a correct approach that is about the same thing as the error", () => {
    for (const card of errorCards) {
      const fix = card.back.split("Correct approach: ")[1];
      if (!fix) continue;
      const error = card.front.split("\n\n")[1]!.replace(/^"|"$/g, "");
      expect(keyPointForError(error, [fix]), card.id).toBe(fix);
    }
  });

  it("drop the correct-approach line rather than pair an unrelated key point", () => {
    const topic: Topic = {
      ...topics[0]!,
      keyPoints: ["The gradient of a displacement–time graph is velocity."],
      commonErrors: ["Treating weight and the normal contact force as a Newton's third law pair."],
    };
    const card = seedCardsForTopic(topic, "u").find((c) => c.id.includes(":err:"))!;
    expect(card.back).toBe("This drops marks. Treating weight and the normal contact force as a Newton's third law pair.");
  });
});

describe("upgrading cards a device already holds", () => {
  const topic = topics.find((t) => t.keyPoints.some((p) => !p.includes(":")) && t.commonErrors.length > 0)!;
  const current = seedCardsForTopic(topic, "u");
  const point = topic.keyPoints.findIndex((p) => !p.includes(":"));
  const kp = current.find((c) => c.id.endsWith(`:kp:${point}`))!;
  const cut = topic.keyPoints[point]!.search(/[;—]| because | which /);
  const clause = (cut > 15 ? topic.keyPoints[point]!.slice(0, cut) : topic.keyPoints[point]!).replace(/\.$/, "").trim();
  const legacyKp: Card = { ...kp, front: `${topic.title} — state and explain: ${clause}`, reps: 9, stability: 41, due: "2031-02-03" };
  const err = current.find((c) => c.id.endsWith(":err:0"))!;
  const legacyErr: Card = { ...err, back: `This drops marks. ${topic.commonErrors[0]}\n\nCorrect approach: ${topic.keyPoints[0]}` };

  it("swaps a legacy generated face for the current one and keeps the schedule", () => {
    const [upgraded] = upgradeSeedCardFaces([legacyKp], current, [topic]);
    expect(upgraded!.front).toBe(kp.front);
    expect(upgraded!.front).not.toBe(legacyKp.front);
    expect({ reps: upgraded!.reps, stability: upgraded!.stability, due: upgraded!.due }).toEqual({ reps: 9, stability: 41, due: "2031-02-03" });
  });

  it("fixes a legacy error card's pairing", () => {
    const [upgraded] = upgradeSeedCardFaces([legacyErr], current, [topic]);
    expect(upgraded!.back).toBe(err.back);
  });

  it("never touches a card the learner edited, or one that is not seed content", () => {
    const edited: Card = { ...legacyKp, front: "My own wording" };
    const manual: Card = { ...legacyKp, origin: "manual" };
    expect(upgradeSeedCardFaces([edited, manual], current, [topic])).toEqual([edited, manual]);
  });

  it("returns an up-to-date card unchanged", () => {
    const [same] = upgradeSeedCardFaces([kp], current, [topic]);
    expect(same).toBe(kp);
  });
});
