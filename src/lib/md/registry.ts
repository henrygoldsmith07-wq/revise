// The markdown twins: one renderer per HTML route in ./routes.ts, rendering
// from the same data the page uses (the curriculum, the misconception library,
// the authored lesson teaching, the technique drills and the /welcome words),
// never by scraping rendered HTML.
//
// Only public, authored material is mirrored. Learner data lives in the
// browser and never reaches this module; the question bank and its mark
// schemes are deliberately not exposed (no question is human-reviewed yet).
// What the HTML hides until the learner acts (a lesson check's answer, a model
// answer, a trap revealed after recall), the twin does not show either.
//
// Adding a twin for a new page: add the route to MARKDOWN_PAGES in ./routes.ts
// and a renderer to RENDERERS here; list its URLs in listMarkdownRoutes() and
// /llms.txt, /llms-full.txt and /api/md/_catalog pick it up.

import { misconceptionsForTopic } from "@/content/misconceptions";
import { TEACHING } from "@/content/teaching";
import { allSubjects, getSubject, getTopic, subjectLabel, topicsFor, unitsFor } from "@/domain/curriculum";
import { isFlagship } from "@/domain/flagship";
import { TECHNIQUE_CONTEXT, TECHNIQUE_DRILLS } from "@/domain/technique-drills";
import type { SpecPoint, Subject, Topic } from "@/domain/types";
import { SITE } from "@/lib/site";
import { inlineMarkdown, WELCOME } from "@/lib/welcome";
import { absoluteUrl } from "@/lib/site";
import { mdBlock, mdLink, mdList, mdNumbered, mdTable, mdText, renderDocument, type MarkdownDocument } from "./format";
import { htmlUrlFor, MARKDOWN_PAGES, type MarkdownPage } from "./routes";

type Renderer = (query: URLSearchParams) => MarkdownDocument | null;

/** Where a route sits in /llms.txt and /llms-full.txt, in that order. */
export type MarkdownGroup = "core" | "guides" | "lessons" | "curriculum";
export const MARKDOWN_GROUPS: readonly MarkdownGroup[] = ["core", "guides", "lessons", "curriculum"];

export interface MarkdownRoute {
  path: MarkdownPage;
  query: Record<string, string>;
  title: string;
  summary: string;
  group: MarkdownGroup;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NOT_REVIEWED = "Not yet teacher-reviewed: authored lesson content, independent of the exam board.";

function href(path: MarkdownPage, query: Record<string, string> = {}): string {
  return htmlUrlFor(path, new URLSearchParams(query));
}

function firstSentence(text: string): string {
  const sentence = /^.*?[.!?](?=\s|$)/.exec(text.trim())?.[0] ?? text.trim();
  return sentence.length > 220 ? `${sentence.slice(0, 217).trimEnd()}…` : sentence;
}

function subjects(): Subject[] {
  return [...allSubjects()].sort(
    (a, b) => Number(isFlagship(b.id)) - Number(isFlagship(a.id)) || subjectLabel(a.id).localeCompare(subjectLabel(b.id)),
  );
}

function tierNote(subject: Subject): string {
  return isFlagship(subject.id)
    ? "Flagship subject: topics and specification statements are authored to the WJEC specification. No question in it has been through human review yet."
    : subject.contentDisclaimer ?? "Reference material: reuses a flagship outline and has not been checked against this board's specification.";
}

function specPointCount(subjectId: string): number {
  return topicsFor(subjectId).reduce((sum, topic) => sum + (topic.specPoints?.length ?? 0), 0);
}

function taughtPoints(topic: Topic): SpecPoint[] {
  return (topic.specPoints ?? []).filter((point) => TEACHING[point.id]);
}

function subjectsWithTeaching(): Subject[] {
  return subjects().filter((subject) => topicsFor(subject.id).some((topic) => taughtPoints(topic).length));
}

// --- / and /welcome -------------------------------------------------------

function welcomeBody(): string {
  const sections = WELCOME.sections.map((section) => {
    const parts: string[] = [`## ${section.heading}`];
    if ("items" in section && section.items) parts.push(mdList(section.items.map((item) => inlineMarkdown(item, absoluteUrl))));
    if ("paragraphs" in section && section.paragraphs) {
      const paragraphs = section.paragraphs.map((text) => inlineMarkdown(text, absoluteUrl));
      parts.push(section.honest ? paragraphs.map((p) => `> ${p}`).join("\n>\n") : paragraphs.join("\n\n"));
    }
    return parts.join("\n\n");
  });
  return [WELCOME.lead, ...sections, `---\n\n${WELCOME.footer}`].join("\n\n");
}

const home: Renderer = () => ({
  title: SITE.name,
  summary: SITE.aiSummary,
  canonical: "/",
  body: [
    welcomeBody(),
    "## Public content",
    "Everything a learner does in Revise stays in their own browser, so the revision screens (Today, practice, flashcards, the schedule, settings) have no public version. The authored material behind them does:",
    mdList([
      `${mdLink("Library", href("/library"))}: every subject's topics, specification statements, what earns marks, where marks are lost and common misconceptions.`,
      `${mdLink("Lessons", href("/lesson"))}: taught checkpoints, WJEC A-level Physics first. ${NOT_REVIEWED}`,
      `${mdLink("Exam technique drills", href("/technique"))}: describe, explain, evaluate and a 6-mark-style structure.`,
    ]),
  ].join("\n\n"),
  related: [
    { label: "What Revise does, and what it cannot yet do", path: "/welcome" },
    { label: "Revise landing page", path: SITE.landingUrl },
  ],
});

const welcome: Renderer = () => ({
  title: WELCOME.title,
  summary: WELCOME.description,
  canonical: "/welcome",
  body: welcomeBody(),
  related: [
    { label: "Open the app", path: "/" },
    { label: "Library", path: href("/library") },
  ],
});

// --- /library ---------------------------------------------------------------

function libraryIndex(): MarkdownDocument {
  const line = (subject: Subject) =>
    `${mdLink(subjectLabel(subject.id), href("/library", { subject: subject.id }))} - ${topicsFor(subject.id).length} topics, ${specPointCount(subject.id)} specification statements`;
  const all = subjects();
  return {
    title: "Library",
    summary: "Every subject in Revise, with its topics and specification statements. Flagship subjects are authored to their specification; the rest are reference material.",
    canonical: "/library",
    body: [
      SITE.trustPosition,
      "## Flagship subjects",
      mdList(all.filter((s) => isFlagship(s.id)).map(line)),
      "## Reference subjects",
      "These reuse a flagship outline for navigation and are labelled reference material in the app.",
      mdList(all.filter((s) => !isFlagship(s.id)).map(line)),
    ].join("\n\n"),
    related: [
      { label: "Lessons", path: href("/lesson") },
      { label: "Home", path: "/" },
    ],
  };
}

function librarySubject(subject: Subject): MarkdownDocument {
  const topics = topicsFor(subject.id);
  const units = unitsFor(subject.id).map((unit) => {
    const inUnit = topics.filter((topic) => topic.unitId === unit.id).sort((a, b) => a.order - b.order);
    if (!inUnit.length) return "";
    return [
      `## ${unit.title}`,
      mdList(inUnit.map((topic) => `${mdLink(topic.title, href("/library", { topic: topic.id }))}${topic.specRef ? ` (${mdText(topic.specRef)})` : ""} - ${mdText(firstSentence(topic.summary))}`)),
    ].join("\n\n");
  }).filter(Boolean);
  return {
    title: subjectLabel(subject.id),
    summary: `${topics.length} topics and ${specPointCount(subject.id)} specification statements in ${subjectLabel(subject.id)}.`,
    canonical: href("/library", { subject: subject.id }),
    lastUpdated: subject.spec?.lastChecked && DATE.test(subject.spec.lastChecked) ? subject.spec.lastChecked : undefined,
    body: [tierNote(subject), ...(subject.specCode ? [`Specification code: ${mdText(subject.specCode)}`] : []), ...units].join("\n\n"),
    related: [
      { label: "Library", path: href("/library") },
      ...(subjectsWithTeaching().some((s) => s.id === subject.id) ? [{ label: `${subjectLabel(subject.id)} lessons`, path: href("/lesson", { subject: subject.id }) }] : []),
    ],
  };
}

function libraryTopic(topic: Topic): MarkdownDocument | null {
  const subject = getSubject(topic.subjectId);
  if (!subject) return null;
  const facts = [
    `Subject: ${mdLink(subjectLabel(subject.id), href("/library", { subject: subject.id }))}`,
    ...(topic.specRef ? [`Specification reference: ${mdText(topic.specRef)}`] : []),
    `Difficulty: ${topic.intrinsicDifficulty}/5`,
    ...(topic.aos?.length ? [`Assessment objectives: ${topic.aos.join(", ")}`] : []),
    `Status: ${topic.source ?? "authored"} · ${topic.verification ?? "unverified"}${topic.lastChecked ? ` · ${topic.lastChecked}` : ""}`,
  ];
  const misconceptions = misconceptionsForTopic(topic.id);
  const sections = [
    tierNote(subject),
    mdList(facts),
    ...(topic.specPoints?.length
      ? ["## Specification coverage", mdTable(["Reference", "Statement", "AOs"], topic.specPoints.map((point) => [point.ref, point.text, point.aos.join(", ")]))]
      : []),
    "## Summary",
    topic.summary,
    "## What earns marks",
    mdList(topic.keyPoints),
    "## Where marks are lost",
    mdList(topic.commonErrors),
    ...(misconceptions.length
      ? [
          "## Misconceptions",
          ...misconceptions.map((m) =>
            [`### ${mdText(m.statement)}`, `Example: ${m.example}`, m.explanation, `Instead: ${m.correction}`].join("\n\n"),
          ),
        ]
      : []),
  ];
  return {
    title: topic.title,
    summary: firstSentence(topic.summary),
    canonical: href("/library", { topic: topic.id }),
    lastUpdated: topic.lastChecked && DATE.test(topic.lastChecked) ? topic.lastChecked : undefined,
    body: sections.join("\n\n"),
    related: [
      { label: subjectLabel(subject.id), path: href("/library", { subject: subject.id }) },
      ...(taughtPoints(topic).length ? [{ label: `${topic.title} lesson`, path: href("/lesson", { subject: subject.id, topic: topic.id }) }] : []),
    ],
  };
}

const library: Renderer = (query) => {
  const topicId = query.get("topic");
  if (topicId) {
    const topic = getTopic(topicId);
    return topic ? libraryTopic(topic) : null;
  }
  const subjectId = query.get("subject");
  if (subjectId) {
    const subject = getSubject(subjectId);
    return subject ? librarySubject(subject) : null;
  }
  return libraryIndex();
};

// --- /lesson ----------------------------------------------------------------

function lessonIndex(): MarkdownDocument {
  const taught = subjectsWithTeaching();
  return {
    title: "Lessons",
    summary: "Taught lesson checkpoints, one per specification statement. WJEC A-level Physics is taught in full; other subjects show outlines built from the specification.",
    canonical: "/lesson",
    body: [
      NOT_REVIEWED,
      "## Taught subjects",
      mdList(taught.map((subject) => {
        const count = topicsFor(subject.id).reduce((sum, topic) => sum + taughtPoints(topic).length, 0);
        return `${mdLink(subjectLabel(subject.id), href("/lesson", { subject: subject.id }))} - ${count} taught checkpoints`;
      })),
      "Other subjects' lessons are outlines that restate the specification statement; their statements are in the library.",
    ].join("\n\n"),
    related: [{ label: "Library", path: href("/library") }],
  };
}

function lessonSubject(subject: Subject): MarkdownDocument | null {
  const topics = topicsFor(subject.id).filter((topic) => taughtPoints(topic).length).sort((a, b) => a.order - b.order);
  if (!topics.length) return null;
  return {
    title: `${subjectLabel(subject.id)} lessons`,
    summary: `Taught lesson checkpoints for ${subjectLabel(subject.id)}, one per specification statement.`,
    canonical: href("/lesson", { subject: subject.id }),
    body: [
      NOT_REVIEWED,
      mdList(topics.map((topic) => `${mdLink(topic.title, href("/lesson", { subject: subject.id, topic: topic.id }))} - ${taughtPoints(topic).length} of ${topic.specPoints?.length ?? 0} checkpoints taught`)),
    ].join("\n\n"),
    related: [
      { label: "Lessons", path: href("/lesson") },
      { label: subjectLabel(subject.id), path: href("/library", { subject: subject.id }) },
    ],
  };
}

function lessonTopic(topic: Topic): MarkdownDocument | null {
  const points = topic.specPoints ?? [];
  if (!taughtPoints(topic).length) return null;
  return {
    title: `${topic.title}: lesson checkpoints`,
    summary: `The ${points.length} checkpoints of the ${topic.title} lesson, one per specification statement.`,
    canonical: href("/lesson", { subject: topic.subjectId, topic: topic.id }),
    body: [
      NOT_REVIEWED,
      mdList(points.map((point) => {
        const label = `${point.ref}: ${point.text}`;
        return TEACHING[point.id]
          ? mdLink(label, href("/lesson", { subject: topic.subjectId, topic: topic.id, checkpoint: point.id }))
          : `${mdText(label)} (outline only)`;
      })),
    ].join("\n\n"),
    related: [
      { label: `${topic.title} in the library`, path: href("/library", { topic: topic.id }) },
      { label: `${subjectLabel(topic.subjectId)} lessons`, path: href("/lesson", { subject: topic.subjectId }) },
    ],
  };
}

function lessonCheckpoint(topic: Topic, point: SpecPoint): MarkdownDocument | null {
  const teaching = TEACHING[point.id];
  if (!teaching) return null;
  return {
    title: `${topic.title}: ${point.ref}`,
    summary: point.text,
    canonical: href("/lesson", { subject: topic.subjectId, topic: topic.id, checkpoint: point.id }),
    body: [
      NOT_REVIEWED,
      `Specification statement (${mdText(point.ref)}): ${point.text}`,
      "## Explanation",
      mdNumbered(teaching.explain),
      "## Worked example",
      teaching.worked.prompt,
      mdNumbered(teaching.worked.steps),
      `Answer: ${teaching.worked.answer}`,
      "## Check",
      teaching.check.question,
      mdList(teaching.check.options),
      "The answer and its explanation are shown in the app once you choose an option.",
      "## Apply it",
      mdBlock(teaching.apply.prompt),
      "The model answer is shown in the app after you have tried it.",
    ].join("\n\n"),
    related: [
      { label: `${topic.title} lesson`, path: href("/lesson", { subject: topic.subjectId, topic: topic.id }) },
      { label: `${topic.title} in the library`, path: href("/library", { topic: topic.id }) },
    ],
  };
}

const lesson: Renderer = (query) => {
  const topicId = query.get("topic");
  if (topicId) {
    const topic = getTopic(topicId);
    if (!topic) return null;
    const checkpointId = query.get("checkpoint");
    if (!checkpointId) return lessonTopic(topic);
    const point = topic.specPoints?.find((candidate) => candidate.id === checkpointId);
    return point ? lessonCheckpoint(topic, point) : null;
  }
  const subjectId = query.get("subject");
  if (subjectId) {
    const subject = getSubject(subjectId);
    return subject ? lessonSubject(subject) : null;
  }
  return lessonIndex();
};

// --- /technique ---------------------------------------------------------------

const technique: Renderer = () => ({
  title: "Exam technique drills",
  summary: "Short describe, explain and evaluate drills, plus a 6-mark-style response plan. These generic writing exercises work without a reviewed question bank.",
  canonical: "/technique",
  body: [
    "Describe: what happens. Explain: why or how. Evaluate: weigh evidence and decide. A longer answer needs connected reasoning, not a guaranteed number of marks.",
    "## Fictional context",
    TECHNIQUE_CONTEXT,
    ...TECHNIQUE_DRILLS.flatMap((drill) => [
      `## ${drill.title}`,
      drill.prompt,
      drill.guidance,
      `One possible ${drill.title.toLowerCase()} response (an illustrative structure, not an examiner-approved answer or a mark scheme):`,
      mdBlock(drill.example),
    ]),
    "In the app, a response gets structure signals only: not a mark, and not a check of factual correctness.",
  ].join("\n\n"),
  related: [{ label: "Lessons", path: href("/lesson") }],
});

const RENDERERS: Record<MarkdownPage, Renderer> = {
  "/": home,
  "/welcome": welcome,
  "/library": library,
  "/lesson": lesson,
  "/technique": technique,
};

export interface RenderedMarkdown {
  doc: MarkdownDocument;
  text: string;
}

/** The twin for an HTML route and query, or null when there is none (a markdown 404). */
export function renderMarkdown(path: string, query: URLSearchParams = new URLSearchParams()): RenderedMarkdown | null {
  if (!(MARKDOWN_PAGES as readonly string[]).includes(path)) return null;
  const doc = RENDERERS[path as MarkdownPage](query);
  return doc ? { doc, text: renderDocument(doc) } : null;
}

/** Every addressable twin, in llms.txt order. Feeds /llms.txt, /llms-full.txt and the catalog. */
export function listMarkdownRoutes(): MarkdownRoute[] {
  const routes: MarkdownRoute[] = [
    { path: "/", query: {}, title: SITE.name, summary: SITE.aiSummary, group: "core" },
    { path: "/welcome", query: {}, title: WELCOME.title, summary: WELCOME.description, group: "core" },
    { path: "/technique", query: {}, title: "Exam technique drills", summary: "Describe, explain and evaluate drills and a 6-mark-style structure, on a fictional context.", group: "guides" },
    { path: "/lesson", query: {}, title: "Lessons", summary: "Taught lesson checkpoints by subject.", group: "lessons" },
  ];
  for (const subject of subjectsWithTeaching()) {
    routes.push({ path: "/lesson", query: { subject: subject.id }, title: `${subjectLabel(subject.id)} lessons`, summary: "Taught checkpoints by topic.", group: "lessons" });
    for (const topic of topicsFor(subject.id).filter((t) => taughtPoints(t).length).sort((a, b) => a.order - b.order)) {
      routes.push({ path: "/lesson", query: { subject: subject.id, topic: topic.id }, title: `${topic.title}: lesson checkpoints`, summary: `${taughtPoints(topic).length} taught checkpoints.`, group: "lessons" });
      for (const point of taughtPoints(topic)) {
        routes.push({ path: "/lesson", query: { subject: subject.id, topic: topic.id, checkpoint: point.id }, title: `${topic.title}: ${point.ref}`, summary: point.text, group: "lessons" });
      }
    }
  }
  routes.push({ path: "/library", query: {}, title: "Library", summary: "Every subject, flagship and reference.", group: "curriculum" });
  for (const subject of subjects()) {
    routes.push({ path: "/library", query: { subject: subject.id }, title: subjectLabel(subject.id), summary: `${topicsFor(subject.id).length} topics.`, group: "curriculum" });
  }
  for (const subject of subjects()) {
    for (const topic of [...topicsFor(subject.id)].sort((a, b) => a.order - b.order)) {
      routes.push({ path: "/library", query: { topic: topic.id }, title: `${topic.title} (${subjectLabel(subject.id)})`, summary: firstSentence(topic.summary), group: "curriculum" });
    }
  }
  return routes;
}
