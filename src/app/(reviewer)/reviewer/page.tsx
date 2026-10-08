import Link from "next/link";
import { ReviewerGate } from "@/components/reviewer/ReviewerGate";
import { buildReviewQueue, REQUIRED_INDEPENDENT_APPROVALS, type ReviewQueueItem } from "@/lib/reviewer/runtime-ledger";
import { getReviewerContext, loadCombinedLog, reviewBank } from "@/lib/reviewer/server";
import { REVIEW_SUBJECTS, shortId, subjectFromSlug, topicTitles } from "@/lib/reviewer/view";

// Review queue. A Server Component: the queue is computed on the server from
// the bundled bank and the verified audit chain (domain reviewStateOf), so the
// browser receives HTML only and none of the bank or the domain code.

export const dynamic = "force-dynamic";

const reviewHref = (item: ReviewQueueItem, slug: string) => `/reviewer/review/${encodeURIComponent(item.questionId)}?subject=${slug}`;

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
  const queue = buildReviewQueue(reviewBank, combined.log, context.grant.reviewerLabel, subject.subjectId);
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

      <QueueTable items={queue.ready} slug={subject.slug} caption="Ready for you" empty="Nothing waiting in this subject." />
      <QueueTable items={queue.changesRequested} slug={subject.slug} caption="Changes requested (waiting for an author edit)" empty="No open change requests." />
      <QueueTable items={queue.awaitingOtherReviewer} slug={subject.slug} caption="You approved — waiting on a second reviewer" empty="None." />
    </main>
  );
}
