"use client";

import { useCallback, useEffect, useState } from "react";

import {
  MARKING_FLAG_REASONS,
  MARKING_FLAG_REASON_LABEL,
  MAX_FLAG_REASON_CHARS,
  createMarkingFlag,
  type MarkingFlagReason,
} from "@/domain/marking-flag";
import type { Attempt, MarkedPart } from "@/domain/types";

import { deleteMarkingFlag, getMarkingFlag, putMarkingFlag } from "@/data/db";
import { useStoreFields } from "@/state/store";
import { pilotAnonId } from "@/lib/pilot-telemetry";
import { Button, cx } from "./ui";

/**
 * "Flag this mark" — the only honest response a student has to a mark they
 * think is wrong.
 *
 * Deliberately narrow:
 *   * It writes one local row. It never changes the awarded mark, never touches
 *     question trust, and is never read by the marking engine.
 *   * It is not sent anywhere. The copy says so, because a student disputing a
 *     mark is at their most candid — telling them where that text goes matters
 *     more than making the button feel good.
 *   * Nothing here is presented as a request that has been sent to a teacher.
 *     It has not been, so it does not say that.
 */
export function FlagThisMark({
  attempt,
  part,
}: {
  attempt: Attempt;
  part: MarkedPart;
}) {
  const userId = useStoreFields("userId").userId;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<MarkingFlagReason | null>(null);
  const [note, setNote] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "sending" | "failed">("idle");

  const flagId = `markflag:${attempt.id}:${part.partId}`;

  useEffect(() => {
    let live = true;
    void getMarkingFlag(flagId)
      .then((existing) => {
        if (!live) return;
        setFlagged(Boolean(existing));
        if (existing?.reason) setReason(existing.reason);
        if (existing?.note) setNote(existing.note);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [flagId]);

  const save = useCallback(async () => {
    setBusy(true);
    setFailed(null);
    try {
      await putMarkingFlag(
        createMarkingFlag({ userId, attempt, part, reason, note, now: new Date().toISOString() }),
      );
      setFlagged(true);
      setOpen(false);
    } catch {
      setFailed("Could not save that on this device. Try again.");
    } finally {
      setBusy(false);
    }
  }, [userId, attempt, part, reason, note]);

  const clear = useCallback(async () => {
    setBusy(true);
    setFailed(null);
    try {
      await deleteMarkingFlag(flagId);
      setFlagged(false);
      setReason(null);
      setNote("");
    } catch {
      setFailed("Could not remove that. Try again.");
    } finally {
      setBusy(false);
    }
  }, [flagId]);

  // Per-dispute explicit opt-in: shares this one flag (reason + note + mark
  // context, never the full answer history) with the Revise team for human
  // review of the marker. Sharing never changes the mark.
  const share = useCallback(async () => {
    setShareState("sending");
    try {
      const res = await fetch("/api/marking-disputes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          anonId: pilotAnonId(userId),
          attemptId: attempt.id,
          questionId: attempt.questionId,
          partId: part.partId,
          subjectId: attempt.subjectId,
          reason: reason ?? "other",
          note: note.slice(0, MAX_FLAG_REASON_CHARS),
          awarded: typeof part.awarded === "number" ? part.awarded : null,
          maxMarks: part.max,
          markedBy: attempt.markedBy,
        }),
      });
      if (!res.ok) {
        setShareState("failed");
        return;
      }
      setShared(true);
      setShareState("idle");
    } catch {
      setShareState("failed");
    }
  }, [userId, attempt, part, reason, note]);

  if (!attempt.id || !part.partId) return null;

  return (
    <div className="mt-2">
      {flagged && !open ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] text-ink2">
            {shared ? "Flagged and shared with the Revise team for human review." : "Flagged on this device. Nothing has been sent to anyone yet."}
          </p>
          <Button size="sm" variant="ghost" className="px-2 py-1 text-[11px]" onClick={() => setOpen(true)}>
            Edit flag
          </Button>
          <Button size="sm" variant="ghost" className="px-2 py-1 text-[11px]" disabled={busy} onClick={() => void clear()}>
            Remove
          </Button>
          {!shared ? (
            <Button
              size="sm"
              variant="ghost"
              className="px-2 py-1 text-[11px]"
              disabled={shareState === "sending"}
              onClick={() => void share()}
            >
              {shareState === "sending" ? "Sharing…" : "Share with the Revise team"}
            </Button>
          ) : null}
          {shareState === "failed" ? (
            <p className="text-[11px] text-danger">Could not share (sign-in and connection needed). It stays on this device.</p>
          ) : null}
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="px-2 py-1 text-[11px]"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
        >
          {open ? "Cancel" : "Flag this mark"}
        </Button>
      )}

      {open ? (
        <fieldset className="mt-2 rounded-xl border border-line bg-surface2/60 p-3">
          <legend className="px-1 text-[11px] font-semibold text-ink2">Why does this mark look wrong?</legend>
          <div className="mt-1 space-y-1.5">
            {MARKING_FLAG_REASONS.map((option) => (
              <label key={option} className="flex cursor-pointer items-center gap-2 text-xs text-ink2">
                <input
                  type="radio"
                  name={`markflag-${attempt.id}-${part.partId}`}
                  checked={reason === option}
                  onChange={() => setReason(option)}
                />
                <span>{MARKING_FLAG_REASON_LABEL[option]}</span>
              </label>
            ))}
          </div>
          <label className="mt-3 block text-[11px] font-semibold text-ink2" htmlFor={`markflag-note-${part.partId}`}>
            Anything to add (optional)
          </label>
          <textarea
            id={`markflag-note-${part.partId}`}
            value={note}
            maxLength={MAX_FLAG_REASON_CHARS}
            rows={2}
            onChange={(event) => setNote(event.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink"
          />
          <p className={cx("mt-2 text-[11px] text-ink3")}>
            This is saved on this device only. It is not sent anywhere, and a flag never changes your mark —
            only a person can do that.
          </p>
          {failed ? <p className="mt-1 text-[11px] text-danger">{failed}</p> : null}
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => void save()} disabled={busy}>
              {flagged ? "Update flag" : "Flag this mark"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}