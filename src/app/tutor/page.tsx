"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aiTutor } from "@/lib/optional-ai";
import { RichText } from "@/components/RichText";
import { SubjectPicker } from "@/components/SubjectPicker";
import { ICON_SIZE, TutorIcon } from "@/components/icons";
import { Button, ButtonLink, Panel, SectionHeading, SourceBadge, cx } from "@/components/ui";
import { allSubjects, getTopic, topicsFor } from "@/domain/curriculum";
import {
  buildTutorLearnerContext,
  suggestTutorStarters,
  type TutorLearnerContext,
} from "@/domain/tutor-grounding";
import type { Mistake, Topic } from "@/domain/types";
import { useStoreFields } from "@/state/store";
import type { TutorChatMessage } from "@/ai/types";

// ---------------------------------------------------------------------------
// /tutor — a conversational tutor that teaches from the learner's exact
// position: the topic they are standing on, the mark-scheme points they have
// actually lost there, and where the topic sits in the specification. The
// chat is session-scoped; switching topics starts a new conversation.
// ---------------------------------------------------------------------------

interface ChatMessage extends TutorChatMessage {
  /** How this reply was produced — always shown, never implied. */
  source?: "ai" | "fallback";
  note?: string;
  checkQuestion?: string;
  suggestPractice?: boolean;
}

const QUICK_PROMPTS = [
  { label: "Teach me the core idea", text: "Teach me the core idea of this topic from the beginning." },
  { label: "Why do I keep losing marks?", text: "Walk me through the marks I keep losing here and how to stop losing them." },
  { label: "Worked example", text: "Work one example with me, step by step." },
  { label: "Quiz me", text: "Quiz me on this topic — one question at a time, and mark my answers." },
] as const;

export default function TutorPage() {
  return (
    <Suspense fallback={null}>
      <Tutor />
    </Suspense>
  );
}

function Tutor() {
  const store = useStoreFields("mistakes", "settings");
  const params = useSearchParams();

  const starters = useMemo(
    () => suggestTutorStarters({ mistakes: store.mistakes, subjectIds: store.settings.subjectIds, limit: 3 }),
    [store.mistakes, store.settings.subjectIds],
  );

  const enrolled = useMemo(
    () => allSubjects().filter((s) => store.settings.subjectIds.includes(s.id)),
    [store.settings.subjectIds],
  );
  const subjectOptions = useMemo(
    () => enrolled.map((subject) => ({ id: subject.id, name: subject.name, detail: "Ask the tutor anything on this spec" })),
    [enrolled],
  );

  // An explicit ?subject= link wins, then the tutor's own top suggestion.
  const [subjectId, setSubjectId] = useState(() => {
    const candidate = params.get("subject") ?? starters[0]?.subjectId ?? enrolled[0]?.id ?? "";
    return enrolled.some((s) => s.id === candidate) ? candidate : enrolled[0]?.id ?? "";
  });
  const subjectTopics = useMemo(
    () => (subjectId ? [...topicsFor(subjectId)].sort((a, b) => a.order - b.order) : []),
    [subjectId],
  );
  const requestedTopic = params.get("topic");
  const [topicId, setTopicId] = useState(() => {
    const candidate =
      requestedTopic ?? starters.find((s) => s.subjectId === subjectId)?.topicId ?? subjectTopics[0]?.id ?? "";
    return subjectTopics.some((t) => t.id === candidate) ? candidate : subjectTopics[0]?.id ?? "";
  });

  const topic = getTopic(topicId);

  const changeSubject = (ids: string[]) => {
    const next = ids[0];
    if (!next) return;
    setSubjectId(next);
    const first = [...topicsFor(next)].sort((a, b) => a.order - b.order)[0];
    setTopicId(first?.id ?? "");
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Tutor</h1>
        <p className="text-sm text-ink3 mt-0.5">
          Taught from your specification, your topic and the marks you have actually lost.
        </p>
      </header>

      {starters.length ? (
        <section aria-label="Suggested starting points">
          <SectionHeading
            title="Where the tutor would start"
            hint="From your open mistakes, weakest first. Pick one, or choose any topic below."
          />
          <div className="flex flex-wrap gap-2">
            {starters.map((starter) => (
              <button
                key={starter.topicId}
                type="button"
                onClick={() => {
                  setSubjectId(starter.subjectId);
                  setTopicId(starter.topicId);
                }}
                className={cx("btn btn-secondary text-left max-w-full", starter.topicId === topicId && "ring-2 ring-accent")}
              >
                <span className="block text-sm font-medium truncate">{starter.title}</span>
                <span className="block text-xs text-ink3">{starter.reason}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <Panel>
        {enrolled.length ? (
          <div className="space-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Subject</p>
              <div className="mt-2">
                <SubjectPicker
                  options={subjectOptions}
                  selectedIds={subjectId ? [subjectId] : []}
                  onChange={changeSubject}
                  selectionMode="single"
                  ariaLabel="Tutor subject"
                  density="compact"
                />
              </div>
            </div>
            {subjectId ? (
              <div>
                <label htmlFor="tutor-topic" className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">
                  Topic
                </label>
                <select
                  id="tutor-topic"
                  className="mt-1 w-full rounded-[8px] border border-line bg-surface px-3 py-2 text-sm"
                  value={topicId}
                  onChange={(event) => setTopicId(event.target.value)}
                >
                  {subjectTopics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                      {t.specRef ? ` · ${t.specRef}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-ink3">Add a subject in Settings and the tutor can teach from its specification.</p>
        )}
      </Panel>

      {topic ? <TutorChat key={topicId} topic={topic} mistakes={store.mistakes} /> : null}
    </div>
  );
}

function TutorChat({ topic, mistakes }: { topic: Topic; mistakes: Mistake[] }) {
  const { mastery } = useStoreFields("mastery");
  const masteryRow = mastery.find((row) => row.topicId === topic.id) ?? null;
  const learner: TutorLearnerContext = useMemo(
    () => buildTutorLearnerContext({ topic, mistakes, mastery: masteryRow }),
    [topic, mistakes, masteryRow],
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending]);

  const send = useCallback(
    async (text: string | null) => {
      if (pending) return;
      setError(null);
      const history: TutorChatMessage[] = text ? [...messages, { role: "user" as const, content: text }] : messages;
      if (text) setMessages(history);
      setPending(true);
      try {
        const envelope = await aiTutor({ topicId: topic.id, history, learner });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: envelope.data.reply,
            source: envelope.source,
            note: envelope.note,
            checkQuestion: envelope.data.checkQuestion,
            suggestPractice: envelope.data.suggestPractice,
          },
        ]);
      } catch {
        setError("The tutor could not answer just now. Your conversation is unchanged — try again.");
      } finally {
        setPending(false);
      }
    },
    [learner, messages, pending, topic.id],
  );

  // The tutor speaks first: with an empty history the task opens with a plan
  // for the topic, grounded in the learner context, and asks one question.
  // The ref guards Strict Mode's double effect run from sending twice.
  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    void send(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void send(text);
  };

  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink truncate">{topic.title}</p>
          <p className="text-xs text-ink3 truncate">{learner.position ?? "Specification content on this device"}</p>
        </div>
        <TutorIcon size={ICON_SIZE.md} className="text-accent shrink-0" aria-hidden />
      </div>

      <div className="space-y-3" aria-live="polite" aria-label="Tutor conversation">
        {messages.map((message, index) =>
          message.role === "user" ? (
            <div key={index} className="flex justify-end">
              <div className="max-w-[85%] rounded-[12px] rounded-br-[4px] bg-accentsoft px-3 py-2 text-sm text-ink whitespace-pre-wrap">
                {message.content}
              </div>
            </div>
          ) : (
            <div key={index} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <SourceBadge source={message.source ?? "fallback"} note={message.note} />
              </div>
              <div className="max-w-[92%] rounded-[12px] rounded-bl-[4px] border border-line bg-surface2/60 px-3 py-2">
                <RichText>{message.content}</RichText>
                {message.checkQuestion ? (
                  <div className="mt-2 rounded-[8px] border border-accent/30 bg-accentsoft/50 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-accent font-semibold">Your turn</p>
                    <p className="text-sm text-ink mt-0.5">{message.checkQuestion}</p>
                  </div>
                ) : null}
                {message.suggestPractice ? (
                  <div className="mt-2">
                    <ButtonLink href={`/practice?topic=${encodeURIComponent(topic.id)}`} variant="ghost" size="sm">
                      Ready? Practise this topic with exam questions →
                    </ButtonLink>
                  </div>
                ) : null}
              </div>
            </div>
          ),
        )}
        {pending ? (
          <div className="flex items-center gap-2 text-xs text-ink3" role="status">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            The tutor is thinking…
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-[8px] border border-danger/30 bg-dangersoft px-3 py-2 text-xs text-danger">{error}</p>
      ) : null}

      <div className="flex flex-wrap gap-1.5" aria-label="Quick prompts">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt.label}
            type="button"
            disabled={pending}
            onClick={() => void send(prompt.text)}
            className="pill hover:border-accent disabled:opacity-50"
          >
            {prompt.label}
          </button>
        ))}
      </div>

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor="tutor-composer" className="sr-only">
          Ask the tutor
        </label>
        <textarea
          id="tutor-composer"
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Ask anything on this topic — or answer the tutor's question here"
          className="flex-1 rounded-[8px] border border-line bg-surface px-3 py-2 text-sm resize-none"
          disabled={pending}
        />
        <Button type="submit" variant="primary" disabled={pending || !draft.trim()}>
          Send
        </Button>
      </form>

      <p className="text-[11px] text-ink3">
        Personal details in your messages and lost mark points are removed before any request leaves this device.
      </p>
    </Panel>
  );
}
