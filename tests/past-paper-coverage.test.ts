import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { allPastPaperIndexes, pastPaperIndexFor } from "@/content/past-papers";
import { topicsFor } from "@/domain/curriculum";
import { pastPaperCoverage, type PastPaperIndex } from "@/domain/past-paper-coverage";

const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("past-paper index integrity", () => {
  for (const index of allPastPaperIndexes()) {
    const topicIds = new Set(topicsFor(index.subjectId).map((topic) => topic.id));

    describe(index.subjectId, () => {
      it("every topic it names exists in the tree", () => {
        const unknown = index.papers.flatMap((paper) =>
          paper.questions.flatMap((q) => q.topicIds.filter((id) => !topicIds.has(id)).map((id) => `${paper.id} Q${q.number}: ${id}`)),
        );
        expect(unknown).toEqual([]);
      });

      it("every question is classified, either to a topic or to a named gap", () => {
        const empty = index.papers.flatMap((paper) =>
          paper.questions.filter((q) => !q.topicIds.length && !q.notInTopicTree?.length).map((q) => `${paper.id} Q${q.number}`),
        );
        expect(empty).toEqual([]);
      });

      it("marks agree with the mark scheme grid: AO split sums to each question, questions sum to the paper", () => {
        for (const paper of index.papers) {
          for (const q of paper.questions) expect(q.ao.reduce((a, b) => a + b, 0), `${paper.id} Q${q.number}`).toBe(q.marks);
          const compulsory = paper.questions.filter((q) => !q.option).reduce((sum, q) => sum + q.marks, 0);
          const options = paper.questions.filter((q) => q.option);
          // A candidate answers one Section B option, so a paper counts it once.
          const oneOption = options.length ? options[0]!.marks : 0;
          expect(new Set(options.map((q) => q.marks)).size, paper.id).toBeLessThanOrEqual(1);
          expect(compulsory + oneOption, paper.id).toBe(paper.totalMarks);
          expect(new Set(paper.questions.map((q) => q.number)).size, paper.id).toBe(paper.questions.length);
        }
      });

      it("links only to the board's own files, with a digest for each mark scheme", () => {
        for (const paper of index.papers) {
          for (const url of [paper.markSchemeUrl, paper.paperUrl].filter(Boolean)) {
            expect(new URL(url!).hostname, paper.id).toBe("pastpapers.download.wjec.co.uk");
          }
          expect(paper.markSchemeSha256, paper.id).toMatch(/^[0-9a-f]{64}$/);
        }
        expect(new Set(index.papers.map((paper) => paper.id)).size).toBe(index.papers.length);
      });

      it("holds no question or mark-scheme text and claims no review", () => {
        expect(index.classification).toBe("authored-unreviewed");
        const allowed = new Set(["number", "marks", "ao", "mathsMarks", "practicalMarks", "topicIds", "notInTopicTree", "option"]);
        for (const paper of index.papers) {
          for (const q of paper.questions) expect(Object.keys(q).filter((key) => !allowed.has(key)), `${paper.id} Q${q.number}`).toEqual([]);
        }
        // The only free text is the gap labels, and those are short names, not prose from a paper.
        const labels = index.papers.flatMap((p) => p.questions.flatMap((q) => q.notInTopicTree ?? []));
        for (const label of labels) expect(label.length).toBeLessThan(90);
      });
    });
  }
});

describe("pastPaperCoverage", () => {
  const index: PastPaperIndex = {
    formatVersion: 1,
    subjectId: "s",
    board: "WJEC",
    specification: "x",
    retrievedAt: "2026-10-19",
    classification: "authored-unreviewed",
    papers: [2024, 2025].map((year) => ({
      id: `p-${year}`,
      unit: 1,
      level: "AS" as const,
      unitTitle: "Unit",
      componentCode: "c",
      year,
      series: "Summer",
      totalMarks: 30,
      markSchemeUrl: `https://pastpapers.download.wjec.co.uk/${year}-ms.pdf`,
      markSchemeSha256: "0".repeat(64),
      ...(year === 2025 ? { paperUrl: `https://pastpapers.download.wjec.co.uk/${year}.pdf` } : {}),
      questions: [
        { number: 1, marks: 10, ao: [5, 5, 0] as [number, number, number], mathsMarks: 0, practicalMarks: 0, topicIds: ["a", "b"] },
        { number: 2, marks: year === 2024 ? 20 : 8, ao: [0, 0, 0] as [number, number, number], mathsMarks: 0, practicalMarks: 0, topicIds: year === 2024 ? ["a"] : [], notInTopicTree: year === 2025 ? ["Stars"] : undefined },
      ],
    })),
  };
  const topics = [
    { id: "a", title: "Alpha" },
    { id: "b", title: "Beta" },
    { id: "c", title: "Gamma" },
  ];
  const coverage = pastPaperCoverage(index, topics);

  it("counts papers, questions and the marks of every question that assesses a topic", () => {
    const alpha = coverage.topics.find((row) => row.key === "a")!;
    expect({ papers: alpha.papers, years: alpha.years, questions: alpha.questions, marks: alpha.marks, lastYear: alpha.lastYear }).toEqual({
      papers: 2,
      years: 2,
      questions: 3,
      marks: 40,
      lastYear: 2025,
    });
    expect(coverage.topics.map((row) => row.key)).toEqual(["a", "b"]);
  });

  it("links to the question paper when published, otherwise the mark scheme, newest first", () => {
    const beta = coverage.topics.find((row) => row.key === "b")!;
    expect(beta.refs.map((ref) => ref.href)).toEqual([
      "https://pastpapers.download.wjec.co.uk/2025.pdf",
      "https://pastpapers.download.wjec.co.uk/2024-ms.pdf",
    ]);
  });

  it("reports examined content with no topic, and topics no paper assessed", () => {
    expect(coverage.gaps.map((row) => [row.title, row.marks])).toEqual([["Stars", 8]]);
    expect(coverage.unexamined).toEqual([{ topicId: "c", title: "Gamma" }]);
    expect(coverage).toMatchObject({ papers: 2, years: [2024, 2025], questions: 4 });
  });
});

describe("WJEC A level Physics coverage", () => {
  const index = pastPaperIndexFor("wjec-alevel-physics")!;
  const coverage = pastPaperCoverage(index, topicsFor("wjec-alevel-physics"));

  it("indexes all four written units for every summer series 2022–2025", () => {
    const units = new Set(index.papers.map((paper) => `${paper.year}:${paper.unit}`));
    for (const year of [2022, 2023, 2024, 2025]) for (const unit of [1, 2, 3, 4]) expect(units.has(`${year}:${unit}`)).toBe(true);
  });

  it("surfaces the examined content the topic tree is missing", () => {
    // Every Unit 1 paper examines moments and stellar radiation; the tree has no topic for either.
    expect(coverage.gaps.map((row) => row.title)).toEqual([
      "Radiation from stars: black body, Wien, Stefan and inverse-square intensity",
      "Moments, centre of gravity and equilibrium",
    ]);
    for (const gap of coverage.gaps) expect(gap.years).toBe(4);
  });

  it("is reachable from the Papers route without the authored question bank", () => {
    const panel = src("src/components/PastPaperCoveragePanel.tsx");
    expect(panel).toContain('from "@/content/past-papers"');
    expect(panel).not.toMatch(/from "@\/content"/);
    expect(src("src/app/papers/page.tsx")).toContain("<PastPaperCoveragePanel subjectId={subjectId} />");
  });
});
