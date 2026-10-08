"use client";

// A concise "About this question" disclosure: specification match, whether a
// person has checked it, where it came from and when it was last reviewed.
// Closed by default so it never competes with answering; the values come from
// buildTrustIndicator, which reuses the repo's own trust predicates.

import { useMemo } from "react";
import { getSubject, getTopic } from "@/domain/curriculum";
import { buildTrustIndicator } from "@/domain/trust-indicator";
import type { Question, Topic } from "@/domain/types";
import { Pill } from "./ui";

export function TrustDetails({ question }: { question: Question }) {
  const trust = useMemo(() => {
    const topics = question.topicIds.map((id) => getTopic(id)).filter((t): t is Topic => Boolean(t));
    return buildTrustIndicator({ question, subject: getSubject(question.subjectId) ?? null, topics });
  }, [question]);
  return (
    <details className="mb-3 text-xs text-ink2">
      <summary className="cursor-pointer select-none inline-flex min-h-11 items-center gap-2 font-medium text-ink2">
        About this question <Pill tone={trust.tone}>{trust.tier === "trusted" ? "Checked" : trust.tier === "reference" ? "Reference" : "Not yet checked"}</Pill>
      </summary>
      <dl className="mt-1 grid gap-x-4 gap-y-1.5 sm:grid-cols-[auto_minmax(0,1fr)]">
        {trust.specification ? (
          <>
            <dt className="font-semibold text-ink">{trust.specification.matched ? "Specification match" : "Course"}</dt>
            <dd>
              {trust.specification.title}
              {trust.specification.code ? ` (${trust.specification.code})` : ""}
              {trust.specification.matched && trust.specification.refs.length ? ` · ${trust.specification.refs.join(", ")}` : ""}
            </dd>
          </>
        ) : null}
        <dt className="font-semibold text-ink">Content status</dt>
        <dd>{trust.status}{trust.lastReviewed ? ` · last reviewed ${trust.lastReviewed}` : ""}</dd>
        <dt className="font-semibold text-ink">Source</dt>
        <dd>{trust.origin}</dd>
      </dl>
      {trust.note ? <p className="mt-2 text-ink3">{trust.note}</p> : null}
    </details>
  );
}
