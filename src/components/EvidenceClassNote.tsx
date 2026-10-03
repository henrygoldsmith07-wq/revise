"use client";

import { EVIDENCE_CLASS_LABEL, EVIDENCE_CLASS_NOTE, type EvidenceClass } from "@/domain/evidence-class";
import { Pill } from "./ui";

/** Marks a panel as engineering validation or real-world evidence, with a one-line explanation. */
export function EvidenceClassNote({ kind }: { kind: EvidenceClass }) {
  return (
    <p className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-ink3">
      <Pill tone={kind === "real-world-evidence" ? "success" : "neutral"}>{EVIDENCE_CLASS_LABEL[kind]}</Pill>
      <span>{EVIDENCE_CLASS_NOTE[kind]}</span>
    </p>
  );
}
