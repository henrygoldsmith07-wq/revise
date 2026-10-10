"use client";

// ---------------------------------------------------------------------------
// Exam outlook line(s) for Today.
//
// Reads the store's *live* predictions — recomputed every time evidence lands
// (a marked answer, a completed paper) — so the range shown is updated after
// every meaningful assessment without any extra bookkeeping. Rows are honest
// by construction: a subject with fewer than MIN_OUTLOOK_ATTEMPTS marked
// answers never shows a number, and one with none at all reads exactly that.
// ---------------------------------------------------------------------------

import { confidenceWord, EVIDENCE_CONFIDENCE } from "@/domain/plain-numbers";
import { getSubject } from "@/domain/curriculum";
import { MIN_OUTLOOK_ATTEMPTS, outlookRows } from "@/domain/exam-outlook";
import { formatExamDate } from "@/domain/pace-forecast";
import { useStoreFields } from "@/state/store";

export function ExamOutlook() {
  const store = useStoreFields("attempts", "examDates", "predictions", "questions", "settings");
  const { predictions, attempts, questions, examDates, settings } = store;

  // The original two-argument outlookRows(predictions, attempts) contract is
  // retained; the question index supplies the Physics trust gate.
  const rows = outlookRows(predictions, attempts, questions).filter((r) => settings.subjectIds.includes(r.subjectId));
  const claimable = rows.filter((r) => r.attempts >= MIN_OUTLOOK_ATTEMPTS);
  const attempted = rows.reduce((sum, r) => sum + r.attempts, 0);

  if (!claimable.length) {
    if (attempted === 0) {
      return (
        <p className="text-xs text-ink3 mt-3" role="status">
          Exam prediction — none yet. It appears from your first few marked answers; no honest score can be guessed
          before there is evidence.
        </p>
      );
    }
    return (
      <p className="text-xs text-ink3 mt-3" role="status">
        Exam prediction is forming — {attempted} marked answer{attempted === 1 ? "" : "s"} so far. A subject&apos;s
        score range appears once it has {MIN_OUTLOOK_ATTEMPTS} or more.
      </p>
    );
  }

  return (
    <div className="text-xs text-ink3 mt-3 space-y-0.5" role="status">
      {claimable
        .sort((a, b) => {
          const ea = examDates.find((e) => e.subjectId === a.subjectId)?.date ?? "9999";
          const eb = examDates.find((e) => e.subjectId === b.subjectId)?.date ?? "9999";
          return ea.localeCompare(eb);
        })
        .map((row) => {
          const subject = getSubject(row.subjectId);
          const exam = examDates.find((e) => e.subjectId === row.subjectId);
          const name = subject?.name ?? row.subjectId;
          const when = exam ? ` in ${name} (exam ${formatExamDate(exam.date)})` : ` in ${name}`;
          const provisional = row.provisional ? "Provisional estimate" : "Estimate";
          // Reference-tier questions are not checked against the specification,
          // so the band is a practice estimate, never an exam prediction.
          if (row.referenceTier) {
            return (
              <p key={row.subjectId}>
                Practice estimate: about {row.low}–{row.high}% on {name} reference questions (n={row.independentAttempts} independent).
                These are not checked against the exam board&apos;s specification, so this is not an exam prediction.
              </p>
            );
          }
          return (
            <p key={row.subjectId}>
              {provisional}: you&apos;re most likely to score {row.low}–{row.high}%{when} (n={row.independentAttempts} independent, {confidenceWord(row.confidence, EVIDENCE_CONFIDENCE)} confidence).
            </p>
          );
        })}
    </div>
  );
}
