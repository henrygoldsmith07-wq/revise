import { allTopics } from "@/domain/curriculum";
import { physicsContentFingerprint } from "@/domain/content-trust";
import { FLAGSHIP_SUBJECTS } from "@/domain/flagship";
import { hasActualTransfer, hasDataRepresentation, questionGateIssues, type GateContext } from "@/domain/review-gates";
import { reviewStateOf, type ReviewAuditEvent, type ReviewAuditLog, type QuestionReviewState } from "@/domain/review-workflow";
import { isDataAnalysis, topicQuestionClusters } from "@/domain/supply-audit";
import type { Id, Question, Topic } from "@/domain/types";
import { currentContentHistory } from "./runtime-ledger";

// Read-only view models for the reviewer screens, assembled from the same
// domain helpers the offline review pack uses (scripts/generate-review-pack-html.mjs).

export const REVIEW_SUBJECTS = FLAGSHIP_SUBJECTS.map((subject) => ({
  ...subject,
  slug: subject.subjectId.replace(/^wjec-alevel-/, ""),
}));

export function subjectFromSlug(slug: string | undefined) {
  return REVIEW_SUBJECTS.find((subject) => subject.slug === slug) ?? REVIEW_SUBJECTS.find((subject) => subject.slug === "physics")!;
}

let topicCache: { topics: Topic[]; byId: Map<Id, Topic>; gate: GateContext } | null = null;

function topics() {
  if (topicCache) return topicCache;
  const list = allTopics();
  const versions = new Map<Id, Map<string, number>>();
  for (const topic of list) {
    if (!topic.specVersion) continue;
    const counts = versions.get(topic.subjectId) ?? new Map<string, number>();
    counts.set(topic.specVersion, (counts.get(topic.specVersion) ?? 0) + 1);
    versions.set(topic.subjectId, counts);
  }
  topicCache = {
    topics: list,
    byId: new Map(list.map((topic) => [topic.id, topic] as const)),
    gate: {
      topicIds: new Set(list.map((topic) => topic.id)),
      specPointIds: new Set(list.flatMap((topic) => (topic.specPoints ?? []).map((spec) => spec.id))),
      specVersionOf: (subjectId) => [...(versions.get(subjectId) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1])[0]?.[0],
    },
  };
  return topicCache;
}

export function topicTitles(topicIds: readonly Id[]): string {
  const { byId } = topics();
  return topicIds.map((id) => byId.get(id)?.title ?? id).join(" · ");
}

export const shortId = (id: Id) => id.replace(/^cnt:question:/, "");

export interface ReviewScreen {
  question: Question;
  fingerprint: string;
  topicLabel: string;
  specPoints: { id: Id; ref: string; text: string }[];
  parts: { id: Id; label: string; prompt: string; marks: number; markScheme: string[]; modelAnswer: string; specRefs: string[] }[];
  provenance: { label: string; value: string }[];
  gateWarnings: { severity: "block" | "warn"; detail: string }[];
  reskinSiblings: string[];
  transferClaimed: boolean;
  dataClaimed: boolean;
  state: QuestionReviewState;
  history: ReviewAuditEvent[];
}

function flatten(prefix: string, value: unknown, out: { label: string; value: string }[]) {
  if (value === undefined || value === null || value === "") return;
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item !== "object")) out.push({ label: prefix, value: value.join(", ") });
    else value.forEach((item, index) => flatten(`${prefix} ${index + 1}`, item, out));
    return;
  }
  if (typeof value === "object") {
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) flatten(prefix ? `${prefix} · ${key}` : key, inner, out);
    return;
  }
  out.push({ label: prefix, value: String(value) });
}

export function buildReviewScreen(question: Question, bank: readonly Question[], log: ReviewAuditLog): ReviewScreen {
  const { byId, gate } = topics();
  const questionTopics = question.topicIds.map((id) => byId.get(id)).filter((topic): topic is Topic => Boolean(topic));
  const specs = questionTopics.flatMap((topic) => topic.specPoints ?? []);
  const specIds = new Set([...(question.specPointIds ?? []), ...question.parts.flatMap((part) => part.specPointIds ?? [])]);
  const specRef = (id: Id) => {
    const spec = specs.find((entry) => entry.id === id);
    return spec ? `${spec.ref}: ${spec.text}` : id;
  };
  const provenance: { label: string; value: string }[] = [];
  flatten("source", question.source ?? "unknown", provenance);
  flatten("origin", question.origin, provenance);
  flatten("spec version", question.specVersion, provenance);
  flatten("last checked", question.lastChecked, provenance);
  flatten("licensed source", question.licensedSource, provenance);
  flatten("paper", question.paperId && `${question.paperId}${question.paperQuestionNumber ? ` Q${question.paperQuestionNumber}` : ""}`, provenance);
  flatten("paper provenance", question.paperProvenance, provenance);
  flatten("validation stage", question.validation?.stage, provenance);
  const primary = questionTopics[0];
  const cluster = primary ? topicQuestionClusters(primary, bank).find((entry) => entry.ids.includes(question.id)) : undefined;
  return {
    question,
    fingerprint: physicsContentFingerprint(question),
    topicLabel: topicTitles(question.topicIds),
    specPoints: specs.filter((spec) => specIds.has(spec.id)).map((spec) => ({ id: spec.id, ref: spec.ref, text: spec.text })),
    parts: question.parts.map((part) => ({
      id: part.id,
      label: part.label || "Part",
      prompt: part.prompt,
      marks: part.marks,
      markScheme: part.markScheme ?? [],
      modelAnswer: part.modelAnswer ?? "",
      specRefs: (part.specPointIds ?? []).map(specRef),
    })),
    provenance: provenance.slice(0, 24),
    gateWarnings: questionGateIssues(question, gate).map((issue) => ({ severity: issue.severity, detail: issue.detail })),
    reskinSiblings: cluster ? cluster.ids.filter((id) => id !== question.id).map(shortId) : [],
    transferClaimed: hasActualTransfer(question),
    dataClaimed: isDataAnalysis(question) && hasDataRepresentation(question),
    state: reviewStateOf(question, log.events),
    history: currentContentHistory(question, log),
  };
}
