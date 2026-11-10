"use client";

import { useMemo, useRef, useState } from "react";
import { buildHintLadder, nextHint, questionSpecPoint } from "@/domain/hints";
import type { HintTier } from "@/domain/hints";
import { getTopic } from "@/domain/curriculum";
import { useQuestionTeaching } from "@/state/checkpoint-teaching";
import { HintView } from "./HintView";
import type { Attempt, InterventionAttemptContext, Mistake, Question } from "@/domain/types";
import { QuestionRunner } from "./QuestionRunner";
import { Button, Pill } from "./ui";

// The adaptive runner's question rung. For supported rungs a progressive hint
// ladder sits above the runner: cue → prompt → scaffold, then — only on an
// explicit give-up — the worked solution. Independent rungs offer no hints at
// all. Whatever support was used is reported back so the session can weight
// the resulting evidence honestly.

export interface AdaptiveQuestionOutcome {
  attempt: Attempt;
  /** The highest hint tier revealed, or null when none was. */
  hintTier: HintTier | null;
  /** True when the student gave up and opened the worked solution. */
  gaveUp: boolean;
}

const TIER_ORDER: HintTier[] = ["cue", "prompt", "scaffold", "worked-solution"];

export function AdaptiveQuestionBlock({
  question,
  support,
  retestMistake,
  repairTeachingSeen = false,
  intervention,
  onComplete,
}: {
  question: Question;
  support: "supported" | "independent";
  retestMistake?: Mistake | null;
  repairTeachingSeen?: boolean;
  intervention?: InterventionAttemptContext;
  onComplete: (outcome: AdaptiveQuestionOutcome) => void;
}) {
  const [revealedTiers, setRevealedTiers] = useState<HintTier[]>([]);
  const [gaveUp, setGaveUp] = useState(false);
  const submittedRef = useRef(false);

  // Built from the question's own topic and specification point. It used to
  // be built from the question alone, which left the ladder without a worked
  // solution: "Give up" recorded heavy support and showed nothing.
  const taggedPoint = useMemo(() => questionSpecPoint(question, getTopic), [question]);
  const taught = useQuestionTeaching(question, support === "supported");
  const ladder = useMemo(() => {
    if (support !== "supported") return [];
    const topic = getTopic(question.topicIds[0] ?? "");
    return buildHintLadder(
      question,
      topic ? { keyPoints: topic.keyPoints, commonErrors: topic.commonErrors } : undefined,
      { specPoint: taught?.specPoint ?? taggedPoint, teaching: taught?.teaching ?? null },
    );
  }, [question, support, taggedPoint, taught]);
  const hintsAllowed = support === "supported";
  const next = hintsAllowed ? nextHint(ladder, revealedTiers) : null;
  // The worked solution is never served as "the next hint" — it is only shown
  // after the student explicitly gives up.
  const nextRegular = next?.tier === "worked-solution" ? null : next;
  const seenWorked = revealedTiers.includes("worked-solution");

  function reveal(tier: HintTier) {
    setRevealedTiers((previous) => (previous.includes(tier) ? previous : [...previous, tier]));
  }

  const highestTier = useMemo<HintTier | null>(() => {
    const found = TIER_ORDER.filter((tier) => revealedTiers.includes(tier));
    return found.length ? found[found.length - 1] : null;
  }, [revealedTiers]);

  return (
    <div className="space-y-3">
      {hintsAllowed ? (
        <div className="rounded-lg border border-line bg-surface2/60 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="accent">Support available</Pill>
            <span className="text-[11px] text-ink3">
              Each hint counts against your independent evidence — use the minimum you need.
            </span>
          </div>
          {revealedTiers.map((tier) => {
            const hint = ladder.find((candidate) => candidate.tier === tier);
            return hint ? (
              <div key={tier} className="mt-2 text-xs text-ink2" role="status">
                <HintView hint={hint} />
              </div>
            ) : null;
          })}
          <div className="flex flex-wrap gap-2 mt-2.5">
            {nextRegular ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => reveal(nextRegular.tier)}
                aria-label={`Show ${hintTierLabel(nextRegular.tier)} hint`}
              >
                I&apos;m stuck — {hintTierLabel(nextRegular.tier).toLowerCase()}
              </Button>
            ) : null}
            {!seenWorked ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setGaveUp(true);
                  reveal("worked-solution");
                }}
              >
                Give up — show the worked solution
              </Button>
            ) : null}
          </div>
          {seenWorked ? (
            <p className="text-[11px] text-review mt-2" role="status">
              The worked solution is open — this attempt will be recorded as heavily supported, not independent.
            </p>
          ) : null}
        </div>
      ) : null}

      <QuestionRunner
        key={`${question.id}:${support}`}
        question={question}
        retestMistake={retestMistake ?? undefined}
        hintBudget={0}
        externalHintTier={highestTier}
        repairTeachingSeen={repairTeachingSeen}
        intervention={intervention}
        onFinished={(attempt) => {
          if (submittedRef.current) return;
          submittedRef.current = true;
          onComplete({ attempt, hintTier: attempt.hintTier ?? null, gaveUp });
        }}
      />
    </div>
  );
}

function hintTierLabel(tier: HintTier): string {
  switch (tier) {
    case "cue":
      return "Small cue";
    case "prompt":
      return "Think about";
    case "scaffold":
      return "Scaffold";
    case "worked-solution":
      return "Worked solution";
  }
}
