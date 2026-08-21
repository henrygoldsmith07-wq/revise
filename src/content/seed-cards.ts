import { createCard } from "@/domain/scheduling";
import type { Card, Id, Topic } from "@/domain/types";

// ---------------------------------------------------------------------------
// Every topic ships with revision content on day one. Cards are derived from
// the authored key points and common errors rather than stored separately, so
// curriculum and content can never drift apart: add a topic and its deck
// exists immediately, in every subject, with no AI call and no network.
//
// Card ids are deterministic (`seed:<topicId>:<kind>:<index>`) so re-seeding
// an existing user is idempotent — their FSRS history survives.
// ---------------------------------------------------------------------------

export function seedCardId(topicId: Id, kind: string, index: number): Id {
  return `seed:${topicId}:${kind}:${index}`;
}

/** Turn a key point into a question. Statements make poor prompts. */
function toPrompt(topic: Topic, point: string): string {
  const colon = point.indexOf(":");
  // "Ionisation energy rises across a period: greater nuclear charge…"
  // becomes a question about the first clause with the rest as the answer.
  if (colon > 12 && colon < point.length - 12) {
    return `${topic.title} — explain: ${point.slice(0, colon).trim()}`;
  }
  return `${topic.title} — state and explain: ${firstClause(point)}`;
}

function firstClause(point: string): string {
  const cut = point.search(/[;—]| because | which /);
  return (cut > 15 ? point.slice(0, cut) : point).replace(/\.$/, "").trim();
}

/**
 * Cloze deletion over the most information-dense term in the sentence. Cloze
 * cards test production rather than recognition, which is what an exam asks
 * for; blanking a stop word would test nothing.
 */
export function makeCloze(sentence: string): { front: string; back: string } | null {
  const candidates = [...sentence.matchAll(/\b[A-Za-z][A-Za-z-]{5,}\b/g)]
    .map((m) => ({ word: m[0], index: m.index ?? 0 }))
    .filter((c) => !/^(because|through|between|against|another|instead|however)$/i.test(c.word));
  if (!candidates.length) return null;
  // The longest word is a decent proxy for the most technical one.
  const pick = candidates.reduce((a, b) => (b.word.length > a.word.length ? b : a));
  const front = sentence.slice(0, pick.index) + "[…]" + sentence.slice(pick.index + pick.word.length);
  return { front, back: pick.word };
}

export function seedCardsForTopic(topic: Topic, userId: Id, now: Date = new Date()): Card[] {
  const cards: Card[] = [];
  // map each keyPoint index -> nearest specPoint (1:1 when counts align) for honest provenance
  const spIds = topic.specPoints?.map((sp) => sp.id) ?? [];

  topic.keyPoints.forEach((point, i) => {
    const linkedSp = spIds.length === topic.keyPoints.length ? [spIds[i]] : spIds.length ? [spIds[Math.min(i, spIds.length - 1)]] : undefined;
    cards.push(
      createCard(
        {
          id: seedCardId(topic.id, "kp", i),
          userId,
          subjectId: topic.subjectId,
          topicId: topic.id,
          front: toPrompt(topic, point),
          back: point,
          kind: /[=+−×÷^√∫Δ]|\b\d/.test(point) ? "equation" : "basic",
          origin: "seed",
          specPointIds: linkedSp,
          source: topic.source ?? "authored",
          licensedSource: topic.licensedSource ?? null,
          verification: topic.verification,
          reviewer: topic.reviewer ?? null,
          lastChecked: topic.lastChecked ?? null,
          specVersion: topic.specVersion,
          // Tags the browser can filter on from day one, without the student
          // having to tag 500 cards by hand.
          tags: ["seed", "key-point", topic.id.split(".").pop() ?? ""],
        } as Parameters<typeof createCard>[0],
        now,
      ),
    );

    const cloze = makeCloze(point);
    // Only the first few points get a cloze twin — otherwise a 4-point topic
    // produces eight near-identical cards and the deck feels like padding.
    if (cloze && i < 2) {
      cards.push(
        createCard(
          {
            id: seedCardId(topic.id, "cloze", i),
            userId,
            subjectId: topic.subjectId,
            topicId: topic.id,
            front: cloze.front,
            back: cloze.back,
            clozeSource: point,
            kind: "cloze",
            origin: "seed",
            specPointIds: linkedSp,
            source: topic.source ?? "authored",
            licensedSource: topic.licensedSource ?? null,
            verification: topic.verification,
            reviewer: topic.reviewer ?? null,
            lastChecked: topic.lastChecked ?? null,
            specVersion: topic.specVersion,
            tags: ["seed", "cloze", topic.id.split(".").pop() ?? ""],
          },
          now,
        ),
      );
    }
  });

  // Common errors become "what is wrong with this?" cards — pre-emptive
  // mistake cards, before the student has had to make the mistake themselves.
  topic.commonErrors.forEach((error, i) => {
    cards.push(
      createCard(
        {
          id: seedCardId(topic.id, "err", i),
          userId,
          subjectId: topic.subjectId,
          topicId: topic.id,
          front: `${topic.title} — an examiner sees this every year. What is wrong with it, and what should you write instead?\n\n"${error}"`,
          back: `This drops marks. ${error}\n\nCorrect approach: ${topic.keyPoints[Math.min(i, topic.keyPoints.length - 1)]}`,
          kind: "basic",
          origin: "seed",
          tags: ["seed", "common-error", topic.id.split(".").pop() ?? ""],
        },
        now,
      ),
    );
  });

  return cards;
}

export function seedCards(topics: Topic[], userId: Id, now: Date = new Date()): Card[] {
  return topics.flatMap((t) => seedCardsForTopic(t, userId, now));
}
