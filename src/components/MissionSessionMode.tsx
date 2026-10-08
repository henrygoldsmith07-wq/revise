"use client";

// Runs one stage of an Exam Mission: questions chosen for the mission's weakness
// across its topics, with support set by the stage, and every attempt carrying
// the mission, stage, method, target cause and source mistakes.

import { useCallback, useState } from "react";
import { stageForRoute, buildMissionSession, missionCheckpoint, missionResumePosition, restoreMissionSession, type MissionSession } from "@/domain/mission-session";
import { collectMissions } from "@/domain/revision-engine";
import { useStoreFields } from "@/state/store";
import { QuestionSetSession } from "./QuestionSetSession";
import { SessionEvidenceBlock } from "./SessionEvidenceBlock";
import { ProofCheckBanner } from "./ProofCheckBanner";
import { captureProductEvent } from "@/lib/product-telemetry";
import { useRecoveryEvidence, useRevisionPlan } from "./recovery-evidence";

export function MissionSessionMode({ missionId, stage, onExit }: { missionId: string; stage: string | null; onExit: () => void }) {
  const store = useStoreFields("attempts", "clearRevisionCheckpoint", "examDates", "mistakes", "papers", "questions", "revisionCheckpoint", "saveRevisionCheckpoint", "recordFunnel");
  const { saveRevisionCheckpoint, clearRevisionCheckpoint, recordFunnel } = store;
  const ev = useRecoveryEvidence();
  const { plan } = useRevisionPlan();
  const [{ session, resume, startedAt }] = useState(() => {
    const mission = collectMissions({
      mistakes: ev.mistakes, recovery: ev.recovery, examDates: store.examDates, now: new Date(), supplyByTopic: ev.supplyByTopic, topicTitle: ev.topicTitle,
      paperTitles: Object.fromEntries(store.papers.map((p) => [p.id, p.title])), includeProven: true,
    }).find((m) => m.id === missionId);
    const fresh: MissionSession | null = mission ? buildMissionSession(mission, { questions: store.questions, attempts: store.attempts, mistakes: ev.mistakes }, stageForRoute(stage)) : null;
    // A refresh mid-step resumes the saved step exactly; rebuilding would pick different questions.
    const known = new Set(store.questions.map((q) => q.id));
    const saved = store.revisionCheckpoint?.mission;
    const restored = fresh ? restoreMissionSession(fresh, saved, { missionId, stage }, (id) => known.has(id)) : null;
    if (fresh && restored && saved) {
      const done = store.attempts.filter((a) => a.createdAt >= saved.startedAt && a.mission?.missionId === missionId && restored.questionIds.includes(a.questionId));
      return { session: restored, resume: { index: missionResumePosition(restored.questionIds, done, saved.startedAt), attempts: done }, startedAt: saved.startedAt };
    }
    return { session: fresh, resume: undefined, startedAt: new Date().toISOString() };
  });
  const onProgress = useCallback((position: number) => {
    if (!session || position >= session.questionIds.length) return;
    if (position === 0) {
      void recordFunnel("revision_task_started", `action:${missionId}:${session.stage}`);
      captureProductEvent("intervention.started", { kind: session.stage });
      if (session.stage === "delayed-proof") captureProductEvent("proof.attempted", { kind: session.stage });
    }
    void saveRevisionCheckpoint(missionCheckpoint(session, { stage }, startedAt, position));
  }, [saveRevisionCheckpoint, session, stage, startedAt, missionId, recordFunnel]);
  const onFinished = useCallback(() => {
    void clearRevisionCheckpoint();
    if (session) {
      void recordFunnel("recommendation_completed", `action:${missionId}:${session.stage}`);
      captureProductEvent("recommendation.completed", { kind: session.stage });
      captureProductEvent("intervention.completed", { kind: session.stage });
    }
  }, [clearRevisionCheckpoint, missionId, recordFunnel, session]);
  const exit = useCallback(() => {
    void clearRevisionCheckpoint();
    captureProductEvent("session.abandoned", { kind: session?.stage ?? "mission" });
    onExit();
  }, [clearRevisionCheckpoint, onExit, session?.stage]);

  return (
    <QuestionSetSession
      title={session?.title ?? "Exam mission"}
      hint={session ? session.steps.map((s) => s.title).join(" · ") || "Nothing to run at this stage" : "Mission not found"}
      questionIds={session?.questionIds ?? []}
      startLabel="Start mission step"
      exitLabel="Back to Today"
      emptyBody={session?.limit ?? "This mission has nothing to run right now. Today will show what to do next."}
      onExit={exit}
      resume={resume}
      onProgress={onProgress}
      onFinished={onFinished}
      hintBudgetFor={session?.hintBudgetFor}
      contextFor={session?.contextFor}
      intro={session ? (
        <>
          {session.stage === "delayed-proof" ? (
            <ProofCheckBanner
              href={`/adaptive-session?topic=${encodeURIComponent(session.questionIds[0] ?? "")}&start=1&proof=1`}
              state="due"
            />
          ) : null}
          {session.intro.map((line) => <p key={line}>{line}</p>)}
          {session.steps.map((step) => (
            <p key={step.id}><span className="font-semibold">{step.title}:</span> {step.why}{step.verified ? "" : " Some of these questions have not been reviewed yet, so they are practice only."}</p>
          ))}
          {session.limit ? <p className="font-semibold">{session.limit}</p> : null}
        </>
      ) : null}
      nextStep={plan.top ? { href: plan.top.route.href, label: `Continue: ${plan.top.title}`, detail: `${plan.top.title}, about ${Math.ceil(plan.top.minutes)} min. ${plan.top.explanation.stake}` } : null}
      renderSummary={(attempts) => <SessionEvidenceBlock attempts={attempts} />}
    />
  );
}
