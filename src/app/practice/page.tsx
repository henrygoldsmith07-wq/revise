"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { aiGenerateQuestions } from "@/ai/client";
import { getSubject, getTopic, topicsFor } from "@/domain/curriculum";
import { remediationForMistake } from "@/domain/remediation";
import { rankQuestionsForExposure } from "@/domain/question-exposure";
import { delayedFarTransferRetests } from "@/domain/delayed-far-transfer";
import { todayIso } from "@/domain/scheduling";
import { buildPostSessionClosure } from "@/domain/post-session-closure";
import type { Attempt, Mistake, Question } from "@/domain/types";
import { useStore, useSubjects } from "@/state/store";
import { PostSessionClosure } from "@/components/PostSessionClosure";
import { QuestionRunner, type QuestionDraft } from "@/components/QuestionRunner";
import { QuestionNavigator } from "@/components/QuestionNavigator";
import { parseQuickSessionMinutes, type QuickSessionMinutes } from "@/domain/quick-session";
import { QuickSessionMode, QuickSessionPicker } from "@/components/QuickSessionMode";
import { RichText } from "@/components/RichText";
import { Button, ButtonLink, EmptyState, Panel, Pill, SectionHeading, Segmented } from "@/components/ui";

// Question practice. The queue is built from everything the student has: the
// authored bank, questions extracted from their own uploaded papers, and
// anything generated for them. Weakest topics surface first.

export default function PracticePage() {
  return (
    <Suspense fallback={null}>
      <Practice />
    </Suspense>
  );
}

function Practice() {
  const params = useSearchParams();
  const store = useStore();
  const { saveRevisionCheckpoint, clearRevisionCheckpoint } = store;
  const subjects = useSubjects();
  const topicParam = params.get("topic");
  const subjectParam = params.get("subject");
  const sessionId = params.get("session");
  const questionParam = params.get("question");
  const retestId = params.get("retest");
  const mode = params.get("mode") === "recall" ? "recall" : "practice";
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
  const requestedQuestionParam = farTransferRetest?.candidateQuestionId ?? questionParam;
  const [subjectId, setSubjectId] = useState(subjectParam ?? farTransferRetest?.subjectId ?? subjects[0]?.id ?? "");
  const [topicId, setTopicId] = useState(topicParam ?? farTransferRetest?.topicIds[0] ?? "");
  const quickParam = params.get("quick");
  const [quickMinutes, setQuickMinutes] = useState<QuickSessionMinutes | null>(() => parseQuickSessionMinutes(quickParam));
  const [sessionAttempts, setSessionAttempts] = useState<Attempt[]>([]);
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, QuestionDraft>>({});
  const [closed, setClosed] = useState(false);
  const [sessionElapsedMs, setSessionElapsedMs] = useState(0);
  const [sessionStartedAt, setSessionStartedAt] = useState(() => Date.now());
  const closing = useRef(false);
  const [finishing, setFinishing] = useState(false);

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

  /**
   * Order the pool once, then hold it. Marking an answer changes mastery and
   * marks the question as seen, so a live re-sort would swap the question out
   * from under the student the instant they submitted it — taking the marking
   * with it. The order is recomputed only when the student changes the filters
   * or generates new questions.
   */
  const orderFor = (subject: string, topic: string): string[] => {
    if (retestQuestion) return [retestQuestion.id];
    let pool = store.questions.filter((q) => store.settings.subjectIds.includes(q.subjectId));
    if (requestedQuestionParam) pool = pool.filter((q) => q.id === requestedQuestionParam);
    else {
      if (subject) pool = pool.filter((q) => q.subjectId === subject);
      if (topic) pool = pool.filter((q) => q.topicIds.includes(topic));
    }
    // Exposure control keeps unseen questions ahead of secure repeats, while
    // still allowing weak questions back into the queue when they need work.
    return rankQuestionsForExposure({
      questions: pool,
      attempts: store.attempts,
      masteryByTopic: new Map([...masteryByTopic.entries()].map(([id, row]) => [id, row.mastery])),
    })
      .map((q) => q.id);
  };

  const [index, setIndex] = useState(() => savedCheckpoint?.position ?? 0);
  const [order, setOrder] = useState<string[]>(() => savedCheckpoint?.queueIds?.length ? savedCheckpoint.queueIds : orderFor(subjectId, topicId));

  const queue = useMemo(
    () => order.map((id) => questionsById.get(id)).filter((q): q is Question => Boolean(q)),
    [order, questionsById],
  );

  const current: Question | undefined = retestMistake ? retestQuestion : queue[index];

  const checkpointHref = useMemo(() => {
    const next = new URLSearchParams();
    if (subjectId) next.set("subject", subjectId);
    if (topicId) next.set("topic", topicId);
    if (mode === "recall") next.set("mode", mode);
    if (sessionId) next.set("session", sessionId);
    if (retestId) next.set("retest", retestId);
    next.set("resume", "1");
    const query = next.toString();
    return query ? `/practice?${query}` : "/practice?resume=1";
  }, [mode, retestId, sessionId, subjectId, topicId]);

  useEffect(() => {
    if (closed || !current) {
      if (resumeRequested && !current) void clearRevisionCheckpoint();
      return;
    }
    if (retestMistake?.resolved) {
      void clearRevisionCheckpoint();
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
  }, [checkpointHref, clearRevisionCheckpoint, closed, current, index, mode, order, queue.length, resumeRequested, retestMistake, saveRevisionCheckpoint]);

  function resetSession() {
    setSessionAttempts([]);
    setQuestionDrafts({});
    setClosed(false);
    setSessionElapsedMs(0);
    setSessionStartedAt(Date.now());
    closing.current = false;
    setFinishing(false);
  }

  async function finishSession() {
    if (!sessionAttempts.length || closing.current) return;
    closing.current = true;
    setFinishing(true);
    setSessionElapsedMs(Date.now() - sessionStartedAt);
    if (sessionId) await store.completeSession(sessionId);
    setClosed(true);
  }

  const sessionAwarded = sessionAttempts.reduce((sum, attempt) => sum + attempt.awarded, 0);
  const sessionAvailable = sessionAttempts.reduce((sum, attempt) => sum + attempt.max, 0);
  const closure = buildPostSessionClosure({
    session: "practice",
    attempted: sessionAttempts.length,
    total: queue.length,
    awarded: sessionAwarded,
    available: sessionAvailable,
    elapsedMs: sessionElapsedMs,
  });
  const answered = queue.map((question) => sessionAttempts.some((attempt) => attempt.questionId === question.id));
  const drafted = queue.map((question) => {
    const draft = questionDrafts[question.id];
    return Boolean(draft && (draft.choice !== null || Object.values(draft.answers).some((answer) => answer.trim())));
  });
  const currentAnswered = current ? answered[index] : false;

  if (closed) {
    return (
      <PostSessionClosure
        closure={closure}
        hint="Your answers are recorded and dropped marks are available in the mistake queue."
        secondary={{ href: "/practice", label: "Practise another topic" }}
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
    const fresh = created.filter((q) => !store.questions.some((existing) => existing.stem === q.stem));
    if (fresh.length) {
      await store.addQuestions(fresh);
      // New questions go to the front: the student asked for them just now.
      setOrder((prev) => [...fresh.map((q) => q.id), ...prev]);
      setIndex(0);
    }
    setNote(
      result.source === "ai"
        ? `Generated ${fresh.length} new question${fresh.length === 1 ? "" : "s"} on this topic.`
        : "No AI provider available, so this is showing questions from the authored bank instead.",
    );
    setGenerating(false);
  }

  const topics = subjectId ? topicsFor(subjectId) : [];

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
            {retestMistake ? "Retest a mistake" : mode === "recall" ? "Active recall" : "Exam questions"}
          </h1>
          <p className="text-sm text-ink3 mt-0.5">
            {retestMistake
              ? "Apply the remediation, answer the original question again, and close the loop only when the missed point is secure."
              : mode === "recall"
              ? "Answer from memory with nothing in front of you, then get it marked."
              : "Answer as you would in the exam. Every dropped mark becomes a card."}
          </p>
        </div>
        {subjects.length > 1 && !farTransferRetest ? (
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

      {farTransferRetest ? (
        <Panel className="border-accent bg-accentsoft">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Pill tone={farTransferRetest.status === "due" ? "review" : "accent"}>
                  {farTransferRetest.status === "due" ? "Due now" : `Due ${farTransferRetest.scheduledFor}`}
                </Pill>
                <p className="text-sm font-semibold text-ink">Delayed far-transfer retest</p>
              </div>
              <p className="text-xs text-ink2 mt-2">
                A new-context question checks whether your original success on {getTopic(farTransferRetest.topicIds[0] ?? "")?.title ?? "this topic"} transfers after a delay.
              </p>
            </div>
            <Link href="/practice">
              <Button size="sm">Leave retest</Button>
            </Link>
          </div>
        </Panel>
      ) : null}

      <QuickSessionPicker onSelect={setQuickMinutes} />

      <div className="grid grid-cols-1 sm:flex sm:flex-wrap sm:items-center gap-2">
        <select
          value={topicId}
          disabled={Boolean(retestMistake || farTransferRetest)}
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
        <Button size="sm" className="w-full sm:w-auto" onClick={() => void generate()} disabled={generating || Boolean(retestMistake || farTransferRetest)}>
          {generating ? "Generating…" : "Generate similar questions"}
        </Button>
        {queue.length ? (
          <span className="text-xs text-ink3 sm:ml-auto justify-self-end tabular-nums">
            {index + 1} of {queue.length}
          </span>
        ) : null}
      </div>

      {note ? <p className="text-xs text-ink3">{note}</p> : null}

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
          <ButtonLink href="/progress" variant="primary" className="inline-block mt-3">
            Return to Progress
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

      {retestId && (!retestMistake || !retestQuestion) ? null : current ? (
        <>
          <QuestionNavigator
            currentIndex={index}
            total={queue.length}
            answered={answered}
            drafted={drafted}
            onSelect={setIndex}
            onPrevious={() => setIndex((i) => Math.max(0, i - 1))}
            onNext={() => {
              if (index >= queue.length - 1) void finishSession();
              else setIndex((i) => Math.min(queue.length - 1, i + 1));
            }}
            previousDisabled={index === 0}
            nextDisabled={index >= queue.length - 1 && !currentAnswered}
            nextLabel={index >= queue.length - 1 ? "Finish session" : currentAnswered ? "Next question" : "Skip question"}
            controlsClassName="grid grid-cols-2 gap-2"
          />
          <QuestionRunner
            key={`${current.id}:${retestMistake?.id ?? "practice"}`}
            question={current}
            mode={mode}
            retestMistake={retestMistake}
            farTransfer={farTransferRetest}
            draft={questionDrafts[current.id]}
            onDraftChange={(draft) => setQuestionDrafts((previous) => ({ ...previous, [current.id]: draft }))}
            onFinished={(attempt) => {
              setSessionAttempts((previous) => [
                ...previous.filter((existing) => existing.questionId !== attempt.questionId),
                attempt,
              ]);
              setQuestionDrafts((previous) => {
                const next = { ...previous };
                delete next[attempt.questionId];
                return next;
              });
            }}
          />
          {retestMistake ? (
            <ButtonLink href="/progress" variant="primary" className="inline-block">
              Back to Progress
            </ButtonLink>
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

      {current ? (
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
