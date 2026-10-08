"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useShortcuts } from "@/components/shortcuts";
import { Button } from "@/components/ui";

// Decision bar for one question. Keyboard first, built for a < 15 s review:
//   1–6  toggle each of the six required checks
//   A    approve (only when all six are ticked; otherwise focus the first gap)
//   R    request changes (focuses the comment; R again or Ctrl/⌘+Enter sends)
//   J    skip to the next question
//   ?    shortcut help (global)
// The server decides everything that matters: identity, role, qualification,
// time, and every domain rule. This component only collects the attestation.

const CHECKS = [
  ["question", "Question correct & clear"],
  ["marking", "Mark scheme right"],
  ["workedSolution", "Worked answer right"],
  ["capabilityMapping", "Skills mapped right"],
  ["specificationMapping", "Spec points right"],
  ["examRealism", "Exam-realistic"],
] as const;

type CheckKey = (typeof CHECKS)[number][0];
const NONE = Object.fromEntries(CHECKS.map(([key]) => [key, false])) as Record<CheckKey, boolean>;

export function ReviewDecisionForm(props: {
  questionId: string;
  contentFingerprint: string;
  nextHref: string;
  queueHref: string;
  alreadyApproved: boolean;
  transferClaimed: boolean;
  dataClaimed: boolean;
}) {
  const router = useRouter();
  const [checks, setChecks] = useState<Record<CheckKey, boolean>>(NONE);
  const [transferConfirmed, setTransferConfirmed] = useState(false);
  const [dataConfirmed, setDataConfirmed] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const checkRefs = useRef<(HTMLInputElement | null)[]>([]);
  const commentRef = useRef<HTMLTextAreaElement | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);

  // Each question page arrives with focus on its heading, so screen readers
  // announce the new question and keyboard users start from a known place.
  useEffect(() => {
    document.getElementById("review-title")?.focus();
  }, [props.questionId]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const allTicked = CHECKS.every(([key]) => checks[key]);

  async function submit(decision: "approve" | "revise") {
    if (busy) return;
    setError(null);
    if (decision === "approve" && props.alreadyApproved) {
      setError("You already approved this exact content. A different reviewer must confirm it.");
      return;
    }
    if (decision === "approve" && !allTicked) {
      const gap = CHECKS.findIndex(([key]) => !checks[key]);
      setStatus("Tick all six checks to approve.");
      checkRefs.current[gap]?.focus();
      return;
    }
    if (decision === "revise" && !comment.trim()) {
      setStatus("Say what needs changing, then press Ctrl+Enter or R.");
      commentRef.current?.focus();
      return;
    }
    setBusy(true);
    setStatus(decision === "approve" ? "Recording approval…" : "Sending change request…");
    try {
      const response = await fetch("/api/reviewer/decisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionId: props.questionId,
          contentFingerprint: props.contentFingerprint,
          decision,
          checks,
          comments: comment.trim(),
          ...(props.transferClaimed || props.dataClaimed
            ? { classification: { ...(props.transferClaimed ? { transferConfirmed } : {}), ...(props.dataClaimed ? { dataAnalysisConfirmed: dataConfirmed } : {}) } }
            : {}),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; problems?: string[]; stage?: string };
      if (!response.ok) {
        setStatus(null);
        setError([body.error ?? "The decision was not recorded.", ...(body.problems ?? [])].join(" "));
        setBusy(false);
        return;
      }
      setStatus(decision === "approve"
        ? body.stage === "verified" ? "Approved — this question is now verified for students." : "Approved — waiting on a second reviewer."
        : "Change request recorded.");
      router.push(props.nextHref);
    } catch {
      setStatus(null);
      setError("You appear to be offline. Nothing was recorded.");
      setBusy(false);
    }
  }

  function requestChanges() {
    if (comment.trim()) void submit("revise");
    else {
      setStatus("Say what needs changing, then press Ctrl+Enter or R.");
      commentRef.current?.focus();
    }
  }

  useShortcuts(
    [
      ...CHECKS.map(([key, label], index) => ({
        key: String(index + 1),
        group: "Review",
        label: `Toggle: ${label}`,
        run: () => setChecks((prev) => ({ ...prev, [key]: !prev[key] })),
      })),
      { key: "a", group: "Review", label: "Approve", run: () => void submit("approve"), disabled: busy },
      { key: "r", group: "Review", label: "Request changes", run: requestChanges, disabled: busy },
      { key: "enter", meta: true, allowInInput: true, group: "Review", label: "Send change request (in comment)", run: requestChanges, disabled: busy },
      { key: "j", group: "Review", label: "Skip to next question", run: () => router.push(props.nextHref) },
    ],
    [busy, checks, comment, transferConfirmed, dataConfirmed, props.questionId],
  );

  return (
    <form
      aria-label="Review decision"
      onSubmit={(event) => { event.preventDefault(); void submit("approve"); }}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur px-3 py-2 shadow-[var(--shadow-md)]"
    >
      <div className="mx-auto max-w-6xl flex flex-wrap items-start gap-x-4 gap-y-2">
        <fieldset className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <legend className="sr-only">All six checks are required to approve</legend>
          {CHECKS.map(([key, label], index) => (
            <label key={key} className="inline-flex items-center gap-1.5 text-ink2 cursor-pointer">
              <input
                ref={(element) => { checkRefs.current[index] = element; }}
                type="checkbox"
                checked={checks[key]}
                onChange={(event) => setChecks((prev) => ({ ...prev, [key]: event.target.checked }))}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <kbd className="text-[10px] text-ink3 font-mono" aria-hidden="true">{index + 1}</kbd>
              <span>{label}</span>
            </label>
          ))}
          {props.transferClaimed ? (
            <label className="inline-flex items-center gap-1.5 text-ink2"><input type="checkbox" checked={transferConfirmed} onChange={(event) => setTransferConfirmed(event.target.checked)} className="h-4 w-4" />Genuine transfer</label>
          ) : null}
          {props.dataClaimed ? (
            <label className="inline-flex items-center gap-1.5 text-ink2"><input type="checkbox" checked={dataConfirmed} onChange={(event) => setDataConfirmed(event.target.checked)} className="h-4 w-4" />Genuine data analysis</label>
          ) : null}
        </fieldset>

        <div className="flex flex-1 min-w-[16rem] items-start gap-2">
          <label htmlFor="review-comment" className="sr-only">Comment (required to request changes)</label>
          <textarea
            id="review-comment"
            ref={commentRef}
            rows={1}
            value={comment}
            maxLength={2000}
            onChange={(event) => setComment(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") (event.target as HTMLTextAreaElement).blur(); }}
            placeholder="Comment (required to request changes)"
            className="field text-xs flex-1 min-h-[2.25rem] resize-y"
          />
          <Button type="submit" variant="primary" disabled={busy || props.alreadyApproved} aria-keyshortcuts="A" title={props.alreadyApproved ? "You already approved this content" : "Approve (A)"}>
            Approve <kbd className="ml-1 text-[10px] opacity-70" aria-hidden="true">A</kbd>
          </Button>
          <Button onClick={requestChanges} disabled={busy} aria-keyshortcuts="R" title="Request changes (R)">
            Request changes <kbd className="ml-1 text-[10px] opacity-70" aria-hidden="true">R</kbd>
          </Button>
          <Button variant="ghost" onClick={() => router.push(props.nextHref)} aria-keyshortcuts="J" title="Skip (J)">Skip</Button>
        </div>
      </div>
      <div className="mx-auto max-w-6xl min-h-[1rem] text-xs">
        {error ? (
          <p ref={errorRef} tabIndex={-1} role="alert" className="text-danger outline-none">{error}</p>
        ) : (
          <p role="status" aria-live="polite" className="text-ink3">{status ?? (props.alreadyApproved ? "You approved this content; it needs a different reviewer." : "Press ? for shortcuts.")}</p>
        )}
      </div>
    </form>
  );
}
