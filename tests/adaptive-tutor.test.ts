import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  capabilitySentence,
  capabilityState,
  emptyProfile,
  focusCapability,
  isUnknown,
  recordAttemptObservations,
  recordObservation,
  developmentNeeds,
  aggregateCapability,
} from "@/domain/capability-mastery";
import { buildHintLadder, nextHint, hintEvidenceSource, hintEvidenceMultiplier } from "@/domain/hints";
import { buildTutorSession, type TutorSessionInput } from "@/domain/orchestrator";
import { fadeExample, fadeLevelFor, promoteFade, demoteFade } from "@/domain/worked-examples";
import {
  confusionPairsFromMistakes,
  confusionPairsFromTopics,
  interleave,
  detectConfusion,
} from "@/domain/interleaving";
import { buildRepairPlan, diagnoseMistake, repairProgress } from "@/domain/mistake-repair";
import { LADDER_STAGES, promoteStage, demoteStage, stageFor } from "@/domain/independence-ladder";
import {
  newDiagnosticSession,
  nextDiagnosticQuestion,
  recordDiagnosticAnswer,
  DIAGNOSTIC_MAX_PER_TOPIC,
  type DiagnosticQuestionRef,
} from "@/domain/diagnostic-intake";
import { buildPostSessionClosure, buildTutorClosure } from "@/domain/post-session-closure";
import type { Mistake, Question, Topic } from "@/domain/types";

// The adaptive tutor loop: diagnose → attempt → scaffold → teach → practise →
// transfer → repair → retrieve later. These tests pin the evidence rules
// (unknown ≠ weak, assisted < independent), the orchestrator's phase choices,
// and the gates that stop mistakes closing on view.

function profile(overrides: Partial<ReturnType<typeof emptyProfile>> = {}) {
  return { ...emptyProfile(), ...overrides };
}

function evidence(score: number, obs = 4) {
  return { capability: "recall" as const, evidence: obs, score, seconds: 60 };
}

describe("capability mastery", () => {
  it("treats zero evidence as unknown, never weak", () => {
    const p = profile();
    expect(capabilityState(p.recall)).toBe("unknown");
    expect(isUnknown(p.recall)).toBe(true);
    // Unknown never reads as the weakest measurable thing.
    const needs = developmentNeeds(p);
    expect(needs.every((n) => n.state === "unknown")).toBe(true);
  });

  it("separates evidence per capability", () => {
    const p = recordAttemptObservations(profile(), [
      { capability: "recall", source: "independent", score: 0.9 },
      { capability: "application", source: "independent", score: 0.4 },
    ]);
    expect(p.recall.score).toBe(0.9);
    expect(p.application.score).toBe(0.4);
    expect(p.transfer.score).toBeNull();
    expect(capabilitySentence(p)).toBe("Your recall is strong but application is weak.");
  });

  it("counts assisted success as weaker evidence than independent", () => {
    const independent = recordObservation(evidence(0.8, 1), { source: "independent", score: 1 });
    const assisted = recordObservation(evidence(0.8, 1), { source: "assisted", score: 1 });
    expect(independent.evidence).toBeGreaterThan(assisted.evidence);
    expect(independent.score!).toBeGreaterThan(assisted.score!);
  });

  it("moves thin files faster than thick ones", () => {
    const thin = recordObservation(evidence(0.5, 1), { source: "independent", score: 1 });
    const thick = recordObservation(evidence(0.5, 8), { source: "independent", score: 1 });
    expect(thin.score!).toBeGreaterThan(thick.score!);
  });

  it("focuses on the weakest measurable capability, diagnosing unknowns first", () => {
    const allUnknown = profile();
    expect(focusCapability(allUnknown)).toBe(CAPABILITIES[0]);
    const mixed = recordAttemptObservations(profile(), [
      { capability: "recall", source: "independent", score: 0.9 },
      { capability: "explanation", source: "independent", score: 0.4 },
    ]);
    expect(focusCapability(mixed)).toBe("explanation");
  });

  it("aggregates one capability across topics", () => {
    const a = profile();
    a.recall = evidence(0.9, 2);
    const b = profile();
    b.recall = evidence(0.5, 6);
    const agg = aggregateCapability([a, b], "recall");
    expect(agg.score).toBeCloseTo((0.9 * 2 + 0.5 * 6) / 8, 5);
  });
});

describe("adaptive hints", () => {
  const question = {
    id: "q1",
    stem: "Explain why the rate changes. Then justify it.",
  } as unknown as Question;
  const topic = { keyPoints: ["Collisions per second rise with temperature"], commonErrors: [] };

  it("builds an escalating ladder from cue to worked solution", () => {
    const ladder = buildHintLadder(question, topic);
    expect(ladder.map((h) => h.tier)).toEqual(["cue", "prompt", "scaffold", "worked-solution"]);
    expect(ladder[0].text).toContain("Re-read");
    expect(ladder[3].text).toContain("Worked through");
  });

  it("serves hints one tier at a time", () => {
    const ladder = buildHintLadder(question, topic);
    expect(nextHint(ladder, [])!.tier).toBe("cue");
    expect(nextHint(ladder, ["cue"])!.tier).toBe("prompt");
    expect(nextHint(ladder, ["cue", "prompt", "scaffold", "worked-solution"])).toBeNull();
  });

  it("downgrades evidence as support escalates", () => {
    expect(hintEvidenceSource(null)).toBe("independent");
    expect(hintEvidenceSource("cue")).toBe("assisted");
    expect(hintEvidenceSource("worked-solution")).toBe("viewed");
    expect(hintEvidenceMultiplier("worked-solution")).toBeLessThan(hintEvidenceMultiplier("cue"));
  });
});

describe("worked-example fading", () => {
  const example = { steps: ["Read the forces", "Resolve vertically", "Apply F = ma", "Solve for a"], answer: "a = 2 m/s²" };

  it("fades by evidence: unknown → full, emerging → completion, developing → faded, secure → independent", () => {
    const p = (score: number | null) => {
      const base = profile();
      base.application = { capability: "application", evidence: score === null ? 0 : 4, score, seconds: 0 };
      return base;
    };
    expect(fadeLevelFor(p(null), "application")).toBe("full");
    expect(fadeLevelFor(p(0.4), "application")).toBe("completion");
    expect(fadeLevelFor(p(0.75), "application")).toBe("faded");
    expect(fadeLevelFor(p(0.9), "application")).toBe("independent");
  });

  it("hides progressively more of the solution", () => {
    expect(fadeExample(example, "full").toProduce).toBe(0);
    expect(fadeExample(example, "completion").toProduce).toBe(1);
    const faded = fadeExample(example, "faded");
    expect(faded.shown).toEqual(["Read the forces"]);
    expect(faded.toProduce).toBe(2);
    expect(fadeExample(example, "independent").shown).toHaveLength(0);
  });

  it("promotes on strong independent work and demotes on failure", () => {
    expect(promoteFade("completion", 0.9)).toBe("faded");
    expect(promoteFade("independent", 0.9)).toBe("independent");
    expect(demoteFade("faded", 0.2)).toBe("completion");
    expect(demoteFade("faded", 0.6)).toBe("faded");
  });
});

describe("session orchestrator", () => {
  const input = (profile_: ReturnType<typeof emptyProfile>, totalMinutes?: number): TutorSessionInput => ({
    topicId: "bio.respiration",
    topicTitle: "Respiration",
    profile: profile_,
    totalMinutes,
  });

  it("diagnoses before teaching when the focus is unknown", () => {
    const plan = buildTutorSession(input(profile()));
    expect(plan.phases[0].kind).toBe("diagnose");
    expect(plan.phases.some((p) => p.kind === "teach" || p.kind === "attempt")).toBe(true);
    expect(plan.phases.at(-1)!.kind).toBe("exit-retrieval");
  });

  it("runs try → teach → try again when evidence exists", () => {
    const p = profile();
    p.recall = evidence(0.6);
    const plan = buildTutorSession(input(p));
    const kinds = plan.phases.map((ph) => ph.kind);
    const attempt = kinds.indexOf("attempt");
    const teach = kinds.indexOf("teach");
    const guided = kinds.indexOf("guided-practice");
    expect(attempt).toBeGreaterThanOrEqual(0);
    expect(teach).toBeGreaterThan(attempt);
    expect(guided).toBeGreaterThan(teach);
  });

  it("adds transfer only once the focus is developing", () => {
    const weak = profile();
    weak.recall = evidence(0.55);
    expect(buildTutorSession(input(weak)).phases.some((p) => p.kind === "transfer")).toBe(false);
    const strong = profile();
    strong.recall = evidence(0.75);
    expect(buildTutorSession(input(strong)).phases.some((p) => p.kind === "transfer")).toBe(true);
  });

  it("independent practice has no hint budget; guided has one", () => {
    const p = profile();
    p.recall = evidence(0.6);
    const plan = buildTutorSession(input(p));
    const guided = plan.phases.find((p2) => p2.kind === "guided-practice")!;
    const solo = plan.phases.find((p2) => p2.kind === "independent-practice")!;
    expect(guided.params.hintBudget ?? 0).toBeGreaterThan(0);
    expect(solo.params.hintBudget).toBe(0);
  });

  it("fits the 12–25 minute cap and ends on retrieval", () => {
    for (const minutes of [12, 18, 25]) {
      const p = profile();
      p.recall = evidence(0.8);
      const plan = buildTutorSession(input(p, minutes));
      expect(plan.totalMinutes).toBe(minutes);
      expect(plan.phases.reduce((a, p2) => a + p2.minutes, 0)).toBeLessThanOrEqual(minutes);
      expect(plan.endsOnRetrieval).toBe(true);
      expect(plan.phases.at(-1)!.kind).toBe("exit-retrieval");
    }
  });

  it("carries the evidence sentence the hero card shows", () => {
    const p = profile();
    p.recall = evidence(0.9);
    p.application = { capability: "application", evidence: 3, score: 0.4, seconds: 0 };
    const plan = buildTutorSession(input(p));
    expect(plan.evidenceLine).toBe("Your recall is strong but application is weak.");
    expect(plan.focus).toBe("application");
  });
});

describe("interleaving", () => {
  const topics = [
    { id: "bio.respiration", specPoints: [{ id: "B1" }] },
    { id: "bio.ventilation", specPoints: [{ id: "B1" }] },
    { id: "bio.digestion", specPoints: [{ id: "B2" }] },
  ] as unknown as Topic[];

  it("pairs topics sharing a spec point", () => {
    const pairs = confusionPairsFromTopics(topics);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ a: "bio.respiration", b: "bio.ventilation" });
  });

  it("pairs topics whose mistakes hit the same misconception", () => {
    const mistakes = [
      { misconceptionEntryId: "m1", topicId: "bio.respiration", resolved: false },
      { misconceptionEntryId: "m1", topicId: "bio.ventilation", resolved: false },
    ] as unknown as Mistake[];
    expect(confusionPairsFromMistakes(mistakes)).toHaveLength(1);
  });

  it("alternates topics so method choice is practised", () => {
    const items = [
      { topicId: "bio.respiration" },
      { topicId: "bio.respiration" },
      { topicId: "bio.ventilation" },
      { topicId: "bio.ventilation" },
    ];
    const mixed = interleave(items, { a: "bio.respiration", b: "bio.ventilation", reason: "x" });
    expect(mixed.map((m) => m.topicId)).toEqual([
      "bio.respiration",
      "bio.ventilation",
      "bio.respiration",
      "bio.ventilation",
    ]);
  });

  it("flags a confusion when both sides of a pair were missed", () => {
    const pair = { a: "bio.respiration", b: "bio.ventilation", reason: "x" };
    const results = [
      { topicId: "bio.respiration", correct: false },
      { topicId: "bio.ventilation", correct: false },
    ];
    expect(detectConfusion(results, [pair])).toBe(pair);
    expect(detectConfusion([{ topicId: "bio.respiration", correct: false }], [pair])).toBeNull();
  });
});

describe("mistake repair", () => {
  const mistake = {
    id: "m1",
    category: "method",
    point: "Links ATP hydrolysis to active transport",
    partId: "2b",
    resolved: false,
    retestCount: 0,
  } as unknown as Mistake;

  it("diagnoses from the recorded category", () => {
    expect(diagnoseMistake(mistake)).toContain("Method gap");
  });

  it("builds the full pipeline: diagnose → contrast → micro-practice → transfer → delayed", () => {
    const plan = buildRepairPlan(mistake, ["q1", "q2", "q3"], ["q9"]);
    expect(plan.steps.map((s) => s.kind)).toEqual([
      "diagnose",
      "contrast",
      "micro-practice",
      "transfer-test",
      "delayed-retrieval",
    ]);
    expect(plan.steps[2].questionIds).toEqual(["q1", "q2"]);
    expect(plan.steps[3].questionIds).toEqual(["q9"]);
  });

  it("never closes on view — only a retest that resolved it", () => {
    expect(repairProgress(mistake).canClose).toBe(false);
    const viewed = { ...mistake, resolved: true, retestCount: 0 } as unknown as Mistake;
    expect(repairProgress(viewed).canClose).toBe(false);
    const retested = { ...mistake, resolved: true, retestCount: 2 } as unknown as Mistake;
    expect(repairProgress(retested).canClose).toBe(true);
  });
});

describe("independence ladder", () => {
  it("maps evidence to stages", () => {
    const p = (score: number | null) => {
      const base = profile();
      base.application = { capability: "application", evidence: score === null ? 0 : 4, score, seconds: 0 };
      return base;
    };
    expect(stageFor(p(null), "application")).toBe("guided");
    expect(stageFor(p(0.55), "application")).toBe("guided");
    expect(stageFor(p(0.75), "application")).toBe("timed");
    expect(stageFor(p(0.9), "application")).toBe("full");
  });

  it("promotes on 3+ unaided passes and demotes on failure", () => {
    expect(promoteStage("guided", 0.9, 2)).toBe("guided");
    expect(promoteStage("guided", 0.9, 3)).toBe("independent");
    expect(promoteStage("full", 0.9, 5)).toBe("full");
    expect(demoteStage("timed", 0.3, 2)).toBe("independent");
    expect(demoteStage("timed", 0.6, 2)).toBe("timed");
  });

  it("orders the ladder guided → independent → timed → mixed → full", () => {
    expect(LADDER_STAGES).toEqual(["guided", "independent", "timed", "mixed", "full"]);
  });
});

describe("diagnostic intake", () => {
  const pools: Record<string, DiagnosticQuestionRef[]> = {
    "bio.respiration": [
      { id: "r1", topicId: "bio.respiration", capability: "recall", difficulty: 2 },
      { id: "r2", topicId: "bio.respiration", capability: "application", difficulty: 3 },
    ],
    "bio.ventilation": [
      { id: "v1", topicId: "bio.ventilation", capability: "recall", difficulty: 2 },
    ],
  };

  it("probes recall first, then application", () => {
    let state = newDiagnosticSession(["bio.respiration"]);
    const q1 = nextDiagnosticQuestion(state, pools)!;
    expect(q1.capability).toBe("recall");
    ({ state } = recordDiagnosticAnswer(state, profile(), q1, { correct: true, score: 1, seconds: 30 }));
    const q2 = nextDiagnosticQuestion(state, pools)!;
    expect(q2.capability).toBe("application");
  });

  it("caps probes per topic and keeps unknown topics unknown", () => {
    const state = newDiagnosticSession(["bio.ventilation"]);
    const q = nextDiagnosticQuestion(state, pools)!;
    const before = profile();
    const pass = recordDiagnosticAnswer(state, before, q, { correct: true, score: 1, seconds: 30 });
    // Recall passed with only one probe: the topic stays in rotation, so the
    // capability with no second probe remains unknown.
    expect(pass.state.done).toBe(false);
    const fail = recordDiagnosticAnswer(state, before, q, { correct: false, score: 0, seconds: 40 });
    expect(fail.state.done).toBe(true);
    expect(isUnknown(fail.profile.recall)).toBe(false);
  });

  it("spends at most two probes per topic", () => {
    let state = newDiagnosticSession(["bio.respiration"]);
    let asked = 0;
    while (true) {
      const q = nextDiagnosticQuestion(state, pools);
      if (!q || asked > 6) break;
      const r = recordDiagnosticAnswer(state, profile(), q, { correct: true, score: 1, seconds: 20 });
      state = r.state;
      asked++;
      if (state.done) break;
    }
    expect(state.asked["bio.respiration"]).toBeLessThanOrEqual(DIAGNOSTIC_MAX_PER_TOPIC);
  });
});

describe("tutor session closure", () => {
  it("reports what improved, what is weak, and what was learned", () => {
    const before = profile();
    before.recall = evidence(0.6);
    const after = recordAttemptObservations(before, [
      { capability: "application", source: "independent", score: 0.65 },
    ]);
    const base = buildPostSessionClosure({ session: "practice", attempted: 4, total: 5, awarded: 3, available: 5, elapsedMs: 12 * 60_000 });
    const closure = buildTutorClosure(base, before, after);
    expect(closure.improved.some((l) => l.capability === "application")).toBe(true);
    expect(closure.stillWeak.some((l) => l.capability === "application")).toBe(true);
    expect(closure.learned.some((l) => l.includes("First evidence"))).toBe(true);
    expect(closure.nextBestAction).toContain("next");
  });
});
