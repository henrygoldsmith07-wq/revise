"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "@/state/account";
import { useStoreFields } from "@/state/store";
import { allTopics } from "@/domain/curriculum";
import { loadClassEvidenceSnapshot } from "@/data/class-sharing";
import { buildClassHeatmap, type Classroom, type ClassMembership, type ClassAssignment, type ClassEvidence } from "@/domain/classes";
import * as classes from "@/data/classes";
import { Button, ButtonLink, Panel, SectionHeading } from "@/components/ui";

const inputClass = "w-full rounded-lg border border-line bg-surface p-2 text-sm";
type ClassDetail = { members: ClassMembership[]; assignments: ClassAssignment[]; evidence: ClassEvidence[] };

export default function ClassesPage() {
  const account = useAccount();
  const store = useStoreFields("questions");
  const [owned, setOwned] = useState<Classroom[]>([]);
  const [memberships, setMemberships] = useState<ClassMembership[]>([]);
  const [studentAssignments, setStudentAssignments] = useState<ClassAssignment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [alias, setAlias] = useState("");
  const [ageBand, setAgeBand] = useState<"under13" | "13-17" | "18+">("13-17");
  const [consent, setConsent] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"check" | "topic">("topic");
  const [topicId, setTopicId] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const topics = useMemo(() => allTopics(), []);
  const questionOptions = useMemo(() => store.questions.filter((question) => question.topicIds.includes(topicId)), [store.questions, topicId]);
  const heatmap = useMemo(() => buildClassHeatmap(detail?.evidence ?? []), [detail]);
  const selected = owned.find((item) => item.id === selectedId);

  const refresh = useCallback(async () => {
    const [nextOwned, nextMemberships, nextAssignments] = await Promise.all([
      classes.listClasses(), classes.listMemberships(), classes.listStudentAssignments(),
    ]);
    setOwned(nextOwned); setMemberships(nextMemberships); setStudentAssignments(nextAssignments);
  }, []);
  useEffect(() => {
    if (account.kind !== "account") return;
    let active = true;
    void Promise.all([classes.listClasses(), classes.listMemberships(), classes.listStudentAssignments()]).then(([nextOwned, nextMemberships, nextAssignments]) => {
      if (active) { setOwned(nextOwned); setMemberships(nextMemberships); setStudentAssignments(nextAssignments); }
    }).catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "Could not load classes."); });
    return () => { active = false; };
  }, [account.kind]);
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    void classes.loadClass(selectedId).then((next) => { if (active) setDetail(next); }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : "Could not load this class.");
    });
    return () => { active = false; };
  }, [selectedId]);

  async function run(action: () => Promise<void>, message: string) {
    setBusy(true); setError(null); setNotice("");
    try {
      await action(); await refresh();
      if (selectedId) setDetail(await classes.loadClass(selectedId));
      setNotice(message);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "This change could not be saved. Try again online."); }
    finally { setBusy(false); }
  }

  return <div className="max-w-5xl mx-auto space-y-5">
    <header><h1 className="text-2xl font-semibold">Your classes</h1><p className="text-sm text-ink2 mt-2">Real classmates, assigned checks and the misconceptions costing marks. No demo roster.</p></header>
    <Panel><p className="text-sm text-ink2">Class sharing is separate from AI consent. Your teacher sees your class alias, assigned question/topic IDs, practice marks, misconception tags and attempt dates — not your answers, email, date of birth or other revision history. Leave a class to stop sharing and delete its shared evidence. These are practice signals, not examiner-approved marks.</p></Panel>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {notice && <p role="status" className="text-success">{notice}</p>}
    {account.kind !== "account" ? <Panel><h2 className="font-semibold">Sign in to use real classes</h2><p className="text-sm text-ink2 my-3">Classes need a configured online school account. Local revision still works without sharing anything.</p><ButtonLink href="/settings">Open account settings</ButtonLink></Panel> : <>
      <div className="grid md:grid-cols-2 gap-5">
        <Panel><SectionHeading title="Join your class" hint="Ask your teacher for the join code." />
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (ageBand === "under13") { setError("Class sharing is not available for under-13s."); return; } void run(() => classes.joinClass(code.trim(), alias.trim(), ageBand, consent), "Join request saved. Under-18 sharing stays off until your teacher confirms authorization."); }}>
            <label className="block text-sm">Class join code<input required minLength={64} maxLength={64} pattern="[a-fA-F0-9]{64}" className={inputClass} value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" /></label>
            <label className="block text-sm">Class alias (not your full name)<input required maxLength={40} className={inputClass} value={alias} onChange={(event) => setAlias(event.target.value)} /></label>
            <label className="block text-sm">Age group<select className={inputClass} value={ageBand} onChange={(event) => setAgeBand(event.target.value as typeof ageBand)}><option value="under13">Under 13</option><option value="13-17">13–17</option><option value="18+">18 or over</option></select></label>
            <label className="flex gap-2 text-sm"><input required type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />I agree to share the limited assigned-work progress described above with this teacher.</label>
            <p className="text-xs text-ink3">Under 18? Your teacher must confirm the school/guardian authorization process before any work can be shared. Do not enter personal details in your alias.</p>
            <Button type="submit" disabled={busy || !consent || ageBand === "under13"}>Join class</Button>
          </form>
        </Panel>
        <Panel><SectionHeading title="Create a class" hint="Only accounts with an active teacher grant can create and manage classes." />
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void run(async () => { const created = await classes.createClass(name.trim()); setSelectedId(created.id); setName(""); }, "Class created. Share its code privately with your pupils."); }}>
            <label className="block text-sm">Class name<input required maxLength={80} className={inputClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="Year 12 Physics" /></label>
            <Button type="submit" disabled={busy}>Create class</Button>
          </form>
          <p className="text-xs text-ink3 mt-3">Schools must complete their privacy and guardian processes before inviting minors. A checkbox is not a legal compliance assessment.</p>
        </Panel>
      </div>
      <Panel><SectionHeading title="Classes you have joined" />
        {!memberships.length && <p className="text-sm text-ink2">No class joined yet.</p>}
        <ul className="space-y-4">{memberships.map((member) => {
          const assignments = studentAssignments.filter((item) => item.classId === member.classId);
          return <li key={member.classId} className="border-t border-line pt-3 space-y-2">
            <p className="font-medium">{member.className ?? "Your class"} · {member.alias}</p>
            <p className="text-sm text-ink2">{member.status === "active" ? "Sharing authorized — you choose when to send assigned-work progress." : "Pending teacher authorization. No evidence shared."}</p>
            <ul className="space-y-2">{assignments.map((assignment) => <li key={assignment.id} className="text-sm"><p>{assignment.title} · due {assignment.dueDate}</p>
              {assignment.kind === "topic" && assignment.topicId ? <ButtonLink size="sm" href={`/practice?topic=${encodeURIComponent(assignment.topicId)}`}>Practise topic</ButtonLink> : <div className="flex flex-wrap gap-2">{assignment.questionIds.map((id, index) => <ButtonLink size="sm" key={id} href={`/practice?question=${encodeURIComponent(id)}`}>Start question {index + 1}</ButtonLink>)}</div>}
            </li>)}</ul>
            <div className="flex flex-wrap gap-2"><Button disabled={busy || member.status !== "active"} onClick={() => void run(async () => {
                const snapshot = await loadClassEvidenceSnapshot(member, assignments);
                if (!snapshot.length) throw new Error("No eligible assigned work is saved on this device after consent and authorization. Complete an assigned question first.");
                await classes.shareClassEvidence(member.classId, snapshot);
              }, "Assigned-work progress shared. No answers were sent.")}>Share assigned progress</Button>
              <Button disabled={busy} onClick={() => void run(() => classes.leaveClass(member.classId), "Left class. Its shared evidence has been deleted.")}>Leave and delete shared evidence</Button></div>
          </li>;
        })}</ul>
      </Panel>
      <Panel><SectionHeading title="Your teaching classes" />
        {!owned.length ? <p className="text-sm text-ink2">No teaching classes yet. Teacher access is granted by a maintainer, not by a display toggle.</p> : <label className="block text-sm">Choose class<select disabled={busy} className={inputClass} value={selectedId} onChange={(event) => { setDetail(null); setSelectedId(event.target.value); }}><option value="">Choose…</option>{owned.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {selected && <p className="mt-3 text-sm">Private join code: <code className="font-semibold select-all">{selected.joinCode}</code></p>}
      </Panel>
      {selected && detail && <>
        <Panel><SectionHeading title={`${selected.name} roster`} />
          {!detail.members.length && <p className="text-sm text-ink2">No pupils have joined. Share the private code with your class.</p>}
          <ul className="space-y-3">{detail.members.map((member) => <li key={member.studentId} className="text-sm"><p>{member.alias} · {member.ageBand} · {member.status}</p>{member.status === "pending" && <><p className="text-xs text-ink3 my-2">Confirm only after your school has recorded the required school/guardian authorization for this pupil.</p><Button disabled={busy} onClick={() => void run(() => classes.approveMember(selected.id, member.studentId, true), "Authorization recorded for this pupil.")}>Confirm school/guardian authorization</Button></>}{member.status === "active" && member.ageBand === "13-17" && <Button disabled={busy} onClick={() => void run(() => classes.approveMember(selected.id, member.studentId, false), "Authorization revoked. Shared evidence deleted; sharing is now blocked.")}>Revoke authorization and erase shared evidence</Button>}</li>)}</ul>
        </Panel>
        <Panel><SectionHeading title="Set a check or a topic" />
          <form className="grid sm:grid-cols-2 gap-3" onSubmit={(event) => { event.preventDefault(); void run(() => classes.setClassAssignment({ classId: selected.id, title: title.trim(), kind, topicId: kind === "topic" ? topicId : null, questionIds: kind === "check" ? [questionId] : [], dueDate }), "Assignment set for this class."); }}>
            <label className="text-sm">Title<input required maxLength={120} className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
            <label className="text-sm">Type<select className={inputClass} value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="topic">Topic</option><option value="check">Question check</option></select></label>
            <label className="text-sm">Topic<select required className={inputClass} value={topicId} onChange={(event) => { setTopicId(event.target.value); setQuestionId(""); }}><option value="">Choose topic…</option>{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select></label>
            {kind === "check" && <label className="text-sm">Question<select required className={inputClass} value={questionId} onChange={(event) => setQuestionId(event.target.value)}><option value="">Choose question…</option>{questionOptions.map((question) => <option key={question.id} value={question.id}>{question.stem.slice(0, 100)}</option>)}</select></label>}
            <label className="text-sm">Due date<input required type="date" className={inputClass} value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
            <div className="self-end"><Button type="submit" disabled={busy}>Set assignment</Button></div>
          </form>
          <ul className="mt-4 text-sm space-y-2">{detail.assignments.map((assignment) => <li key={assignment.id}>{assignment.title} · {assignment.kind} · due {assignment.dueDate}</li>)}</ul>
        </Panel>
        <Panel><SectionHeading title="Class misconception heatmap" hint="Most frequent first. Assigned work only; automated diagnoses and practice marks, not verified attainment." />
          {!heatmap.length ? <p className="text-sm text-ink2">No shared misconception evidence yet. Pupils choose to share assigned-work progress after authorization.</p> : <div className="overflow-x-auto"><table className="w-full text-sm text-left"><caption className="sr-only">Misconceptions from this class’s shared assigned-work attempts</caption><thead><tr><th className="p-2">Misconception</th><th className="p-2">Pupils</th><th className="p-2">Hits</th><th className="p-2">Practice marks lost</th><th className="p-2">Question review</th></tr></thead><tbody>{heatmap.map((row) => <tr key={row.tag} className="border-t border-line"><th scope="row" className="p-2"><span className="block rounded bg-accentsoft p-2" style={{ opacity: 0.65 + 0.35 * row.occurrences / Math.max(1, heatmap[0]?.occurrences ?? 1) }}>{row.label}</span></th><td className="p-2">{row.studentCount}</td><td className="p-2">{row.occurrences}</td><td className="p-2">{row.marksLost}</td><td className="p-2"><div className="flex flex-wrap gap-2">{row.questionIds.map((id, index) => <Link key={id} className="btn btn-secondary text-xs" href={`/reviewer/review/${encodeURIComponent(id)}`}>Review question {index + 1}</Link>)}</div></td></tr>)}</tbody></table></div>}
        </Panel>
      </>}
    </>}
  </div>;
}
