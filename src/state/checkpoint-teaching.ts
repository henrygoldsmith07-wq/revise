"use client";

// Authored teaching (src/content/teaching), loaded on demand.
//
// The teaching for all taught specification points is ~200 KB of text. The
// practice screens only need it when a question's point is taught and help
// may be shown, so it stays out of their bundle: this module knows which
// points are taught from the small id list and imports the content the first
// time one is asked for. If the chunk cannot load (offline, never cached)
// callers simply get null and fall back to what the question itself carries.

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { TAUGHT_SPEC_POINT_IDS } from "@/content/teaching/taught-spec-points";
import type { CheckpointTeaching, TeachingBySpecPoint } from "@/content/teaching/types";
import { getTopic } from "@/domain/curriculum";
import { chooseTeachingPoint, type TeachingChoice } from "@/domain/hints";
import type { Question } from "@/domain/types";

const TAUGHT = new Set<string>(TAUGHT_SPEC_POINT_IDS);

let loaded: TeachingBySpecPoint | null = null;
let request: Promise<void> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function requestTeaching(): void {
  if (loaded || request) return;
  request = import("@/content/teaching")
    .then((module) => {
      loaded = module.TEACHING;
    })
    .catch(() => {
      // Left unloaded; the next question that asks tries again.
      request = null;
    })
    .finally(() => {
      for (const listener of listeners) listener();
    });
}

/** True when any specification point of the question's topics has teaching written for it. */
function topicsAreTaught(question: Pick<Question, "topicIds">): boolean {
  return question.topicIds.some((topicId) => (getTopic(topicId)?.specPoints ?? []).some((point) => TAUGHT.has(point.id)));
}

/**
 * The teaching that bears on a question (chooseTeachingPoint), or null while
 * it loads, when its topics have none, or when `enabled` is false (pass
 * false to skip the load entirely, e.g. on an unaided question that offers
 * no help). `parts` narrows the choice to those parts, e.g. the ones that
 * lost marks; pass a stable array.
 */
export function useQuestionTeaching(
  question: Question,
  enabled: boolean,
  parts?: readonly Question["parts"][number][],
): TeachingChoice<CheckpointTeaching> | null {
  const wanted = enabled && topicsAreTaught(question);
  const all = useSyncExternalStore(subscribe, () => loaded, () => null);
  useEffect(() => {
    if (wanted) requestTeaching();
  }, [wanted]);
  return useMemo(
    () => (wanted && all ? chooseTeachingPoint(question, getTopic, (id) => all[id], parts) : null),
    [wanted, all, question, parts],
  );
}
