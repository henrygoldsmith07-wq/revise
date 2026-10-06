"use client";

// The Exam Command Centre: the first thing on Progress. One card per subject
// answers "when, how is it going, what do I do" in seconds; the reasons and
// the detail sit one tap away. Every value comes from useCommandCentre, which
// composes the learner model and the shared plan; nothing is computed here.

import Link from "next/link";
import type { CommandCentreSubject } from "@/domain/exam-command-centre";
import type { RiskLevel } from "@/domain/exam-trajectory";
import { formatExamDate } from "@/domain/pace-forecast";
import { useCommandCentre, useLearnerModels } from "./learner-model";
import { ForwardIcon } from "./icons";
import { ButtonLink, EmptyState, Panel, Pill } from "./ui";

const RISK_TONE: Record<RiskLevel, "danger" | "review" | "success" | "neutral"> = {
  "at-risk": "danger",
  close: "review",
  "on-track": "success",
  "too-early": "neutral",
};

export function ExamCommandCentre() {
  const centre = useCommandCentre();
  if (!centre.subjects.length) {
    return (
      <EmptyState
        title="No subjects chosen yet"
        body="Revise plans around your subjects and exam dates."
        why="Without them it cannot tell which topics are worth the most marks or how close each exam is."
        action={<ButtonLink href="/settings" variant="primary">Choose subjects</ButtonLink>}
        after="Each subject then gets its own exam outlook and a best next step."
      />
    );
  }
  return (
    <section aria-labelledby="command-centre-heading" className="space-y-3">
      <div>
        <p className="text-[11px] uppercase tracking-[0.13em] text-ink3 font-bold">Your exams</p>
        <h2 id="command-centre-heading" className="mt-1 text-lg sm:text-xl font-semibold tracking-tight text-ink">{centre.headline}</h2>
        {centre.pace ? <p className="mt-1 text-sm text-ink2 max-w-2xl">{centre.pace}</p> : null}
      </div>
      <ul className="grid gap-3 lg:grid-cols-2">
        {centre.subjects.map((subject) => <SubjectCard key={subject.subjectId} subject={subject} />)}
      </ul>
    </section>
  );
}

function SubjectCard({ subject }: { subject: CommandCentreSubject }) {
  const t = subject.trajectory;
  const p = t.position;
  return (
    <Panel as="li" className="flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-ink min-w-0 flex-1 truncate">{subject.name}</h3>
        <Pill tone={RISK_TONE[t.risk]}>{t.riskLabel}</Pill>
      </div>
      <p className="text-sm text-ink2">
        {subject.exam
          ? subject.exam.days === 0 ? "Exam today" : `Exam in ${subject.exam.days} day${subject.exam.days === 1 ? "" : "s"} · ${formatExamDate(subject.exam.date)}`
          : <Link href="/settings" className="underline underline-offset-2 hover:text-ink">Add your exam date</Link>}
      </p>
      <div>
        {p.kind === "band" ? (
          <p className="text-2xl font-semibold tabular-nums text-ink">
            {p.low}–{p.high}%
            <span className="ml-2 align-middle text-xs font-medium text-ink3">{p.provisional ? "early estimate" : `${p.confidence} confidence`}</span>
          </p>
        ) : null}
        <p className="mt-1 text-sm text-ink2">{t.heading}</p>
      </div>
      {subject.next ? (
        <div className="rounded-[10px] bg-surface2 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Best next step</p>
          <p className="mt-0.5 text-sm font-medium text-ink">{subject.next.title} · about {subject.next.minutes} min</p>
          <ButtonLink href={subject.next.href} size="sm" className="mt-2 min-h-11 w-full sm:w-auto">
            Start <ForwardIcon size={15} aria-hidden />
          </ButtonLink>
        </div>
      ) : null}
      <details className="text-sm">
        <summary className="cursor-pointer select-none font-medium text-ink2 min-h-11 inline-flex items-center">What is driving this?</summary>
        <div className="mt-2 space-y-3 text-ink2">
          {t.drivers.length ? (
            <ul className="list-disc pl-5 space-y-1">{t.drivers.map((line) => <li key={line}>{line}</li>)}</ul>
          ) : <p>Nothing stands out yet. More unaided answers will show where the marks are.</p>}
          {subject.weaknesses.length ? (
            <div>
              <p className="font-semibold text-ink">Highest-value gaps</p>
              <ul className="mt-1 space-y-0.5">{subject.weaknesses.map((w) => <li key={w.topicId}>{w.title}: {w.reason.toLowerCase()}</li>)}</ul>
            </div>
          ) : null}
          {subject.strongest.length ? (
            <div>
              <p className="font-semibold text-ink">Strongest</p>
              <p className="mt-1">{subject.strongest.map((s) => s.title).join(", ")}</p>
            </div>
          ) : null}
          {t.provenLine ? <p className="text-ink">{t.provenLine}</p> : null}
          {t.levers.length > 1 ? (
            <div>
              <p className="font-semibold text-ink">What could change it</p>
              <ul className="mt-1 space-y-0.5">{t.levers.map((l) => <li key={l.id}><Link href={l.href} className="underline underline-offset-2 hover:text-ink">{l.title}</Link> · {l.minutes} min</li>)}</ul>
            </div>
          ) : null}
        </div>
      </details>
    </Panel>
  );
}

/** Improvement as the reward: what has been proven, recovered and is ready to check. */
export function ImprovementStory() {
  const models = useLearnerModels();
  const proven = models.flatMap((m) => m.outcomes.proven);
  const recovered = Math.round(models.reduce((s, m) => s + m.mistakes.proven, 0) * 10) / 10;
  const due = models.flatMap((m) => m.transfer.proofDue);
  const provisional = Math.round(models.reduce((s, m) => s + m.mistakes.provisional, 0) * 10) / 10;
  const anything = proven.length > 0 || recovered > 0;
  return (
    <Panel className="space-y-2">
      <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Proven improvement</p>
      {anything ? (
        <>
          {proven.length ? (
            <p className="text-base font-semibold text-ink">
              {proven.length} topic{proven.length === 1 ? "" : "s"} improved on questions you had not seen, after a delay.
            </p>
          ) : null}
          {proven.slice(0, 3).map((row) => row.claim ? <p key={row.topicId} className="text-sm text-ink2">{row.claim}</p> : null)}
          {recovered > 0 ? <p className="text-sm text-ink2">{recovered} lost mark{recovered === 1 ? "" : "s"} recovered and still there after a delay.</p> : null}
        </>
      ) : (
        <p className="text-sm text-ink2">
          Nothing proven yet. Improvement counts here once you do better on a question you have not seen, a few days after you studied it.
          {provisional > 0 ? ` ${provisional} mark${provisional === 1 ? " is" : "s are"} on the way: answered well once, waiting for that check.` : ""}
        </p>
      )}
      {due.length ? (
        <p className="text-sm text-ink">
          Ready to prove now: {due.slice(0, 3).map((row) => row.title).join(", ")}.{" "}
          <Link href="/" className="font-medium underline underline-offset-2">Start from Today</Link>
        </p>
      ) : null}
    </Panel>
  );
}
