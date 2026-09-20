// Deterministic offline error classifier (fallback + confidence gate).
// Pure domain: no network. classifier.dev refines this, never replaces marking.

import { ERROR_CONFIDENCE_FLOOR, ERROR_CONFIDENCE_THRESHOLD, isErrorCategory } from "./error-taxonomy";
import type { ErrorCategory } from "./error-taxonomy";

export interface ErrorSignalInput {
  prompt: string;
  point: string;
  answer: string;
  awarded: number;
  maxMarks: number;
  command?: string | null;
  missedPoints?: string[];
}

export interface LocalErrorVerdict {
  category: ErrorCategory;
  confidence: number;
  reasons: string[];
}

const NUM_RE = /[0-9]|calculate|equation|rearrang|substitut|mol|velocity|energy|force|resist|current|power|wave/i;
const UNIT_RE = /\bunit|kJ|J\b|m s|mol dm|significant|decimal|sig fig/i;
const TERM_RE = /\bdefin|terminolog|term\b|water potential|atp synthase/i;
const CMD_RE = /\bcompare\b|\bcontrast\b|\bdescribe\b|\bexplain\b.*only one|\bstate\b/i;

export function localClassifyError(input: ErrorSignalInput): LocalErrorVerdict {
  const hay = `${input.prompt} ${input.point}`.toLowerCase();
  const ans = input.answer.trim();
  if (!ans) return { category: "knowledge-gap", confidence: 0.8, reasons: ["no answer evidence reached the point"] };
  if (UNIT_RE.test(hay) || UNIT_RE.test(ans)) {
    const isUnit = /\bunit|kJ|J\b|m s|mol dm/i.test(hay);
    return { category: isUnit ? "unit-error" : "calculation", confidence: 0.62, reasons: ["units/significant-figure signal in the scheme text"] };
  }
  if (NUM_RE.test(hay)) return { category: "calculation", confidence: 0.6, reasons: ["numeric working signal in the point"] };
  if (TERM_RE.test(hay) && ans.length > 8) return { category: "terminology", confidence: 0.58, reasons: ["point demands a term the answer talked around"] };
  if (input.command && /compare|evaluate|describe|explain/i.test(input.command) && input.awarded === 0)
    return { category: "command-word", confidence: 0.55, reasons: [`command ${input.command} with zero marks`] };
  if (CMD_RE.test(hay)) return { category: "command-word", confidence: 0.52, reasons: ["command-verb signal"] };
  if (input.awarded > 0 && input.maxMarks > 0 && input.awarded / input.maxMarks >= 0.6)
    return { category: "careless-error", confidence: 0.66, reasons: ["most of the part was earned"] };
  if (ans.length < 20) return { category: "insufficient-detail", confidence: 0.55, reasons: ["answer too brief for the point"] };
  return { category: "knowledge-gap", confidence: 0.5, reasons: ["no stronger signal; default gap"] };
}

export type ErrorProvenance = "classifier-dev" | "local-fallback" | "offline";

export interface GatedErrorVerdict extends LocalErrorVerdict {
  provenance: ErrorProvenance;
  /** Raw remote label preserved even when gated to `other`. */
  rawLabel?: string;
  gated: boolean;
}

export function gateClassifierLabel(label: string, confidence: number, reasons: string[]): GatedErrorVerdict {
  if (!Number.isFinite(confidence) || confidence < ERROR_CONFIDENCE_FLOOR)
    return { category: "other", confidence: 0, reasons: ["remote confidence below floor"], provenance: "offline", rawLabel: label, gated: true };
  if (confidence < ERROR_CONFIDENCE_THRESHOLD)
    return { category: "other", confidence, reasons: [...reasons, "below action threshold"], provenance: "classifier-dev", rawLabel: label, gated: true };
  if (!isErrorCategory(label))
    return { category: "other", confidence: 0, reasons: ["unknown remote label"], provenance: "offline", rawLabel: label, gated: true };
  return { category: label, confidence, reasons, provenance: "classifier-dev", rawLabel: label, gated: false };
}
