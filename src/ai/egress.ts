// ---------------------------------------------------------------------------
// AI egress policy — the one place that decides what a task may send.
//
// Every AI request passes through `prepareAiEgress` twice:
//
//   1. in the browser, inside the single transport (`src/ai/transport.ts`)
//      that both the live client and the dead-letter retry use, so a retry
//      can never take a different, less-protected route than the original
//      request; and
//   2. on the server, after payload validation and before any provider or
//      classifier call, so an older client, a stale tab or a hand-written
//      request still cannot put unmasked learner text in front of a model.
//
// The function is idempotent: masked text stays masked, a stripped image stays
// stripped, a minimised question stays minimised. It is pure (no I/O) so it
// runs identically in both places and is unit-testable without a network.
//
// What it does per task is declared in AI_TASK_POLICY (src/ai/task-policy.ts);
// this module implements it.
// ---------------------------------------------------------------------------

import { maskChatHistory, maskPii, maskStudentText, maskSummaryMany, type MaskResult } from "./pii";
import type { AiTask } from "./types";

export type EgressResult =
  | { ok: true; payload: Record<string, unknown>; withheld: string | null }
  | { ok: false; reason: string };

/** Upper bounds that keep a payload from smuggling more than the task needs. */
export const EGRESS_LIMITS = {
  mistakes: 40,
  mistakeDescriptionChars: 500,
  mistakeCategoryChars: 60,
  questionParts: 12,
  markSchemePoints: 20,
} as const;

/** Image types the OCR task may send; anything else is refused rather than sent unchecked. */
export const OCR_MEDIA_TYPES = ["image/jpeg", "image/png"] as const;

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, max?: number): string {
  const s = typeof value === "string" ? value : "";
  return max ? s.slice(0, max) : s;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * The question fields the marking prompt actually reads. Authored model
 * answers, provenance, reviewer identities and validation ledgers are not
 * needed to mark and are not sent.
 */
export function minimalMarkQuestion(question: unknown): Record<string, unknown> {
  const q = record(question);
  const parts = Array.isArray(q.parts) ? q.parts.slice(0, EGRESS_LIMITS.questionParts) : [];
  return {
    id: text(q.id),
    subjectId: text(q.subjectId),
    topicIds: strings(q.topicIds).slice(0, 8),
    kind: text(q.kind) || "short",
    stem: text(q.stem),
    totalMarks: typeof q.totalMarks === "number" ? q.totalMarks : 0,
    difficulty: typeof q.difficulty === "number" ? q.difficulty : 3,
    parts: parts.map((part) => {
      const p = record(part);
      return {
        id: text(p.id),
        label: text(p.label),
        prompt: text(p.prompt),
        marks: typeof p.marks === "number" ? p.marks : 0,
        markScheme: strings(p.markScheme).slice(0, EGRESS_LIMITS.markSchemePoints),
      };
    }),
  };
}

/** Mask every answer part; returns the masked map and the per-part results. */
export function maskAnswers(answers: unknown): { masked: Record<string, string>; results: MaskResult[] } {
  const results: MaskResult[] = [];
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(record(answers))) {
    const result = maskPii(typeof value === "string" ? value : "");
    results.push(result);
    masked[key] = result.masked;
  }
  return { masked, results };
}

/**
 * A mistake reduced to what the diagnosis prompt reads: its category and a
 * masked, truncated description. Question ids, attempt ids, timestamps and
 * the learner's raw answer are not sent.
 */
export function minimalMistake(mistake: unknown): { category: string; description: string; resolved: boolean; topicId?: string } {
  const m = record(mistake);
  const topicId = optionalText(m.topicId);
  return {
    category: text(m.category, EGRESS_LIMITS.mistakeCategoryChars),
    description: maskStudentText(text(m.description, EGRESS_LIMITS.mistakeDescriptionChars)),
    resolved: m.resolved === true,
    ...(topicId ? { topicId } : {}),
  };
}

// --- image metadata --------------------------------------------------------

function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Remove EXIF/XMP/IPTC application segments and comments from a JPEG. Phone
 * photographs carry GPS coordinates, device serials and timestamps in APP1;
 * none of that is needed to read handwriting. APP0 (JFIF) and APP14 (Adobe
 * colour transform, needed to decode some files) are kept. Returns null for a
 * file that is not a well-formed JPEG, which the caller refuses to send.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1]!;
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xda) {
      // Start of scan: entropy-coded data follows to EOI; copy verbatim.
      parts.push(bytes.subarray(i));
      return concat(parts);
    }
    if (marker === 0xd9) {
      parts.push(bytes.subarray(i, i + 2));
      return concat(parts);
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(bytes.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 3 >= bytes.length) return null;
    const length = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (length < 2 || i + 2 + length > bytes.length) return null;
    const isMetadata = (marker >= 0xe1 && marker <= 0xed) || marker === 0xef || marker === 0xfe;
    if (!isMetadata) parts.push(bytes.subarray(i, i + 2 + length));
    i += 2 + length;
  }
  return null;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_METADATA_CHUNKS = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

/** Remove text, EXIF and timestamp chunks from a PNG. Null when malformed. */
export function stripPngMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 8 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return null;
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= bytes.length) {
    const length = ((bytes[i]! << 24) >>> 0) + (bytes[i + 1]! << 16) + (bytes[i + 2]! << 8) + bytes[i + 3]!;
    const type = String.fromCharCode(bytes[i + 4]!, bytes[i + 5]!, bytes[i + 6]!, bytes[i + 7]!);
    const end = i + 12 + length;
    if (end > bytes.length) return null;
    if (!PNG_METADATA_CHUNKS.has(type)) parts.push(bytes.subarray(i, end));
    i = end;
    if (type === "IEND") return concat(parts);
  }
  return null;
}

/** Strip metadata from a base64 image; null when the image cannot be sent safely. */
export function stripImageMetadata(base64: string, mediaType: string): string | null {
  if (!(OCR_MEDIA_TYPES as readonly string[]).includes(mediaType)) return null;
  const bytes = decodeBase64(base64);
  if (!bytes) return null;
  const stripped = mediaType === "image/png" ? stripPngMetadata(bytes) : stripJpegMetadata(bytes);
  return stripped ? encodeBase64(stripped) : null;
}

// --- the policy ------------------------------------------------------------

/**
 * Apply the task's egress policy to a payload. Unknown fields are dropped:
 * the output contains only the fields the task's prompt reads.
 */
export function prepareAiEgress(task: AiTask, payload: unknown): EgressResult {
  const p = record(payload);
  switch (task) {
    case "explain": {
      const question = optionalText(p.question);
      return {
        ok: true,
        payload: { topicId: text(p.topicId), ...(question ? { question: maskStudentText(question) } : {}) },
        withheld: question ? maskSummaryMany([maskPii(question)]) : null,
      };
    }
    case "socratic": {
      const history = Array.isArray(p.history)
        ? p.history
            .map((entry) => record(entry))
            .filter((entry) => entry.role === "user" || entry.role === "assistant")
            .map((entry) => ({ role: entry.role as "user" | "assistant", content: text(entry.content) }))
        : [];
      // Socratic-examiner mode: the learner's answer is masked; the dropped
      // mark-scheme points and the authored misconception are content, not
      // learner text, but are bounded and keep only the fields the prompt reads.
      const examiner = p.examiner === undefined ? null : record(p.examiner);
      const answer = examiner ? maskPii(text(examiner.studentAnswer, 8000)) : null;
      const misconception = examiner && examiner.misconception !== undefined ? record(examiner.misconception) : null;
      const strength = examiner?.matchStrength;
      return {
        ok: true,
        payload: {
          topicId: text(p.topicId),
          history: maskChatHistory(history),
          ...(examiner && answer
            ? {
                examiner: {
                  partPrompt: text(examiner.partPrompt, 4000),
                  markScheme: strings(examiner.markScheme).slice(0, 10).map((point) => point.slice(0, 1000)),
                  studentAnswer: answer.masked,
                  ...(misconception
                    ? {
                        misconception: {
                          statement: text(misconception.statement, 1000),
                          explanation: text(misconception.explanation, 2000),
                          correction: text(misconception.correction, 1000),
                        },
                      }
                    : {}),
                  matchStrength: strength === "strong" || strength === "weak" ? strength : "none",
                },
              }
            : {}),
        },
        withheld: maskSummaryMany([
          ...history.filter((e) => e.role === "user").map((e) => maskPii(e.content)),
          ...(answer ? [answer] : []),
        ]),
      };
    }
    case "tutor": {
      const history = Array.isArray(p.history)
        ? p.history
            .slice(-30)
            .map((entry) => record(entry))
            .filter((entry) => entry.role === "user" || entry.role === "assistant")
            .map((entry) => ({ role: entry.role as "user" | "assistant", content: text(entry.content, 4000) }))
        : [];
      const learner = record(p.learner);
      const position = optionalText(learner.position);
      const masteryLine = optionalText(learner.masteryLine);
      const rawMistakes = Array.isArray(learner.openMistakes) ? learner.openMistakes.slice(0, 8) : [];
      const points = rawMistakes.map((m) => maskPii(text(record(m).point, 600)));
      const openMistakes = rawMistakes.map((m, i) => {
        const mistake = record(m);
        return {
          point: points[i]!.masked,
          category: text(mistake.category, 30),
          marksLost: typeof mistake.marksLost === "number" ? Math.max(0, Math.min(60, mistake.marksLost)) : 0,
        };
      });
      return {
        ok: true,
        payload: {
          topicId: text(p.topicId),
          history: maskChatHistory(history),
          learner: {
            ...(position ? { position: position.slice(0, 200) } : {}),
            ...(masteryLine ? { masteryLine: masteryLine.slice(0, 200) } : {}),
            openMistakes,
          },
        },
        withheld: maskSummaryMany([
          ...history.filter((e) => e.role === "user").map((e) => maskPii(e.content)),
          ...points,
        ]),
      };
    }
    case "mark": {
      const { masked, results } = maskAnswers(p.answers);
      return {
        ok: true,
        payload: { question: minimalMarkQuestion(p.question), answers: masked },
        withheld: maskSummaryMany(results),
      };
    }
    case "generate-cards":
      return { ok: true, payload: { topicId: text(p.topicId), ...(typeof p.count === "number" ? { count: p.count } : {}) }, withheld: null };
    case "generate-questions":
      return {
        ok: true,
        payload: {
          topicId: text(p.topicId),
          ...(typeof p.count === "number" ? { count: p.count } : {}),
          ...(typeof p.difficulty === "number" ? { difficulty: p.difficulty } : {}),
        },
        withheld: null,
      };
    case "summarise":
      return { ok: true, payload: { topicId: text(p.topicId) }, withheld: null };
    case "diagnose": {
      const raw = Array.isArray(p.mistakes) ? p.mistakes.slice(0, EGRESS_LIMITS.mistakes) : [];
      const descriptions = raw.map((m) => maskPii(text(record(m).description, EGRESS_LIMITS.mistakeDescriptionChars)));
      return {
        ok: true,
        payload: { topicIds: strings(p.topicIds).slice(0, 20), mistakes: raw.map(minimalMistake) },
        withheld: maskSummaryMany(descriptions),
      };
    }
    case "extract-questions":
    case "route-spec": {
      const body = text(p.text);
      return {
        ok: true,
        payload: { subjectId: text(p.subjectId), text: maskStudentText(body) },
        withheld: maskSummaryMany([maskPii(body)]),
      };
    }
    case "cards-from-notes": {
      const body = text(p.text);
      const topicId = optionalText(p.topicId);
      const subjectId = optionalText(p.subjectId);
      return {
        ok: true,
        payload: {
          text: maskStudentText(body),
          ...(typeof p.count === "number" ? { count: p.count } : {}),
          ...(topicId ? { topicId } : {}),
          ...(subjectId ? { subjectId } : {}),
        },
        withheld: maskSummaryMany([maskPii(body)]),
      };
    }
    case "ocr": {
      const mediaType = text(p.mediaType) || "image/jpeg";
      const image = stripImageMetadata(text(p.image), mediaType);
      if (!image) {
        return {
          ok: false,
          reason: "That photo could not be prepared safely for transcription. Use a JPEG or PNG photo, or type the answer instead.",
        };
      }
      const hint = p.hint === "handwriting" || p.hint === "printed" ? p.hint : "auto";
      return { ok: true, payload: { image, mediaType, hint }, withheld: null };
    }
    case "diagnose-error": {
      const prompt = text(p.prompt);
      const point = text(p.point);
      const answer = text(p.answer);
      return {
        ok: true,
        payload: {
          prompt: maskStudentText(prompt),
          point: maskStudentText(point),
          answer: maskStudentText(answer),
          awarded: typeof p.awarded === "number" ? p.awarded : 0,
          maxMarks: typeof p.maxMarks === "number" ? p.maxMarks : 0,
          ...(typeof p.command === "string" || p.command === null ? { command: p.command } : {}),
        },
        withheld: maskSummaryMany([maskPii(answer)]),
      };
    }
  }
}
