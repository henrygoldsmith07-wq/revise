import { describe, expect, it } from "vitest";
import { createCard } from "../src/domain/scheduling";
import { prerequisiteEdges } from "../src/domain/prerequisites";
import {
  diagnosePrerequisiteWeakness,
  diagnosisSentence,
  prerequisiteAncestors,
  signalForTopic,
  type DiagnosisInput,
} from "../src/domain/prerequisite-diagnosis";
import type { Attempt, Card, Mistake, Topic, TopicMastery } from "../src/domain/types";

// ---------------------------------------------------------------------------
// Fixtures: a WJEC A-level Biology set where Photosynthesis depends on Enzymes
// and membrane transport (the real curated chain), plus a two-step Chemistry
// chain (acids-bases ← equilibria ← moles) for depth selection.
// ---------------------------------------------------------------------------

const NOW = new Date("2026-05-10T12:00:00Z");

const PHOTO = "wjec-alevel-biology.photosynthesis";
const ENZYMES = "wjec-alevel-biology.enzymes";
const MEMBRANES = "wjec-alevel-biology.membranes-transport";

const ACIDS = "wjec-alevel-chemistry.acids-bases";
const EQUILIBRIA = "wjec-alevel-chemistry.equilibria";
const MOLES = "wjec-alevel-chemistry.moles";

function topic(id: string, title: string): Topic {
  const subjectId = id.slice(0, id.lastIndexOf("."));
  return {
    id,
    subjectId,
    unitId: `${subjectId}.u1`,
    title,
    order: 1,
    intrinsicDifficulty: 3,
    summary: `${title} summary.`,
    keyPoints: ["point"],
    commonErrors: ["error"],
  };
}

const topics = [
  topic(PHOTO, "Photosynthesis"),
  topic(ENZYMES, "Enzymes and biological reactions"),
  topic(MEMBRANES, "Cell membranes and transport"),
  topic(ACIDS, "Acids and bases"),
  topic(EQUILIBRIA, "Equilibria"),
  topic(MOLES, "Moles"),
];

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function mistake(id: string, topicId: string, opts: { daysAgo?: number; resolved?: boolean; marksLost?: number } = {}): Mistake {
  return {
    id,
    userId: "local",
    subjectId: topicId.slice(0, topicId.lastIndexOf(".")),
    topicId,
    description: "miss",
    category: "recall",
    resolved: opts.resolved ?? false,
    marksLost: opts.marksLost ?? 2,
    createdAt: opts.daysAgo == null ? daysAgo(1) : daysAgo(opts.daysAgo),
  };
}

function attempt(id: string, topicId: string, awarded: number, max = 10, createdAt = daysAgo(2)): Attempt {
  return {
    id,
    userId: "local",
    questionId: `q-${id}`,
    subjectId: topicId.slice(0, topicId.lastIndexOf(".")),
    topicIds: [topicId],
    answers: {},
    marked: [],
    awarded,
    max,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 60_000,
    mode: "practice",
    createdAt,
  };
}

function card(topicId: string, studied: boolean): Card {
  const base = createCard(
    {
      id: `card-${topicId}-${studied ? "s" : "u"}`,
      userId: "local",
      subjectId: topicId.slice(0, topicId.lastIndexOf(".")),
      topicId,
      front: "front",
      back: "back",
      origin: "seed",
    },
    NOW,
  );
  return studied ? { ...base, reps: 3, due: daysAgo(0).slice(0, 10) } : base;
}

function masteryRow(topicId: string, overrides: Partial<TopicMastery> = {}): TopicMastery {
  return {
    topicId,
    subjectId: topicId.slice(0, topicId.lastIndexOf(".")),
    mastery: 0.8,
    retention: 0.9,
    confidence: 0.6,
    cardsTotal: 5,
    cardsDue: 0,
    attempts: 6,
    accuracy: 0.8,
    lastStudiedAt: daysAgo(1),
    weak: false,
    ...overrides,
  };
}

function input(overrides: Partial<DiagnosisInput> = {}): DiagnosisInput {
  return {
    topicId: PHOTO,
    topics,
    attempts: [],
    mistakes: [],
    mastery: [],
    cards: [],
    now: NOW,
    ...overrides,
  };
}

/** Two unresolved recent misses on the target: repeated failure. */
function photoFailures(): Mistake[] {
  return [mistake("p1", PHOTO, { marksLost: 2 }), mistake("p2", PHOTO, { marksLost: 3 })];
}

describe("repeated-failure detection", () => {
  it("stays silent when the topic is not repeatedly failing", () => {
    const d = diagnosePrerequisiteWeakness(
      input({ mistakes: [mistake("old", PHOTO, { daysAgo: 20, resolved: true })] }),
    );
    expect(d.failing).toBe(false);
    expect(d.verdict).toBeNull();
    expect(diagnosisSentence({ diagnosis: d, targetTitle: "Photosynthesis" })).toBeNull();
  });

  it("treats two recent misses as repeated failure", () => {
    const d = diagnosePrerequisiteWeakness(input({ mistakes: photoFailures() }));
    expect(d.failing).toBe(true);
    expect(d.recentMisses).toBe(2);
    expect(d.recentMarksLost).toBe(5);
  });

  it("ignores misses outside the 7-day window", () => {
    const d = diagnosePrerequisiteWeakness(
      input({ mistakes: [mistake("old", PHOTO, { daysAgo: 8, resolved: true })] }),
    );
    expect(d.failing).toBe(false);
    expect(d.recentMisses).toBe(0);
  });
});

describe("upstream attribution", () => {
  it("points at a weak prerequisite instead of the failing topic itself", () => {
    const d = diagnosePrerequisiteWeakness(
      input({
        mistakes: [
          ...photoFailures(),
          mistake("m1", ENZYMES, { marksLost: 4 }),
          mistake("m2", MEMBRANES, { marksLost: 1, daysAgo: 30, resolved: true }),
        ],
        attempts: [attempt("a1", ENZYMES, 3), attempt("ok-m", MEMBRANES, 9, 10, daysAgo(4))],
        mastery: [masteryRow(MEMBRANES)],
        cards: [card(MEMBRANES, true)],
      }),
    );
    expect(d.failing).toBe(true);
    expect(d.verdict?.kind).toBe("prereq-first");
    if (d.verdict?.kind !== "prereq-first") throw new Error("unreachable");
    expect(d.verdict.prereqTopicId).toBe(ENZYMES);
    expect(d.prerequisites.find((p) => p.topicId === ENZYMES)?.state).toBe("weak");
    expect(d.prerequisites.find((p) => p.topicId === MEMBRANES)?.state).toBe("secure");
  });

  it("resolves the sentence to plain, honest copy naming both topics", () => {
    const d = diagnosePrerequisiteWeakness(
      input({
        mistakes: [...photoFailures(), mistake("m1", ENZYMES, { marksLost: 4 })],
        attempts: [attempt("a1", ENZYMES, 3)],
      }),
    );
    const sentence = diagnosisSentence({ diagnosis: d, targetTitle: "Photosynthesis", prereqTitle: "Enzymes and biological reactions" });
    expect(sentence).toContain("lost 5 marks on Photosynthesis");
    expect(sentence).toContain("not at more Photosynthesis questions");
    expect(sentence).toContain("Enzymes and biological reactions is where it breaks");
    expect(sentence).toContain("Fix Enzymes and biological reactions first");
  });

  it("prefers the deeper root when two steps of the chain are weak", () => {
    const d = diagnosePrerequisiteWeakness(
      input({
        topicId: ACIDS,
        mistakes: [
          mistake("a1", ACIDS, { marksLost: 2 }),
          mistake("a2", ACIDS, { marksLost: 2 }),
          mistake("e1", EQUILIBRIA, { marksLost: 2 }),
          mistake("mo1", MOLES, { marksLost: 2 }),
        ],
      }),
    );
    expect(d.verdict?.kind).toBe("prereq-first");
    if (d.verdict?.kind !== "prereq-first") throw new Error("unreachable");
    expect(d.verdict.prereqTopicId).toBe(MOLES);
    expect(prerequisiteAncestors(ACIDS, prerequisiteEdges())).toContain(EQUILIBRIA);
    expect(prerequisiteAncestors(ACIDS, prerequisiteEdges())).toContain(MOLES);
  });

  it("names a mid-chain weak step when the root is secure", () => {
    const d = diagnosePrerequisiteWeakness(
      input({
        topicId: ACIDS,
        mistakes: [mistake("a1", ACIDS), mistake("a2", ACIDS), mistake("e1", EQUILIBRIA)],
        attempts: [attempt("ok", MOLES, 9), attempt("ok2", MOLES, 8, 10, daysAgo(4))],
        mastery: [masteryRow(MOLES)],
        cards: [card(MOLES, true)],
      }),
    );
    expect(d.verdict?.kind).toBe("prereq-first");
    if (d.verdict?.kind !== "prereq-first") throw new Error("unreachable");
    expect(d.verdict.prereqTopicId).toBe(EQUILIBRIA);
  });

  it("treats an unmeasured foundation as unproven, not weak, and steers there", () => {
    const d = diagnosePrerequisiteWeakness(
      input({
        mistakes: [...photoFailures(), mistake("m1", MEMBRANES, { resolved: true, daysAgo: 30 })],
        attempts: [attempt("ok", MEMBRANES, 9)],
        mastery: [masteryRow(MEMBRANES)],
        cards: [card(MEMBRANES, true)],
        // Enzymes: no attempts, no mistakes, no cards, no schedule.
      }),
    );
    expect(d.verdict?.kind).toBe("prereq-unmeasured");
    if (d.verdict?.kind !== "prereq-unmeasured") throw new Error("unreachable");
    expect(d.verdict.prereqTopicId).toBe(ENZYMES);
    const sentence = diagnosisSentence({
      diagnosis: d,
      targetTitle: "Photosynthesis",
      prereqTitle: "Enzymes and biological reactions",
    });
    expect(sentence).toContain("no evidence yet that Enzymes and biological reactions");
    expect(d.prerequisites.find((p) => p.topicId === ENZYMES)?.state).toBe("unmeasured");
  });

  it("keeps assigning the topic when every prerequisite holds", () => {
    const d = diagnosePrerequisiteWeakness(
      input({
        mistakes: photoFailures(),
        attempts: [
          attempt("e1", ENZYMES, 9),
          attempt("e2", ENZYMES, 8, 10, daysAgo(4)),
          attempt("m1", MEMBRANES, 9),
        ],
        mastery: [masteryRow(ENZYMES), masteryRow(MEMBRANES)],
        cards: [card(ENZYMES, true), card(MEMBRANES, true)],
      }),
    );
    expect(d.verdict?.kind).toBe("topic-itself");
    const sentence = diagnosisSentence({ diagnosis: d, targetTitle: "Photosynthesis", prereqTitle: "X" });
    expect(sentence).toContain("Keep practising Photosynthesis");
    expect(sentence).toContain("not upstream");
  });
});

describe("signal states stay honest", () => {
  it("marks low recent accuracy as weak", () => {
    const s = signalForTopic({
      topicId: ENZYMES,
      topics,
      attempts: [attempt("a1", ENZYMES, 2)],
      mistakes: [],
      mastery: [],
      cards: [],
      now: NOW,
    });
    expect(s.accuracyRecent).toBeCloseTo(0.2, 5);
    expect(s.state).toBe("weak");
  });

  it("marks an actively studied topic with no negatives as secure", () => {
    const s = signalForTopic({
      topicId: MEMBRANES,
      topics,
      attempts: [attempt("a1", MEMBRANES, 8)],
      mistakes: [],
      mastery: [masteryRow(MEMBRANES)],
      cards: [card(MEMBRANES, true)],
      now: NOW,
    });
    expect(s.state).toBe("secure");
  });

  it("marks an untouched topic as unmeasured, never weak or secure", () => {
    const s = signalForTopic({
      topicId: ENZYMES,
      topics,
      attempts: [],
      mistakes: [],
      mastery: [],
      cards: [],
      now: NOW,
    });
    expect(s.state).toBe("unmeasured");
    expect(s.recentMisses).toBe(0);
    expect(s.accuracyAll).toBeNull();
  });
});

describe("curated Biology chains", () => {
  it("connect photosynthesis to enzymes and membrane transport for A-level boards", () => {
    const edges = prerequisiteEdges();
    for (const board of ["wjec-alevel", "aqa-alevel", "edexcel-alevel", "ocr-alevel"]) {
      const photo = `${board}-biology.photosynthesis`;
      expect(edges.some((e) => e.topicId === photo && e.prerequisiteId === `${board}-biology.enzymes`)).toBe(true);
      expect(edges.some((e) => e.topicId === photo && e.prerequisiteId === `${board}-biology.membranes-transport`)).toBe(true);
    }
  });
});
