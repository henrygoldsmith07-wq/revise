"use client";

// Runs one stage of an Exam Mission: questions chosen for the mission's weakness
// across its topics, with support set by the stage, and every attempt carrying
// the mission, stage, method, target cause and source mistakes.

import { useState } from "react";
import { stageForRoute, buildMissionSession, type MissionSession } from "@/domain/mission-session";
import { collectMissions } from "@/domain/revision-engine";
import { useStoreFields } from "@/state/store";
import { QuestionSetSession } from "./QuestionSetSession";
import { SessionEvidenceBlock } from "./SessionEvidenceBlock";
import { useRecoveryEvidence } from "./recovery-evidence";

export function MissionSessionMode({ missionId, stage, onExit }: { missionId: string; stage: string | null; onExit: () => void }) {
  const store = useStoreFields("attempts", "examDates", "mistakes", "papers", "questions");
  const ev = useRecoveryEvidence();
  const [session] = useState<MissionSession | null>(() => {
    const mission = collectMissions({
      mistakes: ev.mistakes, recovery: ev.recovery, examDates: store.examDates, now: new Date(), supplyByTopic: ev.supplyByTopic, topicTitle: ev.topicTitle,
      paperTitles: Object.fromEntries(store.papers.map((p) => [p.id, p.title])), includeProven: true,
    }).find((m) => m.id === missionId);
    return mission ? buildMissionSession(mission, { questions: store.questions, attempts: store.attempts, mistakes: ev.mistakes }, stageForRoute(stage)) : null;
  });

  return (
    <QuestionSetSession
      title={session?.title ?? "Exam mission"}
      hint={session ? session.steps.map((s) => s.title).join(" · ") || "Nothing to run at this stage" : "Mission not found"}
      questionIds={session?.questionIds ?? []}
      startLabel="Start mission step"
      exitLabel="Back to Today"
      emptyBody={session?.limit ?? "This mission has nothing to run right now. Today will show what to do next."}
      onExit={onExit}
      hintBudgetFor={session?.hintBudgetFor}
      contextFor={session?.contextFor}
      intro={session ? (
        <>
          {session.intro.map((line) => <p key={line}>{line}</p>)}
          {session.steps.map((step) => (
            <p key={step.id}><span className="font-semibold">{step.title}:</span> {step.why}{step.verified ? "" : " Some of these questions have not been human-verified, so they are practice only."}</p>
          ))}
          {session.limit ? <p className="font-semibold">{session.limit}</p> : null}
        </>
      ) : null}
      renderSummary={(attempts) => <SessionEvidenceBlock attempts={attempts} />}
    />
  );
}
