import { describe, expect, it } from "vitest";
import { wjecBiologyQualityQuestions } from "@/content/questions/wjec-biology-quality";
import { wjecChemistryQualityQuestions } from "@/content/questions/wjec-chemistry-quality";
import { wjecFlagshipDepthQuestions } from "@/content/questions/wjec-flagship-depth";
import { wjecMathsQualityQuestions } from "@/content/questions/wjec-maths-quality";
import { wjecCapabilities } from "@/content/capabilities";
import { wjecDepthCurricula } from "@/content/wjec-subject-capabilities";
import { wjecFlagshipCurricula } from "@/content/wjec-subject-capabilities";
import { seedQuestions } from "@/content";
import { defineQuestion } from "@/content/questions/authoring";
import { auditFlagshipSubject, buildFlagshipDepthDashboard } from "@/domain/subject-assessment-audit";
import type { Question } from "@/domain/types";

const qualityBanks = [wjecMathsQualityQuestions, wjecBiologyQualityQuestions, wjecChemistryQualityQuestions];
const subjects = ["maths", "biology", "chemistry"] as const;

function flagshipBank(subject: (typeof subjects)[number]): Question[] {
  const quality = qualityBanks[subjects.indexOf(subject)]!;
  return [...quality, ...wjecFlagshipDepthQuestions.filter((question) => question.subjectId === `wjec-alevel-${subject}`)];
}

describe("WJEC flagship depth pack", () => {
  it.each(subjects)("reaches at least twenty deep statements for %s", (subject) => {
    const curriculum = wjecDepthCurricula[subjects.indexOf(subject)]!;
    const audit = auditFlagshipSubject({ subjectId: curriculum.subject.id, topics: curriculum.topics,
      questions: flagshipBank(subject), nodes: wjecCapabilities });
    expect(audit.completeStatements).toBeGreaterThanOrEqual(20);
    expect(audit.correctness.errors).toBe(0);
    expect(audit.issues.filter((issue) => issue.kind !== "unreviewed")).toEqual([]);
    expect(audit.approvedQuestions).toBe(0);
    expect(audit.releaseReady).toBe(false);
  });

  it("reports a balanced internal dashboard while keeping drafts out of trusted counts", () => {
    const dashboard = buildFlagshipDepthDashboard({
      curricula: wjecDepthCurricula,
      questions: qualityBanks.flat().concat(wjecFlagshipDepthQuestions),
      nodes: wjecCapabilities,
    });
    expect(dashboard.balancedAtTwenty).toBe(true);
    expect(dashboard.subjects).toHaveLength(3);
    expect(dashboard.subjects.every((row) => row.deepComplete >= 20)).toBe(true);
    expect(dashboard.subjects.every((row) => row.approvedQuestions === 0)).toBe(true);
    // Existing quality packs are generated drafts too; the dashboard counts
    // the whole internal inventory, while the new pack must be present.
    expect(dashboard.generatedQuestionCount).toBeGreaterThanOrEqual(wjecFlagshipDepthQuestions.length);
  });

  it("can report all four WJEC flagships without changing the student surface", () => {
    const dashboard = buildFlagshipDepthDashboard({ curricula: wjecFlagshipCurricula, questions: seedQuestions, nodes: wjecCapabilities });
    expect(dashboard.subjects.map((row) => row.subjectId)).toEqual([
      "wjec-alevel-physics", "wjec-alevel-maths", "wjec-alevel-biology", "wjec-alevel-chemistry",
    ]);
    expect(dashboard.subjects[0]!.statements).toBe(108);
    expect(dashboard.subjects[0]!.deepComplete).toBe(108);
    expect(dashboard.balancedAtTwenty).toBe(true);
  });
});

function fixture(subjectId: string, prompt: string, modelAnswer: string): Question {
  return defineQuestion({ slug: `audit-fixture-${subjectId}`, subjectId, topics: ["fixture"], stem: "Fixture", parts: [
    { prompt, marks: 1, scheme: [modelAnswer], answer: modelAnswer },
  ] });
}

describe("subject-specific correctness checks", () => {
  it("catches a non-equivalent Maths identity", () => {
    const question = fixture("wjec-alevel-maths", "Check the identity. x + 1 = x + 2.", "x + 1 = x + 2");
    const audit = auditFlagshipSubject({ subjectId: question.subjectId, topics: [], questions: [question], nodes: [] });
    expect(audit.subjectIssues.some((issue) => issue.kind === "maths-equivalence" && issue.severity === "error")).toBe(true);
  });

  it("catches an unqualified Biology contradiction", () => {
    const question = fixture("wjec-alevel-biology", "Explain the effect on rate.", "The rate increases and decreases.");
    const audit = auditFlagshipSubject({ subjectId: question.subjectId, topics: [], questions: [question], nodes: [] });
    expect(audit.subjectIssues.some((issue) => issue.kind === "biology-contradiction" && issue.severity === "error")).toBe(true);
  });

  it("catches an atom-unbalanced Chemistry equation", () => {
    const question = fixture("wjec-alevel-chemistry", "Balance the reaction.", "H2 + O2 -> H2O");
    const audit = auditFlagshipSubject({ subjectId: question.subjectId, topics: [], questions: [question], nodes: [] });
    expect(audit.subjectIssues.some((issue) => issue.kind === "chemistry-equation-balance" && issue.severity === "error")).toBe(true);
  });
});
