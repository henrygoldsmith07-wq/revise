"use client";

// The Socratic examiner: after a mark below 100%, one guiding question instead
// of the answer.
//
// Reliability contract (brief P1.2 / P3.2):
//   • The authored misconception text renders on the first paint, before any
//     request — it is the answer to "what if the AI never replies".
//   • Offline or with AI consent off, that static text is all there is: no
//     typing indicator, no spinner, no request.
//   • Otherwise one request goes out with a hard timeout; a typing indicator
//     shows while it is in flight and the question is added only if it passes
//     the domain guard (exactly one question, no answer given away). A failed
//     or slow request simply removes the indicator.
//
// Accessibility: the conversation is a polite live log, the typing indicator
// is a status message, the composer keeps focus across turns, and nothing
// moves focus on its own.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { misconceptionsForTopic } from "@/content";
import { aiConsentGrantedInSettings } from "@/domain/ai-consent";
import {
  checkSocraticReply,
  selectSocraticFocus,
  socraticExaminerContext,
  staticSocraticGuidance,
  type SocraticFocus,
} from "@/domain/socratic-examiner";
import type { MarkedPart, Question } from "@/domain/types";
import { aiSocraticExaminer } from "@/lib/optional-ai";
import { useStoreFields } from "@/state/store";
import { Button, Pill } from "./ui";

/** The panel never waits longer than this for the model. */
export const SOCRATIC_TIMEOUT_MS = 8000;
/** Replies a student can send before the panel points them back to the guidance. */
const MAX_STUDENT_TURNS = 3;

type Turn =
  | { role: "examiner"; lead: string; question: string }
  | { role: "student"; text: string }
  | { role: "note"; text: string };

export function SocraticExaminerPanel({
  question,
  marked,
  answers,
}: {
  question: Question;
  marked: ReadonlyArray<Pick<MarkedPart, "partId" | "awarded" | "max" | "missedPoints">>;
  answers: Readonly<Record<string, string>>;
}) {
  const focus = useMemo(
    () =>
      selectSocraticFocus({
        question,
        marked,
        answers,
        misconceptions: misconceptionsForTopic(question.topicIds[0] ?? ""),
      }),
    [question, marked, answers],
  );
  if (!focus) return null;
  return <SocraticExaminer key={`${question.id}:${focus.partId}`} focus={focus} topicId={question.topicIds[0] ?? ""} />;
}

function SocraticExaminer({ focus, topicId }: { focus: SocraticFocus; topicId: string }) {
  const { settings } = useStoreFields("settings");
  const guidance = useMemo(() => staticSocraticGuidance(focus), [focus]);
  const context = useMemo(() => socraticExaminerContext(focus), [focus]);
  const headingId = useId();
  const composerId = useId();
  const consent = aiConsentGrantedInSettings(settings);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);
  const opened = useRef(false);
  const canAsk = consent && online;

  useEffect(() => {
    mounted.current = true;
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      mounted.current = false;
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const ask = async (history: { role: "user" | "assistant"; content: string }[]) => {
    setThinking(true);
    try {
      const envelope = await aiSocraticExaminer({ topicId, examiner: context, history, timeoutMs: SOCRATIC_TIMEOUT_MS });
      if (!mounted.current) return null;
      if (envelope.source !== "ai") return null;
      const check = checkSocraticReply(envelope.data, context.markScheme);
      return check.ok ? check : null;
    } catch {
      return null;
    } finally {
      if (mounted.current) setThinking(false);
    }
  };

  // First question: once, only when it can actually be asked. Strict Mode's
  // double effect is guarded by the ref.
  useEffect(() => {
    if (opened.current || !canAsk) return;
    opened.current = true;
    void ask([]).then((reply) => {
      if (reply) setTurns([{ role: "examiner", lead: reply.lead, question: reply.question }]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAsk]);

  const studentTurns = turns.filter((t) => t.role === "student").length;
  const hasQuestion = turns.some((t) => t.role === "examiner");

  const send = async () => {
    const text = draft.trim();
    if (!text || thinking) return;
    setDraft("");
    const next: Turn[] = [...turns, { role: "student", text }];
    setTurns(next);
    composerRef.current?.focus();
    if (!canAsk || (typeof navigator !== "undefined" && navigator.onLine === false)) {
      setTurns([...next, { role: "note", text: "You are offline, so compare your reply with the guidance above." }]);
      return;
    }
    type ChatTurn = { role: "user" | "assistant"; content: string };
    const history = next.flatMap((turn): ChatTurn[] =>
      turn.role === "student"
        ? [{ role: "user", content: turn.text }]
        : turn.role === "examiner"
          ? [{ role: "assistant", content: [turn.lead, turn.question].filter(Boolean).join(" ") }]
          : [],
    );
    const reply = await ask(history);
    if (!mounted.current) return;
    setTurns((prev) => [
      ...prev,
      reply
        ? { role: "examiner", lead: reply.lead, question: reply.question }
        : { role: "note", text: "No follow-up question this time. Compare your reply with the guidance above." },
    ]);
    composerRef.current?.focus();
  };

  return (
    <section aria-labelledby={headingId} className="mt-4 rounded-[12px] border border-line bg-surface2 px-3.5 py-3.5 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="text-sm font-semibold text-ink">
          Think it through
        </h3>
        <Pill title="Guidance only — it never changes your mark">Not a mark</Pill>
      </div>
      <p className="text-xs text-ink3 mt-1">{guidance.basis}</p>

      {guidance.statement ? (
        <div className="mt-2.5 space-y-1.5">
          <p className="text-sm font-medium text-ink">{guidance.statement}</p>
          {guidance.explanation ? <p className="text-sm text-ink2 leading-relaxed">{guidance.explanation}</p> : null}
          {guidance.correction ? (
            <details className="text-sm">
              <summary className="cursor-pointer select-none text-xs text-ink2 min-h-9 inline-flex items-center">
                Show how to fix it
              </summary>
              <p className="text-ink2 mt-1 leading-relaxed">{guidance.correction}</p>
            </details>
          ) : null}
        </div>
      ) : (
        <ul className="mt-2.5 space-y-1">
          {focus.missedPoints.slice(0, 3).map((point) => (
            <li key={point} className="text-sm text-ink2">
              {point}
            </li>
          ))}
        </ul>
      )}
      {!hasQuestion ? <p className="text-sm text-ink mt-2.5">{guidance.reflectPrompt}</p> : null}

      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Examiner conversation"
        aria-busy={thinking}
        className="mt-3 space-y-2.5 empty:hidden"
      >
        {turns.map((turn, index) =>
          turn.role === "examiner" ? (
            <div key={index} className="bubble-in max-w-[92%] rounded-[12px] rounded-bl-[4px] border border-line bg-surface px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-ink3 font-semibold">Examiner · AI, provisional</p>
              {turn.lead ? <p className="text-sm text-ink2 mt-1">{turn.lead}</p> : null}
              <p className="text-[15px] leading-relaxed text-ink mt-1 font-medium">{turn.question}</p>
            </div>
          ) : turn.role === "student" ? (
            <div key={index} className="flex justify-end">
              <p className="max-w-[85%] rounded-[12px] rounded-br-[4px] bg-accentsoft px-3 py-2 text-sm text-ink whitespace-pre-wrap">
                <span className="sr-only">You said: </span>
                {turn.text}
              </p>
            </div>
          ) : (
            <p key={index} className="text-xs text-ink3">
              {turn.text}
            </p>
          ),
        )}
      </div>

      {thinking ? (
        <div role="status" className="mt-2.5 inline-flex items-center gap-2 rounded-[12px] border border-line bg-surface px-3 py-2">
          <span className="flex items-center gap-1" aria-hidden="true">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </span>
          <span className="text-xs text-ink3">The examiner is thinking of a question…</span>
        </div>
      ) : null}

      {canAsk && hasQuestion && studentTurns < MAX_STUDENT_TURNS ? (
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <label htmlFor={composerId} className="sr-only">
            Answer the examiner&apos;s question
          </label>
          <textarea
            id={composerId}
            ref={composerRef}
            rows={2}
            value={draft}
            maxLength={2000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="Your answer, in your own words"
            className="flex-1 rounded-[8px] border border-line bg-surface px-3 py-2 text-sm resize-none min-h-11"
          />
          <Button type="submit" variant="primary" disabled={thinking || !draft.trim()} className="min-h-11">
            Reply
          </Button>
        </form>
      ) : null}

      <p className="text-[11px] text-ink3 mt-2.5">
        {canAsk
          ? "Personal details are removed from your answer before it is sent. The question is AI-written and provisional; the guidance above is authored and works offline."
          : online
            ? "Showing authored guidance. Turn on AI in Settings to get a guiding question."
            : "Offline — showing authored guidance from this device."}
      </p>
    </section>
  );
}
