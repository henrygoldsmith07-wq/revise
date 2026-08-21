"use client";

import { useMemo, useState } from "react";
import { getSubject, getTopic } from "@/domain/curriculum";
import { formatTime, planForDate } from "@/domain/planner";
import { ACTIVITY_LABEL } from "@/domain/recommender";
import { todayIso, toDateOnly } from "@/domain/scheduling";
import type { ExamDate, PlannedSession } from "@/domain/types";
import { activityHref, formatMinutes, relativeDay } from "@/lib/activity";
import { useStore, useSubjects } from "@/state/store";
import { Button, ButtonLink, EmptyState, Field, Panel, Pill, SectionHeading, StatTile, cx } from "@/components/ui";

// The timetable. It is derived state, not a document: pressing "rebuild" is
// always safe, and missed blocks roll forward on their own so the plan never
// becomes a list of things the student has already failed to do.

const HORIZON_DAYS = 14;

export default function PlannerPage() {
  const store = useStore();
  const subjects = useSubjects();
  const today = todayIso();
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const days = useMemo(
    () =>
      Array.from({ length: HORIZON_DAYS }, (_, i) =>
        toDateOnly(new Date(new Date(`${today}T00:00:00Z`).getTime() + i * 86_400_000)),
      ),
    [today],
  );

  const plannedMinutes = store.plannedSessions
    .filter((s) => s.date >= today && s.status === "pending")
    .reduce((a, s) => a + s.minutes, 0);
  // Derived from `today` rather than a fresh Date.now() so the whole render
  // agrees on one clock.
  const weekAgo = toDateOnly(new Date(new Date(`${today}T00:00:00Z`).getTime() - 7 * 86_400_000));
  const doneThisWeek = store.plannedSessions.filter((s) => s.status === "done" && s.date >= weekAgo).length;
  const missed = store.plannedSessions.filter((s) => s.status === "missed").length;
  const stale = store.plannedSessions.filter((s) => s.date < today && s.status === "pending").length;

  async function rebuild() {
    setBusy(true);
    await store.regeneratePlan();
    setBusy(false);
  }

  async function reschedule() {
    setBusy(true);
    await store.rescheduleMissedSessions();
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Revision plan</h1>
          <p className="text-sm text-ink3 mt-0.5">
            Built from your exam dates, available hours, current mastery and what you keep getting wrong.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void reschedule()} disabled={busy || !stale}>
            Reschedule missed
          </Button>
          <Button variant="primary" onClick={() => void rebuild()} disabled={busy}>
            {busy ? "Rebuilding…" : "Rebuild plan"}
          </Button>
        </div>
      </header>

      {store.replanSummary && !dismissed ? (
        <div
          role="status"
          className="card border-review bg-reviewsoft px-4 py-3 flex items-start justify-between gap-3"
        >
          <p className="text-sm text-ink">
            <span className="font-semibold">Plan adjusted.</span> {store.replanSummary}
          </p>
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)} aria-label="Dismiss plan update note">
            Dismiss
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Planned" value={formatMinutes(plannedMinutes)} sub="over the next two weeks" />
        <StatTile label="Completed" value={doneThisWeek} sub="sessions in the last 7 days" tone="success" />
        <StatTile label="Missed" value={missed} sub={missed ? "rolled forward automatically" : "nothing dropped"} tone={missed ? "review" : undefined} />
        <StatTile label="Exams set" value={store.examDates.length} sub={store.examDates.length ? "driving urgency" : "add one to sharpen the plan"} />
      </div>

      {store.plannedSessions.length === 0 ? (
        <EmptyState
          title="No plan yet"
          body="Set how much time you have on each weekday in settings, add your exam dates, then build the plan. It rebuilds from your latest mastery every time."
          action={
            <Button onClick={() => void rebuild()}>
              Build my plan
            </Button>
          }
        />
      ) : (
        <section>
          <SectionHeading title="Next two weeks" hint="Tap a block to start it, or mark it done." />
          <div className="space-y-3">
            {days.map((date) => {
              const sessions = planForDate(store.plannedSessions, date);
              if (!sessions.length) return null;
              return (
                <Panel key={date} className="p-0 overflow-hidden">
                  <div className="flex items-baseline justify-between px-4 py-2.5 border-b border-line">
                    <p className="text-sm font-semibold">
                      {new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
                        weekday: "long",
                        day: "numeric",
                        month: "short",
                        timeZone: "UTC",
                      })}
                    </p>
                    <p className="text-[11px] text-ink3">
                      {relativeDay(date, today)} · {formatMinutes(sessions.reduce((a, s) => a + s.minutes, 0))}
                    </p>
                  </div>
                  <ul className="divide-y divide-line">
                    {sessions.map((session) => (
                      <SessionRow key={session.id} session={session} />
                    ))}
                  </ul>
                </Panel>
              );
            })}
          </div>
        </section>
      )}

      <ExamDates subjects={subjects} />
    </div>
  );
}

function SessionRow({ session }: { session: PlannedSession }) {
  const store = useStore();
  const topic = session.topicId ? getTopic(session.topicId) : null;
  const done = session.status === "done";

  return (
    <li className={cx("flex items-center gap-3 px-4 py-2.5", done && "opacity-60")}>
      <span className="text-xs tabular-nums text-ink3 w-11 shrink-0">{formatTime(session.startMinute)}</span>
      <div className="min-w-0 flex-1">
        <p className={cx("text-sm truncate", done ? "line-through text-ink3" : "text-ink")}>
          {ACTIVITY_LABEL[session.activity]}
          {topic ? ` · ${topic.title}` : ""}
        </p>
        <p className="text-[11px] text-ink3 truncate">
          {getSubject(session.subjectId)?.name} — {session.reason}
        </p>
      </div>
      {done ? (
        <Pill tone="success">Done</Pill>
      ) : session.status === "missed" ? (
        <Pill tone="review">Missed</Pill>
      ) : (
        <div className="flex gap-1 shrink-0">
          <ButtonLink href={activityHref(session.activity, session.subjectId, session.topicId, session.id)} size="sm" variant="primary">
            Start
          </ButtonLink>
          <Button size="sm" variant="ghost" onClick={() => void store.completeSession(session.id, "skipped")}>
            Skip
          </Button>
        </div>
      )}
    </li>
  );
}

function ExamDates({ subjects }: { subjects: { id: string; name: string; papers: { id: string; name: string }[] }[] }) {
  const store = useStore();
  const today = todayIso();
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");

  const upcoming = [...store.examDates].sort((a, b) => a.date.localeCompare(b.date));

  async function add() {
    if (!subjectId || !date) return;
    const exam: ExamDate = {
      id: crypto.randomUUID(),
      userId: store.userId,
      subjectId,
      date,
      label: label.trim() || `${subjects.find((s) => s.id === subjectId)?.name} exam`,
    };
    await store.upsertExamDate(exam);
    setDate("");
    setLabel("");
    // Adding an exam date changes every urgency weight, so the store replans
    // automatically the moment it lands.
  }

  return (
    <section>
      <SectionHeading title="Exam dates" hint="Urgency scales smoothly as each date approaches." />
      <Panel>
        <div className="grid sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
          <Field label="Subject">
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="field text-sm">
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} className="field text-sm" />
          </Field>
          <Field label="Label" hint="Optional">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Unit 3" className="field text-sm" />
          </Field>
          <Button variant="primary" onClick={() => void add()} disabled={!date}>
            Add
          </Button>
        </div>

        {upcoming.length ? (
          <ul className="mt-4 divide-y divide-line border-t border-line">
            {upcoming.map((exam) => (
              <li key={exam.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink truncate">{exam.label}</p>
                  <p className="text-[11px] text-ink3">
                    {getSubject(exam.subjectId)?.name} · {exam.date} · {relativeDay(exam.date, today)}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void store.removeExamDate(exam.id)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink3 mt-3">
            No exam dates yet. Without them the planner spreads work evenly instead of front-loading what is closest.
          </p>
        )}
      </Panel>
    </section>
  );
}
