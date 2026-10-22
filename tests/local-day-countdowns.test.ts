import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildTodayBrief } from "@/domain/today-brief";
import { buildPaperReadiness } from "@/domain/paper-readiness";
import { buildProofLedger, MIN_PROOF_DELAY_DAYS } from "@/domain/proof-of-improvement";
import { physicsContentFingerprint } from "@/domain/content-trust";
import type { AdaptiveSessionPlan } from "@/domain/adaptive-contract";
import type { Attempt, ExamDate, Question, Subject, Topic } from "@/domain/types";

// Calendar days flip at the student's local midnight (src/domain/local-date.ts).
// These modules took "today" from the UTC date instead, so in the UK during
// British Summer Time (UTC+1), which covers the whole exam season, every
// countdown was a day long between midnight and 1am, and an exam on its own
// day read "in 1 day". Each case failed before the fix.

const EXAM_DAY_0030_BST = new Date("2026-06-03T23:30:00.000Z"); // 00:30 on 4 June in London

describe("calendar days in Europe/London just after midnight (BST)", () => {
  let previous: string | undefined;
  beforeAll(() => {
    previous = process.env.TZ;
    process.env.TZ = "Europe/London";
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });

  const exam = (date: string, extra: Partial<ExamDate> = {}): ExamDate => ({ id: `e-${date}`, userId: "u", subjectId: "s", date, label: "", ...extra });

  it("Today's brief counts an exam today as today", () => {
    const plan: AdaptiveSessionPlan = { key: "k", subjectId: "s", topicId: "t", topicTitle: "T", targetMinutes: 20, totalMinutes: 20, score: 1, reason: "", evidence: {} as AdaptiveSessionPlan["evidence"], startHref: "/x", steps: [] };
    const brief = buildTodayBrief({ plan, examDates: [exam("2026-06-04")], now: EXAM_DAY_0030_BST });
    expect(brief.daysToExam).toBe(0);
  });

  it("paper readiness counts an exam today as today", () => {
    const subject = { id: "s", qualificationId: "q", name: "S", gradeBoundaries: [], papers: [{ id: "s.u1", name: "Unit 1", weight: 1, durationMinutes: 90, calculatorAllowed: true }] } as Subject;
    const rows = buildPaperReadiness({
      subject, topics: [], questions: [], attempts: [], mistakes: [],
      examDates: [exam("2026-06-04", { paperSpecId: "s.u1" })], now: EXAM_DAY_0030_BST,
    });
    expect(rows[0]!.daysUntil).toBe(0);
  });

  it("the proof ledger dates the first day proof can count by the local day", () => {
    const topic: Topic = { id: "t1", subjectId: "wjec-alevel-physics", unitId: "u", title: "t1", order: 1, intrinsicDifficulty: 3, summary: "", keyPoints: [], commonErrors: [], specPoints: [{ id: "t1.0", ref: "t1.0", text: "t1.0", aos: ["AO1"] }] };
    const questions = ["q0", "q1"].map((id): Question => {
      const base: Question = { id, subjectId: topic.subjectId, topicIds: ["t1"], kind: "short", stem: id, parts: [{ id: `${id}.a`, label: "", prompt: "p", marks: 4, markScheme: ["x"], modelAnswer: "x" }], totalMarks: 4, calculatorAllowed: true, difficulty: 3, origin: "seed", createdAt: "2026-05-01T09:00:00.000Z" };
      return { ...base, verification: "verified", humanVerification: { status: "approved", reviewerId: "r", reviewerRole: "teacher", reviewerQualification: "Test fixture only", reviewedAt: "2026-05-02T09:00:00.000Z", contentFingerprint: physicsContentFingerprint(base), checks: { question: true, marking: true, workedSolution: true, capabilityMapping: true, specificationMapping: true, examRealism: true } } };
    });
    // Baseline answered at 00:30 on 2 June, local time.
    const at = "2026-06-01T23:30:00.000Z";
    const attempts = questions.map((q, i): Attempt => ({ id: `a${i}`, userId: "u", questionId: q.id, subjectId: q.subjectId, topicIds: ["t1"], answers: {}, marked: [], awarded: 1, max: 4, feedback: "", markedBy: "rubric", elapsedMs: 1, mode: "practice", createdAt: at }));
    const row = buildProofLedger({ topics: [topic], attempts, questions, reviewLogs: [], now: EXAM_DAY_0030_BST }).topics[0]!;
    expect(row.status).toBe("awaiting-proof");
    expect(row.provableFrom).toBe(`2026-06-0${2 + MIN_PROOF_DELAY_DAYS}`);
  });
});

describe("UTC-day truncation in domain code", () => {
  // Calendar-day code goes through src/domain/local-date.ts. Truncating an
  // instant to its first ten characters gives the UTC day, which is wrong for
  // every calendar concept around local midnight. The few legitimate UTC uses
  // are listed with their reason; anything new must justify itself here.
  const ALLOWED: Record<string, string> = {
    "local-date.ts": "the module's own explanatory comment",
    "calendar-export.ts": "date-key arithmetic in UTC, equivalent to addLocalDays",
    "recommender.ts": "deterministic synthetic benchmark dates",
    "large-history-fixture.ts": "deterministic synthetic fixture",
    "portability.ts": "export filename stamp",
  };
  const pattern = /toISOString\(\)\.(slice|substring)\(0, ?10\)|toISOString\(\)\.split\("T"\)|(createdAt|reviewedAt|updatedAt|completedAt|startedAt|submittedAt|lastStudiedAt)\??\.slice\(0, ?10\)/;

  it("is confined to the listed files", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && !(entry.name in ALLOWED)) {
          readFileSync(path, "utf8").split("\n").forEach((line, i) => {
            if (pattern.test(line)) offenders.push(`${path}:${i + 1}`);
          });
        }
      }
    };
    walk("src/domain");
    expect(offenders).toEqual([]);
  });
});
