"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button, Panel } from "@/components/ui";
import { checkTechniqueDrill, TECHNIQUE_CONTEXT, TECHNIQUE_DRILLS, techniqueDrillHistory, techniqueSubmissionPatch, type TechniqueDrillId, type TechniqueFeedback } from "@/domain/technique-drills";
import { useStoreFields } from "@/state/store";

export default function TechniquePage() {
  const { userId } = useStoreFields("userId");
  return <TechniqueExercises key={userId} />;
}

function TechniqueExercises() {
  const store = useStoreFields("settings", "updateSettings");
  const [drillId, setDrillId] = useState<TechniqueDrillId>("describe");
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<TechniqueFeedback | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const submitting = useRef(false);
  const drill = TECHNIQUE_DRILLS.find((candidate) => candidate.id === drillId)!;
  const history = techniqueDrillHistory(store.settings);

  async function submit() {
    if (!answer.trim() || submitting.current) return;
    submitting.current = true;
    const result = checkTechniqueDrill(drillId, answer);
    setFeedback(result);
    setSaveState("saving");
    try {
      await store.updateSettings(techniqueSubmissionPatch(store.settings, {
        id: crypto.randomUUID(), drillId, submittedAt: new Date().toISOString(),
        detectedChecks: result.checks.filter((check) => check.detected).map((check) => check.id),
      }));
      setSaveState("saved");
    } catch {
      setSaveState("failed");
    } finally {
      submitting.current = false;
    }
  }

  function chooseDrill(id: TechniqueDrillId) {
    setDrillId(id);
    setAnswer("");
    setFeedback(null);
    setSaveState("idle");
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <header>
        <p className="text-xs uppercase tracking-wide text-ink3">Exam technique</p>
        <h1 className="text-xl font-semibold mt-1">Make the command word work for you</h1>
        <p className="text-sm text-ink3 mt-2">Short describe, explain and evaluate drills, plus a 6-mark-style response plan. These generic writing exercises work without a reviewed question bank.</p>
        <Link href="/practicals" className="inline-flex min-h-11 items-center underline text-sm">Explore practical-topic pathways</Link>
      </header>

      <Panel>
        <h2 className="font-semibold text-sm">Choose a structure drill</h2>
        <div role="group" aria-label="Technique drill" className="flex flex-wrap gap-2 mt-3">
          {TECHNIQUE_DRILLS.map((option) => <Button key={option.id} aria-pressed={drillId === option.id} variant={drillId === option.id ? "primary" : "secondary"} disabled={saveState === "saving"} onClick={() => chooseDrill(option.id)}>{option.title}</Button>)}
        </div>
        <p className="text-xs text-ink3 mt-3">Describe: what happens. Explain: why or how. Evaluate: weigh evidence and decide. A longer answer needs connected reasoning, not a guaranteed number of marks.</p>
      </Panel>

      <Panel>
        <h2 className="text-sm font-semibold">Fictional context</h2>
        <p className="mt-2 text-sm">{TECHNIQUE_CONTEXT}</p>
        <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <label htmlFor="technique-answer" className="block font-semibold text-sm">{drill.prompt}</label>
          <p id="technique-guidance" className="text-sm text-ink3">{drill.guidance}</p>
          <textarea id="technique-answer" aria-describedby="technique-guidance technique-limits" className="w-full rounded-xl border border-line bg-surface p-3 min-h-40 text-sm" rows={6} maxLength={3000} value={answer} disabled={saveState === "saving"} onChange={(event) => { setAnswer(event.target.value); setFeedback(null); setSaveState("idle"); }} />
          <p id="technique-limits" className="text-xs text-ink3">Structure signals only, not a mark or a check of factual correctness. Your response is not stored or sent to an AI service.</p>
          <Button type="submit" variant="primary" disabled={!answer.trim() || saveState === "saving" || saveState === "saved"}>{saveState === "saving" ? "Saving submission…" : saveState === "failed" ? "Retry saving this check" : "Check response structure"}</Button>
        </form>
      </Panel>

      <div role="status" aria-live="polite" aria-atomic="true" className="text-sm text-ink3">
        {saveState === "saved" ? "Submission saved on this device; only the drill, time and detected shape signals are kept." : saveState === "failed" ? "Feedback is available, but saving could not be confirmed. Retry before leaving if you want this submission recorded." : saveState === "saving" ? "Saving your submission on this device." : null}
      </div>
      {feedback ? <Panel>
        <h2 className="text-sm font-semibold">Structure feedback — not a mark</h2>
        <p className="text-sm text-ink3 mt-2">{feedback.disclaimer}</p>
        <ul className="mt-3 space-y-3">
          {feedback.checks.map((check) => <li key={check.id} className="text-sm">
            <p className="font-medium">{check.label}: {check.detected ? "signal detected" : "not detected"}</p>
            <p className="text-ink3 text-xs mt-1">{check.detected ? "Check whether this wording actually supports your answer; a keyword alone is not enough." : check.nextStep}</p>
          </li>)}
        </ul>
      </Panel> : null}

      <Panel>
        <details key={drillId}>
          <summary className="cursor-pointer min-h-11 text-sm font-semibold">Show one possible {drill.title.toLowerCase()} response</summary>
          <p className="whitespace-pre-line text-sm mt-2">{drill.example}</p>
          <p className="text-xs text-ink3 mt-2">An illustrative structure, not an examiner-approved answer or a mark scheme. Your wording can differ.</p>
        </details>
      </Panel>
      <Panel>
        <h2 className="text-sm font-semibold">Your recorded practice</h2>
        <p className="text-xs text-ink3 mt-1">Most recent 30 submitted drills on this profile. Counts show activity, not ability, mastery or exam readiness. Settings sync uses last-write-wins, so simultaneous edits on different devices may replace this history.</p>
        <ul className="grid sm:grid-cols-2 gap-2 mt-3 text-sm">
          {TECHNIQUE_DRILLS.map((option) => <li key={option.id}>{option.title}: {history.filter((entry) => entry.drillId === option.id).length} submissions</li>)}
        </ul>
      </Panel>
    </div>
  );
}
