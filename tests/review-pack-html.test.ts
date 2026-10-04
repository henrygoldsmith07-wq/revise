import { describe, expect, it } from "vitest";
import {
  buildReviewPackHtml, embedJson, extractReviewPackReturn, REVIEW_PACK_RETURN_BEGIN, REVIEW_PACK_RETURN_END,
  REVIEW_PACK_RULES_JS, reviewPackTemplateData, type ReviewPackInput, type ReviewPackQuestion,
} from "@/domain/review-pack-html";
import { physicsContentFingerprint, REQUIRED_HUMAN_CHECKS } from "@/domain/content-trust";
import type { Question } from "@/domain/types";
import {
  appendReviewDecisions, emptyAuditLog, parseReviewReturn, promotableLedgerEntries, reviewStateOf,
} from "@/domain/review-workflow";
import { PROMPTS, SUBJECT, verifyThroughWorkflow, wq } from "./helpers-review";

/** The browser rules, executed exactly as the page runs them. */
function reviewPackRules(): {
  reviewPackValidate: (file: unknown, claims: Record<string, unknown>, nowMs: number) => string[];
  reviewPackNowInstant: (now: Date, offsetMinutes: number) => string;
  REVIEW_PACK_CHECKS: string[];
} {
  return new Function(`${REVIEW_PACK_RULES_JS}; return { reviewPackValidate, reviewPackNowInstant, REVIEW_PACK_CHECKS };`)();
}

const packQuestion = (question: Question, over: Partial<ReviewPackQuestion> = {}): ReviewPackQuestion => ({
  questionId: question.id,
  fingerprint: physicsContentFingerprint(question),
  rank: 1,
  topicId: `${SUBJECT}.algebra`,
  topicTitle: "algebra",
  subjectId: question.subjectId,
  stem: question.stem,
  totalMarks: question.totalMarks,
  difficulty: question.difficulty,
  kind: question.kind ?? "short",
  parts: question.parts.map((part) => ({
    label: part.label ?? "a",
    prompt: part.prompt,
    marks: part.marks,
    markScheme: part.markScheme,
    modelAnswer: part.modelAnswer,
    specPointRefs: part.specPointIds ?? [],
  })),
  specPoints: [{ ref: "1.1", text: "Use the factor theorem on a cubic polynomial." }],
  provenance: { source: "authored", origin: "seed", specVersion: "2024-1.0", lastChecked: "2026-08-01" },
  unlocks: ["Helps the cold-start diagnostic"],
  gateWarnings: ["warn: Part a is worth 2 marks but has one mark-scheme point."],
  reskinWarning: "1 near-identical sibling question (q-b). Approval never extends to it.",
  transferClaimed: false,
  dataClaimed: false,
  alreadyApprovedBy: [],
  ...over,
});

const packInput = (questions: ReviewPackQuestion[], over: Partial<ReviewPackInput> = {}): ReviewPackInput => ({
  packId: "test-pack-1",
  subjectId: SUBJECT,
  subjectLabel: "WJEC A-level Mathematics",
  generatedAt: "2026-10-04T09:00:00.000Z",
  questions,
  ...over,
});

const REVIEWED_AT = "2026-10-04T10:00:00.000Z";

function approval(over: Record<string, unknown> = {}) {
  return {
    questionId: "q-a",
    contentFingerprint: "wjec-review-v3:sha256:stale",
    decision: "approve",
    reviewerId: "j-patel",
    reviewerRole: "teacher",
    reviewerQualification: "PGCE maths, 8 years",
    reviewedAt: REVIEWED_AT,
    checks: Object.fromEntries(REQUIRED_HUMAN_CHECKS.map((check) => [check, true])),
    comments: "",
    ...over,
  };
}

/** Mimics what the page does when a reviewer clicks Export. */
function serializeExport(html: string, file: unknown): string {
  return html.replace(
    /(<script type="application\/json" id="review-pack-data">)[\s\S]*?(<\/script>)/,
    `$1${embedJson(file)}$2`,
  );
}

describe("offline reviewer pack", () => {
  it("shows the reviewer everything the importer needs to judge", () => {
    const question = wq("q-a", "algebra", PROMPTS[0]!);
    const html = buildReviewPackHtml(packInput([packQuestion(question)]));

    expect(html).toContain(question.stem);
    expect(html).toContain("Point 1 for q-a");
    expect(html).toContain("Worked answer for q-a");
    expect(html).toContain("Use the factor theorem on a cubic polynomial.");
    expect(html).toContain("authored");
    expect(html).toContain("2024-1.0");
    expect(html).toContain("never extends to it");
    expect(html).toContain(physicsContentFingerprint(question));
    for (const check of REQUIRED_HUMAN_CHECKS) expect(html).toContain(check);
  });

  it("is a single offline file: no network, no external assets", () => {
    const html = buildReviewPackHtml(packInput([packQuestion(wq("q-a", "algebra", PROMPTS[0]!))]));
    expect(html).not.toMatch(/<script[^>]+\ssrc=/i);
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    expect(html).not.toMatch(/\bfetch\s*\(/);
    expect(html).not.toMatch(/XMLHttpRequest|sendBeacon|navigator\.\w*[Pp]ush|importScripts|new WebSocket/);
    // A CSP that cannot reach the network proves the claim rather than asserting it.
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain(REVIEW_PACK_RETURN_BEGIN);
    expect(html).toContain(REVIEW_PACK_RETURN_END);
  });

  it("round-trips pack -> export -> import -> verified through the real workflow", () => {
    const questions = [
      wq("q-a", "algebra", PROMPTS[0]!),
      wq("q-b", "coordinate-geometry", PROMPTS[1]!),
      wq("q-c", "probability", PROMPTS[2]!),
    ];
    const packs = questions.map((question, index) => packQuestion(question, {
      rank: index + 1,
      topicId: question.topicIds[0]!,
      alreadyApprovedBy: index === 0 ? ["first-reviewer"] : [],
    }));
    const html = buildReviewPackHtml(packInput(packs));
    const template = reviewPackTemplateData(packInput(packs));
    const claims = Object.fromEntries(template.questions.map((row) => [row.questionId, row]));

    // Reviewer 2 fills every question in as a second, different reviewer.
    const file = {
      formatVersion: 1,
      packId: template.packId,
      decisions: template.questions.map((row) => ({
        questionId: row.questionId,
        contentFingerprint: row.contentFingerprint,
        decision: "approve",
        reviewerId: "second-reviewer",
        reviewerRole: "teacher",
        reviewerQualification: "PGCE maths, 8 years",
        reviewedAt: REVIEWED_AT,
        checks: Object.fromEntries(REQUIRED_HUMAN_CHECKS.map((check) => [check, true])),
        comments: "",
        classification: {},
      })),
    };

    expect(reviewPackRules().reviewPackValidate(file, claims, Date.parse("2026-10-04T11:00:00.000Z"))).toEqual([]);

    // The exported file is the page's own document with a filled return block.
    const exported = serializeExport(html, file);
    const extracted = extractReviewPackReturn(exported);
    expect(extracted.errors).toEqual([]);
    expect(JSON.parse(extracted.json!)).toEqual(file);

    // ...and the existing importer accepts it unchanged.
    const parsed = parseReviewReturn(extracted.json!);
    expect(parsed.errors).toEqual([]);
    expect(parsed.skipped).toBe(0);
    const appended = appendReviewDecisions(emptyAuditLog(), parsed.decisions, questions, Date.parse(REVIEWED_AT));
    expect(appended.problems).toEqual([]);
    expect(appended.accepted).toBe(3);

    // One qualified reviewer is not trust: the pack only reaches "checked".
    expect(questions.map((q) => reviewStateOf(q, appended.log.events).stage)).toEqual(["checked", "checked", "checked"]);
    expect(promotableLedgerEntries(questions, appended.log)).toEqual([]);

    // A second, different reviewer on the same content is what verifies it.
    const second = appendReviewDecisions(appended.log, parsed.decisions.map((row) => ({
      ...row, reviewerId: "third-reviewer", reviewedAt: "2026-10-04T12:00:00.000Z",
    })), questions, Date.parse("2026-10-04T13:00:00.000Z"));
    expect(second.problems).toEqual([]);
    expect(promotableLedgerEntries(questions, second.log).map((entry) => entry.questionId).sort()).toEqual(["q-a", "q-b", "q-c"]);

    const verified = verifyThroughWorkflow(questions, ["q-a"]);
    expect(reviewStateOf(verified.questions.find((q) => q.id === "q-a")!, verified.log.events).stage).toBe("verified");
  });

  it("refuses to export an incomplete attestation", () => {
    const question = wq("q-a", "algebra", PROMPTS[0]!);
    const input = packInput([packQuestion(question, { alreadyApprovedBy: ["first-reviewer"] })]);
    const claims = { "q-a": reviewPackTemplateData(input).questions[0] };
    const { reviewPackValidate } = reviewPackRules();
    const now = Date.parse("2026-10-04T11:00:00.000Z");

    const cases: Array<[string, unknown]> = [
      ["no named reviewer", approval({ reviewerId: "" })],
      ["no role", approval({ reviewerRole: "" })],
      ["no qualification", approval({ reviewerQualification: "  " })],
      ["a date-only stamp", approval({ reviewedAt: "2026-10-04" })],
      ["a stamp with no timezone", approval({ reviewedAt: "2026-10-04T10:00:00" })],
      ["a future stamp", approval({ reviewedAt: "2026-10-05T10:00:00.000Z" })],
      ["one check missing", approval({ checks: Object.fromEntries(REQUIRED_HUMAN_CHECKS.map((c, i) => [c, i > 0])) })],
      ["a rejection with no comment", approval({ decision: "reject", comments: "" })],
      ["a self-approval", approval({ reviewerId: "first-reviewer" })],
    ];
    for (const [label, row] of cases) {
      const errors = reviewPackValidate({ formatVersion: 1, packId: "test-pack-1", decisions: [row] }, claims, now);
      expect(errors.length, label).toBeGreaterThan(0);
    }
    // And the importer agrees: it refuses the same rows.
    for (const [, row] of cases) {
      const appended = appendReviewDecisions(emptyAuditLog(), [row as never], [question], now);
      if ((row as { reviewedAt?: string }).reviewedAt === REVIEWED_AT && (row as { reviewerId?: string }).reviewerId) {
        expect(appended.problems.length, JSON.stringify(row)).toBeGreaterThan(0);
      }
    }
  });

  it("refuses an empty pack and an unfilled pack", () => {
    const question = wq("q-a", "algebra", PROMPTS[0]!);
    const input = packInput([packQuestion(question)]);
    const { reviewPackValidate } = reviewPackRules();
    expect(reviewPackValidate({ formatVersion: 1, packId: "p", decisions: [] }, {}, Date.now()).length).toBeGreaterThan(0);

    const unfilled = extractReviewPackReturn(buildReviewPackHtml(input));
    expect(unfilled.errors.length).toBeGreaterThan(0);
    expect(unfilled.errors[0]).toContain("not been filled in");
  });

  it("turns the reviewer's clock into a timezone-bearing instant", () => {
    const { reviewPackNowInstant } = reviewPackRules();
    // 14:05 in summer time (UTC+60) is 13:05 UTC.
    expect(reviewPackNowInstant(new Date("2026-10-04T13:05:00.000Z"), -60)).toBe("2026-10-04T14:05:00+01:00");
    expect(reviewPackNowInstant(new Date("2026-10-04T13:05:00.000Z"), 0)).toBe("2026-10-04T13:05:00+00:00");
    expect(reviewPackNowInstant(new Date("2026-10-04T10:05:00.000Z"), 300)).toBe("2026-10-04T05:05:00-05:00");
  });

  it("keeps the pack's fingerprints equal to the bank", () => {
    const question = wq("q-a", "algebra", PROMPTS[0]!);
    const html = buildReviewPackHtml(packInput([packQuestion(question)]));
    const { json } = extractReviewPackReturn(html.replace(REVIEW_PACK_RETURN_BEGIN, `${REVIEW_PACK_RETURN_BEGIN}\n${REVIEW_PACK_RETURN_END}\n`));
    expect(json).toBeNull();
    const template = reviewPackTemplateData(packInput([packQuestion(question)]));
    expect(template.questions[0]!.contentFingerprint).toBe(physicsContentFingerprint(question));
  });

  it("escapes content so a question cannot break out of the page", () => {
    const nasty = wq("q-a", "algebra", `</script><img src=x onerror=alert(1)> & "quotes"`);
    const html = buildReviewPackHtml(packInput([packQuestion(nasty)]));
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;/script&gt;&lt;img");
    // The page still parses: the embedded block is valid JSON.
    const block = /<script type="application\/json" id="review-pack-data">([\s\S]*?)<\/script>/.exec(html)![1]!;
    expect(() => JSON.parse(block)).not.toThrow();
  });
});