// Derived selectors — pure domain code, no React, no I/O.
//
// Principle: derived values are recomputed from the snapshot rather than
// duplicated as mutable state. These helpers make the derivation explicit and
// testable without mounting the store.
//
// For React consumers, `useSubjects()` remains exported from `./store` (which
// composes these pure helpers with useMemo).

import { allSubjects } from "@/domain/curriculum";
import type { Id, UserSettings } from "@/domain/types";

/** Subjects the student is taking, in curriculum order (pure). */
export function subjectsForSettings(settings: Pick<UserSettings, "subjectIds">) {
  return allSubjects().filter((s) => settings.subjectIds.includes(s.id));
}

/** True when the snapshot has at least one enrolled subject. */
export function hasEnrolledSubjects(subjectIds: readonly Id[]): boolean {
  return subjectIds.length > 0;
}
