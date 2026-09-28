"use client";

import Link from "next/link";
import { getSubject, getTopic } from "@/domain/curriculum";
import { nextGradeTarget } from "@/domain/grades";
import { useStore } from "@/state/store";
import { ButtonLink, Panel, Pill, ProgressBar, SectionHeading } from "../ui";
import { EmptyHint } from "./shared";

export function NextGradeView() {
  const store = useStore();
  const rows = store.predictions
    .map((prediction) => {
      const subject = getSubject(prediction.subjectId);
      return subject ? { subject, prediction, target: nextGradeTarget(subject, prediction) } : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  return (
    <Panel>
      <SectionHeading
        title="What Gets Me to the Next Grade?"
        hint="A boundary gap, then the topics with enough modelled headroom to close it. Treat the route as a ranked plan, not a promise."
      />
      {rows.length ? (
        <ul className="divide-y divide-line">
          {rows.map(({ subject, prediction, target }) => {
            const first = target.route[0];
            const firstTopic = first ? getTopic(first.topicId) : undefined;
            const confidence = Math.round(prediction.confidence * 100);
            return (
              <li key={prediction.subjectId} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{subject.name}</p>
                    <p className="text-xs text-ink3 mt-0.5">
                      {prediction.worstCase === prediction.bestCase
                        ? `Estimated grade ${prediction.grade}`
                        : `Estimated range ${prediction.worstCase}–${prediction.bestCase}`} · {prediction.evidenceLevel ?? "limited"} evidence
                    </p>
                  </div>
                  <p className="text-lg font-semibold tabular-nums shrink-0">
                    {target.nextGrade ? `→ ${target.nextGrade.grade}` : "Highest"}
                  </p>
                </div>

                {prediction.uncertaintySources?.length ? (
                  <details className="mt-2 text-xs text-ink3">
                    <summary className="cursor-pointer">What makes this estimate uncertain?</summary>
                    <ul className="mt-1 list-disc pl-4 space-y-1">
                      {prediction.uncertaintySources.map((reason) => <li key={reason}>{reason}</li>)}
                    </ul>
                    <p className="mt-1">Model centre: about {prediction.percent}% · confidence {confidence}%.</p>
                  </details>
                ) : null}

                {target.nextGrade ? (
                  <>
                    <div className="mt-3">
                      <ProgressBar
                        value={prediction.percent / target.nextGrade.percent}
                        label={`Progress to ${target.nextGrade.grade}`}
                      />
                    </div>
                    <p className="text-xs text-ink2 mt-2">
                      {prediction.percent}% now · {target.nextGrade.percent}% needed for {target.nextGrade.grade}. Need{" "}
                      <span className="font-semibold">+{target.gapPercent} percentage points</span>. The ranked route models
                      +{target.modeledGainPercent}pp from the topics below.
                    </p>
                    {target.route.length ? (
                      <ul className="mt-3 space-y-2">
                        {target.route.slice(0, 3).map((route, index) => (
                          <li key={route.topicId} className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs text-ink2 truncate">
                                {index === 0 ? "Start with " : "Then "}
                                {getTopic(route.topicId)?.title ?? route.topicId}
                              </p>
                              <p className="text-[11px] text-ink3">
                                Up to +{route.potentialPercent}pp headroom
                              </p>
                            </div>
                            <span className="text-xs text-accent font-semibold tabular-nums shrink-0">
                              +{route.contributionPercent}pp
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-ink3 mt-3">
                        No topic has enough measured headroom yet. Add marked timed work to replace this estimate with a
                        firmer route.
                      </p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-line">
                      <p className="text-[11px] text-ink3">
                        {confidence < 45
                          ? "Low confidence — add marked questions before treating the target as reliable."
                          : "Keep checking the gap after each marked set."}
                      </p>
                      <ButtonLink href={first ? `/practice?topic=${encodeURIComponent(first.topicId)}` : "/practice"} size="sm">
                        {firstTopic ? `Practise ${firstTopic.title}` : "Practise a timed set"}
                      </ButtonLink>
                    </div>
                  </>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-ink2">
                      Already at the highest predicted boundary. Protect it with timed papers and mistake retests.
                    </p>
                    <ButtonLink href="/practice" size="sm">
                      Practise a timed set
                    </ButtonLink>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyHint>Pick a subject and complete marked work to see a grade target.</EmptyHint>
      )}
    </Panel>
  );
}

export function ExpectedMarksCard() {
  const store = useStore();
  const insight = store.assessment;
  if (!insight || !insight.expectedMarksPerHour.length) {
    return (
      <Panel>
        <SectionHeading
          title="Expected exam marks per study hour"
          hint="The headline metric. Answer a few exam questions and the numbers appear here."
        />
        <EmptyHint>Do a set of marked questions in each subject — every dropped mark teaches the engine where an hour of work converts fastest.</EmptyHint>
      </Panel>
    );
  }
  const top = insight.expectedMarksPerHour.slice(0, 6);
  const max = Math.max(0.5, ...top.map((r) => r.value));
  return (
    <Panel>
      <SectionHeading
        title="Expected exam marks per study hour"
        hint="If you spend the next hour on one topic, how many exam marks does the model think it buys? Ranked, not averaged."
      />
      <ul className="space-y-2.5">
        {top.map((row) => {
          const topic = getTopic(row.topicId);
          const subject = topic ? getSubject(topic.subjectId) : null;
          return (
            <li key={row.topicId} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <Link href={`/practice?topic=${encodeURIComponent(row.topicId)}`} className="text-sm text-ink truncate hover:underline">
                    {topic?.title ?? row.topicId}
                  </Link>
                  <span className="text-[11px] text-ink3 shrink-0">{subject?.name}</span>
                </div>
                <div className="mt-1.5 max-w-sm">
                  <div className="h-1.5 rounded-full bg-surface2 overflow-hidden">
                    <div className="h-full bg-accent rounded-full bar-anim" style={{ width: `${Math.round((row.value / max) * 100)}%` }} />
                  </div>
                </div>
              </div>
              <span className="text-sm font-semibold tabular-nums text-accent shrink-0">+{row.value.toFixed(1)}</span>
              <ButtonLink href={`/practice?topic=${encodeURIComponent(row.topicId)}`} size="sm">
                Fix
              </ButtonLink>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-ink3 mt-3">
        Built from your real dropped marks and current mastery. A topic at 40% with 6 lost marks converts faster than one at 85% with one slip.
      </p>
    </Panel>
  );
}

function TimingBreakdown() {
  const store = useStore();
  const byTiming: Record<string, number> = { ok: 0, rushed: 0, slow: 0, unknown: 0 };
  for (const m of store.mistakes.filter((x) => !x.resolved)) byTiming[m.timing ?? "unknown"] = (byTiming[m.timing ?? "unknown"] ?? 0) + m.marksLost;
  const total = (byTiming.rushed ?? 0) + (byTiming.slow ?? 0) + (byTiming.ok ?? 0);
  if (!total) return null;
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      <span className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mr-1">Timing</span>
      <Pill tone={byTiming.rushed ? "danger" : "neutral"}>Rushed {byTiming.rushed}m</Pill>
      <Pill tone={byTiming.slow ? "review" : "neutral"}>Slow {byTiming.slow}m</Pill>
      <Pill>On time {byTiming.ok}m</Pill>
    </div>
  );
}

export function MarksLostByCause() {
  const insight = useStore().assessment;
  if (!insight) return null;
  const byCategory = [
    ...Object.entries(insight.byMisconception).filter(([, v]) => (v as number) > 0).sort((a, b) => (b[1] as number) - (a[1] as number)),
    ...Object.entries(insight.byCommand).filter(([, v]) => (v as number) > 0).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 2),
  ];
  const total = Object.values(insight.byMisconception).reduce((a, v) => a + (v as number), 0) +
    Object.values(insight.byCommand).reduce((a, v) => a + (v as number), 0);
  if (!total) return null;
  // Show misconception + command breakdown in one card so the student sees both without two panels.
  const misconRows = Object.entries(insight.byMisconception).filter(([, v]) => (v as number) > 0).sort((a, b) => (b[1] as number) - (a[1] as number));
  const commandRows = Object.entries(insight.byCommand).filter(([, v]) => (v as number) > 0).sort((a, b) => (b[1] as number) - (a[1] as number));
  void byCategory;
  return (
    <Panel>
      <SectionHeading title="Marks lost by cause" hint="Command words, misconception types, and timing." />
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">Misconception</p>
          {misconRows.length ? (
            <ul className="space-y-1.5">
              {misconRows.slice(0, 6).map(([tag, marks]) => (
                <li key={tag} className="flex justify-between gap-2 text-xs">
                  <span className="text-ink2">{tag}</span>
                  <span className="tabular-nums text-danger font-semibold">{marks as number} marks</span>
                </li>
              ))}
            </ul>
          ) : <EmptyHint>Not enough classified mistakes yet.</EmptyHint>}
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">Command word</p>
          {commandRows.length ? (
            <ul className="space-y-1.5">
              {commandRows.slice(0, 6).map(([word, marks]) => (
                <li key={word} className="flex justify-between gap-2 text-xs">
                  <span className="text-ink2">{word}</span>
                  <span className="tabular-nums text-review font-semibold">{marks as number} marks</span>
                </li>
              ))}
            </ul>
          ) : <EmptyHint>Answer a question with a verb-led prompt to populate this.</EmptyHint>}
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-line">
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">By assessment objective</p>
        <div className="flex flex-wrap gap-1.5">
          {(["AO1", "AO2", "AO3"] as const).map((ao) => (
            <Pill key={ao} tone={(insight.marksLostByAo[ao] ?? 0) > 0 ? "danger" : "neutral"}>
              {ao}: {(insight.marksLostByAo[ao] ?? 0)} marks
            </Pill>
          ))}
        </div>
      </div>
      {/* timing */}
      <div className="mt-3">
        <TimingBreakdown />
      </div>
    </Panel>
  );
}
