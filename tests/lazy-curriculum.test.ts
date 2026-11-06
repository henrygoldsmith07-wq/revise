import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Reference subjects' topic trees load on demand (src/domain/curriculum).
// tests/setup-curriculum.ts preloads everything for the rest of the suite, so
// these tests import a fresh module graph with vi.resetModules() and exercise
// the on-demand path itself.

type Curriculum = typeof import("@/domain/curriculum");

async function freshCurriculum(): Promise<Curriculum> {
  vi.resetModules();
  return import("@/domain/curriculum");
}

const REFERENCE = "aqa-alevel-biology";
const OTHER_REFERENCE = "ocr-alevel-chemistry";
const FLAGSHIP = "wjec-alevel-physics";

describe("reference subjects load on demand", () => {
  it("registers every subject's metadata up front, but only the flagships' topics", async () => {
    const curriculum = await freshCurriculum();
    expect(curriculum.allSubjects().length).toBe(35);
    expect(curriculum.getSubject(REFERENCE)?.name).toBe("Biology");
    expect(curriculum.getSubject(REFERENCE)?.papers.length).toBeGreaterThan(0);
    expect(curriculum.isSubjectLoaded(REFERENCE)).toBe(false);
    expect(curriculum.topicsFor(REFERENCE)).toEqual([]);
    expect(curriculum.isSubjectLoaded(FLAGSHIP)).toBe(true);
    expect(curriculum.topicsFor(FLAGSHIP).length).toBeGreaterThan(10);
  });

  it("loads exactly the subjects asked for, once, however many callers ask", async () => {
    const curriculum = await freshCurriculum();
    const before = curriculum.getSubject(REFERENCE);
    let notified = 0;
    const stop = curriculum.onSubjectsLoaded(() => { notified += 1; });
    await Promise.all([curriculum.ensureSubjects([REFERENCE]), curriculum.ensureSubjects([REFERENCE, REFERENCE])]);
    stop();
    expect(notified).toBe(1);
    expect(curriculum.isSubjectLoaded(REFERENCE)).toBe(true);
    expect(curriculum.topicsFor(REFERENCE).length).toBeGreaterThan(5);
    expect(curriculum.isSubjectLoaded(OTHER_REFERENCE)).toBe(false);
    // The catalogue stub and the loaded module describe the same subject.
    expect(curriculum.getSubject(REFERENCE)).toEqual(before);
  });

  it("loads everything for code that works across all subjects", async () => {
    const curriculum = await freshCurriculum();
    await curriculum.loadAllSubjects();
    expect(curriculum.allSubjects().every((subject) => curriculum.isSubjectLoaded(subject.id))).toBe(true);
    expect(curriculum.allSubjects().every((subject) => curriculum.topicsFor(subject.id).length > 0)).toBe(true);
  });
});

describe("the learner's subjects load at boot and when they enrol", () => {
  beforeEach(async () => {
    vi.resetModules();
    const { clearAll } = await import("@/data/db");
    await clearAll();
  });

  it("loads the enrolled reference subject before seeding, and only that one", async () => {
    const curriculum = await import("@/domain/curriculum");
    const repo = await import("@/data/repository");
    await repo.saveSettings({ ...repo.defaultSettings("u"), subjectIds: [REFERENCE] });
    const seeded = await repo.ensureSeeded("u");
    expect(curriculum.isSubjectLoaded(REFERENCE)).toBe(true);
    expect(curriculum.isSubjectLoaded(OTHER_REFERENCE)).toBe(false);
    expect(seeded.some((card) => card.subjectId === REFERENCE)).toBe(true);
    expect(seeded.some((card) => card.subjectId === OTHER_REFERENCE)).toBe(false);
  });

  it("installs a newly enrolled subject's cards, keeping any the device already holds", async () => {
    const curriculum = await import("@/domain/curriculum");
    const repo = await import("@/data/repository");
    const first = await repo.installSubjects("u", [OTHER_REFERENCE]);
    expect(curriculum.isSubjectLoaded(OTHER_REFERENCE)).toBe(true);
    expect(first.length).toBeGreaterThan(5);
    expect(first.every((card) => card.subjectId === OTHER_REFERENCE)).toBe(true);
    const studied = { ...first[0]!, reps: 3, stability: 9 };
    await repo.saveCard(studied);
    const again = await repo.installSubjects("u", [OTHER_REFERENCE]);
    expect(again.find((card) => card.id === studied.id)).toMatchObject({ reps: 3, stability: 9 });
  });
});

describe("pages opened for another subject", () => {
  it("names the subject from ?subject= and from a topic id, ignoring unknown ids", async () => {
    const { subjectsInParams } = await import("@/components/CurriculumGate");
    expect(subjectsInParams(new URLSearchParams(`subject=${REFERENCE}`))).toEqual([REFERENCE]);
    expect(subjectsInParams(new URLSearchParams(`topic=${OTHER_REFERENCE}.kinetics`))).toEqual([OTHER_REFERENCE]);
    expect(subjectsInParams(new URLSearchParams(`subject=${REFERENCE}&topic=${REFERENCE}.enzymes`))).toEqual([REFERENCE]);
    expect(subjectsInParams(new URLSearchParams("subject=not-a-subject&topic=nope.x"))).toEqual([]);
  });
});
