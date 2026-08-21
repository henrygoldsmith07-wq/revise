import type { ActivityKind, Id, Recommendation } from "@/domain/types";

/** Where an activity actually happens. One place, so nav never drifts. */
export function activityHref(activity: ActivityKind, subjectId?: Id, topicId?: Id, sessionId?: Id): string {
  const params = new URLSearchParams();
  if (subjectId) params.set("subject", subjectId);
  if (topicId) params.set("topic", topicId);
  if (sessionId) params.set("session", sessionId);
  const qs = params.toString() ? `?${params}` : "";

  switch (activity) {
    case "flashcards":
      return `/review${qs}`;
    case "mistakes":
      return `/review${qs}${qs ? "&" : "?"}mode=mistakes`;
    case "practice":
    case "recall":
      return `/practice${qs}${qs ? "&" : "?"}mode=${activity}`;
    case "paper":
      return `/papers${qs}`;
    case "learn":
      return `/library${qs}`;
  }
}

export function recommendationHref(recommendation: Recommendation): string {
  return activityHref(
    recommendation.activity,
    recommendation.subjectId,
    recommendation.topicId,
    recommendation.plannedSessionId,
  );
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function relativeDay(date: string, today: string): string {
  const days = Math.round(
    (new Date(`${date}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000,
  );
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days < 0) return `${-days} days ago`;
  return `in ${days} days`;
}
