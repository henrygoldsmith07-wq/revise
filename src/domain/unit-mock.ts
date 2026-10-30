// ---------------------------------------------------------------------------
// WJEC unit mock papers.
//
// A WJEC AS student sits Unit 1 and Unit 2 as two separate written papers
// (each 1 h 30 min and 80 marks in Biology, Chemistry and Physics). A unit
// mock is built to that real shape: the unit's own duration and raw-mark
// total, questions drawn only from that unit's topics, and marks spread
// across the whole unit the way a real paper samples it, rather than aimed
// at weak topics (that is the bespoke mock's job).
//
// The paper shape comes from the subject's PaperSpec (fed by SPEC_MANIFEST),
// which carries the WJEC specification's duration and marks. Nothing here
// invents a number: a unit without a stated mark total offers no mock.
//
// Trust: a unit mock is a practice paper. Human-verified questions are taken
// first when they exist, but until reviewers approve WJEC questions the paper
// is drawn from the authored bank and says so. It never feeds proof or the
// paper-prediction loop: those filter to trusted content downstream
// (src/state/paper-preview.ts, learning-evidence).
//
// Pure: no clock, randomness or I/O. `now` and `seed` come in as arguments.
// ---------------------------------------------------------------------------

import { trustedAssessmentContent } from "./content-trust";
import { MOCK_RECENT_WINDOW_DAYS } from "./mock-generator";
import { topicUnitNumber, topicsForUnit4Option, type Unit4Option, type YearGroup } from "./year-group";
import type { Attempt, Id, Paper, Question, Subject, Topic } from "./types";

/**
 * Subjects whose topics map to WJEC unit numbers reliably enough to scope a
 * paper to one unit. Maths topics are placed in Units 1-4 by `mathsUnitNumber`
 * (year-group.ts), so a Year 12 Maths student gets Unit 1 and Unit 2 only.
 */
export const UNIT_MOCK_SUBJECTS: readonly Id[] = ["wjec-alevel-biology", "wjec-alevel-chemistry", "wjec-alevel-physics", "wjec-alevel-maths"];

/** The WJEC specification each paper shape was read from. */
export const UNIT_MOCK_SOURCES: Readonly<Record<Id, string>> = {
  "wjec-alevel-biology": "https://www.wjec.co.uk/qualifications/biology-asa-level/",
  "wjec-alevel-chemistry": "https://www.wjec.co.uk/media/akbbkvwh/wjec-gce-chemistry-spec-from-2015.pdf",
  "wjec-alevel-physics": "https://www.wjec.co.uk/media/gxbjl243/wjec-gce-physics-spec-from-2015-e-22-09-22.pdf",
  "wjec-alevel-maths": "https://www.wjec.co.uk/qualifications/mathematics-as-a-level/",
};

/** Written papers only: Unit 5 is a practical examination and cannot be sat on screen. */
const WRITTEN_UNITS = [1, 2, 3, 4] as const;

export const UNIT_MOCK_GRADE_NOTE =
  "No grade is shown: WJEC sets new grade boundaries for every unit each series, so a raw mark cannot honestly be turned into a grade here.";

export const UNIT_MOCK_PRACTICE_NOTE =
  "Practice paper: these questions have not yet been approved by two teacher reviewers, so this result is practice, not proof, and it does not change your predicted marks.";

export interface UnitMockBlueprint {
  subjectId: Id;
  unit: number;
  level: "AS" | "A2";
  paperSpecId: Id;
  /** e.g. "Unit 1: Motion, Energy and Matter". */
  name: string;
  durationMinutes: number;
  marks: number;
  /** Share of the full A level, as a whole percentage. */
  weightPercent: number;
  calculatorAllowed: boolean;
  topicIds: Id[];
  sourceUrl: string | null;
}

/**
 * The unit papers this learner can sit for one subject. Year 12 is offered the
 * AS units (1 and 2) only; Year 13 and an unset year see Units 1–4. A Year 13
 * Unit 4 option keeps only that option's topics on the Unit 4 paper.
 */
export function unitMockBlueprints(input: {
  subject: Subject;
  topics: readonly Topic[];
  yearGroup?: YearGroup;
  unit4Option?: Unit4Option;
}): UnitMockBlueprint[] {
  const { subject } = input;
  if (!UNIT_MOCK_SUBJECTS.includes(subject.id)) return [];
  const subjectTopics = input.topics.filter((topic) => topic.subjectId === subject.id);
  const scoped = input.yearGroup === "year-13" && input.unit4Option ? topicsForUnit4Option(subjectTopics, input.unit4Option) : subjectTopics;
  const units = input.yearGroup === "year-12" ? WRITTEN_UNITS.filter((unit) => unit <= 2) : [...WRITTEN_UNITS];
  const out: UnitMockBlueprint[] = [];
  for (const unit of units) {
    const spec = subject.papers.find((paper) => paper.id === `${subject.id}.u${unit}`);
    if (!spec || !spec.marks || spec.marks <= 0 || spec.durationMinutes <= 0) continue;
    const topicIds = scoped.filter((topic) => topicUnitNumber(topic) === unit).map((topic) => topic.id);
    if (!topicIds.length) continue;
    out.push({
      subjectId: subject.id,
      unit,
      level: unit <= 2 ? "AS" : "A2",
      paperSpecId: spec.id,
      name: spec.name,
      durationMinutes: spec.durationMinutes,
      marks: spec.marks,
      weightPercent: Math.round(spec.weight * 100),
      calculatorAllowed: spec.calculatorAllowed,
      topicIds,
      sourceUrl: UNIT_MOCK_SOURCES[subject.id] ?? null,
    });
  }
  return out;
}

export interface UnitMockPick {
  questionId: Id;
  marks: number;
  topicIds: Id[];
  exposure: "fresh" | "older" | "recent";
}

export interface UnitMockTopicShare {
  topicId: Id;
  title: string;
  /** Marks the specification share asked for (proportional to spec statements). */
  targetMarks: number;
  marks: number;
}

export interface UnitMock {
  blueprint: UnitMockBlueprint;
  questionIds: Id[];
  picks: UnitMockPick[];
  totalMarks: number;
  /** True when the paper reaches the real mark total exactly. */
  complete: boolean;
  topics: UnitMockTopicShare[];
  /** True when every picked question is human-verified for assessment. */
  trusted: boolean;
  notes: string[];
  headline: string;
}

export interface UnitMockInput {
  blueprint: UnitMockBlueprint;
  questions: readonly Question[];
  topics: readonly Topic[];
  attempts: readonly Attempt[];
  /** Questions to leave out, e.g. those on the learner's earlier unit mocks. */
  excludeQuestionIds?: readonly Id[];
  now: Date;
  /** Varies which equally good question is taken, so a second mock differs. */
  seed?: number;
}

const DAY_MS = 86_400_000;
const EXPOSURE_RANK: Record<UnitMockPick["exposure"], number> = { fresh: 0, older: 1, recent: 2 };

/** Deterministic 32-bit hash of a string with a seed (FNV-1a). */
function hashWithSeed(value: string, seed: number): number {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

interface ShortfallRepair {
  removed: UnitMockPick[];
  added: Question[];
}

/**
 * Finds the smallest change (drop 0-2 picks, add 1-2 unused questions) that
 * closes a mark shortfall exactly. Prefers fewer changes, then better
 * trust/exposure rank, then the smallest drift from each topic's share.
 */
export function repairShortfall(input: {
  picks: readonly UnitMockPick[];
  pool: readonly Question[];
  shortBy: number;
  target: ReadonlyMap<Id, number>;
  allocated: ReadonlyMap<Id, number>;
  rank: (question: Question) => number;
}): ShortfallRepair | null {
  const { picks, shortBy } = input;
  const pool = [...input.pool].sort((a, b) => a.id.localeCompare(b.id));
  const dropSets: UnitMockPick[][] = [[]];
  for (let i = 0; i < picks.length; i += 1) {
    dropSets.push([picks[i]]);
    for (let j = i + 1; j < picks.length; j += 1) dropSets.push([picks[i], picks[j]]);
  }
  const drift = (removed: UnitMockPick[], added: Question[]): number => {
    const next = new Map(input.allocated);
    for (const pick of removed) for (const topicId of pick.topicIds) next.set(topicId, (next.get(topicId) ?? 0) - pick.marks / pick.topicIds.length);
    for (const question of added) for (const topicId of question.topicIds) next.set(topicId, (next.get(topicId) ?? 0) + question.totalMarks / question.topicIds.length);
    let sum = 0;
    for (const [topicId, goal] of input.target) sum += Math.abs(goal - (next.get(topicId) ?? 0));
    return sum;
  };
  let bestRepair: ShortfallRepair | null = null;
  let bestKey: number[] = [];
  const consider = (removed: UnitMockPick[], added: Question[]) => {
    const key = [removed.length + added.length, added.reduce((sum, question) => sum + input.rank(question), 0), drift(removed, added)];
    const better =
      !bestRepair ||
      key[0] < bestKey[0] ||
      (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2] - 1e-9)));
    if (better) {
      bestRepair = { removed, added };
      bestKey = key;
    }
  };
  for (const removed of dropSets) {
    const need = shortBy + removed.reduce((sum, pick) => sum + pick.marks, 0);
    for (let a = 0; a < pool.length; a += 1) {
      if (pool[a].totalMarks === need) consider(removed, [pool[a]]);
      else if (pool[a].totalMarks < need) {
        for (let b = a + 1; b < pool.length; b += 1) {
          if (pool[a].totalMarks + pool[b].totalMarks === need) consider(removed, [pool[a], pool[b]]);
        }
      }
    }
  }
  return bestRepair;
}

/**
 * Builds one unit mock. Marks are shared across the unit's topics in
 * proportion to their specification statements (a topic with no listed
 * statements counts as one), each question's marks are split across the
 * topics it tests, and the paper never exceeds the real mark total.
 * Unseen questions win, then ones not answered in the last
 * MOCK_RECENT_WINDOW_DAYS days, then recent ones, and human-verified
 * questions win within each of those.
 */
export function buildUnitMock(input: UnitMockInput): UnitMock {
  const { blueprint } = input;
  const seed = input.seed ?? 0;
  const unitTopics = new Set(blueprint.topicIds);
  const topicById = new Map(input.topics.map((topic) => [topic.id, topic] as const));
  const exclude = new Set(input.excludeQuestionIds ?? []);

  const lastAttempt = new Map<Id, number>();
  for (const attempt of input.attempts) {
    const at = Date.parse(attempt.createdAt);
    if (!Number.isFinite(at)) continue;
    lastAttempt.set(attempt.questionId, Math.max(lastAttempt.get(attempt.questionId) ?? 0, at));
  }
  const recentCutoff = input.now.getTime() - MOCK_RECENT_WINDOW_DAYS * DAY_MS;
  const exposureOf = (questionId: Id): UnitMockPick["exposure"] => {
    const at = lastAttempt.get(questionId);
    if (at === undefined) return "fresh";
    return at < recentCutoff ? "older" : "recent";
  };

  const eligible = input.questions.filter(
    (question) =>
      question.subjectId === blueprint.subjectId &&
      question.totalMarks > 0 &&
      question.topicIds.length > 0 &&
      question.topicIds.every((topicId) => unitTopics.has(topicId)) &&
      !exclude.has(question.id),
  );

  const weightOf = (topicId: Id) => Math.max(1, topicById.get(topicId)?.specPoints?.length ?? 0);
  const totalWeight = blueprint.topicIds.reduce((sum, topicId) => sum + weightOf(topicId), 0);
  const target = new Map(blueprint.topicIds.map((topicId) => [topicId, (blueprint.marks * weightOf(topicId)) / totalWeight] as const));
  const allocated = new Map<Id, number>(blueprint.topicIds.map((topicId) => [topicId, 0]));

  const rank = (question: Question) =>
    EXPOSURE_RANK[exposureOf(question.id)] * 2 + (trustedAssessmentContent(question) ? 0 : 1);
  const byTopic = new Map<Id, Question[]>();
  for (const topicId of blueprint.topicIds) byTopic.set(topicId, []);
  for (const question of eligible) for (const topicId of question.topicIds) byTopic.get(topicId)?.push(question);
  for (const list of byTopic.values()) {
    list.sort((a, b) => rank(a) - rank(b) || hashWithSeed(a.id, seed) - hashWithSeed(b.id, seed) || a.id.localeCompare(b.id));
  }

  const used = new Set<Id>();
  const picks: UnitMockPick[] = [];
  let total = 0;
  for (;;) {
    const remaining = blueprint.marks - total;
    if (remaining <= 0) break;
    // A recently answered question is reused only when no topic has an unseen
    // or older one that fits; among the rest, the topic furthest below its share.
    const fitting = (topicId: Id) => (byTopic.get(topicId) ?? []).filter((question) => !used.has(question.id) && question.totalMarks <= remaining);
    const anyNotRecent = blueprint.topicIds.some((topicId) => fitting(topicId).some((question) => exposureOf(question.id) !== "recent"));
    let bestTopic: Id | null = null;
    let bestGap = -Infinity;
    for (const topicId of blueprint.topicIds) {
      const options = fitting(topicId);
      const fits = anyNotRecent ? options.some((question) => exposureOf(question.id) !== "recent") : options.length > 0;
      if (!fits) continue;
      const gap = (target.get(topicId) ?? 0) - (allocated.get(topicId) ?? 0);
      if (gap > bestGap + 1e-9) {
        bestGap = gap;
        bestTopic = topicId;
      }
    }
    if (!bestTopic) break;
    const topicGap = Math.max(1, Math.round(bestGap));
    const candidates = fitting(bestTopic).filter((question) => !anyNotRecent || exposureOf(question.id) !== "recent");
    // Best exposure/trust tier first; inside it, the question whose marks sit
    // closest to what this topic still needs (the list is already seeded-ordered).
    const bestRank = Math.min(...candidates.map(rank));
    const tier = candidates.filter((question) => rank(question) === bestRank);
    const choice = tier.reduce((best, question) =>
      Math.abs(question.totalMarks - Math.min(topicGap, remaining)) < Math.abs(best.totalMarks - Math.min(topicGap, remaining)) ? question : best,
    );
    used.add(choice.id);
    total += choice.totalMarks;
    for (const topicId of choice.topicIds) {
      allocated.set(topicId, (allocated.get(topicId) ?? 0) + choice.totalMarks / choice.topicIds.length);
    }
    picks.push({ questionId: choice.id, marks: choice.totalMarks, topicIds: [...choice.topicIds], exposure: exposureOf(choice.id) });
  }

  // The greedy fill can stall a mark or two short when no unused question has
  // exactly the marks left. Swap a few picks for unused questions so the paper
  // reaches the real total whenever the bank allows it.
  if (total < blueprint.marks) {
    const repaired = repairShortfall({
      picks,
      pool: eligible.filter((question) => !used.has(question.id)),
      shortBy: blueprint.marks - total,
      target,
      allocated,
      rank,
    });
    if (repaired) {
      for (const pick of repaired.removed) {
        used.delete(pick.questionId);
        picks.splice(picks.indexOf(pick), 1);
        total -= pick.marks;
        for (const topicId of pick.topicIds) allocated.set(topicId, (allocated.get(topicId) ?? 0) - pick.marks / pick.topicIds.length);
      }
      for (const choice of repaired.added) {
        used.add(choice.id);
        total += choice.totalMarks;
        for (const topicId of choice.topicIds) allocated.set(topicId, (allocated.get(topicId) ?? 0) + choice.totalMarks / choice.topicIds.length);
        picks.push({ questionId: choice.id, marks: choice.totalMarks, topicIds: [...choice.topicIds], exposure: exposureOf(choice.id) });
      }
    }
  }

  // Order the paper by topic in specification order, shorter questions first
  // within a topic, the way WJEC papers usually open with short items.
  const topicOrder = new Map(blueprint.topicIds.map((topicId, index) => [topicId, index] as const));
  const orderOf = (pick: UnitMockPick) => Math.min(...pick.topicIds.map((topicId) => topicOrder.get(topicId) ?? Infinity));
  picks.sort((a, b) => orderOf(a) - orderOf(b) || a.marks - b.marks || a.questionId.localeCompare(b.questionId));

  const questionById = new Map(eligible.map((question) => [question.id, question] as const));
  const trusted = picks.length > 0 && picks.every((pick) => {
    const question = questionById.get(pick.questionId);
    return question ? trustedAssessmentContent(question) : false;
  });

  const topics: UnitMockTopicShare[] = blueprint.topicIds.map((topicId) => ({
    topicId,
    title: topicById.get(topicId)?.title ?? topicId,
    targetMarks: Math.round(target.get(topicId) ?? 0),
    marks: Math.round(allocated.get(topicId) ?? 0),
  }));

  const notes: string[] = [];
  const complete = total === blueprint.marks;
  if (!picks.length) {
    notes.push(`The question bank has no unused questions on ${blueprint.name} yet, so this mock cannot be built.`);
  } else if (!complete) {
    notes.push(
      `The bank ran out of fitting questions: this paper has ${plural(total, "mark")} of the real ${blueprint.marks}. The clock is shortened to match, so the pace is still the real one.`,
    );
  }
  const missing = topics.filter((topic) => topic.marks === 0);
  if (picks.length && missing.length) {
    notes.push(`No unused question was available on ${missing.map((topic) => topic.title).join(", ")}, so the paper does not sample ${missing.length === 1 ? "it" : "them"}.`);
  }
  const recent = picks.filter((pick) => pick.exposure === "recent").length;
  if (recent) {
    notes.push(`${plural(recent, "question")} you answered in the last ${MOCK_RECENT_WINDOW_DAYS} days ${recent === 1 ? "was" : "were"} reused because fresh ones ran out.`);
  }
  if (picks.length && !trusted) notes.push(UNIT_MOCK_PRACTICE_NOTE);

  const minutes = unitMockMinutes(blueprint, total);
  const headline = picks.length
    ? `${blueprint.name}: ${plural(picks.length, "question")}, ${plural(total, "mark")}, ${minutes} minutes`
    : `${blueprint.name}: not enough questions yet`;

  return {
    blueprint,
    questionIds: picks.map((pick) => pick.questionId),
    picks,
    totalMarks: total,
    complete,
    topics,
    trusted,
    notes,
    headline,
  };
}

/**
 * Minutes on the clock. A complete paper gets the real duration; a short one
 * gets the same minutes-per-mark rate, so pace practice stays honest.
 */
export function unitMockMinutes(blueprint: Pick<UnitMockBlueprint, "durationMinutes" | "marks">, totalMarks: number): number {
  if (totalMarks >= blueprint.marks) return blueprint.durationMinutes;
  return Math.max(1, Math.round((blueprint.durationMinutes * totalMarks) / blueprint.marks));
}

/** Persists a unit mock as a paper the exam-conditions runner can sit. */
export function buildUnitMockPaper(input: { mock: UnitMock; subjectName: string; userId: Id; id: Id; createdAt: string }): Paper {
  const { mock } = input;
  return {
    id: input.id,
    userId: input.userId,
    subjectId: mock.blueprint.subjectId,
    title: `WJEC ${input.subjectName} ${mock.blueprint.name} (mock)`,
    paperSpecId: mock.blueprint.paperSpecId,
    totalMarks: mock.totalMarks,
    questionIds: mock.questionIds,
    status: "extracted",
    createdAt: input.createdAt,
    generated: {
      focus: 0,
      targetMarks: mock.blueprint.marks,
      topicIds: [...mock.blueprint.topicIds],
      durationMinutes: unitMockMinutes(mock.blueprint, mock.totalMarks),
      unitMock: { unit: mock.blueprint.unit, paperSpecId: mock.blueprint.paperSpecId },
    },
  };
}

/** Question ids on the learner's earlier mocks of the same unit, so the next one is fresh. */
export function earlierUnitMockQuestionIds(papers: readonly Paper[], blueprint: Pick<UnitMockBlueprint, "paperSpecId">): Id[] {
  return papers.filter((paper) => paper.generated?.unitMock?.paperSpecId === blueprint.paperSpecId).flatMap((paper) => paper.questionIds);
}
