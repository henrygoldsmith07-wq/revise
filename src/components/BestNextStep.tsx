"use client";

// The one dominant action on Today, from the Next Best Action engine: what to
// do, how long, why, what it is worth, what happens after, and one Start button.
// Everything that explains the ranking sits behind a "Why this?" disclosure
// built only from computed evidence — never invented numbers.

import { useEffect } from "react";
import { getSubject, getTopic } from "@/domain/curriculum";
import { describeFocus } from "@/domain/today-focus";
import { useStoreFields } from "@/state/store";
import { Button } from "./ui";
import { LEARNER_STATE_LABEL } from "@/domain/learner-state";
import type { RevisionAction, RevisionPlan } from "@/domain/revision-engine";
import { ButtonLink, Pill } from "./ui";
import { ForwardIcon, TodayIcon } from "./icons";
import { captureProductEvent } from "@/lib/product-telemetry";

const TONE = { "not-checked": "neutral", "needs-work": "danger", improving: "accent", "awaiting-proof": "review", proven: "success", regressed: "danger" } as const;

function evidenceStrengthLine(action: RevisionAction): string | null {
  if (action.confidence < 0.35) return "Evidence is still limited — this step will help find the next gap.";
  if (action.evidenceStrength >= 0.7) return "This is backed by solid recent evidence.";
  if (action.evidenceStrength >= 0.4) return "This rests on some recent evidence.";
  return null;
}

export function BestNextStep({ action, plan }: { action: RevisionAction; plan: RevisionPlan }) {
  const subject = getSubject(action.subjectId)?.name ?? action.subjectId;
  const topicTitle = action.topicIds.length === 1 ? (getTopic(action.topicIds[0]!)?.title ?? null) : null;
  const queued = plan.actions.slice(1, 4);
  const waiting = plan.deferred.filter((d) => /Waiting for the delay/.test(d.reason)).slice(0, 2);
  const e = action.explanation;
  const focus = describeFocus(action, subject);
  const { settings, updateSettings, recordFunnel } = useStoreFields("settings", "updateSettings", "recordFunnel");
  const blockedTopic = plan.authoringNeeds.find((n) => action.topicIds.includes(n.topicId))?.topicId;
  const strength = evidenceStrengthLine(action);
  const isProof = action.type === "proof-check";
  useEffect(() => {
    void recordFunnel("next_action_shown", action.type);
    void recordFunnel("recommendation_displayed", action.id);
    captureProductEvent("recommendation.shown", { kind: action.type, minutes: Math.ceil(action.minutes) });
    if (blockedTopic && action.type === "evidence-gap") void recordFunnel("proof_blocked_by_supply", blockedTopic);
  }, [action.id, action.type, blockedTopic, recordFunnel]);
  return (
    <section aria-label="What to do now" className="grid gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="today-focus-icon" aria-hidden="true"><TodayIcon size={18} /></span>
          <p className="text-sm font-semibold text-speak">Do this now</p>
          {action.proofStatus && action.proofStatus !== "not-checked" ? <Pill tone={TONE[action.proofStatus]}>{LEARNER_STATE_LABEL[action.proofStatus]}</Pill> : null}
          {isProof ? <Pill tone="review">Proof check</Pill> : null}
          <span className="ml-auto rounded-full bg-speaksoft px-3 py-1 text-sm font-semibold text-speak">{focus.duration}</span>
        </div>
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-ink sm:mt-4 sm:text-3xl">{focus.title}</h2>
        <p className="mt-1 text-base font-medium text-ink sm:mt-2 sm:text-lg">{topicTitle ? `${focus.subject} · ${topicTitle}` : focus.subject}</p>
        <p className="mt-1 text-sm text-ink2">{focus.examLine} · {focus.stake}</p>
        {isProof ? (
          <p className="mt-2 max-w-2xl rounded-lg border border-review/40 bg-reviewsoft px-3 py-2 text-xs text-ink2">
            This question is new and you have no hints. Your answer will count as evidence.
          </p>
        ) : null}
        <ButtonLink
          href={focus.cta.href}
          variant="primary"
          size="md"
          className="mt-4 min-h-[3rem] w-full text-base sm:w-auto"
          onClick={() => {
            void recordFunnel("recommendation_accepted", action.id);
            captureProductEvent("recommendation.accepted", { kind: action.type, minutes: Math.ceil(action.minutes) });
          }}
        >
          {isProof ? "Start proof check" : focus.cta.label} <ForwardIcon size={17} aria-hidden />
        </ButtonLink>
        {focus.skippable ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full sm:ml-2 sm:w-auto"
            onClick={() => {
              void recordFunnel("diagnostic_skipped", action.subjectId);
              void updateSettings({ quickCheckSkipped: [...new Set([...(settings.quickCheckSkipped ?? []), ...settings.subjectIds])] });
            }}
          >
            Skip, just start revising
          </Button>
        ) : null}
        <p className="mt-3 max-w-2xl text-sm text-ink2">{focus.why}</p>
        {strength ? <p className="mt-1 max-w-2xl text-xs text-ink3">{strength}</p> : null}
        <p className="mt-1 max-w-2xl text-sm text-ink2"><span className="font-medium text-ink">Then:</span> {focus.after}</p>
        <details className="mt-4 max-w-2xl">
          <summary className="cursor-pointer select-none text-sm font-medium text-ink2 min-h-11 inline-flex items-center">Why this?</summary>
          <dl className="mt-2 space-y-2 text-sm leading-6 text-ink2" aria-label="Why this recommendation">
            <div><dt className="font-semibold text-ink">Why now</dt><dd>{e.whyNow}</dd></div>
            <div><dt className="font-semibold text-ink">Why before the others</dt><dd>{e.whyBefore}</dd></div>
            <div><dt className="font-semibold text-ink">What it is based on</dt><dd>{e.evidence.length ? <ul className="list-disc pl-5">{e.evidence.map((line) => <li key={line}>{line}</li>)}</ul> : "No checked answers yet — this step creates the first evidence."}</dd></div>
            <div><dt className="font-semibold text-ink">What will prove it worked</dt><dd>{e.proves}</dd></div>
            {blockedTopic ? (
              <div><dt className="font-semibold text-ink">Evidence limit</dt><dd>You improved here, but Revise does not yet have enough reviewed new questions to prove it.</dd></div>
            ) : null}
            {action.effectiveness && action.effectiveness.level !== "neutral" ? (
              <div><dt className="font-semibold text-ink">What has worked for you</dt><dd>{action.effectiveness.uncertainty === "high"
                ? "Early signs only, from a small number of completed checks."
                : action.effectiveness.weight >= 1
                  ? `This kind of session has tended to hold up for you after a delay (${action.effectiveness.samples} checked).`
                  : `This kind of session has held up less well for you (${action.effectiveness.samples} checked), so it is suggested only because the gap is worth it.`}</dd></div>
            ) : null}
          </dl>
        </details>
        {queued.length || waiting.length ? (
          <details className="mt-3 max-w-2xl">
            <summary className="cursor-pointer select-none text-sm font-medium text-ink2">What comes after</summary>
            <ul className="mt-2 space-y-1 text-sm text-ink2">
              {queued.map((q) => <li key={q.id}>{q.title} · {Math.ceil(q.minutes)} min</li>)}
              {waiting.map((w) => <li key={w.action.id}>{w.action.title}: {w.reason.replace(/^Waiting for the delay to pass: /, "")}</li>)}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}
