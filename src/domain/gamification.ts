import type { Achievement, GamificationStats, IsoDate, StreakState } from "./types";

// ---------------------------------------------------------------------------
// Gamification here rewards the behaviour that actually raises grades —
// showing up daily, clearing due cards, repairing mistakes — and never
// rewards volume for its own sake. No leaderboards, no loss-aversion streak
// panic: the streak has a one-day grace so a single missed evening does not
// wipe a month's work and push a student into quitting.
// ---------------------------------------------------------------------------

export const XP = {
  review: 2,
  correctReview: 3,
  attemptMark: 4,
  paperCompleted: 60,
  mistakeResolved: 12,
  sessionCompleted: 15,
} as const;

export function levelFor(xp: number): { level: number; into: number; needed: number } {
  // Each level costs 15% more than the last, so early progress is fast and
  // later levels stay meaningful without ever becoming unreachable.
  let level = 1;
  let remaining = xp;
  let cost = 150;
  while (remaining >= cost) {
    remaining -= cost;
    level++;
    cost = Math.round(cost * 1.15);
  }
  return { level, into: remaining, needed: cost };
}

function dayDelta(a: IsoDate, b: IsoDate): number {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

/** Advance the streak for activity on `today`. Idempotent within a day. */
export function touchStreak(state: StreakState, today: IsoDate): StreakState {
  if (state.lastActiveDate === today) return state;
  const gap = state.lastActiveDate ? dayDelta(state.lastActiveDate, today) : Infinity;
  // gap === 2 is the grace day: the streak holds but does not increment.
  const current = gap === 1 ? state.current + 1 : gap === 2 ? state.current : 1;
  return {
    ...state,
    current,
    longest: Math.max(state.longest, current),
    lastActiveDate: today,
  };
}

export function addXp(state: StreakState, amount: number): StreakState {
  return { ...state, xp: Math.max(0, state.xp + amount) };
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-review", name: "First recall", description: "Review your first card.", test: (s) => s.reviews >= 1 },
  { id: "hundred-reviews", name: "Century", description: "100 cards reviewed.", test: (s) => s.reviews >= 100 },
  { id: "thousand-reviews", name: "Thousand", description: "1,000 cards reviewed.", test: (s) => s.reviews >= 1000 },
  { id: "week-streak", name: "Seven days", description: "A seven-day revision streak.", test: (s) => s.streak >= 7 },
  { id: "month-streak", name: "Thirty days", description: "A thirty-day revision streak.", test: (s) => s.streak >= 30 },
  { id: "first-paper", name: "Under exam conditions", description: "Complete a full past paper.", test: (s) => s.papers >= 1 },
  { id: "five-papers", name: "Paper five", description: "Complete five past papers.", test: (s) => s.papers >= 5 },
  { id: "hundred-marks", name: "Marks banked", description: "Earn 100 marks in practice.", test: (s) => s.marksEarned >= 100 },
  { id: "ten-mastered", name: "Ten secure", description: "Take ten topics to mastery.", test: (s) => s.masteredTopics >= 10 },
  { id: "flawless", name: "Flawless", description: "Finish a session with no lapses.", test: (s) => s.perfectSessions >= 1 },
];

export function unlockedAchievements(stats: GamificationStats): string[] {
  return ACHIEVEMENTS.filter((a) => a.test(stats)).map((a) => a.id);
}

export function newlyUnlocked(previous: string[], stats: GamificationStats): Achievement[] {
  const have = new Set(previous);
  return ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.test(stats));
}
