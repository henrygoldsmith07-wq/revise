import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { getSubject, topicsFor } from "@/domain/curriculum";
import { checkUnitExamDate, daysToTopicExam, editUnitDate, examForTopic, nextPaperSentence, nextSubjectExam, subjectRunUpEnd, timetableRows, unitOfPaperSpec, upcomingPapers } from "@/domain/exam-timetable";
import { topicUnitNumber } from "@/domain/year-group";
import { recommend } from "@/domain/recommender";
import { UnitExamTimetable } from "@/components/UnitExamTimetable";
import type { ExamDate } from "@/domain/types";

const SUBJECT = "wjec-alevel-physics";
const today = "2026-11-01";
const topics = topicsFor(SUBJECT);
const u1 = topics.find((t) => topicUnitNumber(t) === 1)!;
const u2 = topics.find((t) => topicUnitNumber(t) === 2)!;
const exam = (id: string, date: string, paperSpecId?: string): ExamDate => ({ id, userId: "u", subjectId: SUBJECT, date, label: id, ...(paperSpecId ? { paperSpecId } : {}) });

describe("unit exam timetable", () => {
  it("finds the subject's next paper and the end of its run-up whatever order the rows are stored in", () => {
    // A linear board's papers are whole-subject rows; a sat paper is behind us.
    const exams = [exam("p3", "2027-06-21"), exam("p1", "2026-10-20"), exam("p2", "2027-06-07"), { ...exam("x", "2027-05-01"), subjectId: "other" }];
    expect(nextSubjectExam(exams, SUBJECT, today)?.id).toBe("p2");
    expect(subjectRunUpEnd(exams, SUBJECT, today)).toBe("2027-06-21");
    expect(nextSubjectExam([exam("p1", "2026-10-20")], SUBJECT, today)).toBeNull();
    expect(subjectRunUpEnd([exam("p1", "2026-10-20")], SUBJECT, today)).toBeNull();
  });

  it("parses paper spec ids", () => {
    expect(unitOfPaperSpec(`${SUBJECT}.u2`)).toBe(2);
    expect(unitOfPaperSpec(undefined)).toBeNull();
  });

  it("gives each topic its own unit's date and no borrowed date", () => {
    const exams = [exam("a", "2027-05-20", `${SUBJECT}.u1`)];
    expect(daysToTopicExam(exams, u1, today)).toBe(200);
    expect(daysToTopicExam(exams, u2, today)).toBeNull();
  });

  it("falls back to the whole-subject date for units without their own", () => {
    const exams = [exam("a", "2027-05-20", `${SUBJECT}.u1`), exam("b", "2027-06-10")];
    expect(examForTopic(exams, u2, today)?.id).toBe("b");
    expect(examForTopic(exams, u1, today)?.id).toBe("a");
  });

  it("builds rows with Year 12 limited to AS units and sorts upcoming papers", () => {
    const subject = getSubject(SUBJECT)!;
    const exams = [exam("a", "2027-06-01", `${SUBJECT}.u2`), exam("b", "2027-05-20", `${SUBJECT}.u1`)];
    const y12 = timetableRows({ subjects: [subject], topics, exams, today, yearGroup: "year-12" });
    expect(y12.map((r) => r.unit)).toEqual([1, 2]);
    expect(upcomingPapers(y12).map((r) => r.unit)).toEqual([1, 2]);
    expect(timetableRows({ subjects: [subject], topics, exams, today }).length).toBeGreaterThan(2);
    expect(nextPaperSentence(y12[0])).toContain("Unit 1 is in 200 days (90 minutes, 80 marks)");
  });

  it("validates dates", () => {
    expect(checkUnitExamDate("2027-02-30", today).ok).toBe(false);
    expect(checkUnitExamDate("2026-10-01", today).ok).toBe(false);
    expect(checkUnitExamDate("2031-01-01", today).ok).toBe(false);
    expect(checkUnitExamDate("2027-05-20", today).ok).toBe(true);
  });

  it("edits replace duplicates and clear removes", () => {
    const subject = { id: SUBJECT, name: "Physics" };
    const exams = [exam("a", "2027-05-20", `${SUBJECT}.u1`), exam("dup", "2027-05-21", `${SUBJECT}.u1`)];
    const set = editUnitDate({ exams, userId: "u", subject, unit: 1, paperName: "Unit 1: Motion", date: "2027-05-22", newId: "n" });
    expect(set.save).toMatchObject({ id: "a", date: "2027-05-22", label: "Physics Unit 1" });
    expect(set.removeIds).toEqual(["dup"]);
    expect(editUnitDate({ exams, userId: "u", subject, unit: 1, paperName: "Unit 1", date: "", newId: "n" }).removeIds).toEqual(["a", "dup"]);
  });

  it("recommender urgency follows the topic's own unit date", () => {
    const base = { subjectIds: [SUBJECT], now: new Date(`${today}T10:00:00Z`), sessionLengthMinutes: 20, cards: [], mistakes: [], plan: [], topics: [u1, u2] } as never;
    const mastery = [u1, u2].map((t) => ({ topicId: t.id, subjectId: SUBJECT, mastery: 0.2, accuracy: 0.2, attempts: 6, retention: 0.5, cardsTotal: 0, weak: true })) as never;
    const exams = [exam("a", "2026-11-08", `${SUBJECT}.u1`)];
    const recs = recommend({ ...(base as object), mastery, exams } as never);
    const r1 = recs.find((r) => r.topicId === u1.id && r.explanation?.daysToExam != null);
    const r2 = recs.find((r) => r.topicId === u2.id);
    expect(r1?.explanation?.daysToExam).toBe(7);
    expect(r2?.explanation?.daysToExam ?? null).toBeNull();
  });

  it("renders a row per AS paper with countdowns", () => {
    const html = renderToStaticMarkup(createElement(UnitExamTimetable, { subjectIds: [SUBJECT], exams: [exam("a", "2027-05-20", `${SUBJECT}.u1`)], userId: "u", yearGroup: "year-12", today, onSave: async () => {}, onRemove: async () => {} }));
    expect(html).toContain("In 200 days");
    expect(html).toContain("No date yet");
    expect(html).not.toContain("Unit 3");
  });
});
