import { allSubjects, allTopics, getTopic } from "@/domain/curriculum";
import { misconceptionsForTopic } from "@/content";
import { videoLessonFallback } from "@/ai/fallback";
import { AI_TASKS, RESPONSE_SCHEMAS, videoLessonResponseSchema } from "@/ai/types";
import { describe, expect, it } from "vitest";

// The video-style lesson must hold for every topic in every subject: the
// fallback is the product's guarantee that the player always has something
// watchable, on or offline, so the whole curriculum is the test corpus.

describe("video lesson fallback", () => {
  it("is a registered task with a response schema", () => {
    expect(AI_TASKS).toContain("video-lesson");
    expect(RESPONSE_SCHEMAS["video-lesson"]).toBe(videoLessonResponseSchema);
  });

  it("produces schema-valid storyboards for every topic in every subject", () => {
    const subjectIds = new Set(allTopics().map((t) => t.subjectId));
    expect(subjectIds.size).toBe(allSubjects().length);

    for (const topic of allTopics()) {
      const result = videoLessonResponseSchema.safeParse(videoLessonFallback(topic.id));
      expect(result.success, `${topic.id} storyboard failed schema`).toBe(true);
    }
  });

  it("is deterministic for the same topic", () => {
    const topic = allTopics()[0];
    expect(JSON.stringify(videoLessonFallback(topic.id))).toBe(JSON.stringify(videoLessonFallback(topic.id)));
  });

  it("always plays at least three scenes and stays within fourteen", () => {
    for (const topic of allTopics()) {
      const lesson = videoLessonFallback(topic.id);
      expect(lesson.scenes.length, topic.id).toBeGreaterThanOrEqual(3);
      expect(lesson.scenes.length, topic.id).toBeLessThanOrEqual(14);
    }
  });

  it("labels every scene with a valid kind", () => {
    const kinds = ["intro", "teach", "misconception", "trap", "exam", "recap"];
    for (const topic of allTopics()) {
      const lesson = videoLessonFallback(topic.id);
      expect(lesson.scenes[0]?.kind, topic.id).toBe("intro");
      expect(lesson.scenes.at(-1)?.kind, topic.id).toBe("recap");
      for (const scene of lesson.scenes) {
        expect(kinds, `${topic.id}: ${scene.title}`).toContain(scene.kind);
      }
    }
  });

  it("addresses the authored misconceptions for topics that have them", () => {
    const withMisconceptions = allTopics().filter(
      (t) => misconceptionsForTopic(t.id).length > 0,
    );
    expect(withMisconceptions.length).toBeGreaterThan(0);

    for (const topic of withMisconceptions.slice(0, 40)) {
      const lesson = videoLessonFallback(topic.id);
      const misconceptionScenes = lesson.scenes.filter((s) => s.kind === "misconception");
      expect(misconceptionScenes.length, topic.id).toBe(
        Math.min(2, misconceptionsForTopic(topic.id).length),
      );
      const narration = lesson.scenes.map((s) => s.narration).join(" ");
      for (const m of misconceptionsForTopic(topic.id).slice(0, 2)) {
        expect(narration, topic.id).toContain(m.correction);
      }
    }
  });

  it("names the spec reference when the topic has spec points", () => {
    const withSpecPoints = allTopics().find((t) => t.specPoints?.length);
    expect(withSpecPoints).toBeDefined();
    const lesson = videoLessonFallback(withSpecPoints!.id);
    const examScene = lesson.scenes.find((s) => s.kind === "exam");
    expect(examScene).toBeDefined();
    expect(examScene!.narration).toContain(withSpecPoints!.specPoints![0].ref);
  });

  it("covers the topic's key points and common errors", () => {
    const topic = allTopics().find((t) => t.keyPoints.length >= 2 && t.commonErrors.length >= 1);
    expect(topic).toBeDefined();
    const lesson = videoLessonFallback(topic!.id);
    const narration = lesson.scenes.map((s) => s.narration).join(" ");
    for (const point of topic!.keyPoints.slice(0, 6)) {
      expect(narration).toContain(point);
    }
    for (const error of topic!.commonErrors.slice(0, 2)) {
      expect(narration).toContain(error);
    }
    // Teach scenes rotate their closing nudge instead of repeating one line.
    const nudges = lesson.scenes
      .filter((s) => s.kind === "teach")
      .map((s) => s.narration.split(". ").slice(-2)[0]);
    for (let i = 1; i < nudges.length; i++) {
      expect(nudges[i], `${topic!.id} teach scene ${i}`).not.toBe(nudges[i - 1]);
    }
  });

  it("keeps every scene within a watchable length", () => {
    for (const topic of allTopics()) {
      for (const scene of videoLessonFallback(topic.id).scenes) {
        expect(scene.seconds, `${topic.id}: ${scene.title}`).toBeGreaterThanOrEqual(5);
        expect(scene.seconds, `${topic.id}: ${scene.title}`).toBeLessThanOrEqual(90);
      }
    }
  });

  it("degrades honestly for an unknown topic", () => {
    const lesson = videoLessonFallback("no-such-topic");
    expect(videoLessonResponseSchema.safeParse(lesson).success).toBe(true);
    expect(lesson.scenes.some((s) => /not in the local curriculum/i.test(s.narration))).toBe(true);
  });

  it("is available for a topic from every subject that has one", () => {
    for (const subject of allSubjects()) {
      const topic = allTopics().find((t) => t.subjectId === subject.id);
      if (!topic) continue;
      expect(getTopic(topic.id)).toBeDefined();
      expect(videoLessonFallback(topic.id).title.length).toBeGreaterThan(0);
    }
  });
});
