import type { ExamBoard, Id, Qualification, Subject, Topic, Unit } from "../types";

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

export function registerSubject(entry: CurriculumModule): CurriculumModule {
  modules.set(entry.subject.id, entry);
  return entry;
}

export function allBoards(): ExamBoard[] {
  return [...boards.values()];
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
