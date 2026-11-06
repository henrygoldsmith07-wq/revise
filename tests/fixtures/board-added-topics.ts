import { allSubjects, topicsFor } from "@/domain/curriculum";
import { BIOLOGY_EXTRA_TOPICS } from "@/domain/curriculum/outlines/biology-extra";
import { CHEMISTRY_EXTRA_TOPICS } from "@/domain/curriculum/outlines/chemistry-extra";
import { PHYSICS_EXTRA_TOPICS } from "@/domain/curriculum/outlines/physics-extra";

// Topics a board structure adds to a reference subject for sections the shared
// outline never covered (src/domain/curriculum/board-outline.ts). The shared
// question templates (data, unfamiliar-context, source, authentic expansion)
// are written per shared outline topic; board-added topics get their own
// authored questions instead (tests/board-structure.test.ts requires them).
const EXTRA_SLUGS = new Set([...BIOLOGY_EXTRA_TOPICS, ...CHEMISTRY_EXTRA_TOPICS, ...PHYSICS_EXTRA_TOPICS].map((topic) => topic.slug));

export const BOARD_ADDED_TOPICS: ReadonlySet<string> = new Set(
  allSubjects()
    .filter((subject) => !subject.id.startsWith("wjec-"))
    .flatMap((subject) => topicsFor(subject.id))
    .filter((topic) => EXTRA_SLUGS.has(topic.id.slice(topic.subjectId.length + 1)))
    .map((topic) => topic.id),
);
