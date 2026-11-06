"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ensureSubjects, getSubject, isSubjectLoaded } from "@/domain/curriculum";

/**
 * Subjects a URL names: `?subject=` and the subject part of `?topic=`
 * (`<subject>.<slug>`). Unknown ids are dropped.
 */
export function subjectsInParams(params: Pick<URLSearchParams, "get">): string[] {
  const named = [params.get("subject"), params.get("topic")?.split(".")[0] ?? null];
  return [...new Set(named.filter((id): id is string => Boolean(id && getSubject(id))))];
}

/**
 * A reference subject's topic tree loads on demand (src/domain/curriculum).
 * The learner's own subjects load at boot; a page opened for another one (a
 * shared /library?subject= link, a public twin's link) holds its render here
 * until that subject has loaded, so every topic list on the page is computed
 * from the full tree on its first render rather than from an empty one. If
 * the load fails (offline before the chunk was cached), the page renders
 * anyway and shows what it can.
 */
export function CurriculumGate({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const wanted = useMemo(() => subjectsInParams(params), [params]);
  const key = wanted.join(",");
  const [settled, setSettled] = useState<string | null>(null);
  const loaded = wanted.every(isSubjectLoaded);

  useEffect(() => {
    if (loaded) return;
    let live = true;
    void ensureSubjects(wanted)
      .catch((error: unknown) => console.warn("[curriculum] could not load", key, error))
      .finally(() => { if (live) setSettled(key); });
    return () => { live = false; };
  }, [key, loaded, wanted]);

  return loaded || settled === key ? children : null;
}
