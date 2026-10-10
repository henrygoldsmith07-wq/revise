import Link from "next/link";
import { notFound } from "next/navigation";
import { RichText } from "@/components/RichText";
import { ReviewDecisionForm } from "@/components/reviewer/ReviewDecisionForm";
import { ReviewerGate } from "@/components/reviewer/ReviewerGate";
import { buildReviewQueue } from "@/lib/reviewer/runtime-ledger";
import { unlockLabel } from "@/lib/reviewer/priority";
import { getReviewerContext, getReviewPriority, loadCombinedLog, reviewBank } from "@/lib/reviewer/server";
import { buildReviewScreen, shortId, subjectFromSlug } from "@/lib/reviewer/view";

// One question, laid out for a < 15 second decision: stem and parts on the
// left with each part's mark scheme beside it, spec points / provenance /
// warnings / history in a narrow right column, decision bar at the bottom.

export const dynamic = "force-dynamic";

function decodeId(raw: string): string {
  try {
    return raw.includes("%") ? decodeURIComponent(raw) : raw;
  } catch {
    return raw;
  }
}

export default async function ReviewQuestionPage({ params, searchParams }: { params: Promise<{ questionId: string }>; searchParams: Promise<{ subject?: string }> }) {
  const context = await getReviewerContext();
  if (context.status !== "ok") return <ReviewerGate status={context.status} email={"email" in context ? context.email : null} />;
  const questionId = decodeId((await params).questionId);
  const subject = subjectFromSlug((await searchParams).subject);
  const question = reviewBank.find((entry) => entry.id === questionId);
  if (!question) notFound();
  const combined = await loadCombinedLog(context.supabase);
  if (combined.issues.length) {
    return <main className="card p-5" role="alert"><h1 className="text-lg font-semibold text-ink">Review log needs attention</h1><p className="text-sm text-ink2">The audit chain failed verification; no decision can be recorded until it is repaired.</p></main>;
  }
  const screen = buildReviewScreen(question, reviewBank, combined.log);
  // Next/Skip follow the same capability-first order as the queue page.
  const priority = getReviewPriority(combined, subject.subjectId);
  const queue = buildReviewQueue(reviewBank, combined.log, context.grant.reviewerLabel, subject.subjectId, priority);
  const impact = (question.subjectId === subject.subjectId ? priority : getReviewPriority(combined, question.subjectId)).byQuestion.get(question.id);
  const next = queue.ready.find((item) => item.questionId !== question.id);
  const queueHref = `/reviewer?subject=${subject.slug}`;
  const nextHref = next ? `/reviewer/review/${encodeURIComponent(next.questionId)}?subject=${subject.slug}` : queueHref;
  const alreadyApproved = screen.state.approvers.includes(context.grant.reviewerLabel);
  const blocking = screen.gateWarnings.filter((warning) => warning.severity === "block");

  return (
    <main aria-labelledby="review-title" className="space-y-3 pb-28">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-ink3"><Link href={queueHref} className="underline-offset-2 hover:underline">Queue</Link> · {subject.label} · {queue.ready.length} ready</p>
          <h1 id="review-title" tabIndex={-1} className="text-base font-semibold tracking-tight text-ink outline-none">
            {shortId(question.id)} <span className="font-normal text-ink3">· {screen.topicLabel} · {question.totalMarks} marks · difficulty {question.difficulty}</span>
          </h1>
        </div>
        <p className="text-[11px] text-ink3">
          Status: <span className="text-ink2">{screen.state.stage}</span>
          {screen.state.approvers.length ? <> · approved by {screen.state.approvers.join(", ")}</> : null}
        </p>
      </header>

      {blocking.length ? (
        <div role="note" className="card p-3 border-l-4 border-l-[var(--review)] text-xs text-ink2">
          <p className="font-semibold text-ink">Content gate warnings — consider requesting changes</p>
          <ul className="list-disc pl-4 mt-1">{blocking.map((warning) => <li key={warning.detail}>{warning.detail}</li>)}</ul>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-label="Question and mark scheme" className="space-y-2">
          <article className="card p-3 text-sm text-ink">
            <h2 className="sr-only">Question stem</h2>
            <RichText>{question.stem}</RichText>
            {question.options?.length ? (
              <ol className="mt-2 list-[upper-alpha] pl-5 text-sm">
                {question.options.map((option, index) => (
                  <li key={index} className={index === question.correctIndex ? "font-semibold" : undefined}>
                    <RichText>{option}</RichText>{index === question.correctIndex ? <span className="text-xs text-ink3"> (key)</span> : null}
                  </li>
                ))}
              </ol>
            ) : null}
          </article>
          {screen.parts.map((part) => (
            <article key={part.id} className="card p-0 grid md:grid-cols-2 text-sm" aria-label={`Part ${part.label}`}>
              <div className="p-3 border-b md:border-b-0 md:border-r border-line">
                <h3 className="text-xs font-semibold text-ink3 mb-1">({part.label}) · {part.marks} mark{part.marks === 1 ? "" : "s"}</h3>
                <RichText>{part.prompt}</RichText>
                {part.specRefs.length ? <p className="mt-2 text-[11px] text-ink3">{part.specRefs.join(" · ")}</p> : null}
              </div>
              <div className="p-3 bg-surface2/40">
                <h3 className="text-xs font-semibold text-ink3 mb-1">Mark scheme</h3>
                <ol className="list-decimal pl-4 space-y-0.5">{part.markScheme.map((point, index) => <li key={index}><RichText>{point}</RichText></li>)}</ol>
                {/* Evidence for the "Skills mapped right" check: what the marks
                    actually test, which assessment objectives they carry, and the
                    explicit capability mapping. Without this the reviewer ticks a
                    check they cannot see. */}
                {part.learningClaims.length || part.aoCodes.length || part.capabilityIds.length ? (
                  <div className="mt-2 rounded-md border border-line bg-surface px-2 py-1.5 space-y-1">
                    <p className="text-[11px] font-semibold text-ink3">Skills &amp; capability mapping (check 4)</p>
                    {part.learningClaims.length ? <p className="text-[11px] text-ink2">Assesses: {part.learningClaims.join("; ")}</p> : null}
                    {part.aoCodes.length ? <p className="text-[11px] text-ink2">Objectives: {part.aoCodes.join(", ")}</p> : null}
                    {part.capabilityIds.length ? <p className="text-[11px] text-ink3 break-words">Capabilities: {part.capabilityIds.join(", ")}</p> : null}
                  </div>
                ) : null}
                {/* The worked answer is required to attest "Worked answer right",
                    so it is open by default rather than hidden behind a toggle. */}
                {part.modelAnswer ? (
                  <details className="mt-2" open>
                    <summary className="text-xs font-semibold text-ink3 cursor-pointer">Worked answer</summary>
                    <div className="mt-1"><RichText>{part.modelAnswer}</RichText></div>
                  </details>
                ) : null}
              </div>
            </article>
          ))}
        </section>

        <aside aria-label="Specification, provenance and history" className="space-y-2 text-xs">
          <section className="card p-3" aria-label="Why this question">
            <h2 className="font-semibold text-ink mb-1">Why this question</h2>
            {impact ? (
              <>
                <p className="text-ink2">Priority #{impact.rank} in {subject.label.replace(/^WJEC A-level /, "")}. Approving it {impact.unlocks.map(unlockLabel).join("; ")}.</p>
                <p className="mt-1 text-ink3">Ordering only: every check below still applies in full.</p>
              </>
            ) : (
              <p className="text-ink2">Approving it unlocks nothing new for students yet: a sibling question covers the same reasoning, the topic already has what the next unlock needs, or a content gate needs an author fix first.</p>
            )}
          </section>
          <section className="card p-3">
            <h2 className="font-semibold text-ink mb-1">Specification points</h2>
            {screen.specPoints.length ? (
              <ul className="space-y-1">{screen.specPoints.map((spec) => <li key={spec.id}><span className="font-medium text-ink">{spec.ref}</span> <span className="text-ink2">{spec.text}</span></li>)}</ul>
            ) : <p className="text-ink3">No specification point mapped.</p>}
          </section>
          <section className="card p-3">
            <h2 className="font-semibold text-ink mb-1">Provenance</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
              {screen.provenance.map((row) => (
                <div key={row.label} className="contents"><dt className="text-ink3">{row.label}</dt><dd className="text-ink2 break-words">{row.value}</dd></div>
              ))}
            </dl>
          </section>
          {screen.gateWarnings.length || screen.reskinSiblings.length ? (
            <section className="card p-3">
              <h2 className="font-semibold text-ink mb-1">Warnings</h2>
              <ul className="list-disc pl-4 space-y-0.5 text-ink2">
                {screen.gateWarnings.map((warning) => <li key={warning.detail}>{warning.severity === "block" ? "Blocking: " : ""}{warning.detail}</li>)}
                {screen.reskinSiblings.length ? <li>{screen.reskinSiblings.length} near-identical sibling(s): {screen.reskinSiblings.join(", ")}. Approval never extends to them.</li> : null}
              </ul>
            </section>
          ) : null}
          <section className="card p-3">
            <h2 className="font-semibold text-ink mb-1">History on this content</h2>
            {screen.history.length ? (
              <ol className="space-y-1">{screen.history.map((event) => (
                <li key={event.seq} className="text-ink2"><span className="font-medium text-ink">{event.decision === "approve" ? "Approved" : "Changes requested"}</span> by {event.reviewerId} · {event.reviewedAt.slice(0, 10)}{event.comments ? <> — {event.comments}</> : null}</li>
              ))}</ol>
            ) : <p className="text-ink3">No decisions yet.</p>}
            <p className="mt-2 text-[10px] text-ink3 break-all">Fingerprint {screen.fingerprint}</p>
          </section>
        </aside>
      </div>

      <ReviewDecisionForm
        questionId={question.id}
        contentFingerprint={screen.fingerprint}
        nextHref={nextHref}
        queueHref={queueHref}
        alreadyApproved={alreadyApproved}
        transferClaimed={screen.transferClaimed}
        dataClaimed={screen.dataClaimed}
      />
    </main>
  );
}
