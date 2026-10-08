"use client";

// Proof is visually and conceptually distinct from ordinary practice.
// A proof check is always: a new question, no hints, counted as evidence.

import { ButtonLink } from "./ui";

export function ProofCheckBanner({
  topicTitle,
  href,
  state = "due",
}: {
  topicTitle?: string;
  href: string;
  state?: "due" | "passed" | "failed";
}) {
  if (state === "passed") {
    return (
      <section
        aria-label="Proof result"
        className="rounded-xl border border-success/40 bg-successsoft px-4 py-3"
      >
        <p className="text-[11px] uppercase tracking-wide font-semibold text-success">
          Proof check · passed
        </p>
        <p className="mt-1 text-sm text-ink">
          {topicTitle ? `${topicTitle} is now proven` : "Proven"} on a new
          question, answered unaided. Revise will schedule the next check to
          keep it fresh.
        </p>
      </section>
    );
  }
  if (state === "failed") {
    return (
      <section
        aria-label="Proof result"
        className="rounded-xl border border-line bg-surface2 px-4 py-3"
      >
        <p className="text-[11px] uppercase tracking-wide font-semibold text-ink2">
          Proof check · not yet
        </p>
        <p className="mt-1 text-sm text-ink">
          The earlier improvement did not transfer yet. That is information, not
          punishment — a shorter repair comes before the next check.
        </p>
        <ButtonLink href={href} variant="secondary" size="sm" className="mt-2">
          Repair before the next check
        </ButtonLink>
      </section>
    );
  }
  return (
    <section
      aria-label="Proof check"
      className="rounded-xl border border-review/40 bg-reviewsoft px-4 py-3"
    >
      <p className="text-[11px] uppercase tracking-wide font-semibold text-review">
        Proof check
      </p>
      <p className="mt-1 text-sm font-medium text-ink">
        This question is new and you have no hints. Your answer will count as
        evidence{topicTitle ? ` for ${topicTitle}` : ""}.
      </p>
      <p className="mt-1 text-xs text-ink2">
        Help never counts as proof. If this fails, Revise sends you back to a
        short repair — not back to the start.
      </p>
    </section>
  );
}
