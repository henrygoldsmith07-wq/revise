import Link from "next/link";
import { DecisionNotice } from "@/components/reviewer/DecisionNotice";
import { ReviewerGate } from "@/components/reviewer/ReviewerGate";
import { buildTransferBatch, needsLabel, nextInBatch, type BatchMember, type BatchPairView } from "@/lib/reviewer/batches";
import { REQUIRED_INDEPENDENT_APPROVALS } from "@/lib/reviewer/runtime-ledger";
import { getReviewerContext, loadCombinedLog, reviewBank } from "@/lib/reviewer/server";
import { REVIEW_SUBJECTS, shortId, subjectFromSlug, topicTitles } from "@/lib/reviewer/view";

// Transfer-pair batch: every (baseline, transfer) pair in one subject, the
// baseline first. A transfer question can only help prove improvement once it
// AND its baseline are each approved by two different reviewers, but in the
// capability-first queue these questions are scattered over hundreds of rows.
// This page is the shareable worklist a maintainer sends a teacher
// (/reviewer/pairs?subject=physics). Ordering and context only: every
// decision still goes through the same review screen and domain rules.

export const dynamic = "force-dynamic";

const reviewHref = (id: string, slug: string) => `/reviewer/review/${encodeURIComponent(id)}?subject=${slug}&batch=pairs`;

const ACTION_TEXT: Record<BatchMember["action"], string> = {
  review: "Ready for you",
  "awaiting-other": "You approved",
  "changes-requested": "Changes requested",
  verified: "Verified",
};

function MemberCell({ member, slug, label }: { member: BatchMember; slug: string; label: string }) {
  return (
    <td className="px-3 py-1.5 align-top">
      <p className="text-[11px] text-ink3">{label}</p>
      {member.action === "review" ? (
        <Link href={reviewHref(member.questionId, slug)} className="font-medium text-ink underline-offset-2 hover:underline focus-visible:underline">{shortId(member.questionId)}</Link>
      ) : (
        <Link href={reviewHref(member.questionId, slug)} className="text-ink2 underline-offset-2 hover:underline focus-visible:underline">{shortId(member.questionId)}</Link>
      )}
      <p className="text-ink2 mt-0.5"><span className="font-medium text-ink">{ACTION_TEXT[member.action]}</span> · {needsLabel(member)}</p>
      {member.openComment && member.action === "changes-requested" ? <p className="text-ink3 mt-0.5 line-clamp-2" title={member.openComment}>“{member.openComment}”</p> : null}
    </td>
  );
}

function PairRow({ pair, slug }: { pair: BatchPairView; slug: string }) {
  return (
    <tr className="border-t border-line">
      <th scope="row" className="px-3 py-1.5 text-left font-normal text-ink2 align-top">
        {topicTitles([pair.topicId])}
        <p className="text-[11px] text-ink3 mt-0.5">{pair.ready ? "Both verified: usable for transfer proof" : "Not yet usable for proof"}</p>
      </th>
      <MemberCell member={pair.baseline} slug={slug} label="Baseline" />
      <MemberCell member={pair.transfer} slug={slug} label="Transfer" />
    </tr>
  );
}

export default async function TransferPairsPage({ searchParams }: { searchParams: Promise<{ subject?: string; recorded?: string }> }) {
  const context = await getReviewerContext();
  if (context.status !== "ok") return <ReviewerGate status={context.status} email={"email" in context ? context.email : null} />;
  const search = await searchParams;
  const subject = subjectFromSlug(search.subject);
  const combined = await loadCombinedLog(context.supabase);
  if (combined.issues.length) {
    return (
      <main className="card p-5" role="alert">
        <h1 className="text-lg font-semibold text-ink">Review log needs attention</h1>
        <p className="text-sm text-ink2 mt-1">The review audit chain failed verification, so no decisions can be recorded until the maintainer repairs it. Nothing you approved has been lost.</p>
      </main>
    );
  }
  const batch = buildTransferBatch(reviewBank, combined.log.events, subject.subjectId, context.grant.reviewerLabel);
  const first = nextInBatch(batch, null);

  return (
    <main aria-labelledby="pairs-title" className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] text-ink3"><Link href={`/reviewer?subject=${subject.slug}`} className="underline-offset-2 hover:underline">Queue</Link> · {subject.label}</p>
          <h1 id="pairs-title" className="text-lg font-semibold tracking-tight text-ink">Transfer pairs to review</h1>
          <p className="text-xs text-ink3 max-w-2xl">
            Each pair is a baseline question and a transfer question that asks for the same skill in an unfamiliar setting.
            Students can only show they transfer a skill once <span className="text-ink2">both</span> halves are approved by {REQUIRED_INDEPENDENT_APPROVALS} different reviewers.
            Review the baseline first: the transfer screen shows it alongside so you can judge whether the step is genuine.
          </p>
        </div>
        {first ? <Link href={reviewHref(first, subject.slug)} className="btn btn-primary text-sm">{batch.approvalsRecorded ? "Continue this batch" : "Start this batch"}</Link> : null}
      </header>

      <DecisionNotice recorded={search.recorded} />

      <nav aria-label="Subject" className="flex flex-wrap gap-1.5">
        {REVIEW_SUBJECTS.map((entry) => (
          <Link
            key={entry.subjectId}
            href={`/reviewer/pairs?subject=${entry.slug}`}
            aria-current={entry.subjectId === subject.subjectId ? "page" : undefined}
            className={entry.subjectId === subject.subjectId ? "btn btn-primary text-xs px-2.5 py-1.5" : "btn btn-secondary text-xs px-2.5 py-1.5"}
          >
            {entry.label.replace(/^WJEC A-level /, "")}
          </Link>
        ))}
      </nav>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        {[
          ["Pairs usable for proof", `${batch.readyPairs} of ${batch.pairs.length}`],
          ["Questions verified", `${batch.verifiedQuestions} of ${batch.members.length}`],
          ["Approvals recorded", `${batch.approvalsRecorded} of ${batch.approvalsNeeded}`],
          ["Ready for you", String(batch.actionable)],
        ].map(([label, value]) => (
          <div key={label} className="card p-2">
            <dt className="text-[11px] text-ink3">{label}</dt>
            <dd className="text-base font-semibold text-ink tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {batch.pairs.length === 0 ? (
        <p className="card p-3 text-xs text-ink3">No linked transfer pairs in this subject yet.</p>
      ) : (
        <section aria-label="Transfer pairs" className="card p-0 overflow-hidden">
          <table className="w-full text-xs">
            <caption className="sr-only">Transfer pairs, baseline first</caption>
            <thead className="text-left text-ink3">
              <tr>
                <th scope="col" className="px-3 py-1.5 font-medium">Topic</th>
                <th scope="col" className="px-3 py-1.5 font-medium">Baseline</th>
                <th scope="col" className="px-3 py-1.5 font-medium">Transfer</th>
              </tr>
            </thead>
            <tbody>
              {batch.pairs.map((pair) => <PairRow key={`${pair.baselinePartId}>${pair.transferPartId}`} pair={pair} slug={subject.slug} />)}
            </tbody>
          </table>
        </section>
      )}
      {!first && batch.pairs.length ? (
        <p role="status" className="text-xs text-ink2">Nothing in this batch is waiting for you. Questions you approved need a different reviewer; changes requested wait for an author edit.</p>
      ) : null}
    </main>
  );
}
