"use client";

export function EmptyHint({ children }: { children: string }) {
  return <p className="text-xs text-ink3">{children}</p>;
}

/** Uncertainty level as a *shape*, so it is never conveyed by colour alone. */
export function UncertaintyGlyph({ level }: { level: "high" | "medium" | "low" }) {
  const cls = "inline-block w-3 h-3 mr-1 align-[-1px] shrink-0";
  if (level === "high") {
    return (
      <svg viewBox="0 0 12 12" aria-hidden="true" className={cls} fill="currentColor">
        <path d="M6 1l5.2 9H0.8L6 1zM5.4 4.1v2.7h1.2V4.1h-1.2zM5.4 7.7v1.3h1.2V7.7h-1.2z" />
      </svg>
    );
  }
  if (level === "medium") {
    return (
      <svg viewBox="0 0 12 12" aria-hidden="true" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M1.5 7.5c1.5-2.2 3-2.2 4.5 0s3 2.2 4.5 0" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className={cls} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="4.8" />
      <path d="M3.9 6.1l1.5 1.5 2.9-3.1" />
    </svg>
  );
}
