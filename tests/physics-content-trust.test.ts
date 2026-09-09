import { describe, expect, it } from "vitest";
import { wjecPhysicsDeepQuestions as bank } from "@/content/questions/wjec-physics-deep";
import { physicsContentFingerprint, applyHumanVerification, humanVerifiedPhysicsQuestion, buildPhysicsReviewQueue, verifiedPhysicsPaperProvenance } from "@/domain/physics-content-review";
import { authenticPaperEvidence, humanReviewedPaperAttempt, isTransferQuestion, paperMarkingFingerprint } from "@/domain/learning-evidence";
import { analyseExperiment, type AnalyseExperimentInput } from "@/domain/recommendation-experiment";
import { paperRunScores } from "@/domain/exam-outlook";
import { buildPredictionOutcomePairs } from "@/domain/learning-controls";
import { attachTransferOutcome, attachDelayedRetentionOutcome, createInterventionOutcome, calibratedGain, calibrateInterventions } from "@/domain/intervention-calibration";
import { markCalculationWorking, contradictoryWorkingStep } from "@/domain/calculation-rubric";
import { analyseAttemptWorking, firstIncorrectStep } from "@/domain/working-analysis";
import type { Attempt, Question, QuestionPart } from "@/domain/types";

// Test-only human attestations; no production content is approved here.
function approve(question: Question): Question {
  return applyHumanVerification(question, {
    status: "approved", reviewerId: "test-only", reviewedAt: "2026-09-08T00:00:00Z",
    contentFingerprint: physicsContentFingerprint(question),
    checks: { question: true, marking: true, workedSolution: true, capabilityMapping: true, specificationMapping: true, examRealism: true },
  });
}
function attempt(question: Question, id: string, day: number): Attempt {
  return { id, userId: "learner", subjectId: question.subjectId, questionId: question.id, topicIds: question.topicIds,
    answers: {}, marked: question.parts.map((part) => ({ partId: part.id, awarded: part.marks, max: part.marks,
      creditedPoints: part.markScheme, missedPoints: [], comment: "" })),
    awarded: question.totalMarks, max: question.totalMarks, feedback: "", markedBy: "rubric",
    elapsedMs: 120000, mode: "practice", createdAt: new Date(Date.UTC(2026, 0, day)).toISOString() };
}
const source = bank.find((q) => q.id.endsWith("loaded-divider"))!;
const transfer = bank.find((q) => q.id.endsWith("cold-room-alarm"))!;
const context = { id: "step", chainId: "repair", capabilityId: "phys.circuit.divider", topicId: source.topicIds[0]!,
  kind: "guided" as const, priorState: "weak" as const, priorAccuracy: 0.25, plannedMinutes: 3, support: "scaffold" as const };
const initial = (question: Question = source) => createInterventionOutcome({ userId: "learner", subjectId: question.subjectId, context, question, attempt: attempt(question, "initial", 1) });

describe("Physics content trust boundaries", () => {
  it("requires all six checks and invalidates approval after content changes", () => {
    const reviewed = approve(transfer);
    expect(humanVerifiedPhysicsQuestion(reviewed)).toBe(true);
    expect(isTransferQuestion(transfer, source)).toBe(false);
    expect(isTransferQuestion(reviewed, source)).toBe(false);
    expect(isTransferQuestion(reviewed, approve(source))).toBe(true);
    expect(humanVerifiedPhysicsQuestion({ ...reviewed, stem: reviewed.stem + " Changed." })).toBe(false);
    const missing = { ...reviewed.humanVerification!, checks: { ...reviewed.humanVerification!.checks, examRealism: false } };
    expect(applyHumanVerification(reviewed, missing).verification).toBe("unverified");
    expect(buildPhysicsReviewQueue([{ ...source, learning: undefined }])).toHaveLength(1);
  });
  it("does not attach unreviewed, supported, uncertain, replayed or other-user transfer", () => {
    const row = initial();
    expect(createInterventionOutcome({ userId: "learner", subjectId: source.subjectId, context, question: approve(source), attempt: { ...attempt(approve(source), "self-marked", 1), markedBy: "self" } }).immediate.trusted).toBe(false);
    const reviewed = approve(transfer);
    const a = attempt(reviewed, "transfer", 2);
    const evidence = { question: reviewed, questions: [source, reviewed], history: [attempt(source, "initial", 1)] };
    expect(attachTransferOutcome(row, a, { ...evidence, question: transfer })).toBe(row);
    for (const invalid of [{ ...a, hintTier: "cue" as const }, { ...a, userId: "other" }, { ...a, markConfidence: 0.1 },
      { ...a, copiedAnswer: true }]) expect(attachTransferOutcome(row, invalid, evidence)).toBe(row);
    expect(attachTransferOutcome(row, a, { ...evidence, history: [...evidence.history, { ...a, id: "old" }] })).toBe(row);
    const trustedSource = approve(source);
    const trustedRow = initial(trustedSource);
    const trustedEvidence = { question: reviewed, questions: [trustedSource, reviewed], history: [attempt(trustedSource, "trusted-initial", 1)] };
    const joined = attachTransferOutcome(trustedRow, a, trustedEvidence);
    expect(joined.transfer?.trusted).toBe(true);
    expect(joined.actualMinutes).toBe(4);
    expect(attachTransferOutcome(joined, a, evidence)).toBe(joined);
  });
  it("requires a third unseen family, a full unpractised week, and counts failed retention", () => {
    const reviewed = approve(transfer);
    const a = attempt(reviewed, "transfer", 2);
    const trustedSource = approve(source);
    const row = attachTransferOutcome(initial(trustedSource), a, { question: reviewed, questions: [trustedSource, reviewed], history: [] });
    const retention = approve({ ...transfer, id: "test-only-retention",
      learning: { ...transfer.learning!, familyId: "test-only-third-family", contextId: "test-only-new-context" } });
    const later = { ...attempt(retention, "retention", 10), awarded: 0,
      marked: retention.parts.map((part) => ({ partId: part.id, awarded: 0, max: part.marks,
        creditedPoints: [], missedPoints: part.markScheme, comment: "" })) };
    const evidence = { question: retention, questions: [trustedSource, reviewed, retention], history: [a] };
    expect(attachDelayedRetentionOutcome(row, { ...later, createdAt: attempt(retention, "early", 3).createdAt }, evidence)).toBe(row);
    expect(attachDelayedRetentionOutcome(row, later, { ...evidence, lastLearningAt: attempt(source, "teaching", 7).createdAt })).toBe(row);
    const complete = attachDelayedRetentionOutcome(row, later, evidence);
    expect(complete.actualMinutes).toBe(6);
    expect(complete.delayedRetention?.awarded).toBe(0);
    expect(calibratedGain(complete)).toBeCloseTo((0.4 - 0.25) / 6);
    expect(calibratedGain({ ...complete, immediate: { ...complete.immediate, trusted: false } })).toBeNull();
    expect(calibrateInterventions(Array(100).fill(complete)).get("guided:phys.circuit.divider")?.sampleSize).toBe(1);
    expect(calibrateInterventions([complete]).get("guided:phys.circuit.divider")?.reliable).toBe(false);
    expect(calibratedGain({ ...complete, priorAccuracy: 0.9 })).toBeLessThan(0);
  });
  it("keeps later sessions with a reused chain label in calibration", () => {
    const reviewed = approve(transfer);
    const trustedSource = approve(source);
    const transferAttempt = attempt(reviewed, "transfer-1", 2);
    const first = attachTransferOutcome(initial(trustedSource), transferAttempt, {
      question: reviewed, questions: [trustedSource, reviewed], history: [],
    });
    const third = approve({ ...transfer, id: "test-only-third-session", learning: {
      ...transfer.learning!, familyId: "test-only-third-session-family", contextId: "test-only-third-session-context",
    } });
    const retentionAttempt = { ...attempt(third, "retention-1", 10), awarded: 0,
      marked: third.parts.map((part) => ({ partId: part.id, awarded: 0, max: part.marks, creditedPoints: [], missedPoints: part.markScheme, comment: "" })) };
    const firstComplete = attachDelayedRetentionOutcome(first, retentionAttempt, {
      question: third, questions: [trustedSource, reviewed, third], history: [transferAttempt],
    });
    const second = { ...firstComplete, id: "second-session", chainId: "repair", createdAt: "2026-02-01T00:00:00Z", updatedAt: "2026-02-01T00:00:00Z",
      immediate: { ...firstComplete.immediate, at: "2026-02-01T00:00:00Z", attemptId: "initial-2" },
      transfer: { ...firstComplete.transfer!, at: "2026-02-01T00:01:00Z", attemptId: "transfer-2", questionId: "transfer-2", familyId: "transfer-2" },
      delayedRetention: { ...firstComplete.delayedRetention!, at: "2026-02-09T00:01:00Z", attemptId: "retention-2", questionId: "retention-2", familyId: "retention-2" },
    };
    const calibration = calibrateInterventions([firstComplete, second]).get("guided:phys.circuit.divider");
    expect(calibration?.sampleSize).toBe(2);
  });
  it("attributes the immediate result to the target part instead of total marks", () => {
    const unrelated = { ...source.parts[0]!, id: "unrelated-part", marks: 9, capabilityIds: ["another-capability"] };
    const mixed = { ...source, parts: [source.parts[0]!, unrelated], totalMarks: source.totalMarks + 9 };
    const response = attempt(mixed, "mixed", 1);
    response.marked[0]!.awarded = 0;
    response.awarded = 9;
    const outcome = createInterventionOutcome({ userId: "learner", subjectId: mixed.subjectId, context, question: mixed, attempt: response });
    expect(outcome.immediate.awarded).toBe(0);
    expect(outcome.immediate.max).toBe(source.parts[0]!.marks);
    expect(outcome.immediate.result).toBe("missed");
  });
});

describe("authentic Physics papers and prospective outcomes", () => {
  it("does not turn a selectively trusted subset into a whole-paper score", () => {
    const paperId = "paper-complete-check";
    const makePaperQuestion = (question: Question, number: string) => approve({
      ...question,
      id: `${question.id}-${number}`,
      source: "past-paper",
      paperId,
      paperQuestionNumber: number,
      paperProvenance: {
        board: "WJEC", specification: "A200QS", paperId, questionNumber: number,
        sourceUrl: "https://www.wjec.co.uk/test-only/paper.pdf", sourceDigest: "sha256:test-only",
        status: "verified", verifiedBy: "test-only", verifiedAt: "2026-09-08T00:00:00Z",
      },
    });
    const q1 = makePaperQuestion(source, "1");
    const q2 = makePaperQuestion(transfer, "2");
    const paperAttempt = (question: Question, id: string): Attempt => {
      const base = { ...attempt(question, id, 2), mode: "paper" as const, paperId, paperRunId: "complete-run",
        paperMarking: { status: "adjudicated" as const, reviewerId: "test-marker", reviewedAt: "2026-09-08T00:00:00Z", markerCount: 2 } };
      return { ...base, paperMarking: { ...base.paperMarking, markingFingerprint: paperMarkingFingerprint(base) } };
    };
    const one = paperAttempt(q1, "paper-q1");
    expect(paperRunScores([one], [q1, q2])).toEqual([]);
    const two = paperAttempt(q2, "paper-q2");
    expect(paperRunScores([one, two], [q1, q2])).toHaveLength(1);
  });

  it("requires reviewed first-exposure paper evidence and excludes mixed-trust sittings", () => {
    const paperQuestion = approve({ ...transfer, source: "past-paper", paperId: "original-paper", paperQuestionNumber: "3(a)", paperProvenance: {
      board: "WJEC", specification: "A200QS", paperId: "original-paper", questionNumber: "3(a)",
      sourceUrl: "https://www.wjec.co.uk/test-only/original-paper.pdf", sourceDigest: "sha256:test-only",
      status: "verified", verifiedBy: "test-only", verifiedAt: "2026-09-08T00:00:00Z",
    } });
    expect(verifiedPhysicsPaperProvenance(paperQuestion)).toBe(true);
    const response = { ...attempt(paperQuestion, "paper", 2), mode: "paper" as const, paperRunId: "sitting", paperId: "original-paper", paperSpecId: "wjec-alevel-physics.u3",
      paperMarking: { status: "adjudicated" as const, reviewerId: "test-marker", reviewedAt: "2026-09-08T00:00:00Z", markerCount: 2 } };
    expect(humanReviewedPaperAttempt({ ...response, paperMarking: { status: "unreviewed" } })).toBe(false);
    const fingerprinted = { ...response, paperMarking: { ...response.paperMarking, markingFingerprint: paperMarkingFingerprint(response) } };
    expect(humanReviewedPaperAttempt(fingerprinted)).toBe(true);
    expect(humanReviewedPaperAttempt({ ...fingerprinted, awarded: response.awarded - 1,
      marked: response.marked.map((part) => ({ ...part, awarded: Math.max(0, part.awarded - 1) })) })).toBe(false);
    expect(humanReviewedPaperAttempt({ ...response, paperMarking: { ...response.paperMarking, markingFingerprint: "paper-mark-v1:stale" } })).toBe(false);
    expect(authenticPaperEvidence(response, paperQuestion, [], [paperQuestion])).toBe(true);
    expect(authenticPaperEvidence(response, transfer, [], [transfer])).toBe(false);
    expect(humanVerifiedPhysicsQuestion({ ...paperQuestion, paperProvenance: undefined })).toBe(false);
    expect(authenticPaperEvidence(response, paperQuestion, [{ ...response, id: "prior", createdAt: attempt(source, "old", 1).createdAt }], [paperQuestion])).toBe(false);
    const generatedResponse = { ...attempt(source, "generated", 2), mode: "paper" as const, paperRunId: "sitting" };
    expect(buildPredictionOutcomePairs({ attempts: [response, generatedResponse], questions: [paperQuestion, source] })).toEqual([]);
  });
  it("requires matching assessments and measured time, and reports raw marks gained", () => {
    const input: AnalyseExperimentInput = {
      assignments: [{ anonId: "test-learner", arm: "revise", assignedAt: "2026-01-02T00:00:00Z", version: 1 }],
      events: [], attempts: [], reviews: [], masteryByTopic: new Map(),
      baselineAssessments: [{ anonId: "test-learner", subjectId: source.subjectId, percent: 50, maxMarks: 80,
        takenAt: "2026-01-01T00:00:00Z", assessmentVersion: "matched-forms-v1", humanMarked: true }],
      finalAssessments: [{ anonId: "test-learner", subjectId: source.subjectId, percent: 75, maxMarks: 80,
        takenAt: "2026-01-12T00:00:00Z", assessmentVersion: "matched-forms-v1", matchesBaselineVersion: true,
        heldOutFamilies: true, humanMarked: true, delayedDays: 7, revisionMinutes: 60,
        delayedAssessment: { percent: 75, maxMarks: 80, takenAt: "2026-01-19T00:00:00Z", assessmentVersion: "matched-forms-v1", heldOutFamilies: true, humanMarked: true } }],
    };
    const report = analyseExperiment(input);
    expect(report.primaryOutcomes[0]?.marksGainedPerHour).toBe(20);
    expect(report.gates.efficacyClaimReady).toBe(false);
    expect(analyseExperiment({ ...input, baselineAssessments: [{ ...input.baselineAssessments[0]!, humanMarked: false }] }).primaryOutcomes).toEqual([]);
    expect(analyseExperiment({ ...input, baselineAssessments: [{ ...input.baselineAssessments[0]!, humanMarked: undefined }] }).primaryOutcomes).toEqual([]);
    for (const change of [{ humanMarked: false }, { heldOutFamilies: false }, { delayedDays: 0 },
      { revisionMinutes: NaN }, { assessmentVersion: "different" }, { subjectId: "different" }, { maxMarks: 100 }]) {
      expect(analyseExperiment({ ...input, finalAssessments: [{ ...input.finalAssessments[0]!, ...change }] }).primaryOutcomes).toEqual([]);
    }
    // Deliberately tiny synthetic cohorts exercise the gate, not efficacy.
    const arms = ["revise", "baseline-mastery", "baseline-overdue", "control"] as const;
    const study: AnalyseExperimentInput = { ...input, minParticipantsPerArm: 1,
      assignments: arms.map((arm) => ({ ...input.assignments[0]!, anonId: arm, arm })),
      baselineAssessments: arms.map((arm) => ({ ...input.baselineAssessments[0]!, anonId: arm })),
      finalAssessments: arms.map((arm) => ({ ...input.finalAssessments[0]!, anonId: arm })),
      attempts: arms.map((arm) => ({ anonId: arm, questionId: "unseen", topicIds: ["topic"], awarded: 1, max: 2,
        elapsedMs: 1800000, createdAt: "2026-01-04T00:00:00Z" })),
      reviews: arms.flatMap((arm) => Array.from({ length: 8 }, (_, index) =>
        ["2026-01-03T00:00:00Z", "2026-01-10T00:00:00Z"].map((reviewedAt) => ({
          anonId: arm, cardId: `card-${index}`, reviewedAt, grade: "good" }))).flat()),
    };
    expect(analyseExperiment(study).comparisons).toHaveLength(3);
    study.baselineAssessments[1]!.maxMarks = 40;
    study.finalAssessments[1]!.maxMarks = 40;
    expect(analyseExperiment(study).gates.efficacyClaimReady).toBe(false);
    expect(analyseExperiment(study).comparisons).toEqual([]);
  });
});

describe("Physics calculation marking integrity", () => {
  const part: QuestionPart = { id: "p", label: "", prompt: "Calculate the photon energy.",
    marks: 1, markScheme: ["E = 3.98e-19 J"], modelAnswer: "E = 3.98e-19 J",
    calculationRules: [{ kind: "accuracy", label: "E", expected: 3.98e-19 }] };
  it("does not award zero or a wrong power of ten at quantum scales", () => {
    expect(markCalculationWorking(part, "E = 0 J")?.awarded).toBe(0);
    expect(markCalculationWorking(part, "E = 3.98e-18 J")?.awarded).toBe(0);
    expect(markCalculationWorking(part, "E = 3.98e-19 J")?.awarded).toBe(1);
  });
  it("does not cherry-pick a correct result from contradictory working", () => {
    expect(markCalculationWorking(part, "E = 0 J\nE = 3.98e-19 J")?.awarded).toBe(0);
    expect(contradictoryWorkingStep("F = 6 N\nF = 8 N")).toBe(1);
    expect(contradictoryWorkingStep("F = 2 * 3 = 8 N")).toBe(0);
    expect(firstIncorrectStep({ ...part, modelAnswer: "F = 6 N" }, "F = 6 N\nF = 8 N").consistentWithModel).toBe(false);
    const workingPart: QuestionPart = { ...part, id: "working-part", prompt: "Calculate the force.", markScheme: ["F = 6 N"], modelAnswer: "F = 6 N",
      calculationRules: [{ kind: "accuracy", label: "F", expected: 6 }] };
    const question: Question = { ...source, kind: "calculation", parts: [workingPart], totalMarks: workingPart.marks };
    const marked = [{ partId: "working-part", awarded: 0, max: workingPart.marks, creditedPoints: [], missedPoints: workingPart.markScheme, comment: "" }];
    expect(analyseAttemptWorking(question, { "working-part": "F = 6 N\nF = 8 N" }, marked)[0]?.firstErrorKind).toBe("contradictory-working");
  });
  it("keeps SI symbol case and explicit precision meaningful", () => {
    const unitPart = { ...part, calculationRules: [{ kind: "unit" as const, label: "p", expected: 2, unitAliases: ["Pa"] }] };
    expect(markCalculationWorking(unitPart, "p = 2 Pa")?.awarded).toBe(1);
    expect(markCalculationWorking(unitPart, "p = 2 pA")?.awarded).toBe(0);
    const precisionPart = { ...part, calculationRules: [{ kind: "precision" as const, label: "v", expected: 6, significantFigures: 2 }] };
    expect(markCalculationWorking(precisionPart, "v = 6.0")?.awarded).toBe(1);
    expect(markCalculationWorking(precisionPart, "v = 6/1")?.awarded).toBe(0);
  });
});
