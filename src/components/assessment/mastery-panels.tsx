"use client";

import Link from "next/link";
import { getSubject, getTopic } from "@/domain/curriculum";
import { useStoreFields } from "@/state/store";
import { Button, Panel, Pill, ProgressBar, SectionHeading, StatTile } from "../ui";
import { EmptyHint, UncertaintyGlyph } from "./shared";
import { plainEvidenceLine } from "@/domain/plain-evidence";
import { StudentOnly, TeacherOnly, useTeacherMode } from "../TeacherMode";

function accuracyLabel(accuracy: number | null): string {
  return accuracy == null ? "—" : `${Math.round(accuracy * 100)}%`;
}

/** Teacher view keeps the statistician's n=; Focus Mode says it in words. */
function sampleLabel(count: number, teacher: boolean): string {
  return teacher ? `n=${count}` : `${count} answered`;
}

export function CalculationMasteryCard() {
  const store = useStoreFields("calculationMastery");
  const [teacher] = useTeacherMode();
  const report = store.calculationMastery;
  const tone = report.status === "secure" ? "success" : report.status === "developing" ? "review" : "neutral";
  const statusLabel = report.status === "secure" ? "Secure" : report.status === "developing" ? "Developing" : "Needs evidence";
  const topics = report.byTopic.slice(0, 6);
  const errorPatterns = report.errorPatterns.slice(0, 5);

  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <SectionHeading title="Calculation mastery" hint="Marks-weighted performance on calculation questions only." />
        <Pill tone={tone}>{statusLabel}</Pill>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <StatTile label="Accuracy" value={accuracyLabel(report.accuracy)} sub={`${report.attempts} question${report.attempts === 1 ? "" : "s"}`} tone={report.status === "secure" ? "success" : report.status === "developing" ? "review" : undefined} />
        <StatTile label="Marks" value={`${report.marksAwarded}/${report.marksAvailable}`} sub="calculation marks" />
        <StatTile label="Recent" value={accuracyLabel(report.recent.accuracy)} sub={report.trend == null ? "latest window" : `${report.trend >= 0 ? "+" : ""}${Math.round(report.trend * 100)} pp`} tone={report.trend != null && report.trend < 0 ? "danger" : report.trend != null && report.trend > 0 ? "success" : undefined} />
        <StatTile label="Threshold" value={`${report.minimumAttempts}`} sub="questions for reliability" />
      </div>
      <ProgressBar
        value={report.accuracy ?? 0}
        label={report.accuracy == null ? "No calculation evidence yet" : "Overall calculation accuracy"}
        tone={report.status === "secure" ? "success" : report.status === "developing" ? "review" : "accent"}
      />
      <p className="text-xs text-ink2 mt-3">{report.nextAction}</p>

      {(report.calculator.attempts || report.noCalculator.attempts) ? (
        <div className="mt-4 pt-3 border-t border-line">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">Calculator context</p>
          <div className="flex flex-wrap gap-1.5">
            <Pill tone="accent">Allowed: {accuracyLabel(report.calculator.accuracy)} · {sampleLabel(report.calculator.attempts, teacher)}</Pill>
            <Pill>Not allowed: {accuracyLabel(report.noCalculator.accuracy)} · {sampleLabel(report.noCalculator.attempts, teacher)}</Pill>
          </div>
        </div>
      ) : null}

      {topics.length ? (
        <div className="mt-4 pt-3 border-t border-line">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">By topic</p>
          <ul className="space-y-2">
            {topics.map((row) => (
              <li key={row.topicId}>
                <div className="flex items-center justify-between gap-2 text-xs mb-1">
                  <Link href={`/practice?topic=${encodeURIComponent(row.topicId)}`} className="text-ink2 truncate hover:underline">
                    {getTopic(row.topicId)?.title ?? row.topicId}
                  </Link>
                  <span className="text-ink3 tabular-nums shrink-0">{accuracyLabel(row.accuracy)} · {sampleLabel(row.attempts, teacher)}</span>
                </div>
                {row.accuracy != null ? <ProgressBar value={row.accuracy} tone={row.status === "secure" ? "success" : "review"} /> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {errorPatterns.length ? (
        <div className="mt-4 pt-3 border-t border-line">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">Calculation errors</p>
          <div className="flex flex-wrap gap-1.5">
            {errorPatterns.map((pattern) => (
              <Pill key={pattern.key} tone="danger">{pattern.label} · {pattern.marksLost}m</Pill>
            ))}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

const TECHNIQUE_DRIVER_LABELS: Record<string, string> = {
  "exam-technique": "exam technique",
  "knowledge-gap": "knowledge gap",
  mixed: "mixed signal",
  rushing: "rushing",
  "time-management": "time management",
};

export function TechniqueVsKnowledgeCard() {
  const insight = useStoreFields("assessment").assessment;
  const split = insight?.techniqueVsKnowledge;
  if (!split) return null;

  const knowledgePercent = Math.round(split.knowledgeShare * 100);
  const techniquePercent = Math.round(split.techniqueShare * 100);
  const techniqueLead = split.techniqueShare > split.knowledgeShare;
  const actionHref = techniqueLead ? "/papers" : "/review?mode=mistakes";
  const actionLabel = techniqueLead ? "Practise timed papers" : "Review knowledge gaps";

  return (
    <Panel>
      <SectionHeading
        title="Exam technique vs knowledge"
        hint="Separates marks lost through missing understanding from marks lost under exam conditions."
      />
      <div className="grid sm:grid-cols-2 gap-3">
        <StatTile
          label="Knowledge gaps"
          value={`${knowledgePercent}%`}
          sub={`${split.knowledgeLost} marks lost`}
          tone={knowledgePercent >= techniquePercent ? "danger" : undefined}
        />
        <StatTile
          label="Exam technique"
          value={`${techniquePercent}%`}
          sub={`${split.techniqueLost} marks lost`}
          tone={techniquePercent > knowledgePercent ? "review" : undefined}
        />
      </div>
      <div
        className="mt-4"
        role="img"
        aria-label={`Lost marks split: ${knowledgePercent}% knowledge gaps and ${techniquePercent}% exam technique`}
      >
        <div className="flex h-2 overflow-hidden rounded-full bg-surface2">
          {knowledgePercent ? <div className="h-full bg-danger" style={{ width: `${knowledgePercent}%` }} /> : null}
          {techniquePercent ? <div className="h-full bg-review" style={{ width: `${techniquePercent}%` }} /> : null}
        </div>
        <div className="flex justify-between gap-3 mt-1 text-[11px] text-ink3">
          <span>Knowledge {knowledgePercent}%</span>
          <span>Technique {techniquePercent}%</span>
        </div>
      </div>
      <p className="text-xs text-ink2 mt-3">{split.narrative}</p>
      {split.drivers.length ? (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {split.drivers.map((driver) => (
            <Pill
              key={driver}
              tone={driver === "knowledge-gap" ? "danger" : driver === "exam-technique" || driver === "rushing" ? "review" : "neutral"}
            >
              {TECHNIQUE_DRIVER_LABELS[driver] ?? driver}
            </Pill>
          ))}
        </div>
      ) : null}
      <div className="mt-3 pt-3 border-t border-line flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-ink3">
          {split.reliable ? "Reliable split from at least eight marked mistakes." : "Early signal — mark more questions to make this split reliable."}
        </p>
        <Link href={actionHref}>
          <Button size="sm">{actionLabel}</Button>
        </Link>
      </div>
    </Panel>
  );
}

export function RecallMasteryCard() {
  const store = useStoreFields("recallMastery");
  const [teacher] = useTeacherMode();
  const rows = store.recallMastery.filter((row) => row.cardsTotal > 0);
  if (!rows.length) {
    return (
      <Panel>
        <SectionHeading
          title="Recall mastery"
          hint="A recall-only view of memory strength, separate from exam-question performance."
        />
        <EmptyHint>Review a few flashcards to start measuring what you can retrieve from memory.</EmptyHint>
      </Panel>
    );
  }

  const totalCards = rows.reduce((sum, row) => sum + row.cardsTotal, 0);
  const weighted = (selector: (row: typeof rows[number]) => number) =>
    rows.reduce((sum, row) => sum + selector(row) * row.cardsTotal, 0) / totalCards;
  const overall = weighted((row) => row.mastery);
  const currentRetention = weighted((row) => row.currentRetention);
  const reviews = rows.reduce((sum, row) => sum + row.reviews, 0);
  const recalled = rows.reduce((sum, row) => sum + row.recalled, 0);
  const trueRetention = reviews ? recalled / reviews : null;
  const due = rows.reduce((sum, row) => sum + row.cardsDue, 0);
  const weakest = [...rows].sort((a, b) => a.mastery - b.mastery).slice(0, 6);
  const masteryTone = overall >= 0.8 ? "success" : overall >= 0.55 ? "review" : "danger";

  return (
    <Panel>
      <SectionHeading
        title="Recall mastery"
        hint={
          teacher
            ? "Memory strength from card stability and current retrievability — exam marks are deliberately excluded."
            : "How well facts stick from your flashcards. Exam marks are counted separately."
        }
        action={
          <Link href="/review">
            <Button size="sm">Review cards</Button>
          </Link>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Recall mastery" value={`${Math.round(overall * 100)}%`} sub={`${totalCards} cards`} tone={masteryTone} />
        <StatTile label="Current retention" value={`${Math.round(currentRetention * 100)}%`} sub={teacher ? "FSRS estimate now" : "what you would remember today"} tone={currentRetention < 0.8 ? "review" : "success"} />
        <StatTile label="Observed recall" value={trueRetention == null ? "—" : `${Math.round(trueRetention * 100)}%`} sub={`${reviews} reviews`} tone={trueRetention != null && trueRetention < 0.8 ? "danger" : undefined} />
        <StatTile label="Due cards" value={due} sub={due ? "retrieval practice waiting" : "Nothing due"} tone={due ? "review" : "success"} />
      </div>
      <div className="mt-4">
        <ProgressBar value={overall} label="Recall mastery across studied cards" tone={masteryTone} />
      </div>
      <div className="mt-4 pt-3 border-t border-line">
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">Topics needing retrieval</p>
        <ul className="space-y-2">
          {weakest.map((row) => (
            <li key={row.topicId} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <Link href={`/review?topic=${encodeURIComponent(row.topicId)}`} className="text-xs text-ink2 truncate hover:underline block">
                  {getTopic(row.topicId)?.title ?? row.topicId}
                </Link>
                <ProgressBar value={row.mastery} tone={row.mastery < 0.55 ? "danger" : "review"} />
              </div>
              <span className="text-xs tabular-nums text-ink3 shrink-0">
                {Math.round(row.mastery * 100)}%{row.cardsDue ? ` · ${row.cardsDue} due` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <TeacherOnly>
        <p className="text-[11px] text-ink3 mt-3">
          Observed recall counts every grade except “again”; the mastery score remains model-based so a thin review history cannot overstate certainty.
        </p>
      </TeacherOnly>
    </Panel>
  );
}

export function ApplicationMasteryCard() {
  const store = useStoreFields("applicationMastery");
  const [teacher] = useTeacherMode();
  const rows = store.applicationMastery.filter((row) => row.attempts > 0);
  if (!rows.length) {
    return (
      <Panel>
        <SectionHeading
          title="Application mastery"
          hint="How well you apply knowledge in marked exam questions, separate from flashcard recall."
        />
        <EmptyHint>Answer a few marked exam questions to measure application rather than memory alone.</EmptyHint>
      </Panel>
    );
  }

  const marksAvailable = rows.reduce((sum, row) => sum + row.marksAvailable, 0);
  const marksAwarded = rows.reduce((sum, row) => sum + row.marksAwarded, 0);
  const overall = marksAvailable ? marksAwarded / marksAvailable : 0;
  const recentRows = rows.filter((row) => row.recentAccuracy != null);
  const recentAccuracy = recentRows.length
    ? recentRows.reduce((sum, row) => sum + (row.recentAccuracy ?? 0) * row.marksAvailable, 0) /
      recentRows.reduce((sum, row) => sum + row.marksAvailable, 0)
    : null;
  const attempts = rows.reduce((sum, row) => sum + row.attempts, 0);
  const reliable = rows.filter((row) => row.evidence === "reliable").length;
  const weakest = [...rows].sort((a, b) => a.mastery - b.mastery).slice(0, 6);
  const masteryTone = overall >= 0.8 ? "success" : overall >= 0.55 ? "review" : "danger";

  return (
    <Panel>
      <SectionHeading
        title="Application mastery"
        hint={
          teacher
            ? "Mark-weighted performance on practice and paper questions — active-recall attempts and provisional marks are excluded."
            : "How many marks you earn on exam-style questions. Flashcards and provisional marks are not counted."
        }
        action={
          <Link href="/practice">
            <Button size="sm">Practise questions</Button>
          </Link>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Application mastery" value={`${Math.round(overall * 100)}%`} sub={`${Math.round(marksAwarded * 10) / 10}/${Math.round(marksAvailable * 10) / 10} marks`} tone={masteryTone} />
        <StatTile label="Recent accuracy" value={recentAccuracy == null ? "—" : `${Math.round(recentAccuracy * 100)}%`} sub="last five topic attempts" tone={recentAccuracy != null && recentAccuracy < overall ? "review" : "success"} />
        <StatTile label="Topic attempts" value={attempts} sub="marked application evidence" />
        <StatTile label="Reliable topics" value={`${reliable}/${rows.length}`} sub="10+ eligible attempts" tone={reliable === rows.length ? "success" : "review"} />
      </div>
      <div className="mt-4">
        <ProgressBar value={overall} label="Application mastery across marked work" tone={masteryTone} />
      </div>
      <div className="mt-4 pt-3 border-t border-line">
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mb-2">Topics needing application practice</p>
        <ul className="space-y-2">
          {weakest.map((row) => (
            <li key={row.topicId} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <Link href={`/practice?topic=${encodeURIComponent(row.topicId)}`} className="text-xs text-ink2 truncate hover:underline block">
                  {getTopic(row.topicId)?.title ?? row.topicId}
                </Link>
                <ProgressBar value={row.mastery} tone={row.mastery < 0.55 ? "danger" : "review"} />
              </div>
              <span className="text-xs tabular-nums text-ink3 shrink-0">
                {Math.round(row.mastery * 100)}% · {row.attempts} attempt{row.attempts === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-[11px] text-ink3 mt-3">
        {teacher
          ? "Application evidence is mark-weighted. A topic becomes reliable after ten eligible attempts; use the recent figure to spot a change in form."
          : "After about ten marked answers on a topic this becomes reliable. The recent figure shows whether you are improving."}
      </p>
    </Panel>
  );
}

export function MasteryUncertaintyCard() {
  const store = useStoreFields("masteryUncertainty");
  const rows = store.masteryUncertainty;
  if (!rows.length) return null;

  const uncertain = rows.filter((row) => row.needsMoreEvidence);
  const high = rows.filter((row) => row.uncertainty === "high");
  const widest = rows.slice(0, 6);

  return (
    <Panel>
      <SectionHeading
        title="How sure Revise is"
        hint="Where a score could still move a lot, so a good number is not mistaken for a safe one."
        action={
          <Link href="/practice">
            <Button size="sm">Collect evidence</Button>
          </Link>
        }
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StudentOnly>
          <StatTile label="Need more answers" value={uncertain.length} sub="a few more questions each" tone={uncertain.length ? "review" : "success"} />
          <StatTile label="Still unsure" value={high.length} sub="scores that could move a lot" tone={high.length ? "review" : "success"} />
        </StudentOnly>
        <TeacherOnly>
          <StatTile label="Need more evidence" value={uncertain.length} sub="below 8 weighted trials" tone={uncertain.length ? "review" : "success"} />
          <StatTile label="High uncertainty" value={high.length} sub="widest estimates" tone={high.length ? "danger" : "success"} />
        </TeacherOnly>
        <StatTile label="Measured topics" value={rows.length - uncertain.length} sub={`of ${rows.length}`} tone="success" />
      </div>
      <ul className="mt-4 pt-3 border-t border-line space-y-2">
        {widest.map((row) => {
          const topic = getTopic(row.topicId);
          const title = topic?.title ?? row.topicId;
          const level = row.uncertainty;
          const uncertaintyTone = level === "high" ? "danger" : level === "medium" ? "review" : "success";
          const lower = Math.round(row.lower * 100);
          const upper = Math.round(row.upper * 100);
          const rangeWidth = Math.max(2, upper - lower);
          const plain = plainEvidenceLine({ uncertainty: level, evidence: row.evidence });
          return (
            <li key={row.topicId}>
              <StudentOnly>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/practice?topic=${encodeURIComponent(row.topicId)}`} className="text-xs text-ink2 truncate hover:underline block">
                      {title}
                    </Link>
                    <p className="text-xs text-ink3 mt-0.5">{plain.line}</p>
                  </div>
                  <Pill tone={level === "low" ? "accent" : "review"} title={plain.line}>
                    <UncertaintyGlyph level={level} />
                    {plain.level}
                  </Pill>
                </div>
              </StudentOnly>
              <TeacherOnly>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/practice?topic=${encodeURIComponent(row.topicId)}`} className="text-xs text-ink2 truncate hover:underline block">
                      {title}
                    </Link>
                    <div
                      className="relative mt-1.5 h-1.5 rounded-full bg-surface2"
                      role="img"
                      aria-label={`${title}: mastery range ${lower} to ${upper} percent`}
                    >
                      <div className="absolute h-full rounded-full bg-review" style={{ left: `${lower}%`, width: `${rangeWidth}%` }} />
                      <div className="absolute top-[-2px] h-2.5 w-0.5 bg-ink" style={{ left: `${row.mastery * 100}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Pill tone={uncertaintyTone} title={`${level} uncertainty`}>
                      <UncertaintyGlyph level={level} />
                      <span className="sr-only">{level} uncertainty. </span>
                      {lower}–{upper}%
                    </Pill>
                    <span className="text-[11px] text-ink3">{row.needsMoreEvidence ? "more evidence" : `${row.evidence} trials`}</span>
                  </div>
                </div>
              </TeacherOnly>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-ink3 mt-3">
        <StudentOnly>Each answer you give makes these estimates surer. Nothing here is a grade.</StudentOnly>
        <TeacherOnly>The band is a conservative 95% Wilson estimate over weighted trials; practice narrows it only as evidence accumulates.</TeacherOnly>
      </p>
    </Panel>
  );
}

export function RecurringMisconceptions() {
  const store = useStoreFields("recurringMisconceptions");
  const rows = store.recurringMisconceptions;
  if (!rows.length) {
    return (
      <Panel>
        <SectionHeading
          title="Recurring misconceptions"
          hint="Specific wrong beliefs you keep losing marks on, drawn from the misconception library."
        />
        <EmptyHint>Answer some questions — matched misconceptions appear here with their explanations.</EmptyHint>
      </Panel>
    );
  }
  return (
    <Panel>
      <SectionHeading
        title="Recurring misconceptions"
        hint="The specific wrong beliefs that cost you the most marks, linked to their full explanation."
      />
      <ul className="card divide-y divide-line">
        {rows.slice(0, 5).map(({ entry, count, marksLost }) => {
          const subject = getSubject(entry.subjectId);
          const topic = getTopic(entry.topicIds[0] ?? "");
          return (
            <li key={entry.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={`/library?topic=${encodeURIComponent(entry.topicIds[0] ?? "")}&misconception=${encodeURIComponent(entry.id)}`}
                  className="text-sm font-semibold text-ink hover:underline"
                >
                  {entry.statement}
                </Link>
                <Pill tone="danger">{marksLost} marks</Pill>
              </div>
              <p className="text-[11px] text-ink3 mt-1">
                {subject?.name ?? entry.subjectId}
                {topic ? ` · ${topic.title}` : ""}
                {` · ${count}×`}
              </p>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
