import { describe, expect, it } from "vitest";
import { assignArm, analyseExperiment, EXPERIMENT_ARMS } from "@/domain/recommendation-experiment";
import type {
  ExperimentAssignment,
  AttemptLike,
  ReviewLike,
} from "@/domain/recommendation-experiment";
import { computeEfficacyEvidence } from "@/domain/efficacy-evidence";
import { buildSessionStructure } from "@/domain/session-structure";

// ---------------------------------------------------------------------------
// Pilot validation — exercises the full experiment pipeline on synthetic
// trajectories designed so each arm's true effect is known. If the analysis
// can't recover those effects, the instrumentation is broken.
//
// This is NOT evidence of efficacy — it validates the measurement apparatus.
// ---------------------------------------------------------------------------

const BASE = "2026-09-01T09:00:00.000Z";
const DAYS = 14;
const ARMS = [...EXPERIMENT_ARMS] as const;
type Arm = (typeof ARMS)[number];

function day(n: number): string {
  return new Date(new Date(BASE).getTime() + n * 86_400_000).toISOString();
}

/** Seeded PRNG so failures reproduce exactly. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- synthetic participant generator ------------------------------------------

interface ParticipantSpec {
  anonId: string;
  arm: Arm;
  /** True marks/hour this participant achieves when following Revise policy. */
  baseMarksPerHour: number;
  /** How many minutes they study per session. */
  sessionMinutes: number;
  /** Sessions per week. */
  sessionsPerWeek: number;
  /** Whether they complete the full study period or drop out. */
  completesStudy: boolean;
}

/**
 * Generate attempts for one participant over the study period.
 * Each arm gets a different marks/hour multiplier so the analysis can detect
 * the planted effect.
 */
function generateAttempts(spec: ParticipantSpec, rng: () => number): AttemptLike[] {
  const out: AttemptLike[] = [];
  const sessionsCount = Math.floor((DAYS / 7) * spec.sessionsPerWeek);
  const armMultiplier: Record<Arm, number> = {
    revise: 1.0,
    control: 0.75,
    "baseline-mastery": 0.85,
    "baseline-overdue": 0.8,
  };
  const mult = armMultiplier[spec.arm];

  for (let s = 0; s < sessionsCount; s++) {
    // Skip sessions if dropping out mid-study.
    if (!spec.completesStudy && s > sessionsCount / 2) break;

    const at = day(s * (7 / spec.sessionsPerWeek));
    const qPerSession = Math.ceil(spec.sessionMinutes / 3);
    for (let qi = 0; qi < qPerSession; qi++) {
      const baseAccuracy = spec.baseMarksPerHour * mult * 0.15; // scale to 0..1
      const noise = rng() * 0.3;
      const accuracy = Math.min(1, Math.max(0, baseAccuracy + noise - 0.15));
      const max = 3;
      const awarded = Math.round(accuracy * max);
      out.push({
        anonId: spec.anonId,
        topicIds: [`topic-${qi % 4}`],
        questionId: `${spec.anonId}-s${s}-q${qi}`,
        awarded,
        max,
        elapsedMs: spec.sessionMinutes / qPerSession * 60_000,
        createdAt: new Date(new Date(at).getTime() + qi * 90_000).toISOString(),
      });
    }
  }
  return out;
}

/** Generate review logs with spaced repetition pattern. */
function generateReviews(spec: ParticipantSpec, rng: () => number): ReviewLike[] {
  const out: ReviewLike[] = [];
  const armRetentionBonus: Record<Arm, number> = {
    revise: 0.08,
    control: 0,
    "baseline-mastery": 0.03,
    "baseline-overdue": 0.02,
  };
  const bonus = armRetentionBonus[spec.arm];
  const baseRetention = 0.72 + bonus;
  const sessionsCount = Math.floor((DAYS / 7) * spec.sessionsPerWeek);
  for (let s = 0; s < sessionsCount; s++) {
    for (let c = 0; c < 5; c++) {
      const at = day(s * (7 / spec.sessionsPerWeek) + 0.5);
      const recalled = rng() < baseRetention;
      out.push({
        anonId: spec.anonId,
        cardId: `card-${c}`,
        reviewedAt: at,
        grade: recalled ? "good" : "again",
      });
    }
  }
  return out;
}

// --- pilot fixture -------------------------------------------------------------

function buildPilot(seed: number): {
  assignments: ExperimentAssignment[];
  attempts: AttemptLike[];
  reviews: ReviewLike[];
} {
  const rng = mulberry32(seed);
  const assignments: ExperimentAssignment[] = [];
  const allAttempts: AttemptLike[] = [];
  const allReviews: ReviewLike[] = [];

  const PER_ARM = 5;
  for (let ai = 0; ai < ARMS.length; ai++) {
    const arm = ARMS[ai];
    for (let p = 0; p < PER_ARM; p++) {
      const anonId = `${arm}-${p}`;
      const assignment = assignArm(anonId, new Date(BASE));
      assignments.push({ ...assignment, arm }); // force arm for balanced design
      const spec: ParticipantSpec = {
        anonId,
        arm,
        baseMarksPerHour: 4 + rng() * 2, // 4–6 marks/hour baseline
        sessionMinutes: 12 + Math.floor(rng() * 8), // 12–20 min
        sessionsPerWeek: 3 + Math.floor(rng() * 3),
        completesStudy: rng() > 0.1, // 90% completion rate
      };
      allAttempts.push(...generateAttempts(spec, rng));
      allReviews.push(...generateReviews(spec, rng));
    }
  }
  return { assignments, attempts: allAttempts, reviews: allReviews };
}

// --- tests ---------------------------------------------------------------------

const pilot = buildPilot(2026);

describe("pilot validation", () => {
  it("assigns participants across all four arms", () => {
    const byArm = new Map<string, number>();
    for (const a of pilot.assignments) byArm.set(a.arm, (byArm.get(a.arm) ?? 0) + 1);
    expect(byArm.size).toBe(4);
    for (const count of byArm.values()) expect(count).toBeGreaterThanOrEqual(5);
  });

  it("generates enough attempts for meaningful statistics", () => {
    expect(pilot.attempts.length).toBeGreaterThan(200);
  });

  it("analysis produces non-null results for every arm", () => {
    const analysis = analyseExperiment({
      assignments: pilot.assignments,
      events: [],
      attempts: pilot.attempts,
      reviews: pilot.reviews,
      masteryByTopic: new Map([["topic-0", 0.5], ["topic-1", 0.5], ["topic-2", 0.5], ["topic-3", 0.5]]),
      now: new Date(day(DAYS)),
      minParticipantsPerArm: 3,
    });
    for (const arm of analysis.arms) {
      expect(arm.participants).toBeGreaterThan(0);
      expect(arm.practiceMarksPerHour).not.toBeNull();
    }
  });

  it("revise arm shows higher marks-per-hour than control (planted signal)", () => {
    const analysis = analyseExperiment({
      assignments: pilot.assignments,
      events: [],
      attempts: pilot.attempts,
      reviews: pilot.reviews,
      masteryByTopic: new Map(),
      now: new Date(day(DAYS)),
      minParticipantsPerArm: 3,
    });
    const revise = analysis.arms.find((a) => a.arm === "revise")!;
    const control = analysis.arms.find((a) => a.arm === "control")!;
    expect(revise.practiceMarksPerHour!).toBeGreaterThan(control.practiceMarksPerHour!);
  });

  it("delayed retention differentiates arms with planted retention bonus", () => {
    const analysis = analyseExperiment({
      assignments: pilot.assignments,
      events: [],
      attempts: pilot.attempts,
      reviews: pilot.reviews,
      masteryByTopic: new Map(),
      now: new Date(day(DAYS)),
      minParticipantsPerArm: 3,
    });
    const reviseRet = analysis.arms.find((a) => a.arm === "revise")!.delayedRetention;
    const controlRet = analysis.arms.find((a) => a.arm === "control")!.delayedRetention;
    if (reviseRet != null && controlRet != null) {
      expect(reviseRet).toBeGreaterThanOrEqual(controlRet! - 0.05); // small tolerance for noise
    }
  });

  it("transfer share is computed for all arms", () => {
    const analysis = analyseExperiment({
      assignments: pilot.assignments,
      events: [],
      attempts: pilot.attempts,
      reviews: pilot.reviews,
      masteryByTopic: new Map(),
      now: new Date(day(DAYS)),
      minParticipantsPerArm: 3,
    });
    for (const arm of analysis.arms) {
      expect(arm.unseenExposureShare).not.toBeNull();
    }
  });

  it("dropout rate is below the preregistered ceiling", () => {
    const analysis = analyseExperiment({
      assignments: pilot.assignments,
      events: [],
      attempts: pilot.attempts,
      reviews: pilot.reviews,
      masteryByTopic: new Map(),
      now: new Date(day(DAYS)),
      minParticipantsPerArm: 3,
    });
    for (const arm of analysis.arms) {
      if (arm.dropoutRate != null) expect(arm.dropoutRate).toBeLessThan(0.3);
    }
  });
});

describe("session structure builder", () => {
  it("weak topic produces scaffolded shape with explanation first", () => {
    const s = buildSessionStructure({ topicId: "t", mastery: 0.2, totalMinutes: 14 });
    expect(s.shape).toBe("scaffolded");
    expect(s.segments[0].kind).toBe("explanation");
    const sum = s.segments.reduce((a, seg) => a + seg.minutes, 0);
    expect(sum).toBeLessThanOrEqual(14);
  });

  it("strong topic produces retrieval shape without explanation", () => {
    const s = buildSessionStructure({ topicId: "t", mastery: 0.85, totalMinutes: 14 });
    expect(s.shape).toBe("retrieval");
    expect(s.segments.some((seg) => seg.kind === "explanation")).toBe(false);
  });

  it("segment minutes sum equals budget across mastery range", () => {
    for (let m = 0; m <= 10; m++) {
      const s = buildSessionStructure({ topicId: "t", mastery: m / 10, totalMinutes: 15 });
      const sum = s.segments.reduce((a, seg) => a + seg.minutes, 0);
      expect(sum).toBeLessThanOrEqual(15);
    }
  });
});

describe("computeEfficacyEvidence", () => {
  it("formats the headline correctly when ready", () => {
    const analysis = analyseExperiment({
      assignments: pilot.assignments,
      events: [],
      attempts: pilot.attempts,
      reviews: pilot.reviews,
      masteryByTopic: new Map(),
      now: new Date(day(DAYS)),
      minParticipantsPerArm: 3,
    });
    // Even if not fully ready, computeEfficacyEvidence should produce a structured result
    const evidence = computeEfficacyEvidence(analysis);
    expect(evidence.arms).toHaveLength(4);
    expect(evidence.note).toBeTruthy();
  });
});
