import type { Id, Topic } from "./types";

// ---------------------------------------------------------------------------
// Past-paper coverage: which real exam questions have assessed each topic.
//
// The index (src/content/past-papers) maps every question of the official
// written papers onto the topic tree: number, marks and assessment-objective
// split from the mark scheme's own summary grid, and an authored topic
// classification. It holds no question text — every reference is a link to
// the board's own PDF.
//
// What it is for: telling a student how often, and for how many marks, a topic
// has actually come up, and showing where the app's topic tree has nothing for
// content the papers examine. What it is not: a prediction, a trust tier or
// evidence about the learner. It never feeds mastery, proof or ranking.
// ---------------------------------------------------------------------------

export interface PastPaperQuestionEntry {
  number: number;
  marks: number;
  /** AO1, AO2, AO3 marks, as printed in the mark scheme's summary grid. */
  ao: [number, number, number];
  mathsMarks: number;
  practicalMarks: number;
  /** Topics the question assesses, most-assessed first. May be empty. */
  topicIds: Id[];
  /** Examined content the app's topic tree has no topic for. */
  notInTopicTree?: string[];
  /** Section B option letter: a candidate answers one option, not all. */
  option?: "A" | "B" | "C" | "D";
}

export interface PastPaperEntry {
  id: string;
  unit: number;
  level: "AS" | "A2";
  unitTitle: string;
  componentCode: string;
  year: number;
  series: string;
  totalMarks: number;
  markSchemeUrl: string;
  markSchemeSha256: string;
  /** Present only when the board publishes the question paper itself. */
  paperUrl?: string;
  questions: PastPaperQuestionEntry[];
}

export interface PastPaperIndex {
  formatVersion: 1;
  subjectId: Id;
  board: string;
  specification: string;
  retrievedAt: string;
  classification: "authored-unreviewed";
  papers: PastPaperEntry[];
}

export interface PastPaperRef {
  paperId: string;
  label: string;
  year: number;
  number: number;
  marks: number;
  option?: PastPaperQuestionEntry["option"];
  /** The question paper when published, otherwise the mark scheme. */
  href: string;
  markSchemeUrl: string;
}

export interface PastPaperCoverageRow {
  key: string;
  title: string;
  /** Distinct papers with at least one question on it. */
  papers: number;
  /** Distinct exam years with at least one question on it. */
  years: number;
  questions: number;
  /** Total marks of the questions that assess it (a question can assess several topics). */
  marks: number;
  lastYear: number;
  /** Only ever examined as a Section B option. */
  optionOnly: boolean;
  refs: PastPaperRef[];
}

export interface PastPaperCoverage {
  papers: number;
  years: number[];
  questions: number;
  /** Topics in the tree, most often examined first. */
  topics: PastPaperCoverageRow[];
  /** Examined content with no topic in the tree. */
  gaps: PastPaperCoverageRow[];
  /** Topics in the tree that no indexed question assessed. */
  unexamined: { topicId: Id; title: string }[];
}

function refFor(paper: PastPaperEntry, question: PastPaperQuestionEntry): PastPaperRef {
  return {
    paperId: paper.id,
    label: `${paper.year} Unit ${paper.unit} Q${question.number}${question.option ? ` (Option ${question.option})` : ""}`,
    year: paper.year,
    number: question.number,
    marks: question.marks,
    option: question.option,
    href: paper.paperUrl ?? paper.markSchemeUrl,
    markSchemeUrl: paper.markSchemeUrl,
  };
}

function byFrequency(a: PastPaperCoverageRow, b: PastPaperCoverageRow): number {
  return b.years - a.years || b.marks - a.marks || a.title.localeCompare(b.title);
}

export function pastPaperCoverage(index: PastPaperIndex, topics: readonly Pick<Topic, "id" | "title">[]): PastPaperCoverage {
  const titles = new Map(topics.map((topic) => [topic.id, topic.title] as const));
  const rows = new Map<string, PastPaperCoverageRow & { paperIds: Set<string>; yearSet: Set<number>; compulsory: boolean }>();
  const row = (key: string, title: string) => {
    let found = rows.get(key);
    if (!found) {
      found = {
        key, title, papers: 0, years: 0, questions: 0, marks: 0, lastYear: 0, optionOnly: true, refs: [],
        paperIds: new Set(), yearSet: new Set(), compulsory: false,
      };
      rows.set(key, found);
    }
    return found;
  };

  let questions = 0;
  for (const paper of index.papers) {
    for (const question of paper.questions) {
      questions++;
      const keys = [
        ...question.topicIds.filter((id) => titles.has(id)).map((id) => ({ key: id, title: titles.get(id)! })),
        ...(question.notInTopicTree ?? []).map((area) => ({ key: `gap:${area}`, title: area })),
      ];
      for (const { key, title } of keys) {
        const target = row(key, title);
        target.paperIds.add(paper.id);
        target.yearSet.add(paper.year);
        target.questions++;
        target.marks += question.marks;
        target.lastYear = Math.max(target.lastYear, paper.year);
        if (!question.option) target.compulsory = true;
        target.refs.push(refFor(paper, question));
      }
    }
  }

  const finished = [...rows.values()].map(({ paperIds, yearSet, compulsory, ...rest }) => ({
    ...rest,
    papers: paperIds.size,
    years: yearSet.size,
    optionOnly: !compulsory,
    refs: rest.refs.sort((a, b) => b.year - a.year || a.label.localeCompare(b.label)),
  }));
  const examined = new Set(finished.map((r) => r.key));

  return {
    papers: index.papers.length,
    years: [...new Set(index.papers.map((paper) => paper.year))].sort((a, b) => a - b),
    questions,
    topics: finished.filter((r) => !r.key.startsWith("gap:")).sort(byFrequency),
    gaps: finished.filter((r) => r.key.startsWith("gap:")).sort(byFrequency),
    unexamined: topics.filter((topic) => !examined.has(topic.id)).map((topic) => ({ topicId: topic.id, title: topic.title })),
  };
}
