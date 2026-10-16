// The one recommendation Today shows, as a value other screens can read.
//
// Today used to decide inline which of two things leads: the ranked plan's top
// action, or the adaptive session when the plan's top action is that same
// session (or there is none). Schedule's "Today" listed the long-range
// planner's blocks instead and only said that Today "can differ", so a student
// could see Schedule name one topic for today and Today another. Both screens
// now read this, so they name the same next step. Pure: no store, no clock.

import type { AdaptiveSessionPlan } from "./adaptive-contract";
import type { Id } from "./types";
import type { RevisionAction } from "./revision-engine";

export type TodayPick = {
  /** Which Today hero renders it: BestNextStep or AdaptiveSessionHero. */
  source: "plan" | "adaptive";
  /** The same headline Today shows. */
  title: string;
  subjectId: Id;
  topicIds: Id[];
  /** Today's Start button target, unchanged. */
  href: string;
  minutes: number;
};

export function todayPick(top: RevisionAction | null, adaptive: AdaptiveSessionPlan | null): TodayPick | null {
  if (top && (!adaptive || top.route.href !== adaptive.startHref)) {
    return { source: "plan", title: top.title, subjectId: top.subjectId, topicIds: top.topicIds, href: top.route.href, minutes: top.minutes };
  }
  if (adaptive) {
    return {
      source: "adaptive",
      title: "Your next session is ready",
      subjectId: adaptive.subjectId,
      topicIds: [adaptive.topicId],
      href: adaptive.startHref,
      minutes: adaptive.totalMinutes,
    };
  }
  return null;
}
