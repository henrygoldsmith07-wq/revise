import type { TeacherWorkspace } from "@/domain/teacher";

export const TEACHER_WORKSPACE_KEY = "revise.teacher-p2.workspace";

/** Local-only persistence until a roster connector is available. */
export function loadTeacherWorkspace(fallback: TeacherWorkspace): TeacherWorkspace {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(TEACHER_WORKSPACE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<TeacherWorkspace>;
    if (!Array.isArray(parsed.assignments) || !Array.isArray(parsed.interventions) || !Array.isArray(parsed.moderationEntries) || !Array.isArray(parsed.markReviews) || !Array.isArray(parsed.authoredQuestions)) {
      return fallback;
    }
    return parsed as TeacherWorkspace;
  } catch {
    return fallback;
  }
}

export function saveTeacherWorkspace(workspace: TeacherWorkspace): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TEACHER_WORKSPACE_KEY, JSON.stringify(workspace));
  } catch {
    // Private browsing or storage quotas should not interrupt the teacher flow.
  }
}
