import type { ExamBoard, Id, Qualification, Subject, Topic, Unit } from "../types";
import { honestSubject } from "./honesty";

// ---------------------------------------------------------------------------
// The curriculum registry. Boards, qualifications and subjects are *data*, not
// code paths: adding AQA A-level Economics or Edexcel GCSE Maths means adding
// one module that calls `registerSubject` and nothing else in the app changes.
// Everything downstream (planner, recommender, content, AI grounding) reads
// through these lookups.
// ---------------------------------------------------------------------------

export interface CurriculumModule {
  subject: Subject;
  units: Unit[];
  topics: Topic[];
}

const boards = new Map<Id, ExamBoard>();
const qualifications = new Map<Id, Qualification>();
const modules = new Map<Id, CurriculumModule>();

export function registerBoard(board: ExamBoard): ExamBoard {
  boards.set(board.id, board);
  return board;
}

export function registerQualification(q: Qualification): Qualification {
  qualifications.set(q.id, q);
  return q;
}

// --- loading on demand ------------------------------------------------------
//
// Every subject is registered at startup, but a reference subject starts as
// a stub (its catalogue metadata, no units or topics) and its topic tree
// loads when something asks for it: `ensureSubjects` for the subjects a
// learner studies (the store, onboarding, settings), `loadAllSubjects` where
// every subject is needed (server code, scripts, tests, the domain worker).
// Until then `topicsFor` and `unitsFor` return [] and `getTopic` undefined for
// that subject, exactly as for an unknown one.

const loaded = new Set<Id>();
const loaders = new Map<Id, () => Promise<unknown>>();
const pending = new Map<Id, Promise<void>>();
const listeners = new Set<() => void>();

export function registerSubject(entry: CurriculumModule): CurriculumModule {
  const honest = honestSubject(entry);
  modules.set(honest.subject.id, honest);
  loaded.add(honest.subject.id);
  for (const listener of listeners) listener();
  return honest;
}

/** A subject whose topic tree loads on demand: its metadata now, `load` later. */
export function registerSubjectStub(subject: Subject, load: () => Promise<unknown>): void {
  loaders.set(subject.id, load);
  if (!modules.has(subject.id)) modules.set(subject.id, honestSubject({ subject, units: [], topics: [] }));
}

/** Whether a subject's units and topics are registered (always true for a subject without a loader). */
export function isSubjectLoaded(subjectId: Id): boolean {
  return loaded.has(subjectId) || !loaders.has(subjectId);
}

/** Load the topic trees of these subjects, once each; concurrent callers share one load. */
export async function ensureSubjects(subjectIds: Iterable<Id>): Promise<void> {
  const waits: Promise<void>[] = [];
  for (const id of new Set(subjectIds)) {
    const load = loaders.get(id);
    if (!load || loaded.has(id)) continue;
    let wait = pending.get(id);
    if (!wait) {
      wait = load().then(
        () => { pending.delete(id); },
        (error: unknown) => { pending.delete(id); throw error; },
      );
      pending.set(id, wait);
    }
    waits.push(wait);
  }
  await Promise.all(waits);
}

/** Every registered subject's topic tree: for code that works across all subjects. */
export function loadAllSubjects(): Promise<void> {
  return ensureSubjects(loaders.keys());
}

/** Called whenever a subject's topic tree arrives. Returns the unsubscribe. */
export function onSubjectsLoaded(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function allBoards(): ExamBoard[] {
  return [...boards.values()];
}

/** Boards a student can actually enrol on: registered boards that have at
 *  least one subject module. A board row with no content (e.g. Eduqas) is
 *  never offered, so the first screen cannot dead-end. */
export function availableBoards(): ExamBoard[] {
  return allBoards().filter((board) =>
    allQualifications(board.id).some((q) => allSubjects(q.id).length > 0),
  );
}

export function allQualifications(boardId?: Id): Qualification[] {
  const list = [...qualifications.values()];
  return boardId ? list.filter((q) => q.boardId === boardId) : list;
}

export function allSubjects(qualificationId?: Id): Subject[] {
  const list = [...modules.values()].map((entry) => entry.subject);
  return qualificationId ? list.filter((s) => s.qualificationId === qualificationId) : list;
}

export function getSubject(subjectId: Id): Subject | undefined {
  return modules.get(subjectId)?.subject;
}

export function getQualification(id: Id): Qualification | undefined {
  return qualifications.get(id);
}

export function getBoard(id: Id): ExamBoard | undefined {
  return boards.get(id);
}

export function unitsFor(subjectId: Id): Unit[] {
  return [...(modules.get(subjectId)?.units ?? [])].sort((a, b) => a.order - b.order);
}

export function topicsFor(subjectId: Id): Topic[] {
  return [...(modules.get(subjectId)?.topics ?? [])].sort((a, b) => a.order - b.order);
}

export function allTopics(subjectIds?: Id[]): Topic[] {
  const list = [...modules.values()].flatMap((entry) => entry.topics);
  return subjectIds ? list.filter((t) => subjectIds.includes(t.subjectId)) : list;
}

export function getTopic(topicId: Id): Topic | undefined {
  for (const entry of modules.values()) {
    const found = entry.topics.find((t) => t.id === topicId);
    if (found) return found;
  }
  return undefined;
}

/** Grades used by the subject's qualification, best first. */
export function gradesFor(subjectId: Id): string[] {
  const subject = getSubject(subjectId);
  if (!subject) return [];
  return qualifications.get(subject.qualificationId)?.grades ?? [];
}

/** Human label, e.g. "WJEC A Level · Chemistry". */
export function subjectLabel(subjectId: Id): string {
  const subject = getSubject(subjectId);
  if (!subject) return subjectId;
  const q = qualifications.get(subject.qualificationId);
  const board = q ? boards.get(q.boardId) : undefined;
  return [board?.name, q?.level, subject.name].filter(Boolean).join(" · ");
}
