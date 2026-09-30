"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { aiDiagnoseError, aiMark } from "@/lib/optional-ai";
import { AI_DLQ_RESOLVED_EVENT, enqueueDeadMark, type AiDlqResolvedDetail } from "@/ai/mark-dlq";
import { misconceptionsForTopic } from "@/content";

import { getTopic } from "@/domain/curriculum";
import { buildHintLadder, HINT_TIERS, hintEvidenceSource, type HintTier } from "@/domain/hints";
import {
  completeDelayedFarTransfer,
  scheduleDelayedFarTransfer,
  type DelayedFarTransferRetest,
} from "@/domain/delayed-far-transfer";
import { markMcq, rubricConfidence } from "@/domain/marking";

import { answerLooksCopied } from "@/domain/learning-evidence";
import { analyseAttemptWorking } from "@/domain/working-analysis";

import { humanVerifiedWjecQuestion, requiresWjecContentReview } from "@/domain/physics-content-review";
import { evaluateMistakeRetest } from "@/domain/mistakes";
import type { RetestEvaluation } from "@/domain/mistakes";
import { assessLowConfidenceMark, createMarkEscalationRecord } from "@/domain/mark-escalation";
import type { LowConfidenceMarkDecision } from "@/domain/mark-escalation";
import { planRemediation } from "@/domain/remediation";
import type { RemediationPlan } from "@/domain/remediation";
import { diagnoseAttemptErrors, isActionable } from "@/domain/error-diagnosis-plan";
import type { AttemptErrorDiagnosis } from "@/domain/error-diagnosis-plan";
import { isErrorCategory } from "@/domain/error-taxonomy";
import type { ErrorCategory } from "@/domain/error-taxonomy";
import type { Attempt, AttemptWorkingEvidence, Id, InterventionAttemptContext, MarkedPart, Mistake, Question } from "@/domain/types";
import { useStoreFields } from "@/state/store";

// The practice loop: attempt → marked instantly → see exactly which mark-scheme
// points were earned → dropped marks become mistakes and mistake cards without
// the student having to do anything. That last step is the whole point; a
// mistake you have to file manually is a mistake you never revisit.
/**
 * Post-marking refinement of the error diagnosis via classifier.dev.
 *
 * Contract: the marks passed in are already final and are passed back out
 * unchanged. Only the error *type* can change, only for parts the local read
 * could not act on, and only when the remote verdict clears the confidence
 * threshold. Any failure — offline, no provider, timeout, gated reply —
 * returns null and the deterministic diagnosis stays on screen.
 */
async function refineErrorDiagnosis(
  question: Question,
  marked: MarkedPart[],
  answers: Record<string, string>,
  current: AttemptErrorDiagnosis,
): Promise<AttemptErrorDiagnosis | null> {
  const uncertain = current.parts.filter((part) => !isActionable(part));
  if (!uncertain.length) return null;
  const bySignal = new Map<string, ReturnType<typeof verdictFromEnvelope>>();
  await Promise.all(
    uncertain.map(async (part) => {
      const envelope = await aiDiagnoseError({
        prompt: `${question.stem}\n${question.parts.find((candidate) => candidate.id === part.partId)?.prompt ?? ""}`,
        point: marked.find((entry) => entry.partId === part.partId)?.missedPoints[0] ?? "",
        answer: answers[part.partId] ?? "",
        awarded: part.awarded,
        maxMarks: part.max,
      });
      if (envelope.source !== "ai") return;
      bySignal.set(part.partId, verdictFromEnvelope(envelope.data));
    }),
  );
  if (!bySignal.size) return null;
  // Re-run the diagnosis with the refined verdicts. Only a part that produced
  // a confident remote answer changes; the rest keep the local read.
  return diagnoseAttemptErrors({
    question,
    marked,
    answers,
    classify: (signal) => bySignal.get(signal.partId) ?? null,
  });
}

/** Narrow the wire shape onto the domain verdict, refusing impossible labels. */
function verdictFromEnvelope(data: { category: string; confidence: number; reasons: string[]; provenance?: string; gated?: boolean; rawLabel?: string }) {
  return {
    category: (isErrorCategory(data.category) ? data.category : "other") as ErrorCategory,
    confidence: data.confidence,
    reasons: data.reasons,
    provenance: (data.provenance === "classifier-dev" ? "classifier-dev" : "local-fallback") as "classifier-dev" | "local-fallback",
    gated: Boolean(data.gated),
    ...(data.rawLabel ? { rawLabel: data.rawLabel } : {}),
  };
}

export interface QuestionDraft {
  answers: Record<string, string>;
  choice: number | null;
}

export function useQuestionExecution({
  question,
  mode = "practice",
  paperId,
  paperSpecId,
  paperRunId,
  retestMistake,
  farTransfer,
  draft,
  onFinished,
  hintBudget,
  externalHintTier,
  repairTeachingSeen = false,
  intervention,
}: {
  question: Question;
  mode?: Attempt["mode"];
  paperId?: Id;
  paperSpecId?: Id;
  paperRunId?: Id;
  retestMistake?: Mistake;
  farTransfer?: DelayedFarTransferRetest;
  draft?: QuestionDraft;
  onDraftChange?: (draft: QuestionDraft) => void;
  onFinished?: (attempt: Attempt) => void;
  /**
   * Hint tiers available for this question. Defaults to the full ladder;
   * the independent rung passes 0 so the evidence stays unaided.
   */
  hintBudget?: number;
  externalHintTier?: HintTier | null;
  repairTeachingSeen?: boolean;
  intervention?: InterventionAttemptContext;
}) {
  const needsWjecHumanReview =
    requiresWjecContentReview(question.subjectId) && !humanVerifiedWjecQuestion(question);
  const store = useStoreFields("attempts", "questions", "recordAttempt", "recordFunnel", "settings", "userId");
  const [answers, setAnswers] = useState<Record<string, string>>(() => ({ ...(draft?.answers ?? {}) }));
  const [choice, setChoice] = useState<number | null>(() => draft?.choice ?? null);
  const [marking, setMarking] = useState(false);
  const [result, setResult] = useState<{
    marked: MarkedPart[];
    feedback: string;
    source: "ai" | "fallback";
    note?: string;
    withheld?: string;
    retest?: RetestEvaluation;
    remediation: RemediationPlan;
    confidence: number | null;
    copiedAnswer?: boolean;
    workingAnalysis?: AttemptWorkingEvidence[];
    escalation?: LowConfidenceMarkDecision;
    farTransfer?: Attempt["farTransfer"];
    /** Post-marking error diagnosis; never changes the marks above. */
    errorDiagnosis?: AttemptErrorDiagnosis;
    nextAction: { label: string; href: null; why: string };
  } | null>(null);
  // Stamped after mount: reading the clock during render makes the render
  // impure and would restart the timer on every re-render.
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);
  const isMcq = question.kind === "mcq";
  const topic = getTopic(question.topicIds[0] ?? "");
  // The hint ladder is deterministic content from the question and topic —
  // no model call — and every tier used is recorded on the attempt so the
  // tutor's evidence stays honest about assisted wins.
  const ladder = useMemo(
    () => buildHintLadder(question, topic ? { keyPoints: topic.keyPoints, commonErrors: topic.commonErrors } : undefined),
    [question, topic],
  );
  const allowedTiers: HintTier[] = useMemo(
    () => HINT_TIERS.slice(0, Math.max(0, Math.min(HINT_TIERS.length, hintBudget ?? HINT_TIERS.length))),
    [hintBudget],
  );
  const [usedTiers, setUsedTiers] = useState<HintTier[]>([]);
  const [hintsOpen, setHintsOpen] = useState(false);
  const visibleHints = useMemo(() => ladder.filter((h) => usedTiers.includes(h.tier)), [ladder, usedTiers]);
  const upcoming = useMemo(
    () => ladder.filter((h) => allowedTiers.includes(h.tier)).find((h) => !usedTiers.includes(h.tier)) ?? null,
    [ladder, allowedTiers, usedTiers],
  );
  const highestUsedTier = HINT_TIERS.filter((tier) => usedTiers.includes(tier) || tier === externalHintTier ||
    (repairTeachingSeen && tier === "scaffold")).at(-1) ?? null;
  const evidenceSource = hintEvidenceSource(highestUsedTier);

  // When the DLQ later re-grades this question with AI, refresh an open
  // result view in place so the student sees the AI mark land without
  // doing anything. Scope: this question, and only while still mounted.
  const dlqResolvedRef = useRef(false);
  useEffect(() => {
    if (!result) return; // nothing to upgrade until a mark exists
    function onResolved(event: Event) {
      const detail = (event as CustomEvent<AiDlqResolvedDetail>).detail;
      if (!detail || detail.questionId !== question.id || dlqResolvedRef.current) return;
      dlqResolvedRef.current = true;
      const upgraded = detail.attempt;
      setResult((prev) =>
        prev
          ? {
              ...prev,
              marked: upgraded.marked,
              feedback: upgraded.feedback,
              source: "ai",
              confidence: upgraded.markConfidence ?? null,
              remediation: planRemediation(question, answers, upgraded.marked, topic, misconceptionsForTopic(question.topicIds[0] ?? "")),
              escalation: undefined,
            }
          : prev,
      );
    }
    window.addEventListener(AI_DLQ_RESOLVED_EVENT, onResolved);
    return () => window.removeEventListener(AI_DLQ_RESOLVED_EVENT, onResolved);
  }, [result, question, answers, topic]);

  const awarded = useMemo(() => result?.marked.reduce((a, m) => a + m.awarded, 0) ?? 0, [result]);

  const funnelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (funnelTimer.current) clearTimeout(funnelTimer.current); }, []);
  async function submit() {
    setMarking(true);
    try {
      const finished = await runSubmit();
      onFinished?.(finished);
    } finally {
      // Whatever marking or persistence does, the runner must never stay
      // stuck on "Marking…" with the submit button disabled.
      setMarking(false);
    }
  }

  async function runSubmit(): Promise<Attempt> {
    const elapsedMs = startedAt.current ? Date.now() - startedAt.current : 0;

    // MCQs are marked locally and instantly — sending a letter to a model for
    // grading would be slower, costlier and no more accurate.
    let marked: MarkedPart[];
    let feedback: string;
    let source: "ai" | "fallback" = "fallback";
    let note: string | undefined;
    let markTier: string | undefined;
    let markConfidence: number | null = null;
    let withheld: string | undefined;

    if (isMcq) {
      const single = markMcq(question, choice ?? -1);
      marked = [single];
      feedback =
        single.awarded > 0
          ? `Correct. ${question.parts[0]?.modelAnswer ?? ""}`
          : `${single.comment} ${question.parts[0]?.modelAnswer ?? ""}`;
    } else {
      const envelope = await aiMark(question, answers, { useLocalModel: Boolean(store.settings?.localAiMarking) });
      marked = envelope.data.marked;
      feedback = envelope.data.feedback;
      source = envelope.source;
      note = envelope.note;
      markTier = envelope.tier;
      markConfidence = source === "ai" && typeof envelope.data.confidence === "number" ? envelope.data.confidence : null;
      withheld = envelope.withheld ?? undefined;
    }

    const submittedAnswers = isMcq ? { [question.parts[0]?.id ?? question.id]: String(choice) } : answers;
    const copiedAnswer = answerLooksCopied(question, submittedAnswers);
    const workingAnalysis = analyseAttemptWorking(question, submittedAnswers, marked);
    const markedBy: Attempt["markedBy"] = source === "ai" ? "ai" : "rubric";
    const attemptId = crypto.randomUUID();
    // Feedback-read telemetry: fires once the result view has been on screen
    // for a moment; unmount before that means it was never read.
    funnelTimer.current = setTimeout(() => {
      void store.recordFunnel("feedback_read", attemptId);
    }, 2500);
    const createdAt = new Date().toISOString();
    // Rubric marks carry evidence-derived confidence too, so genuinely
    // ambiguous offline marking reaches the same review queue as AI marks.
    const rubricConf = source === "ai" ? null : rubricConfidence(marked);
    const escalationDecision = assessLowConfidenceMark({
      markedBy,
      confidence: source === "ai" ? markConfidence : rubricConf,
    });
    const markEscalation = createMarkEscalationRecord(escalationDecision, createdAt);
    const awarded = marked.reduce((a, m) => a + m.awarded, 0);
    const max = marked.reduce((a, m) => a + m.max, 0);
    const attempt: Attempt = {
      id: attemptId,
      userId: store.userId,
      questionId: question.id,
      subjectId: question.subjectId,
      topicIds: question.topicIds,
      answers: submittedAnswers,
      marked,
      awarded,
      max,
      feedback,
      markedBy,
      markConfidence: source === "ai" ? markConfidence ?? undefined : rubricConf ?? undefined,
      markEscalation,
      ...(copiedAnswer ? { copiedAnswer: true } : {}),
      ...(workingAnalysis.length ? { workingAnalysis } : {}),
      ...(intervention ? { intervention } : {}),

      elapsedMs,
      mode,
      ...(highestUsedTier ? { hintTier: highestUsedTier } : {}),
      ...(repairTeachingSeen ? { repairTeachingSeen: true } : {}),
      ...(paperId ? { paperId } : {}),
      ...(paperSpecId ? { paperSpecId } : {}),
      ...(paperRunId ? { paperRunId } : {}),
      ...(mode === "paper" ? { paperMarking: { status: "unreviewed" as const } } : {}),
      ...(retestMistake ? { retestMistakeId: retestMistake.id } : {}),
      createdAt,
    };

    const retest = retestMistake ? evaluateMistakeRetest(retestMistake, question, attempt, store.attempts, store.questions) : undefined;
    const remediation = planRemediation(question, submittedAnswers, marked, topic, misconceptionsForTopic(question.topicIds[0] ?? ""));
    // Post-marking error diagnosis. The marks above are already final; this
    // only decides *why* each dropped mark was lost so the next action is the
    // right one. It is computed from the deterministic local classifier first,
    // so the result view renders immediately and offline; a confident
    // classifier.dev verdict may refine it below, and can never change a mark.
    const errorDiagnosis = diagnoseAttemptErrors({ question, marked, answers: submittedAnswers });

    const farTransferLink = farTransfer
      ? completeDelayedFarTransfer(farTransfer, attempt, {
          question,
          questions: store.questions,
          history: store.attempts,
        })
      : scheduleDelayedFarTransfer({
          attempt,
          question,
          questions: store.questions,
          attemptedQuestionIds: store.attempts.map((existing) => existing.questionId),
          history: store.attempts,
        });
    const persistedAttempt = farTransferLink ? { ...attempt, farTransfer: farTransferLink } : attempt;

    await store.recordAttempt(persistedAttempt, question);
    // The score heading above answers "what did this attempt teach us": an
    // independent full-mark answer is mastery evidence at full weight, while
    // hint-supported or partial answers say which capability still needs work.
    // The next action stays inside this flow — micro-practice, an unaided
    // retry, or a transfer check — never a redirect to another page.
    const supportUsed = Boolean(highestUsedTier) || repairTeachingSeen || copiedAnswer;
    const retestOpen = Boolean(retestMistake && retest?.status !== "resolved");
    const nextAction: { label: string; href: null; why: string } =
      awarded < max
        ? {
            label: "Micro-practice the missed point",
            href: null,
            why: `You dropped ${max - awarded} of ${max} marks here — two targeted items on exactly this point, then an unaided retry.`,
          }
        : supportUsed
          ? {
              label: "Retry unaided for full evidence",
              href: null,
              why: "Full marks with support count at reduced weight — one clean unaided answer proves the capability.",
            }
          : question.difficulty < 4
            ? {
                label: "Prove it in a new context",
                href: null,
                why: "Independent success on familiar ground — transfer to unfamiliar clothing is the exam test.",
              }
            : retestOpen
              ? {
                  label: "Continue the repair",
                  href: null,
                  why: "The missed point stays open until fresh independent, transfer and delayed checks demonstrate the repair.",
                }
              : {
                  label: "Bank it — next best action",
                  href: null,
                  why: "Strong unaided evidence. The tutor loop moves on to the next weakest capability.",
                };
    // When the diagnosis names one error, the next action says so in those
    // words. The error type is what makes "micro-practice the missed point"
    // concrete: a misconception gets an explanation, a slip gets a check.
    const diagnosisHeadline = errorDiagnosis.headline;
    if (diagnosisHeadline && awarded < max) {
      nextAction.label = diagnosisHeadline.intervention.action;
      nextAction.why = `${diagnosisHeadline.intervention.action} (${diagnosisHeadline.label}, ${diagnosisHeadline.awarded}/${diagnosisHeadline.max} — diagnosed as ${diagnosisHeadline.category}${diagnosisHeadline.provenance === "classifier-dev" ? "" : " on-device"}).`;
    }
    // A rubric fallback grade (the AI never ran, or the provider failed) gets a
    // second chance: queue the persisted attempt for an AI re-grade. The drain
    // pass retries with exponential backoff + jitter and upgrades this attempt
    // in place when the provider recovers. Cache/local tiers already carry a
    // genuine model grade, so they are not re-queued.
    if (markTier === "fallback") {
      void enqueueDeadMark({ attempt: persistedAttempt, question, reason: note ?? "AI provider unavailable" });
    }
    setResult({
      marked,
      feedback,
      source,
      note,
      retest,
      remediation,
      errorDiagnosis,
      confidence: markConfidence,
      copiedAnswer,
      workingAnalysis,
      escalation: escalationDecision.escalate ? escalationDecision : undefined,
      farTransfer: persistedAttempt.farTransfer,
      withheld,
      nextAction,
    });
    // Refinement pass: classifier.dev may sharpen the error type on the parts
    // the local read was unsure about. It runs after the mark is persisted and
    // can only replace the diagnosis, never the marks — and if it fails or is
    // disabled, the deterministic diagnosis above is already on screen.
    if (!errorDiagnosis.clean) {
      void refineErrorDiagnosis(question, marked, submittedAnswers, errorDiagnosis).then((refined) => {
        if (!refined) return;
        setResult((current) => (current ? { ...current, errorDiagnosis: refined } : current));
      });
    }
    return persistedAttempt;
  }

  return { answers, setAnswers, choice, setChoice, marking, result, awarded, topic, needsWjecHumanReview, isMcq, hintsOpen, setHintsOpen, visibleHints, upcoming, usedTiers, setUsedTiers, highestUsedTier, evidenceSource, ladder, submit };
}
