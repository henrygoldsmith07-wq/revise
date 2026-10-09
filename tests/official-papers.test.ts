import { describe, expect, it } from "vitest";
import {
  findOfficialPaperMatch,
  officialPaperContextEnabled,
  officialPaperFirstAttempt,
  officialPaperProofEligible,
  officialPaperQuestionEligible,
  validateOfficialPaperManifest,
  type OfficialPaperManifest,
  type OfficialPaperConfirmation,
} from "@/domain/official-papers";
import type { Attempt, Question } from "@/domain/types";

// ---------------------------------------------------------------------------
// Official-paper trust tier — synthetic fixtures, NOT human evidence. Asserts
// the tier stays inert and separate: empty manifest, disabled flag, prior
// attempts and bad confirmations all refuse; nothing here touches reviewer
// trust.
// ---------------------------------------------------------------------------

const MANIFEST: OfficialPaperManifest = {
  formatVersion: 1,
  papers: [
    {
      id: "wjec-physics-2024-p1",
      board: "wjec",
      subjectId: "wjec-alevel-physics",
      title: "Physics 2024 Paper 1",
      sourceUrl: "https://www.wjec.co.uk/papers/physics-2024-p1.pdf",
      sha256: "a".repeat(64),
    },
  ],
};

const EMPTY: OfficialPaperManifest = { formatVersion: 1, papers: [] };

const confirmation: OfficialPaperConfirmation = {
  manifestId: "wjec-physics-2024-p1",
  digest: "a".repeat(64),
  confirmedAt: "2026-10-05T10:00:00+01:00",
  questionRef: "Q3(a)",
};

function question(over: Partial<Question> = {}): Question {
  return {
    id: "q1",
    subjectId: "wjec-alevel-physics",
    topicIds: ["t1"],
    kind: "short",
    stem: "State the principle.",
    parts: [],
    totalMarks: 2,
    calculatorAllowed: true,
    difficulty: 2,
    origin: "past-paper",
    createdAt: "2026-10-05T09:00:00+01:00",
    ...over,
  } as Question;
}

function attempt(over: Partial<Attempt> = {}): Attempt {
  return {
    id: "a1",
    userId: "u1",
    questionId: "q1",
    subjectId: "wjec-alevel-physics",
    topicIds: ["t1"],
    answers: {},
    marked: [],
    awarded: 2,
    max: 2,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 60_000,
    mode: "practice",
    createdAt: "2026-10-06T10:00:00+01:00",
    ...over,
  } as Attempt;
}

describe("official-paper manifest", () => {
  it("accepts a well-formed manifest and rejects bad entries", () => {
    expect(validateOfficialPaperManifest(MANIFEST)).toEqual([]);
    expect(validateOfficialPaperManifest(EMPTY)).toEqual([]);
    expect(
      validateOfficialPaperManifest({
        formatVersion: 1,
        papers: [{ ...MANIFEST.papers[0]!, sourceUrl: "http://example.com/paper.pdf" }],
      }).length,
    ).toBeGreaterThan(0);
  });

  it("matches digests exactly and refuses malformed ones", () => {
    expect(findOfficialPaperMatch(MANIFEST, "a".repeat(64))?.id).toBe("wjec-physics-2024-p1");
    expect(findOfficialPaperMatch(MANIFEST, "b".repeat(64))).toBeNull();
    expect(findOfficialPaperMatch(MANIFEST, "not-a-digest")).toBeNull();
    expect(findOfficialPaperMatch(EMPTY, "a".repeat(64))).toBeNull();
  });
});

describe("official-paper eligibility", () => {
  it("requires the flag, a valid confirmation and a first attempt together", () => {
    const q = question({ officialPaper: confirmation });
    const a = attempt();
    expect(officialPaperContextEnabled({ officialPaperTrust: true, officialPaperTermsConfirmed: true })).toBe(true);
    expect(officialPaperContextEnabled({ officialPaperTrust: true })).toBe(false);
    expect(officialPaperContextEnabled({})).toBe(false);
    expect(officialPaperQuestionEligible(q, MANIFEST, true)).toBe(true);
    expect(officialPaperQuestionEligible(q, MANIFEST, false)).toBe(false);
    expect(officialPaperQuestionEligible(q, EMPTY, true)).toBe(false);
    expect(officialPaperProofEligible({ question: q, attempt: a, history: [a], manifest: MANIFEST, enabled: true })).toBe(true);
  });

  it("refuses previously attempted papers", () => {
    const q = question({ officialPaper: confirmation });
    const earlier = attempt({ id: "a0", createdAt: "2026-10-05T10:00:00+01:00" });
    const later = attempt({ id: "a1", createdAt: "2026-10-06T10:00:00+01:00" });
    expect(officialPaperFirstAttempt(later, [earlier, later])).toBe(false);
    expect(officialPaperProofEligible({ question: q, attempt: later, history: [earlier, later], manifest: MANIFEST, enabled: true })).toBe(false);
  });

  it("refuses bad confirmations, wrong subjects and missing questions", () => {
    const a = attempt();
    expect(officialPaperProofEligible({ question: undefined, attempt: a, history: [a], manifest: MANIFEST, enabled: true })).toBe(false);
    expect(officialPaperProofEligible({
      question: question({ officialPaper: { ...confirmation, confirmedAt: "2026-10-05" } }),
      attempt: a, history: [a], manifest: MANIFEST, enabled: true,
    })).toBe(false);
    expect(officialPaperProofEligible({
      question: question({ subjectId: "wjec-alevel-maths", officialPaper: confirmation }),
      attempt: a, history: [a], manifest: MANIFEST, enabled: true,
    })).toBe(false);
  });
});
