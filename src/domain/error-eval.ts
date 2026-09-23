// Labelled evaluation dataset + precision/recall + calibration for error-v1.
// Corpus: deterministic fixtures; remote labels scored when available.

import type { ErrorCategory } from "./error-taxonomy";
import { ERROR_TAXONOMY } from "./error-taxonomy";

export interface ErrorEvalItem {
  id: string;
  prompt: string;
  point: string;
  answer: string;
  expected: ErrorCategory;
}

export const ERROR_EVAL_DATASET: ErrorEvalItem[] = [
  { id: "e01", prompt: "State one role of ATP.", point: "ATP provides energy for muscle contraction", answer: "", expected: "knowledge-gap" },
  { id: "e02", prompt: "Explain why weight and normal are not a Newton third pair.", point: "third-law pairs act on different bodies", answer: "they cancel so they are a pair", expected: "misconception" },
  { id: "e03", prompt: "Calculate the Young modulus.", point: "E = stress/strain with area from radius", answer: "E = F/d using diameter, got 2e9", expected: "calculation" },
  { id: "e04", prompt: "Calculate the energy transferred.", point: "answer 450 J to 3 s.f.", answer: "450 with no units", expected: "unit-error" },
  { id: "e05", prompt: "Explain water movement in osmosis.", point: "water moves down its water potential gradient", answer: "water moves from a lot to less", expected: "terminology" },
  { id: "e06", prompt: "Compare aerobic and anaerobic respiration.", point: "give both sides with ATP yields", answer: "aerobic makes lots of ATP", expected: "command-word" },
  { id: "e07", prompt: "Describe ATP synthesis.", point: "ATP synthase uses proton gradient; oxygen final acceptor", answer: "ATP made with energy and oxygen involved", expected: "insufficient-detail" },
  { id: "e08", prompt: "Apply F=ma to the lift problem.", point: "apparent weight increases when accelerating up", answer: "F=ma so force is mass times acceleration", expected: "application" },
  { id: "e09", prompt: "Justify why the reaction speeds up.", point: "more frequent successful collisions link", answer: "particles move more so faster", expected: "reasoning" },
  { id: "e10", prompt: "Choose the equation for projectile range.", point: "resolve horizontal/vertical, use suvat vertically", answer: "used v=u+at on horizontal distance", expected: "formula-selection" },
  { id: "e11", prompt: "Describe a flaccid cell.", point: "membrane pulls away; cell flaccid", answer: "cell flaccid, membrane pulls away, vacuole small", expected: "careless-error" },
  { id: "e12", prompt: "Outline the evidence.", point: "some ambiguous point", answer: "unclear partial text", expected: "other" },
];

export interface EvalPrediction { id: string; predicted: ErrorCategory; confidence: number; }

export interface PrecisionRecall { precision: number; recall: number; f1: number; support: number; }

export function precisionRecallPerLabel(items: ErrorEvalItem[], preds: EvalPrediction[]): Record<string, PrecisionRecall> {
  const out: Record<string, PrecisionRecall> = {};
  for (const label of ERROR_TAXONOMY) {
    const tp = preds.filter((p) => p.predicted === label && items.find((i) => i.id === p.id)?.expected === label).length;
    const fp = preds.filter((p) => p.predicted === label && items.find((i) => i.id === p.id)?.expected !== label).length;
    const fn = items.filter((i) => i.expected === label && preds.find((p) => p.id === i.id)?.predicted !== label).length;
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    out[label] = { precision, recall, f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall), support: tp + fn };
  }
  return out;
}

export interface CalibrationBin { bin: string; n: number; meanConfidence: number; accuracy: number; gap: number; }

export function calibrationReport(items: ErrorEvalItem[], preds: EvalPrediction[]): CalibrationBin[] {
  const bins: CalibrationBin[] = [];
  const edges = [0, 0.5, 0.7, 0.85, 1.01];
  for (let b = 0; b < edges.length - 1; b++) {
    const lo = edges[b]!; const hi = edges[b + 1]!;
    const inBin = preds.filter((p) => p.confidence >= lo && p.confidence < hi);
    if (!inBin.length) { bins.push({ bin: `${lo}-${hi}`, n: 0, meanConfidence: 0, accuracy: 0, gap: 0 }); continue; }
    const acc = inBin.filter((p) => items.find((i) => i.id === p.id)?.expected === p.predicted).length / inBin.length;
    const mean = inBin.reduce((a, p) => a + p.confidence, 0) / inBin.length;
    bins.push({ bin: `${lo.toFixed(2)}-${hi.toFixed(2)}`, n: inBin.length, meanConfidence: Math.round(mean * 100) / 100, accuracy: Math.round(acc * 100) / 100, gap: Math.round(Math.abs(mean - acc) * 100) / 100 });
  }
  return bins;
}
