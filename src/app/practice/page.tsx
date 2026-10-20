"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aiGenerateQuestions } from "@/lib/optional-ai";
import { gateGeneratedQuestions } from "@/domain/generated-question-quality";
import { remapContentIdString } from "@/data/content-ids";
import { getSubject, getTopic, topicsFor } from "@/domain/curriculum";
import { diagnosePrerequisiteWeakness, type PrerequisiteDiagnosis } from "@/domain/prerequisite-diagnosis";
import { remediationForMistake } from "@/domain/remediation";
import { rankQuestionsForExposure } from "@/domain/question-exposure";
import { delayedFarTransferRetests } from "@/domain/delayed-far-transfer";
import { todayIso } from "@/domain/scheduling";
import { buildPostSessionClosure } from "@/domain/post-session-closure";
import { initialPracticeSubject, practiceSessionSummary, recordPracticeAttempt } from "@/domain/practice-session";
import { adaptiveReturnHref } from "@/domain/study-navigation";
import { chooseWorkedExample, deferProofSupply, examPaceTargetSeconds, fitStepQueueToMinutes, freshAfterExample, orderByCommand, parseCommandParam, parsePracticeStepMode, parseStepMinutes, questionUsesCommand, stepModeApplies, stepModeHintBudget, stepModeSupportTier, WORKED_STEP_TRIES, type WorkedExampleChoice } from "@/domain/practice-step-mode";
import { commandWordLabel } from "@/domain/command-word-validation";
import type { Attempt, Mistake, Question } from "@/domain/types";
import { useStoreFields, useSubjects } from "@/state/store";
import { MissionSessionMode } from "@/components/MissionSessionMode";
import { SessionEvidenceBlock } from "@/components/SessionEvidenceBlock";
import { PostSessionClosure } from "@/components/PostSessionClosure";
import { QuestionRunner, type QuestionDraft } from "@/components/QuestionRunner";
import { QuestionNavigator } from "@/components/QuestionNavigator";
import { parseQuickSessionMinutes, type QuickSessionMinutes } from "@/domain/quick-session";
import { buildWeakTopicExam } from "@/domain/weak-topic-exam";
import { wrongAnswerQueue } from "@/domain/wrong-answers";
import { reviewedWjecTopicEdges } from "@/content/capabilities";
import { requiresWjecContentReview } from "@/domain/physics-content-review";
import { learnerEvidenceTrusted } from "@/domain/content-trust";
import { WeakTopicExamMode } from "@/components/WeakTopicExamMode";
import { ProofCheckMode } from "@/components/ProofCheckMode";
import { PrerequisiteCheck } from "@/components/PrerequisiteCheck";
import { QuickSessionMode, QuickSessionPicker } from "@/components/QuickSessionMode";
import { RecoverMarksCard } from "@/components/MarksAtRiskPanel";
import { MarksLedger } from "@/components/MarksLedger";
import { PaperAutopsyView, PaperRepairMode, RecoverMarksMode } from "@/components/RecoveryModes";
import { RichText } from "@/components/RichText";
import { WorkedExamplePanel } from "@/components/WorkedExamplePanel";
import { Button, ButtonLink, EmptyState, Panel, Pill, SectionHeading, Segmented } from "@/components/ui";

// Question practice. The queue is built from everything the student has: the
// authored bank, questions extracted from their own uploaded papers, and
// anything generated for them. Weakest topics surface first.

export default function PracticePage() {
  return (
    <Suspense fallback={null}>
      <PracticeForRequest />
    </Suspense>
  );
}

/**
 * A repair-plan step link is clicked from a marked practice answer on this
 * same route, so Next keeps the page mounted and the held queue would still be
 * the question just answered ("Question 1 of 1", already marked). Keying on
 * the step (mode, topic, command) starts the step with its own queue; every
 * other in-page navigation keeps the existing held-queue behaviour.
 */
function PracticeForRequest() {
  const params = useSearchParams();
  const step = parsePracticeStepMode(params);
  return <Practice key={step ? `step:${step}:${params.get("topic") ?? ""}:${params.get("command") ?? ""}` : "practice"} />;
}

function Practice() {
  const params = useSearchParams();
  const router = useRouter();
  const store = useStoreFields("adaptiveSession", "addQuestions", "attempts", "cards", "clearRevisionCheckpoint", "completeSession", "dueCards", "mastery", "mistakes", "questions", "revisionCheckpoint", "saveRevisionCheckpoint", "settings", "userId");
  const dueCount = store.dueCards.length;
  const { saveRevisionCheckpoint, clearRevisionCheckpoint } = store;
  const subjects = useSubjects();
  const topicParam = params.get("topic");
  const subjectParam = params.get("subject");
  const sessionId = params.get("session");
  const questionParam = params.get("question");
  const retestId = params.get("retest");
  const mode = params.get("mode") === "recall" ? "recall" : "practice";
  // Adaptive ladder rungs arrive as ?adaptiveStep=supported|independent|transfer.
  // Supported keeps the full hint ladder; the evidence rungs pass 0 so the
  // attempt stays unaided and mastery counts it at full weight.
  const adaptiveStep = params.get("adaptiveStep");
  const adaptiveHintBudget = adaptiveStep === "independent" || adaptiveStep === "transfer" ? 0 : undefined;
  // Repair-plan steps arrive as ?guided=1 / ?timed=1 / ?unaided=1 (plus
  // ?command= for a command-word check). They only ever add structure to the
  // plain topic queue; retests, far-transfer checks, recall and adaptive
  // rungs keep their own rules (see src/domain/practice-step-mode.ts).
  const requestedStepMode = parsePracticeStepMode(params);
  const commandParam = parseCommandParam(params.get("command"));
  // ?minutes= is the plan step's stated length; the step's questions fit it
  // at exam pace (90 s a mark) instead of a flat three.
  const stepMinutes = parseStepMinutes(params.get("minutes"));
  // Steps opened from the adaptive runner carry ?from=adaptive&return=... so
  // marking here replans the runner's next step and hands the student back
  // to it — one tutor flow, not a redirect between pages.
  const returnHref = params.get("from") === "adaptive" ? adaptiveReturnHref(params.get("return")) : null;
  const resumeRequested = params.get("resume") === "1";
  const savedCheckpoint =
    resumeRequested && store.revisionCheckpoint?.activity === "practice" ? store.revisionCheckpoint : null;

  const [generating, setGenerating] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const today = todayIso();
  const farTransferRetests = useMemo(
    () => delayedFarTransferRetests({ attempts: store.attempts, questions: store.questions, today }),
    [store.attempts, store.questions, today],
  );
  const farTransferRetest = retestId
    ? farTransferRetests.find((retest) => retest.retestId === retestId && retest.status !== "completed")
    : undefined;
  // Legacy deep links (?question=seed-q:...) predate the cnt: namespace
  // (see src/data/content-ids.ts) — remap so they keep resolving to the
  // seeded bank instead of landing on an empty queue.
  const requestedQuestionParam = farTransferRetest?.candidateQuestionId ?? (questionParam ? remapContentIdString(questionParam) : questionParam);
  const [subjectId, setSubjectId] = useState(() => initialPracticeSubject({
    enrolledSubjectIds: subjects.map((subject) => subject.id),
    subjectParam,
    questionSubjectId: store.questions.find((question) => question.id === requestedQuestionParam)?.subjectId,
    topicSubjectId: getTopic(topicParam ?? "")?.subjectId,
    retestSubjectId: farTransferRetest?.subjectId,
  }));
  const [topicId, setTopicId] = useState(topicParam ?? farTransferRetest?.topicIds[0] ?? "");
  const quickParam = params.get("quick");
  const [quickMinutes, setQuickMinutes] = useState<QuickSessionMinutes | null>(() => parseQuickSessionMinutes(quickParam));
  const [weakExam, setWeakExam] = useState(() => params.get("weak") === "1");
  // Proof-check mode (?proof=<topicId>): the delayed check Today offers.
  const [proofTopicId, setProofTopicId] = useState(() => params.get("proof"));
  // Wrong-answer-only mode (?wrong=1): do only the questions behind lost marks.
  const wrongParam = params.get("wrong") === "1";
  const [wrongOnly, setWrongOnly] = useState(wrongParam);
  const recoverParam = params.get("recover") === "1";
  const autopsyParam = params.get("autopsy");
  const autopsyStep = params.get("step");
  const [recover, setRecover] = useState(recoverParam);
  const [autopsyRun, setAutopsyRun] = useState(autopsyParam);
  // Links from this same page (the recovery card, repair steps) change the URL without remounting.
  const [seenParams, setSeenParams] = useState({ recoverParam, autopsyParam });
  if (seenParams.recoverParam !== recoverParam || seenParams.autopsyParam !== autopsyParam) {
    setSeenParams({ recoverParam, autopsyParam });
    setRecover(recoverParam);
    setAutopsyRun(autopsyParam);
  }
  const weakExamPlan = useMemo(
    () => buildWeakTopicExam({ mistakes: store.mistakes, questions: store.questions }),
    [store.mistakes, store.questions],
  );
  const wrongPlan = useMemo(
    () =>
      wrongAnswerQueue({
        mistakes: store.mistakes,
        questions: store.questions,
        subjectIds: store.settings.subjectIds,
      }),
    [store.mistakes, store.questions, store.settings.subjectIds],
  );
  const wrongQueueIds = useMemo(
    () =>
      subjectId
        ? wrongPlan.items.filter((item) => item.subjectId === subjectId).map((item) => item.questionId)
        : wrongPlan.questionIds,
    [wrongPlan, subjectId],
  );
  const [sessionAttempts, setSessionAttempts] = useState<Attempt[]>([]);
  // Unsubmitted answers survive a refresh: drafts persist per account and
  // question on this device only (never synced), and are dropped the moment
  // the question is submitted. Keyed by user so accounts sharing a browser
  // profile never see each other's half-written answers. The active user's
  // map is derived from the bucket, so switching account needs no re-read
  // effect, and persisting stays the effect's only job.
  const [draftsByUser, setDraftsByUser] = useState<Record<string, Record<string, QuestionDraft>>>(() =>
    store.userId ? { [store.userId]: readPracticeDrafts(store.userId) } : {},
  );
  useEffect(() => {
    writePracticeDrafts(store.userId, draftsByUser[store.userId] ?? {});
  }, [store.userId, draftsByUser]);
  const questionDrafts = draftsByUser[store.userId] ?? {};
  const setQuestionDrafts = useCallback(
    (next: Record<string, QuestionDraft> | ((previous: Record<string, QuestionDraft>) => Record<string, QuestionDraft>)) => {
      setDraftsByUser((prev) => {
        const current = prev[store.userId] ?? {};
        const updated = typeof next === "function" ? next(current) : next;
        return { ...prev, [store.userId]: updated };
      });
    },
    [store.userId],
  );
  const [closed, setClosed] = useState(false);
  const [sessionElapsedMs, setSessionElapsedMs] = useState(0);
  const [sessionStartedAt, setSessionStartedAt] = useState(() => Date.now());
  const closing = useRef(false);
  const completedPlanRef = useRef<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const masteryByTopic = useMemo(() => new Map(store.mastery.map((m) => [m.topicId, m])), [store.mastery]);
  const questionsById = useMemo(
    () => new Map(store.questions.map((q) => [q.id, q] as const)),
    [store.questions],
  );
  const retestMistake: Mistake | undefined = useMemo(
    () => (retestId ? store.mistakes.find((mistake) => mistake.id === retestId) : undefined),
    [retestId, store.mistakes],
  );
  const retestQuestion = retestMistake?.questionId ? questionsById.get(retestMistake.questionId) : undefined;
  const appliedStepMode = wrongOnly ? null : stepModeApplies({
    mode: requestedStepMode,
    retest: Boolean(retestId),
    farTransfer: Boolean(farTransferRetest),
    recall: mode === "recall",
    adaptiveStep: Boolean(adaptiveStep),
  });
  // Exposure control keeps unseen questions ahead of secure repeats, while
  // still allowing weak questions back into the queue when they need work.
  const rankedPool = (subject: string, topic: string): Question[] => {
    let pool = store.questions.filter((q) => store.settings.subjectIds.includes(q.subjectId));
    if (subject) pool = pool.filter((q) => q.subjectId === subject);
    if (topic) pool = pool.filter((q) => q.topicIds.includes(topic));
    return rankQuestionsForExposure({
      questions: pool,
      attempts: store.attempts,
      masteryByTopic: new Map([...masteryByTopic.entries()].map(([id, row]) => [id, row.mastery])),
    });
  };
  // A worked-example step (?worked=1) shows one question worked through,
  // chosen once and held (like the queue) so marking the fresh try never
  // swaps the example. It never spends a question that could later prove the
  // topic; when there is no such example, the step is the guided try instead
  // and says so.
  const [workedExample] = useState<WorkedExampleChoice | null>(() => {
    if (appliedStepMode !== "worked" || !topicId) return null;
    const held = new Set(savedCheckpoint?.queueIds ?? []);
    const ranked = rankedPool(subjectId, topicId).filter((q) => !held.has(q.id));
    const choice = chooseWorkedExample({ pool: ranked.filter((q) => q.kind !== "mcq"), attempts: store.attempts, questions: store.questions });
    return choice && (held.size || freshAfterExample(ranked, choice.example).length) ? choice : null;
  });
  const workedUnavailable = appliedStepMode === "worked" && !workedExample;
  const stepMode = workedUnavailable ? "guided" : appliedStepMode;
  const timedCommand = stepMode === "timed" ? commandParam : null;
  const originalAttempt = retestMistake?.attemptId
    ? store.attempts.find((attempt) => attempt.id === retestMistake.attemptId)
    : undefined;
  const retestRemediation = useMemo(
    () =>
      retestMistake && retestQuestion
        ? remediationForMistake(
            retestMistake,
            retestQuestion,
            originalAttempt,
            getTopic(retestMistake.topicId),
          )
        : null,
    [originalAttempt, retestMistake, retestQuestion],
  );

  // Repeated misses on the selected topic? If so, is the real weakness one of
  // its prerequisites? When it is, steer there instead of building yet another
  // queue of the failing topic's own questions. Skipped in retest / weak-topic
  // / far-transfer modes, which have their own focused intent.
  const prereqDiagnosis: PrerequisiteDiagnosis | null = useMemo(() => {
    if (weakExam || retestMistake || farTransferRetest || !topicId) return null;
    const topic = getTopic(topicId);
    if (!topic) return null;
    return diagnosePrerequisiteWeakness({
      topicId,
      topics: topicsFor(topic.subjectId),
      attempts: store.attempts,
      mistakes: store.mistakes,
      mastery: store.mastery,
      cards: store.cards,
      questions: store.questions,
      ...(requiresWjecContentReview(topic.subjectId) ? { edges: reviewedWjecTopicEdges(topic.subjectId) } : {}),
      now: new Date(),
    });
  }, [
    topicId,
    weakExam,
    retestMistake,
    farTransferRetest,
    store.attempts,
    store.mistakes,
    store.mastery,
    store.cards,
    store.questions,
  ]);
  const prereqTarget =
    prereqDiagnosis?.failing && prereqDiagnosis.verdict && prereqDiagnosis.verdict.kind !== "topic-itself"
      ? getTopic(prereqDiagnosis.verdict.prereqTopicId)
      : undefined;

  /**
   * Order the pool once, then hold it. Marking an answer changes mastery and
   * marks the question as seen, so a live re-sort would swap the question out
   * from under the student the instant they submitted it — taking the marking
   * with it. The order is recomputed only when the student changes the filters
   * or generates new questions.
   */
  const orderFor = (subject: string, topic: string): string[] => {
    if (retestQuestion) return [retestQuestion.id];
    // An explicit ?question= deep link names one bank item (e.g. command-word
    // spec, ⌘K search): resolve it directly instead of filtering it out when
    // its subject is not enrolled. Every other path stays in-subject.
    if (requestedQuestionParam) {
      const direct = questionsById.get(requestedQuestionParam);
      if (direct) return [direct.id];
    }
    // Wrong-answer-only mode: the queue is exactly the questions behind lost
    // marks — no exposure ranking, no unseen questions mixed in.
    if (wrongOnly) return wrongQueueIds;
    const pool = rankedPool(subject, topic);
    if (!stepMode) return pool.map((q) => q.id);
    // Guided and worked steps keep unseen teacher-reviewed questions for the
    // topic's proof check while anything else can fill the step.
    const ranked = deferProofSupply(pool, stepMode, store.attempts, store.questions).ordered;
    // A worked step is the example plus one fresh try outside its family.
    if (stepMode === "worked") {
      return fitStepQueueToMinutes(freshAfterExample(ranked, workedExample?.example ?? null), stepMinutes, WORKED_STEP_TRIES).queue.map((q) => q.id);
    }
    // A command-word check puts questions using that verb first; it never
    // removes the rest, so a topic without one still has a queue. The step
    // fits its stated minutes at exam pace (at most three questions).
    return fitStepQueueToMinutes(orderByCommand(ranked, timedCommand).ordered, stepMinutes).queue.map((q) => q.id);
  };

  const [index, setIndex] = useState(() => savedCheckpoint?.position ?? 0);
  const [order, setOrder] = useState<string[]>(() => savedCheckpoint?.queueIds?.length ? savedCheckpoint.queueIds : orderFor(subjectId, topicId));

  const queue = useMemo(
    () => order.map((id) => questionsById.get(id)).filter((q): q is Question => Boolean(q)),
    [order, questionsById],
  );

  // A ?question= push that arrives while the page is already mounted (e.g.
  // ⌘K search) must retarget the held queue, not silently do nothing. The
  // adjustment happens during render (record-the-previous-value pattern) so
  // no setState-in-effect cascade is created.
  const [lastRequestedQuestion, setLastRequestedQuestion] = useState<string | null>(requestedQuestionParam);
  if (requestedQuestionParam !== lastRequestedQuestion) {
    setLastRequestedQuestion(requestedQuestionParam);
    if (
      requestedQuestionParam &&
      !closed &&
      !retestMistake &&
      order[0] !== requestedQuestionParam &&
      questionsById.has(requestedQuestionParam)
    ) {
      setOrder([requestedQuestionParam]);
      setIndex(0);
    }
  }

  const current: Question | undefined = retestMistake ? retestQuestion : queue[index];

  // The step's real length at exam pace, so a plan step never looks shorter
  // (or longer) than the questions it holds.
  const stepLength = useMemo(() => {
    if (!stepMode || !queue.length) return null;
    const seconds = queue.reduce((sum, q) => sum + examPaceTargetSeconds(q.totalMarks), 0);
    const minutes = Math.max(1, Math.round(seconds / 60));
    const count = `${queue.length} question${queue.length === 1 ? "" : "s"}`;
    const over = stepMinutes !== null && seconds > stepMinutes * 60
      ? `, longer than this ${stepMinutes}-minute step as no shorter question is available here`
      : "";
    // deferProofSupply put reviewed questions last, so any left in a supported
    // step are there because nothing else was available.
    const reviewed = stepMode === "guided" || stepMode === "worked" ? queue.filter(learnerEvidenceTrusted).length : 0;
    const spent = reviewed
      ? `. It uses ${reviewed === 1 ? "a teacher-reviewed question" : `${reviewed} teacher-reviewed questions`} as nothing else is available here; once seen, ${reviewed === 1 ? "it" : "they"} cannot be your proof check`
      : "";
    return `${stepMode === "worked" ? `a worked example, then ${count} to try` : count}, about ${minutes} min at exam pace${over}${spent}`;
  }, [queue, stepMinutes, stepMode]);

  const checkpointHref = useMemo(() => {
    const next = new URLSearchParams();
    if (subjectId) next.set("subject", subjectId);
    if (topicId) next.set("topic", topicId);
    if (mode === "recall") next.set("mode", mode);
    if (sessionId) next.set("session", sessionId);
    if (retestId) next.set("retest", retestId);
    if (appliedStepMode) next.set(appliedStepMode, "1");
    if (timedCommand) next.set("command", timedCommand);
    if (appliedStepMode && stepMinutes) next.set("minutes", String(stepMinutes));
    next.set("resume", "1");
    const query = next.toString();
    return query ? `/practice?${query}` : "/practice?resume=1";
  }, [appliedStepMode, mode, retestId, sessionId, stepMinutes, subjectId, timedCommand, topicId]);

  // Mission, recovery, paper-repair, weak-topic and quick modes run their own question sets; the generic
  // queue behind them must not save a resume point for questions the student never opened.
  const missionActive = Boolean(params.get("mission")) || recover || Boolean(autopsyRun) || weakExam || quickMinutes !== null || Boolean(proofTopicId);
  useEffect(() => {
    if (missionActive) return;
    if (closed || !current) {
      if (resumeRequested && !current) void clearRevisionCheckpoint();
      return;
    }
    void saveRevisionCheckpoint({
      activity: "practice",
      title: retestMistake ? "Retest a mistake" : mode === "recall" ? "Active recall" : "Exam questions",
      href: checkpointHref,
      position: retestMistake ? 0 : index,
      total: retestMistake ? 1 : queue.length,
      queueIds: retestMistake ? [current.id] : order,
      retestMistakeId: retestMistake?.id,
    });
  }, [checkpointHref, clearRevisionCheckpoint, closed, current, index, missionActive, mode, order, queue.length, resumeRequested, retestMistake, saveRevisionCheckpoint]);

  function resetSession() {
    setSessionAttempts([]);
    setQuestionDrafts({});
    setClosed(false);
    setSessionElapsedMs(0);
    setSessionStartedAt(Date.now());
    closing.current = false;
    completedPlanRef.current = null;
    setFinishing(false);
    setFinishError(null);
  }

  async function finishSession() {
    if (!sessionAttempts.length || closing.current) return;
    closing.current = true;
    setFinishing(true);
    setFinishError(null);
    try {
      if (sessionId && completedPlanRef.current !== sessionId) {
        await store.completeSession(sessionId);
        completedPlanRef.current = sessionId;
      }
      await clearRevisionCheckpoint();
      setSessionElapsedMs(Date.now() - sessionStartedAt);
      setClosed(true);
    } catch {
      setFinishError("Your answers are still recorded, but the session could not finish saving. Try again.");
    } finally {
      closing.current = false;
      setFinishing(false);
    }
  }

  const summary = practiceSessionSummary(sessionAttempts, queue.map((question) => question.id));
  const sessionAwarded = summary.awarded;
  const sessionAvailable = summary.available;
  // Re-attempts of the same question signal fragility even when the latest
  // score looks fine, so retain them in the closure's repair rule.
  const sessionRetries = summary.retryCount;
  const closure = buildPostSessionClosure({
    session: "practice",
    attempted: summary.attempted,
    total: queue.length,
    awarded: sessionAwarded,
    available: sessionAvailable,
    retryCount: sessionRetries,
    elapsedMs: sessionElapsedMs,
    recommended: returnHref
      ? { href: returnHref, label: "Continue session", reason: "Your answer has updated the next tutor step." }
      : store.adaptiveSession
        ? { href: store.adaptiveSession.startHref, label: "Start next session", reason: store.adaptiveSession.reason }
        : undefined,
  });
  const answered = summary.answered;
  const latestCurrentAttempt = current ? summary.latestByQuestion.get(current.id) : undefined;
  const drafted = queue.map((question) => {
    const draft = questionDrafts[question.id];
    return Boolean(draft && (draft.choice !== null || Object.values(draft.answers).some((answer) => answer.trim())));
  });
  const currentAnswered = current ? answered[index] : false;

  if (closed) {
    return (
      <PostSessionClosure
        closure={closure}
        extra={<SessionEvidenceBlock attempts={sessionAttempts} />}
        hint="Your answers are recorded and dropped marks are available in the mistake queue."
        secondary={returnHref ? { href: returnHref, label: "Back to the tutor step" } : { href: "/practice", label: "Practise another topic" }}
      />
    );
  }

  async function generate() {
    if (!topicId) {
      setNote("Choose a topic first — generated questions are grounded in one topic's spec content.");
      return;
    }
    setGenerating(true);
    setNote(null);
    const result = await aiGenerateQuestions(topicId, 2);
    const topic = getTopic(topicId);
    const created: Question[] = result.data.questions.map((generated) => ({
      id: crypto.randomUUID(),
      subjectId: topic?.subjectId ?? subjectId,
      topicIds: [topicId],
      kind: generated.kind,
      stem: generated.stem,
      options: generated.options,
      correctIndex: generated.correctIndex,
      parts: generated.parts.map((part, i) => ({
        id: crypto.randomUUID(),
        label: part.label || (generated.parts.length > 1 ? `(${"abcdefgh"[i]})` : ""),
        prompt: part.prompt,
        marks: part.marks,
        markScheme: part.markScheme,
        modelAnswer: part.modelAnswer,
      })),
      totalMarks: generated.parts.reduce((a, p) => a + p.marks, 0),
      calculatorAllowed: true,
      difficulty: generated.difficulty as 1 | 2 | 3 | 4 | 5,
      origin: result.source === "ai" ? "ai" : "seed",
      createdAt: new Date().toISOString(),
    }));

    // The fallback returns bank questions that are already stored — adding
    // them again would duplicate the whole topic's bank.
    let fresh = created.filter((q) => !store.questions.some((existing) => existing.stem === q.stem));
    let rejectedCount = 0;
    if (result.source === "ai") {
      // A schema-valid model reply is only well-formed. Deterministic quality
      // gates decide whether it is saved, and anything saved stays unverified
      // machine output — it never acquires reviewed status here.
      const gated = gateGeneratedQuestions({
        questions: fresh,
        origin: "generated",
        topicFor: () => topic ?? null,
        bank: store.questions.filter((existing) => existing.topicIds.includes(topicId)),
        checkedAt: new Date().toISOString(),
      });
      fresh = gated.accepted;
      rejectedCount = gated.rejected.length;
    }
    if (fresh.length) {
      await store.addQuestions(fresh);
      // New questions go to the front: the student asked for them just now.
      setOrder((prev) => [...fresh.map((q) => q.id), ...prev]);
      setIndex(0);
    }
    setNote(
      result.source === "ai"
        ? `Generated ${fresh.length} new question${fresh.length === 1 ? "" : "s"} on this topic${
            rejectedCount ? ` (${rejectedCount} failed the quality checks and ${rejectedCount === 1 ? "was" : "were"} discarded)` : ""
          }. AI-generated questions are not checked by a person, so treat their marking as a guide.`
        : result.note?.startsWith("AI features are off")
          ? "AI features are off, so this is showing questions from the authored bank instead. You can switch AI on in Settings."
          : "No AI provider available, so this is showing questions from the authored bank instead.",
    );
    setGenerating(false);
  }

  const topics = subjectId ? topicsFor(subjectId) : [];

  const missionParam = params.get("mission");
  if (missionParam) {
    return <MissionSessionMode key={`${missionParam}:${params.get("stage") ?? ""}`} missionId={missionParam} stage={params.get("stage")} onExit={() => router.push("/")} />;
  }

  if (proofTopicId) {
    const exitProof = () => { setProofTopicId(null); router.push("/"); };
    return <ProofCheckMode key={proofTopicId} topicId={proofTopicId} onExit={exitProof} />;
  }

  if (weakExam) {
    return <WeakTopicExamMode onExit={() => setWeakExam(false)} />;
  }

  if (recover) {
    return <RecoverMarksMode subjectId={subjectParam ?? undefined} onExit={() => setRecover(false)} />;
  }

  if (autopsyRun) {
    const exit = () => setAutopsyRun(null);
    return autopsyStep ? <PaperRepairMode runId={autopsyRun} step={autopsyStep} onExit={exit} /> : <PaperAutopsyView runId={autopsyRun} onExit={exit} />;
  }

  if (quickMinutes) {
    return (
      <QuickSessionMode
        minutes={quickMinutes}
        subjectId={subjectId}
        topicId={topicId}
        onExit={() => setQuickMinutes(null)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <header className="space-y-3 sm:flex sm:flex-wrap sm:items-end sm:justify-between sm:gap-3 sm:space-y-0">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">
            {wrongOnly
              ? "Wrong answers only"
              : retestMistake
              ? "Retest a mistake"
              : mode === "recall"
              ? "Active recall"
              : stepMode === "worked"
              ? "Worked example"
              : stepMode === "guided"
              ? "Guided application"
              : stepMode === "timed"
              ? timedCommand ? `Timed question: “${commandWordLabel(timedCommand)}”` : "Timed question"
              : stepMode === "unaided"
              ? "Unaided exam question"
              : "Exam questions"}
          </h1>
          <p className="text-sm text-ink3 mt-0.5">
            {wrongOnly
              ? "Every question here carries marks you dropped. Re-answer them until they stick."
              : retestMistake
              ? "Apply the remediation, answer the original question again, and close the loop only when the missed point is secure."
              : mode === "recall"
              ? "Answer from memory with nothing in front of you, then get it marked."
              : stepMode === "worked"
              ? "See how one question earns its marks, then try a fresh one. Practice with support, marked as normal."
              : stepMode === "guided"
              ? "The steps are shown before you write. Practice with support, marked as normal."
              : stepMode === "timed"
              ? "Exam pace with a visible clock and no hints. Running over is shown, never penalised."
              : stepMode === "unaided"
              ? "No hints: answer it the way you would in the exam."
              : "Answer as you would in the exam. Every dropped mark becomes a card."}
          </p>
          {!wrongOnly && !retestMistake && !farTransferRetest && !stepMode ? (
            <nav aria-label="Other ways to practise" className="mt-1 flex flex-wrap gap-x-4 text-sm text-ink2">
              <Link href="/review" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-ink">Review cards{dueCount ? ` (${dueCount} due)` : ""}</Link>
              <Link href="/papers" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-ink">Past papers</Link>
              <Link href="/diagnostic" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-ink">Quick check</Link>
            </nav>
          ) : null}
        </div>
        {subjects.length > 1 && !farTransferRetest && !stepMode ? (
          <div className="w-full sm:w-auto max-w-full overflow-x-auto nice-scroll pb-1">
            <Segmented
              ariaLabel="Subject"
              value={subjectId}
              onChange={(value) => {
                setSubjectId(value);
                setTopicId("");
                setIndex(0);
                setOrder(orderFor(value, ""));
                resetSession();
              }}
              options={subjects.map((s) => ({ value: s.id, label: s.name }))}
            />
          </div>
        ) : null}
        {sessionAttempts.length ? (
          <Button size="sm" variant="primary" onClick={() => void finishSession()} disabled={finishing}>
            Finish session
          </Button>
        ) : null}
      </header>

      {finishError ? (
        <Panel className="border-danger">
          <p role="alert" className="text-sm text-ink">{finishError}</p>
          <Button size="sm" variant="primary" className="mt-3" disabled={finishing} onClick={() => void finishSession()}>
            Retry finishing session
          </Button>
        </Panel>
      ) : null}

      {farTransferRetest ? (
        <Panel className="border-accent bg-accentsoft">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Pill tone={farTransferRetest.status === "due" ? "review" : "accent"}>
                  {farTransferRetest.status === "due" ? "Due now" : `Due ${farTransferRetest.scheduledFor}`}
                </Pill>
                <p className="text-sm font-semibold text-ink">Delayed check in a new context</p>
              </div>
              <p className="text-xs text-ink2 mt-2">
                A new-context question checks whether your original success on {getTopic(farTransferRetest.topicIds[0] ?? "")?.title ?? "this topic"} transfers after a delay.
              </p>
            </div>
            <ButtonLink href="/practice" size="sm">Leave retest</ButtonLink>
          </div>
        </Panel>
      ) : null}

      {/* A repair-plan step is one focused question: the alternative entry
          points (wrong answers, weak-topic exam, marks at risk, ledger,
          quick sessions) would push it below the fold at 360px. */}
      {stepMode ? (
        <div className="space-y-1">
          <p className="text-xs text-ink3" data-testid="step-length-note">
            Opened from your repair plan{stepLength ? `: ${stepLength}` : ""}.{" "}
            <Link href={topicId ? `/practice?topic=${encodeURIComponent(topicId)}` : "/practice"} className="underline underline-offset-4 hover:text-ink">
              Practise normally instead
            </Link>
          </p>
          {workedUnavailable ? (
            <p className="text-xs text-ink2" data-testid="worked-unavailable-note">
              No worked example can be shown here without using up a question that could later prove this topic, so this is the guided try instead.
            </p>
          ) : null}
        </div>
      ) : (<>
      {wrongOnly ? (
        wrongQueueIds.length ? (
          <Panel className="border-accent bg-accentsoft">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Wrong answers only</p>
                <p className="text-xs text-ink2 mt-1">
                  {wrongQueueIds.length} question{wrongQueueIds.length === 1 ? "" : "s"} · {wrongPlan.totalMarksLost} marks
                  dropped{wrongPlan.openCount ? `, ${wrongPlan.openCount} question${wrongPlan.openCount === 1 ? "" : "s"} still unrecovered` : ""}.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setWrongOnly(false);
                  setIndex(0);
                  setOrder(orderFor(subjectId, topicId));
                  resetSession();
                }}
              >
                Back to all questions
              </Button>
            </div>
          </Panel>
        ) : (
          <Panel>
            <p className="text-sm text-ink">Nothing unrecovered here right now — no question is waiting on lost marks.</p>
            <Button
              size="sm"
              className="mt-2"
              onClick={() => {
                setWrongOnly(false);
                setOrder(orderFor(subjectId, topicId));
              }}
            >
              Back to all questions
            </Button>
          </Panel>
        )
      ) : wrongPlan.questionIds.length ? (
        <section>
          <SectionHeading title="Wrong answers only" hint="Every question you have dropped marks on, weakest first." />
          <button
            type="button"
            onClick={() => {
              setWrongOnly(true);
              setIndex(0);
              setOrder(orderFor(subjectId, ""));
              resetSession();
            }}
            className="card p-4 text-left hover:border-ink3 transition-colors w-full"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">Do only questions I got wrong</p>
                <p className="text-xs text-ink3 mt-1">
                  {wrongPlan.questionIds.length} question{wrongPlan.questionIds.length === 1 ? "" : "s"} ·{" "}
                  {wrongPlan.openCount} still unrecovered
                </p>
              </div>
              <Pill tone="danger" className="shrink-0">
                {wrongPlan.totalMarksLost} marks lost
              </Pill>
            </div>
          </button>
        </section>
      ) : null}

      {weakExamPlan.questionIds.length ? (
        <section>
          <SectionHeading title="This week's misses" hint="Questions behind marks dropped in the last 7 days — re-sat now that the mark scheme is known." />
          <button
            type="button"
            onClick={() => setWeakExam(true)}
            className="card p-4 text-left hover:border-ink3 transition-colors w-full"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">Weak-topic exam</p>
                <p className="text-xs text-ink3 mt-1">
                  {weakExamPlan.questionIds.length} question{weakExamPlan.questionIds.length === 1 ? "" : "s"} ·{" "}
                  {weakExamPlan.totalMarks} marks ·{" "}
                  {weakExamPlan.topics
                    .map((topic) => getTopic(topic.topicId)?.title ?? topic.topicId)
                    .join(", ")}
                </p>
              </div>
              <Pill tone="danger" className="shrink-0">
                {weakExamPlan.totalMarks} marks lost
              </Pill>
            </div>
          </button>
        </section>
      ) : null}

      <RecoverMarksCard />

      <MarksLedger />

      <QuickSessionPicker onSelect={setQuickMinutes} />
      </>)}

      {stepMode ? null : (
      <div className="grid grid-cols-1 sm:flex sm:flex-wrap sm:items-center gap-2">
        <select
          value={topicId}
          disabled={Boolean(retestMistake || farTransferRetest || wrongOnly)}
          onChange={(e) => {
            setTopicId(e.target.value);
            // The queue is rebuilt for the new filter, so a stale cursor would
             // land on an unrelated question.
             setIndex(0);
             setOrder(orderFor(subjectId, e.target.value));
             resetSession();
          }}
          className="field field-inline text-sm w-full sm:w-auto"
          aria-label="Topic"
        >
          <option value="">All topics</option>
          {topics.map((topic) => {
            const mastery = masteryByTopic.get(topic.id);
            return (
              <option key={topic.id} value={topic.id}>
                {topic.title}
                {mastery ? ` — ${Math.round(mastery.mastery * 100)}%` : ""}
              </option>
            );
          })}
        </select>
        <Button size="sm" className="w-full sm:w-auto" onClick={() => void generate()} disabled={generating || Boolean(retestMistake || farTransferRetest || wrongOnly)}>
          {generating ? "Generating…" : "Generate similar questions"}
        </Button>
        {queue.length ? (
          <span className="text-xs text-ink3 sm:ml-auto justify-self-end tabular-nums">
            {index + 1} of {queue.length}
          </span>
        ) : null}
      </div>
      )}

      {note ? <p className="text-xs text-ink3">{note}</p> : null}

      {prereqDiagnosis && prereqTarget && current ? (
        <PrerequisiteCheck
          diagnosis={prereqDiagnosis}
          targetTitle={getTopic(topicId)?.title ?? topicId}
          prereq={{ id: prereqTarget.id, title: prereqTarget.title }}
        />
      ) : null}

      {retestMistake && current ? (
        <Panel className="card-2 border-l-4 border-l-accent">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={retestMistake.resolved ? "success" : "danger"}>
              {retestMistake.resolved ? "Resolved mistake" : "Open mistake"}
            </Pill>
            <span className="text-xs text-ink3">{retestMistake.description}</span>
          </div>
          {retestRemediation ? (
            <div className="mt-3 space-y-1.5">
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Remediation</p>
              <p className="text-sm text-ink">{retestRemediation.action}</p>
              <p className="text-xs text-ink3">Evidence: {retestRemediation.evidence}</p>
              {retestRemediation.targetKeyPoint ? (
                <p className="text-xs text-ink3">Restudy: {retestRemediation.targetKeyPoint}</p>
              ) : null}
            </div>
          ) : null}
          <p className="text-[11px] text-ink3 mt-3">
            Targeted retests: {retestMistake.retestCount ?? 0} · submit when you are ready to check the point again.
          </p>
        </Panel>
      ) : retestId ? (
        <Panel>
          <p className="text-sm text-ink2">That mistake or its source question is no longer available.</p>
          <ButtonLink href="/" variant="primary" className="inline-block mt-3">
            Back to Today
          </ButtonLink>
        </Panel>
      ) : null}

      {mode === "recall" && current ? (
        <Panel className="card-2">
          <p className="text-xs text-ink2">
            <span className="font-semibold">Blank page first.</span> Write everything you can recall about{" "}
            {getTopic(current.topicIds[0] ?? "")?.title ?? "this topic"} before you read the question — then answer
            it. Retrieval before review is what makes this work.
          </p>
        </Panel>
      ) : null}

      {timedCommand && current && !questionUsesCommand(current, timedCommand) ? (
        <p className="text-xs text-ink3" data-testid="command-fallback-note">
          No “{commandWordLabel(timedCommand)}” question is available here yet, so this is a timed question on the same topic.
        </p>
      ) : null}

      {retestId && (!retestMistake || !retestQuestion) ? null : current ? (
        <>
          {stepMode === "worked" && workedExample ? <WorkedExamplePanel choice={workedExample} /> : null}
          <QuestionNavigator
            currentIndex={index}
            total={queue.length}
            answered={answered}
            drafted={drafted}
            onSelect={(nextIndex) => { if (!finishing) setIndex(nextIndex); }}
            onPrevious={() => setIndex((i) => Math.max(0, i - 1))}
            onNext={() => {
              if (index >= queue.length - 1) void finishSession();
              else setIndex((i) => Math.min(queue.length - 1, i + 1));
            }}
            previousDisabled={finishing || index === 0}
            nextDisabled={finishing || (index >= queue.length - 1 && !currentAnswered)}
            nextLabel={index >= queue.length - 1 ? "Finish session" : currentAnswered ? "Next question" : "Skip question"}
            controlsClassName="grid grid-cols-2 gap-2"
          />
          {latestCurrentAttempt ? (
            <p className="text-sm text-ink2" aria-live="polite">
              Latest attempt: {latestCurrentAttempt.awarded}/{latestCurrentAttempt.max} marks. Earlier attempts stay in your session history.
            </p>
          ) : null}
          <QuestionRunner
            key={`${current.id}:${retestMistake?.id ?? "practice"}`}
            question={current}
            mode={mode}
            retestMistake={retestMistake}
            repairTeachingSeen={Boolean(retestRemediation)}
            farTransfer={farTransferRetest}
            hintBudget={adaptiveHintBudget ?? stepModeHintBudget(stepMode)}
            stepMode={stepMode}
            externalHintTier={stepModeSupportTier(stepMode)}
            draft={questionDrafts[current.id]}
            onDraftChange={(draft) => setQuestionDrafts((previous: Record<string, QuestionDraft>) => ({ ...previous, [current.id]: draft }))}
            onFinished={(attempt) => {
              setSessionAttempts((previous) => recordPracticeAttempt(previous, attempt));
              setQuestionDrafts((previous: Record<string, QuestionDraft>) => {
                const next = { ...previous };
                delete next[attempt.questionId];
                return next;
              });
            }}
          />
          {retestMistake && !returnHref ? (
            <ButtonLink href="/" variant="primary" className="inline-block">
              Back to Today
            </ButtonLink>
          ) : null}
          {returnHref ? (
            <p className="text-[11px] text-ink3">
              Opened from your adaptive session — this mark replans the next step automatically.
            </p>
          ) : null}
        </>
      ) : (
        <EmptyState
          title="No questions here yet"
          body={
            topicId
              ? "Nothing is stored for this topic. Generate exam-style questions from the spec content, or upload a past paper to extract real ones."
              : "Pick a topic, or upload a past paper to extract questions from it."
          }
          action={
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button variant="primary" className="w-full sm:w-auto" onClick={() => void generate()} disabled={generating}>
                Generate questions
              </Button>
              <ButtonLink href="/papers">Upload a paper</ButtonLink>
            </div>
          }
        />
      )}

      {current && stepMode !== "unaided" && adaptiveHintBudget !== 0 ? (
        <section>
          <SectionHeading title="Topic reminders" hint="Read these after you have answered, not before." />
          <Panel>
            <div className="flex items-center gap-2 mb-2">
              <Pill>{getSubject(current.subjectId)?.name}</Pill>
              <Pill>{getTopic(current.topicIds[0] ?? "")?.title}</Pill>
            </div>
            <RichText>
              {(getTopic(current.topicIds[0] ?? "")?.keyPoints ?? []).map((p) => `- ${p}`).join("\n")}
            </RichText>
          </Panel>
        </section>
      ) : null}
    </div>
  );
}

const DRAFT_STORAGE_PREFIX = "revise:practice-drafts:";
const MAX_STORED_DRAFTS = 20;

/**
 * Unsubmitted practice answers, kept on this device so a refresh does not
 * erase half-written work. Keyed by account so profiles sharing a browser
 * never see each other's drafts; dropped the moment the question is
 * submitted. Strictly validated on read — anything malformed is ignored.
 */
function readPracticeDrafts(userId: string): Record<string, QuestionDraft> {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_PREFIX + userId);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, QuestionDraft> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== "object" || value === null) continue;
      const record = value as { answers?: unknown; choice?: unknown };
      if (typeof record.answers !== "object" || record.answers === null) continue;
      const answers: Record<string, string> = {};
      for (const [partId, text] of Object.entries(record.answers as Record<string, unknown>)) {
        if (typeof text === "string" && text.trim()) answers[partId] = text.slice(0, 8000);
      }
      const choice = typeof record.choice === "number" ? record.choice : null;
      if (Object.keys(answers).length || choice !== null) out[key] = { answers, choice };
      if (Object.keys(out).length >= MAX_STORED_DRAFTS) break;
    }
    return out;
  } catch {
    return {};
  }
}

function writePracticeDrafts(userId: string, drafts: Record<string, QuestionDraft>): void {
  try {
    const entries = Object.entries(drafts).slice(-MAX_STORED_DRAFTS);
    const raw = JSON.stringify(Object.fromEntries(entries));
    // Drafts are unbounded learner text: refuse a large blob rather than
    // evicting silently or growing storage without bound.
    if (raw.length > 100_000) return;
    window.localStorage.setItem(DRAFT_STORAGE_PREFIX + userId, raw);
  } catch {
    // Storage pressure or privacy mode: the session simply does not resume drafts.
  }
}
