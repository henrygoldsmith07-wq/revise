"use client";

import { useMemo } from "react";
import { allSubjects, getSubject } from "@/domain/curriculum";
import { predictGrade } from "@/domain/grades";
import { buildResponseTimeCalibration } from "@/domain/response-time-calibration";
import { trustedAssessmentContent } from "@/domain/physics-content-review";
import type { Id, TopicMastery } from "@/domain/types";
import type { Snapshot } from "@/data/repository";
import { buildPaperCalibrations } from "./paper-preview";

/** Assessment evidence has no dependency on plans, theme, sync or streak. */
export function useAssessmentModels(snapshot: Snapshot | null, mastery: TopicMastery[], subjectIds: Id[]) {
  const attempts = snapshot?.attempts;
  const questions = snapshot?.questions;
  const papers = snapshot?.papers;
  const examDates = snapshot?.examDates;
  const calibrationEvidence = useMemo(() => attempts && questions ? { attempts, questions } : null, [attempts, questions]);
  const calibrations = useMemo(() => buildPaperCalibrations(calibrationEvidence, mastery, subjectIds), [calibrationEvidence, mastery, subjectIds]);
  const predictions = useMemo(() => {
    if (!attempts || !questions || !examDates) return [];
    return subjectIds.map(getSubject).filter((s): s is NonNullable<typeof s> => Boolean(s))
      .map(subject => predictGrade(subject, mastery, attempts, examDates, undefined, questions));
  }, [attempts, questions, examDates, mastery, subjectIds]);
  const responseTimeCalibration = useMemo(() => buildResponseTimeCalibration({
    attempts: attempts ?? [], questions: questions ?? [], papers: papers ?? [],
    subjects: allSubjects().filter(subject => subjectIds.includes(subject.id)), trustedQuestion: trustedAssessmentContent,
  }), [attempts, questions, papers, subjectIds]);
  return { calibrations, predictions, responseTimeCalibration };
}
