// ---------------------------------------------------------------------------
// Official-paper trust tier (feature flag `officialPaperTrust`, default off).
//
// A learner uploads an official WJEC paper file. The app hashes the file
// bytes and compares the digest against a source-controlled manifest of
// official WJEC paper URLs + SHA-256 digests. On a match, the learner
// confirms each extracted question against the paper ("this matches the
// paper"), and those confirmations are stored on the learner's own private
// question rows.
//
// What this tier is and is not:
//
//   · It is DISTINCT from the two-independent-reviewer tier. It never feeds
//     trustedAssessmentContent, trustTier, the supply audit or coverage
//     metrics. Reviewers, counts and "trusted" labels never see it.
//   · It counts toward proof ONLY for the learner who confirmed it, ONLY when
//     the feature flag and the WJEC-terms confirmation are both on, and ONLY
//     for a paper the learner had not previously attempted (first-attempt
//     rule, checked against attempt history).
//   · All other proof rules still apply on top: independent, unseen, delayed.
//     Help still never counts as proof.
//
// With an empty manifest every lookup misses, so the whole path is inert
// until real digests are verified from WJEC's site and committed. Never
// commit paper PDFs or WJEC question text: the manifest holds URLs + digests
// only.
// ---------------------------------------------------------------------------

import type { Attempt, Id, Question } from "./types";
import { validAttestationInstant } from "./trust-attestation";
import bundledManifest from "@/content/official-papers/manifest.json";

/** Distinct tier label. Kept separate from TrustTier on purpose. */
export const OFFICIAL_PAPER_TRUST_TIER = "official-paper" as const;
export type OfficialPaperTrustTier = typeof OFFICIAL_PAPER_TRUST_TIER;

export interface OfficialPaperManifestEntry {
  /** Stable manifest id, e.g. "wjec-physics-a-level-2024-paper-1". */
  id: string;
  board: "wjec";
  subjectId: Id;
  title: string;
  /** Official WJEC HTTPS URL the digest was verified against. */
  sourceUrl: string;
  /** SHA-256 hex of the official file bytes. */
  sha256: string;
}

export interface OfficialPaperManifest {
  formatVersion: 1;
  papers: OfficialPaperManifestEntry[];
}

export interface OfficialPaperConfirmation {
  /** Manifest entry id the learner matched. */
  manifestId: string;
  /** Digest of the uploaded file bytes that matched. */
  digest: string;
  /** When the learner confirmed this question matches the paper. */
  confirmedAt: string;
  /** The learner's reference for the question in the paper (e.g. "Q3(a)"). */
  questionRef: string;
}

export interface OfficialPaperContext {
  enabled: boolean;
  manifest: OfficialPaperManifest;
}

/** Bundled manifest: the source-controlled file is the single source of truth. */
export const BUNDLED_OFFICIAL_PAPER_MANIFEST: OfficialPaperManifest = {
  formatVersion: 1,
  papers: (bundledManifest as { papers?: OfficialPaperManifestEntry[] }).papers ?? [],
};

/** Context for the current learner, from synced settings. */
export function officialPaperContextFromSettings(input: {
  officialPaperTrust?: boolean;
  officialPaperTermsConfirmed?: boolean;
}): OfficialPaperContext {
  return {
    enabled: officialPaperContextEnabled(input),
    manifest: BUNDLED_OFFICIAL_PAPER_MANIFEST,
  };
}

const SHA256_HEX = /^[0-9a-f]{64}$/;
const WJEC_HTTPS = /^https:\/\/([a-z0-9-]+\.)*wjec\.co\.uk(\/.*)?$/i;

export function officialPaperContextEnabled(input: {
  officialPaperTrust?: boolean;
  officialPaperTermsConfirmed?: boolean;
}): boolean {
  return input.officialPaperTrust === true && input.officialPaperTermsConfirmed === true;
}

export function validateOfficialPaperManifest(manifest: OfficialPaperManifest): string[] {
  const issues: string[] = [];
  if (manifest.formatVersion !== 1) issues.push("manifest formatVersion must be 1");
  const ids = new Set<string>();
  for (const entry of manifest.papers) {
    if (!entry.id.trim() || ids.has(entry.id)) issues.push(`duplicate or blank manifest id: ${entry.id}`);
    ids.add(entry.id);
    if (entry.board !== "wjec") issues.push(`${entry.id}: board must be wjec`);
    if (!WJEC_HTTPS.test(entry.sourceUrl)) issues.push(`${entry.id}: sourceUrl must be an official WJEC HTTPS URL`);
    if (!SHA256_HEX.test(entry.sha256)) issues.push(`${entry.id}: sha256 must be 64 lowercase hex characters`);
    if (!entry.subjectId.trim() || !entry.title.trim()) issues.push(`${entry.id}: subjectId and title are required`);
  }
  return issues;
}

export function findOfficialPaperMatch(
  manifest: OfficialPaperManifest,
  digest: string,
): OfficialPaperManifestEntry | null {
  const clean = digest.trim().toLowerCase();
  if (!SHA256_HEX.test(clean)) return null;
  return manifest.papers.find((p) => p.sha256 === clean) ?? null;
}

/** A stored per-question confirmation is valid only against the manifest. */
export function officialPaperConfirmationValid(
  question: Pick<Question, "officialPaper">,
  manifest: OfficialPaperManifest,
): boolean {
  const c = question.officialPaper;
  if (!c || !c.questionRef.trim() || !validAttestationInstant(c.confirmedAt)) return false;
  const entry = manifest.papers.find((p) => p.id === c.manifestId);
  return Boolean(entry && entry.sha256 === c.digest.trim().toLowerCase() && WJEC_HTTPS.test(entry.sourceUrl));
}

/** Question-level eligibility (no attempt needed): a valid confirmation. */
export function officialPaperQuestionEligible(
  question: Pick<Question, "officialPaper"> | undefined,
  manifest: OfficialPaperManifest,
  enabled: boolean,
): boolean {
  return enabled && Boolean(question) && officialPaperConfirmationValid(question!, manifest);
}

/**
 * First-attempt rule: the paper counts only when the learner had not already
 * attempted this question. Earlier attempts by the same user on the same
 * question disqualify; the confirming attempt itself is the first.
 */
export function officialPaperFirstAttempt(attempt: Attempt, history: readonly Attempt[]): boolean {
  return !history.some(
    (prior) =>
      prior.userId === attempt.userId &&
      prior.id !== attempt.id &&
      prior.questionId === attempt.questionId &&
      prior.createdAt <= attempt.createdAt,
  );
}

/**
 * Full gate for counting an attempt toward proof under the official-paper
 * tier. Every other proof rule (independent, unseen, delayed) still applies
 * through the normal paths; this substitutes ONLY for reviewer trust.
 */
export function officialPaperProofEligible(input: {
  question: Question | undefined;
  attempt: Attempt;
  history: readonly Attempt[];
  manifest: OfficialPaperManifest;
  enabled: boolean;
}): boolean {
  const { question, attempt, history, manifest, enabled } = input;
  if (!enabled || !question) return false;
  if (!officialPaperConfirmationValid(question, manifest)) return false;
  if (question.subjectId !== attempt.subjectId) return false;
  return officialPaperFirstAttempt(attempt, history);
}
