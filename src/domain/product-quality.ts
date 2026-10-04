import type { FlagshipReadiness } from "./flagship-readiness";
import type { PilotReport } from "./pilot-evidence";
import type { markingEvidenceReport } from "./marking-evidence";

export function productQualityReport(input: { content: readonly FlagshipReadiness[]; pilot: PilotReport; marking: ReturnType<typeof markingEvidenceReport>;
  reliability?: { syncFailures: number; persistenceFailures: number; aiFallbacks: number; aiRequests: number; paperImports: number; paperImportsNeedingReview: number } }) {
  const blockers: { rank: number; kind: string; detail: string; nextAction: string }[] = [];
  if (input.reliability && (Object.values(input.reliability).some(n => !Number.isInteger(n) || n < 0) ||
    input.reliability.aiFallbacks > input.reliability.aiRequests || input.reliability.paperImportsNeedingReview > input.reliability.paperImports)) throw new Error("Reliability needs non-negative observed counts with valid denominators.");
  const blocked = input.content.reduce((n, s) => n + s.blockedTopics.length, 0);
  const add = (kind: string, detail: string, nextAction: string) => blockers.push({ rank: blockers.length + 1, kind, detail, nextAction });
  if (blocked) add("trusted-content", `${blocked} subject-topic rows cannot run the complete proof loop.`, "Run npm run wjec:campaign and obtain two genuine independent human reviews on the selected exact versions.");
  if (input.marking.genuineIndependentAnswers < input.marking.phaseOneTarget) add("human-marking", `${input.marking.genuineIndependentAnswers}/${input.marking.phaseOneTarget} genuine independently double-marked answers.`, "Collect anonymised consented student answers and export blind marking packs.");
  if (input.pilot.learners < input.pilot.minLearners) add("learner-evidence", `${input.pilot.learners} pilot learners; headline shares require ${input.pilot.minLearners} distinct learners at each step.`, "Recruit a consented real learner pilot; collect local pilot exports after follow-up windows.");
  if (input.pilot.proof.learnersBlockedBySupply) add("pilot-proof-blocked", `${input.pilot.proof.learnersBlockedBySupply} learners have repaired marks but no fresh reviewed question.`, "Prioritise the blocked topics in the next content campaign.");
  if (input.reliability && (input.reliability.syncFailures || input.reliability.persistenceFailures)) add("persistence", `${input.reliability.syncFailures} sync / ${input.reliability.persistenceFailures} persistence failures observed.`, "Investigate failed durable writes and outbox recovery before expanding the pilot.");
  if (!input.reliability) add("deployment-evidence", "Configured staging and production reliability have not been supplied to this report.", "Run authenticated staging journeys with two independent accounts and provide measured reliability counts.");
  for (const s of input.content) if (s.questionsRequiringReReview.length) add("stale-content", `${s.label}: ${s.questionsRequiringReReview.length} changed question versions need fresh review.`, "Re-export changed questions; never carry previous approvals across fingerprints.");
  return { content: input.content, pilot: input.pilot, marking: input.marking,
    reliability: input.reliability ? { ...input.reliability, status: "OBSERVED COUNTS; DEPLOYMENT EXTERNALLY UNVERIFIED",
      aiFallbackRate: input.reliability.aiRequests >= 20 ? input.reliability.aiFallbacks / input.reliability.aiRequests : null,
      paperImportReviewRate: input.reliability.paperImports >= 20 ? input.reliability.paperImportsNeedingReview / input.reliability.paperImports : null,
    } : { status: "EXTERNALLY UNVERIFIED", syncFailures: null, persistenceFailures: null, aiFallbackRate: null, paperImportReviewRate: null },
    blockers, biggestBottleneck: blockers[0] ?? null,
    claimStatus: { productLearningImprovement: "NOT VALIDATED", markingQuality: "NOT VALIDATED" },
    note: "This internal surface separates operational health, observed learning/retention/proof outcomes, and absent external evidence. Synthetic tests cannot validate product-wide learning or deployed account isolation.",
  };
}
