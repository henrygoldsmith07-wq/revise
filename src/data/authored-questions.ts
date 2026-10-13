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
import { tombstoneKey } from "@/domain/sync-tombstone";
import { getDb, wireTombstoneCheck } from "./db";
import { isBankMessage } from "./content-bank-protocol";

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

/**
 * The bank chunk could not be fetched: opened offline before the service
 * worker had cached it, or a deploy replaced it mid-session. Nothing on the
 * device is wrong, so this must never be presented as damaged storage.
 */
export class ContentBankUnavailableError extends Error {
  constructor(cause: unknown) {
    super("The question bank has not been downloaded to this device yet.", { cause });
    this.name = "ContentBankUnavailableError";
  }
}

export function isContentBankUnavailable(error: unknown): error is ContentBankUnavailableError {
  return error instanceof ContentBankUnavailableError;
}

function importBank(): Promise<readonly Question[]> {
  return import("@/content").then((content) => content.seedQuestions);
}

// Building the bank is ~1 s of JavaScript on a normal phone CPU and ~3.6 s at
// 4× throttling (nineteenth pass, 2026-10-13). For a fresh profile that ran on
// the main thread while onboarding was open, so the first taps waited for it.
// A fresh profile now builds it in a dedicated worker, which posts the
// plain-data questions back once (structured clone keeps them identical; the
// main thread only pays the deserialisation). Anything that stops the worker
// (no Worker support, a CSP or bundling surprise, an error, no answer) falls
// back to the main-thread import, so the worker can never leave a student
// without questions.
//
// A returning visit keeps the main-thread import on purpose: it shows a boot
// screen with nothing to tap, and the worker delivered the bank later than the
// main thread builds it (no V8 code cache for the worker's copy of the chunk:
// returning visit ~1.45 s vs ~1.2 s to Today at 1× CPU, measured). Where the
// worker helps is keeping onboarding responsive, not raw speed.

/** Generous: a slow phone builds the bank in seconds, not tens of seconds. */
export const BANK_WORKER_TIMEOUT_MS = 30_000;

let bankSource: "worker" | "main-thread" | null = null;

/** How this page got its bank (diagnostics and e2e): built in the worker or on the main thread. */
export function authoredBankSource(): "worker" | "main-thread" | null {
  return bankSource;
}

function bankFromWorker(): Promise<readonly Question[]> | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  let worker: Worker;
  try {
    worker = new Worker(new URL("../worker/content-bank.worker.ts", import.meta.url), { type: "module", name: "content-bank" });
  } catch {
    return null;
  }
  return new Promise<readonly Question[]>((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error("The content-bank worker did not answer."));
    }, BANK_WORKER_TIMEOUT_MS);
    worker.onmessage = (event: MessageEvent<unknown>) => {
      finish();
      if (isBankMessage(event.data)) resolve(event.data.questions);
      else reject(new Error("The content-bank worker could not build the bank."));
    };
    worker.onmessageerror = () => {
      finish();
      reject(new Error("The content-bank worker's answer could not be read."));
    };
    worker.onerror = (event) => {
      // Handled here (main-thread fallback); keep it out of the console as an uncaught error.
      event.preventDefault();
      finish();
      reject(new Error("The content-bank worker failed to start."));
    };
  });
}

function noteSource(source: "worker" | "main-thread"): void {
  bankSource = source;
  // Observable in a real browser (e2e asserts the worker path); display-free.
  if (typeof document !== "undefined") document.documentElement.dataset.questionBank = source;
}

function mainThreadBank(): Promise<readonly Question[]> {
  return importBank().then((questions) => {
    noteSource("main-thread");
    return questions;
  });
}

function fetchBank(inWorker: boolean): Promise<readonly Question[]> {
  const viaWorker = inWorker ? bankFromWorker() : null;
  if (!viaWorker) return mainThreadBank();
  return viaWorker.then(
    (questions) => {
      noteSource("worker");
      return questions;
    },
    () => mainThreadBank(),
  );
}

function requestBank(inWorker: boolean): Promise<readonly Question[]> {
  bank ??= fetchBank(inWorker)
    .catch(() => mainThreadBank())
    .catch((error: unknown) => {
      bank = null;
      throw new ContentBankUnavailableError(error);
    });
  return bank;
}

/**
 * The current authored question bank. One request per page load (whichever
 * started it, this or startAuthoredQuestionsInWorker); a failed request (a
 * chunk that was never cached, opened offline) is retried once on the main
 * thread and then forgotten, so a later call can try again instead of
 * replaying the error.
 */
export function loadAuthoredQuestions(): Promise<readonly Question[]> {
  return requestBank(false);
}

/**
 * Start building the bank in its worker, for a fresh profile whose onboarding
 * is on screen: the main thread stays free for the student's taps. Later
 * loadAuthoredQuestions() calls share this request. Without Worker support it
 * imports on the main thread, as before.
 */
export function startAuthoredQuestionsInWorker(): void {
  void requestBank(true).catch(() => undefined);
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
  // No wire tombstone for questions (the usual case): no per-question SHA-256.
  const wireDeleted = wireTombstoneCheck("questions", deleted, userId);
  const authored = seedQuestions.filter(
    (question) => !deleted.has(tombstoneKey("questions", question.id)) && !wireDeleted(question.id),
  );
  return { questions: [...authored, ...(stored as Question[])].sort(byKey), stored };
}
