import { describe, expect, it } from "vitest";
import { allTopics } from "@/domain/curriculum";
import {
  diagramScore,
  isDiagramCard,
  isDiagramComplete,
  parseDiagram,
  placeLabel,
  serialiseDiagram,
  startDiagramRound,
} from "@/domain/diagrams";
import { createCard } from "@/domain/scheduling";
import { shuffleWithSeed } from "@/domain/shuffle";
import {
  answerLearn,
  buildChoices,
  buildMatchBoard,
  buildTest,
  DEFAULT_TEST_SPEC,
  gradeTest,
  isMatch,
  learnProgress,
  matchScore,
  matchesWritten,
  startLearnSession,
  strugglingCards,
} from "@/domain/study-modes";
import type { Card } from "@/domain/types";

const NOW = new Date("2025-06-10T09:00:00.000Z");
const TOPIC = allTopics()[0];
const OTHER_TOPIC = allTopics().find((t) => t.subjectId !== TOPIC.subjectId)!;

function card(id: string, front: string, back: string, topicId = TOPIC.id, subjectId = TOPIC.subjectId): Card {
  return createCard({ id, userId: "u", subjectId, topicId, front, back }, NOW);
}

const deck = [
  card("a", "What is the unit of force?", "The newton"),
  card("b", "What is the unit of energy?", "The joule"),
  card("c", "What is the unit of power?", "The watt"),
  card("d", "What is the unit of charge?", "The coulomb"),
  card("e", "What is the unit of pressure?", "The pascal"),
];

describe("shuffleWithSeed", () => {
  it("is deterministic for a seed and never mutates its input", () => {
    const order = deck.map((c) => c.id);
    expect(shuffleWithSeed(deck, 7).map((c) => c.id)).toEqual(shuffleWithSeed(deck, 7).map((c) => c.id));
    expect(deck.map((c) => c.id)).toEqual(order);
  });

  it("keeps every element", () => {
    expect(shuffleWithSeed(deck, 3).map((c) => c.id).sort()).toEqual(deck.map((c) => c.id).sort());
  });
});

describe("learn mode", () => {
  it("starts every card at recognition", () => {
    const session = startLearnSession(deck, 1);
    expect(session.queue).toHaveLength(deck.length);
    expect(Object.values(session.states).every((s) => s.stage === "multiple-choice")).toBe(true);
  });

  it("promotes recognition → production → done, never skipping production", () => {
    let session = startLearnSession(deck, 1);
    const id = session.queue[0];

    session = answerLearn(session, id, true);
    expect(session.states[id].stage).toBe("typed");
    // Still in the queue: recognising it is not the same as knowing it.
    expect(session.queue).toContain(id);

    session = answerLearn(session, id, true);
    expect(session.states[id].stage).toBe("done");
    expect(session.queue).not.toContain(id);
  });

  it("demotes to recognition on a wrong answer and re-queues it soon", () => {
    let session = startLearnSession(deck, 1);
    const id = session.queue[0];
    session = answerLearn(session, id, true);
    session = answerLearn(session, id, false);

    expect(session.states[id].stage).toBe("multiple-choice");
    expect(session.states[id].wrongTotal).toBe(1);
    // Re-queued near the front, not dumped at the end of the session.
    expect(session.queue.indexOf(id)).toBeLessThanOrEqual(3);
  });

  it("tracks progress and accuracy", () => {
    let session = startLearnSession(deck, 1);
    const id = session.queue[0];
    session = answerLearn(session, id, true);
    session = answerLearn(session, id, true);

    const progress = learnProgress(session);
    expect(progress.done).toBe(1);
    expect(progress.total).toBe(deck.length);
    expect(progress.accuracy).toBe(1);
  });

  it("flags cards that keep coming back wrong", () => {
    let session = startLearnSession(deck, 1);
    const id = session.queue[0];
    for (let i = 0; i < 3; i++) session = answerLearn(session, id, false);
    expect(strugglingCards(session)).toContain(id);
  });

  it("ignores an answer for a card that is not in the session", () => {
    const session = startLearnSession(deck, 1);
    expect(answerLearn(session, "not-here", true)).toBe(session);
  });
});

describe("buildChoices", () => {
  it("always includes the right answer and fills to the requested count", () => {
    const choices = buildChoices(deck[0], deck, 4, 1);
    expect(choices).toContain(deck[0].back);
    expect(choices).toHaveLength(4);
    expect(new Set(choices).size).toBe(4);
  });

  it("prefers distractors from the same topic, which are the plausible ones", () => {
    const mixed = [...deck, card("far", "Unrelated", "Something else entirely", OTHER_TOPIC.id, OTHER_TOPIC.subjectId)];
    const choices = buildChoices(deck[0], mixed, 4, 1);
    expect(choices).not.toContain("Something else entirely");
  });

  it("copes with a pool too small to fill the options", () => {
    const choices = buildChoices(deck[0], [deck[0]], 4, 1);
    expect(choices).toEqual([deck[0].back]);
  });
});

describe("matchesWritten", () => {
  it("ignores case, punctuation and articles", () => {
    expect(matchesWritten("the newton", "The newton (N)")).toBe(true);
    expect(matchesWritten("NEWTON!", "newton")).toBe(true);
  });

  it("requires the content words on a short answer", () => {
    expect(matchesWritten("joule", "The newton")).toBe(false);
    expect(matchesWritten("", "The newton")).toBe(false);
  });

  it("passes a long answer on most of its content words, not all", () => {
    const expected = "Concentration of reactants falls so there are fewer successful collisions per second";
    expect(matchesWritten("concentration of reactants falls, fewer successful collisions per second", expected)).toBe(true);
    expect(matchesWritten("something about chemistry", expected)).toBe(false);
  });
});

describe("test mode", () => {
  it("builds only the requested question kinds", () => {
    const mcqOnly = buildTest(deck, { multipleChoice: true, written: false, trueFalse: false, limit: 5 }, 1);
    expect(mcqOnly.every((q) => q.kind === "multiple-choice")).toBe(true);
    expect(buildTest(deck, { multipleChoice: false, written: false, trueFalse: false, limit: 5 }, 1)).toEqual([]);
  });

  it("respects the limit", () => {
    expect(buildTest(deck, { ...DEFAULT_TEST_SPEC, limit: 2 }, 1)).toHaveLength(2);
  });

  it("points multiple choice at a real option index", () => {
    const questions = buildTest(deck, { multipleChoice: true, written: false, trueFalse: false, limit: 5 }, 1);
    for (const question of questions) {
      expect(question.options![question.correctIndex!]).toBe(question.answer.trim());
    }
  });

  it("makes some true/false statements false, or the mode tests nothing", () => {
    const questions = buildTest(deck, { multipleChoice: false, written: false, trueFalse: true, limit: 5 }, 1);
    const answers = new Set(questions.map((q) => q.correctIndex));
    expect(answers.size).toBeGreaterThan(1);
  });

  it("grades every kind and lists the cards to revisit", () => {
    const questions = buildTest(deck, DEFAULT_TEST_SPEC, 1);
    const answers: Record<string, string> = {};
    for (const question of questions) {
      answers[question.id] =
        question.kind === "written" ? question.answer : String(question.correctIndex);
    }
    const perfect = gradeTest(questions, answers);
    expect(perfect.correct).toBe(questions.length);
    expect(perfect.percent).toBe(100);
    expect(perfect.wrongCardIds).toEqual([]);

    const blank = gradeTest(questions, {});
    expect(blank.correct).toBe(0);
    expect(blank.wrongCardIds).toHaveLength(questions.length);
  });
});

describe("match game", () => {
  it("lays out two tiles per card and shuffles them", () => {
    const board = buildMatchBoard(deck, 4, 1);
    expect(board).toHaveLength(8);
    expect(board.filter((t) => t.side === "front")).toHaveLength(4);
  });

  it("matches only a front with its own back", () => {
    const board = buildMatchBoard(deck, 3, 1);
    const front = board.find((t) => t.side === "front")!;
    const ownBack = board.find((t) => t.cardId === front.cardId && t.side === "back")!;
    const otherBack = board.find((t) => t.cardId !== front.cardId && t.side === "back")!;

    expect(isMatch(front, ownBack)).toBe(true);
    expect(isMatch(front, otherBack)).toBe(false);
    // Two fronts of the same card cannot exist, but two identical sides must
    // never count as a pair either.
    expect(isMatch(front, front)).toBe(false);
  });

  it("penalises mistakes in the score", () => {
    expect(matchScore(30_000, 0)).toBe(30);
    expect(matchScore(30_000, 2)).toBe(40);
  });
});

describe("diagrams", () => {
  const spec = {
    imageUrl: "data:image/png;base64,AAAA",
    hotspots: [
      { id: "1", x: 20, y: 30, label: "Nucleus" },
      { id: "2", x: 70, y: 60, label: "Mitochondrion" },
    ],
  };
  const diagramCard = card("diagram", "Label the cell", serialiseDiagram(spec));

  it("round-trips through a card's back", () => {
    expect(isDiagramCard(diagramCard)).toBe(true);
    expect(parseDiagram(diagramCard)).toEqual(spec);
  });

  it("is not confused by an ordinary card", () => {
    expect(parseDiagram(deck[0])).toBeNull();
    expect(isDiagramCard(deck[0])).toBe(false);
  });

  it("refuses a damaged payload rather than half-rendering it", () => {
    expect(parseDiagram(card("x", "f", "@diagram:{not json"))).toBeNull();
    expect(parseDiagram(card("x", "f", "@diagram:{\"imageUrl\":\"u\",\"hotspots\":[]}"))).toBeNull();
  });

  it("clamps out-of-range coordinates into the image", () => {
    const wild = card("x", "f", '@diagram:{"imageUrl":"u","hotspots":[{"id":"1","x":-40,"y":900,"label":"L"}]}');
    const parsed = parseDiagram(wild)!;
    expect(parsed.hotspots[0].x).toBe(0);
    expect(parsed.hotspots[0].y).toBe(100);
  });

  it("accepts a correct placement and rejects a wrong one", () => {
    const round = startDiagramRound(spec, 1);
    expect(round.bank).toHaveLength(2);

    const wrong = placeLabel(round, "1", "Mitochondrion");
    expect(wrong.correct).toBe(false);
    expect(wrong.round.wrong).toBe(1);
    // Rejected, not stuck on the diagram in the wrong place.
    expect(wrong.round.placed["1"]).toBeUndefined();

    const right = placeLabel(round, "1", "Nucleus");
    expect(right.correct).toBe(true);
    expect(right.round.placed["1"]).toBe("Nucleus");
    expect(right.round.bank).not.toContain("Nucleus");
  });

  it("ignores case and spacing when comparing labels", () => {
    const round = startDiagramRound(spec, 1);
    expect(placeLabel(round, "1", "  nucleus ").correct).toBe(true);
  });

  it("reports completion and accuracy", () => {
    let round = startDiagramRound(spec, 1);
    expect(isDiagramComplete(round)).toBe(false);

    round = placeLabel(round, "1", "Mitochondrion").round; // a miss
    round = placeLabel(round, "1", "Nucleus").round;
    round = placeLabel(round, "2", "Mitochondrion").round;

    expect(isDiagramComplete(round)).toBe(true);
    const score = diagramScore(round);
    expect(score.placed).toBe(2);
    expect(score.total).toBe(2);
    expect(score.accuracy).toBeCloseTo(2 / 3, 5);
  });
});
