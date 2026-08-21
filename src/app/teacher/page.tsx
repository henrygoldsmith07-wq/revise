"use client";

import { useEffect, useMemo, useState } from "react";
import { allTopics, getSubject, getTopic, topicsFor } from "@/domain/curriculum";
import { regressionReport } from "@/domain/content-review";
import {
  createDraft,
  moderationQueue,
  moderationStats,
  reviewEntry,
  submitForReview,
} from "@/domain/moderation";
import type { ModerationEntry, ReviewDecision } from "@/domain/moderation";
import { todayIso } from "@/domain/scheduling";
import {
  assignmentProgress,
  buildInterventionEffectiveness,
  buildMisconceptionDashboard,
  buildSchoolReport,
  buildWeaknessClusters,
  demoTeacherEvidence,
  demoTeacherStudents,
  demoTeacherWorkspace,
  schoolReportCsv,
  type TeacherAssignment,
  type TeacherIntervention,
  type TeacherWorkspace,
  type WeaknessCluster,
} from "@/domain/teacher";
import { loadTeacherWorkspace, saveTeacherWorkspace } from "@/data/teacher-workspace";
import { useStore, useSubjects } from "@/state/store";
import { Button, EmptyState, Field, Panel, Pill, ProgressBar, SectionHeading, Segmented, StatTile } from "@/components/ui";

type TeacherView = "overview" | "review" | "assignments" | "content" | "reports";

const VIEW_OPTIONS: Array<{ value: TeacherView; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "review", label: "Review console" },
  { value: "assignments", label: "Assignments" },
  { value: "content", label: "Content workflows" },
  { value: "reports", label: "Reports" },
];

function localId(prefix: string): string {
  return `${prefix}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function addDays(date: Date, days: number): string {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function statusTone(status: string): "neutral" | "success" | "review" | "danger" {
  if (["approved", "completed", "moderated", "active"].includes(status)) return "success";
  if (["pending_review", "needs_changes", "planned", "needs-review"].includes(status)) return "review";
  if (["rejected", "disputed"].includes(status)) return "danger";
  return "neutral";
}

function readableStatus(status: string): string {
  return status.replaceAll("_", " ").replaceAll("-", " ");
}

export default function TeacherPage() {
  const store = useStore();
  const subjects = useSubjects();
  const topics = useMemo(() => allTopics(store.settings.subjectIds), [store.settings.subjectIds]);
  const students = useMemo(() => demoTeacherStudents(store.settings.subjectIds), [store.settings.subjectIds]);
  const demoWorkspace = useMemo(
    () => demoTeacherWorkspace({ questions: store.questions, topics, subjectIds: store.settings.subjectIds }),
    [store.questions, store.settings.subjectIds, topics],
  );
  const [workspace, setWorkspace] = useState<TeacherWorkspace>(demoWorkspace);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<TeacherView>("overview");
  const [notice, setNotice] = useState("");
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [markValues, setMarkValues] = useState<Record<string, string>>({});
  const [interventionOutcomes, setInterventionOutcomes] = useState<Record<string, string>>({});

  const firstSubjectId = subjects[0]?.id ?? store.settings.subjectIds[0] ?? "";
  const firstTopicId = topics.find((topic) => topic.subjectId === firstSubjectId)?.id ?? topics[0]?.id ?? "";
  const firstQuestionId = store.questions[0]?.id ?? "";
  const [assignmentTitle, setAssignmentTitle] = useState("Targeted practice set");
  const [assignmentQuestionId, setAssignmentQuestionId] = useState(firstQuestionId);
  const [assignmentStudentIds, setAssignmentStudentIds] = useState<string[]>(() => students.slice(0, 3).map((student) => student.id));
  const [assignmentDueDate, setAssignmentDueDate] = useState(() => addDays(new Date(), 7));
  const [authoringSubjectId, setAuthoringSubjectId] = useState(firstSubjectId);
  const [authoringTopicId, setAuthoringTopicId] = useState(firstTopicId);
  const [authoringStem, setAuthoringStem] = useState("");
  const [authoringMarks, setAuthoringMarks] = useState("4");
  const [interventionLabel, setInterventionLabel] = useState("");
  const [interventionStudentId, setInterventionStudentId] = useState(students[0]?.id ?? "");
  const [interventionTopicId, setInterventionTopicId] = useState(firstTopicId);
  const [interventionBaseline, setInterventionBaseline] = useState("50");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setWorkspace(loadTeacherWorkspace(demoWorkspace));
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [demoWorkspace]);

  useEffect(() => {
    if (hydrated) saveTeacherWorkspace(workspace);
  }, [hydrated, workspace]);

  const evidence = useMemo(
    () => demoTeacherEvidence(store.questions, topics, students),
    [store.questions, students, topics],
  );
  const clusters = useMemo(() => buildWeaknessClusters({ evidence, topics }), [evidence, topics]);
  const misconceptions = useMemo(() => buildMisconceptionDashboard(evidence), [evidence]);
  const pendingReviews = useMemo(() => moderationQueue(workspace.moderationEntries), [workspace.moderationEntries]);
  const moderation = useMemo(() => moderationStats(workspace.moderationEntries), [workspace.moderationEntries]);
  const report = useMemo(
    () => buildSchoolReport({
      students,
      assignments: workspace.assignments,
      evidence,
      clusters,
      interventions: workspace.interventions,
      markReviews: workspace.markReviews,
      moderationEntries: workspace.moderationEntries,
    }),
    [clusters, evidence, students, workspace.assignments, workspace.interventions, workspace.markReviews, workspace.moderationEntries],
  );
  const contentReport = useMemo(
    () => regressionReport({ topics, questions: store.questions, today: todayIso() }),
    [store.questions, topics],
  );
  const interventionRows = useMemo(() => buildInterventionEffectiveness(workspace.interventions), [workspace.interventions]);

  function updateWorkspace(update: (current: TeacherWorkspace) => TeacherWorkspace) {
    setWorkspace((current) => update(current));
  }

  function setNoticeFor(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? "" : current)), 3200);
  }

  function toggleStudent(studentId: string) {
    setAssignmentStudentIds((current) => current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]);
  }

  function openAssignmentForCluster(cluster: WeaknessCluster) {
    const question = store.questions.find((candidate) => candidate.topicIds.includes(cluster.topicId)) ?? store.questions[0];
    setAssignmentTitle(`${cluster.title} recovery set`);
    setAssignmentQuestionId(question?.id ?? "");
    setAssignmentStudentIds(cluster.atRiskStudentIds.length ? cluster.atRiskStudentIds : cluster.studentIds);
    setView("assignments");
  }

  function createAssignment() {
    if (!assignmentTitle.trim() || !assignmentQuestionId || !assignmentStudentIds.length) {
      setNoticeFor("Choose a question and at least one student before assigning.");
      return;
    }
    const assignment: TeacherAssignment = {
      id: localId("assignment"),
      title: assignmentTitle.trim(),
      questionIds: [assignmentQuestionId],
      studentIds: assignmentStudentIds,
      dueDate: assignmentDueDate,
      status: "active",
      createdAt: new Date().toISOString(),
      createdBy: "teacher-local",
    };
    updateWorkspace((current) => ({ ...current, assignments: [assignment, ...current.assignments] }));
    setNoticeFor("Assignment saved to this teacher workspace.");
  }

  function closeAssignment(assignmentId: string) {
    updateWorkspace((current) => ({
      ...current,
      assignments: current.assignments.map((assignment) => assignment.id === assignmentId ? { ...assignment, status: "closed" } : assignment),
    }));
  }

  function moderateEntry(entry: ModerationEntry, decision: ReviewDecision) {
    try {
      const updated = reviewEntry(entry, decision, "teacher-local", {
        comment: reviewComments[entry.id]?.trim() || undefined,
        verification: decision === "approve" ? "verified" : undefined,
        reviewerName: "Teacher workspace",
        now: new Date(),
      });
      updateWorkspace((current) => ({
        ...current,
        moderationEntries: current.moderationEntries.map((candidate) => candidate.id === entry.id ? updated : candidate),
      }));
      setNoticeFor(decision === "approve" ? "Approved and marked verified." : decision === "request_changes" ? "Changes requested from the author." : "Content rejected and kept out of the publishable set.");
    } catch (error) {
      setNoticeFor(error instanceof Error ? error.message : "This review action could not be applied.");
    }
  }

  function submitDraft(entry: ModerationEntry) {
    try {
      const updated = submitForReview(entry, "teacher-local", new Date());
      updateWorkspace((current) => ({
        ...current,
        moderationEntries: current.moderationEntries.map((candidate) => candidate.id === entry.id ? updated : candidate),
      }));
      setNoticeFor("Draft submitted to the teacher review queue.");
    } catch (error) {
      setNoticeFor(error instanceof Error ? error.message : "This draft could not be submitted.");
    }
  }

  function moderateMark(reviewId: string) {
    const review = workspace.markReviews.find((candidate) => candidate.id === reviewId);
    if (!review) return;
    const value = Number(markValues[reviewId]);
    if (!Number.isFinite(value) || value < 0 || value > review.max) {
      setNoticeFor(`Enter a mark between 0 and ${review.max}.`);
      return;
    }
    updateWorkspace((current) => ({
      ...current,
      markReviews: current.markReviews.map((candidate) => candidate.id === reviewId ? { ...candidate, teacherAwarded: value, status: "moderated" } : candidate),
    }));
    setNoticeFor("Teacher mark recorded. The moderation decision is saved locally.");
  }

  function disputeMark(reviewId: string) {
    updateWorkspace((current) => ({
      ...current,
      markReviews: current.markReviews.map((candidate) => candidate.id === reviewId ? { ...candidate, status: "disputed" } : candidate),
    }));
  }

  function createAuthoringDraft() {
    const stem = authoringStem.trim();
    const marks = Number(authoringMarks);
    const topic = getTopic(authoringTopicId);
    if (!stem || !authoringSubjectId || !topic || !Number.isFinite(marks) || marks < 1) {
      setNoticeFor("Add a question stem, subject, topic and a positive mark value.");
      return;
    }
    const moderationId = localId("moderation");
    const questionId = localId("question");
    const draft = createDraft({
      id: moderationId,
      contentKind: "question",
      contentId: questionId,
      subjectId: authoringSubjectId,
      topicId: topic.id,
      authorId: "teacher-local",
      provenance: {
        source: "authored",
        verification: "unverified",
        specVersion: topic.specVersion,
        specPointIds: topic.specPoints?.slice(0, 2).map((point) => point.id),
      },
      now: new Date(),
      idFactory: () => moderationId,
    });
    updateWorkspace((current) => ({
      ...current,
      moderationEntries: [draft, ...current.moderationEntries],
      authoredQuestions: [{ id: questionId, moderationEntryId: moderationId, subjectId: authoringSubjectId, topicId: topic.id, stem, marks, createdAt: new Date().toISOString() }, ...current.authoredQuestions],
    }));
    setAuthoringStem("");
    setNoticeFor("Question draft saved. Submit it to move it into content review.");
  }

  function createIntervention() {
    const topic = getTopic(interventionTopicId);
    const baseline = Number(interventionBaseline);
    if (!interventionLabel.trim() || !interventionStudentId || !topic || !Number.isFinite(baseline) || baseline < 0 || baseline > 100) {
      setNoticeFor("Add an intervention label, student, topic and baseline from 0–100.");
      return;
    }
    const intervention: TeacherIntervention = {
      id: localId("intervention"),
      label: interventionLabel.trim(),
      studentIds: [interventionStudentId],
      topicIds: [topic.id],
      baselineScore: baseline / 100,
      outcomeScore: null,
      status: "planned",
      startedAt: todayIso(),
    };
    updateWorkspace((current) => ({ ...current, interventions: [intervention, ...current.interventions] }));
    setInterventionLabel("");
    setNoticeFor("Intervention added. Start it when the first session happens.");
  }

  function startIntervention(interventionId: string) {
    updateWorkspace((current) => ({
      ...current,
      interventions: current.interventions.map((intervention) => intervention.id === interventionId ? { ...intervention, status: "active" } : intervention),
    }));
  }

  function recordInterventionOutcome(interventionId: string) {
    const outcome = Number(interventionOutcomes[interventionId]);
    if (!Number.isFinite(outcome) || outcome < 0 || outcome > 100) {
      setNoticeFor("Enter an outcome score from 0–100.");
      return;
    }
    updateWorkspace((current) => ({
      ...current,
      interventions: current.interventions.map((intervention) => intervention.id === interventionId ? { ...intervention, outcomeScore: outcome / 100, status: "completed", completedAt: todayIso() } : intervention),
    }));
    setNoticeFor("Intervention outcome recorded for the effectiveness loop.");
  }

  function downloadReport() {
    const blob = new Blob([schoolReportCsv(report)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `pulse-school-report-${todayIso()}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Teacher P2</p>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mt-1">Teacher Review Console</h1>
            <p className="text-sm text-ink3 mt-1 max-w-3xl">
              Spot class weakness, assign targeted questions, moderate marks and close the loop on whether an intervention worked.
            </p>
          </div>
          <Pill tone="accent">Local teacher workspace</Pill>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink3">
          <Pill tone="review">Sample class data</Pill>
          <span>Six placeholder learners make the P2 workflows testable offline. Connect a school roster before sharing reports.</span>
        </div>
      </header>

      <Segmented options={VIEW_OPTIONS} value={view} onChange={setView} ariaLabel="Teacher workspace" />

      {notice ? <p className="text-xs text-ink2 bg-accentsoft text-accent rounded-[10px] px-3 py-2" role="status" aria-live="polite">{notice}</p> : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Active learners" value={report.studentCount} sub="sample class roster" />
        <StatTile label="Review queue" value={report.pendingReviewCount} sub={`${moderation.draft} drafts · ${moderation.approved} approved`} tone={report.pendingReviewCount ? "review" : "success"} />
        <StatTile label="At-risk learners" value={new Set(clusters.flatMap((cluster) => cluster.atRiskStudentIds)).size} sub="across clustered weaknesses" tone="review" />
        <StatTile label="Intervention outcomes" value={`${report.effectiveInterventionCount}/${report.completedInterventionCount}`} sub="showing measurable gain" tone={report.completedInterventionCount && report.effectiveInterventionCount === report.completedInterventionCount ? "success" : "review"} />
      </div>

      {view === "overview" ? (
        <OverviewView
          clusters={clusters}
          misconceptions={misconceptions}
          assignments={workspace.assignments}
          interventions={interventionRows}
          evidence={evidence}
          onAssign={openAssignmentForCluster}
          onView={(next) => setView(next)}
        />
      ) : null}
      {view === "review" ? (
        <ReviewView
          entries={workspace.moderationEntries}
          pendingReviews={pendingReviews}
          markReviews={workspace.markReviews}
          comments={reviewComments}
          markValues={markValues}
          onComment={(id, value) => setReviewComments((current) => ({ ...current, [id]: value }))}
          onMarkValue={(id, value) => setMarkValues((current) => ({ ...current, [id]: value }))}
          onModerate={moderateEntry}
          onModerateMark={moderateMark}
          onDisputeMark={disputeMark}
          onSubmitDraft={submitDraft}
          onView={(next) => setView(next)}
        />
      ) : null}
      {view === "assignments" ? (
        <AssignmentsView
          assignments={workspace.assignments}
          students={students}
          questions={store.questions}
          evidence={evidence}
          title={assignmentTitle}
          questionId={assignmentQuestionId}
          studentIds={assignmentStudentIds}
          dueDate={assignmentDueDate}
          onTitle={setAssignmentTitle}
          onQuestion={setAssignmentQuestionId}
          onStudent={toggleStudent}
          onDueDate={setAssignmentDueDate}
          onCreate={createAssignment}
          onClose={closeAssignment}
        />
      ) : null}
      {view === "content" ? (
        <ContentView
          subjects={subjects}
          topics={topics}
          authoredQuestions={workspace.authoredQuestions}
          entries={workspace.moderationEntries}
          contentReport={contentReport}
          subjectId={authoringSubjectId}
          topicId={authoringTopicId}
          stem={authoringStem}
          marks={authoringMarks}
          onSubject={(value) => {
            setAuthoringSubjectId(value);
            setAuthoringTopicId(topicsFor(value)[0]?.id ?? "");
          }}
          onTopic={setAuthoringTopicId}
          onStem={setAuthoringStem}
          onMarks={setAuthoringMarks}
          onCreate={createAuthoringDraft}
          onSubmitDraft={submitDraft}
          onRefresh={() => setNoticeFor("Content review checks are computed live from the local curriculum and question bank.")}
        />
      ) : null}
      {view === "reports" ? (
        <ReportsView
          report={report}
          clusters={clusters}
          interventions={workspace.interventions}
          interventionRows={interventionRows}
          students={students}
          topics={topics}
          label={interventionLabel}
          studentId={interventionStudentId}
          topicId={interventionTopicId}
          baseline={interventionBaseline}
          outcomes={interventionOutcomes}
          onLabel={setInterventionLabel}
          onStudent={setInterventionStudentId}
          onTopic={setInterventionTopicId}
          onBaseline={setInterventionBaseline}
          onOutcome={(id, value) => setInterventionOutcomes((current) => ({ ...current, [id]: value }))}
          onCreate={createIntervention}
          onStart={startIntervention}
          onRecord={recordInterventionOutcome}
          onDownload={downloadReport}
        />
      ) : null}
    </div>
  );
}

function OverviewView({
  clusters,
  misconceptions,
  assignments,
  interventions,
  evidence,
  onAssign,
  onView,
}: {
  clusters: WeaknessCluster[];
  misconceptions: ReturnType<typeof buildMisconceptionDashboard>;
  assignments: TeacherAssignment[];
  interventions: ReturnType<typeof buildInterventionEffectiveness>;
  evidence: ReturnType<typeof demoTeacherEvidence>;
  onAssign: (cluster: WeaknessCluster) => void;
  onView: (view: TeacherView) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Panel>
          <SectionHeading title="Class weakness clustering" hint="Group learners by topic-level accuracy and marks at risk." action={<Pill>{clusters.length} clusters</Pill>} />
          {clusters.length ? (
            <div className="space-y-4">
              {clusters.slice(0, 6).map((cluster) => (
                <article key={cluster.topicId} className="border-t border-line pt-3 first:border-0 first:pt-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold truncate">{cluster.title}</h3>
                      <p className="text-xs text-ink3 mt-0.5">{getSubject(cluster.subjectId)?.name ?? cluster.subjectId} · {cluster.studentIds.length} learners · {cluster.marksLost} marks lost</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => onAssign(cluster)}>Assign recovery</Button>
                  </div>
                  <div className="mt-2"><ProgressBar value={cluster.accuracy} label={`${percent(cluster.accuracy)} accuracy · ${cluster.atRiskStudentIds.length} at risk`} tone={cluster.accuracy < 0.6 ? "danger" : "review"} /></div>
                  {cluster.commonMisconceptions.length ? <p className="text-[11px] text-ink3 mt-2">Common: {cluster.commonMisconceptions.map((item) => `${item.tag.replaceAll("-", " ")} (${item.count})`).join(" · ")}</p> : null}
                </article>
              ))}
            </div>
          ) : <EmptyState title="No class clusters yet" body="Sample clusters appear once the question bank has loaded." />}
        </Panel>

        <Panel>
          <SectionHeading title="Misconception dashboard" hint="The recurring error patterns costing the most marks." action={<Pill tone="review">Teacher signal</Pill>} />
          {misconceptions.length ? (
            <div className="space-y-3">
              {misconceptions.slice(0, 6).map((item) => (
                <div key={item.tag} className="flex items-center gap-3 border-t border-line pt-3 first:border-0 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className="text-xs text-ink3 mt-0.5">{item.studentIds.length} learners · {item.occurrences} occurrences · {item.topicIds.length} topics</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-danger">{item.marksLost} lost</span>
                </div>
              ))}
            </div>
          ) : <EmptyState title="No misconceptions tagged" body="Teacher signals will appear after marked evidence is connected." />}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionHeading title="Teacher question assignment" hint="Active work sent to a learner or small group." action={<Button size="sm" onClick={() => onView("assignments")}>Open assignments</Button>} />
          {assignments.length ? assignments.slice(0, 4).map((assignment) => {
            const progress = assignmentProgress(assignment, evidence);
            return <div key={assignment.id} className="border-t border-line pt-3 mt-3 first:mt-0 first:border-0 first:pt-0"><div className="flex justify-between gap-3"><p className="text-sm font-semibold truncate">{assignment.title}</p><Pill tone={statusTone(assignment.status)}>{readableStatus(assignment.status)}</Pill></div><p className="text-xs text-ink3 mt-1">Due {assignment.dueDate} · {assignment.studentIds.length} learners · {progress.completed}/{progress.expected} responses</p><div className="mt-2"><ProgressBar value={progress.completionRate} /></div></div>;
          }) : <EmptyState title="No assignments" body="Create the first targeted question set from a class weakness cluster." action={<Button onClick={() => onView("assignments")}>Create assignment</Button>} />}
        </Panel>
        <Panel>
          <SectionHeading title="Intervention effectiveness" hint="Baseline → outcome, with incomplete loops kept visible." action={<Button size="sm" onClick={() => onView("reports")}>Track intervention</Button>} />
          {interventions.length ? interventions.slice(0, 4).map((intervention) => <div key={intervention.interventionId} className="border-t border-line pt-3 mt-3 first:mt-0 first:border-0 first:pt-0"><div className="flex justify-between gap-3"><p className="text-sm font-semibold truncate">{intervention.label}</p><Pill tone={statusTone(intervention.status)}>{intervention.gain === null ? readableStatus(intervention.status) : `${intervention.gain >= 0 ? "+" : ""}${Math.round(intervention.gain * 100)} pts`}</Pill></div><p className="text-xs text-ink3 mt-1">{intervention.studentCount} learners · {percent(intervention.baselineScore)} baseline → {percent(intervention.outcomeScore)} outcome</p></div>) : <EmptyState title="No interventions recorded" body="Add a small-group or one-to-one intervention to start the outcome loop." action={<Button onClick={() => onView("reports")}>Add intervention</Button>} />}
        </Panel>
      </div>
    </div>
  );
}

function ReviewView({
  entries,
  pendingReviews,
  markReviews,
  comments,
  markValues,
  onComment,
  onMarkValue,
  onModerate,
  onModerateMark,
  onDisputeMark,
  onSubmitDraft,
  onView,
}: {
  entries: ModerationEntry[];
  pendingReviews: ModerationEntry[];
  markReviews: ReturnType<typeof demoTeacherWorkspace>["markReviews"];
  comments: Record<string, string>;
  markValues: Record<string, string>;
  onComment: (id: string, value: string) => void;
  onMarkValue: (id: string, value: string) => void;
  onModerate: (entry: ModerationEntry, decision: ReviewDecision) => void;
  onModerateMark: (id: string) => void;
  onDisputeMark: (id: string) => void;
  onSubmitDraft: (entry: ModerationEntry) => void;
  onView: (view: TeacherView) => void;
}) {
  const drafts = entries.filter((entry) => ["draft", "needs_changes", "rejected"].includes(entry.status));
  return (
    <div className="space-y-6">
      <Panel>
        <SectionHeading title="Teacher Review Console" hint="Moderate authored or generated content before it becomes publishable." action={<Button size="sm" onClick={() => onView("content")}>Author content</Button>} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <ReviewMetric label="Pending" value={pendingReviews.length} />
          <ReviewMetric label="Drafts / changes" value={drafts.length} />
          <ReviewMetric label="Approved" value={entries.filter((entry) => entry.status === "approved").length} />
          <ReviewMetric label="Provenance gaps" value={entries.filter((entry) => entry.provenance.verification === "unverified").length} />
        </div>
      </Panel>

      <section>
        <SectionHeading title="Content review workflow" hint="Oldest pending item first. Approve also records a verified reviewer check." />
        {pendingReviews.length ? <div className="space-y-3">{pendingReviews.map((entry) => <ModerationCard key={entry.id} entry={entry} comment={comments[entry.id] ?? ""} onComment={onComment} onModerate={onModerate} />)}</div> : <EmptyState title="Review queue is clear" body="New authored questions and content flags will appear here before publishing." />}
      </section>

      {drafts.length ? <section><SectionHeading title="Authoring hand-offs" hint="Drafts can be corrected or submitted into the review queue." /><div className="card divide-y divide-line overflow-hidden">{drafts.map((entry) => <div key={entry.id} className="p-4 flex flex-wrap items-center justify-between gap-3"><div><div className="flex flex-wrap gap-1.5"><Pill>{entry.contentKind}</Pill><Pill tone={statusTone(entry.status)}>{readableStatus(entry.status)}</Pill><Pill>v{entry.version}</Pill></div><p className="text-xs text-ink3 mt-2">{entry.contentId} · {entry.provenance.source} · {entry.provenance.verification}</p></div><Button size="sm" variant="primary" onClick={() => onSubmitDraft(entry)}>Submit for review</Button></div>)}</div></section> : null}

      <section>
        <SectionHeading title="Teacher Mark Moderation · Examiner Review Workflow" hint="Resolve low-confidence marks before they feed learner progress or school reports." />
        {markReviews.length ? <div className="card divide-y divide-line overflow-hidden">{markReviews.map((review) => <article key={review.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-1.5"><Pill>{review.studentName}</Pill><Pill tone={statusTone(review.status)}>{readableStatus(review.status)}</Pill></div><p className="text-sm font-semibold mt-2">{review.questionLabel}</p><p className="text-xs text-ink3 mt-1">AI awarded {review.aiAwarded}/{review.max} · {review.reason}</p></div><div className="flex items-end gap-2"><Field label="Teacher mark" htmlFor={`mark-${review.id}`}><input id={`mark-${review.id}`} type="number" min={0} max={review.max} step={1} value={markValues[review.id] ?? (review.teacherAwarded ?? "")} onChange={(event) => onMarkValue(review.id, event.target.value)} className="field field-inline w-20 text-sm" /></Field><Button size="sm" onClick={() => onModerateMark(review.id)} disabled={review.status === "moderated"}>Record</Button></div></div><div className="flex flex-wrap items-center justify-between gap-2 mt-3"><p className="text-xs text-ink3">{review.teacherAwarded === null ? "Awaiting examiner decision" : `Teacher decision: ${review.teacherAwarded}/${review.max}`}</p>{review.status !== "disputed" && review.status !== "moderated" ? <Button size="sm" variant="ghost" onClick={() => onDisputeMark(review.id)}>Dispute for examiner</Button> : null}</div></article>)}</div> : <EmptyState title="No marks need moderation" body="Low-confidence or disputed mark decisions will appear in this queue." />}
      </section>
    </div>
  );
}

function ReviewMetric({ label, value }: { label: string; value: number }) {
  return <div className="bg-surface2 rounded-[10px] px-3 py-2"><p className="text-[11px] text-ink3">{label}</p><p className="text-lg font-semibold tabular-nums mt-0.5">{value}</p></div>;
}

function ModerationCard({
  entry,
  comment,
  onComment,
  onModerate,
}: {
  entry: ModerationEntry;
  comment: string;
  onComment: (id: string, value: string) => void;
  onModerate: (entry: ModerationEntry, decision: ReviewDecision) => void;
}) {
  return <article className="card p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap gap-1.5"><Pill>{entry.contentKind}</Pill><Pill tone="review">pending review</Pill><Pill>{entry.provenance.source}</Pill><Pill tone={entry.provenance.verification === "unverified" ? "danger" : "neutral"}>{entry.provenance.verification}</Pill></div><h3 className="text-sm font-semibold mt-2">{entry.contentId}</h3><p className="text-xs text-ink3 mt-1">{getTopic(entry.topicId ?? "")?.title ?? "Unmapped topic"} · v{entry.version} · authored by {entry.authorId}</p></div><span className="text-[11px] text-ink3 tabular-nums">submitted {entry.submittedAt?.slice(0, 10) ?? "—"}</span></div><label className="block mt-4"><span className="text-xs font-semibold text-ink2">Reviewer note</span><textarea rows={2} value={comment} onChange={(event) => onComment(entry.id, event.target.value)} placeholder="What should the author verify?" className="field text-sm w-full mt-1" /></label><div className="flex flex-wrap gap-2 mt-3"><Button size="sm" variant="primary" onClick={() => onModerate(entry, "approve")}>Approve & verify</Button><Button size="sm" onClick={() => onModerate(entry, "request_changes")}>Request changes</Button><Button size="sm" variant="ghost" onClick={() => onModerate(entry, "reject")}>Reject</Button></div></article>;
}

function AssignmentsView({
  assignments,
  students,
  questions,
  evidence,
  title,
  questionId,
  studentIds,
  dueDate,
  onTitle,
  onQuestion,
  onStudent,
  onDueDate,
  onCreate,
  onClose,
}: {
  assignments: TeacherAssignment[];
  students: ReturnType<typeof demoTeacherStudents>;
  questions: ReturnType<typeof useStore>["questions"];
  evidence: ReturnType<typeof demoTeacherEvidence>;
  title: string;
  questionId: string;
  studentIds: string[];
  dueDate: string;
  onTitle: (value: string) => void;
  onQuestion: (value: string) => void;
  onStudent: (id: string) => void;
  onDueDate: (value: string) => void;
  onCreate: () => void;
  onClose: (id: string) => void;
}) {
  return <div className="space-y-6"><Panel><SectionHeading title="Teacher Question Assignment" hint="Create a small, explainable assignment from the current local question bank." /><div className="grid gap-4 lg:grid-cols-2"><Field label="Assignment title" htmlFor="assignment-title"><input id="assignment-title" value={title} onChange={(event) => onTitle(event.target.value)} className="field text-sm w-full" /></Field><Field label="Due date" htmlFor="assignment-due"><input id="assignment-due" type="date" value={dueDate} onChange={(event) => onDueDate(event.target.value)} className="field text-sm w-full" /></Field><Field label="Question" hint="The P2 slice starts with one targeted question per assignment." htmlFor="assignment-question"><select id="assignment-question" value={questionId} onChange={(event) => onQuestion(event.target.value)} className="field text-sm w-full"><option value="">Choose a question</option>{questions.map((question) => <option key={question.id} value={question.id}>{question.stem.replace(/\s+/g, " ").slice(0, 90)} · {question.totalMarks} marks</option>)}</select></Field><fieldset><legend className="text-xs font-semibold text-ink2">Learners</legend><p className="text-[11px] text-ink3 mb-2">Choose a learner or small group.</p><div className="grid grid-cols-2 gap-2">{students.map((student) => <label key={student.id} className="flex items-center gap-2 text-xs text-ink2"><input type="checkbox" checked={studentIds.includes(student.id)} onChange={() => onStudent(student.id)} />{student.name} <span className="text-ink3">{student.group}</span></label>)}</div></fieldset></div><div className="mt-4 flex justify-end"><Button variant="primary" onClick={onCreate}>Assign question set</Button></div></Panel><section><SectionHeading title="Assignments" hint="Completion is derived from the local sample evidence, not manually entered." />{assignments.length ? <div className="card divide-y divide-line overflow-hidden">{assignments.map((assignment) => { const progress = assignmentProgress(assignment, evidence); return <article key={assignment.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap gap-1.5"><Pill tone={statusTone(assignment.status)}>{readableStatus(assignment.status)}</Pill><Pill>Due {assignment.dueDate}</Pill></div><h3 className="text-sm font-semibold mt-2">{assignment.title}</h3><p className="text-xs text-ink3 mt-1">{assignment.studentIds.length} learners · {assignment.questionIds.length} question{assignment.questionIds.length === 1 ? "" : "s"}</p></div>{assignment.status !== "closed" ? <Button size="sm" variant="ghost" onClick={() => onClose(assignment.id)}>Close assignment</Button> : null}</div><div className="mt-3"><ProgressBar value={progress.completionRate} label={`${progress.completed}/${progress.expected} responses · ${percent(progress.accuracy)} accuracy`} tone={progress.completionRate === 1 ? "success" : "accent"} /></div></article>; })}</div> : <EmptyState title="No assignments yet" body="Use the form above or assign directly from a weakness cluster." />}</section></div>;
}

function ContentView({
  subjects,
  topics,
  authoredQuestions,
  entries,
  contentReport,
  subjectId,
  topicId,
  stem,
  marks,
  onSubject,
  onTopic,
  onStem,
  onMarks,
  onCreate,
  onSubmitDraft,
  onRefresh,
}: {
  subjects: ReturnType<typeof useSubjects>;
  topics: ReturnType<typeof allTopics>;
  authoredQuestions: ReturnType<typeof demoTeacherWorkspace>["authoredQuestions"];
  entries: ModerationEntry[];
  contentReport: ReturnType<typeof regressionReport>;
  subjectId: string;
  topicId: string;
  stem: string;
  marks: string;
  onSubject: (value: string) => void;
  onTopic: (value: string) => void;
  onStem: (value: string) => void;
  onMarks: (value: string) => void;
  onCreate: () => void;
  onSubmitDraft: (entry: ModerationEntry) => void;
  onRefresh: () => void;
}) {
  const topicOptions = topics.filter((topic) => topic.subjectId === subjectId);
  return <div className="space-y-6"><div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]"><Panel><SectionHeading title="Question Authoring Workflow" hint="Draft → teacher review → examiner verification → publishable content." /><div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><Field label="Subject" htmlFor="author-subject"><select id="author-subject" value={subjectId} onChange={(event) => onSubject(event.target.value)} className="field text-sm w-full">{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></Field><Field label="Topic" htmlFor="author-topic"><select id="author-topic" value={topicId} onChange={(event) => onTopic(event.target.value)} className="field text-sm w-full">{topicOptions.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select></Field></div><Field label="Question stem" hint="Keep the authored prompt separate from the moderation record until it is approved." htmlFor="author-stem"><textarea id="author-stem" rows={5} value={stem} onChange={(event) => onStem(event.target.value)} placeholder="Write the exam-style question…" className="field text-sm w-full" /></Field><Field label="Marks" htmlFor="author-marks"><input id="author-marks" type="number" min={1} value={marks} onChange={(event) => onMarks(event.target.value)} className="field field-inline text-sm w-24" /></Field><div className="flex justify-end"><Button variant="primary" onClick={onCreate}>Save question draft</Button></div></div></Panel><Panel><SectionHeading title="Content review workflow" hint="Live regression checks over the current curriculum and question bank." action={<Button size="sm" onClick={onRefresh}>Run again</Button>} /><div className="grid grid-cols-2 gap-3"><ReviewMetric label="Flags" value={contentReport.flags.length} /><ReviewMetric label="Stale checks" value={contentReport.staleCount} /><ReviewMetric label="Unmapped questions" value={contentReport.unmappedQuestions.length} /><ReviewMetric label="Status" value={contentReport.ok ? 0 : 1} /></div><Pill tone={contentReport.ok ? "success" : "review"} className="mt-3">{contentReport.ok ? "Regression checks clear" : "Review flags need attention"}</Pill>{contentReport.flags.length ? <div className="mt-4 space-y-2 max-h-64 overflow-auto nice-scroll">{contentReport.flags.slice(0, 12).map((flag, index) => <div key={`${flag.id}-${index}`} className="border-t border-line pt-2 first:border-0 first:pt-0"><p className="text-xs font-semibold">{readableStatus(flag.kind)}</p><p className="text-[11px] text-ink3 mt-0.5">{flag.detail}</p></div>)}</div> : <p className="text-xs text-ink3 mt-4">No curriculum regressions found in the current local content.</p>}</Panel></div><section><SectionHeading title="Authored question drafts" hint="A draft cannot enter the question pool until its moderation record is approved and verified." />{authoredQuestions.length ? <div className="card divide-y divide-line overflow-hidden">{authoredQuestions.map((question) => { const entry = entries.find((candidate) => candidate.id === question.moderationEntryId); return <article key={question.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-1.5"><Pill>{getSubject(question.subjectId)?.name ?? question.subjectId}</Pill><Pill>{getTopic(question.topicId)?.title ?? question.topicId}</Pill><Pill tone={statusTone(entry?.status ?? "draft")}>{readableStatus(entry?.status ?? "draft")}</Pill></div><p className="text-sm font-semibold mt-2">{question.stem}</p><p className="text-xs text-ink3 mt-1">{question.marks} marks · created {question.createdAt.slice(0, 10)} · {entry?.provenance.verification ?? "unverified"}</p></div>{entry && ["draft", "needs_changes", "rejected"].includes(entry.status) ? <Button size="sm" variant="primary" onClick={() => onSubmitDraft(entry)}>Submit for review</Button> : null}</div></article>; })}</div> : <EmptyState title="No authored drafts" body="Write a question above to start the content review workflow." />}</section></div>;
}

function ReportsView({
  report,
  clusters,
  interventions,
  interventionRows,
  students,
  topics,
  label,
  studentId,
  topicId,
  baseline,
  outcomes,
  onLabel,
  onStudent,
  onTopic,
  onBaseline,
  onOutcome,
  onCreate,
  onStart,
  onRecord,
  onDownload,
}: {
  report: ReturnType<typeof buildSchoolReport>;
  clusters: WeaknessCluster[];
  interventions: TeacherIntervention[];
  interventionRows: ReturnType<typeof buildInterventionEffectiveness>;
  students: ReturnType<typeof demoTeacherStudents>;
  topics: ReturnType<typeof allTopics>;
  label: string;
  studentId: string;
  topicId: string;
  baseline: string;
  outcomes: Record<string, string>;
  onLabel: (value: string) => void;
  onStudent: (value: string) => void;
  onTopic: (value: string) => void;
  onBaseline: (value: string) => void;
  onOutcome: (id: string, value: string) => void;
  onCreate: () => void;
  onStart: (id: string) => void;
  onRecord: (id: string) => void;
  onDownload: () => void;
}) {
  return <div className="space-y-6"><Panel><SectionHeading title="School Reporting" hint="A shareable summary of local sample-cohort activity, content review and intervention outcomes." action={<Button size="sm" variant="primary" onClick={onDownload}>Download CSV</Button>} /><div className="grid grid-cols-2 lg:grid-cols-5 gap-3"><ReviewMetric label="Learners" value={report.studentCount} /><ReviewMetric label="Assignments" value={report.assignmentCount} /><ReviewMetric label="Completion %" value={Math.round(report.assignmentCompletionRate * 100)} /><ReviewMetric label="Accuracy %" value={report.averageAccuracy === null ? 0 : Math.round(report.averageAccuracy * 100)} /><ReviewMetric label="Review queue" value={report.pendingReviewCount} /></div><p className="text-xs text-ink3 mt-4">Generated {report.generatedAt.slice(0, 10)} · This report is local sample data until a school roster and consented outcomes are connected.</p></Panel><div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]"><Panel><SectionHeading title="Class weakness report" hint="Prioritised by marks lost and number of learners at risk." />{clusters.length ? <div className="space-y-3">{clusters.slice(0, 8).map((cluster) => <div key={cluster.topicId} className="border-t border-line pt-3 first:border-0 first:pt-0"><div className="flex justify-between gap-3"><p className="text-sm font-semibold truncate">{cluster.title}</p><span className="text-xs tabular-nums text-danger">{cluster.marksLost} marks lost</span></div><p className="text-xs text-ink3 mt-1">{cluster.studentIds.length} learners · {cluster.atRiskStudentIds.length} at risk · {percent(cluster.accuracy)} accuracy</p><div className="mt-2"><ProgressBar value={cluster.accuracy} /></div></div>)}</div> : <EmptyState title="No weakness data" body="The report will populate from marked evidence." />}</Panel><Panel><SectionHeading title="Intervention Effectiveness Tracking" hint="Record a baseline, start the intervention, then enter a later outcome." /><div className="space-y-3"><Field label="Intervention label" htmlFor="intervention-label"><input id="intervention-label" value={label} onChange={(event) => onLabel(event.target.value)} placeholder="e.g. Command-word clinic" className="field text-sm w-full" /></Field><div className="grid gap-3 sm:grid-cols-3"><Field label="Learner" htmlFor="intervention-student"><select id="intervention-student" value={studentId} onChange={(event) => onStudent(event.target.value)} className="field text-sm w-full">{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></Field><Field label="Target topic" htmlFor="intervention-topic"><select id="intervention-topic" value={topicId} onChange={(event) => onTopic(event.target.value)} className="field text-sm w-full">{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select></Field><Field label="Baseline %" htmlFor="intervention-baseline"><input id="intervention-baseline" type="number" min={0} max={100} value={baseline} onChange={(event) => onBaseline(event.target.value)} className="field text-sm w-full" /></Field></div><div className="flex justify-end"><Button variant="primary" onClick={onCreate}>Add intervention</Button></div></div><div className="border-t border-line mt-5 pt-4 space-y-3">{interventionRows.length ? interventionRows.map((row) => { const intervention = interventions.find((candidate) => candidate.id === row.interventionId); return <article key={row.interventionId} className="bg-surface2 rounded-[10px] p-3"><div className="flex flex-wrap justify-between gap-2"><div><p className="text-sm font-semibold">{row.label}</p><p className="text-xs text-ink3 mt-0.5">{row.studentCount} learner{row.studentCount === 1 ? "" : "s"} · {percent(row.baselineScore)} baseline → {percent(row.outcomeScore)}</p></div><Pill tone={statusTone(row.status)}>{row.gain === null ? readableStatus(row.status) : `${row.gain >= 0 ? "+" : ""}${Math.round(row.gain * 100)} pts`}</Pill></div>{intervention?.status === "planned" ? <Button size="sm" className="mt-3" onClick={() => onStart(row.interventionId)}>Start intervention</Button> : null}{intervention?.status === "active" ? <div className="flex items-end gap-2 mt-3"><Field label="Outcome %" htmlFor={`outcome-${row.interventionId}`}><input id={`outcome-${row.interventionId}`} type="number" min={0} max={100} value={outcomes[row.interventionId] ?? ""} onChange={(event) => onOutcome(row.interventionId, event.target.value)} placeholder="e.g. 68" className="field field-inline text-sm w-24" /></Field><Button size="sm" variant="primary" onClick={() => onRecord(row.interventionId)}>Record outcome</Button></div> : null}</article>; }) : <p className="text-xs text-ink3">No interventions yet. Add one to create a measurable outcome loop.</p>}</div></Panel></div></div>;
}
