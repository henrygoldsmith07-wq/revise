"use client";

import { useState } from "react";
import { deleteLocalDatabase } from "@/data/db";
import { dumpSnapshotForRecovery, repairSnapshotForRecovery } from "@/data/repository";
import { storageFailureKind, storageFailureMessage } from "@/data/storage-recovery";
import { captureTelemetry, errorClass } from "@/lib/observability";
import { Button, Panel, Pill } from "./ui";

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Recovery-first boot screen for corrupted stores and interrupted upgrades. */
export function StorageRecovery({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const [busy, setBusy] = useState<"export" | "repair" | "reset" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const kind = storageFailureKind(error);

  async function exportLocal() {
    setBusy("export");
    setMessage(null);
    try {
      const dump = await dumpSnapshotForRecovery();
      downloadJson(`revise-recovery-${new Date().toISOString().slice(0, 10)}.json`, {
        app: "revise",
        exportedAt: new Date().toISOString(),
        reason: kind,
        stores: dump,
      });
      setMessage("Recovery copy downloaded. Keep it somewhere safe before repairing or resetting.");
    } catch (exportError) {
      setMessage(`Could not read the local database (${errorClass(exportError)}). Try closing other Revise tabs.`);
    } finally {
      setBusy(null);
    }
  }

  async function repair() {
    setBusy("repair");
    setMessage(null);
    try {
      const result = await repairSnapshotForRecovery();
      captureTelemetry("migration.failure", { status: "warning", errorClass: "repair", failed: result.removed });
      setMessage(
        result.removed
          ? `Removed ${result.removed} damaged row${result.removed === 1 ? "" : "s"}. Your valid history and queued sync work were kept. Reloading…`
          : "No malformed rows were found. The database may be locked by another tab; retry after closing it.",
      );
      if (result.removed) window.setTimeout(onRetry, 500);
    } catch (repairError) {
      setMessage(`Repair could not finish (${errorClass(repairError)}). Download a recovery copy, then try a reset.`);
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    if (!window.confirm("Reset this device? This deletes local revision data. Download a recovery copy first.")) return;
    setBusy("reset");
    setMessage(null);
    try {
      await deleteLocalDatabase();
      window.location.reload();
    } catch (resetError) {
      setMessage(`Reset could not finish (${errorClass(resetError)}). Close other Revise tabs and retry.`);
      setBusy(null);
    }
  }

  return (
    <main className="min-h-dvh bg-bg p-4 sm:p-8 grid place-items-center" data-boot-error={storageFailureMessage(error)}>
      <Panel className="w-full max-w-xl space-y-4 border-danger/40">
        <div className="flex items-center gap-2">
          <Pill tone="danger">Local data needs attention</Pill>
          <span className="text-[11px] text-ink3">{kind}</span>
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Your revision work is still recoverable</h1>
          <p className="text-sm text-ink2 mt-2 leading-6">{storageFailureMessage(error)}</p>
        </div>
        <div className="rounded-[10px] bg-surface2 p-3 text-xs text-ink3 leading-5">
          Revise never sends answer content as diagnostics. Export a local recovery copy before repair if you need support or want a last-resort backup.
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void exportLocal()} disabled={busy !== null}>
            {busy === "export" ? "Preparing copy…" : "Download recovery copy"}
          </Button>
          <Button onClick={() => void repair()} disabled={busy !== null}>
            {busy === "repair" ? "Repairing…" : "Repair damaged rows"}
          </Button>
          <Button onClick={onRetry} disabled={busy !== null}>Retry</Button>
          <Button variant="ghost" onClick={() => void reset()} disabled={busy !== null}>
            {busy === "reset" ? "Resetting…" : "Reset this device"}
          </Button>
        </div>
        {message ? <p className="text-xs text-ink2" role="status" aria-live="polite">{message}</p> : null}
      </Panel>
    </main>
  );
}
