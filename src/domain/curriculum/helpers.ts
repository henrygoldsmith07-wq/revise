import type { AoCode, ContentSource, Id, LicensedSource, SpecPoint, Topic, Unit, VerificationStatus } from "../types";

export interface TopicSpec {
  slug: string;
  title: string;
  specRef?: string;
  specVersion?: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  summary: string;
  keyPoints: string[];
  commonErrors: string[];
  specPoints?: Array<SpecPoint | (Omit<SpecPoint, "id"> & { id?: string })>;
  aos?: AoCode[];
  source?: ContentSource;
  licensedSource?: LicensedSource | null;
  verification?: VerificationStatus;
  reviewer?: string | null;
  lastChecked?: string | null;
}

export interface UnitSpec {
  slug: string;
  title: string;
  topics: TopicSpec[];
}

/** Expand authored unit specs into the flat Unit/Topic records the app uses. */
export function buildUnits(subjectId: Id, specs: UnitSpec[]): { units: Unit[]; topics: Topic[] } {
  const units: Unit[] = [];
  const topics: Topic[] = [];
  let order = 0;

  specs.forEach((unitSpec, unitIndex) => {
    const unitId = `${subjectId}.${unitSpec.slug}`;
    units.push({ id: unitId, subjectId, title: unitSpec.title, order: unitIndex });
    for (const topicSpec of unitSpec.topics) {
      const topicId = `${subjectId}.${topicSpec.slug}`;
      const specPoints: SpecPoint[] | undefined = topicSpec.specPoints?.map((sp, i) => ({
        // stable id when author omits it: topicId + index
        id: (sp as SpecPoint).id ?? `${topicId}.sp-${String(i + 1).padStart(2, "0")}`,
        ref: sp.ref,
        text: sp.text,
        aos: sp.aos,
        source: (sp as SpecPoint).source ?? topicSpec.source ?? "authored",
        licensedSource: (sp as SpecPoint).licensedSource ?? topicSpec.licensedSource ?? null,
        verification: (sp as SpecPoint).verification ?? topicSpec.verification ?? "unverified",
        reviewer: (sp as SpecPoint).reviewer ?? (topicSpec as unknown as { reviewer?: string }).reviewer ?? null,
        lastChecked: (sp as SpecPoint).lastChecked ?? topicSpec.lastChecked ?? null,
        specVersion: (sp as SpecPoint).specVersion ?? topicSpec.specVersion,
      }));
      topics.push({
        id: topicId,
        subjectId,
        unitId,
        title: topicSpec.title,
        order: order++,
        specRef: topicSpec.specRef,
        specVersion: topicSpec.specVersion,
        intrinsicDifficulty: topicSpec.difficulty,
        summary: topicSpec.summary,
        keyPoints: topicSpec.keyPoints,
        commonErrors: topicSpec.commonErrors,
        specPoints,
        aos: topicSpec.aos,
        source: topicSpec.source ?? "authored",
        licensedSource: topicSpec.licensedSource ?? null,
        verification: topicSpec.verification ?? "unverified",
        reviewer: (topicSpec as unknown as { reviewer?: string }).reviewer ?? null,
        lastChecked: topicSpec.lastChecked ?? null,
      });
    }
  });

  return { units, topics };
}

/** A-level style boundaries — approximate, and labelled as such in the UI. */
export const A_LEVEL_BOUNDARIES = [
  { grade: "A*", percent: 80 },
  { grade: "A", percent: 70 },
  { grade: "B", percent: 60 },
  { grade: "C", percent: 50 },
  { grade: "D", percent: 40 },
  { grade: "E", percent: 30 },
  { grade: "U", percent: 0 },
];

export const GCSE_BOUNDARIES = [
  { grade: "9", percent: 85 },
  { grade: "8", percent: 75 },
  { grade: "7", percent: 65 },
  { grade: "6", percent: 55 },
  { grade: "5", percent: 45 },
  { grade: "4", percent: 35 },
  { grade: "3", percent: 25 },
  { grade: "2", percent: 15 },
  { grade: "1", percent: 5 },
  { grade: "U", percent: 0 },
];
