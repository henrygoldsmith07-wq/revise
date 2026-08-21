"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { aiSocratic } from "@/ai/client";
import { getTopic, topicsFor } from "@/domain/curriculum";
import { createCard } from "@/domain/scheduling";
import { useStore, useSubjects } from "@/state/store";
import { AnswerInput } from "@/components/AnswerInput";
import { RichText } from "@/components/RichText";
import { Button, Panel, Pill, SectionHeading, Segmented, SourceBadge } from "@/components/ui";

// A Socratic tutor, not an answer machine. It asks; the student retrieves.
// Anything worth keeping from the conversation can be turned into a card in
// one click — otherwise the insight evaporates the moment the tab closes.

interface Turn {
  role: "user" | "assistant";
  content: string;
  source?: "ai" | "fallback";
  note?: string;
}

export default function TutorPage() {
  return (
    <Suspense fallback={null}>
      <Tutor />
    </Suspense>
  );
}

function Tutor() {
  const params = useSearchParams();
  const store = useStore();
  const subjects = useSubjects();
  const topicParam = params.get("topic");

  const [subjectId, setSubjectId] = useState(
    (topicParam ? getTopic(topicParam)?.subjectId : null) ?? subjects[0]?.id ?? "",
  );
  const [topicId, setTopicId] = useState(topicParam ?? topicsFor(subjectId)[0]?.id ?? "");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const topic = getTopic(topicId);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, thinking]);

  async function send(message: string) {
    if (!message.trim() || !topicId) return;
    const history: Turn[] = [...turns, { role: "user", content: message.trim() }];
    setTurns(history);
    setDraft("");
    setThinking(true);

    const result = await aiSocratic(
      topicId,
      history.map((t) => ({ role: t.role, content: t.content })),
    );
    const reply = [result.data.reply, result.data.nextQuestion].filter(Boolean).join("\n\n");
    setTurns([...history, { role: "assistant", content: reply, source: result.source, note: result.note }]);
    setThinking(false);
  }

  async function keepAsCard(turn: Turn, index: number) {
    const question = turns[index - 1]?.content ?? topic?.title ?? "Tutor note";
    await store.addCards([
      createCard({
        id: crypto.randomUUID(),
        userId: store.userId,
        subjectId,
        topicId,
        front: question.slice(0, 500),
        back: turn.content.slice(0, 1000),
        origin: "ai",
      }),
    ]);
  }

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tutor</h1>
          <p className="text-sm text-ink3 mt-0.5">
            It will not hand you answers. It asks the question that gets you there.
          </p>
        </div>
        {subjects.length > 1 ? (
          <Segmented
            ariaLabel="Subject"
            value={subjectId}
            onChange={(value) => {
              setSubjectId(value);
              setTopicId(topicsFor(value)[0]?.id ?? "");
              setTurns([]);
            }}
            options={subjects.map((s) => ({ value: s.id, label: s.name }))}
          />
        ) : null}
      </header>

      <select
        value={topicId}
        onChange={(e) => {
          setTopicId(e.target.value);
          setTurns([]);
        }}
        className="field text-sm"
        aria-label="Topic"
      >
        {topicsFor(subjectId).map((row) => (
          <option key={row.id} value={row.id}>
            {row.title}
          </option>
        ))}
      </select>

      {!turns.length ? (
        <Panel>
          <p className="text-sm font-semibold text-ink">{topic?.title}</p>
          <p className="text-sm text-ink3 mt-1">{topic?.summary}</p>
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mt-4 mb-2">Start with</p>
          <div className="flex flex-wrap gap-1.5">
            {[
              `I don't understand ${topic?.title.toLowerCase()}`,
              "Quiz me on this topic",
              "Why do I keep losing marks here?",
              "Walk me through a worked example",
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void send(prompt)}
                className="pill hover:border-ink3 transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        </Panel>
      ) : null}

      <div className="space-y-3">
        {turns.map((turn, index) => (
          <div key={index} className={turn.role === "user" ? "flex justify-end" : ""}>
            <div
              className={
                turn.role === "user"
                  ? "card card-2 px-3.5 py-2.5 max-w-[85%] bubble-in"
                  : "card px-4 py-3 bubble-in"
              }
            >
              {turn.role === "assistant" ? (
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Pill tone="speak">Tutor</Pill>
                  <SourceBadge source={turn.source ?? "fallback"} note={turn.note} />
                </div>
              ) : null}
              <RichText className={turn.role === "user" ? "text-ink" : ""}>{turn.content}</RichText>
              {turn.role === "assistant" ? (
                <button
                  type="button"
                  onClick={() => void keepAsCard(turn, index)}
                  className="text-[11px] text-ink3 hover:text-ink underline mt-2"
                >
                  Keep as a flashcard
                </button>
              ) : null}
            </div>
          </div>
        ))}
        {thinking ? (
          <div className="card px-4 py-3 flex gap-1.5 w-fit" aria-live="polite">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-20 lg:bottom-4">
        <Panel className="p-3">
          <AnswerInput
            value={draft}
            onChange={setDraft}
            rows={3}
            placeholder="Answer the tutor, or ask about this topic…"
          />
          <Button
            variant="primary"
            className="w-full mt-2"
            disabled={thinking || !draft.trim()}
            onClick={() => void send(draft)}
          >
            Send
          </Button>
        </Panel>
      </div>

      {topic ? (
        <section>
          <SectionHeading title="Where marks are lost here" hint="The tutor knows these too." />
          <ul className="card divide-y divide-line">
            {topic.commonErrors.map((error, i) => (
              <li key={i} className="px-4 py-2.5 text-sm text-ink2">
                {error}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
