"use client";

import { useMemo } from "react";

import { allTopics } from "@/domain/curriculum";

import { computeTopicMastery } from "@/domain/mastery";

import { computeApplicationMastery } from "@/domain/application-mastery";
import { trustedAssessmentContent } from "@/domain/physics-content-review";
import { computeRecallMastery } from "@/domain/recall-mastery";
import { masteryIntervals } from "@/domain/mastery-uncertainty";

import type { Attempt, Card, Id, Mistake } from "@/domain/types";

import type { Snapshot } from "@/data/repository";

// Domain-separated concerns (no behaviour change — pure moves out of the monolith):

import { trustedSnapshotAttempt, trustedSnapshotMistake } from "./trusted-evidence";

// Responsibility modules: each owns its state, persistence and actions; the
// provider below only composes them with the derived learner model.

export function useLearnerMastery(snapshot: Snapshot | null, topics: ReturnType<typeof allTopics>) {
  // Evidence inputs have their own stable boundary: settings, plan, streak
  // and sync writes cannot invalidate evidence-only reports.
  const cards = snapshot?.cards;
  const reviewLogs = snapshot?.reviewLogs;
  const attempts = snapshot?.attempts;
  const mistakes = snapshot?.mistakes;
  const questions = snapshot?.questions;
  const evidence = useMemo(() => cards && reviewLogs && attempts && mistakes && questions
    ? { cards, reviewLogs, attempts, mistakes, questions } : null,
    [cards, reviewLogs, attempts, mistakes, questions]);

  const mastery = useMemo(() => {
    if (!evidence) return [];
    return computeTopicMastery({
      topics,
      cards: evidence.cards,
      reviewLogs: evidence.reviewLogs,
      attempts: evidence.attempts,
      mistakes: evidence.mistakes,
      questions: evidence.questions,
      trustedQuestion: trustedAssessmentContent,
    });
  }, [evidence, topics]);

  const recallMastery = useMemo(() => {
    if (!cards || !reviewLogs) return [];
    return computeRecallMastery({
      topics,
      cards: cards,
      reviewLogs: reviewLogs,
    });
  }, [cards, reviewLogs, topics]);

  const masteryUncertainty = useMemo(() => {
    if (!evidence) return [];

    const trustedAttempts = evidence.attempts.filter((attempt) => trustedSnapshotAttempt(attempt, evidence.questions, evidence.attempts));
    const trustedMistakes = evidence.mistakes.filter((mistake) => trustedSnapshotMistake(mistake, evidence.questions, evidence.attempts));

    const cardsByTopic = new Map<Id, Card[]>();
    for (const card of evidence.cards) {
      const rows = cardsByTopic.get(card.topicId) ?? [];
      rows.push(card);
      cardsByTopic.set(card.topicId, rows);
    }

    const attemptsByTopic = new Map<Id, Attempt[]>();
    for (const attempt of trustedAttempts) {
      for (const topicId of attempt.topicIds) {
        const rows = attemptsByTopic.get(topicId) ?? [];
        rows.push(attempt);
        attemptsByTopic.set(topicId, rows);
      }
    }

    const mistakesByTopic = new Map<Id, Mistake[]>();
    for (const mistake of trustedMistakes) {
      const rows = mistakesByTopic.get(mistake.topicId) ?? [];
      rows.push(mistake);
      mistakesByTopic.set(mistake.topicId, rows);
    }

    return masteryIntervals({
      masteryByTopic: new Map(mastery.map((row) => [row.topicId, row.mastery] as const)),
      cardsByTopic,
      attemptsByTopic,
      mistakesByTopic,
    });
  }, [evidence, mastery]);

  const applicationMastery = useMemo(() => {
    if (!questions || !attempts) return [];
    return computeApplicationMastery({
      topics,
      questions: questions,
      attempts: attempts,
      trustedQuestion: trustedAssessmentContent,
    });
  }, [questions, attempts, topics]);

  return { evidence, mastery, recallMastery, applicationMastery, masteryUncertainty };
}
