"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { aiExtractQuestions, aiOcr } from "@/ai/client";
import { toBase64 } from "@/components/AnswerInput";
import { getSubject, getTopic, topicsFor } from "@/domain/curriculum";
import { buildPostSessionClosure } from "@/domain/post-session-closure";
import { tokenise } from "@/domain/marking";
import { analysePaperWeakness } from "@/domain/paper-weakness";
import type { Paper, Question } from "@/domain/types";
import { useStore, useSubjects } from "@/state/store";
import { PaperWeaknessPanel } from "@/components/PaperWeaknessPanel";
import { PostSessionClosure } from "@/components/PostSessionClosure";
import { QuestionNavigator } from "@/components/QuestionNavigator";
import { QuestionRunner, type QuestionDraft } from "@/components/QuestionRunner";
import { ExamConditionMode } from "@/components/ExamConditionMode";
import { Button, EmptyState, Field, Panel, Pill, SectionHeading, Segmented } from "@/components/ui";
import { ICON_SIZE, PhotoIcon, TimerIcon } from "@/components/icons";

// Past papers: upload, extract, map to topics, practise by topic, or sit a
// paper under full exam conditions. Extraction needs a model; everything after
// it does not, so a paper extracted once stays fully usable offline forever.

export default function PapersPage() {
  return (
    <Suspense fallback={null}>
      <Papers />
    </Suspense>
  );
}

function Papers() {
  const params = useSearchParams();
  const store = useStore();
  const subjects = useSubjects();
  const [subjectId, setSubjectId] = useState(params.get("subject") ?? subjects[0]?.id ?? "");
  const resumeCheckpoint =
    params.get("resume") === "1" && store.revisionCheckpoint?.activity === "paper"
      ? store.revisionCheckpoint
      : null;
  const [resumeActive, setResumeActive] = useState(Boolean(resumeCheckpoint?.paperId));
  const [activePaper, setActivePaper] = useState<Paper | null>(() =>
    resumeCheckpoint?.paperId ? store.papers.find((paper) => paper.id === resumeCheckpoint.paperId) ?? null : null,
  );
  const [examPaper, setExamPaper] = useState<Paper | null>(null);

  const papers = useMemo(
    () => store.papers.filter((p) => !subjectId || p.subjectId === subjectId),
    [store.papers, subjectId],
  );

  if (activePaper) {
    const checkpoint = resumeActive && resumeCheckpoint?.paperId === activePaper.id ? resumeCheckpoint : null;
    return (
      <PaperSession
        paper={activePaper}
        initialIndex={checkpoint?.position ?? 0}
        initialPaperRunId={checkpoint?.paperRunId}
        onExit={() => setActivePaper(null)}
      />
    );
  }

  if (examPaper) {
    return <ExamConditionMode paper={examPaper} onExit={() => setExamPaper(null)} />;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3 sm:flex sm:flex-wrap sm:items-end sm:justify-between sm:gap-3 sm:space-y-0">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Past papers</h1>
          <p className="text-sm text-ink3 mt-0.5">
            Upload a paper and its mark scheme, extract the questions, then practise them by topic or under full exam conditions.
          </p>
        </div>
        {subjects.length > 1 ? (
          <div className="w-full sm:w-auto max-w-full overflow-x-auto nice-scroll pb-1">
            <Segmented
              ariaLabel="Subject"
              value={subjectId}
              onChange={setSubjectId}
              options={subjects.map((s) => ({ value: s.id, label: s.name }))}
            />
          </div>
        ) : null}
      </header>

      <UploadPaper subjectId={subjectId} />

      <Panel className="space-y-2">
        <SectionHeading title="Full exam conditions" hint="A fixed clock, no in-paper help, and feedback only after submission." />
        <p className="text-sm text-ink2">
          Choose <span className="font-semibold">Full exam conditions</span> beside any extracted paper below. The run is timed to the selected paper format, saves each answer only when you submit, and records the marked paper for later review.
        </p>
      </Panel>

      <section>
        <SectionHeading title="Your papers" hint="Extracted questions join the practice pool automatically." />
        {papers.length ? (
          <ul className="card divide-y divide-line">
            {papers.map((paper) => {
              const attempted = store.attempts.filter((a) => paper.questionIds.includes(a.questionId));
              const scored = attempted.reduce((a, x) => a + x.awarded, 0);
              const possible = attempted.reduce((a, x) => a + x.max, 0);
              return (
                <li key={paper.id} className="px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink truncate">{paper.title}</p>
                    <p className="text-[11px] text-ink3">
                      {getSubject(paper.subjectId)?.name} · {paper.questionIds.length} questions ·{" "}
                      {paper.totalMarks} marks
                      {possible ? ` · scored ${scored}/${possible}` : ""}
                    </p>
                  </div>
                  <Pill className="self-start sm:self-auto" tone={paper.status === "practised" ? "success" : undefined}>{paper.status}</Pill>
                  <div className="grid grid-cols-1 sm:flex justify-end gap-1.5 w-full sm:w-auto">
                    <Button
                      size="sm"
                      className="w-full sm:w-auto"
                      disabled={!paper.questionIds.length}
                      onClick={() => {
                        setResumeActive(false);
                        setActivePaper(paper);
                      }}
                    >
                      Practise paper
                    </Button>
                    <Button size="sm" variant="primary" className="w-full sm:w-auto" disabled={!paper.questionIds.length} onClick={() => setExamPaper(paper)}>
                      Full exam conditions
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title="No papers uploaded"
            body="Paste the text of a past paper, or photograph its pages. Questions are split out, mapped to topics and marked against the scheme. Extract one to unlock full exam conditions."
          />
        )}
      </section>
    </div>
  );
}

function UploadPaper({ subjectId }: { subjectId: string }) {
  const store = useStore();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [markScheme, setMarkScheme] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function photograph(files: FileList, into: (value: string) => void) {
    setBusy("ocr");
    const pages: string[] = [];
    for (const file of Array.from(files).slice(0, 12)) {
      const base64 = await toBase64(file);
      const result = await aiOcr(base64, file.type || "image/jpeg", "printed");
      if (result.data.text) pages.push(result.data.text);
      else setStatus(result.note ?? "Could not read that page.");
    }
    if (pages.length) into(pages.join("\n\n"));
    setBusy(null);
  }

  async function extract() {
    if (!text.trim() || !subjectId) return;
    setBusy("extract");
    setStatus(null);

    const combined = markScheme.trim() ? `${text}\n\n--- MARK SCHEME ---\n${markScheme}` : text;
    const result = await aiExtractQuestions(subjectId, combined);

    if (!result.data.questions.length) {
      setStatus(
        result.note
          ? `Extraction needs an AI provider — ${result.note}. The paper is saved, so you can extract it later.`
          : "No questions could be extracted from that text.",
      );
    }

    const paperId = crypto.randomUUID();
    const questions: Question[] = result.data.questions.map((generated, index) => ({
      id: crypto.randomUUID(),
      subjectId,
      topicIds: mapToTopics(subjectId, `${generated.stem} ${generated.parts.map((p) => p.prompt).join(" ")}`),
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
      origin: "past-paper",
      paperId,
      paperQuestionNumber: String(index + 1),
      createdAt: new Date().toISOString(),
    }));

    if (questions.length) await store.addQuestions(questions);

    const paper: Paper = {
      id: paperId,
      userId: store.userId,
      subjectId,
      title: title.trim() || `Paper uploaded ${new Date().toLocaleDateString("en-GB")}`,
      sourceText: text.slice(0, 60_000),
      markSchemeText: markScheme.slice(0, 60_000) || undefined,
      totalMarks: questions.reduce((a, q) => a + q.totalMarks, 0),
      questionIds: questions.map((q) => q.id),
      status: questions.length ? "extracted" : "uploaded",
      createdAt: new Date().toISOString(),
    };
    await store.addPaper(paper);

    if (questions.length) {
      setStatus(`Extracted ${questions.length} questions worth ${paper.totalMarks} marks, mapped to topics.`);
      setText("");
      setMarkScheme("");
      setTitle("");
    }
    setBusy(null);
  }

  return (
    <Panel className="space-y-3">
      <SectionHeading
        title="Upload a paper"
        hint="Paste the text, or photograph the pages and let OCR read them."
      />
      <Field label="Title" hint="For example: Summer 2024 Unit 3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="field text-sm" />
      </Field>
      <Field label="Question paper text">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Paste the paper here…"
          className="field nice-scroll text-sm"
        />
      </Field>
      <Field label="Mark scheme" hint="Optional, but marking is far more accurate with it.">
        <textarea
          value={markScheme}
          onChange={(e) => setMarkScheme(e.target.value)}
          rows={4}
          placeholder="Paste the mark scheme here…"
          className="field nice-scroll text-sm"
        />
      </Field>

      <div className="flex flex-wrap gap-2 items-center">
        <label className="btn btn-secondary text-sm cursor-pointer">
          <PhotoIcon size={ICON_SIZE.md} aria-hidden />
          Photograph paper
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length) void photograph(e.target.files, (value) => setText((t) => `${t}\n${value}`.trim()));
              e.target.value = "";
            }}
          />
        </label>
        <label className="btn btn-secondary text-sm cursor-pointer">
          <PhotoIcon size={ICON_SIZE.md} aria-hidden />
          Photograph mark scheme
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length)
                void photograph(e.target.files, (value) => setMarkScheme((t) => `${t}\n${value}`.trim()));
              e.target.value = "";
            }}
          />
        </label>
        <Button variant="primary" onClick={() => void extract()} disabled={busy !== null || !text.trim()}>
          {busy === "extract" ? "Extracting…" : busy === "ocr" ? "Reading pages…" : "Extract questions"}
        </Button>
      </div>
      {status ? <p className="text-xs text-ink3">{status}</p> : null}
    </Panel>
  );
}

/**
 * Map an extracted question to spec topics by term overlap against each
 * topic's title and key points. Cheap, deterministic and offline; the student
 * can always re-file a question by practising it from the topic they expect.
 */
export function mapToTopics(subjectId: string, text: string, limit = 2): string[] {
  const words = tokenise(text);
  const scored = topicsFor(subjectId)
    .map((topic) => {
      const terms = tokenise(`${topic.title} ${topic.keyPoints.join(" ")}`);
      let overlap = 0;
      for (const term of terms) if (words.has(term)) overlap++;
      return { id: topic.id, score: overlap / Math.max(8, terms.size) };
    })
    .filter((row) => row.score > 0.02)
    .sort((a, b) => b.score - a.score);
  const picked = scored.slice(0, limit).map((row) => row.id);
  return picked.length ? picked : [topicsFor(subjectId)[0]?.id].filter(Boolean);
}

function PaperSession({
  paper,
  initialIndex,
  initialPaperRunId,
  onExit,
}: {
  paper: Paper;
  initialIndex: number;
  initialPaperRunId?: string;
  onExit: () => void;
}) {
  const router = useRouter();
  const store = useStore();
  const { saveRevisionCheckpoint, clearRevisionCheckpoint } = store;
  const questions = useMemo(
    () => paper.questionIds.map((id) => store.questions.find((q) => q.id === id)).filter((q): q is Question => Boolean(q)),
    [paper.questionIds, store.questions],
  );
  const [paperRunId] = useState(() => initialPaperRunId ?? crypto.randomUUID());
  const [index, setIndex] = useState(() => {
    const attempted = new Set(
      initialPaperRunId
        ? store.attempts.filter((attempt) => attempt.paperRunId === initialPaperRunId).map((attempt) => attempt.questionId)
        : [],
    );
    let next = Math.max(0, Math.floor(initialIndex));
    while (next < questions.length && attempted.has(questions[next].id)) next++;
    return next;
  });
  const [startedAt] = useState(() => Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);
  const [scores, setScores] = useState<{ questionId: string; awarded: number; max: number }[]>([]);
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, QuestionDraft>>({});
  const [finishing, setFinishing] = useState(false);

  // A paper is sat under timed conditions, so the clock has to advance on its
  // own rather than only when something else re-renders.
  useEffect(() => {
    const updateElapsed = () => setElapsedMs(Date.now() - startedAt);
    updateElapsed();
    const tick = setInterval(updateElapsed, 15_000);
    return () => clearInterval(tick);
  }, [startedAt]);

  const paperAttempts = useMemo(
    () => store.attempts.filter((attempt) => attempt.paperRunId === paperRunId),
    [paperRunId, store.attempts],
  );
  const weaknessAnalysis = useMemo(
    () =>
      analysePaperWeakness({
        paper,
        attempts: paperAttempts,
        questions,
        mistakes: store.mistakes,
        paperRunId,
      }),
    [paper, paperAttempts, paperRunId, questions, store.mistakes],
  );
  const current = questions[index];
  const totalAwarded = paperAttempts.reduce((a, attempt) => a + attempt.awarded, 0);
  const totalMax = paperAttempts.reduce((a, attempt) => a + attempt.max, 0);
  const answered = questions.map((question) =>
    scores.some((score) => score.questionId === question.id) || paperAttempts.some((attempt) => attempt.questionId === question.id),
  );
  const drafted = questions.map((question) => {
    const draft = questionDrafts[question.id];
    return Boolean(draft && (draft.choice !== null || Object.values(draft.answers).some((answer) => answer.trim())));
  });

  useEffect(() => {
    if (!questions.length || !current) {
      if (questions.length) void clearRevisionCheckpoint();
      return;
    }
    void saveRevisionCheckpoint({
      activity: "paper",
      title: paper.title,
      href: "/papers?resume=1",
      position: index,
      total: questions.length,
      queueIds: paper.questionIds,
      paperId: paper.id,
      paperRunId,
    });
  }, [clearRevisionCheckpoint, current, index, paper, paperRunId, questions.length, saveRevisionCheckpoint]);

  async function finish(nextHref?: string) {
    if (finishing) return;
    setFinishing(true);
    await clearRevisionCheckpoint();
    await store.addPaper({ ...paper, status: "practised" });
    if (nextHref) router.push(nextHref);
    else onExit();
  }

  if (!current) {
    const availableMarks = paper.totalMarks || totalMax;
    const closure = buildPostSessionClosure({
      session: "paper",
      attempted: paperAttempts.length,
      total: questions.length,
      awarded: totalAwarded,
      available: availableMarks,
      elapsedMs,
    });
    const predictedBefore = (() => {
      const subject = getSubject(paper.subjectId);
      const qs = paper.questionIds.map((id) => store.questions.find((q) => q.id === id)).filter((q): q is Question => Boolean(q));
      if (!subject || !qs.length) return null;
      const psId = paper.paperSpecId ?? subject.papers[0]?.id ?? "";
      return store.previewPaper(subject.id, psId, paper.questionIds);
    })();
    const calibration = predictedBefore && predictedBefore.predictedMarks !== totalAwarded
      ? `Simulation had predicted ${predictedBefore.predictedMarks}/${predictedBefore.totalMarks} — calibration will tighten next time.`
      : null;
    return (
      <PostSessionClosure
        closure={closure}
        title="Paper complete"
        hint={paper.title}
        extra={
          <div className="space-y-3">
            {calibration ? <p>{calibration} See Progress for the updated calibration.</p> : null}
            <PaperWeaknessPanel analysis={weaknessAnalysis} />
          </div>
        }
        actions={
          <div className="flex gap-2">
            <Button
              variant="primary"
              className="flex-1"
              disabled={finishing}
              onClick={() => void finish(closure.nextAction === "mistakes" ? "/review?mode=mistakes" : undefined)}
            >
              {finishing ? "Saving…" : closure.nextAction === "mistakes" ? "Finish and review mistakes" : "Finish paper"}
            </Button>
            <Button className="flex-1" disabled={finishing} onClick={() => void finish()}>
              Back to papers
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <header className="sticky top-14 lg:top-0 z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-bg/95 backdrop-blur border-b border-line flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold truncate">{paper.title}</h1>
          <p className="text-[11px] text-ink3">
            Question {index + 1} of {questions.length} ·{" "}
            {getTopic(current.topicIds[0] ?? "")?.title ?? getSubject(current.subjectId)?.name}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Pill className="tabular-nums" tone={elapsedMs > 90 * 60_000 ? "danger" : undefined}>
            <TimerIcon size={ICON_SIZE.sm} aria-hidden />
            {Math.floor(elapsedMs / 60_000)} min
          </Pill>
          <Button size="sm" variant="ghost" className="min-h-10" onClick={onExit}>
            Exit
          </Button>
        </div>
      </header>

      <QuestionNavigator
        currentIndex={index}
        total={questions.length}
        answered={answered}
        drafted={drafted}
        onSelect={setIndex}
        onPrevious={() => setIndex((i) => Math.max(0, i - 1))}
        onNext={() => {
          setElapsedMs(Date.now() - startedAt);
          setIndex((i) => i + 1);
        }}
        previousDisabled={index === 0}
        nextDisabled={false}
        nextLabel={index === questions.length - 1 ? "Finish paper" : answered[index] ? "Next question" : "Skip question"}
      />
      <QuestionRunner
        key={current.id}
        question={current}
        mode="paper"
        paperId={paper.id}
        paperSpecId={paper.paperSpecId}
        paperRunId={paperRunId}
        draft={questionDrafts[current.id]}
        onDraftChange={(draft) => setQuestionDrafts((previous) => ({ ...previous, [current.id]: draft }))}
        onFinished={(attempt) => {
          setScores((prev) => [
            ...prev.filter((score) => score.questionId !== attempt.questionId),
            { questionId: attempt.questionId, awarded: attempt.awarded, max: attempt.max },
          ]);
          setQuestionDrafts((previous) => {
            const next = { ...previous };
            delete next[attempt.questionId];
            return next;
          });
        }}
      />
    </div>
  );
}
