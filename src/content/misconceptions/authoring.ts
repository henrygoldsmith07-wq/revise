import type {
  AoCode,
  ContentSource,
  Id,
  IsoDate,
  Misconception,
  MisconceptionTag,
  VerificationStatus,
} from "@/domain/types";

// Compact authoring format for the misconception library. Ids are deterministic
// (`seed-misconception:<slug>`) so re-seeding never duplicates an entry.

export interface MisconceptionSpec {
  slug: string;
  subjectId: Id;
  /** Topic slugs within the subject; ids are derived as `<subjectId>.<slug>`. */
  topics: string[];
  statement: string;
  explanation: string;
  example: string;
  correction: string;
  tag?: MisconceptionTag;
  ao?: AoCode;
  source?: ContentSource;
  verification?: VerificationStatus;
  lastChecked?: IsoDate | null;
}

const LAST_CHECKED = "2026-08-01";

export function defineMisconception(spec: MisconceptionSpec): Misconception {
  return {
    id: `seed-misconception:${spec.slug}`,
    subjectId: spec.subjectId,
    topicIds: spec.topics.map((t) => `${spec.subjectId}.${t}`),
    statement: spec.statement,
    explanation: spec.explanation,
    example: spec.example,
    correction: spec.correction,
    ...(spec.tag ? { tag: spec.tag } : {}),
    ...(spec.ao ? { ao: spec.ao } : {}),
    source: spec.source ?? "authored",
    licensedSource: null,
    verification: spec.verification ?? "checked",
    reviewer: null,
    lastChecked: spec.lastChecked ?? LAST_CHECKED,
  };
}

export function defineMisconceptions(specs: MisconceptionSpec[]): Misconception[] {
  return specs.map(defineMisconception);
}
