"use client";

import Link from "next/link";
import { getSubject } from "@/domain/curriculum";
import { useStoreFields } from "@/state/store";
import { ExamReadinessCard } from "@/components/ExamReadinessCard";
import { MarksAtRiskPanel } from "@/components/MarksAtRiskPanel";
import { ProgressSummaryPanel } from "@/components/ProgressSummaryPanel";
import { PaperReadinessPanel } from "@/components/PaperReadinessPanel";
import { MistakePatternsPanel } from "@/components/MistakePatternsPanel";
import { RecommendationAuditPanel } from "@/components/RecommendationAuditPanel";
import { ProofPanel } from "@/components/ProofPanel";
import { RealWorldEvidencePanel, RecoverySummaryPanel } from "@/components/RecoverySummary";
import { GradePredictionRealityPanel } from "@/components/GradePredictionRealityPanel";
import { ExamCommandCentre, ImprovementStory } from "@/components/ExamCommandCentre";
import { InterventionMemoryPanel } from "@/components/InterventionMemoryPanel";
import { AdvancedEvidence } from "@/components/AdvancedEvidence";
import { StudentOnly, TeacherModeToggle, TeacherOnly } from "@/components/TeacherMode";
import {
  ApplicationMasteryCard,
  MarksLostByCause,
  MasteryUncertaintyCard,
  RecallMasteryCard,
  RecurringMisconceptions,
} from "@/components/AssessmentPanels";
import { ButtonLink, Panel } from "@/components/ui";
import { ReadinessAutopilot } from "@/components/ReadinessAutopilot";

// Progress answers, in this order: how are my exams going and what do I do
// about it (Exam Command Centre), what has been proven to work (improvement
// and intervention memory), then the four plain questions. Every specialist
// panel stays available, one tap away, in the same order as before so the
// evidence trail is unchanged; nothing below the fold competes with a decision.
// The autopilot sits above them all: if the exam were today, where would you
// stand, and what should happen next.

export default function ReadinessPage() {
  const store = useStoreFields("examReadinessSummary");
  const weakest = store.examReadinessSummary.weakestSubjectId;
  const weakestSubject = weakest ? getSubject(weakest) : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">How you are doing</p>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mt-1">Readiness</h1>
        <p className="text-sm text-ink3 mt-1 max-w-3xl">
          If the exam were today, where would you stand? What is strong, weak, unproven, at risk — what has been proven to work — and what should happen next. Numbers appear only when there is evidence behind them.
        </p>
      </header>

      <ReadinessAutopilot />

      <ExamCommandCentre />

      <div className="grid gap-4 lg:grid-cols-2">
        <ImprovementStory />
        <InterventionMemoryPanel />
      </div>

      <ProgressSummaryPanel />

      <AdvancedEvidence summary="Detailed readiness and evidence">
        <TeacherModeToggle />

        <ExamReadinessCard />

        <PaperReadinessPanel />

        <ProofPanel />
        <RecoverySummaryPanel />
        <RealWorldEvidencePanel />

        <RecommendationAuditPanel />

        <MarksAtRiskPanel />

        <MistakePatternsPanel />

        <GradePredictionRealityPanel />

        <section aria-labelledby="evidence-split-heading" className="space-y-4">
          <h2 id="evidence-split-heading" className="text-base font-semibold text-ink">Remembering it versus using it</h2>
          <p className="text-sm text-ink3 max-w-3xl">
            Remembering a fact is not the same as using it for marks, so the two are measured separately. These panels show which one is holding you back.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <RecallMasteryCard />
            <ApplicationMasteryCard />
          </div>
          <MarksLostByCause />
          <div className="grid gap-4 lg:grid-cols-2">
            <RecurringMisconceptions />
            <MasteryUncertaintyCard />
          </div>
        </section>

        <div className="space-y-2 text-sm text-ink3 max-w-3xl">
          <h2 className="text-base font-semibold text-ink">How readiness is worked out</h2>
          <StudentOnly>
            <p>Readiness combines progress towards your target grade, how much of the course you have covered, your marks, how well you remember, your exam pace and how you do on new questions after a break.</p>
          </StudentOnly>
          <TeacherOnly>
            <p>Readiness weighs progress towards your target grade (30%), how much of the course you have covered (20%), marked accuracy (15%), how well you remember (15%), exam pace (10%) and success on new kinds of question after a delay (10%).</p>
          </TeacherOnly>
          <p>Missing evidence is shown as missing, never quietly counted as a pass. How sure Revise is about the result is shown separately from the result itself.</p>
          <p>“Ready to prove” means the result is high, the evidence is broad and nothing serious is in the way. It is a signal to try a proof set, not a promise about the exam.</p>
        </div>
      </AdvancedEvidence>

      <Panel className="border-accent">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Close the loop</p>
            <h2 className="text-base font-semibold text-ink mt-1">Use the passport to choose the next proof, not just the next topic.</h2>
            <p className="text-sm text-ink3 mt-1 max-w-2xl">
              Today selects the next bounded learning window; the Digital Twin audits that same decision. This passport tells you which kind of evidence the block needs to create before you trust the result.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 max-w-full sm:shrink-0">
            <ButtonLink href="/twin" size="sm" variant="primary">Open Digital Twin</ButtonLink>
            <ButtonLink href="/diagnostic" size="sm">Starting diagnostic</ButtonLink>
            {weakestSubject ? <ButtonLink href={`/practice?subject=${encodeURIComponent(weakestSubject.id)}`} size="sm">Practise {weakestSubject.name}</ButtonLink> : null}
          </div>
        </div>
      </Panel>

      <nav aria-label="Specialist views" className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink3">
        <Link href="/schedule" className="inline-flex min-h-11 items-center hover:text-ink hover:underline">Plan the run-up to your exams →</Link>
        <Link href="/twin" className="inline-flex min-h-11 items-center hover:text-ink hover:underline">How your plan was chosen →</Link>
        <Link href="/diagnostic" className="inline-flex min-h-11 items-center hover:text-ink hover:underline">Starting diagnostic →</Link>
        <Link href="/readiness/spec" className="inline-flex min-h-11 items-center hover:text-ink hover:underline">Evidence for every specification statement →</Link>
        <Link href="/readiness/trusted-coverage" className="inline-flex min-h-11 items-center hover:text-ink hover:underline">Which content has been checked →</Link>
      </nav>
    </div>
  );
}
