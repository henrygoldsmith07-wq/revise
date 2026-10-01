import { expect, it } from "vitest";
import { buildPortabilitySnapshot } from "@/domain/portability";
import { remapPortableRecordIds } from "@/domain/portable-record-ids";
import { createCard } from "@/domain/scheduling";
import { seedQuestions } from "@/content";
import { syncWireIdValue } from "@/data/sync-contract";
import type { Attempt, Paper, ReviewLog } from "@/domain/types";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const at = "2026-09-30T00:00:00Z";

it("copies UUID rows with stable account-scoped wire keys and preserves linked IDs and prose", () => {
  const cardId = crypto.randomUUID(), questionId = crypto.randomUUID(), paperId = crypto.randomUUID();
  const card = createCard({ id: cardId, userId: A, subjectId: "reference", topicId: "topic", front: cardId, back: "Original prose" });
  const question = { ...seedQuestions[0]!, id: questionId, origin: "past-paper" as const, paperId };
  const review: ReviewLog = { id: crypto.randomUUID(), userId: A, cardId, topicId: "topic", grade: "good", elapsedMs: 10, reviewedAt: at };
  const attempt: Attempt = { id: crypto.randomUUID(), userId: A, questionId, subjectId: question.subjectId, topicIds: question.topicIds, answers: { [question.parts[0]!.id]: cardId }, marked: [], awarded: 0, max: question.totalMarks, feedback: cardId, markedBy: "rubric", elapsedMs: 10, mode: "paper", paperId, createdAt: at };
  const paper: Paper = { id: paperId, userId: A, subjectId: question.subjectId, title: cardId, totalMarks: question.totalMarks, questionIds: [questionId], status: "extracted", createdAt: at };
  const snapshot = buildPortabilitySnapshot({ userId: A, cards: [card], questions: [question, seedQuestions[0]!], attempts: [attempt], reviewLogs: [review], papers: [paper], mistakes: [], plannedSessions: [], examDates: [], deletions: [{ id: crypto.randomUUID(), entity: "cards", userId: A }, { id: crypto.randomUUID(), entity: "cards", userId: A, wireOnly: true }] });
  const copied = remapPortableRecordIds(snapshot, B);
  const copiedCard = copied.cardRecords![0]!, copiedQuestion = copied.questions![0]!;
  expect(syncWireIdValue(A, cardId)).not.toBe(syncWireIdValue(B, copiedCard.id));
  expect(syncWireIdValue(B, copiedCard.id)).not.toBe(syncWireIdValue(C, copiedCard.id));
  expect(copied.reviewLogs[0]).toMatchObject({ cardId: copiedCard.id });
  expect(copied.attempts[0]).toMatchObject({ questionId: copiedQuestion.id, paperId: copied.papers![0]!.id, answers: attempt.answers, feedback: cardId });
  expect(copied.papers![0]!.questionIds).toEqual([copiedQuestion.id]);
  expect(copiedQuestion.paperId).toBe(copied.papers![0]!.id);
  expect(copiedQuestion.parts).toEqual(question.parts);
  expect(copiedCard.front).toBe(cardId);
  expect(copied.papers![0]!.title).toBe(cardId);
  expect(copied.questions![1]!.id).toBe(seedQuestions[0]!.id);
  expect(copied.deletions![0]!.id).not.toBe(snapshot.deletions![0]!.id);
  expect(copied.deletions![1]).toEqual(snapshot.deletions![1]);
  expect(remapPortableRecordIds(snapshot, B)).toEqual(copied);
  expect(remapPortableRecordIds(copied, B)).toEqual(copied);
  expect(remapPortableRecordIds(snapshot, A)).toBe(snapshot);
});

it("does not reinterpret account or device identity when a record uses the same UUID", () => {
  const card = createCard({ id: A, userId: A, subjectId: "reference", topicId: "topic", front: "Q", back: "A" });
  const snapshot = buildPortabilitySnapshot({ userId: A, cards: [card], attempts: [], reviewLogs: [], mistakes: [], plannedSessions: [], examDates: [], gradeActuals: [{ id: "actual", anonId: A, subjectId: "reference", percent: 60, kind: "mock", takenAt: at }] });
  const copied = remapPortableRecordIds(snapshot, B);
  expect(copied.userId).toBe(A);
  expect(copied.cardRecords![0]!.userId).toBe(A);
  expect(copied.gradeActuals[0]!.anonId).toBe(A);
  expect(copied.cardRecords![0]!.id).not.toBe(A);
});
