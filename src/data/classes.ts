import type { SupabaseClient } from "@supabase/supabase-js";
import type { Classroom, ClassMembership, ClassAssignment, ClassEvidence } from "@/domain/classes";
import { getSupabase } from "./supabase";

export type { Classroom, ClassMembership, ClassAssignment, ClassEvidence } from "@/domain/classes";

// Shared class records are online collaboration, NOT the learner history replica.
// Never persist join codes/rosters in a demo workspace or silently fall back to it.
async function caller(): Promise<{ client: SupabaseClient; userId: string }> {
  const client = getSupabase();
  if (!client) throw new Error("Live classes need a configured connection.");
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Sign in to use live classes.");
  return { client, userId: data.user.id };
}

async function stillCaller(client: SupabaseClient, userId: string): Promise<void> {
  const { data, error } = await client.auth.getUser();
  if (error || data.user?.id !== userId) throw new Error("Account changed. Reload classes before continuing.");
}

type ClassRow = { id: string; name: string; join_code: string; user_id: string };
type MemberRow = { class_id: string; user_id: string; alias: string; age_band: "13-17" | "18+"; status: "pending" | "active"; consented_at: string; authorized_at?: string | null; class_name?: string };
type AssignmentRow = { id: string; class_id: string; title: string; kind: "check" | "topic"; question_ids: string[]; topic_id: string | null; due_date: string };
type EvidenceRow = { attempt_id: string; user_id: string; question_id: string; topic_id: string; awarded: number | string; max: number | string; misconception: string | null; attempted_at: string };

function classroom(row: ClassRow): Classroom {
  return { id: row.id, name: row.name, joinCode: row.join_code, teacherId: row.user_id };
}
function membership(row: MemberRow): ClassMembership {
  return { classId: row.class_id, studentId: row.user_id, alias: row.alias, ageBand: row.age_band, status: row.status, consentedAt: row.consented_at,
    ...(row.authorized_at !== undefined ? { authorizedAt: row.authorized_at } : {}),
    ...(row.class_name ? { className: row.class_name } : {}) };
}
function assignment(row: AssignmentRow): ClassAssignment {
  return { id: row.id, classId: row.class_id, title: row.title, kind: row.kind, questionIds: row.question_ids, topicId: row.topic_id, dueDate: row.due_date };
}
function evidence(row: EvidenceRow): ClassEvidence {
  return { attemptId: row.attempt_id, studentId: row.user_id, questionId: row.question_id, topicId: row.topic_id,
    awarded: Number(row.awarded), max: Number(row.max), attemptedAt: row.attempted_at,
    ...(row.misconception ? { misconception: row.misconception } : {}) };
}

const MEMBER_COLUMNS = "class_id,user_id,alias,age_band,status,consented_at,authorized_at";
const ASSIGNMENT_COLUMNS = "id,class_id,title,kind,question_ids,topic_id,due_date";
const EVIDENCE_COLUMNS = "attempt_id,user_id,question_id,topic_id,awarded,max,misconception,attempted_at";

/** Supabase's default row cap must not silently become an analytics denominator. */
async function allClassRows<T>(client: SupabaseClient, userId: string, page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  const size = 500;
  for (let from = 0; ; from += size) {
    const result = await page(from, from + size - 1);
    if (result.error || !result.data) throw new Error("Class details could not be loaded.");
    await stillCaller(client, userId);
    rows.push(...result.data);
    if (result.data.length < size) return rows;
  }
}

export async function listClasses(): Promise<Classroom[]> {
  const { client, userId } = await caller();
  const result = await client.from("teacher_classes").select("id,name,join_code,user_id").eq("user_id", userId).order("created_at");
  if (result.error) throw new Error("Classes could not be loaded.");
  await stillCaller(client, userId);
  return (result.data as ClassRow[]).map(classroom);
}

export async function createClass(name: string): Promise<Classroom> {
  const { client, userId } = await caller();
  const result = await client.rpc("create_teacher_class", { p_name: name.trim() });
  if (result.error || !result.data?.[0]) throw new Error("Class could not be created. An active teacher grant and a name are required.");
  await stillCaller(client, userId);
  return classroom((result.data as ClassRow[])[0]!);
}

export async function listMemberships(): Promise<ClassMembership[]> {
  const { client, userId } = await caller();
  const result = await client.rpc("list_my_class_memberships");
  if (result.error) throw new Error("Your memberships could not be loaded.");
  await stillCaller(client, userId);
  return (result.data as MemberRow[]).map(membership);
}

export async function joinClass(code: string, alias: string, ageBand: "13-17" | "18+", consent: boolean): Promise<void> {
  const { client, userId } = await caller();
  const result = await client.rpc("join_teacher_class", { p_code: code.trim().toLowerCase(), p_alias: alias.trim(), p_age_band: ageBand, p_consent: consent });
  if (result.error || result.data !== true) throw new Error("Unable to join. Check the code, alias, age band and sharing consent, or wait 15 minutes after repeated tries.");
  await stillCaller(client, userId);
}

export async function leaveClass(classId: string): Promise<void> {
  const { client, userId } = await caller();
  const result = await client.rpc("leave_teacher_class", { p_class_id: classId });
  if (result.error) throw new Error("Sharing could not be revoked. Try leaving the class again when connected.");
  await stillCaller(client, userId);
}

export async function loadClass(classId: string): Promise<{ members: ClassMembership[]; assignments: ClassAssignment[]; evidence: ClassEvidence[] }> {
  const { client, userId } = await caller();
  const [members, assignments, shared] = await Promise.all([
    allClassRows<MemberRow>(client, userId, (from, to) => client.from("class_memberships").select(MEMBER_COLUMNS).eq("class_id", classId).order("user_id").range(from, to)),
    allClassRows<AssignmentRow>(client, userId, (from, to) => client.from("class_assignments").select(ASSIGNMENT_COLUMNS).eq("class_id", classId).order("id").range(from, to)),
    allClassRows<EvidenceRow>(client, userId, (from, to) => client.from("class_evidence").select(EVIDENCE_COLUMNS).eq("class_id", classId).order("user_id").order("attempt_id").range(from, to)),
  ]);
  await stillCaller(client, userId);
  return { members: members.map(membership), assignments: assignments.map(assignment), evidence: shared.map(evidence) };
}

/** Teacher records that school/guardian authorization has been obtained for this pupil. */
export async function approveMember(classId: string, studentId: string, authorized: boolean): Promise<void> {
  const { client, userId } = await caller();
  const result = await client.rpc("authorize_class_member", { p_class_id: classId, p_student_id: studentId, p_authorized: authorized });
  if (result.error) throw new Error("Pupil authorization could not be recorded.");
  await stillCaller(client, userId);
}

export async function setClassAssignment(input: { classId: string; title: string; kind: "check" | "topic"; questionIds: string[]; topicId: string | null; dueDate: string }): Promise<void> {
  const { client, userId } = await caller();
  const result = await client.rpc("set_class_assignment", { p_class_id: input.classId, p_title: input.title.trim(), p_kind: input.kind,
    p_question_ids: input.questionIds, p_topic_id: input.topicId, p_due_date: input.dueDate });
  if (result.error) throw new Error("Assignment could not be published. Check its title, content and due date.");
  await stillCaller(client, userId);
}

export async function listStudentAssignments(): Promise<ClassAssignment[]> {
  const { client, userId } = await caller();
  // Explicit membership ids ensure a teacher account does not receive their own
  // classes through this learner API; RLS independently enforces active status.
  const memberships = await client.from("class_memberships").select("class_id").eq("user_id", userId).eq("status", "active");
  if (memberships.error) throw new Error("Your assignments could not be loaded.");
  const ids = (memberships.data as { class_id: string }[]).map((m) => m.class_id);
  if (!ids.length) { await stillCaller(client, userId); return []; }
  const result = await client.from("class_assignments").select(ASSIGNMENT_COLUMNS).in("class_id", ids).order("due_date");
  if (result.error) throw new Error("Your assignments could not be loaded.");
  await stillCaller(client, userId);
  return (result.data as AssignmentRow[]).map(assignment);
}

export async function shareClassEvidence(classId: string, snapshots: ClassEvidence[]): Promise<void> {
  const { client, userId } = await caller();
  if (snapshots.some((item) => item.studentId !== userId)) throw new Error("Only your own attempt metadata can be shared.");
  // Reconstruct the closed shape. Never spread an Attempt: it contains answers,
  // feedback and other fields that must not reach the teacher-class store.
  const payload = snapshots.map((item) => ({ attemptId: item.attemptId, studentId: userId, questionId: item.questionId, topicId: item.topicId,
    awarded: item.awarded, max: item.max, attemptedAt: item.attemptedAt,
    ...(item.misconception ? { misconception: item.misconception } : {}) }));
  // SQL bounds each transaction to 100 rows. Each batch is an idempotent
  // upsert; a retry after partial success cannot double-count the heatmap.
  for (let start = 0; start < payload.length; start += 100) {
    const result = await client.rpc("share_class_evidence", { p_class_id: classId, p_evidence: payload.slice(start, start + 100) });
    if (result.error) throw new Error(start
      ? "Some assigned progress may already be shared. Retry safely to finish; duplicates will not be counted twice."
      : "Evidence was not shared. An active, authorized membership and post-consent metadata are required.");
    // Stop before another batch if the signed-in account changed.
    await stillCaller(client, userId);
  }
}
