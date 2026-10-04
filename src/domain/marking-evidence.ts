// Human evidence intake and benchmark reporting. Reuses the existing answer
// corpus; internal fixtures and disputed marks never become calibration truth.
import { validateAnswerCorpusRecord, type AnswerCorpusRecord, type MarkerMetadata } from "./answer-corpus";
import { canonicalJson, sha256Hex } from "./content-fingerprint";

export const PHASE_ONE_ANSWERS = 250;
export const LATER_ANSWERS = 1000;
export const MIN_MARKING_PAIRS = 20;
const validDate = (s: string | undefined) => !!s && Number.isFinite(Date.parse(s));
const validMark = (n: unknown, max: number): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= max;
const qualified = (m: MarkerMetadata | null | undefined) => typeof m?.markerId === "string" && !!m.markerId.trim() &&
  ["teacher", "examiner", "senior-examiner"].includes(m.role ?? "") && typeof m.qualification === "string" && !!m.qualification.trim() && validDate(m.markedAt);

export function markingRecordFingerprint(r: AnswerCorpusRecord): string {
  return `sha256:${sha256Hex(canonicalJson({ id: r.id, questionId: r.questionId, partId: r.partId ?? null,
    subject: r.subject, questionText: r.questionText, markScheme: r.markScheme, maximumMarks: r.maximumMarks,
    studentAnswer: r.studentAnswer, specificationVersion: r.specificationVersion ?? null, benchmarkVersion: r.benchmarkVersion }))}`;
}
export interface HumanMarkReturn { recordId: string; fingerprint: string; mark: number; slot: "A" | "B" | "adjudication"; marker: MarkerMetadata }

export function applyHumanMarkReturns(records: readonly AnswerCorpusRecord[], returns: readonly HumanMarkReturn[], now = new Date()) {
  const next = records.map(r => structuredClone(r));
  const errors: string[] = [];
  for (const decision of returns) {
    const r = next.find(row => row.id === decision.recordId);
    if (!r) { errors.push(`${decision.recordId}: unknown answer`); continue; }
    if (decision.fingerprint !== markingRecordFingerprint(r)) { errors.push(`${r.id}: stale answer/question version`); continue; }
    if (!qualified(decision.marker) || Date.parse(decision.marker.markedAt!) > now.getTime() || !validMark(decision.mark, r.maximumMarks)) {
      errors.push(`${r.id}: qualified pseudonymous marker, date and in-range integer mark required`); continue;
    }
    if (decision.slot === "adjudication") {
      if (!independentPair(r) || [r.marker1Meta?.markerId, r.marker2Meta?.markerId].includes(decision.marker.markerId) || r.adjudicatedMark != null) {
        errors.push(`${r.id}: adjudication requires two independent marks and a third marker`); continue;
      }
      r.adjudicatedMark = decision.mark; r.adjudicatorMeta = { ...decision.marker, contentFingerprint: markingRecordFingerprint(r) }; r.reviewStatus = "adjudicated";
    } else if (decision.slot === "A" || decision.slot === "B") {
      const slot = decision.slot === "A" ? "humanMark1" : "humanMark2";
      const meta = decision.slot === "A" ? "marker1Meta" : "marker2Meta";
      const other = decision.slot === "A" ? r.marker2Meta : r.marker1Meta;
      if (r[slot] != null || decision.marker.independentlyMarked !== true || other?.markerId === decision.marker.markerId) {
        errors.push(`${r.id}: first-pass marks must be independent, distinct and cannot be overwritten`); continue;
      }
      r[slot] = decision.mark; r[meta] = { ...decision.marker, contentFingerprint: markingRecordFingerprint(r) };
      r.reviewStatus = r.humanMark1 != null && r.humanMark2 != null ? "double-marked" : "single-marked";
    } else { errors.push(`${r.id}: unknown marking slot`); continue; }
    r.updatedAt = decision.marker.markedAt!;
  }
  return { records: errors.length ? [...records] : next, errors, applied: errors.length ? 0 : returns.length };
}

export function independentPair(r: AnswerCorpusRecord): boolean {
  return qualified(r.marker1Meta) && qualified(r.marker2Meta) && r.marker1Meta!.markerId !== r.marker2Meta!.markerId &&
    r.marker1Meta!.contentFingerprint === markingRecordFingerprint(r) && r.marker2Meta!.contentFingerprint === markingRecordFingerprint(r) &&
    r.marker1Meta!.independentlyMarked === true && r.marker2Meta!.independentlyMarked === true &&
    validMark(r.humanMark1, r.maximumMarks) && validMark(r.humanMark2, r.maximumMarks);
}
export function genuineMarkingRecord(r: AnswerCorpusRecord): boolean {
  return validateAnswerCorpusRecord(r, 0).issues.length === 0 &&
    ["teacher-reviewed", "examiner-reviewed", "official/past-paper"].includes(r.source) &&
    ["double-marked", "adjudicated", "verified"].includes(r.reviewStatus) &&
    r.collection?.genuineStudentAnswer === true && r.collection.anonymised === true && r.collection.consented === true &&
    !!r.collection.sourceRef.trim() && validDate(r.collection.collectedAt) && independentPair(r);
}
function referenceMark(r: AnswerCorpusRecord): number | null {
  if (validMark(r.adjudicatedMark, r.maximumMarks) && qualified(r.adjudicatorMeta) && r.adjudicatorMeta!.contentFingerprint === markingRecordFingerprint(r) &&
    ![r.marker1Meta!.markerId, r.marker2Meta!.markerId].includes(r.adjudicatorMeta!.markerId)) return r.adjudicatedMark;
  return r.humanMark1 === r.humanMark2 ? r.humanMark1 : null;
}

export interface Agreement { pairs: number; exact: number | null; withinOne: number | null; mae: number | null; bias: number | null; kappa: number | null; weightedKappa: number | null }
/** Kappa is calculated only within a fixed subject/tariff scale. Undefined
 * when chance agreement is 1 (e.g. every answer gets the same mark). */
export function pairAgreement(pairs: readonly (readonly [number, number])[], max: number, minimum = MIN_MARKING_PAIRS): Agreement {
  const valid = pairs.filter(([a, b]) => validMark(a, max) && validMark(b, max));
  const n = valid.length;
  const empty: Agreement = { pairs: n, exact: null, withinOne: null, mae: null, bias: null, kappa: null, weightedKappa: null };
  if (n < minimum) return empty;
  const left = Array.from({ length: max + 1 }, () => 0), right = [...left];
  let exact = 0, within = 0, abs = 0, bias = 0, observedWeighted = 0;
  for (const [a, b] of valid) { left[a]!++; right[b]!++; exact += Number(a === b); within += Number(Math.abs(a - b) <= 1); abs += Math.abs(a - b); bias += a - b; observedWeighted += 1 - Math.abs(a - b) / max; }
  let chance = 0, weightedChance = 0;
  for (let a = 0; a <= max; a++) for (let b = 0; b <= max; b++) {
    const p = left[a]! * right[b]! / (n * n);
    if (a === b) chance += p;
    weightedChance += p * (1 - Math.abs(a - b) / max);
  }
  return { pairs: n, exact: exact / n, withinOne: within / n, mae: abs / n, bias: bias / n,
    kappa: chance < 1 - 1e-12 ? (exact / n - chance) / (1 - chance) : null,
    weightedKappa: weightedChance < 1 - 1e-12 ? (observedWeighted / n - weightedChance) / (1 - weightedChance) : null };
}

export function markingEvidenceReport(records: readonly AnswerCorpusRecord[]) {
  const seen = new Set<string>();
  const genuine = records.filter(r => { const key = `${r.collection?.sourceRef}:${r.questionId}:${r.partId ?? ""}`; if (seen.has(r.id) || seen.has(key) || !genuineMarkingRecord(r)) return false; seen.add(r.id); seen.add(key); return true; });
  const groups = new Map<string, AnswerCorpusRecord[]>();
  for (const r of genuine) { const key = `${r.subject}:${r.maximumMarks}:${r.benchmarkVersion}:${r.markingVersion ?? "unevaluated"}`; groups.set(key, [...(groups.get(key) ?? []), r]); }
  const strata = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([key, rows]) => {
    const max = rows[0]!.maximumMarks;
    const examiner = pairAgreement(rows.map(r => [r.humanMark1!, r.humanMark2!] as const), max);
    const compare = (kind: "rubricMark" | "aiMark") => {
      const matched = rows.filter(r => validMark(r[kind], max) && referenceMark(r) !== null && !!r.markingVersion?.trim());
      const system = pairAgreement(matched.map(r => [r[kind]!, referenceMark(r)!] as const), max);
      const humanBaseline = pairAgreement(matched.map(r => [r.humanMark1!, r.humanMark2!] as const), max);
      return { system, humanBaseline, comparison: system.mae === null ? "INSUFFICIENT DATA" : system.mae <= humanBaseline.mae! ? "NO MORE DISAGREEMENT IN THIS SAMPLE" : "MORE DISAGREEMENT IN THIS SAMPLE" };
    };
    return { key, subject: rows[0]!.subject, tariff: max, benchmarkVersion: rows[0]!.benchmarkVersion, markingVersion: rows[0]!.markingVersion ?? null, answers: rows.length, examiner, rubric: compare("rubricMark"), ai: compare("aiMark") };
  });
  return { submitted: records.length, genuineIndependentAnswers: genuine.length, excluded: records.length - genuine.length,
    phaseOneTarget: PHASE_ONE_ANSWERS, laterTarget: LATER_ANSWERS, phaseOneCollected: genuine.length >= PHASE_ONE_ANSWERS,
    unresolvedDisagreements: genuine.filter(r => referenceMark(r) === null).length,
    byQuestionType: Object.fromEntries([...new Set(genuine.flatMap(r => r.questionTypeTags))].map(t => [t, genuine.filter(r => r.questionTypeTags.includes(t)).length])),
    byQualityBand: Object.fromEntries(["blank", "weak", "partial", "strong", "unlabelled"].map(b => [b, genuine.filter(r => (r.answerQualityBand ?? "unlabelled") === b).length])),
    strata, qualityClaimAllowed: false,
    note: "Collection targets are not proof of marking quality. Metrics require 20 matched answers per subject/tariff. Disputed answers need adjudication; no rounded average is ground truth. Sample comparisons are descriptive, not equivalence tests.",
  };
}
