// ---------------------------------------------------------------------------
// Double-marking and human agreement — extended metrics
// Adds exact, within±1, weighted agreement, disagreement & adjudication rates,
// and separate AI vs marker A/B/consensus calculations.
// ---------------------------------------------------------------------------

import type { AnswerCorpusRecord } from "./answer-corpus";

export interface HumanAgreementMetrics {
  pairs: number;
  exactAgreement: number;
  exactAgreementRate: number;
  withinOneAgreement: number;
  withinOneRate: number;
  weightedAgreement: number; // linear weighted: 1 - |a-b|/maxMarks averaged
  meanAbsoluteDifference: number;
  disagreementRate: number;
  adjudicationRate: number;
}

export interface AiVsHumanMetrics {
  vsMarkerA: { exact: number; withinOne: number; mae: number; bias: number };
  vsMarkerB: { exact: number; withinOne: number; mae: number; bias: number };
  vsConsensus: { exact: number; withinOne: number; mae: number; bias: number };
  aiLabelled: number;
}

function round(n: number, p = 3): number {
  const f = 10 ** p;
  return Math.round(n * f) / f;
}

export function humanAgreementMetrics(records: AnswerCorpusRecord[]): HumanAgreementMetrics {
  const double = records.filter((r) => r.humanMark1 != null && r.humanMark2 != null);
  const n = double.length;
  if (n === 0) {
    return {
      pairs: 0,
      exactAgreement: 0,
      exactAgreementRate: 0,
      withinOneAgreement: 0,
      withinOneRate: 0,
      weightedAgreement: 0,
      meanAbsoluteDifference: 0,
      disagreementRate: 0,
      adjudicationRate: 0,
    };
  }
  let exact = 0;
  let withinOne = 0;
  let weightedSum = 0;
  let madSum = 0;
  let adjudicated = 0;
  for (const r of double) {
    const d = Math.abs(r.humanMark1! - r.humanMark2!);
    if (d === 0) exact += 1;
    if (d <= 1) withinOne += 1;
    weightedSum += r.maximumMarks ? 1 - d / r.maximumMarks : d === 0 ? 1 : 0;
    madSum += d;
    if (r.adjudicatedMark != null) adjudicated += 1;
  }
  return {
    pairs: n,
    exactAgreement: exact,
    exactAgreementRate: round(exact / n, 3),
    withinOneAgreement: withinOne,
    withinOneRate: round(withinOne / n, 3),
    weightedAgreement: round(weightedSum / n, 3),
    meanAbsoluteDifference: round(madSum / n, 3),
    disagreementRate: round((n - exact) / n, 3),
    adjudicationRate: round(adjudicated / n, 3),
  };
}

export function aiVsHumanMetrics(
  records: AnswerCorpusRecord[],
  aiMark: (r: AnswerCorpusRecord) => number | null,
): AiVsHumanMetrics {
  let aExact = 0, aWithin = 0, aMae = 0, aBias = 0, aN = 0;
  let bExact = 0, bWithin = 0, bMae = 0, bBias = 0, bN = 0;
  let cExact = 0, cWithin = 0, cMae = 0, cBias = 0, cN = 0;
  for (const r of records) {
    const ai = aiMark(r);
    if (ai == null || !Number.isFinite(ai)) continue;
    if (r.humanMark1 != null) {
      const d = Math.abs(ai - r.humanMark1);
      if (d === 0) aExact += 1;
      if (d <= 1) aWithin += 1;
      aMae += d;
      aBias += ai - r.humanMark1;
      aN += 1;
    }
    if (r.humanMark2 != null) {
      const d = Math.abs(ai - r.humanMark2);
      if (d === 0) bExact += 1;
      if (d <= 1) bWithin += 1;
      bMae += d;
      bBias += ai - r.humanMark2;
      bN += 1;
    }
    const consensus = r.adjudicatedMark ?? (r.humanMark1 != null && r.humanMark2 != null ? Math.round((r.humanMark1 + r.humanMark2) / 2) : r.humanMark1 ?? r.humanMark2);
    if (consensus != null) {
      const d = Math.abs(ai - consensus);
      if (d === 0) cExact += 1;
      if (d <= 1) cWithin += 1;
      cMae += d;
      cBias += ai - consensus;
      cN += 1;
    }
  }
  return {
    vsMarkerA: { exact: aN ? round(aExact / aN, 3) : 0, withinOne: aN ? round(aWithin / aN, 3) : 0, mae: aN ? round(aMae / aN, 3) : 0, bias: aN ? round(aBias / aN, 3) : 0 },
    vsMarkerB: { exact: bN ? round(bExact / bN, 3) : 0, withinOne: bN ? round(bWithin / bN, 3) : 0, mae: bN ? round(bMae / bN, 3) : 0, bias: bN ? round(bBias / bN, 3) : 0 },
    vsConsensus: { exact: cN ? round(cExact / cN, 3) : 0, withinOne: cN ? round(cWithin / cN, 3) : 0, mae: cN ? round(cMae / cN, 3) : 0, bias: cN ? round(cBias / cN, 3) : 0 },
    aiLabelled: cN,
  };
}
