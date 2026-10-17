import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildRoadmapLessons, roadmapLessonIndex } from "@/content/lessons";
import { TEACHING } from "@/content/teaching";
import { TAUGHT_SPEC_POINT_IDS } from "@/content/teaching/taught-spec-points";
import { seedQuestions } from "@/content";
import { allTopics, getTopic } from "@/domain/curriculum";
import type { InterventionStep } from "@/domain/intervention-engine";
import {
  choosePracticeNextStep,
  RELEARN_NOTE,
  relearnCheckpointFor,
  withRelearnHref,
} from "@/domain/practice-next-step";
import type { MarkedPart, Question } from "@/domain/types";

// Lessons taught from src/content/teaching are written by Revise and no
// teacher has reviewed them. They say so, and a lost mark links to the
// checkpoint that teaches the point it was lost on, instead of the topic's
// first lesson.

const taught = new Set(TAUGHT_SPEC_POINT_IDS);
const physicsTopics = allTopics(["wjec-alevel-physics"]);
const physicsLessons = buildRoadmapLessons(physicsTopics);

function lost(question: Question, partIndex: number, dropped = 1): MarkedPart[] {
  return question.parts.map((part, index) => {
    const max = part.marks;
    const awarded = index === partIndex ? Math.max(0, max - dropped) : max;
    return { partId: part.id, awarded, max, creditedPoints: [], missedPoints: index === partIndex ? ["x"] : [], comment: "" };
  });
}

/** A WJEC A-level Physics question whose parts sit on two different taught points. */
const twoPoint = seedQuestions.find(
  (q) =>
    q.subjectId === "wjec-alevel-physics" &&
    q.parts.length >= 2 &&
    q.parts.every((p) => p.marks >= 2 && (p.specPointIds ?? []).some((id) => taught.has(id))) &&
    new Set(q.parts.map((p) => p.specPointIds![0])).size === q.parts.length,
)!;

describe("taught spec point list", () => {
  it("is exactly the set of points with authored teaching", () => {
    expect([...TAUGHT_SPEC_POINT_IDS].sort()).toEqual(Object.keys(TEACHING).sort());
    expect(new Set(TAUGHT_SPEC_POINT_IDS).size).toBe(TAUGHT_SPEC_POINT_IDS.length);
  });
});

describe("lesson review state", () => {
  it("every taught lesson is labelled not yet teacher-reviewed and names its point; outlines are not", () => {
    expect(physicsLessons).toHaveLength(108);
    for (const { lesson } of physicsLessons) {
      expect(lesson.teachingReview, lesson.id).toBe("not-teacher-reviewed");
      expect(lesson.specPointId && taught.has(lesson.specPointId), lesson.id).toBe(true);
      expect(lesson.outline).toBeUndefined();
    }
    const outlines = buildRoadmapLessons(allTopics(["wjec-alevel-biology"]));
    expect(outlines.length).toBeGreaterThan(0);
    for (const { lesson } of outlines) {
      expect(lesson.outline).toBe(true);
      expect(lesson.teachingReview).toBeUndefined();
    }
  });

  it("the lesson page, roadmap card and Today card show the label from the data", () => {
    const lessonMode = readFileSync("src/components/LessonMode.tsx", "utf8");
    expect(lessonMode).toContain('lesson.teachingReview === "not-teacher-reviewed"');
    expect(lessonMode).toContain("Not yet teacher-reviewed.</span> Revise wrote this lesson");
    expect(lessonMode).toContain("<Pill>Not yet teacher-reviewed</Pill>");
    const today = readFileSync("src/components/TodayRoadmap.tsx", "utf8");
    expect(today).toContain('nextEntry.lesson.teachingReview === "not-teacher-reviewed"');
  });

  it("no code claims a lesson was reviewed", () => {
    const lessons = readFileSync("src/content/lessons.ts", "utf8");
    expect(lessons).not.toMatch(/teachingReview:\s*"(?!not-teacher-reviewed)/);
  });
});

describe("checkpoint deep link", () => {
  it("opens the named checkpoint, falls back to the topic's first, and ignores a checkpoint without a topic", () => {
    const topic = physicsTopics.find((t) => (t.specPoints?.length ?? 0) >= 3)!;
    const third = topic.specPoints![2]!.id;
    const exact = roadmapLessonIndex(physicsLessons, topic.id, third);
    expect(physicsLessons[exact]!.lesson.specPointId).toBe(third);
    const first = roadmapLessonIndex(physicsLessons, topic.id);
    expect(physicsLessons[first]!.lesson.checkpointIndex).toBe(1);
    expect(roadmapLessonIndex(physicsLessons, topic.id, "not-a-point")).toBe(first);
    expect(roadmapLessonIndex(physicsLessons, undefined, third)).toBe(-1);
    // A point from another topic does not jump topics.
    const other = physicsTopics.find((t) => t.id !== topic.id)!;
    expect(roadmapLessonIndex(physicsLessons, other.id, third)).toBe(roadmapLessonIndex(physicsLessons, other.id));
  });

  it("the lesson page reads checkpoint= and passes it to LessonMode", () => {
    const page = readFileSync("src/app/lesson/page.tsx", "utf8");
    expect(page).toContain('params.get("checkpoint")');
    expect(page).toContain("initialCheckpointId={initialCheckpointId}");
  });
});

describe("relearnCheckpointFor", () => {
  it("found a real two-point Physics question to test with", () => {
    expect(twoPoint, "fixture question").toBeDefined();
  });

  it("links the lost part's own checkpoint, and that checkpoint is the taught lesson for it", () => {
    for (const index of [0, 1]) {
      const part = twoPoint.parts[index]!;
      const relearn = relearnCheckpointFor({ question: twoPoint, marked: lost(twoPoint, index), taught, topicFor: getTopic })!;
      expect(relearn.specPointId).toBe(part.specPointIds!.find((id) => taught.has(id)));
      const url = new URL(relearn.href, "https://x.invalid");
      expect(url.pathname).toBe("/lesson");
      expect(url.searchParams.get("checkpoint")).toBe(relearn.specPointId);
      expect(url.searchParams.get("subject")).toBe("wjec-alevel-physics");
      const at = roadmapLessonIndex(physicsLessons, url.searchParams.get("topic")!, url.searchParams.get("checkpoint")!);
      expect(physicsLessons[at]!.lesson.specPointId).toBe(relearn.specPointId);
      expect(physicsLessons[at]!.lesson.teachingReview).toBe("not-teacher-reviewed");
      expect(relearn.ref).toMatch(/^Unit \d/);
    }
  });

  it("prefers the part that dropped the most marks", () => {
    const marked = lost(twoPoint, 0, 1).map((m, i) => (i === 1 ? { ...m, awarded: 0, missedPoints: ["y"] } : m));
    const relearn = relearnCheckpointFor({ question: twoPoint, marked, taught, topicFor: getTopic })!;
    // Part 0 drops 1 mark; part 1 drops all of its (at least 2).
    const second = twoPoint.parts[1]!;
    expect(relearn.specPointId).toBe(second.specPointIds!.find((id) => taught.has(id)));
  });

  it("gives nothing for full marks or a point without written teaching", () => {
    const full = twoPoint.parts.map((p) => ({ partId: p.id, awarded: p.marks, max: p.marks, creditedPoints: [], missedPoints: [], comment: "" }));
    expect(relearnCheckpointFor({ question: twoPoint, marked: full, taught, topicFor: getTopic })).toBeNull();
    expect(relearnCheckpointFor({ question: twoPoint, marked: lost(twoPoint, 0), taught: new Set(), topicFor: getTopic })).toBeNull();
    const maths = seedQuestions.find((q) => q.subjectId === "wjec-alevel-maths" && q.parts.some((p) => p.specPointIds?.length))!;
    expect(relearnCheckpointFor({ question: maths, marked: lost(maths, 0), taught, topicFor: getTopic })).toBeNull();
  });
});

describe("the repair plan's explanation step and the one next step", () => {
  const relearn = relearnCheckpointFor({ question: twoPoint, marked: lost(twoPoint, 0), taught, topicFor: getTopic })!;
  const explain: InterventionStep = {
    kind: "explain", title: "Understand", minutes: 8, countsAsProof: false, why: "A short targeted explanation.",
    href: `/lesson?topic=${encodeURIComponent(relearn.topicId)}`,
  };
  const guided: InterventionStep = { ...explain, kind: "guided-question", href: `/practice?topic=${encodeURIComponent(relearn.topicId)}&guided=1` };
  const fallback = { label: "Repair the missed points", why: "You dropped 1 of 3 marks here." };

  it("a same-topic explanation opens the taught checkpoint; other steps and topics are untouched", () => {
    expect(withRelearnHref(explain, relearn).href).toBe(relearn.href);
    expect(withRelearnHref(guided, relearn)).toBe(guided);
    const otherTopic = { ...explain, href: "/lesson?topic=wjec-alevel-physics.some-other-topic" };
    expect(withRelearnHref(otherTopic, relearn)).toBe(otherTopic);
    expect(withRelearnHref(explain, null)).toBe(explain);
  });

  it("the explanation step says which point and that the lesson is not reviewed", () => {
    const step = choosePracticeNextStep({
      techniqueRepair: null,
      prescription: { headline: "Repair", topicTitle: relearn.topicTitle, firstStep: withRelearnHref(explain, relearn) },
      fallback,
      relearn,
    });
    expect(step).toMatchObject({ kind: "prescription", href: relearn.href });
    expect(step.note).toContain(relearn.ref);
    expect(step.note).toContain(RELEARN_NOTE);
    const guidedFirst = choosePracticeNextStep({ techniqueRepair: null, prescription: { headline: "Repair", topicTitle: "T", firstStep: guided }, fallback, relearn });
    expect(guidedFirst).toMatchObject({ kind: "prescription", href: guided.href });
    expect(guidedFirst.note).not.toContain(RELEARN_NOTE);
  });

  it("with no plan step the lesson becomes the next step, labelled; with no lesson there is still no button", () => {
    const step = choosePracticeNextStep({ techniqueRepair: null, prescription: null, fallback, relearn });
    expect(step).toMatchObject({ kind: "relearn", href: relearn.href, cta: "Open the lesson", note: RELEARN_NOTE });
    expect(step.title).toContain(relearn.ref);
    expect(RELEARN_NOTE).toMatch(/not yet teacher-reviewed/);
    expect(RELEARN_NOTE).toMatch(/practice, not proof/);
    expect(choosePracticeNextStep({ techniqueRepair: null, prescription: null, fallback, relearn: null }).kind).toBe("none");
  });
});

describe("study copy without accounts", () => {
  it("does not call the study's data anonymous or mention a sync it cannot do", () => {
    const settings = readFileSync("src/app/settings/page.tsx", "utf8");
    expect(settings).not.toContain("only anonymous counts ever leave it");
    expect(settings).toContain("kept on this device only");
    const types = readFileSync("src/domain/types-planning.ts", "utf8");
    expect(types).not.toContain("Whether anonymised outcome events");
  });
});
