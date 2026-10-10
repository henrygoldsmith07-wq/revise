import Link from "next/link";
import { ReviewerGate } from "@/components/reviewer/ReviewerGate";
import { buildReviewQueue, REQUIRED_INDEPENDENT_APPROVALS, type ReviewQueueItem } from "@/lib/reviewer/runtime-ledger";
import { REQUIRED_TRUSTED_DISTINCT } from "@/domain/review-priority";
import { unlockLabel, type ReviewPriorityIndex } from "@/lib/reviewer/priority";
import { getReviewerContext, getReviewPriority, loadCombinedLog, reviewBank } from "@/lib/reviewer/server";
import { REVIEW_SUBJECTS, shortId, subjectFromSlug, topicTitles } from "@/lib/reviewer/view";

// Review queue. A Server Component: the queue is computed on the server from
// the bundled bank and the verified audit chain (domain reviewStateOf), so the
// browser receives HTML only and none of the bank or the domain code.
// "Ready for you" is ordered capability-first (src/lib/reviewer/priority.ts):
// the review that unlocks most for students leads, reskins and no-gain reviews
// follow, and questions failing a blocking authoring gate sit last.

export const dynamic = "force-dynamic";

const reviewHref = (item: ReviewQueueItem, slug: string) => `/reviewer/review/${encodeURIComponent(item.questionId)}?subject=${slug}`;

/** Why this review matters, in the domain's own words. Never a promise beyond what the plan computes. */
function whyText(item: ReviewQueueItem): string {
  if (item.blocked) return "Needs an author fix first (fails a content gate)";
  if (item.unlocks.length) return item.unlocks.map(unlockLabel).join("; ");
  return "Nothing new yet (a sibling or reskin covers it)";
}

/** Where review effort stands for students in this subject, from the same plan the CLI campaign uses. */
function SubjectProgress({ priority, slug }: { priority: ReviewPriorityIndex; slug: string }) {
  const summary = priority.summary;
  if (!summary) return null;
  const path = priority.fastestProof;
  return (
    <section aria-labelledby="impact-title" className="card p-3 text-xs text-ink2 space-y-1">
      <h2 id="impact-title" className="text-sm font-semibold text-ink">What your reviews unlock for students</h2>
      <p>
        Topics with enough verified questions for proof to begin: <span className="font-semibold text-ink tabular-nums">{summary.topicsWithProof} of {summary.topics}</span>
        {" "}(with a third for the delayed check: <span className="tabular-nums">{summary.delayedProofTopics}</span>).
        {" "}Until a topic has {REQUIRED_TRUSTED_DISTINCT} distinct questions each approved by {REQUIRED_INDEPENDENT_APPROVALS} different reviewers, nothing a student does there can count as proof.
      </p>
      <p>
        Topics ready for the quick check: <span className="font-semibold text-ink tabular-nums">{summary.coldStartTopics} of {summary.coldStartTarget}</span> needed.
      </p>
      {path ? (
        <p>
          Fastest route to the next topic where proof can begin: <span className="text-ink">{topicTitles([path.topicId])}</span> needs{" "}
          <span className="font-semibold text-ink tabular-nums">{path.approvals}</span> more approval{path.approvals === 1 ? "" : "s"} across {path.questionIds.length} question{path.questionIds.length === 1 ? "" : "s"}
          {" "}(about {path.minutes} reviewer minutes, a planning estimate).{" "}
          <Link href={`/reviewer/review/${encodeURIComponent(path.questionIds[0]!)}?subject=${slug}`} className="underline underline-offset-2 text-ink">Review {shortId(path.questionIds[0]!)}</Link>
        </p>
      ) : summary.topicsNeedingNewAuthoring ? (
        <p>Every remaining topic needs newly authored questions before review alone can make it provable.</p>
      ) : null}
    </section>
  );
}

function QueueTable({ items, slug, caption, empty }: { items: ReviewQueueItem[]; slug: string; caption: string; empty: string }) {
  return (
    <section aria-label={caption} className="card p-0 overflow-hidden">
      <h2 className="px-3 pt-3 pb-2 text-sm font-semibold text-ink">{caption} <span className="text-ink3 font-normal">({items.length})</span></h2>
      {items.length === 0 ? (
        <p className="px-3 pb-3 text-xs text-ink3">{empty}</p>
      ) : (
        <table className="w-full text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead className="text-left text-ink3">
            <tr className="border-t border-line">
              <th scope="col" className="px-3 py-1.5 font-medium">Question</th>
              <th scope="col" className="px-3 py-1.5 font-medium">Topic</th>
              <th scope="col" className="px-3 py-1.5 font-medium">Marks</th>
              <th scope="col" className="px-3 py-1.5 font-medium">Status</th>
              <th scope="col" className="px-3 py-1.5 font-medium">Why review it</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 200).map((item) => (
              <tr key={item.questionId} className="border-t border-line align-top">
                <td className="px-3 py-1.5">
                  <Link href={reviewHref(item, slug)} className="font-medium text-ink underline-offset-2 hover:underline focus-visible:underline">{shortId(item.questionId)}</Link>
                  <p className="text-ink3 mt-0.5 line-clamp-1">{item.stemPreview}</p>
                </td>
                <td className="px-3 py-1.5 text-ink2">{topicTitles(item.topicIds)}</td>
                <td className="px-3 py-1.5 text-ink2 tabular-nums">{item.totalMarks}</td>
                <td className="px-3 py-1.5 text-ink2">
                  {item.openComment ? <span title={item.openComment}>Changes requested</span>
                    : item.stage === "checked" ? `Checked · ${item.approvalsNeeded} more approval`
                    : item.needsReReview ? "Edited · needs re-review" : "Unverified"}
                </td>
                <td className="px-3 py-1.5 text-ink2">
                  {item.priorityRank !== null ? <span className="tabular-nums text-ink3">#{item.priorityRank} · </span> : null}
                  {whyText(item)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default async function ReviewerQueuePage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const context = await getReviewerContext();
  if (context.status !== "ok") return <ReviewerGate status={context.status} email={"email" in context ? context.email : null} />;
  const subject = subjectFromSlug((await searchParams).subject);
  const combined = await loadCombinedLog(context.supabase);
  if (combined.issues.length) {
    return (
      <main className="card p-5" role="alert">
        <h1 className="text-lg font-semibold text-ink">Review log needs attention</h1>
        <p className="text-sm text-ink2 mt-1">The review audit chain failed verification, so no decisions can be recorded until the maintainer repairs it. Nothing you approved has been lost.</p>
      </main>
    );
  }
  const priority = getReviewPriority(combined, subject.subjectId);
  const queue = buildReviewQueue(reviewBank, combined.log, context.grant.reviewerLabel, subject.subjectId, priority);
  const first = queue.ready[0];

  return (
    <main aria-labelledby="queue-title" className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="queue-title" className="text-lg font-semibold tracking-tight text-ink">Review queue</h1>
          <p className="text-xs text-ink3">
            Signed in as <span className="text-ink2">{context.grant.reviewerLabel}</span> ({context.grant.role}). A question is trusted once {REQUIRED_INDEPENDENT_APPROVALS} different reviewers approve the same content.
          </p>
        </div>
        {first ? (
          <Link href={reviewHref(first, subject.slug)} className="btn btn-primary text-sm">Start reviewing</Link>
        ) : null}
      </header>

      <nav aria-label="Subject" className="flex flex-wrap gap-1.5">
        {REVIEW_SUBJECTS.map((entry) => (
          <Link
            key={entry.subjectId}
            href={`/reviewer?subject=${entry.slug}`}
            aria-current={entry.subjectId === subject.subjectId ? "page" : undefined}
            className={entry.subjectId === subject.subjectId ? "btn btn-primary text-xs px-2.5 py-1.5" : "btn btn-secondary text-xs px-2.5 py-1.5"}
          >
            {entry.label.replace(/^WJEC A-level /, "")}
          </Link>
        ))}
      </nav>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        {[
          ["Ready for you", queue.ready.length],
          ["Changes requested", queue.changesRequested.length],
          ["Waiting on a 2nd reviewer", queue.awaitingOtherReviewer.length],
          ["Verified", queue.verified],
        ].map(([label, value]) => (
          <div key={String(label)} className="card p-2">
            <dt className="text-[11px] text-ink3">{label}</dt>
            <dd className="text-base font-semibold text-ink tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <SubjectProgress priority={priority} slug={subject.slug} />

      <QueueTable items={queue.ready} slug={subject.slug} caption="Ready for you (highest student impact first)" empty="Nothing waiting in this subject." />
      <QueueTable items={queue.changesRequested} slug={subject.slug} caption="Changes requested (waiting for an author edit)" empty="No open change requests." />
      <QueueTable items={queue.awaitingOtherReviewer} slug={subject.slug} caption="You approved — waiting on a second reviewer" empty="None." />
    </main>
  );
}
