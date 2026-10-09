"use client";

// Bridges the recovery ledger to opt-in pilot telemetry. Renders nothing.
//
// Watches proven recovery: when the ledger's proven total grows, records
// anonymised outcome events (marks recovered, proof completed, minutes from
// first loss to proof). A device-side watermark means each proven mark is
// reported once. Nothing is queued unless pilot telemetry consent is on, and
// sending happens only in flushPilotEvents (Settings toggle, online return).

import { useEffect } from "react";
import { useStoreFields } from "@/state/store";
import { recordPilotEvent } from "@/lib/pilot-telemetry";
import { useRecoveryEvidence } from "./recovery-evidence";

const WATERMARK_KEY = (userId: string) => `revise.pilot.watermark.${userId}`;

function readWatermark(userId: string): { provenTotal: number; seenProven: string[] } {
  try {
    const raw = localStorage.getItem(WATERMARK_KEY(userId));
    if (!raw) return { provenTotal: 0, seenProven: [] };
    const parsed = JSON.parse(raw) as { provenTotal?: unknown; seenProven?: unknown };
    return {
      provenTotal: typeof parsed.provenTotal === "number" ? parsed.provenTotal : 0,
      seenProven: Array.isArray(parsed.seenProven) ? parsed.seenProven.filter((s): s is string => typeof s === "string") : [],
    };
  } catch {
    return { provenTotal: 0, seenProven: [] };
  }
}

export function PilotOutcomesSync() {
  const { userId, settings } = useStoreFields("userId", "settings");
  const consented = settings.pilotTelemetry === true;
  const { recovery, mistakes } = useRecoveryEvidence();
  const provenTotal = recovery.totals.proven;
  const items = recovery.items;

  useEffect(() => {
    if (!consented || !userId) return;
    const mark = readWatermark(userId);
    if (provenTotal <= mark.provenTotal && items.every((i) => i.state !== "proven" || mark.seenProven.includes(i.mistakeId))) return;
    const seen = new Set(mark.seenProven);
    const createdAt = new Map(mistakes.map((m) => [m.id, m.createdAt] as const));
    let newMarks = 0;
    for (const item of items) {
      if (item.state !== "proven" || seen.has(item.mistakeId)) continue;
      seen.add(item.mistakeId);
      newMarks += item.marks;
      const lostAt = createdAt.get(item.mistakeId);
      const provenAt = item.provenAt;
      if (lostAt && provenAt) {
        const minutes = Math.round((Date.parse(provenAt) - Date.parse(lostAt)) / 60_000);
        if (Number.isFinite(minutes) && minutes >= 0) {
          recordPilotEvent(userId, { event: "first-loss-to-proof", subjectId: item.subjectId, minutes });
        }
      }
    }
    if (newMarks > 0) {
      const bySubject = new Map<string, number>();
      for (const item of items) {
        if (item.state === "proven" && !mark.seenProven.includes(item.mistakeId)) bySubject.set(item.subjectId, (bySubject.get(item.subjectId) ?? 0) + item.marks);
      }
      // One event per subject keeps the payload attributable without detail.
      for (const [subjectId, marks] of [...bySubject.entries()].slice(0, 8)) {
        recordPilotEvent(userId, { event: "proof.completed", subjectId, count: Math.round(marks) });
      }
      recordPilotEvent(userId, { event: "marks.recovered", count: Math.round(newMarks) });
    }
    try {
      localStorage.setItem(WATERMARK_KEY(userId), JSON.stringify({ provenTotal: Math.max(mark.provenTotal, provenTotal), seenProven: [...seen].slice(-500) }));
    } catch {
      // Telemetry bookkeeping is expendable.
    }
    // Watermark + ledger identity drive this; consented/userId gate it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consented, userId, provenTotal]);

  return null;
}
