// The public WJEC A-level Physics guides: a hub, past-paper questions by topic,
// the definitions to learn and the data-booklet constants. They exist so a
// student searching for WJEC Physics can find Revise; every fact on them is
// read from the data the app itself uses, so they cannot drift from it.
//
// What they may claim follows the current trust position (AGENTS.md, "Current
// honest position"): the curriculum, lessons and past-paper classification are
// authored and unreviewed, and no question has been human-reviewed. They never
// show a check's answer, a model answer, a lesson trap or the question bank.
//
// The curriculum's own spec refs ("Unit 3.4(b)") are deliberately not printed:
// they follow the app's grouping, not WJEC's unit numbering. Units here come
// from the past-paper index, which records the real unit of every paper.

import { BOOKLET_SOURCE_NOTE, constantsSheetFor } from "@/content/booklets/constants";
import { pastPaperIndexFor } from "@/content/past-papers";
import { TAUGHT_SPEC_POINT_IDS } from "@/content/teaching/taught-spec-points";
import { teachingFor } from "@/content/teaching";
import { topicsFor } from "@/domain/curriculum";
import { pastPaperCoverage, type PastPaperCoverageRow, type PastPaperIndex } from "@/domain/past-paper-coverage";
import type { SpecPoint, Topic } from "@/domain/types";
import { SITE } from "@/lib/site";
import type { StaticBlock, StaticPage } from "@/lib/static-page";

const SUBJECT_ID = "wjec-alevel-physics";
const WJEC_PHYSICS_URL = "https://www.wjec.co.uk/qualifications/physics-as-a-level/";
const WJEC_QUESTION_BANK_URL = "https://questionbank.wjec.co.uk/";

export const PHYSICS_GUIDE_PATHS = [
  "/wjec-a-level-physics",
  "/wjec-a-level-physics/past-papers",
  "/wjec-a-level-physics/definitions",
  "/wjec-a-level-physics/data-booklet",
] as const;
export type PhysicsGuidePath = (typeof PHYSICS_GUIDE_PATHS)[number];
const [HUB, PAST_PAPERS, DEFINITIONS, DATA_BOOKLET] = PHYSICS_GUIDE_PATHS;

const RELATED: StaticPage["related"] = [
  { label: "WJEC A-level Physics", path: HUB },
  { label: "Past paper questions by topic", path: PAST_PAPERS },
  { label: "Definitions", path: DEFINITIONS },
  { label: "Data booklet", path: DATA_BOOKLET },
  { label: "What Revise can and cannot do yet", path: "/welcome" },
  { label: "Pricing", path: "/pricing" },
];

function related(self: PhysicsGuidePath): StaticPage["related"] {
  return RELATED.filter((link) => link.path !== self);
}

function topics(): Topic[] {
  return [...topicsFor(SUBJECT_ID)].sort((a, b) => a.order - b.order);
}

function pastPapers(): PastPaperIndex {
  const index = pastPaperIndexFor(SUBJECT_ID);
  if (!index) throw new Error(`No past-paper index for ${SUBJECT_ID}`);
  return index;
}

function topicLink(topic: Pick<Topic, "id" | "title">): string {
  return `[${topic.title}](/library?topic=${topic.id})`;
}

function lessonLink(topic: Topic, point: SpecPoint, label: string): string {
  return `[${label}](/lesson?subject=${SUBJECT_ID}&topic=${topic.id}&checkpoint=${point.id})`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function yearSpan(years: readonly number[]): string {
  return years.length ? `${years[0]}–${years[years.length - 1]}` : "";
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const SUPERSCRIPT: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };

const SUBSCRIPT: Record<string, string> = { "0": "₀", e: "ₑ", p: "ₚ", n: "ₙ" };

/** "10^-19" → "10⁻¹⁹", so a value reads correctly in HTML and markdown alike. */
export function superscriptPowers(text: string): string {
  return text.replace(/\^(-?\d+)/g, (_, power: string) => [...power].map((c) => SUPERSCRIPT[c]).join(""));
}

/** "ε0" → "ε₀", "m_e" → "mₑ"; a subscript Unicode lacks ("N_A") just loses its underscore. */
function symbolText(symbol: string): string {
  return symbol.replace(/_?([0epn])$/, (match, c: string) => (match.startsWith("_") || c === "0" ? SUBSCRIPT[c] : match)).replace("_", "");
}

/** WJEC units whose papers examined each topic, from the paper each question sits in. */
function unitsByTopic(index: PastPaperIndex): Map<string, number[]> {
  const units = new Map<string, Set<number>>();
  for (const paper of index.papers) {
    for (const question of paper.questions) {
      for (const topicId of question.topicIds) {
        if (!units.has(topicId)) units.set(topicId, new Set());
        units.get(topicId)!.add(paper.unit);
      }
    }
  }
  return new Map([...units].map(([topicId, set]) => [topicId, [...set].sort((a, b) => a - b)]));
}

function unitTitles(index: PastPaperIndex): { unit: number; level: string; title: string }[] {
  const seen = new Map<number, { unit: number; level: string; title: string }>();
  for (const paper of index.papers) if (!seen.has(paper.unit)) seen.set(paper.unit, { unit: paper.unit, level: paper.level, title: paper.unitTitle });
  return [...seen.values()].sort((a, b) => a.unit - b.unit);
}

function refsList(row: PastPaperCoverageRow): string[] {
  return row.refs.map((ref) => `[${ref.label}](${ref.href}): ${plural(ref.marks, "mark")}`);
}

/** Spec points that ask for a definition or a stated law, in course order. */
export function definitionPoints(): { topic: Topic; point: SpecPoint }[] {
  return topics().flatMap((topic) =>
    (topic.specPoints ?? []).filter((point) => /^(define|state)\b/i.test(point.text) && teachingFor(point.id)).map((point) => ({ topic, point })),
  );
}

// --- the hub --------------------------------------------------------------

function hub(): StaticPage {
  const index = pastPapers();
  const all = topics();
  const coverage = pastPaperCoverage(index, all);
  const units = unitsByTopic(index);
  const span = yearSpan(coverage.years);
  const specPoints = all.flatMap((topic) => topic.specPoints ?? []);
  const taught = specPoints.filter((point) => TAUGHT_SPEC_POINT_IDS.includes(point.id)).length;
  const options = coverage.topics.filter((row) => row.optionOnly);
  const paperUnits = unitTitles(index);
  const atLevel = (level: string) => paperUnits.filter((unit) => unit.level === level).length;

  const blocks: StaticBlock[] = [
    {
      heading: "How the course is examined",
      paragraphs: [
        `The written papers cover ${plural(paperUnits.length, "unit")}: ${atLevel("AS")} at AS and ${atLevel("A2")} at A2. Revise has indexed every question from ${plural(coverage.papers, "paper")} sat in ${span}, ${plural(coverage.questions, "question")} in all.`,
      ],
      items: [
        ...paperUnits.map((unit) => `**Unit ${unit.unit}** (${unit.level}): ${unit.title}`),
        ...(options.length ? [`Unit 4 ends with a choice of option; you answer one: ${options.map((row) => row.title).join(", ")}.`] : []),
      ],
    },
    {
      heading: "Every topic, most examined first",
      paragraphs: [`How often each topic has come up in ${span}. A question can assess more than one topic, so marks overlap between rows.`],
      table: {
        head: ["Topic", "Years examined", "Questions", "Marks", "Units"],
        numeric: [1, 2, 3],
        rows: coverage.topics.map((row) => [
          topicLink({ id: row.key, title: row.title }),
          `${row.years} of ${coverage.years.length}`,
          String(row.questions),
          String(row.marks),
          (units.get(row.key) ?? []).join(", "),
        ]),
      },
    },
    { heading: "What each topic covers" },
    ...all.map((topic) => ({
      heading: topic.title,
      sub: true,
      paragraphs: [topic.summary],
      items: topic.commonErrors.length ? topic.commonErrors.map((error) => `Common error: ${error}`) : undefined,
    })),
  ];
  if (coverage.gaps.length) {
    blocks.push({
      heading: "Examined, but not yet a topic in Revise",
      paragraphs: ["The papers examine this content and Revise has no topic for it yet. Revise it from your textbook."],
      items: coverage.gaps.map((row) => `${row.title}: ${plural(row.questions, "question")} in ${span}`),
    });
  }
  blocks.push(
    {
      heading: "What Revise covers today",
      honest: true,
      paragraphs: [
        SITE.trustPosition,
        `Lessons are written for ${taught} of the ${specPoints.length} Physics specification statements in Revise. They are not yet teacher-reviewed. Which topics each past-paper question assesses is Revise's own classification and is not reviewed either.`,
      ],
    },
    {
      heading: "Revise it",
      paragraphs: [
        `[Open Revise](/) to get the one most useful thing to do next, spaced repetition for what you are about to forget, and exam-style questions marked point by point. It is free, needs no account and keeps your work on your device.`,
        `Then practise with [past paper questions by topic](${PAST_PAPERS}), learn the [definitions](${DEFINITIONS}) and check the [data booklet constants](${DATA_BOOKLET}).`,
      ],
    },
  );

  return {
    path: HUB,
    title: "WJEC A-level Physics revision: every topic by unit",
    heading: "WJEC A-level Physics revision",
    description: `Every WJEC A-level Physics topic, how often it came up in the ${span} papers, and the common errors to avoid. Free, with honest coverage.`,
    lead: `Every topic in WJEC AS and A level Physics, ranked by how often the ${span} papers examined it, with the common errors to avoid.`,
    blocks,
    related: related(HUB),
  };
}

// --- past papers ------------------------------------------------------------

function pastPaperPage(): StaticPage {
  const index = pastPapers();
  const coverage = pastPaperCoverage(index, topics());
  const span = yearSpan(coverage.years);

  const blocks: StaticBlock[] = [
    {
      heading: "Where these links go",
      honest: true,
      paragraphs: [
        `No WJEC question or mark-scheme text is reproduced here. Every link goes to WJEC's own PDF (checked ${index.retrievedAt}). Which topics a question assesses is Revise's own classification and has not been reviewed.`,
        `WJEC's [Question Bank](${WJEC_QUESTION_BANK_URL}) also builds practice papers from past questions.`,
      ],
    },
    { heading: "Papers by unit" },
    ...unitTitles(index).map((unit) => ({
      heading: `Unit ${unit.unit} (${unit.level}): ${unit.title}`,
      sub: true,
      table: {
        head: ["Year", "Component", "Marks", "Links"],
        numeric: [0, 2],
        rows: index.papers
          .filter((paper) => paper.unit === unit.unit)
          .sort((a, b) => b.year - a.year)
          .map((paper) => [
            `${paper.year} ${paper.series}`,
            paper.componentCode,
            String(paper.totalMarks),
            [paper.paperUrl ? `[Question paper](${paper.paperUrl})` : null, `[Mark scheme](${paper.markSchemeUrl})`].filter(Boolean).join(" · "),
          ]),
      },
    })),
    {
      heading: "Questions by topic",
      paragraphs: [`Every indexed question from ${span}, grouped by the topic it assesses, most examined topic first. Each link opens the paper, or its mark scheme where WJEC has not published the paper.`],
    },
    ...coverage.topics.map((row) => ({
      heading: row.title,
      sub: true,
      paragraphs: [`Examined in ${row.years} of ${coverage.years.length} years: ${plural(row.questions, "question")}, ${row.marks} marks.${row.optionOnly ? " Only ever as a Unit 4 option." : ""} [Revise this topic](/library?topic=${row.key}).`],
      items: refsList(row),
    })),
  ];
  if (coverage.gaps.length) {
    blocks.push({ heading: "Questions on content Revise has no topic for" });
    blocks.push(...coverage.gaps.map((row) => ({ heading: row.title, sub: true, items: refsList(row) })));
  }

  return {
    path: PAST_PAPERS,
    title: "WJEC A-level Physics past paper questions by topic",
    heading: "WJEC A-level Physics past paper questions by topic",
    description: `All ${coverage.questions} questions from ${coverage.papers} WJEC AS and A level Physics papers (${span}), sorted by unit and by topic, with links to WJEC's papers and mark schemes.`,
    lead: `Every question from the ${span} WJEC AS and A level Physics written papers, by unit and by topic, linked to WJEC's own papers and mark schemes.`,
    blocks,
    related: related(PAST_PAPERS),
  };
}

// --- definitions ------------------------------------------------------------

function definitionsPage(): StaticPage {
  const points = definitionPoints();
  const blocks: StaticBlock[] = [
    {
      heading: "Before you learn these",
      honest: true,
      paragraphs: [
        "These explanations are written by Revise and are not yet teacher-reviewed. Marks go to the wording in WJEC's specification and mark schemes, so check each one against them.",
      ],
    },
  ];
  let current: string | null = null;
  for (const { topic, point } of points) {
    if (topic.id !== current) {
      blocks.push({ heading: topic.title });
      current = topic.id;
    }
    blocks.push({
      heading: capitalise(point.text),
      sub: true,
      paragraphs: [...teachingFor(point.id)!.explain, lessonLink(topic, point, "Learn and practise this in Revise")],
    });
  }

  return {
    path: DEFINITIONS,
    title: "WJEC A-level Physics definitions to learn",
    heading: "WJEC A-level Physics definitions",
    description: `The ${points.length} definitions and laws WJEC A-level Physics asks you to state, written out with equations and units, each linked to practice.`,
    lead: `WJEC A-level Physics asks you to define or state these ${points.length} terms and laws in words. A data booklet gives you equations, not these.`,
    blocks,
    related: related(DEFINITIONS),
  };
}

// --- data booklet -----------------------------------------------------------

function dataBookletPage(): StaticPage {
  const sheet = constantsSheetFor(SUBJECT_ID);
  if (!sheet) throw new Error(`No constants sheet for ${SUBJECT_ID}`);
  const withEquations = topics()
    .map((topic) => ({ topic, lines: topic.keyPoints.filter((point) => point.includes("=")) }))
    .filter((entry) => entry.lines.length);

  return {
    path: DATA_BOOKLET,
    title: "WJEC A-level Physics data booklet: constants and equations",
    heading: "WJEC A-level Physics data booklet",
    description: `The ${sheet.constants.length} physical constants and the key equations by topic for WJEC A-level Physics, so you know what the data booklet gives you and what to learn.`,
    lead: "Every WJEC A-level Physics paper comes with a data booklet. Here are the physical constants and the key relationships by topic, so you know what to look up and what to learn.",
    blocks: [
      {
        heading: "This is not WJEC's booklet",
        honest: true,
        paragraphs: [`${BOOKLET_SOURCE_NOTE} Get it from WJEC's [AS and A level Physics page](${WJEC_PHYSICS_URL}).`],
      },
      {
        heading: "Physical constants",
        table: {
          head: ["Constant", "Symbol", "Value", "Unit"],
          rows: sheet.constants.map((constant) => [constant.name, symbolText(constant.symbol), superscriptPowers(constant.value), superscriptPowers(constant.unit)]),
        },
      },
      {
        heading: "Key relationships by topic",
        paragraphs: ["Revise's own summaries of each topic's main equations, with what they mean. Learn what each symbol stands for: the booklet will not tell you which equation a question needs."],
      },
      ...withEquations.map(({ topic, lines }) => ({ heading: topic.title, sub: true, items: [...lines, `[Revise this topic](/library?topic=${topic.id})`] })),
      {
        heading: "What a data booklet will not give you",
        paragraphs: [`Definitions and laws you are asked to state in words. [Learn the WJEC Physics definitions](${DEFINITIONS}).`],
      },
    ],
    related: related(DATA_BOOKLET),
  };
}

const BUILDERS: Record<PhysicsGuidePath, () => StaticPage> = {
  [HUB]: hub,
  [PAST_PAPERS]: pastPaperPage,
  [DEFINITIONS]: definitionsPage,
  [DATA_BOOKLET]: dataBookletPage,
};

const built = new Map<PhysicsGuidePath, StaticPage>();

/** A guide page, built once per process: its content changes only with a deploy. */
export function physicsGuide(path: PhysicsGuidePath): StaticPage {
  let page = built.get(path);
  if (!page) {
    page = BUILDERS[path]();
    built.set(path, page);
  }
  return page;
}
