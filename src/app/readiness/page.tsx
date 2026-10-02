"use client";

import Link from "next/link";
import { getSubject } from "@/domain/curriculum";
import { useStoreFields } from "@/state/store";
import { ExamReadinessCard } from "@/components/ExamReadinessCard";
import { MarksAtRiskPanel } from "@/components/MarksAtRiskPanel";
import { PaperReadinessPanel } from "@/components/PaperReadinessPanel";
import { MistakePatternsPanel } from "@/components/MistakePatternsPanel";
import { RecommendationAuditPanel } from "@/components/RecommendationAuditPanel";
import { ProofPanel } from "@/components/ProofPanel";
import { GradePredictionRealityPanel } from "@/components/GradePredictionRealityPanel";
import {
  ApplicationMasteryCard,
  MarksLostByCause,
  MasteryUncertaintyCard,
  RecallMasteryCard,
  RecurringMisconceptions,
} from "@/components/AssessmentPanels";
import { ButtonLink, Panel } from "@/components/ui";

export default function ReadinessPage() {
  const store = useStoreFields("examReadinessSummary");
  const weakest = store.examReadinessSummary.weakestSubjectId;
  const weakestSubject = weakest ? getSubject(weakest) : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Proof layer</p>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mt-1">Exam Readiness Passport</h1>
        <p className="text-sm text-ink3 mt-1 max-w-3xl">
          A subject is not ready because a dashboard says so. It is ready when the grade forecast, recall, timing and unfamiliar-context performance agree.
        </p>
      </header>

      <ExamReadinessCard />

      <PaperReadinessPanel />

      <ProofPanel />

      <RecommendationAuditPanel />

      <MarksAtRiskPanel />

      <MistakePatternsPanel />

      <GradePredictionRealityPanel />

      <section aria-labelledby="evidence-split-heading" className="space-y-4">
        <h2 id="evidence-split-heading" className="text-base font-semibold text-ink">The evidence behind the score</h2>
        <p className="text-sm text-ink3 max-w-3xl">
          Recall and application are measured separately: remembering a fact is not the same as using it for marks. These panels show which of the two is holding the readiness score back.
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

      <Panel className="border-accent">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Close the loop</p>
            <h2 className="text-base font-semibold text-ink mt-1">Use the passport to choose the next proof, not just the next topic.</h2>
            <p className="text-sm text-ink3 mt-1 max-w-2xl">
              Today selects the next bounded learning window; the Digital Twin audits that same decision. This passport tells you which kind of evidence the block needs to create before you trust the result.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <ButtonLink href="/twin" size="sm" variant="primary">Open Digital Twin</ButtonLink>
            <ButtonLink href="/diagnostic" size="sm">Starting diagnostic</ButtonLink>
            {weakestSubject ? <ButtonLink href={`/practice?subject=${encodeURIComponent(weakestSubject.id)}`} size="sm">Practise {weakestSubject.name}</ButtonLink> : null}
          </div>
        </div>
      </Panel>

      <p className="text-xs text-ink3">Reviewing content? See <Link href="/readiness/coverage" className="underline">trusted coverage</Link>.</p>

      <details className="card p-4 sm:p-5">
        <summary className="cursor-pointer text-sm font-semibold text-ink">How the passport is scored</summary>
        <div className="mt-3 space-y-2 text-sm text-ink3 max-w-3xl">
          <p>The score weighs target-grade progress (30%), syllabus coverage (20%), marked accuracy (15%), recall retention (15%), exam pace (10%) and delayed unfamiliar-context transfer (10%).</p>
          <p>Missing evidence is shown as missing, not silently treated as a pass. The confidence percentage tells you how much data supports the score; it is deliberately separate from the score itself.</p>
          <p>“Ready to prove” means the score is high, evidence is broad, and there is no high-severity blocker. It is a gate for attempting a proof set, not a promise about a final exam result.</p>
        </div>
      </details>

      <nav aria-label="Readiness follow-up" className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink3">
        <Link href="/practice" className="hover:text-ink hover:underline">Practise the highest-yield gap →</Link>
        <Link href="/readiness/spec" className="hover:text-ink hover:underline">See the evidence behind every specification statement →</Link>
        <Link href="/schedule" className="hover:text-ink hover:underline">Adjust the plan →</Link>
      </nav>
    </div>
  );
}
