import Link from "next/link";
import { Panel, SectionHeading } from "@/components/ui";

// Technical case study — the strong technical case the brief asks for.
// Static content (no client state) so it is fast, SEO-clean and readable
// without JS. Every claim links to a harness that can reproduce it.

export default function CaseStudyPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">How Revise knows what to revise</h1>
        <p className="text-sm text-ink3 mt-2">
          A revision engine that ranks by expected marks per minute, schedules with FSRS,
          and tells you exactly which mark-scheme points you dropped — offline. This is how
          it is built and how you can check it.
        </p>
        <p className="text-xs text-ink3 mt-2">
          Companion: <Link className="underline" href="/benchmarks">Benchmarks & results</Link> ·{" "}
          <a className="underline" href="/docs/benchmark.md">Benchmark docs</a> ·{" "}
          <a className="underline" href="/docs/revision-engine.md">Revision engine</a>
        </p>
      </header>

      <section className="space-y-3">
        <SectionHeading title="1. The problem" hint="Why a recommendation engine, not a library" />
        <Panel>
          <p className="text-sm text-ink2">
            Past papers, flashcards, and a blank timetable do not tell a student what to do
            next. The highest-leverage hour is rarely the most obvious topic. Revise treats
            revision as an allocation problem: given a fixed budget of minutes and a set of
            topics each leaking marks at a different rate, pick the one that recovers the most
            exam marks per minute — then do it again tomorrow with updated evidence.
          </p>
          <p className="text-sm text-ink2 mt-3">
            The engine is board-agnostic (WJEC/AQA/Edexcel/OCR × A-level/GCSE today, one
            curriculum module per subject) and works with no network and no AI key.
            Recommendations carry a first-class explanation so the UI never paraphrases a
            number the engine did not compute.
          </p>
        </Panel>
      </section>

      <section className="space-y-3">
        <SectionHeading title="2. What the engine decides" />
        <Panel>
          <ul className="text-sm text-ink2 space-y-2 list-disc list-inside">
            <li><strong>Score</strong> — <code className="font-mono text-xs">score ≈ examGain × urgency × weakness × forgetting × uncertainty ÷ minutes</code>, each factor in 0.7–2.0 so no single factor dominates. Displayed as weighted marks per minute.</li>
            <li><strong>Urgency / proximity</strong> — days-to-exam drives <code className="font-mono text-xs">examUrgency</code> (1→2) and <code className="font-mono text-xs">examProximityMultiplier</code> (1→1.45) inside 21 days.</li>
            <li><strong>Weakness / forgetting</strong> — <code className="font-mono text-xs">weaknessFactor(mastery)</code> and <code className="font-mono text-xs">forgettingFactor(retention, daysSince)</code> allocate the steepest gains to the weakest, most decayed topics.</li>
            <li><strong>Uncertainty</strong> — thin evidence intentionally boosts a topic so the planner explores rather than prematurely exploits.</li>
            <li><strong>Adaptive difficulty</strong> — rolling accuracy nudges the candidate set toward the right stretch (±15%), bounded so it never overrides urgency.</li>
            <li><strong>Outcome history</strong> — real <code className="font-mono text-xs">simulatePaper → laterPaper.actualMarks</code> pairs refine the ranking; synthetic pairs keep CI deterministic until real outcomes ship.</li>
          </ul>
          <p className="text-xs text-ink3 mt-3">
            Source: <code className="font-mono">src/domain/recommender.ts</code> · pinned by{" "}
            <code className="font-mono">tests/recommender.benchmark.test.ts</code> (400 states) and{" "}
            <code className="font-mono">tests/recommender.factors.test.ts</code> (monotone + bounds).
          </p>
        </Panel>
      </section>

      <section className="space-y-3">
        <SectionHeading title="3. The rest of the engine" />
        <div className="grid sm:grid-cols-2 gap-3">
          <Panel>
            <h3 className="text-sm font-semibold">Spaced repetition (FSRS)</h3>
            <p className="text-xs text-ink2 mt-1">Stability + difficulty, fuzz on, short-term steps off. Again → reinsert four cards later in the same session. Forgetting curve <code className="font-mono text-[11px]">R=(1+(19/81)·t/S)^-0.5</code> drives retention.</p>
            <p className="text-[11px] text-ink3 mt-1">src/domain/scheduling.ts · src/domain/fsrs-tuning.ts</p>
          </Panel>
          <Panel>
            <h3 className="text-sm font-semibold">Mastery</h3>
            <p className="text-xs text-ink2 mt-1">Evidence-weighted blend of stability, retention and question accuracy. Unmeasured = 0, never a phantom 40% prior. Weak only if mastery &lt; 0.55 with evidence.</p>
            <p className="text-[11px] text-ink3 mt-1">src/domain/mastery.ts · src/domain/mastery-uncertainty.ts · src/domain/knowledge-tracing.ts</p>
          </Panel>
          <Panel>
            <h3 className="text-sm font-semibold">Marking</h3>
            <p className="text-xs text-ink2 mt-1">Keyword + lemma overlap ≥50% per scheme point or numeric match; 3-word cap, proportional award. MCQs routed instantly; every answer labelled rubric vs AI.</p>
            <p className="text-[11px] text-ink3 mt-1">src/domain/marking.ts · src/domain/diagrams.ts</p>
          </Panel>
          <Panel>
            <h3 className="text-sm font-semibold">Mistake loop</h3>
            <p className="text-xs text-ink2 mt-1">Dropped mark → classified mistake (recall/method/arithmetic/interpretation/communication) → flashcard → recalled reliably twice → resolved. First-error-step + remediation.</p>
            <p className="text-[11px] text-ink3 mt-1">src/domain/mistakes.ts</p>
          </Panel>
          <Panel>
            <h3 className="text-sm font-semibold">Grade prediction</h3>
            <p className="text-xs text-ink2 mt-1">Coverage + measured accuracy blended by trust (n/10). Output is always a band + confidence + range, never a single letter. Headroom = “percent if this one topic went to 1.0”.</p>
            <p className="text-[11px] text-ink3 mt-1">src/domain/grades.ts · calibrateFromHistory</p>
          </Panel>
          <Panel>
            <h3 className="text-sm font-semibold">Planning</h3>
            <p className="text-xs text-ink2 mt-1">Availability → blocks → largest-remainder allocation by urgency × deficit → per-subject topic picking with spacing penalty. Missed sessions fold forward. Derived, not a document.</p>
            <p className="text-[11px] text-ink3 mt-1">src/domain/planner.ts · src/domain/retention-analytics.ts</p>
          </Panel>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading title="4. Verifying the claims" hint="The same harnesses the benchmarks page runs live" />
        <Panel>
          <ul className="text-sm text-ink2 space-y-1.5 list-disc list-inside">
            <li><strong>Recommendation quality</strong> — <code className="font-mono text-xs">syntheticOutcomePairs</code> + <code className="font-mono text-xs">benchmarkRecommendationQuality</code> → MAE / bias / correlation / hitRate(±5). Live on <Link className="underline" href="/benchmarks">/benchmarks</Link>.</li>
            <li><strong>Calibration</strong> — <code className="font-mono text-xs">calibrationReport</code> → Brier / ECE / bias; well-calibrated is ECE &lt; 0.08. Same harness, real pairs when ≥3 timed papers exist.</li>
            <li><strong>Curriculum</strong> — <code className="font-mono text-xs">scripts/validate-curriculum.mjs</code> + <code className="font-mono text-xs">src/domain/coverage.ts</code> — 440 topics / 302 questions; every topic has specPoints; every specPointIds is paired with learningClaims.</li>
            <li><strong>Offline & sync</strong> — <code className="font-mono text-xs">tests/sync.test.ts</code> (node smoke) + <code className="font-mono text-xs">e2e/offline.spec.ts</code> (Playwright) + <code className="font-mono text-xs">src/data/sync.ts</code> (IndexedDB truth, outbox, LWW).</li>
            <li><strong>Perf & security & WCAG</strong> — curriculum ≤100k / domain ≤120k, validation &lt;1.5s, build &lt;80MB; <code className="font-mono text-xs">/_next/static</code> immutable + <code className="font-mono text-xs">/api</code> no-store; RLS on every user table; skip-link + Main/Primary/banner landmarks + combobox/listbox/option + live regions; pinned in <code className="font-mono text-xs">tests/a11y.test.ts</code> + <code className="font-mono text-xs">tests/perf.test.ts</code>.</li>
          </ul>
          <p className="text-xs text-ink2 mt-3">How to reproduce locally:</p>
          <pre className="mt-2 text-[11px] bg-surface2 p-3 rounded-[8px] overflow-auto nice-scroll">npm --prefix apps/revise run type-check
node apps/revise/scripts/validate-curriculum.mjs
npm --prefix apps/revise test -- --run
npx --prefix apps/revise playwright test --reporter=list   # with browsers
npm --prefix apps/revise run build</pre>
        </Panel>
      </section>

      <section className="space-y-3">
        <SectionHeading title="5. What changes when real outcomes arrive" />
        <Panel>
          <p className="text-sm text-ink2">Nothing structural. Synthetic pairs are the stand-in; real pairs are the upgrade. The same functions compute the same numbers:</p>
          <ul className="text-sm text-ink2 mt-2 space-y-1 list-disc list-inside">
            <li><code className="font-mono text-xs">syntheticOutcomePairs → (simulatePaper.predictedMarks, laterTimedPaper.actualMarks)</code></li>
            <li><code className="font-mono text-xs">syntheticCalibrationOutcomes → (predictGrade.percent/100, laterPaperPercent/100)</code></li>
            <li>Marking gold is tracked per part as <code className="font-mono text-xs">questionId → (rubricAward, aiAward, humanAward)</code>; <code className="font-mono text-xs">scoreMarkerDisagreement</code> reports pairwise MAE, agreement and signed bias, while <code className="font-mono text-xs">mark-escalation.ts</code> sends low-confidence AI marks to the durable human-review queue.</li>
          </ul>
          <p className="text-xs text-ink3 mt-3">
            The benchmarks page will sprout a cohort table at that point; the synthetic curtain stays as the “CI provenance” panel so the ledger never loses its history.
          </p>
        </Panel>
      </section>

      <section className="space-y-3">
        <SectionHeading title="6. Provenance for every claim" />
        <Panel>
          <ul className="text-xs text-ink2 space-y-1 list-disc list-inside">
            <li>Specs: <code className="font-mono">Subject.spec</code> + <code className="font-mono">SPEC_MANIFEST</code> (version, lastChecked, paper breakdown).</li>
            <li>Statements: <code className="font-mono">Topic.specPoints[]</code> — stable id, board ref, learning claim, AO, source/verification/reviewer/lastChecked/specVersion.</li>
            <li>Cards & questions: <code className="font-mono">Card.specPointIds</code>, <code className="font-mono">QuestionPart.specPointIds + learningClaims</code> (1:1 with markScheme).</li>
            <li>Coverage: <code className="font-mono">src/domain/coverage.ts</code> → specPointsTotal / Verified / Learnable / Assessable / statementCoverage.</li>
          </ul>
        </Panel>
      </section>
    </div>
  );
}
