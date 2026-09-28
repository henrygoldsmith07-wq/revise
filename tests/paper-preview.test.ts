import { describe, expect, it } from "vitest";
import { buildPaperCalibrations, previewPaperSimulation } from "@/state/paper-preview";
import { getSubject } from "@/domain/curriculum";
import type { Question, TopicMastery } from "@/domain/types";
import type { Snapshot } from "@/data/repository";

function question(id: string, subjectId: string, verification?: Question["verification"]): Question {
  return {
    id,
    subjectId,
    topicIds: ["t1"],
    kind: "short",
    stem: `Q ${id}`,
    parts: [{ id: `${id}.a`, label: "", prompt: "Explain.", marks: 2, markScheme: ["p"], modelAnswer: "m" }],
    totalMarks: 2,
    calculatorAllowed: true,
    difficulty: 3,
    origin: "seed",
    ...(verification ? { verification } : {}),
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

function snapshotWith(questions: Question[]): Snapshot {
  return {
    questions,
    attempts: [],
    mistakes: [],
    reviewLogs: [],
    cards: [],
    papers: [],
    plannedSessions: [],
    examDates: [],
    settings: undefined as never,
    streak: undefined as never,
    lessonProgress: undefined as never,
  } as unknown as Snapshot;
}

describe("paper preview selector", () => {
  it("returns null when nothing is trusted and simulates trusted questions otherwise", () => {
    const subject = getSubject("aqa-gcse-maths") ?? getSubject("wjec-alevel-maths");
    const subjectId = subject!.id;
    const paperSpecId = subject!.papers[0]!.id;
    const trusted = question("q-trusted", subjectId);
    // Non-review-gated subjects are trusted without attestation.
    const sim = previewPaperSimulation({
      snapshot: snapshotWith([trusted]),
      mastery: [],
      calibrations: new Map(),
      subjectId,
      paperSpecId,
      questionIds: ["q-trusted"],
    });
    expect(sim).not.toBeNull();
    expect(sim!.questionIds).toEqual(["q-trusted"]);

    const wjec = question("q-draft", "wjec-alevel-maths");
    const blocked = previewPaperSimulation({
      snapshot: snapshotWith([wjec]),
      mastery: [],
      calibrations: new Map(),
      subjectId: "wjec-alevel-maths",
      paperSpecId: getSubject("wjec-alevel-maths")!.papers[0]!.id,
      questionIds: ["q-draft"],
    });
    expect(blocked).toBeNull();
  });

  it("builds neutral calibrations for enrolled subjects without paper history", () => {
    const subject = getSubject("aqa-gcse-maths")!;
    const out = buildPaperCalibrations(snapshotWith([]), [] as TopicMastery[], [subject.id]);
    expect(out.get(subject.id)).toMatchObject({ slope: 1, bias: 0, sampleSize: 0 });
    expect(buildPaperCalibrations(null, [], []).size).toBe(0);
  });
});
