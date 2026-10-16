// Persisted Sunday-plan evidence only. Keep independent of behavior modules so
// importing UserSettings never expands the domain's type-check dependency graph.
export interface SundayPlanSnapshot {
  version: 1;
  weekStart: string;
  nextSunday: string;
  capturedAt: string;
  timeZone: string;
  lastWeek: {
    from: string;
    through: string;
    attempts: number;
    reviews: number;
    topics: number;
    previousAttempts: number;
    previousReviews: number;
  };
  latestActivityAt: string | null;
  freshness: "no-data" | "old" | "recent";
  dueReviews: number;
  nearestExam: { date: string; label: string; subjectId: string; days: number } | null;
  actions: Array<{ label: string; href: string; reason: string }>;
}
