import { createCard } from "@/domain/scheduling";
import { buildCloze, type BuiltCloze } from "@/domain/cloze";
import { serialiseDiagram } from "@/domain/diagrams";
import { keyPointForError, keyPointPrompt } from "@/domain/card-prompt";
import type { Card, Id, Topic } from "@/domain/types";
import { diagramForTopic } from "./diagram-cards";

// ---------------------------------------------------------------------------
// Every topic ships with revision content on day one. Cards are derived from
// the authored key points and common errors rather than stored separately, so
// curriculum and content can never drift apart: add a topic and its deck
// exists immediately, in every subject, with no AI call and no network.
//
// Card ids are deterministic (`cnt:card:<topicId>:<kind>:<index>`, namespaced
// — see src/data/content-ids.ts) so re-seeding an existing user is idempotent
// — their FSRS history survives — and so operator tooling purging `seed-*`
// fixtures can never take the bank with it.
// ---------------------------------------------------------------------------

export function seedCardId(topicId: Id, kind: string, index: number): Id {
  return `cnt:card:${topicId}:${kind}:${index}`;
}

/**
 * Cloze deletion over the most information-dense term in the sentence. Cloze
 * cards test production rather than recognition, which is what an exam asks
 * for; blanking a stop word would test nothing.
 */
export function makeCloze(sentence: string): BuiltCloze | null {
  const candidates = [...sentence.matchAll(/\b[A-Za-z][A-Za-z-]{5,}\b/g)]
    .map((m) => ({ word: m[0], index: m.index ?? 0 }))
    .filter((c) => !/^(because|through|between|against|another|instead|however)$/i.test(c.word));
  if (!candidates.length) return null;
  // The longest word is a decent proxy for the most technical one.
  const pick = candidates.reduce((a, b) => (b.word.length > a.word.length ? b : a));
  return buildCloze(sentence, pick.word);
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
          front: keyPointPrompt(topic.title, point),
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
            clozeSource: cloze.clozeSource,
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

  // Diagram cards are authored alongside the topic rather than generated at
  // runtime. Their image and hotspot payload stay deterministic, so every
  // exam-board variant gets the same offline labelling exercise without an AI
  // call, while the card still participates in the normal review deck.
  const diagram = diagramForTopic(topic);
  if (diagram) {
    const linkedSp = topic.specPoints?.slice(0, 2).map((sp) => sp.id);
    cards.push(
      createCard(
        {
          id: seedCardId(topic.id, "diagram", 0),
          userId,
          subjectId: topic.subjectId,
          topicId: topic.id,
          front: diagram.front,
          back: serialiseDiagram(diagram.spec),
          kind: "image",
          imageUrl: diagram.spec.imageUrl,
          note: "Active recall: choose each label from memory, then tap the hotspot it belongs to.",
          origin: "seed",
          specPointIds: linkedSp,
          source: topic.source ?? "authored",
          licensedSource: topic.licensedSource ?? null,
          verification: topic.verification,
          reviewer: topic.reviewer ?? null,
          lastChecked: topic.lastChecked ?? null,
          specVersion: topic.specVersion,
          tags: ["seed", ...diagram.tags, topic.id.split(".").pop() ?? ""],
        } as Parameters<typeof createCard>[0],
        now,
      ),
    );
  }

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
          back: errorCardBack(topic, error),
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

/** A common error is only paired with the key point it gets wrong, never an arbitrary one. */
function errorCardBack(topic: Topic, error: string): string {
  const fix = keyPointForError(error, topic.keyPoints);
  return fix ? `This drops marks. ${error}\n\nCorrect approach: ${fix}` : `This drops marks. ${error}`;
}

// ---------------------------------------------------------------------------
// Upgrading cards a device already holds.
//
// Installs never overwrite a stored card, so a fix to the generator would
// otherwise reach new profiles only. The two faces the old generator got
// wrong are reproduced here exactly: a key-point front that printed its own
// answer, and a common-error back whose "correct approach" was whichever key
// point shared its index. A stored card whose face is byte-for-byte that old
// output gets the current face; anything else (the learner edited it) is left
// alone. FSRS fields are never touched. Applied on read, so the next save of
// the card carries the new face to the server.
// ---------------------------------------------------------------------------

function legacyFaces(topic: Topic): Map<Id, Pick<Card, "front" | "back">> {
  const faces = new Map<Id, Pick<Card, "front" | "back">>();
  topic.keyPoints.forEach((point, i) => {
    const cut = point.search(/[;—]| because | which /);
    const clause = (cut > 15 ? point.slice(0, cut) : point).replace(/\.$/, "").trim();
    const colon = point.indexOf(":");
    const front =
      colon > 12 && colon < point.length - 12
        ? `${topic.title} — explain: ${point.slice(0, colon).trim()}`
        : `${topic.title} — state and explain: ${clause}`;
    faces.set(seedCardId(topic.id, "kp", i), { front, back: point });
  });
  topic.commonErrors.forEach((error, i) => {
    faces.set(seedCardId(topic.id, "err", i), {
      front: `${topic.title} — an examiner sees this every year. What is wrong with it, and what should you write instead?\n\n"${error}"`,
      back: `This drops marks. ${error}\n\nCorrect approach: ${topic.keyPoints[Math.min(i, topic.keyPoints.length - 1)]}`,
    });
  });
  return faces;
}

export function upgradeSeedCardFaces(stored: Card[], current: Card[], topics: Topic[]): Card[] {
  const legacy = new Map<Id, Pick<Card, "front" | "back">>();
  for (const topic of topics) for (const [id, face] of legacyFaces(topic)) legacy.set(id, face);
  const fresh = new Map(current.map((card) => [card.id, card] as const));
  return stored.map((card) => {
    if (card.origin !== "seed") return card;
    const old = legacy.get(card.id);
    const now = fresh.get(card.id);
    if (!old || !now || card.front !== old.front || card.back !== old.back) return card;
    if (card.front === now.front && card.back === now.back) return card;
    return { ...card, front: now.front, back: now.back };
  });
}
