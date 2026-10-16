import type { PlannedSession } from "./types";

/** An explicit enrolled subject wins; topic-only links beat a remembered subject.
 * The caller supplies topic identity, so this small contract never loads the bank. */
export function resolveLessonSubject(input: {
  enrolledSubjectIds: readonly string[];
  requestedSubject?: string | null;
  topicSubject?: string | null;
  rememberedSubject?: string | null;
}): string {
  return [input.requestedSubject, input.topicSubject, input.rememberedSubject, ...input.enrolledSubjectIds]
    .find((id): id is string => Boolean(id && input.enrolledSubjectIds.includes(id))) ?? "";
}

/** Adaptive return links are navigation, not an arbitrary URL capability. */
export function adaptiveReturnHref(value: string | null): string | null {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const url = new URL(value, "https://revise.invalid");
    if (url.origin !== "https://revise.invalid" || url.pathname !== "/adaptive-session") return null;
    const query = new URLSearchParams();
    for (const key of ["topic", "start", "resume"]) {
      const item = url.searchParams.get(key);
      if (item) query.set(key, item);
    }
    return url.pathname + (query.size ? `?${query}` : "");
  } catch { return null; }
}

/** Only running routes that actually finish a planned block carry its session ID. */
export function plannedSessionHref(session: PlannedSession): string {
  const routes = { learn: "/lesson", flashcards: "/review", recall: "/practice", practice: "/practice", paper: "/papers", mistakes: "/review" } as const;
  const query = new URLSearchParams({ subject: session.subjectId });
  if (session.topicId && session.activity !== "paper") query.set("topic", session.topicId);
  if (session.activity === "recall") query.set("mode", "recall");
  if (session.activity === "mistakes") query.set("mode", "mistakes");
  if (["flashcards", "recall", "practice"].includes(session.activity)) query.set("session", session.id);
  return `${routes[session.activity]}?${query}`;
}
