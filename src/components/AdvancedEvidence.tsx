"use client";

// Progressive disclosure for specialist detail. Closed by default so the
// decision-first view leads, but it opens itself when the URL points at
// something inside it (e.g. Today's "See the proof" link to /readiness#proof),
// so existing deep links keep landing on what they name.

import { useEffect, useRef, type ReactNode } from "react";

export function AdvancedEvidence({ summary, children }: { summary: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const openForHash = () => {
      const id = window.location.hash.slice(1);
      if (!id || !ref.current) return;
      const target = document.getElementById(id);
      if (target && ref.current.contains(target)) {
        ref.current.open = true;
        target.scrollIntoView({ block: "start" });
      }
    };
    openForHash();
    // Panels that wait for the store to hydrate mount a moment later; check once more.
    const timer = window.setTimeout(openForHash, 500);
    window.addEventListener("hashchange", openForHash);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", openForHash);
    };
  }, []);
  return (
    <details ref={ref} className="card p-4 sm:p-5">
      <summary className="cursor-pointer select-none text-sm font-semibold text-ink min-h-11 inline-flex items-center">{summary}</summary>
      <div className="mt-4 space-y-6">{children}</div>
    </details>
  );
}
