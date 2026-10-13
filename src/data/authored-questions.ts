// ---------------------------------------------------------------------------
// Authored (shared curriculum) questions are served from the shipped bundle,
// not from a per-device IndexedDB copy (fifteenth pass, 2026-10-12).
//
// Until this pass every device copied the whole authored bank (~4k questions,
// ~15 MB) into the `questions` store at first boot, and `putMissing` never
// overwrote a copy. Two consequences:
//   - A fresh profile waited ~2-3 s for that write before Today appeared, and
//     every boot read the copy back (~0.6 s).
//   - A device that installed the bank kept that version for good, so a
//     corrected mark scheme or a new "do not accept" rule never reached it.
//
// Shared questions carry no learner state (FSRS state lives on cards, history
// on attempts), never sync (only private questions do, see
// question-ownership.ts), and are already in the offline JS bundle, so the
// bundle is the source of truth for them. The `questions` store keeps what
// cannot be reproduced from the bundle: private questions (AI-generated,
// imported past papers) and retired authored rows. Nothing on disk is
// rewritten or dropped: an old device's installed copies stay where they are
// and are simply superseded on read by the current authored version.
//
// A local or wire tombstone on an authored id still hides it, exactly as it
// stopped putMissing re-installing it.
// ---------------------------------------------------------------------------

import type { Id, Question } from "@/domain/types";
import { tombstoneKey, wireTombstoneKey } from "@/domain/sync-tombstone";
import { syncWireIdValue } from "./sync-contract";
import { getDb } from "./db";

// The authored bank (~3.6 MB of the client bundle) is loaded on demand rather
// than statically imported (seventeenth pass, 2026-10-13). Statically importing
// `@/content` from the app shell put the whole bank in the "/" entry chunk, so
// the landing and onboarding screens could not paint until a phone had
// downloaded, parsed and evaluated it. Every learner still needs it before
// Today (the snapshot serves it), so it is requested as soon as the store
// starts loading; the service worker caches the chunk like any other script,
// so it keeps working offline. Only the questions come from here: misconceptions
// and seed cards are imported from their own small modules.

let bank: Promise<readonly Question[]> | null = null;
let authoredIds: Set<string> | null = null;

function importBank(): Promise<readonly Question[]> {
  return import("@/content").then((content) => content.seedQuestions);
}

/**
 * The current authored question bank. One request per page load; a failed
 * request (a chunk that was never cached, opened offline) is retried once and
 * then forgotten, so a later call can try again instead of replaying the error.
 */
export function loadAuthoredQuestions(): Promise<readonly Question[]> {
  bank ??= importBank()
    .catch(() => importBank())
    .catch((error: unknown) => {
      bank = null;
      throw error;
    });
  return bank;
}

/** Start fetching the bank without waiting for it (it is needed before Today). */
export function preloadAuthoredQuestions(): void {
  void loadAuthoredQuestions().catch(() => undefined);
}

/** Ids of the questions shipped in the current bundle. */
export async function loadAuthoredQuestionIds(): Promise<ReadonlySet<string>> {
  const questions = await loadAuthoredQuestions();
  authoredIds ??= new Set(questions.map((question) => question.id));
  return authoredIds;
}

/** IndexedDB's primary-key order for string keys (UTF-16 code units), which getAll() returned. */
function byKey(a: Question, b: Question): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export interface QuestionRows {
  /** What the snapshot serves: current authored questions plus stored private/retired rows, in key order. */
  questions: Question[];
  /** Only the rows read from the store (for persisted-row validation). */
  stored: unknown[];
}

/**
 * Read the question set for a profile: every current authored question that
 * is not tombstoned, plus stored rows whose ids are not in the bundle. Stored
 * copies of authored ids are not read at all (keys only).
 */
export async function loadQuestionRows(userId: Id): Promise<QuestionRows> {
  // Resolve the bank before opening the transaction: an IndexedDB transaction
  // commits itself if it is left waiting on anything that is not a request.
  const [seedQuestions, ids] = await Promise.all([loadAuthoredQuestions(), loadAuthoredQuestionIds()]);
  const db = await getDb();
  const tx = db.transaction(["questions", "meta"], "readonly");
  const [keys, deletedKeys] = await Promise.all([
    tx.objectStore("questions").getAllKeys(),
    // Both tombstone families ("revise.deleted.v1:" and "revise.deletedWire.v1:") share this prefix.
    tx.objectStore("meta").getAllKeys(IDBKeyRange.bound("revise.deleted", "revise.deleted\uffff")),
  ]);
  const own = keys.map(String).filter((id) => !ids.has(id));
  const stored = (await Promise.all(own.map((id) => tx.objectStore("questions").get(id)))).filter(
    (row): row is NonNullable<typeof row> => row !== undefined,
  ) as unknown[];
  await tx.done;
  const deleted = new Set(deletedKeys.map(String));
  const authored = seedQuestions.filter(
    (question) =>
      !deleted.has(tombstoneKey("questions", question.id)) &&
      !deleted.has(wireTombstoneKey("questions", syncWireIdValue(userId, question.id))),
  );
  return { questions: [...authored, ...(stored as Question[])].sort(byKey), stored };
}
