// classifier.dev HTTP client (server-only): post-marking error diagnosis.
// Free tier, no key. Never touches marks — only classifies AFTER marking.

import "server-only";
import { ERROR_TAXONOMY, ERROR_TAXONOMY_VERSION } from "@/domain/error-taxonomy";
import { gateClassifierLabel, localClassifyError } from "@/domain/error-local-classifier";
import type { ErrorSignalInput, GatedErrorVerdict } from "@/domain/error-local-classifier";

export const CLASSIFIER_BASE_URL = "https://classifier.dev";
export const CLASSIFIER_TIMEOUT_MS = 8_000;
const MAX_INPUT_CHARS = 2_000;

export interface ErrorDiagnosisRequest extends ErrorSignalInput {
  subjectId: string;
  topicId: string;
  questionId: string;
  partId: string;
  /** Fixed awarded/max from marking — echoed for provenance, never re-decided. */
  awarded: number;
  maxMarks: number;
}

export interface ErrorDiagnosis extends GatedErrorVerdict {
  taxonomyVersion: string;
  remediation: string;
  requestFingerprint: string;
}

function fingerprint(req: ErrorDiagnosisRequest): string {
  const s = `${req.subjectId}|${req.topicId}|${req.questionId}|${req.partId}|${req.point.slice(0, 120)}|${req.answer.slice(0, 120)}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return `err-${(h >>> 0).toString(16)}`;
}

function errorText(req: ErrorDiagnosisRequest): string {
  return [
    `Question: ${req.prompt.slice(0, 500)}`,
    `Missed mark-scheme point: ${req.point.slice(0, 300)}`,
    `Student answer: ${req.answer.slice(0, 800)}`,
    `Score already fixed at ${req.awarded}/${req.maxMarks} — classify the ERROR TYPE only.`,
  ].join("\n").slice(0, MAX_INPUT_CHARS);
}

function instructions(): string {
  return [
    "Classify the student's ERROR TYPE after marking. The score is already fixed; do not re-mark.",
    "knowledge-gap: fact unknown. misconception: wrong idea applied. formula-selection: wrong equation.",
    "calculation: arithmetic/working slip. unit-error: units/sig figs. terminology: talked around term.",
    "insufficient-detail: too vague. command-word: ignored the verb. application: fact not transferred.",
    "reasoning: logical link missing. careless-error: slip on strong answer. other: ambiguous.",
    "Reply with the single best label.",
  ].join(" ");
}

export function classifierConfigured(): boolean {
  return process.env.CLASSIFIER_DISABLED !== "1";
}

async function postClassify(text: string, tier: "fast" | "smart"): Promise<{ label: string; confidence: number } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);
  try {
    const res = await fetch(`${CLASSIFIER_BASE_URL}/v1/classify`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "revise-error-diagnosis/1.0" },
      body: JSON.stringify({ labels: [...ERROR_TAXONOMY], inputs: [text], instructions: instructions(), tier }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: { label?: string; confidence?: number | null }[] };
    const r = json.results?.[0];
    if (!r || typeof r.label !== "string") return null;
    if (!(ERROR_TAXONOMY as readonly string[]).includes(r.label)) return null;
    return { label: r.label, confidence: typeof r.confidence === "number" ? r.confidence : 0 };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function diagnoseError(req: ErrorDiagnosisRequest): Promise<ErrorDiagnosis> {
  const fp = fingerprint(req);
  const fallbackVerdict = localClassifyError(req);
  if (!classifierConfigured()) {
    return { ...fallbackVerdict, provenance: "offline", gated: true, taxonomyVersion: ERROR_TAXONOMY_VERSION, remediation: req.topicId, requestFingerprint: fp };
  }
  // Smart tier only for the uncertain middle; fast otherwise (cost control).
  const fast = await postClassify(errorText(req), "fast");
  let label: string | null = fast?.label ?? null;
  let confidence = fast?.confidence ?? 0;
  if (fast && fast.confidence < 0.7 && fast.confidence >= 0.35) {
    const smart = await postClassify(errorText(req), "smart");
    if (smart) { label = smart.label; confidence = smart.confidence; }
  }
  if (!label) {
    return { ...fallbackVerdict, provenance: "offline", gated: true, taxonomyVersion: ERROR_TAXONOMY_VERSION, remediation: req.topicId, requestFingerprint: fp };
  }
  const gated: GatedErrorVerdict = gateClassifierLabel(label, confidence, [`classifier.dev ${label} @ ${confidence.toFixed(2)}`]);
  // Smart fallback: low-confidence remote defers to the deterministic local read.
  if (gated.gated && gated.category === "other" && fallbackVerdict.confidence >= 0.6) {
    return { ...fallbackVerdict, provenance: "local-fallback", gated: true, rawLabel: label, taxonomyVersion: ERROR_TAXONOMY_VERSION, remediation: req.topicId, requestFingerprint: fp };
  }
  return { ...gated, taxonomyVersion: ERROR_TAXONOMY_VERSION, remediation: req.topicId, requestFingerprint: fp };
}
