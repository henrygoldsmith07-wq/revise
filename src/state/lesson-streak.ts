// Lesson progress helpers — pure, persisted via repository.saveLessonProgress.
//
// What is persisted: LessonProgress.completed + streak (synced row).
// What is derived: streak roll from local day keys (never stored as logic).
// Migration: one-time import from legacy localStorage keys.

export interface LessonStreak {
  count: number;
  lastDay: string;
}

/**
 * One-time migration: before lesson progress moved into the synced store it
 * lived in localStorage (revise.lessons.*). Returns the legacy values when
 * they exist, so existing students keep their progress across the switch.
 */
export function legacyLessonProgress(): {
  completed: Record<string, boolean>;
  streak: LessonStreak;
} | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const completedRaw = localStorage.getItem("revise.lessons.completed");
    if (!completedRaw) return null;
    const completed = JSON.parse(completedRaw) as Record<string, boolean>;
    const streakRaw = localStorage.getItem("revise.lessons.streak");
    const streak = streakRaw ? (JSON.parse(streakRaw) as LessonStreak) : { count: 0, lastDay: "" };
    return Object.keys(completed).length ? { completed, streak } : null;
  } catch {
    return null;
  }
}

/** Local-time YYYY-MM-DD for lesson streaks (a day flips at midnight, not UTC). */
export function localDayKey(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Pure streak roll. Several lessons finished the same day count as one streak
 * day; a lesson on the day after the last one extends the streak; any longer
 * gap restarts it.
 */
export function nextLessonStreak(
  current: LessonStreak,
  today: string,
  yesterday: string,
): LessonStreak {
  if (current.lastDay === today) return current;
  if (current.lastDay === yesterday) return { count: current.count + 1, lastDay: today };
  return { count: 1, lastDay: today };
}
