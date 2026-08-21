import { describe, expect, it } from "vitest";
import {
  examClockState,
  examQuestionProgress,
  formatExamTime,
  secondsRemaining,
  unansweredQuestionCount,
} from "@/domain/exam-conditions";
import type { Question } from "@/domain/types";

const part = { id: "p1", label: "", prompt: "Explain.", marks: 2, markScheme: [], modelAnswer: "" };
const questions: Question[] = [
  {
    id: "q1",
    subjectId: "subject",
    topicIds: ["topic"],
    kind: "mcq",
    stem: "Choose one.",
    options: ["A", "B"],
    correctIndex: 0,
    parts: [{ ...part, id: "q1-part" }],
    totalMarks: 1,
    calculatorAllowed: true,
    difficulty: 2,
    origin: "past-paper",
    createdAt: "2026-08-18T09:00:00.000Z",
  },
  {
    id: "q2",
    subjectId: "subject",
    topicIds: ["topic"],
    kind: "short",
    stem: "Write an answer.",
    parts: [part],
    totalMarks: 2,
    calculatorAllowed: true,
    difficulty: 2,
    origin: "past-paper",
    createdAt: "2026-08-18T09:00:00.000Z",
  },
];

describe("full exam conditions", () => {
  it("counts down from the configured paper duration and never goes negative", () => {
    expect(secondsRemaining(1_000, 1_000, 90)).toBe(5_400);
    expect(secondsRemaining(1_000, 1_000 + 12_345, 90)).toBe(5_388);
    expect(secondsRemaining(1_000, 9_000_000, 90)).toBe(0);
  });

  it("formats long exam timers without converting them to hours", () => {
    expect(formatExamTime(7_200)).toBe("120:00");
    expect(formatExamTime(305)).toBe("05:05");
    expect(formatExamTime(-1)).toBe("00:00");
  });

  it("raises a warning only inside the final five minutes", () => {
    expect(examClockState(301)).toBe("on-time");
    expect(examClockState(300)).toBe("warning");
    expect(examClockState(0)).toBe("time-up");
  });

  it("reports blank questions separately from answered MCQs and written parts", () => {
    expect(unansweredQuestionCount(questions, {})).toBe(2);
    expect(unansweredQuestionCount(questions, { q1: "1" })).toBe(1);
    expect(unansweredQuestionCount(questions, { q1: "1", p1: "A relevant point" })).toBe(0);
  });

  it("keeps question progress bounded for empty and overlong papers", () => {
    expect(examQuestionProgress(0, 0)).toBe(0);
    expect(examQuestionProgress(0, 4)).toBe(0.25);
    expect(examQuestionProgress(9, 4)).toBe(1);
  });
});
